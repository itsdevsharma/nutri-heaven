import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader.jsx';
import { ErrorState, EmptyState, LoadingBlock } from '../components/Feedback.jsx';
import { Modal } from '../components/Modal.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { adminApi } from '../lib/api.js';
import { useResource } from '../lib/useResource.js';
import { formatDateTime } from '../lib/format.js';
import { actionKind, changedFields, displayValue, entityName, filterAudit, humanize } from '../lib/audit.js';

function ActionBadge({ event }) {
  const kind = actionKind(event);
  const tone = /creat|publish|restor/.test(kind) ? 'green' : /delet|archiv|cancel/.test(kind) ? 'red' : 'amber';
  return <span className={`audit-badge audit-badge-${tone}`}><span />{humanize(kind)}</span>;
}
function Actor({ event }) {
  const name = event.actorEmail || event.actorId || 'System';
  return <div className="audit-actor"><span className={`audit-avatar ${name==='System'?'audit-avatar-system':''}`} aria-hidden="true">{name==='System'?'↻':name.slice(0,2).toUpperCase()}</span><div><b title={name}>{name}</b><small>{name==='System'?'Automated activity':'Admin activity'}</small></div></div>;
}
function EventDetails({ event, close }) {
  const changes = changedFields(event);
  return <Modal open={Boolean(event)} title="Activity details" description={event ? `${entityName(event)} · ${formatDateTime(event.createdAt)}` : ''} onClose={close} size="lg" footer={<button className="admin-btn admin-btn-primary" onClick={close}>Done</button>}>
    {event && <>
      <div className="audit-detail-summary"><ActionBadge event={event}/><Actor event={event}/><span>{changes.length} {changes.length===1?'field':'fields'} changed</span></div>
      <dl className="audit-record-meta"><div><dt>Record</dt><dd>{humanize(event.entityType)} <code>{event.entityId}</code></dd></div><div><dt>Action</dt><dd>{event.action}</dd></div>{event.correlationId&&<div><dt>Request ID</dt><dd><code>{event.correlationId}</code></dd></div>}</dl>
      <div className="audit-diff"><div className="audit-diff-head"><span>Field</span><span>Before</span><span>After</span></div>{changes.length?changes.map(field=><div className="audit-diff-row" key={field.key}><b>{field.label}</b><pre className="audit-value-before">{displayValue(field.before,field.key)}</pre><pre className="audit-value-after">{displayValue(field.after,field.key)}</pre></div>):<p className="audit-no-diff">No field differences were recorded for this activity.</p>}</div>
      <details className="audit-raw"><summary>View full recorded data</summary><div className="audit-raw-grid"><section><h3>Before</h3><pre>{JSON.stringify(event.before ?? {},null,2)}</pre></section><section><h3>After</h3><pre>{JSON.stringify(event.after ?? {},null,2)}</pre></section></div></details>
    </>}
  </Modal>;
}
const initialFilters = {search:'',entity:'',action:'',days:''};
export default function AuditPage() {
  const { data, loading, error, reload } = useResource(() => adminApi.audit.list(), []);
  const [filters,setFilters]=useState(initialFilters), [offset,setOffset]=useState(0), [selected,setSelected]=useState(null);
  const events=data || [];
  const filtered=useMemo(()=>filterAudit(events,filters),[data,filters]);
  const rows=filtered.slice(offset,offset+20);
  const actors=new Set(events.map(event=>event.actorEmail || event.actorId).filter(Boolean)).size;
  const today=events.filter(event=>new Date(event.createdAt).toDateString()===new Date().toDateString()).length;
  const setFilter=(key,value)=>{setFilters(current=>({...current,[key]:value}));setOffset(0);};
  const reset=()=>{setFilters(initialFilters);setOffset(0);};
  const hasFilters=Object.values(filters).some(Boolean);
  return <div className="audit-page">
    <PageHeader eyebrow="SYSTEM / ACTIVITY" title="Audit trail" description="A clear record of who changed what, and when." actions={<button className="admin-btn admin-btn-ghost" disabled={loading} onClick={()=>{setOffset(0);reload();}}><span aria-hidden="true">↻</span> {loading?'Refreshing…':'Refresh activity'}</button>}/>
    <div className="audit-stats" aria-label="Recent activity overview">
      <article><span className="audit-stat-icon" aria-hidden="true">≡</span><div><span>Recorded events</span><strong>{loading?'—':events.length.toLocaleString()}</strong><small>Latest available activity</small></div></article>
      <article><span className="audit-stat-icon" aria-hidden="true">◷</span><div><span>Changes today</span><strong>{loading?'—':today.toLocaleString()}</strong><small>Across the loaded records</small></div></article>
      <article><span className="audit-stat-icon" aria-hidden="true">◎</span><div><span>Active admins</span><strong>{loading?'—':actors.toLocaleString()}</strong><small>People in this activity log</small></div></article>
    </div>
    <section className="audit-log" aria-label="Audit activity">
      <header className="audit-log-heading"><div><h2>Activity log <span>{filtered.length}</span></h2><p>Newest events first · up to 500 recent records</p></div><span className="audit-readonly"><span aria-hidden="true">◈</span> Read-only history</span></header>
      <div className="audit-filters">
        <label className="audit-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search audit activity" placeholder="Search records, people or actions…" value={filters.search} onChange={event=>setFilter('search',event.target.value)}/></label>
        <select aria-label="Filter by record type" value={filters.entity} onChange={event=>setFilter('entity',event.target.value)}><option value="">All record types</option>{[...new Set(events.map(event=>event.entityType).filter(Boolean))].sort().map(type=><option key={type} value={type}>{humanize(type)}</option>)}</select>
        <select aria-label="Filter by action" value={filters.action} onChange={event=>setFilter('action',event.target.value)}><option value="">All actions</option>{[...new Set(events.map(actionKind))].sort().map(action=><option key={action} value={action}>{humanize(action)}</option>)}</select>
        <select aria-label="Filter by time" value={filters.days} onChange={event=>setFilter('days',event.target.value)}><option value="">Any time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
      </div>
      {hasFilters&&<div className="audit-filter-summary"><span>{filtered.length} matching {filtered.length===1?'event':'events'}</span><button type="button" onClick={reset}>Clear filters ×</button></div>}
      {error?<ErrorState error={error} onRetry={reload}/>:loading?<div className="audit-feedback"><LoadingBlock label="Loading activity…" rows={5}/></div>:!rows.length?<div className="audit-feedback"><EmptyState title={hasFilters?'No matching activity':'No activity yet'} description={hasFilters?'Try another search or clear your filters.':'Changes will appear here as your team updates the store.'}/>{hasFilters&&<button className="admin-btn admin-btn-ghost" onClick={reset}>Clear filters</button>}</div>:<>
        <div className="audit-table-scroll"><table className="audit-table"><caption className="admin-visually-hidden">Recent store changes with action, record, actor and timestamp</caption><thead><tr><th scope="col">Activity / record</th><th scope="col">Changed by</th><th scope="col">Date &amp; time</th><th scope="col"><span className="admin-visually-hidden">Details</span></th></tr></thead><tbody>{rows.map(event=>{
          const changes=changedFields(event), date=new Date(event.createdAt);
          return <tr key={event._id}><td><div className="audit-record"><span className="audit-record-icon" aria-hidden="true">▤</span><div><div className="audit-record-title"><b>{entityName(event)}</b><ActionBadge event={event}/></div><p>{humanize(event.entityType)}<span>·</span>{changes.length} {changes.length===1?'field':'fields'} changed</p><code title={event.entityId}>{event.entityId}</code></div></div></td><td><Actor event={event}/></td><td><time dateTime={event.createdAt}><b>{Number.isNaN(date.getTime())?'Unknown date':date.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}</b><small>{Number.isNaN(date.getTime())?'':date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</small></time></td><td><button type="button" className="audit-view" onClick={()=>setSelected(event)} aria-label={`View changes for ${entityName(event)}`}>View changes <span aria-hidden="true">↗</span></button></td></tr>;
        })}</tbody></table></div>
        <div className="audit-log-footer"><Pagination total={filtered.length} limit={20} offset={offset} onChange={setOffset} label="events"/></div>
      </>}
    </section>
    {selected&&<EventDetails event={selected} close={()=>setSelected(null)}/>}
  </div>;
}
