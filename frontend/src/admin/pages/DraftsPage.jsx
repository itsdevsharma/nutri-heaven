import { useEffect, useState } from 'react';
import { PageHeader, Card } from '../components/PageHeader.jsx';
import { EmptyState } from '../components/Feedback.jsx';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { useSession } from '../session/session-context.js';
import { Link } from '../router.jsx';
import { can } from '../lib/permissions.js';
import { draftOwner, listDrafts, removeDraft } from '../lib/drafts.js';
import { formatDateTime } from '../lib/format.js';

const capability = scope => scope.startsWith('order-') ? 'orders:read' : ({ products: 'catalogue:write', categories: 'categories:write', customers: 'customers:write', inventory: 'inventory:write', users: 'users:write', offers: 'marketing:read', coupons: 'marketing:read', banners: 'settings:write', faqs: 'settings:write', socials: 'settings:write', 'store-content': 'settings:write', shipping: 'settings:write', orders: 'orders:read' })[scope];
export default function DraftsPage() {
  const { admin, role } = useSession(), owner = draftOwner(admin);
  const confirm = useConfirm();
  const [entries, setEntries] = useState(() => listDrafts(owner));
  const [error, setError] = useState('');
  useEffect(() => {
    const reload = () => setEntries(listDrafts(owner));
    reload();
    window.addEventListener('storage', reload);
    window.addEventListener('admin-drafts-changed', reload);
    return () => { window.removeEventListener('storage', reload); window.removeEventListener('admin-drafts-changed', reload); };
  }, [owner]);
  const discard = async entry => {
    if (!await confirm({ title: 'Discard draft?', message: 'This removes the unfinished entry from this browser. Saved records will stay unchanged.', confirmLabel: 'Discard draft', tone: 'danger' })) return;
    try { removeDraft(owner, entry.scope, entry.record); } catch { setError('Could not remove the draft. Please retry.'); }
  };
  const visible = entries.filter(entry => capability(entry.scope) && can(role, capability(entry.scope)));
  return <><PageHeader title="Drafts" description="Resume unfinished work saved in this browser for your account. Drafts are separate from live records." />
    {error && <p role="alert" className="admin-field-error">{error}</p>}
    <Card title="Unfinished entries">{visible.length ? <ul className="admin-draft-list">{visible.map(entry => <li key={`${entry.scope}:${entry.record}`}>
      <div><b>{entry.value?.title || entry.value?.name || entry.value?.heading || entry.value?.code || entry.value?.question || entry.value?.platform || entry.context?.label || entry.title}</b><p className="admin-hint">{entry.title} · {formatDateTime(entry.updatedAt)}</p></div>
      <div className="admin-row-actions"><Link className="admin-btn admin-btn-small admin-btn-ghost" to={`${entry.route}?draft=${encodeURIComponent(entry.record)}`}>Resume</Link><button type="button" className="admin-btn admin-btn-small admin-btn-quiet" onClick={() => discard(entry)}>Discard</button></div>
    </li>)}</ul> : <EmptyState title="No unfinished drafts" description="Start entering data in a form. Your progress will appear here automatically." />}</Card>
  </>;
}
