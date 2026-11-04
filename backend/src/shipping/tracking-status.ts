/** Only positively identified forward delivery scans advance fulfilment. */
export function deliveryRank(status?: string): number {
  const label = String(status ?? '').trim().toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (label === 'DELIVERED') return 3;
  if (label === 'OUT FOR DELIVERY') return 2;
  if (['IN TRANSIT', 'PICKED UP', 'SHIPPED'].includes(label)) return 1;
  return 0; // RTO, cancellation, NDR and unknown scans require separate handling.
}
