// Uses native collections only: no Nest bootstrap, model initialization, seeds,
// automatic indexes, provider calls, or production writes in audit mode.
const { MongoClient, ObjectId } = require('mongoose').mongo;
const specifications = require('../src/orders/provider-indexes.json');
const { appendFile, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const key = line => `${line.productSlug}\0${line.packSize}`;
const referencesFor = order => [...new Set([order.razorpayOrderId, ...(Array.isArray(order.supersededRazorpayOrders) ? order.supersededRazorpayOrders.map(item => item?.id) : [])].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))].sort();
const nonblank = value => typeof value === 'string' && value.trim().length > 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;

async function auditDatabase(db) {
  const findings = {};
  const add = (type, record, severity = 'review') => {
    const finding = findings[type] ??= { severity, count: 0, sampleRecordIds: [] };
    finding.count++;
    if (finding.sampleRecordIds.length < 10 && record?._id) finding.sampleRecordIds.push(String(record._id));
  };
  const orders = new Map(), byReservation = new Map(), providerOrders = new Map(), payments = new Map(), checkoutKeys = new Map();
  const totals = { orders: 0, variants: 0, reservations: 0, refunds: 0, redemptions: 0, shipments: 0 };
  const duplicate = (map, value, order, type) => {
    if (!nonblank(value)) return;
    if (map.has(value) && map.get(value) !== String(order._id)) add(type, order, 'blocking');
    else map.set(value, String(order._id));
  };
  const statuses = new Set(['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'returned', 'refunded']);
  const projection = { id: 1, idempotencyKey: 1, customerId: 1, lines: 1, subtotalPaise: 1, shippingPaise: 1, couponDiscountPaise: 1, totalPaise: 1, amountAdjustmentPaise: 1, status: 1, paymentMethod: 1, paymentStatus: 1, razorpayOrderId: 1, supersededRazorpayOrders: 1, razorpayOrderReferences: 1, razorpayPaymentId: 1, capturedAmountPaise: 1, stockReserved: 1, stockCommitted: 1, refundReservedPaise: 1, refundedPaise: 1, shiprocketBookingStarted: 1, paymentReconciliationRequired: 1, createdAt: 1, paymentWindowStartedAt: 1 };
  for await (const order of db.collection('orders').find({}, { projection, batchSize: 200, maxTimeMS: 30000 })) {
    totals.orders++;
    if (!nonblank(order.id)) add('invalid_order_identifier', order, 'blocking');
    if (orders.has(order.id)) add('duplicate_order_identifier', order, 'blocking');
    orders.set(order.id, order);
    if (nonblank(order.idempotencyKey)) byReservation.set(order.idempotencyKey, order);
    duplicate(checkoutKeys, order.idempotencyKey, order, 'duplicate_checkout_key');
    for (const reference of referencesFor(order)) duplicate(providerOrders, reference, order, 'duplicate_provider_order_reference');
    if (order.supersededRazorpayOrders !== undefined && !Array.isArray(order.supersededRazorpayOrders)) add('invalid_provider_order_history', order, 'blocking');
    if ([order.razorpayOrderId, order.razorpayPaymentId, ...(Array.isArray(order.supersededRazorpayOrders) ? order.supersededRazorpayOrders.map(item => item?.id) : [])].some(value => value != null && (typeof value !== 'string' || value !== value.trim()))) add('invalid_provider_reference', order, 'blocking');
    duplicate(payments, order.razorpayPaymentId, order, 'duplicate_payment_reference');
    const expectedReferences = referencesFor(order);
    if (order.razorpayOrderReferences !== undefined && !Array.isArray(order.razorpayOrderReferences) || !same(expectedReferences, [...(Array.isArray(order.razorpayOrderReferences) ? order.razorpayOrderReferences : [])].sort()) || (Array.isArray(order.razorpayOrderReferences) && !order.razorpayOrderReferences.length)) add('reference_backfill_required', order);
    if (!statuses.has(order.status) || !['cod', 'razorpay'].includes(order.paymentMethod) || !['pending', 'paid', 'failed', 'refunded'].includes(order.paymentStatus)) add('invalid_order_state', order, 'blocking');
    const lines = Array.isArray(order.lines) ? order.lines : [];
    if (!lines.length || lines.some(line => !line || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || !integer(line.unitPricePaise) || !integer(line.lineTotalPaise) || line.unitPricePaise * line.quantity !== line.lineTotalPaise)) add('invalid_order_lines', order, 'blocking');
    if (![order.subtotalPaise, order.shippingPaise, order.totalPaise, order.couponDiscountPaise ?? 0].every(integer) || !Number.isSafeInteger(order.amountAdjustmentPaise ?? 0)
      || lines.reduce((sum, line) => sum + (Number(line?.lineTotalPaise) || 0), 0) !== order.subtotalPaise
      || Math.max(0, order.subtotalPaise - (order.couponDiscountPaise ?? 0)) + order.shippingPaise + (order.amountAdjustmentPaise ?? 0) !== order.totalPaise) add('incorrect_order_totals', order, 'blocking');
    if (order.paymentMethod === 'razorpay' && ['confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'].includes(order.status) && order.paymentStatus !== 'paid') add('unpaid_online_fulfilment', order, 'blocking');
    if (order.paymentStatus === 'paid' && order.paymentMethod === 'razorpay' && !nonblank(order.razorpayPaymentId)) add('paid_order_without_payment_reference', order, 'blocking');
    if (![order.capturedAmountPaise ?? order.totalPaise, order.refundReservedPaise ?? 0, order.refundedPaise ?? 0].every(integer)) add('invalid_capture_or_refund_amount', order, 'blocking');
    if (order.paymentMethod === 'razorpay' && order.paymentStatus === 'paid' && !order.paymentReconciliationRequired && order.capturedAmountPaise !== undefined && order.capturedAmountPaise !== order.totalPaise) add('captured_order_amount_mismatch', order, 'blocking');
    if (order.paymentMethod === 'razorpay' && order.status === 'pending' && ['pending', 'failed'].includes(order.paymentStatus) && order.stockReserved && new Date(order.paymentWindowStartedAt ?? order.createdAt).getTime() < Date.now() - 30 * 60000) add('expired_online_reservation_requires_reconciliation', order);
    if ((order.refundedPaise ?? 0) + (order.refundReservedPaise ?? 0) > (order.capturedAmountPaise ?? order.totalPaise)) add('refund_balance_exceeds_capture', order, 'blocking');
    if (order.paymentReconciliationRequired) add('payment_reconciliation_pending', order);
  }
  const ownerIds = [...new Set([...orders.values()].map(order => order.customerId).filter(Boolean))];
  const existingOwners = new Set();
  for (let index = 0; index < ownerIds.length; index += 200) {
    const batch = ownerIds.slice(index, index + 200).filter(value => ObjectId.isValid(value)).map(value => new ObjectId(value));
    for await (const owner of db.collection('customers').find({ _id: { $in: batch } }, { projection: { _id: 1 }, maxTimeMS: 30000 })) existingOwners.add(String(owner._id));
  }
  for (const order of orders.values()) if (order.customerId && !existingOwners.has(String(order.customerId))) add('orphan_customer_reference', order);
  const variants = new Map();
  for await (const product of db.collection('products').find({}, { projection: { slug: 1, 'variants.size': 1, 'variants.stockQuantity': 1 }, batchSize: 200, maxTimeMS: 30000 })) {
    for (const variant of Array.isArray(product.variants) ? product.variants : []) {
      if (!variant) { add('invalid_inventory_balance', product, 'blocking'); continue; }
      totals.variants++; const pack = `${product.slug}\0${variant.size}`;
      if (variants.has(pack)) add('duplicate_product_pack', product, 'blocking');
      variants.set(pack, variant.stockQuantity);
      if (!integer(variant.stockQuantity)) add('invalid_inventory_balance', product, 'blocking');
    }
  }
  const reservationKeys = new Set();
  for await (const reservation of db.collection('inventory_reservations').find({}, { batchSize: 200, maxTimeMS: 30000 })) {
    totals.reservations++; reservationKeys.add(reservation.referenceId); const order = byReservation.get(reservation.referenceId);
    if (!order) add('orphan_inventory_reservation', reservation);
    else if (order.stockReserved && !['reserved', 'allocated', 'dispatched'].includes(reservation.status) || !order.stockReserved && ['reserved', 'allocated'].includes(reservation.status)) add('reservation_order_state_mismatch', reservation);
    for (const line of Array.isArray(reservation.lines) ? reservation.lines : []) if (!line || !variants.has(key(line))) add('reservation_pack_missing', reservation);
  }
  for (const order of orders.values()) if (order.stockReserved && !reservationKeys.has(order.idempotencyKey)) add('order_reservation_missing', order);
  for await (const movement of db.collection('inventory_movements').aggregate([{ $sort: { createdAt: -1, _id: -1 } }, { $group: { _id: { productSlug: '$productSlug', packSize: '$packSize' }, balance: { $first: '$balance' }, recordId: { $first: '$_id' } } }], { allowDiskUse: true, maxTimeMS: 30000 })) {
    if (variants.has(key(movement._id)) && variants.get(key(movement._id)) !== movement.balance) add('inventory_ledger_balance_mismatch', { _id: movement.recordId }, 'blocking');
  }
  const refundedOrders = new Set();
  for await (const refund of db.collection('order_refunds').find({}, { projection: { orderId: 1, paymentId: 1, amountPaise: 1, status: 1 }, batchSize: 200, maxTimeMS: 30000 })) {
    totals.refunds++; const order = orders.get(refund.orderId);
    if (!order) { add('orphan_refund', refund, 'blocking'); continue; }
    refundedOrders.add(refund.orderId);
    if (refund.paymentId !== order.razorpayPaymentId || !integer(refund.amountPaise) || refund.amountPaise < 1 || refund.amountPaise > (order.capturedAmountPaise ?? order.totalPaise)) add('refund_payment_amount_mismatch', refund, 'blocking');
    if (refund.status === 'completed' && (order.paymentStatus !== 'refunded' || order.refundedPaise !== refund.amountPaise) || ['processing', 'reconciliation_required'].includes(refund.status) && order.refundReservedPaise !== refund.amountPaise) add('refund_order_state_mismatch', refund, 'blocking');
  }
  for (const order of orders.values()) if (order.paymentMethod === 'razorpay' && (order.refundedPaise || order.refundReservedPaise) && !refundedOrders.has(order.id)) add('refund_record_missing', order);
  const couponCounts = new Map();
  for await (const redemption of db.collection('coupon_redemptions').find({}, { projection: { orderId: 1, couponCode: 1 }, batchSize: 200, maxTimeMS: 30000 })) {
    totals.redemptions++; couponCounts.set(redemption.couponCode, (couponCounts.get(redemption.couponCode) ?? 0) + 1);
    const order = orders.get(redemption.orderId);
    if (!order || order.status === 'cancelled') add('orphan_or_cancelled_coupon_redemption', redemption);
  }
  for await (const coupon of db.collection('coupons').find({}, { projection: { code: 1, usageCount: 1 }, maxTimeMS: 30000 })) if (coupon.usageCount !== (couponCounts.get(coupon.code) ?? 0)) add('coupon_usage_count_mismatch', coupon);
  const bookedOrders = new Set();
  for await (const shipment of db.collection('shiprocket_shipments').find({}, { projection: { orderId: 1, originalOrderId: 1, providerCancelled: 1, submissionStartedAt: 1, shipmentId: 1, error: 1, 'tracking.status': 1 }, batchSize: 200, maxTimeMS: 30000 })) {
    totals.shipments++; if (shipment.originalOrderId) continue;
    bookedOrders.add(shipment.orderId); const order = orders.get(shipment.orderId);
    if (!order) add('orphan_shipment', shipment);
    else if (String(shipment.tracking?.status).toUpperCase() === 'DELIVERED' && !['delivered', 'return_requested', 'returned', 'refunded'].includes(order.status)) add('courier_order_delivery_mismatch', shipment);
    if (shipment.submissionStartedAt && !shipment.shipmentId) add('ambiguous_shipment_submission', shipment);
  }
  for (const order of orders.values()) if (order.shiprocketBookingStarted && !bookedOrders.has(order.id)) add('booking_flag_without_intent', order);
  let indexes = [];
  try { indexes = await db.collection('orders').listIndexes().toArray(); } catch (error) { if (error.code !== 26) throw error; }
  const indexStatus = specifications.map(spec => {
    const found = indexes.find(index => index.name === spec.options.name);
    return { name: spec.options.name, ready: Boolean(found && same(found.key, spec.key) && Boolean(found.unique) === Boolean(spec.options.unique) && same(found.partialFilterExpression, spec.options.partialFilterExpression)) };
  });
  return { generatedAt: new Date().toISOString(), mode: 'read_only', crossCollectionSnapshot: false, counts: totals, findings, indexes: indexStatus,
    indexPreflightReady: !findings.duplicate_provider_order_reference && !findings.duplicate_payment_reference && !findings.duplicate_order_identifier && !findings.duplicate_checkout_key && !findings.invalid_provider_order_history && !findings.invalid_provider_reference,
    note: 'Counts and opaque record IDs only. Concurrent writes can cause transient cross-collection findings; verify each record/provider/physical-stock fact before approved corrections. No provider calls or data writes performed.' };
}

async function applyProviderIndexes(db, options = {}) {
  if (!options.allowWrites || options.expectedDatabase !== db.databaseName) throw new Error('Explicit write opt-in and exact database confirmation are required');
  const before = await auditDatabase(db);
  if (!before.indexPreflightReady) throw new Error('Duplicate provider/order/checkout references block index installation; no automatic financial correction is allowed');
  if (options.expectedBackfills !== undefined && options.expectedBackfills !== (before.findings.reference_backfill_required?.count ?? 0)) throw new Error('Reference preflight count changed; review a fresh plan before making any writes');
  let backfilled = 0;
  for await (const order of db.collection('orders').find({}, { projection: { razorpayOrderId: 1, supersededRazorpayOrders: 1, razorpayOrderReferences: 1 }, batchSize: 200 })) {
    const references = referencesFor(order);
    if ((order.razorpayOrderReferences === undefined || Array.isArray(order.razorpayOrderReferences)) && same(references, [...(Array.isArray(order.razorpayOrderReferences) ? order.razorpayOrderReferences : [])].sort()) && !(Array.isArray(order.razorpayOrderReferences) && !references.length)) continue;
    const expected = { _id: order._id };
    for (const field of ['razorpayOrderId', 'supersededRazorpayOrders', 'razorpayOrderReferences']) expected[field] = order[field] === undefined ? { $exists: false } : { $eq: order[field] };
    if (options.beforeBackfill) await options.beforeBackfill({ recordId: String(order._id), hadReferenceCache: order.razorpayOrderReferences !== undefined, oldReferenceCache: order.razorpayOrderReferences ?? null, expectedAppliedReferences: references });
    const result = await db.collection('orders').updateOne(expected, references.length ? { $set: { razorpayOrderReferences: references } } : { $unset: { razorpayOrderReferences: '' } });
    if (!result.matchedCount) throw new Error('An order changed during reference backfill; rerun preflight without overwriting concurrent updates');
    backfilled += result.modifiedCount;
  }
  const checked = await auditDatabase(db);
  if (!checked.indexPreflightReady || checked.findings.reference_backfill_required) throw new Error('Reference preflight changed; stop and investigate before installing indexes');
  for (const spec of specifications) await db.collection('orders').createIndex(spec.key, spec.options);
  return { mode: 'explicit_index_maintenance', backfilled, after: await auditDatabase(db) };
}

module.exports = { auditDatabase, applyProviderIndexes, referencesFor };
if (require.main === module) {
  (async () => {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
    const argumentsList = process.argv.slice(2);
    if (argumentsList.includes('--audit') && argumentsList.includes('--apply-indexes')) throw new Error('Unknown command combination: audit and index application are mutually exclusive');
    const allowed = new Set(['--audit', '--apply-indexes', '--allow-writes', '--database-confirm', '--expected-backfills', '--backup', '--output']);
    for (let index = 0; index < argumentsList.length; index++) {
      if (!allowed.has(argumentsList[index])) throw new Error('Unknown command option');
      if (['--database-confirm', '--expected-backfills', '--backup', '--output'].includes(argumentsList[index])) index++;
    }
    const value = flag => { const index = argumentsList.indexOf(flag); return index < 0 ? undefined : argumentsList[index + 1]; };
    if (value('--backup') && value('--output') && resolve(value('--backup')) === resolve(value('--output'))) throw new Error('Explicit write backup and output paths must be different');
    const client = new MongoClient(process.env.MONGODB_URI, { appName: 'nutri-order-consistency-audit', maxPoolSize: 2, serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000, socketTimeoutMS: 35000, readConcern: { level: 'majority' } });
    try {
      await client.connect(); const db = client.db();
      const expectedBackfills = Number(value('--expected-backfills'));
      if (argumentsList.includes('--apply-indexes') && (!Number.isSafeInteger(expectedBackfills) || expectedBackfills < 0)) throw new Error('Explicit write maintenance requires --expected-backfills from the reviewed read-only report');
      if (argumentsList.includes('--apply-indexes') && !value('--backup')) throw new Error('Explicit write maintenance requires a protected --backup path for previous reference metadata');
      if (argumentsList.includes('--apply-indexes')) await writeFile(value('--backup'), JSON.stringify({ database: db.databaseName, createdAt: new Date().toISOString(), purpose: 'Reference metadata rollback only; no financial fields' }) + '\n', { flag: 'wx', mode: 0o600 });
      const report = argumentsList.includes('--apply-indexes') ? await applyProviderIndexes(db, { allowWrites: argumentsList.includes('--allow-writes'), expectedDatabase: value('--database-confirm'), expectedBackfills, beforeBackfill: entry => appendFile(value('--backup'), JSON.stringify(entry) + '\n') }) : await auditDatabase(db);
      const json = JSON.stringify(report, null, 2) + '\n';
      if (value('--output')) { await writeFile(value('--output'), json, { mode: 0o600 }); console.log(JSON.stringify({ result: 'completed', mode: report.mode, reportWritten: true })); }
      else console.log(json);
    } finally { await client.close(); }
  })().catch(error => {
    // Connection diagnostics can include URI/user information. Emit no raw
    // driver errors, credentials, document bodies, or provider payloads.
    const known = /^(MONGODB_URI|Unknown command|Explicit write|Duplicate provider|An order changed|Reference preflight)/.test(error.message);
    console.error(known ? error.message : 'Consistency check could not complete. Check database connectivity and permissions; no automatic retry or financial-data repair was attempted.');
    process.exitCode = 1;
  });
}
