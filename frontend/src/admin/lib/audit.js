export const humanize = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').replace(/^./, letter => letter.toUpperCase());
export function actionKind(event) { return event.action?.split('.').at(-1) || 'updated'; }
export function entityName(event) { return event.after?.title || event.after?.name || event.before?.title || event.before?.name || event.after?.slug || event.before?.slug || `${humanize(event.entityType)} record`; }
export function changedFields(event) {
  const before = event.before || {}, after = event.after || {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !['_id', '__v', 'createdAt', 'updatedAt'].includes(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(key => ({ key, label: humanize(key.replace(/Paise$/, '')), before: before[key], after: after[key] }));
}
export function displayValue(value, key = '') {
  if (typeof value === 'number' && key.endsWith('Paise')) return `₹${(value / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  if (value === undefined) return 'Not set';
  if (value === null) return 'None';
  if (value === '') return 'Empty';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}
export function filterAudit(events, { search = '', entity = '', action = '', days = '' }, now = Date.now()) {
  const term = search.trim().toLowerCase();
  return events.filter(event => (!entity || event.entityType === entity)
    && (!action || actionKind(event) === action)
    && (!days || new Date(event.createdAt).getTime() >= now - Number(days) * 86400000)
    && (!term || [entityName(event), event.entityId, event.action, event.actorEmail, event.actorId, event.correlationId, event.actorEmail || event.actorId ? '' : 'system'].some(value => String(value || '').toLowerCase().includes(term))));
}
