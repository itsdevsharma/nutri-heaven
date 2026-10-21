import type { Order } from './order.schema';

export const ORDER_ACTIONS = ['accept', 'pick', 'pack', 'ready', 'dispatch', 'out_for_delivery', 'deliver', 'approve_return', 'reject_return', 'receive_return', 'inspect_return', 'record_cod_collection', 'record_cod_settlement'] as const;
export type OrderAction = typeof ORDER_ACTIONS[number];
export interface OrderOperations {
  fulfillment: 'unaccepted' | 'accepted' | 'picking' | 'packed' | 'ready_to_dispatch' | 'dispatched' | 'completed' | 'cancelled';
  shipment: 'not_created' | 'in_transit' | 'out_for_delivery' | 'delivered';
  courier?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  returnStatus: 'not_requested' | 'requested' | 'approved' | 'rejected' | 'received' | 'inspected';
  inspection?: Array<{ productSlug: string; packSize: string; quantity: number; disposition: 'restock' | 'write_off'; condition: 'sealed' | 'opened' | 'damaged' | 'expired' }>;
  codCollectedPaise: number;
  codSettledPaise: number;
  codCollectionReference?: string;
  codSettlementReference?: string;
}
export function operationsFor(order: Order): OrderOperations {
  // Older orders are projected at read time, never silently rewritten as paid.
  const fulfillmentByStatus: Record<string, OrderOperations['fulfillment']> = { packed: 'packed', shipped: 'dispatched', out_for_delivery: 'dispatched', delivered: 'completed', cancelled: 'cancelled', return_requested: 'completed', returned: 'completed', refunded: 'completed' };
  return order.operations ?? {
    fulfillment: fulfillmentByStatus[order.status] ?? 'unaccepted',
    shipment: ['delivered', 'return_requested', 'returned', 'refunded'].includes(order.status) ? 'delivered' : order.status === 'out_for_delivery' ? 'out_for_delivery' : order.status === 'shipped' ? 'in_transit' : 'not_created',
    returnStatus: order.status === 'return_requested' ? 'requested' : order.status === 'returned' ? 'received' : 'not_requested',
    codCollectedPaise: 0, codSettledPaise: 0,
  };
}
export function allowedOrderActions(order: Order, role: string): OrderAction[] {
  if (!['super_admin', 'support'].includes(role)) return [];
  const op = operationsFor(order);
  const actions: OrderAction[] = [];
  const eligible = !order.paymentReconciliationRequired && order.stockReserved && (order.paymentMethod === 'cod' || order.paymentStatus === 'paid');
  if (eligible && ['pending', 'confirmed', 'packed'].includes(order.status)) {
    const next = { unaccepted: 'accept', accepted: 'pick', picking: 'pack', packed: 'ready', ready_to_dispatch: 'dispatch' } as const;
    const action = next[op.fulfillment as keyof typeof next];
    if (action) actions.push(action);
  }
  if (!order.paymentReconciliationRequired && order.status === 'shipped') actions.push('out_for_delivery');
  if (!order.paymentReconciliationRequired && order.status === 'out_for_delivery') actions.push('deliver');
  if (op.returnStatus === 'requested') actions.push('approve_return', 'reject_return');
  if (op.returnStatus === 'approved') actions.push('receive_return');
  if (op.returnStatus === 'received') actions.push('inspect_return');
  if (role === 'super_admin' && order.paymentMethod === 'cod' && order.totalPaise > 0 && op.shipment === 'delivered') {
    if (!op.codCollectedPaise) actions.push('record_cod_collection');
    if (op.codCollectedPaise > op.codSettledPaise) actions.push('record_cod_settlement');
  }
  return actions;
}
