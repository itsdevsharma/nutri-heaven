import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckboxField, FormField, FormGrid, FormSection } from '../components/FormField.jsx';
import { ErrorState, LoadingBlock } from '../components/Feedback.jsx';
import { Card, PageHeader } from '../components/PageHeader.jsx';
import { Pill, StatusPill } from '../components/StatusPill.jsx';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { adminApi } from '../lib/api.js';
import { PRODUCT_STATUSES, assetUrl, productStatusMeta } from '../lib/catalogue.js';
import {
  basisPointsToPercent,
  formatDateTime,
  formatPaise,
  paiseToRupees,
  percentToBasisPoints,
  rupeesToPaise,
  slugify,
} from '../lib/format.js';
import { can } from '../lib/permissions.js';
import { useResource } from '../lib/useResource.js';
import { Link, useRouter } from '../router.jsx';
import { useSession } from '../session/session-context.js';

function blankVariant() {
  return { size: '', price: '', mrp: '', stock: '0', lowStockLimit: '0', weightGrams: '', isActive: true };
}

function blankProduct() {
  return {
    title: '',
    slug: '',
    sku: '',
    barcode: '',
    brand: 'Nutri Heaven',
    category: '',
    subCategory: '',
    description: '',
    shortDescription: '',
    fullDescription: '',
    price: '',
    mrp: '',
    discountPercent: '',
    image: '',
    images: '',
    tags: '',
    seoTitle: '',
    seoDescription: '',
    status: 'draft',
    isActive: false,
    isFeatured: false,
    isBestseller: false,
    isNewArrival: false,
    variants: [blankVariant()],
  };
}

/** API product → editable rupees/percent strings. */
function fromProduct(product) {
  return {
    title: product.title ?? '',
    slug: product.slug ?? '',
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    brand: product.brand ?? '',
    category: product.category ?? '',
    subCategory: product.subCategory ?? '',
    description: product.description ?? '',
    shortDescription: product.shortDescription ?? '',
    fullDescription: product.fullDescription ?? '',
    price: paiseToRupees(product.pricePaise),
    mrp: paiseToRupees(product.mrpPaise),
    discountPercent: basisPointsToPercent(product.discountBasisPoints),
    image: product.image ?? '',
    images: (product.images ?? []).join('\n'),
    tags: (product.tags ?? []).join(', '),
    seoTitle: product.seoTitle ?? '',
    seoDescription: product.seoDescription ?? '',
    status: product.status ?? 'draft',
    isActive: product.isActive !== false,
    isFeatured: Boolean(product.isFeatured),
    isBestseller: Boolean(product.isBestseller),
    isNewArrival: Boolean(product.isNewArrival),
    variants: (product.variants ?? []).map((variant) => ({
      size: variant.size ?? '',
      price: paiseToRupees(variant.pricePaise),
      mrp: paiseToRupees(variant.mrpPaise),
      stock: String(variant.stockQuantity ?? 0),
      lowStockLimit: String(variant.lowStockLimit ?? 0),
      weightGrams:
        variant.weightGrams === undefined || variant.weightGrams === null ? '' : String(variant.weightGrams),
      isActive: variant.isActive !== false,
    })),
  };
}

const splitLines = (value) =>
  String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const splitList = (value) =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const toNumber = (value) => Math.max(0, Number(String(value ?? '').replace(/[^0-9.]/g, '')) || 0);

/**
 * Editor payload.
 *
 * Stock is deliberately not taken from the form on an update: the stored balance
 * is echoed back unchanged, because a balance may only move through an inventory
 * movement (`ADMIN_COMMERCE_PLAN.md`). On create the entered number is the
 * opening balance — the one moment a balance legitimately starts. Fields the
 * editor does not expose (variant SKU/barcode/tax) are round-tripped from the
 * stored variant so a save cannot blank them out.
 */
function buildPayload(form, { isNew, sourceVariants }) {
  return {
    slug: form.slug.trim().toLowerCase(),
    title: form.title.trim(),
    sku: form.sku.trim() || undefined,
    barcode: form.barcode.trim() || undefined,
    brand: form.brand.trim(),
    category: form.category.trim(),
    subCategory: form.subCategory.trim() || undefined,
    description: form.description.trim(),
    shortDescription: form.shortDescription.trim(),
    fullDescription: form.fullDescription.trim(),
    pricePaise: rupeesToPaise(form.price),
    mrpPaise: form.mrp === '' ? undefined : rupeesToPaise(form.mrp),
    discountBasisPoints: form.discountPercent === '' ? 0 : percentToBasisPoints(form.discountPercent),
    image: form.image.trim(),
    images: splitLines(form.images),
    tags: splitList(form.tags),
    seoTitle: form.seoTitle.trim(),
    seoDescription: form.seoDescription.trim(),
    status: form.status,
    isActive: form.isActive,
    isFeatured: form.isFeatured,
    isBestseller: form.isBestseller,
    isNewArrival: form.isNewArrival,
    variants: form.variants.map((variant, index) => ({
      ...(sourceVariants?.[index] ?? {}),
      size: variant.size.trim(),
      pricePaise: rupeesToPaise(variant.price),
      mrpPaise: variant.mrp === '' ? undefined : rupeesToPaise(variant.mrp),
      lowStockLimit: toNumber(variant.lowStockLimit),
      weightGrams: variant.weightGrams === '' ? undefined : toNumber(variant.weightGrams),
      isActive: variant.isActive,
      stockQuantity: isNew ? toNumber(variant.stock) : toNumber(sourceVariants?.[index]?.stockQuantity),
    })),
  };
}

/** Mirrors the fields `ProductsService.adminCreate` refuses to create without. */
function validate(form) {
  const errors = {};
  if (!form.title.trim()) errors.title = 'A product title is required.';
  if (!form.slug.trim()) errors.slug = 'A slug is required — it is the public product id used by the storefront.';
  else if (!/^[a-z0-9-]+$/.test(form.slug.trim())) errors.slug = 'Use lowercase letters, numbers and hyphens only.';
  if (!form.description.trim()) errors.description = 'A short description is required.';
  if (!form.category.trim()) errors.category = 'A category is required.';
  if (!form.image.trim()) errors.image = 'A primary image filename is required, e.g. almonds_ze0A.jpg.';
  if (form.price === '' || rupeesToPaise(form.price) <= 0) errors.price = 'A selling price above zero is required.';
  if (form.mrp !== '' && rupeesToPaise(form.mrp) < rupeesToPaise(form.price)) errors.mrp = 'MRP cannot be below the selling price.';
  if (!form.variants.length) errors.variants = 'At least one pack size is required.';
  else if (form.variants.some((variant) => !variant.size.trim())) errors.variants = 'Every pack needs a size label.';
  return errors;
}

/**
 * Create and edit share one screen: `/admin/products/new` and
 * `/admin/products/:slug` both resolve here, which is what stops the two flows
 * from drifting apart. `isNew` decides whether stock is an opening balance or a
 * read-only figure.
 */
export default function ProductEditorPage({ params }) {
  const slug = params?.slug ?? null;
  const isNew = !slug;

  const { role } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { navigate } = useRouter();

  const [form, setForm] = useState(blankProduct);
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const sourceVariants = useRef([]);
  const slugTouched = useRef(!isNew);

  const { data, loading, error, reload } = useResource(
    () => (isNew ? Promise.resolve(null) : adminApi.products.get(slug)),
    [slug, isNew],
  );

  useEffect(() => {
    if (!data) return;
    setForm(fromProduct(data));
    sourceVariants.current = data.variants ?? [];
    slugTouched.current = true;
    setErrors({});
    setDirty(false);
  }, [data]);

  const canWrite = can(role, 'catalogue:write');

  /**
   * Category names for the suggestions datalist. `Product.category` is a string
   * label rather than a reference, so the console offers the labels that already
   * exist instead of letting a typo invent a new one.
   */
  const categories = useResource(() => adminApi.categories.list(), []);
  const categoryNames = useMemo(
    () => Array.from(new Set((categories.data ?? []).map((category) => category.name).filter(Boolean))).sort(),
    [categories.data],
  );

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const setVariant = (index, key, value) => {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, position) =>
        position === index ? { ...variant, [key]: value } : variant,
      ),
    }));
    setDirty(true);
  };

  const addVariant = () => {
    setForm((current) => ({ ...current, variants: [...current.variants, blankVariant()] }));
    setDirty(true);
  };

  const removeVariant = (index) => {
    setForm((current) => ({
      ...current,
      variants: current.variants.filter((_, position) => position !== index),
    }));
    setDirty(true);
  };

  /** The title drives the slug until the slug is edited by hand — never after. */
  const changeTitle = (value) => {
    setForm((current) => ({
      ...current,
      title: value,
      slug: slugTouched.current ? current.slug : slugify(value),
    }));
    setDirty(true);
  };

  const changeSlug = (value) => {
    slugTouched.current = true;
    setField('slug', slugify(value));
  };

  const save = async (event) => {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error('Fix the highlighted fields before saving.');
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const created = await adminApi.products.create(buildPayload(form, { isNew: true }));
        toast.success(`“${created.title}” created as ${productStatusMeta(created.status).label.toLowerCase()}.`);
        navigate(`/admin/products/${created.slug}`, { replace: true });
      } else {
        const updated = await adminApi.products.update(
          slug,
          buildPayload(form, { isNew: false, sourceVariants: sourceVariants.current }),
        );
        setForm(fromProduct(updated));
        sourceVariants.current = updated.variants ?? [];
        setDirty(false);
        toast.success('Product saved.');
      }
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      const copy = await adminApi.products.duplicate(slug);
      toast.success(`Duplicated as “${copy.slug}”.`);
      navigate(`/admin/products/${copy.slug}`);
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    const confirmed = await confirm({
      title: `Deactivate “${form.title}”?`,
      message:
        'The product leaves the storefront but keeps its catalogue history. Editing the status brings it back.',
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      await adminApi.products.deactivate(slug);
      toast.success('Product deactivated.');
      await reload();
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <>
        <PageHeader eyebrow="CATALOGUE" title="Product" description="This product could not be loaded." />
        <ErrorState error={error} onRetry={reload} title="The product did not load" />
        <p className="admin-footnote">
          <Link to="/admin/products">← Back to all products</Link>
        </p>
      </>
    );
  }

  if (!isNew && loading) {
    return (
      <>
        <PageHeader eyebrow="CATALOGUE" title="Product" description="Loading the stored values…" />
        <LoadingBlock label="Loading product…" rows={6} />
      </>
    );
  }

  return (
    <form className="admin-editor" onSubmit={save} noValidate>
      <PageHeader
        eyebrow={isNew ? 'CATALOGUE · NEW' : 'CATALOGUE · EDIT'}
        title={isNew ? 'New product' : form.title || 'Untitled product'}
        description={
          isNew
            ? 'New products start as drafts, so nothing half-finished reaches the storefront.'
            : `Editing /${slug} · updated ${formatDateTime(data?.updatedAt)}`
        }
        back={<Link to="/admin/products">← All products</Link>}
        actions={
          <>
            <StatusPill status={form.status} />
            <button type="submit" className="admin-btn admin-btn-primary" disabled={!canWrite || saving}>
              {saving ? 'Saving…' : isNew ? 'Create product' : 'Save changes'}
            </button>
          </>
        }
      />

      {!canWrite ? (
        <div className="admin-alert admin-alert-info">
          Your role can read the catalogue but not change it. The API enforces the same rule, so these fields
          are disabled.
        </div>
      ) : null}

      <div className="admin-editor-grid">
        <div className="admin-editor-main">
          <FormSection title="Identity" description="How the product is identified in the catalogue and in its URL.">
            <FormGrid>
              <FormField label="Title" required error={errors.title}>
                <input
                  className="admin-input"
                  value={form.title}
                  onChange={(event) => changeTitle(event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField
                label="Slug"
                required
                error={errors.slug}
                hint="Public product id. Changing it breaks existing links."
              >
                <input
                  className="admin-input admin-mono"
                  value={form.slug}
                  onChange={(event) => changeSlug(event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="SKU" hint="Optional, unique across the catalogue.">
                <input
                  className="admin-input admin-mono"
                  value={form.sku}
                  onChange={(event) => setField('sku', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Barcode">
                <input
                  className="admin-input admin-mono"
                  value={form.barcode}
                  onChange={(event) => setField('barcode', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField
                label="Category"
                required
                error={errors.category}
                hint="Free text; suggestions come from the categories that exist."
              >
                <input
                  className="admin-input"
                  list="admin-category-suggestions"
                  value={form.category}
                  onChange={(event) => setField('category', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Sub-category">
                <input
                  className="admin-input"
                  value={form.subCategory}
                  onChange={(event) => setField('subCategory', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Brand">
                <input
                  className="admin-input"
                  value={form.brand}
                  onChange={(event) => setField('brand', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Tags" hint="Comma separated, e.g. Natural, Gifting.">
                <input
                  className="admin-input"
                  value={form.tags}
                  onChange={(event) => setField('tags', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
            </FormGrid>
            <datalist id="admin-category-suggestions">
              {categoryNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </FormSection>

                    <FormSection
            title="Content"
            description="Storefront copy and imagery. Image fields hold filenames served from /assets."
          >
            <FormGrid columns={1}>
              <FormField label="Card description" required error={errors.description}>
                <input
                  className="admin-input"
                  value={form.description}
                  onChange={(event) => setField('description', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Short description">
                <input
                  className="admin-input"
                  value={form.shortDescription}
                  onChange={(event) => setField('shortDescription', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Full description">
                <textarea
                  className="admin-input admin-textarea"
                  rows={5}
                  value={form.fullDescription}
                  onChange={(event) => setField('fullDescription', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Primary image" required error={errors.image} hint="For example almonds_ze0A.jpg">
                <input
                  className="admin-input admin-mono"
                  value={form.image}
                  onChange={(event) => setField('image', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Gallery images" hint="One filename per line.">
                <textarea
                  className="admin-input admin-mono admin-textarea"
                  rows={3}
                  value={form.images}
                  onChange={(event) => setField('images', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormGrid>
                <FormField label="SEO title">
                  <input
                    className="admin-input"
                    value={form.seoTitle}
                    onChange={(event) => setField('seoTitle', event.target.value)}
                    disabled={!canWrite}
                  />
                </FormField>
                <FormField label="SEO description">
                  <input
                    className="admin-input"
                    value={form.seoDescription}
                    onChange={(event) => setField('seoDescription', event.target.value)}
                    disabled={!canWrite}
                  />
                </FormField>
              </FormGrid>
            </FormGrid>
          </FormSection>

                    <FormSection
            title="Commerce"
            description="All amounts are stored as integer paise; the API is authoritative for what a customer pays."
          >
            <FormGrid>
              <FormField label="Selling price (₹)" required error={errors.price} hint="The price for the default pack.">
                <input
                  className="admin-input admin-mono"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) => setField('price', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="MRP (₹)" error={errors.mrp} hint="Optional. Shown struck through when above the selling price.">
                <input
                  className="admin-input admin-mono"
                  inputMode="decimal"
                  value={form.mrp}
                  onChange={(event) => setField('mrp', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Discount (%)" hint="Stored as basis points (12% → 1200).">
                <input
                  className="admin-input admin-mono"
                  inputMode="decimal"
                  value={form.discountPercent}
                  onChange={(event) => setField('discountPercent', event.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Status" hint={productStatusMeta(form.status).hint}>
                <select
                  className="admin-input"
                  value={form.status}
                  onChange={(event) => setField('status', event.target.value)}
                  disabled={!canWrite}
                >
                  {PRODUCT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {productStatusMeta(status).label}
                    </option>
                  ))}
                </select>
              </FormField>
            </FormGrid>

            <div className="admin-check-row">
              <CheckboxField
                label="Active"
                hint="Visible to the storefront. Drafts and inactive products are not."
                checked={form.isActive}
                onChange={(checked) => setField('isActive', checked)}
                disabled={!canWrite}
              />
              <CheckboxField
                label="Featured"
                checked={form.isFeatured}
                onChange={(checked) => setField('isFeatured', checked)}
                disabled={!canWrite}
              />
              <CheckboxField
                label="Bestseller"
                checked={form.isBestseller}
                onChange={(checked) => setField('isBestseller', checked)}
                disabled={!canWrite}
              />
              <CheckboxField
                label="New arrival"
                checked={form.isNewArrival}
                onChange={(checked) => setField('isNewArrival', checked)}
                disabled={!canWrite}
              />
            </div>
          </FormSection>

                    <FormSection
            title="Packs"
            description="Each pack is a sellable variant with its own price and stock. Storefront quotes are built from these rows."
            aside={
              canWrite ? (
                <button type="button" className="admin-btn admin-btn-ghost" onClick={addVariant}>
                  + Add pack
                </button>
              ) : null
            }
          >
            {errors.variants ? (
              <p className="admin-field-error" role="alert">
                {errors.variants}
              </p>
            ) : null}

            <div className="admin-variants">
              <div className="admin-variant-head">
                <span>Size</span>
                <span>Price (₹)</span>
                <span>MRP (₹)</span>
                <span>{isNew ? 'Opening stock' : 'Stock'}</span>
                <span>Low-stock at</span>
                <span>Weight (g)</span>
                <span>Live</span>
                <span aria-hidden="true" />
              </div>

              {form.variants.map((variant, index) => (
                <div className="admin-variant-row" key={`variant-${index}`}>
                  <input
                    className="admin-input"
                    value={variant.size}
                    placeholder="250g"
                    onChange={(event) => setVariant(index, 'size', event.target.value)}
                    disabled={!canWrite}
                  />
                  <input
                    className="admin-input admin-mono"
                    inputMode="decimal"
                    value={variant.price}
                    onChange={(event) => setVariant(index, 'price', event.target.value)}
                    disabled={!canWrite}
                  />
                  <input
                    className="admin-input admin-mono"
                    inputMode="decimal"
                    value={variant.mrp}
                    onChange={(event) => setVariant(index, 'mrp', event.target.value)}
                    disabled={!canWrite}
                  />
                  {isNew ? (
                    <input
                      className="admin-input admin-mono"
                      inputMode="numeric"
                      value={variant.stock}
                      onChange={(event) => setVariant(index, 'stock', event.target.value)}
                      disabled={!canWrite}
                    />
                  ) : (
                    <span className="admin-variant-static">
                      <b>{variant.stock}</b>
                      <small>inventory only</small>
                    </span>
                  )}
                  <input
                    className="admin-input admin-mono"
                    inputMode="numeric"
                    value={variant.lowStockLimit}
                    onChange={(event) => setVariant(index, 'lowStockLimit', event.target.value)}
                    disabled={!canWrite}
                  />
                  <input
                    className="admin-input admin-mono"
                    inputMode="numeric"
                    value={variant.weightGrams}
                    onChange={(event) => setVariant(index, 'weightGrams', event.target.value)}
                    disabled={!canWrite}
                  />
                  <label className="admin-check admin-check-compact">
                    <input
                      type="checkbox"
                      checked={variant.isActive}
                      onChange={(event) => setVariant(index, 'isActive', event.target.checked)}
                      disabled={!canWrite}
                    />
                    <span>Live</span>
                  </label>
                  <button
                    type="button"
                    className="admin-icon-btn"
                    onClick={() => removeVariant(index)}
                    disabled={!canWrite || form.variants.length <= 1}
                    aria-label={`Remove pack ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <p className="admin-hint">
              {isNew
                ? 'Opening stock seeds the first balance. Every later change goes through an inventory movement, so this field is read-only once the product exists.'
                : 'Stock balances are read-only here. The adjustment screen arrives with the inventory module; until then a balance moves only through inventory movements.'}
            </p>
          </FormSection></div>
        <aside className="admin-editor-aside">
          <div className="admin-preview">
            {form.image ? (
              <img className="admin-preview-image" src={assetUrl(form.image)} alt="" />
            ) : (
              <div className="admin-preview-empty">No image yet</div>
            )}
            <p className="admin-eyebrow">STOREFRONT PREVIEW</p>
            <h3>{form.title || 'Untitled product'}</h3>
            <p className="admin-muted">{form.description || 'No card description yet.'}</p>
            <p className="admin-preview-price">
              <b>{formatPaise(rupeesToPaise(form.price))}</b>
              {form.mrp !== '' && rupeesToPaise(form.mrp) > rupeesToPaise(form.price) ? (
                <s>{formatPaise(rupeesToPaise(form.mrp))}</s>
              ) : null}
            </p>
            <div className="admin-row-actions">
              <StatusPill status={form.status} />
              <Pill tone="muted">{form.variants.length === 1 ? '1 pack' : `${form.variants.length} packs`}</Pill>
              {form.isFeatured ? <Pill tone="info">Featured</Pill> : null}
            </div>
          </div>

          {isNew ? (
            <Card title="Creating a product" description="The API requires the fields below — the form blocks the save until they exist.">
              <ul className="admin-list">
                <li>Title, slug, card description, category and a primary image.</li>
                <li>A selling price above zero, plus at least one pack size.</li>
                <li>The product is created as a draft; switch Status to Active to publish it.</li>
              </ul>
            </Card>
          ) : (
            <Card title="Product actions" description="Both actions are recorded against your admin account.">
              <div className="admin-stack-tight">
                <button
                  type="button"
                  className="admin-btn admin-btn-ghost admin-btn-block"
                  onClick={duplicate}
                  disabled={!canWrite || busy}
                >
                  Duplicate as draft
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-quiet admin-btn-block"
                  onClick={deactivate}
                  disabled={!canWrite || busy || form.isActive === false}
                >
                  Deactivate product
                </button>
              </div>
              <dl className="admin-meta-list">
                <div>
                  <dt>Created</dt>
                  <dd>{formatDateTime(data?.createdAt)}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDateTime(data?.updatedAt)}</dd>
                </div>
                <div>
                  <dt>Document id</dt>
                  <dd className="admin-mono">{data?._id ?? '—'}</dd>
                </div>
              </dl>
            </Card>
          )}</aside>
      </div>

      <div className="admin-editor-savebar">
        <span className={dirty ? 'admin-dirty admin-dirty-on' : 'admin-dirty'}>
          {dirty ? 'Unsaved changes' : isNew ? 'Nothing saved yet' : 'All changes saved'}
        </span>
        <div className="admin-row-actions">
          <Link className="admin-btn admin-btn-ghost" to="/admin/products">
            Cancel
          </Link>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={!canWrite || saving}>
            {saving ? 'Saving…' : isNew ? 'Create product' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}
