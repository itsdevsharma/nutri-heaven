import { useState } from 'react';
import { Card } from './PageHeader.jsx';
import { DataTable } from './DataTable.jsx';
import { EmptyState, ErrorState } from './Feedback.jsx';
import { useConfirm } from './ConfirmProvider.jsx';
import { useToast } from './ToastProvider.jsx';
import { adminApi } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { useResource } from '../lib/useResource.js';

export default function EmailDeliveryQueue({ configured, pending, onRetried }) {
  const { data, loading, error, reload } = useResource(() => adminApi.engagement.failedEmails(), []);
  const [busy, setBusy] = useState('');
  const confirm = useConfirm();
  const toast = useToast();
  const retry = async item => {
    if (!await confirm({ title: 'Retry this email?', message: `Resend the original notification “${item.title}” to ${item.recipient}. Linked accounts use their current email address.`, confirmLabel: 'Queue email' })) return;
    setBusy(item._id);
    try {
      const result = await adminApi.engagement.retryEmail(item._id);
      toast.success(result.message);
      await reload();
      await onRetried?.();
    } catch (failure) { toast.error(failure.message); }
    finally { setBusy(''); }
  };
  return <Card title="Transactional email" description="Messages below exhausted automatic retries. Retries resend the original notification; linked accounts use their current email address." actions={<button className="admin-btn admin-btn-ghost admin-btn-small" disabled={loading || Boolean(busy)} onClick={reload}>Refresh emails</button>}>
    <p className="admin-hint">{configured ? 'Email sender configured.' : 'Configure a verified email sender before retrying.'} {pending} messages awaiting provider acceptance. The worker checks every 30 seconds, with five minutes between attempts and a limit of five attempts. Provider acceptance does not confirm inbox delivery.</p>
    {error ? <ErrorState error={error} onRetry={reload} /> : <DataTable loading={loading} rows={data ?? []} rowKey={item => item._id} caption="Emails requiring delivery review" empty={<EmptyState title="No failed emails to review" description="Messages still within their retry limit are handled automatically." />} columns={[
      { key: 'title', header: 'Notification' },
      { key: 'recipient', header: 'Recipient', render: item => <><span>{item.recipient}</span>{item.email !== item.recipient && <small className="admin-cell-note">Corrected account email</small>}</> },
      { key: 'createdAt', header: 'Created', render: item => formatDateTime(item.createdAt) },
      { key: 'attempts', header: 'Attempts' },
      { key: 'retry', header: 'Action', render: item => <button className="admin-btn admin-btn-ghost admin-btn-small" disabled={Boolean(busy) || !item.canRetry} title={item.canRetry ? undefined : 'Check sender configuration, account access or wait for the processing lease to expire.'} onClick={() => retry(item)}>{busy === item._id ? 'Queueing…' : 'Retry email'}</button> },
    ]} />}
  </Card>;
}
