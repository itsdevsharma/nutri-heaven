import test from 'node:test';
import assert from 'node:assert/strict';
import { orderProgress, receiptAvailable, trackingLink, payable } from '../src/customer/order-progress.js';
const base = { status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'razorpay', stockReserved: true };
test('operational progress distinguishes payment from order acceptance and dispatch', () => {
  assert.equal(orderProgress(base).title, 'Waiting for acceptance');
  assert.equal(orderProgress({ ...base, operations: { fulfillment: 'picking' } }).step, 1);
  assert.equal(orderProgress({ ...base, operations: { fulfillment: 'ready_to_dispatch' } }).step, 2);
  assert.equal(orderProgress({ ...base, status: 'shipped' }).step, 3);
  assert.equal(orderProgress({ ...base, status: 'out_for_delivery' }).title, 'Out for delivery');
  assert.equal(orderProgress({ ...base, status: 'delivered' }).step, 4);
  const pending = { ...base, status: 'pending', paymentStatus: 'pending' };
  assert.equal(payable(pending), true);
  assert.equal(orderProgress(pending).title, 'Waiting for payment');
});
test('courier updates advance delivery without treating return-to-origin as customer delivery', () => {
  assert.equal(orderProgress({ ...base, deliveryTracking: { status: 'OUT FOR DELIVERY' } }).title, 'Out for delivery');
  assert.equal(orderProgress({ ...base, deliveryTracking: { status: 'DELIVERED' } }).step, 4);
  assert.equal(orderProgress({ ...base, deliveryTracking: { status: 'RTO DELIVERED' } }).step, 0);
  assert.equal(orderProgress({ ...base, status: 'cancelled', deliveryTracking: { status: 'DELIVERED' } }).title, 'Order cancelled');
});
test('payment review and returns never show an ordinary delivery progress bar', () => {
  for (const status of ['cancelled', 'return_requested', 'returned', 'refunded']) assert.equal(orderProgress({ ...base, status }).exceptional, true);
  const held = { ...base, paymentReconciliationRequired: true };
  assert.equal(orderProgress(held).title, 'Payment under review');
  assert.equal(receiptAvailable(held), false);
});
test('receipts require recorded payment for both online and cash on delivery orders', () => {
  for (const paymentMethod of ['cod', 'razorpay']) {
    for (const paymentStatus of ['pending', 'failed']) assert.equal(receiptAvailable({ ...base, paymentMethod, paymentStatus }), false);
    for (const paymentStatus of ['paid', 'refunded']) assert.equal(receiptAvailable({ ...base, paymentMethod, paymentStatus }), true);
  }
  for (const value of ['javascript:alert(1)', '/relative', 'https://user:password@example.com', '', undefined]) assert.equal(trackingLink(value), null);
  assert.equal(trackingLink('https://courier.example/track/A123'), 'https://courier.example/track/A123');
});
test('milestone timestamps use recorded events rather than inventing dates', () => {
  const progress = orderProgress({ ...base, createdAt: '2026-11-01T10:00:00Z', operations: { fulfillment: 'packed' }, activity: [{ action: 'accept', at: '2026-11-02T11:00:00Z' }], statusHistory: [{ status: 'packed', at: '2026-11-03T12:00:00Z' }] });
  assert.equal(progress.stages[1].date, '2026-11-02T11:00:00Z');
  assert.equal(progress.stages[2].date, '2026-11-03T12:00:00Z');
  assert.equal(progress.stages[3].date, undefined);
});
