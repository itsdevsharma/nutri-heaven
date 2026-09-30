import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckboxField, FormField, FormGrid, FormSection } from '../components/FormField.jsx';
import { ErrorState, LoadingBlock } from '../components/Feedback.jsx';
import { Card, PageHeader } from '../components/PageHeader.jsx';
import { Pill, StatusPill } from '../components/StatusPill.jsx';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { adminApi, API_URL } from '../lib/api.js';
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
import { StorefrontPreview } from '../components/StorefrontPreview.jsx';
import { ImageCropper } from '../components/ImageCropper.jsx';
import { Modal } from '../components/Modal.jsx';
import { categoryOptions } from '../lib/catalogue.js';

function blankVariant() {
  return { size: '', price: '', mrp: '', sku: '', barcode: '', taxPercent: '', stock: '0', lowStockLimit: '0', weightGrams: '', images: [], isActive: true };
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
    images: [],
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
  const gallery = (product.images ?? []).map((image, position) => typeof image === 'string' ? { url: image, alt: product.title ?? '', position } : { url: image.url, alt: image.alt ?? '', position: image.position ?? position });
  if (product.image && !gallery.some((image) => image.url === product.image)) gallery.unshift({ url: product.image, alt: product.title ?? '', position: 0 });
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
    images: gallery.map((image, position) => ({ ...image, position })),
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
      sku: variant.sku ?? '',
      barcode: variant.barcode ?? '',
      taxPercent: basisPointsToPercent(variant.taxBasisPoints),
      stock: String(variant.stockQuantity ?? 0),
      lowStockLimit: String(variant.lowStockLimit ?? 0),
      weightGrams:
        variant.weightGrams === undefined || variant.weightGrams === null ? '' : String(variant.weightGrams),
      images: variant.images ?? [],
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
 * opening balance — the one moment a balance legitimately starts.
 */
function buildPayload(form, { isNew, sourceVariants }) {
  const variants = form.variants.map((variant, index) => ({
    size: variant.size.trim(),
    pricePaise: rupeesToPaise(variant.price),
    mrpPaise: variant.mrp === '' ? undefined : rupeesToPaise(variant.mrp),
    sku: variant.sku.trim() || undefined,
    barcode: variant.barcode.trim() || undefined,
    taxBasisPoints: variant.taxPercent === '' ? 0 : percentToBasisPoints(variant.taxPercent),
    lowStockLimit: toNumber(variant.lowStockLimit),
    weightGrams: variant.weightGrams === '' ? undefined : toNumber(variant.weightGrams),
    images: variant.images ?? [],
    isActive: variant.isActive,
    stockQuantity: isNew ? toNumber(variant.stock) : toNumber(sourceVariants?.[index]?.stockQuantity),
  }));
  // Variants are the pricing source of truth. The legacy product-level amounts
  // remain populated for public-card compatibility, derived from the least
  // expensive active pack rather than independently maintained by an operator.
  const defaultPack = variants.filter((variant) => variant.isActive && variant.pricePaise > 0).sort((a, b) => a.pricePaise - b.pricePaise)[0];
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
    pricePaise: defaultPack?.pricePaise ?? rupeesToPaise(form.price),
    mrpPaise: defaultPack?.mrpPaise,
    discountBasisPoints: 0,
    image: form.image.trim(),
    images: (form.images ?? []).map((image, position) => ({ url: image.url, alt: image.alt?.trim() || form.title.trim(), position })),
    tags: splitList(form.tags),
    seoTitle: form.seoTitle.trim(),
    seoDescription: form.seoDescription.trim(),
    status: form.status,
    isActive: form.isActive,
    isFeatured: form.isFeatured,
    isBestseller: form.isBestseller,
    isNewArrival: form.isNewArrival,
    variants,
  };
}

/** Mirrors the fields `ProductsService.adminCreate` refuses to create without. */
function validate(form) {
  const errors = {};
  if (!form.title.trim()) errors.title = 'A product title is required.';
  if (!form.slug.trim()) errors.slug = 'A slug is required — it is the public product id used by the storefront.';
  else if (!/^[a-z0-9-]+$/.test(form.slug.trim())) errors.slug = 'Use lowercase letters, numbers and hyphens only.';
  if (!form.description.trim()) errors.description = 'A short description is required.';
  if (!form.image.trim()) errors.image = 'A primary image filename is required, e.g. almonds_ze0A.jpg.';
  if (!form.variants.length) errors.variants = 'At least one pack size is required.';
  else if (form.variants.some((variant) => !variant.size.trim())) errors.variants = 'Every pack needs a size label.';
  else if (new Set(form.variants.map((variant) => variant.size.trim().toLowerCase())).size !== form.variants.length) errors.variants = 'Pack sizes must be unique.';
  else if (form.variants.some((variant) => variant.price === '' || rupeesToPaise(variant.price) <= 0)) errors.variants = 'Every pack needs a selling price above zero.';
  else if (form.variants.some((variant) => variant.mrp !== '' && rupeesToPaise(variant.mrp) < rupeesToPaise(variant.price))) errors.variants = 'A pack MRP cannot be below its selling price.';
  else { const skus = form.variants.map((variant) => variant.sku.trim().toUpperCase()).filter(Boolean); if (new Set(skus).size !== skus.length) errors.variants = 'Variant SKUs must be unique.'; }
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
  const [uploading, setUploading] = useState(false);
  const [cropTarget, setCropTarget] = useState(null);
  const [altEditor, setAltEditor] = useState(null);
  const [variantImageEditor, setVariantImageEditor] = useState(null);

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
  const defaultPack = useMemo(() => form.variants.filter((variant) => variant.isActive && rupeesToPaise(variant.price) > 0).sort((a, b) => rupeesToPaise(a.price) - rupeesToPaise(b.price))[0] ?? null, [form.variants]);

  /**
   * Category names for the suggestions datalist. `Product.category` is a string
   * label rather than a reference, so the console offers the labels that already
   * exist instead of letting a typo invent a new one.
   */
  const categories = useResource(() => adminApi.categories.list(), []);
  const categoryChoices = useMemo(() => categoryOptions((categories.data ?? []).filter((category) => category.isActive !== false)), [categories.data]);
  const categoryNames = categoryChoices.map((category) => category.name);
  const subCategoryChoices = useMemo(() => { const parent = (categories.data ?? []).find((category) => category.name === form.category); return parent ? (categories.data ?? []).filter((category) => String(category.parentId) === String(parent._id) && category.isActive !== false) : []; }, [categories.data, form.category]);

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

  const uploadImage = async (event, destination = 'primary') => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map((file) => adminApi.cms.uploadImage(file)));
      const urls = uploaded.map((result) => result.url.startsWith('http') ? result.url : `${API_URL}${result.url}`);
      setForm((current) => destination === 'primary'
        ? { ...current, image: urls[0], images: [{ url: urls[0], alt: current.title, position: 0 }, ...current.images.filter((image) => image.url !== urls[0]).map((image, position) => ({ ...image, position: position + 1 }))] }
        : { ...current, images: [...current.images, ...urls.filter((url) => !current.images.some((image) => image.url === url)).map((url, position) => ({ url, alt: current.title, position: current.images.length + position }))] });
      setDirty(true);
      const saved = uploaded.reduce((total, result) => total + Math.max(0, Number(result.originalBytes) - Number(result.optimisedBytes)), 0);
      toast.success(`${destination === 'primary' ? 'Primary image' : `${urls.length} gallery image${urls.length === 1 ? '' : 's'}`} uploaded${saved ? ` and optimised (${Math.round(saved / 1024)} KB saved)` : ''}.`);
    } catch (failure) { toast.error(failure.message); }
    finally { setUploading(false); }
  };

  const saveCrop = async (file) => {
    if (!cropTarget) return; setUploading(true);
    try { const result = await adminApi.cms.uploadImage(file); const url = result.url.startsWith('http') ? result.url : `${API_URL}${result.url}`; setForm((current) => ({ ...current, image: current.image === cropTarget ? url : current.image, images: current.images.map((image) => image.url === cropTarget ? { ...image, url } : image) })); setDirty(true); setCropTarget(null); toast.success('Cropped image uploaded and applied.'); } catch (failure) { toast.error(failure.message); } finally { setUploading(false); }
  };

  const save = async (event) => {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error('Fix the highlighted fields before saving.');
      return;
    }
    if (form.status === 'active') {
      const activeVariants = form.variants.filter((variant) => variant.isActive);
      const warnings = [!form.seoTitle.trim() && 'SEO title is empty', !form.seoDescription.trim() && 'SEO description is empty'].filter(Boolean);
      if (!form.image || !activeVariants.some((variant) => rupeesToPaise(variant.price) > 0)) { toast.error('Publishing requires a primary image and an active priced variant.'); return; }
      if (!activeVariants.some((variant, index) => Number(isNew ? variant.stock : sourceVariants.current[index]?.stockQuantity) > 0)) { toast.error('Publishing requires an active variant with stock. Adjust existing stock in Inventory.'); return; }
      const accepted = await confirm({ title: 'Publish this product?', message: warnings.length ? `Publishing checks passed. Warning: ${warnings.join('; ')}.` : 'Publishing checks passed: image, price and stock are present.', confirmLabel: 'Publish' });
      if (!accepted) return;
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
                hint={`Public URL: /products/${form.slug || 'your-product'} · Canonical: ${window.location.origin}/products/${form.slug || 'your-product'}`}
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
                hint="Only active categories can be selected."
              >
                <select
                  className="admin-input"
                  value={form.category}
                  onChange={(event) => { setField('category', event.target.value); setField('subCategory', ''); }}
                  disabled={!canWrite}
                ><option value="">Select category</option>{categoryChoices.map((category) => <option key={category.id} value={category.name}>{'— '.repeat(category.depth)}{category.name}</option>)}</select>
              </FormField>
              <FormField label="Sub-category">
                <select
                  className="admin-input"
                  value={form.subCategory}
                  onChange={(event) => setField('subCategory', event.target.value)}
                  disabled={!canWrite}
                ><option value="">No sub-category</option>{subCategoryChoices.map((category) => <option key={category._id} value={category.name}>{category.name}</option>)}</select>
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
          </FormSection>

                    <FormSection
            title="Content"
            description="Upload product photos or use an existing asset filename. The first image is shown on product cards."
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
              <FormField label="Primary image" required error={errors.image} hint="Recommended: 4:3 landscape (e.g. 1600 × 1200 px), JPEG/PNG/WebP. Upload up to 12 MB; it is automatically rotated, resized to a max 1600 px edge, and compressed to WebP quality 82.">
                <input
                  className="admin-input admin-mono"
                  value={form.image}
                  onChange={(event) => setField('image', event.target.value)}
                  disabled={!canWrite}
                />
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadImage(event, 'primary')} disabled={!canWrite || uploading} />
              </FormField>
              <FormField label="Gallery images" hint="Drag to reorder. Choose a primary image, edit accessible alt text, or remove an image. Uploads are optimised to WebP (max 1600 px edge, quality 82).">
                <div className="admin-image-gallery">
                  {form.images.map((image, index) => <div className="admin-image-tile" key={`${image.url}-${index}`} draggable={canWrite} onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const from = Number(event.dataTransfer.getData('text/plain')); if (!Number.isInteger(from) || from === index) return; setForm((current) => { const images = [...current.images]; const [moved] = images.splice(from, 1); images.splice(index, 0, moved); return { ...current, images: images.map((item, position) => ({ ...item, position })) }; }); setDirty(true); }}>
                    <img src={assetUrl(image.url)} alt={image.alt || ''} />
                    <div className="admin-image-tile-actions"><button type="button" className="admin-btn admin-btn-small" disabled={!canWrite || form.image === image.url} onClick={() => setField('image', image.url)}>{form.image === image.url ? 'Primary' : 'Make primary'}</button><button type="button" className="admin-btn admin-btn-small admin-btn-ghost" disabled={!canWrite} onClick={() => setCropTarget(image.url)}>Crop</button><button type="button" className="admin-btn admin-btn-small admin-btn-ghost" disabled={!canWrite} onClick={() => setAltEditor({ index, value: image.alt ?? '' })}>Alt text</button><button type="button" className="admin-btn admin-btn-small admin-btn-quiet" disabled={!canWrite} onClick={() => setForm((current) => ({ ...current, image: current.image === image.url ? (current.images.find((item, position) => position !== index)?.url ?? '') : current.image, images: current.images.filter((_, position) => position !== index).map((item, position) => ({ ...item, position })) }))}>Delete</button></div>
                  </div>)}
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => uploadImage(event, 'gallery')} disabled={!canWrite || uploading} />
              </FormField>
              <FormGrid>
                <FormField label={`SEO title (${form.seoTitle.length}/60)`}>
                  <input
                    className="admin-input"
                    value={form.seoTitle}
                    onChange={(event) => setField('seoTitle', event.target.value)}
                    disabled={!canWrite}
                  />
                </FormField>
                <FormField label={`SEO description (${form.seoDescription.length}/160)`}>
                  <input
                    className="admin-input"
                    value={form.seoDescription}
                    onChange={(event) => setField('seoDescription', event.target.value)}
                    disabled={!canWrite}
                  />
                </FormField>
              </FormGrid>
              <div className="admin-seo-preview" aria-label="Search result preview">
                <small>SEARCH RESULT PREVIEW</small>
                <a href={`/products/${form.slug || 'your-product'}`} onClick={(event) => event.preventDefault()}>{form.seoTitle || form.title || 'Product title'}</a>
                <code>{window.location.origin}/products/{form.slug || 'your-product'}</code>
                <p>{form.seoDescription || form.description || 'Product description will appear here.'}</p>
              </div>
            </FormGrid>
          </FormSection>

                    <FormSection
            title="Selling model"
            description="Pack variants are the single source of truth for customer pricing. Product-level prices are derived automatically for catalogue-card compatibility."
          >
            <FormGrid>
              <div className="admin-pricing-rule admin-field-span-2">
                <b>Customer price comes from Packs</b>
                <p>{defaultPack ? <>Default display pack: <strong>{defaultPack.size}</strong> at <strong>{formatPaise(rupeesToPaise(defaultPack.price))}</strong>{defaultPack.mrp && rupeesToPaise(defaultPack.mrp) > rupeesToPaise(defaultPack.price) ? <> · MRP <s>{formatPaise(rupeesToPaise(defaultPack.mrp))}</s></> : null}.</> : 'Add an active pack with a selling price below. Its price becomes the default catalogue display price.'}</p>
                <small>Enter each pack’s selling price and optional MRP once in the Packs section. The checkout always uses the pack selected by the customer; product-level price fields are no longer independently editable.</small>
              </div>
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
                <span>SKU</span>
                <span>Barcode</span>
                <span>Tax (%)</span>
                <span>{isNew ? 'Opening stock' : 'Stock'}</span>
                <span>Low-stock at</span>
                <span>Weight (g)</span>
                <span>Images</span>
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
                  <input className="admin-input admin-mono" value={variant.sku} placeholder="Optional" onChange={(event) => setVariant(index, 'sku', event.target.value)} disabled={!canWrite} />
                  <input className="admin-input admin-mono" value={variant.barcode} placeholder="Optional" onChange={(event) => setVariant(index, 'barcode', event.target.value)} disabled={!canWrite} />
                  <input className="admin-input admin-mono" inputMode="decimal" value={variant.taxPercent} placeholder="0" onChange={(event) => setVariant(index, 'taxPercent', event.target.value)} disabled={!canWrite} />
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
                  <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" disabled={!canWrite} onClick={() => setVariantImageEditor({ index, selected: variant.images ?? [] })}>Images ({(variant.images ?? []).length})</button>
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
          <StorefrontPreview form={form} />

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
                {form.status === 'archived' ? <button type="button" className="admin-btn admin-btn-ghost admin-btn-block" onClick={() => adminApi.products.recover(slug, 'draft').then(reload).catch((failure) => toast.error(failure.message))} disabled={!canWrite || busy}>Recover as draft</button> : <button type="button" className="admin-btn admin-btn-quiet admin-btn-block" onClick={() => adminApi.products.archive(slug).then(reload).catch((failure) => toast.error(failure.message))} disabled={!canWrite || busy}>Archive product</button>}
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
      <ImageCropper open={Boolean(cropTarget)} source={cropTarget} onClose={() => setCropTarget(null)} onSave={saveCrop} />
      <Modal open={Boolean(altEditor)} title="Image alt text" description="Describe the image for screen-reader users and search engines." onClose={() => setAltEditor(null)} size="sm" footer={<><button type="button" className="admin-btn admin-btn-ghost" onClick={() => setAltEditor(null)}>Cancel</button><button type="button" className="admin-btn admin-btn-primary" onClick={() => { setForm((current) => ({ ...current, images: current.images.map((image, index) => index === altEditor.index ? { ...image, alt: altEditor.value } : image) })); setDirty(true); setAltEditor(null); }}>Save alt text</button></>}><label className="admin-field-label">Alt text<input className="admin-input" autoFocus value={altEditor?.value ?? ''} onChange={(event) => setAltEditor((current) => ({ ...current, value: event.target.value }))} /></label></Modal>
      <Modal open={Boolean(variantImageEditor)} title="Variant images" description="Select gallery images shown for this pack." onClose={() => setVariantImageEditor(null)} size="md" footer={<><button type="button" className="admin-btn admin-btn-ghost" onClick={() => setVariantImageEditor(null)}>Cancel</button><button type="button" className="admin-btn admin-btn-primary" onClick={() => { setVariant(variantImageEditor.index, 'images', variantImageEditor.selected); setVariantImageEditor(null); }}>Save selection</button></>}><div className="admin-image-selector">{[form.image, ...form.images.map((image) => image.url)].filter(Boolean).map((url) => <label key={url} className="admin-image-selector-item"><img src={assetUrl(url)} alt="" /><span><input type="checkbox" checked={variantImageEditor?.selected.includes(url) ?? false} onChange={(event) => setVariantImageEditor((current) => ({ ...current, selected: event.target.checked ? [...current.selected, url] : current.selected.filter((image) => image !== url) }))} /> Use this image</span></label>)}</div></Modal>
    </form>
  );
}
