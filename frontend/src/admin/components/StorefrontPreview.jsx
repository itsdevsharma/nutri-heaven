import { useState } from 'react';
import { assetUrl } from '../lib/catalogue.js';
import { formatPaise, rupeesToPaise } from '../lib/format.js';

export function StorefrontPreview({ form }) {
  const [selected, setSelected] = useState(0);
  const galleryImages = Array.isArray(form.images)
    ? form.images
    : String(form.images ?? '').split('\n').map((image) => image.trim()).filter(Boolean);
  const gallery = [form.image, ...galleryImages.map((image) => typeof image === 'string' ? image : image.url)].filter(Boolean);
  const activeVariants = (form.variants ?? []).filter((variant) => variant.isActive);
  const defaultPack = [...activeVariants].filter((variant) => rupeesToPaise(variant.price) > 0).sort((a, b) => rupeesToPaise(a.price) - rupeesToPaise(b.price))[0];
  const price = defaultPack ? rupeesToPaise(defaultPack.price) : rupeesToPaise(form.price);
  const mrp = defaultPack ? rupeesToPaise(defaultPack.mrp) : rupeesToPaise(form.mrp);
  return <section className="admin-storefront-preview" aria-label="Storefront preview">
    <p className="admin-eyebrow">LIVE STOREFRONT PREVIEW</p>
    {gallery.length ? <img className="sf-image" src={assetUrl(gallery[selected] ?? gallery[0])} alt={form.title || 'Product preview'} /> : <div className="admin-preview-empty">No image yet</div>}
    {gallery.length > 1 ? <div className="sf-thumbnails">{gallery.map((image, index) => <button type="button" key={`${image}-${index}`} className={index === selected ? 'sf-thumb sf-thumb-active' : 'sf-thumb'} onClick={() => setSelected(index)}><img src={assetUrl(image)} alt="" /></button>)}</div> : null}
    <div className="sf-badges">{form.category ? <span>{form.category}</span> : null}{form.subCategory ? <span>{form.subCategory}</span> : null}{form.isFeatured ? <span>Featured</span> : null}{form.isBestseller ? <span>Bestseller</span> : null}{form.isNewArrival ? <span>New arrival</span> : null}</div>
    <h3>{form.title || 'Untitled product'}</h3>
    <p className="sf-price">{formatPaise(price)} {mrp > price ? <strike>{formatPaise(mrp)}</strike> : null}</p>
    <p className="admin-muted">{form.shortDescription || form.description || 'No product description yet.'}</p>
    <select className="admin-input" disabled value={activeVariants[0]?.size ?? ''} onChange={() => {}} aria-label="Pack size preview"><option value="">Select pack</option>{activeVariants.map((variant) => <option key={variant.size} value={variant.size}>{variant.size}</option>)}</select>
    <button type="button" className="admin-btn admin-btn-primary admin-btn-block" disabled>Add to cart</button>
  </section>;
}
