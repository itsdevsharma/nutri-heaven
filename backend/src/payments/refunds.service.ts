import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { randomUUID } from 'crypto';
import type Razorpay from 'razorpay';
import { OrderOutbox, OrderOutboxDocument, enqueueOrderNotification } from '../orders/order-outbox.schema';
import { Order, OrderDocument } from '../orders/order.schema';
import { OrderRefund, OrderRefundDocument } from './refund.schema';

type ProviderRefund = { id: string; payment_id: string; amount?: number; currency: string; status: string; notes?: Record<string, unknown> | unknown[]; receipt?: string | null };
@Injectable()
export class RefundsService {
  constructor(@InjectConnection() private readonly connection: Connection,
    @InjectModel(OrderRefund.name) private readonly refunds: Model<OrderRefundDocument>,
    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
    @InjectModel(OrderOutbox.name) private readonly outbox: Model<OrderOutboxDocument>) {}

  list(orderId?: string) { return this.refunds.find(orderId ? { orderId } : {}).sort({ createdAt: -1 }).limit(200).lean().exec(); }

  async request(orderId: string, actor: string, reason: string, client: Razorpay, retry = false) {
    if (!reason.trim()) throw new BadRequestException('A refund reason is required');
    const existing = await this.refunds.findOne({ orderId }).lean().exec();
    if (existing && !retry) return existing; // Reconcile before resubmission.
    if (retry) {
      if (!existing || existing.status !== 'failed' || !existing.providerRefundId) throw new BadRequestException('Only a provider-confirmed failed refund can be retried');
      const previous = await client.payments.fetchRefund(existing.paymentId, existing.providerRefundId);
      if (previous.status !== 'failed') {
        await this.apply(previous, actor, existing.requestId);
        throw new BadRequestException('Provider no longer reports this refund as failed; reconcile it instead');
      }
    }
    const session = await this.connection.startSession();
    let refund: OrderRefund | undefined;
    try { await session.withTransaction(async () => {
      const order = await this.orders.findOne({ id: orderId }).session(session).exec();
      if (!order) throw new NotFoundException('Order not found');
      if (order.paymentMethod !== 'razorpay' || order.paymentStatus !== 'paid' || !['returned', 'cancelled'].includes(order.status) || !order.razorpayPaymentId) throw new BadRequestException('Only cancelled or inspected returned, captured Razorpay orders can be refunded');
      if (order.status === 'returned' && order.operations?.returnStatus !== 'inspected') throw new BadRequestException('Inspect the return before authorizing a refund');
      if (order.paymentReconciliationRequired && !(retry && existing?.status === 'failed') && !/Paid order cancelled|reservation was released/.test(order.paymentReconciliationNote || '')) throw new BadRequestException('Investigate the payment exception before refunding');
      const available = order.totalPaise - (order.refundedPaise || 0) - (order.refundReservedPaise || 0);
      if (available !== order.totalPaise || available < 1) throw new BadRequestException('Refund balance is already reserved or refunded');
      const requestId = randomUUID();
      const values = { orderId, requestId, paymentId: order.razorpayPaymentId, amountPaise: available, status: 'processing', actor, reason, attempts: 1, nextCheckAt: new Date(Date.now() + 60000), history: [{ at: new Date(), status: 'submission_started', actor, note: reason }] };
      if (retry && existing) {
        const previous = await this.refunds.findOne({ orderId, requestId: existing.requestId, status: 'failed' }).session(session).exec();
        if (!previous) throw new BadRequestException('Another operation already retried this refund');
        previous.history.push({ at: new Date(), status: 'retry_submission_started', actor, note: `Previous request ${previous.requestId}; ${reason}`, providerRefundId: previous.providerRefundId });
        Object.assign(previous, { requestId, status: 'processing', providerRefundId: undefined, error: '', attempts: previous.attempts + 1, nextCheckAt: new Date(Date.now() + 60000), actor, reason });
        await previous.save({ session }); refund = previous.toObject();
      } else {
        const [created] = await this.refunds.create([values], { session }); refund = created?.toObject();
      }
      order.refundReservedPaise = available;
      order.activity.push({ action: 'refund_requested', actor, at: new Date(), reason, after: { requestId, amountPaise: available } });
      await order.save({ session }); await enqueueOrderNotification(this.outbox, order, session);
    }); } catch (error) {
      // A competing request may win the unique orderId index.
      const raced = await this.refunds.findOne({ orderId }).lean().exec();
      if (raced) return raced;
      throw error;
    } finally { await session.endSession(); }
    if (!refund) throw new Error('Refund transaction produced no record');
    // No retries of this financial call: timeouts may mean the provider accepted it.
    try {
      const payment = await client.payments.fetch(refund.paymentId);
      if (payment.status !== 'captured' || payment.currency !== 'INR' || Number(payment.amount) !== refund.amountPaise) throw new Error('Provider payment requires reconciliation');
      const remote = await client.payments.refund(refund.paymentId, { amount: refund.amountPaise, receipt: refund.requestId, notes: { orderId, refundRequestId: refund.requestId } });
      return await this.apply(remote, actor, refund.requestId);
    } catch {
      await this.refunds.updateOne({ requestId: refund.requestId, status: { $ne: 'completed' } }, { $set: { status: 'reconciliation_required', error: 'Provider outcome is uncertain. Reconcile the existing request before any retry.', nextCheckAt: new Date(Date.now() + 60000) }, $push: { history: { at: new Date(), status: 'reconciliation_required', actor, note: 'Submission or persistence did not complete; no automatic resubmission' } } });
      return this.refunds.findOne({ requestId: refund.requestId }).lean().exec();
    }
  }

  async apply(remote: ProviderRefund, actor: string, requestId?: string) {
    const session = await this.connection.startSession();
    let result: OrderRefund | undefined;
    try { await session.withTransaction(async () => {
      const lookup = requestId ? { requestId } : { $or: [{ providerRefundId: remote.id }, ...(typeof (remote.notes as Record<string, unknown>)?.refundRequestId === 'string' ? [{ requestId: (remote.notes as Record<string, string>).refundRequestId }] : []), ...(remote.receipt ? [{ requestId: remote.receipt }] : [])] };
      const refund = await this.refunds.findOne(lookup).session(session).exec();
      if (!refund) return; // Unknown/external refunds are never used to mark a local request successful.
      if (refund.paymentId !== remote.payment_id || refund.amountPaise !== remote.amount || remote.currency !== 'INR' || (refund.providerRefundId && refund.providerRefundId !== remote.id)) throw new BadRequestException('Provider refund does not match the reserved request');
      if (refund.status === 'completed') { result = refund.toObject(); return; }
      if (refund.providerRefundId === remote.id && refund.status === 'processing' && remote.status === 'pending') {
        refund.nextCheckAt = new Date(Date.now() + 60000);
        await refund.save({ session }); result = refund.toObject(); return;
      }
      // Failed is final for this request; do not let an older pending event regress it.
      if (refund.status === 'failed' && remote.status !== 'processed') { result = refund.toObject(); return; }
      const order = await this.orders.findOne({ id: refund.orderId }).session(session).exec();
      if (!order) throw new NotFoundException('Order not found');
      const status = remote.status === 'processed' ? 'completed' : remote.status === 'failed' ? 'failed' : 'processing';
      refund.providerRefundId = remote.id; refund.status = status; refund.error = '';
      refund.nextCheckAt = new Date(Date.now() + 60000);
      refund.history.push({ at: new Date(), status, actor, note: `Verified provider status: ${remote.status}`, providerRefundId: remote.id });
      if (status === 'completed') {
        order.refundReservedPaise = 0; order.refundedPaise = refund.amountPaise;
        order.status = 'refunded'; order.paymentStatus = 'refunded'; order.refundReference = remote.id;
        order.paymentReconciliationRequired = false; order.paymentReconciliationNote = '';
        order.statusHistory.push({ status: 'refunded', at: new Date(), actor, note: `Refund ${remote.id} processed` });
      } else if (status === 'failed') {
        order.refundReservedPaise = 0;
        order.paymentReconciliationRequired = true; order.paymentReconciliationNote = `Refund ${remote.id} failed; finance review required`;
      }
      order.activity.push({ action: `refund_${status}`, actor, at: new Date(), reason: `Provider refund ${remote.id}`, after: { amountPaise: refund.amountPaise, status } });
      await order.save({ session }); await enqueueOrderNotification(this.outbox, order, session); await refund.save({ session }); result = refund.toObject();
    }); } finally { await session.endSession(); }
    return result;
  }

  async reconcile(orderId: string, client: Razorpay) {
    const refund = await this.refunds.findOne({ orderId }).lean().exec();
    if (!refund) throw new NotFoundException('Refund request not found');
    if (refund.status === 'completed') return refund;
    if (refund.providerRefundId) return this.apply(await client.payments.fetchRefund(refund.paymentId, refund.providerRefundId), 'reconciliation', refund.requestId);
    // Correlate by our persisted receipt, with pagination. No match is ambiguous,
    // not permission to submit another request.
    for (let skip = 0; skip < 1000; skip += 100) {
      const page = await client.payments.fetchMultipleRefund(refund.paymentId, { count: 100, skip });
      const match = page.items.find(item => item.receipt === refund.requestId || (item.notes as Record<string, unknown>)?.refundRequestId === refund.requestId);
      if (match) return this.apply(match, 'reconciliation', refund.requestId);
      if (page.items.length < 100) break;
    }
    await this.refunds.updateOne({ requestId: refund.requestId }, { $set: { status: 'reconciliation_required', nextCheckAt: new Date(Date.now() + 300000), error: 'No matching provider refund found. Investigate; do not resubmit automatically.' } });
    return this.refunds.findOne({ requestId: refund.requestId }).lean().exec();
  }

  async reconcileDue(client: Razorpay) {
    const records = await this.refunds.find({ status: { $in: ['processing', 'reconciliation_required'] }, nextCheckAt: { $lte: new Date() } }).limit(20).lean().exec();
    for (const record of records) {
      // Durable schedule and conditional lease survive restarts and coordinate replicas.
      const leased = await this.refunds.updateOne({ requestId: record.requestId, nextCheckAt: record.nextCheckAt }, { $set: { nextCheckAt: new Date(Date.now() + 300000) }, $inc: { attempts: 1 } });
      if (!leased.modifiedCount) continue;
      try { await this.reconcile(record.orderId, client); }
      catch { await this.refunds.updateOne({ requestId: record.requestId }, { $set: { error: 'Provider reconciliation failed; scheduled for retry' } }); }
    }
  }
}
