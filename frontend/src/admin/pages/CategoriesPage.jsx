import { useMemo, useState } from 'react';
import { CheckboxField, FormField, FormGrid } from '../components/FormField.jsx';
import { EmptyState, ErrorState, LoadingBlock } from '../components/Feedback.jsx';
import { Card, PageHeader, StatCard } from '../components/PageHeader.jsx';
import { Modal } from '../components/Modal.jsx';
import { Pill } from '../components/StatusPill.jsx';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { adminApi, API_URL } from '../lib/api.js';
import { assetUrl, buildCategoryTree, categoryOptions } from '../lib/catalogue.js';
import { slugify } from '../lib/format.js';
import { can } from '../lib/permissions.js';
import { useResource } from '../lib/useResource.js';
import { useSession } from '../session/session-context.js';

const blankCategory = () => ({
  name: '',
  slug: '',
  parentId: '',
  position: '0',
  description: '',
  image: '',
  seoTitle: '',
  seoDescription: '',
  isActive: true,
});

function fromCategory(category) {
  return {
    name: category.name ?? '',
    slug: category.slug ?? '',
    parentId: category.parentId ? String(category.parentId) : '',
    position: String(category.position ?? 0),
    description: category.description ?? '',
    image: category.image ?? '',
    seoTitle: category.seoTitle ?? '',
    seoDescription: category.seoDescription ?? '',
    isActive: category.isActive !== false,
  };
}

/**
 * Category tree editor.
 *
 * `GET /categories/admin` returns a flat list with `parentId`, so the tree is
 * assembled here (`buildCategoryTree`) rather than by N+1 requests. The parent
 * selector reuses `categoryOptions`, which removes the node being edited *and*
 * its descendants — the guard against a category becoming its own ancestor.
 */
export default function CategoriesPage() {
  const { role } = useSession();
  const toast = useToast();
  const confirm = useConfirm();

  const { data, loading, error, reload } = useResource(() => adminApi.categories.list(), []);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(blankCategory);
  const [saving, setSaving] = useState(false);
  const [busySlug, setBusySlug] = useState('');
  const [draggedSlug, setDraggedSlug] = useState('');

  const categories = data ?? [];
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const canWrite = can(role, 'categories:write');
  const stats = useMemo(() => {
    const active = categories.filter((category) => category.isActive !== false).length;
    return { total: categories.length, active, hidden: categories.length - active };
  }, [categories]);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const openCreate = (parent = null) => {
    setForm({ ...blankCategory(), parentId: parent ? String(parent._id) : '' });
    setEditor({ mode: 'create', category: null });
  };

  const openEdit = (category) => {
    setForm(fromCategory(category));
    setEditor({ mode: 'edit', category });
  };

  const closeEditor = () => {
    setEditor(null);
    setSaving(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error('A category name is required.');
      return;
    }
    const payload = {
      name: form.name.trim(),
      slug: slugify(form.slug || form.name),
      parentId: form.parentId || null,
      position: Number(form.position) || 0,
      description: form.description.trim(),
      image: form.image.trim(),
      seoTitle: form.seoTitle.trim(),
      seoDescription: form.seoDescription.trim(),
      isActive: form.isActive,
    };

    setSaving(true);
    try {
      if (editor.mode === 'create') {
        await adminApi.categories.create(payload);
        toast.success(`Category “${payload.name}” created.`);
      } else {
        await adminApi.categories.update(editor.category.slug, payload);
        toast.success(`Category “${payload.name}” saved.`);
      }
      closeEditor();
      await reload();
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (category) => {
    const confirmed = await confirm({
      title: `Deactivate “${category.name}”?`,
      message:
        'The category leaves the storefront and the public category list. Products keep their category label and can be re-assigned from the product editor.',
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!confirmed) return;

    setBusySlug(category.slug);
    try {
      await adminApi.categories.deactivate(category.slug);
      toast.success(`“${category.name}” is now inactive.`);
      await reload();
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setBusySlug('');
    }
  };

  const activate = async (category) => {
    setBusySlug(category.slug);
    try { await adminApi.categories.activate(category.slug); toast.success(`“${category.name}” is active again.`); await reload(); }
    catch (failure) { toast.error(failure.message); }
    finally { setBusySlug(''); }
  };

  const uploadCategoryImage = async (file) => {
    if (!file) return;
    setSaving(true);
    try {
      const result = await adminApi.cms.uploadImage(file);
      setField('image', result.url.startsWith('http') ? result.url : `${API_URL}${result.url}`);
      toast.success('Category image uploaded. Save the category to publish it.');
    } catch (failure) { toast.error(failure.message); }
    finally { setSaving(false); }
  };

  const reorderSiblings = async (siblings, dragged, target) => {
    if (!dragged || dragged === target) return;
    const slugs = siblings.map((item) => item.slug);
    const from = slugs.indexOf(dragged), to = slugs.indexOf(target);
    if (from < 0 || to < 0) return;
    slugs.splice(to, 0, slugs.splice(from, 1)[0]);
    setBusySlug(dragged);
    try { await adminApi.categories.reorder(slugs); toast.success('Category order saved.'); await reload(); }
    catch (failure) { toast.error(failure.message); }
    finally { setBusySlug(''); setDraggedSlug(''); }
  };

  const parentOptions = categoryOptions(categories, { excludeId: editor?.category?._id ?? null });

  /** Recursive rows: indentation is a CSS variable, not nested tables. */
  const renderNodes = (nodes, depth = 0) =>
    nodes.map((node) => {
      const children = node.children ?? [];
      return (
        <div className="admin-tree-node" key={node._id ?? node.slug}>
          <div className="admin-tree-row" style={{ '--depth': depth }} draggable={canWrite} onDragStart={(event) => { event.stopPropagation(); setDraggedSlug(node.slug); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={(event) => { if (draggedSlug) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); reorderSiblings(nodes, draggedSlug, node.slug); }} onDragEnd={() => setDraggedSlug('')}>
            {canWrite && <span className="admin-tree-drag" aria-label="Drag to reorder" title="Drag to reorder">⠿</span>}
            {node.image ? (
              <img src={assetUrl(node.image)} alt="" />
            ) : (
              <span className="admin-tree-dot" aria-hidden="true" />
            )}
            <div className="admin-tree-labels">
              <b>{node.name}</b>
              <small className="admin-mono">
                {node.slug} · position {node.position ?? 0}
                {children.length ? ` · ${children.length} sub-categor${children.length === 1 ? 'y' : 'ies'}` : ''}
              </small>
            </div>
            <Pill tone={node.isActive === false ? 'muted' : 'ok'}>
              {node.isActive === false ? 'Inactive' : 'Active'}
            </Pill>
            {canWrite ? (
              <div className="admin-row-actions">
                <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => openEdit(node)}>
                  Edit
                </button>
                {node.isActive === false ? <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" disabled={busySlug === node.slug} onClick={() => activate(node)}>Reactivate</button> : null}
                <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => openCreate(node)}>
                  + Sub-category
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-small admin-btn-quiet"
                  disabled={busySlug === node.slug || node.isActive === false}
                  onClick={() => deactivate(node)}
                >
                  Deactivate
                </button>
              </div>
            ) : null}
          </div>
          {children.length ? <div className="admin-tree-children">{renderNodes(children, depth + 1)}</div> : null}
        </div>
      );
    });

  return (
    <>
      <PageHeader
        eyebrow="CATALOGUE"
        title="Categories"
        description="One arbitrary-depth tree for the storefront's category tiles and the product editor."
        actions={
          canWrite ? (
            <button type="button" className="admin-btn admin-btn-primary" onClick={() => openCreate(null)}>
              + New category
            </button>
          ) : (
            <span className="admin-pill admin-pill-muted">Read-only role</span>
          )
        }
      />

      <div className="admin-stat-grid">
        <StatCard label="Categories" value={stats.total} hint="Across every depth level" />
        <StatCard label="Active" value={stats.active} tone="ok" hint="Visible on the storefront" />
        <StatCard
          label="Inactive"
          value={stats.hidden}
          tone={stats.hidden ? 'warn' : 'default'}
          hint="Hidden, kept for history"
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Categories did not load" />
      ) : loading ? (
        <LoadingBlock label="Loading categories…" />
      ) : categories.length === 0 ? (
        <Card>
          <EmptyState
            title="No categories yet"
            description="The storefront's category tiles and the product editor both read from this tree."
            action={
              canWrite ? (
                <button type="button" className="admin-btn admin-btn-primary" onClick={() => openCreate(null)}>
                  + New category
                </button>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card title="Category tree" description="Ordered by position, then name." className="admin-card-tight">
          <div className="admin-tree">{renderNodes(tree)}</div>
        </Card>
      )}

      <p className="admin-footnote">
        Deactivation is soft — the row and the product labels stay intact, matching the non-negotiable rules in
        backend/ADMIN_COMMERCE_PLAN.md.
      </p>

      <Modal
        open={Boolean(editor)}
        title={editor?.mode === 'create' ? 'New category' : `Edit “${editor?.category?.name ?? ''}”`}
        description="The slug is the public identifier and the parent decides the tree position."
        onClose={closeEditor}
        footer={
          <>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={closeEditor}>
              Cancel
            </button>
            <button
              type="submit"
              form="admin-category-form"
              className="admin-btn admin-btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving…' : editor?.mode === 'create' ? 'Create category' : 'Save category'}
            </button>
          </>
        }
      >
        <form id="admin-category-form" onSubmit={submit} noValidate>
          <FormGrid>
            <FormField label="Name" required>
              <input
                className="admin-input"
                value={form.name}
                onChange={(event) => setField('name', event.target.value)}
                autoFocus
              />
            </FormField>
            <FormField label="Slug" hint="Leave blank to derive it from the name.">
              <input
                className="admin-input admin-mono"
                value={form.slug}
                onChange={(event) => setField('slug', event.target.value)}
              />
            </FormField>
            <FormField label="Parent" hint="A category cannot be its own ancestor.">
              <select
                className="admin-input"
                value={form.parentId}
                onChange={(event) => setField('parentId', event.target.value)}
              >
                <option value="">No parent (top level)</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {`${'— '.repeat(option.depth)}${option.name}${option.isActive ? '' : ' (inactive)'}`}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Position" hint="Lower numbers appear first.">
              <input
                className="admin-input admin-mono"
                inputMode="numeric"
                value={form.position}
                onChange={(event) => setField('position', event.target.value)}
              />
            </FormField>
            <FormField label="Image" hint="Upload JPEG, PNG or WebP, or enter an existing asset path.">
              <input
                className="admin-input admin-mono"
                value={form.image}
                onChange={(event) => setField('image', event.target.value)}
              />
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadCategoryImage(event.target.files?.[0])} disabled={saving} aria-label="Upload category image" />
              {form.image && <img className="admin-category-image-preview" src={assetUrl(form.image)} alt="Category image preview" />}
            </FormField>
            <FormField label="Description">
              <input
                className="admin-input"
                value={form.description}
                onChange={(event) => setField('description', event.target.value)}
              />
            </FormField>
            <FormField label="SEO title">
              <input
                className="admin-input"
                value={form.seoTitle}
                onChange={(event) => setField('seoTitle', event.target.value)}
              />
            </FormField>
            <FormField label="SEO description">
              <input
                className="admin-input"
                value={form.seoDescription}
                onChange={(event) => setField('seoDescription', event.target.value)}
              />
            </FormField>
          </FormGrid>
          <CheckboxField
            label="Active"
            hint="Inactive categories disappear from the public tree."
            checked={form.isActive}
            onChange={(checked) => setField('isActive', checked)}
          />
        </form>
      </Modal>
    </>
  );
}
