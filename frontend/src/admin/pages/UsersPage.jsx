import { useState } from 'react';
import { PageHeader, Card, StatCard } from '../components/PageHeader.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { ErrorState, EmptyState, LoadingBlock } from '../components/Feedback.jsx';
import { FormField, FormGrid } from '../components/FormField.jsx';
import { Modal } from '../components/Modal.jsx';
import { Pill } from '../components/StatusPill.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { adminApi } from '../lib/api.js';
import { ROLE_OPTIONS, roleLabel, ROLES } from '../lib/permissions.js';
import { useResource } from '../lib/useResource.js';
import { useSession } from '../session/session-context.js';

const blank = () => ({ name: '', email: '', role: ROLES.SUPPORT, password: '' });

export default function UsersPage() {
  const { admin } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useResource(() => adminApi.users.list(), []);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const users = data ?? [];
  const isSelf = (user) => String(user._id) === String(admin?.id);
  const rows = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search.trim().toLowerCase()) && (!roleFilter || user.role === roleFilter) && (!statusFilter || String(user.isActive) === statusFilter));
  const field = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const open = (user = null) => {
    setForm(user ? { name: user.name, email: user.email, role: user.role, password: '' } : blank());
    setEditor({ user });
  };
  const close = () => { if (!saving) { setEditor(null); setForm(blank()); } };
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const payload = { name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role, ...(form.password ? { password: form.password } : {}) };
    try {
      if (editor.user) await adminApi.users.update(editor.user._id, payload);
      else await adminApi.users.create(payload);
      toast.success(editor.user ? 'User updated.' : 'User created. They can now sign in to the admin panel.');
      setEditor(null); setForm(blank());
      await reload();
    } catch (failure) { toast.error(failure.message); }
    finally { setSaving(false); }
  };
  const toggle = async (user) => {
    if (!await confirm({ title: `${user.isActive ? 'Deactivate' : 'Reactivate'} ${user.name}?`, message: user.isActive ? 'This user will lose access immediately, including any existing sessions.' : 'This user will be able to sign in again with their current password.', confirmLabel: user.isActive ? 'Deactivate' : 'Reactivate', tone: user.isActive ? 'danger' : 'default' })) return;
    setBusyId(user._id);
    try { await adminApi.users.update(user._id, { isActive: !user.isActive }); toast.success('User access updated.'); await reload(); }
    catch (failure) { toast.error(failure.message); }
    finally { setBusyId(''); }
  };

  return <>
    <PageHeader eyebrow="SYSTEM" title="Users" description="Manage staff accounts and access to the admin panel." actions={<button className="admin-btn admin-btn-primary" onClick={() => open()}>+ New user</button>} />
    <div className="admin-stat-grid">
      <StatCard label="Users" value={users.length} />
      <StatCard label="Active" value={users.filter((user) => user.isActive).length} tone="ok" />
      <StatCard label="Inactive" value={users.filter((user) => !user.isActive).length} />
    </div>
    <Card title="Admin users">
      <FormGrid>
        <FormField label="Search"><input className="admin-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" /></FormField>
        <FormField label="Role"><select className="admin-input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All roles</option>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></FormField>
        <FormField label="Status"><select className="admin-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></FormField>
      </FormGrid>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <LoadingBlock label="Loading users…" /> : <DataTable rows={rows} rowKey={(user) => user._id} empty={<EmptyState title="No users found" description="Create a user or adjust the filters." />} columns={[
        { key: 'name', header: 'Name', render: (user) => <>{user.name}{isSelf(user) ? ' (you)' : ''}</> },
        { key: 'email', header: 'Email' },
        { key: 'role', header: 'Role', render: (user) => roleLabel(user.role) },
        { key: 'status', header: 'Status', render: (user) => <Pill tone={user.isActive ? 'ok' : 'muted'}>{user.isActive ? 'Active' : 'Inactive'}</Pill> },
        { key: 'actions', header: 'Actions', render: (user) => <div className="admin-row-actions"><button className="admin-btn admin-btn-small admin-btn-ghost" disabled={busyId === user._id} onClick={() => open(user)}>Edit</button><button className="admin-btn admin-btn-small admin-btn-quiet" disabled={isSelf(user) || busyId === user._id} onClick={() => toggle(user)}>{user.isActive ? 'Deactivate' : 'Reactivate'}</button></div> },
      ]} />}
    </Card>
    <Modal open={Boolean(editor)} title={editor?.user ? 'Edit user' : 'Create user'} description="Assign a role that matches this person's responsibilities." onClose={close} footer={<><button className="admin-btn admin-btn-ghost" disabled={saving} onClick={close}>Cancel</button><button className="admin-btn admin-btn-primary" type="submit" form="admin-user-form" disabled={saving}>{saving ? 'Saving…' : editor?.user ? 'Save user' : 'Create user'}</button></>}>
      <form id="admin-user-form" onSubmit={submit}>
        <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}><FormGrid>
          <FormField label="Name" required><input className="admin-input" required maxLength={120} value={form.name} onChange={(event) => field('name', event.target.value)} autoFocus /></FormField>
          <FormField label="Email" required><input className="admin-input" type="email" required maxLength={254} value={form.email} onChange={(event) => field('email', event.target.value)} autoComplete="off" /></FormField>
          <FormField label="Role" required hint={editor?.user && isSelf(editor.user) ? 'Your own role cannot be changed.' : 'Super admins have full access, including user management.'}><select className="admin-input" value={form.role} disabled={Boolean(editor?.user && isSelf(editor.user))} onChange={(event) => field('role', event.target.value)}>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></FormField>
          <FormField label={editor?.user ? 'New password' : 'Password'} required={!editor?.user} hint={`${editor?.user ? 'Leave blank to keep the current password. ' : ''}Use 12–72 printable ASCII characters. Share it securely with the user.`}><input className="admin-input" type="password" autoComplete="new-password" required={!editor?.user} minLength={12} maxLength={72} pattern="[\x20-\x7E]+" value={form.password} onChange={(event) => field('password', event.target.value)} /></FormField>
        </FormGrid></fieldset>
      </form>
    </Modal>
  </>;
}
