import { Link } from '../router.jsx';
import { useConfirm } from './ConfirmProvider.jsx';
import { useToast } from './ToastProvider.jsx';

export function DraftNotice({ draft, disabled = false, onDiscard, onNew }) {
  const confirm = useConfirm();
  const toast = useToast();
  const discard = async () => {
    if (!await confirm({ title: 'Discard this draft?', message: 'Your unfinished changes will be removed from this browser. Saved records will stay unchanged.', confirmLabel: 'Discard draft', tone: 'danger' })) return;
    if (draft.reset()) onDiscard?.();
  };
  return <div className="admin-draft-notice">
    <div><p role={draft.error ? 'alert' : 'status'} className={draft.error ? 'admin-field-error' : undefined}>{draft.error || (draft.savedAt ? `${draft.restored ? 'Draft restored' : 'Draft saved'} · ${new Date(draft.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Unfinished changes save automatically as a draft.')}</p><small>Saved in this browser for your account. Live records change only when you submit.</small></div>
    <div className="admin-row-actions"><button type="button" className="admin-btn admin-btn-small admin-btn-ghost" disabled={disabled} onClick={() => { if (draft.save()) toast.success('Draft saved in this browser. You can return to it from Drafts.'); }}>Save draft</button>{draft.savedAt && <button type="button" className="admin-btn admin-btn-small admin-btn-quiet" disabled={disabled} onClick={discard}>Discard draft</button>}{onNew && draft.savedAt && <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" disabled={disabled} onClick={onNew}>Start another</button>}<Link to="/admin/drafts">View drafts</Link></div>
  </div>;
}
