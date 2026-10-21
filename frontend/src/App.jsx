import OrderConfirmation from './OrderConfirmation.jsx';
import { DEFAULT_FAQS } from './defaultFaqs.js';
import { NewsletterForm, NewsletterAction } from './customer/Newsletter.jsx';
import Reviews from './customer/Reviews.jsx';
import WishlistButton from './customer/WishlistButton.jsx';
import Account from './customer/Account.jsx';
import { openRazorpay, readPendingCheckout, savePendingCheckout } from './razorpay.js';
import { updateSeo } from './seo.js';
import { initializeMetaPixel, trackMetaEvent, commerceData, trackProductView, trackPurchase } from './meta-pixel.js';
import { useEffect, useMemo, useState } from 'react';
import { cartApi, cartId, customerApi, storefrontApi, paymentsApi } from './cart-api.js';

const asset = '/assets/';
const money = (paise = 0) => `₹${(paise / 100).toLocaleString('en-IN')}`;
const image = (value = '') => value.startsWith('/') || value.startsWith('http') ? value : `${asset}${value}`;
const cmsImage = (value = '') => value.startsWith('http') ? value : `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}${value.startsWith('/') ? value : `/${value}`}`;
const homeCategories = [['cat-dryfruits_ze0A.jpg', 'Dry Fruits'], ['cat-nuts_ze0A.jpg', 'Premium Nuts'], ['cat-seeds_ze0A.png', 'Super Seeds'], ['cat-spices_ze0A.png', 'Whole Spices']];

function Header({ count, cart }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  return (
    <header className="nav">
      <a className="brand" href="/" aria-label="Nutri Heaven home">
        <img src="/assets/nutri-heaven-logo.jpeg" alt="" width="58" height="58" />
        <span>NUTRI HEAVEN</span>
      </a>
      <nav id="store-navigation" aria-label="Main navigation" className={menuOpen ? 'open' : ''} onClick={() => setMenuOpen(false)}>
        <a href="/shop">Shop all</a><a href="/account">My account</a><a href="/#faq">FAQs</a>
      </nav>
      <div className="tools"><button className="bag" onClick={() => { setMenuOpen(false); cart(); }}>Bag <i>{count}</i></button></div>
      <button className="menu" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="store-navigation" onClick={() => setMenuOpen(current => !current)}>{menuOpen ? '×' : '☰'}</button>
    </header>
  );
}

function Footer({settings={}}) {
  const email = settings.supportEmail && settings.supportEmail !== "hello@nutriheaven.in" ? settings.supportEmail : "nutriheavenhsr@gmail.com";
  const phone = settings.supportPhone || "90172-25722";
  const whatsapp = settings.whatsappNumber || phone;
  const address = settings.address || "258, Siwach complex Bishnoi colony near HAU gate no. 4 (sec-15) Hisar";
  return <footer><div className="footer-top"><div className="footer-brand"><a className="footer-logo" href="/" aria-label="Nutri Heaven home"><img src="/assets/nutri-heaven-logo.jpeg" alt="" /><span>NUTRI HEAVEN</span></a><p>Thoughtfully selected dry fruits, nuts and seeds for better everyday rituals.</p><div className="footer-contact"><a href={"mailto:" + email}>{email}</a><a href={"tel:" + phone.replace(/[^0-9]/g,"")}>{phone}</a><a href={"https://wa.me/91" + whatsapp.replace(/[^0-9]/g,"")} target="_blank" rel="noreferrer">WhatsApp {whatsapp}</a><address>{address}</address>{settings.businessHours&&<small>{settings.businessHours}</small>}</div></div><div className="footer-links"><div><b>Shop</b><a href="/shop">All products</a><a href="/shop">Dry fruits</a><a href="/shop">Nuts & seeds</a></div><div><b>Support</b><a href="/#faq">FAQs</a><a href="/shipping-policy">Shipping policy</a><a href="/return-policy">Returns</a><a href="/privacy-policy">Privacy</a><a href="/terms">Terms</a></div></div><div><b>A note from our pantry</b><p>Fresh arrivals, pantry notes, and member-only offers.</p><NewsletterForm /></div></div><div className="footer-trust"><span>✓ FSSAI Registered</span><span>✓ Secure checkout</span><span>✓ Free delivery above ₹5,000</span></div><div className="footer-bottom"><span>© 2026 Nutri Heaven</span><a href="/NUTRI-HEAVEN-FSSAI-RC.pdf" target="_blank" rel="noreferrer">FSSAI certificate ↗</a></div></footer>; }


function CartDrawer({ data, products = [], busy, add, change, close, checkout, openProduct }) {
  const items = data?.items ?? [];
  return <aside className="drawer" aria-label="Shopping bag"><div className="drawer-head"><div><span className="eyebrow">YOUR BAG · {items.reduce((sum,item)=>sum+item.quantity,0)} ITEMS</span><h3>Goodness in Every Bite.</h3></div><button className="icon-button" onClick={close} aria-label="Close bag">×</button></div>{!items.length ? <div className="empty"><h3>Your bag is empty</h3><button className="button dark" onClick={close}>Continue shopping</button></div> : <><div className="cart-lines">{items.map((item, index) => { const variants = products.find(product => product.slug === item.productId)?.variants?.filter(v => v.isActive && v.stockQuantity > 0) ?? []; const otherVariants = variants.filter(variant => !items.some(line => line.productId === item.productId && line.packSize === variant.size)); return <div className="cart-line" key={`${item.productId}:${item.packSize}`}><button className="cart-item-image" onClick={() => openProduct(item.productId)} aria-label={`View ${item.productName}`}><img src={image(item.image)} alt={item.productName} /><span className="cart-image-preview" aria-hidden="true"><img src={image(item.image)} alt="" /></span></button><div className="line-info"><button className="cart-product-name" onClick={() => openProduct(item.productId)}>{item.productName}</button><p className="cart-pack">Pack size: {item.packSize}</p>{otherVariants.length > 0 && <label className="cart-pack">Add another pack<select disabled={busy} value="" onChange={event => { if (event.target.value) add(item.productId, event.target.value); }}><option value="">Choose a size</option>{otherVariants.map(variant=><option key={variant.size} value={variant.size}>{variant.size} · {money(variant.pricePaise)}</option>)}</select></label>}<p>{money(item.unitPricePaise)} each</p><div className="quantity"><button disabled={busy || item.quantity <= 1} onClick={() => change(index, item.quantity - 1, item.packSize)} aria-label="Decrease quantity">−</button><span>{item.quantity}</span><button disabled={busy} onClick={() => change(index, item.quantity + 1, item.packSize)} aria-label="Increase quantity">+</button></div><b className="cart-line-total">{money(item.unitPricePaise * item.quantity)}</b></div><button className="remove" disabled={busy} onClick={() => change(index, 0, item.packSize)} aria-label={`Remove ${item.productName}`}>Remove</button></div>; })}</div><div className="cart-summary"><p><span>Subtotal</span><b>{money(data.subtotalPaise)}</b></p><p><span>Delivery</span><b>{data.shippingPaise ? money(data.shippingPaise) : 'Free'}</b></p><p className="cart-total"><span>Total</span><b>{money(data.totalPaise)}</b></p><button className="checkout-button" onClick={checkout}>Proceed to checkout →</button><button className="continue-shopping" onClick={close}>Continue shopping</button></div></>}</aside>;
}

function ProductDescription({ children }) {
  const [expanded, setExpanded] = useState(false);
  const fallbackDescriptions = {
    'Crisp, buttery and naturally wholesome': 'California almonds are selected for their crisp bite, buttery flavour and naturally satisfying texture. Enjoy them as an everyday snack, add them to breakfast bowls, blend them into smoothies, or use them in baking. Store in a cool, dry place and reseal after opening to help keep every handful fresh.',
    'Jumbo, golden and full of flavour': 'These jumbo cashews are gently roasted to bring out their rich, creamy flavour and delicate crunch. They are an easy addition to snack platters, curries, desserts and homemade trail mixes. Keep the pack tightly sealed between servings for the best flavour and texture.',
    'Caramel-rich, soft and satisfyingly sweet': 'Medjool dates are prized for their soft texture, caramel-like sweetness and generous size. Serve them as a naturally sweet snack, stuff them with nuts, or chop them into energy bites, cakes and breakfast recipes. Their rich flavour makes a small handful feel especially satisfying.',
  };
  const description = fallbackDescriptions[children] ?? children;
  return <div className="product-description-toggle"><p className={expanded ? 'expanded' : ''}>{description}</p>{String(description ?? '').length > 120 && <button type="button" onClick={() => setExpanded(!expanded)}>{expanded ? 'See less' : 'See more…'}</button>}</div>;
}

function ProductModal({ product, close, add, whatsappNumber = '90172-25722' }) {
  const [size,setSize] = useState(product?.variants?.find(v=>v.isActive)?.size ?? '');
  const [selectedImage, setSelectedImage] = useState(product?.image ?? '');
  useEffect(() => { setSize(product?.variants?.find(v=>v.isActive)?.size ?? ''); setSelectedImage(product?.image ?? ''); }, [product]);
  if (!product) return null;
  const variants = (product.variants ?? []).filter(v=>v.isActive); const selected = variants.find(v=>v.size===size);
  // Admin gallery entries carry URL/alt/position metadata; legacy records are
  // strings. Storefront rendering accepts both during the migration window.
  const gallery = [...new Set([product.image, ...(product.images ?? []).map((entry) => typeof entry === 'string' ? entry : entry?.url)].filter(Boolean))];
  const rawWhatsAppPhone = String(whatsappNumber).replace(/\D/g, '');
  const whatsAppPhone = rawWhatsAppPhone.length === 10 ? `91${rawWhatsAppPhone}` : rawWhatsAppPhone.replace(/^0/, '91');
  const whatsAppMessage = `Hello Nutri Heaven, I would like to order ${product.title}${selected ? ` (${selected.size})` : ''}, quantity 1, for ${money(selected?.pricePaise ?? product.pricePaise)}.`;
  return <div className="product-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget) close();}}><section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title"><button className="product-modal-close" onClick={close} aria-label="Close product details">×</button><div className="product-modal-media"><img className="product-modal-image" src={image(selectedImage)} alt={product.title}/>{gallery.length>1&&<div className="product-gallery" aria-label="Product images">{gallery.map(photo=><button className={photo===selectedImage?'active':''} key={photo} onClick={()=>setSelectedImage(photo)} aria-label={`Show product image ${gallery.indexOf(photo)+1}`}><img src={image(photo)} alt="" /></button>)}</div>}</div><div className="product-modal-info"><WishlistButton slug={product.slug} /><p className="product-category">{product.category}{product.brand ? ` · ${product.brand}` : ''}</p><h2 id="product-modal-title">{product.title}</h2><ProductDescription>{product.fullDescription || product.description}</ProductDescription>{product.sku && <p className="product-meta"><b>SKU</b> {product.sku}</p>}{product.tags?.length>0&&<p className="product-meta"><b>Details</b> {product.tags.join(' · ')}</p>}<label className="pack-select">Pack size<select value={size} onChange={e=>setSize(e.target.value)}>{variants.map(v=><option key={v.size} value={v.size}>{v.size} · {money(v.pricePaise)} · {v.stockQuantity>0?`${v.stockQuantity} available`:'Out of stock'}</option>)}</select></label><div className="product-modal-price"><b>{money(selected?.pricePaise ?? product.pricePaise)}</b>{selected?.mrpPaise>selected?.pricePaise&&<s>{money(selected.mrpPaise)}</s>}</div><div className="product-policy-links"><a href="/shipping-policy" onClick={close}>Shipping policy</a><a href="/return-policy" onClick={close}>Returns & refunds</a></div><a className="whatsapp-order" href={`https://wa.me/${whatsAppPhone}?text=${encodeURIComponent(whatsAppMessage)}`} target="_blank" rel="noreferrer">Order on WhatsApp</a><button className="checkout-button" disabled={!selected || selected.stockQuantity<1} onClick={()=>{add(product.slug,size);close();}}>Add to bag</button><Reviews slug={product.slug} /></div></section></div>;
}

function ProductCard({ product, add, open }) {
  const variants = (product.variants ?? []).filter(v => v.isActive && v.stockQuantity > 0); const [size, setSize] = useState(variants[0]?.size ?? ''); const variant = variants.find(v => v.size === size);
  return <article className="shop-product"><WishlistButton slug={product.slug} /><button className="product-image-button" onClick={() => open(product)} aria-label={`View details for ${product.title}`}><img src={image(product.image)} alt={product.title} /></button><p className="product-category">{product.category}</p><h2><a className="product-title-link" href={"/products/"+encodeURIComponent(product.slug)}>{product.title}</a></h2><p className="product-description">{product.shortDescription || product.description}</p>{variants.length ? <label className="pack-select">Pack size <select value={size} onChange={e => setSize(e.target.value)}>{variants.map(v => <option key={v.size}>{v.size}</option>)}</select></label> : <p className="no-results">Out of stock</p>}<div className="shop-buy"><span>{money(variant?.pricePaise ?? product.pricePaise)}<small>{size && ` / ${size}`}</small></span><button disabled={!variant} onClick={() => add(product.slug, size)}>Add +</button></div></article>;
}


function Shop({ products, add, open, categories = [] }) {
  const requestedCategory = new URLSearchParams(location.search).get('category');
  const [category, setCategory] = useState(requestedCategory || 'All products'); const [query, setQuery] = useState(''); const [sort, setSort] = useState('Featured');
  const activeCategories = categories.filter(item => item.isActive !== false);
  const categoryRows = activeCategories.length ? activeCategories : [...new Set(products.map(p => p.category))].filter(Boolean).map(name => ({ name }));
  const byId = new Map(categoryRows.filter(item => item._id).map(item => [String(item._id), item]));
  const children = new Map();
  categoryRows.forEach(item => {
    const parentKey = item.parentId && byId.has(String(item.parentId)) ? String(item.parentId) : null;
    if (!children.has(parentKey)) children.set(parentKey, []);
    children.get(parentKey).push(item);
  });
  children.forEach(items => items.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name)));
  const cats = [];
  const visited = new Set();
  function visitCategory(item, depth = 0) {
    if (visited.has(item)) return;
    visited.add(item);
    cats.push({ ...item, depth });
    (children.get(String(item._id)) ?? []).forEach(child => visitCategory(child, depth + 1));
  }
  (children.get(null) ?? []).forEach(item => visitCategory(item));
  categoryRows.forEach(item => visitCategory(item));
  const [expandedCategories, setExpandedCategories] = useState({});
  const categoryAncestors = [];
  const categoryBranches = cats.map((item, index) => {
    categoryAncestors.length = item.depth;
    const ancestors = [...categoryAncestors];
    categoryAncestors[item.depth] = item.name;
    const hasChildren = cats[index + 1]?.depth > item.depth;
    const descendants = [];
    for (let next = index + 1; next < cats.length && cats[next].depth > item.depth; next++) descendants.push(cats[next].name);
    return { ...item, ancestors, hasChildren, containsSelection: descendants.includes(category) };
  });
  const isExpanded = item => expandedCategories[item.name] ?? item.containsSelection;
  const selectCategory = name => {
    setCategory(name); setPage(0);
    const selected = categoryBranches.find(item => item.name === name);
    if (selected) setExpandedCategories(current => ({ ...current, ...Object.fromEntries(selected.ancestors.map(ancestor => [ancestor, true])) }));
  };
  const [page, setPage] = useState(0);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setFailure('');
    const timer = setTimeout(() => {
      storefrontApi.browse({ q: query, category: category === 'All products' ? '' : category, sort: ({ Featured: 'featured', 'Price: low to high': 'price_asc', 'Price: high to low': 'price_desc' })[sort], limit: 24, offset: page * 24 })
        .then(data => { if (active) setResult(data); }).catch(error => { if (active) setFailure(error.message); }).finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [query, category, sort, page, retry]);
  const view = result.items;
  return <main className="shop-page"><section className="shop-banner"><p className="eyebrow">THE PANTRY EDIT</p><h1>Find your everyday<br /><em>favourite.</em></h1><p>Live catalogue prices and availability.</p></section><section className="catalogue"><aside className="shop-filters" aria-label="Browse product categories">
        <label className="shop-category-mobile">Browse by<select value={category} onChange={event => selectCategory(event.target.value)}><option value="All products">All products</option>{cats.map(c => <option key={c.name} value={c.name}>{`${"— ".repeat(c.depth)}${c.name}`}</option>)}</select></label>
        <nav className="shop-category-nav" aria-label="Product categories">
          <p className="eyebrow">BROWSE BY</p>
          <button type="button" className={`shop-category-all${category === 'All products' ? ' active' : ''}`} aria-current={category === 'All products' ? 'true' : undefined} onClick={() => selectCategory('All products')}>All products<span aria-hidden="true">→</span></button>
          <ul className="shop-category-list">{categoryBranches.map(c => {
            const visible = c.ancestors.every(name => isExpanded(categoryBranches.find(item => item.name === name)));
            return <li key={c.name} hidden={!visible} className={c.depth === 0 ? 'shop-category-root' : 'shop-category-child'} style={{ '--category-depth': c.depth }}>
              <div className="shop-category-row">
                <button type="button" className={category === c.name ? 'active' : ''} aria-current={category === c.name ? 'true' : undefined} onClick={() => selectCategory(c.name)}>{c.name}</button>
                {c.hasChildren && <button type="button" className="shop-category-toggle" aria-label={`${isExpanded(c) ? 'Collapse' : 'Expand'} ${c.name}`} aria-expanded={Boolean(isExpanded(c))} onClick={() => setExpandedCategories(current => ({ ...current, [c.name]: !isExpanded(c) }))}><span aria-hidden="true">{isExpanded(c) ? '−' : '+'}</span></button>}
              </div>
            </li>;
          })}</ul>
        </nav>
      </aside><div className="catalogue-products"><div className="catalogue-head"><label className="shop-search">⌕<input type="search" aria-label="Search products" value={query} onChange={e => (setQuery(e.target.value), setPage(0))} placeholder="Search products" /></label><span className="shop-result-count" aria-live="polite">{result.total} {result.total === 1 ? 'product' : 'products'}</span><label className="shop-sort"><span>Sort by</span><select value={sort} onChange={e => (setSort(e.target.value), setPage(0))}><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option></select></label></div>{failure ? <p role="alert">{failure} <button onClick={() => setRetry(retry + 1)}>Retry</button></p> : loading ? <p>Loading catalogue…</p> : <div className="shop-grid">{view.map(p => <ProductCard key={p.slug} product={p} add={add} open={open} />)}</div>}{!failure && !loading && !view.length && <p className="no-results">No products match your search.</p>}{!loading && !failure && result.total > 24 && <nav className="shop-pagination" aria-label="Product pages"><button disabled={page === 0} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page + 1} of {Math.ceil(result.total / 24)}</span><button disabled={(page + 1) * 24 >= result.total} onClick={() => setPage(page + 1)}>Next →</button></nav>}</div></section></main>;
}

function ProductStrip({ eyebrow, title, products, add, open }) {
  if (!products.length) return null;
  return <section className="shop"><div className="section-heading row"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><a className="text-link" href="/shop">View all products →</a></div><div className="shop-grid">{products.slice(0, 4).map(product => <ProductCard key={product.slug} product={product} add={add} open={open} />)}</div></section>;
}

function CmsBanner({ banners=[] }) {
  const [index, setIndex] = useState(0);
  const slides = useMemo(() => [...banners].filter((banner) => banner.isActive !== false).sort((a, b) => Number(a.displayOrder ?? 0) - Number(b.displayOrder ?? 0)), [banners]);
  useEffect(() => { setIndex(0); }, [slides.length]);
  useEffect(() => { if (slides.length < 2) return undefined; const timer = window.setInterval(() => setIndex((current) => (current + 1) % slides.length), 5000); return () => window.clearInterval(timer); }, [slides.length]);
  if (!slides.length) return null;
  const banner = slides[index]; const move = (step) => setIndex((current) => (current + step + slides.length) % slides.length);
  return <section className="cms-banners" aria-label="Promotions"><article className="cms-banner cms-banner-carousel" key={banner._id}><img src={cmsImage(banner.imageUrl)} alt={banner.heading}/><div><h1>{banner.heading}</h1>{banner.description&&<p>{banner.description}</p>}{banner.buttonText&&<a href={banner.buttonLink||'/shop'}>{banner.buttonText} →</a>}</div>{slides.length > 1 ? <><button type="button" className="cms-banner-arrow cms-banner-prev" onClick={() => move(-1)} aria-label="Previous banner">‹</button><button type="button" className="cms-banner-arrow cms-banner-next" onClick={() => move(1)} aria-label="Next banner">›</button><div className="cms-banner-dots">{slides.map((slide, position) => <button type="button" key={slide._id} className={position === index ? 'active' : ''} onClick={() => setIndex(position)} aria-label={`Show ${slide.heading}`} />)}</div></> : null}</article></section>; }
function CmsFaqs({ faqs=[] }) { if(!faqs.length)return null; return <section className="faq cms-faq"><p className="eyebrow">GOOD TO KNOW</p><h2>Your questions, answered.</h2><div className="faq-list">{faqs.map((faq,index)=><details key={faq._id} open={index===0}><summary>{faq.question}<b>+</b></summary><p>{faq.answer}</p></details>)}</div></section>; }
function CmsSocialLinks({ links=[] }) { return links.length?<p className="cms-social-links">Follow us: {links.map(link=><a key={link._id} href={link.url} target="_blank" rel="noreferrer">{link.platform}</a>)}</p>:null; }
function HeroCarousel({ banners = [], fallback = [] }) {
  const [index, setIndex] = useState(0);
  const slides = useMemo(() => { const cmsSlides = banners.filter((banner) => banner.isActive !== false).sort((a, b) => Number(a.displayOrder ?? 0) - Number(b.displayOrder ?? 0)).map((banner) => ({ id: banner._id, imageUrl: cmsImage(banner.imageUrl), heading: banner.heading, description: banner.description, buttonText: banner.buttonText, buttonLink: banner.buttonLink })); return cmsSlides.length ? cmsSlides : fallback.map((product) => ({ id: product.slug, imageUrl: image(product.image), heading: product.title, description: product.shortDescription || product.description, buttonText: 'Shop now', buttonLink: `/products/${product.slug}` })); }, [banners, fallback]);
  useEffect(() => { setIndex(0); }, [slides.length]);
  useEffect(() => { if (slides.length < 2) return undefined; const id = window.setInterval(() => setIndex((current) => (current + 1) % slides.length), 5000); return () => window.clearInterval(id); }, [slides.length]);
  const slide = slides[index]; const move = (step) => setIndex((current) => (current + step + slides.length) % slides.length);
  return <section className="showcase cms-hero"><img className="showcase-image" src={slide?.imageUrl ?? image('mixed_dryfruits_ze0A.jpg')} alt={slide?.heading ?? 'Nutri Heaven products'} /><div className="showcase-shade" /><div className="showcase-copy"><span>PREMIUM PANTRY</span><h1>{slide?.heading ?? 'Goodness in every handful.'}</h1><p>{slide?.description ?? 'Thoughtfully selected dry fruits, nuts and seeds, packed fresh for your everyday table.'}</p><a href={slide?.buttonLink || '/shop'}>{slide?.buttonText || 'Shop now'} <b>→</b></a></div>{slides.length > 1 ? <><button className="showcase-arrow previous" type="button" onClick={() => move(-1)} aria-label="Previous banner">‹</button><button className="showcase-arrow next" type="button" onClick={() => move(1)} aria-label="Next banner">›</button><div className="showcase-dots">{slides.map((item, position) => <button type="button" key={item.id} className={position === index ? 'active' : ''} onClick={() => setIndex(position)} aria-label={`Show ${item.heading}`} />)}</div></> : null}</section>;
}
function Home({ products, loading, add, open, settings, cms, categories }) {
  const featured = products.filter(product => product.isFeatured).concat(products.filter(product => !product.isFeatured)).slice(0, 4);
  const bestsellers = products.filter(product => product.isBestseller);
  const newArrivals = products.filter(product => product.isNewArrival);
  const spotlight = featured; const categoryCards=(categories??[]).filter(category=>!category.parentId);
  return <><main id="top"><HeroCarousel banners={cms?.banners ?? []} fallback={spotlight} /><section className="intro" id="story"><div className="intro-image"><img src={image('mixed_dryfruits_ze0A.jpg')} alt="A selection of premium dry fruits" /></div><div className="intro-copy"><p className="eyebrow">FROM NATURE, TO YOU</p><h2>Small harvests.<br /><em>Big flavour.</em></h2><p>{settings.content?.about || 'We work closely with trusted growers to bring you ingredients that are naturally delicious, beautifully fresh, and worth sharing.'}</p><a className="text-link" href="/shop">Discover the collection →</a></div></section><section className="categories"><div className="section-heading"><p className="eyebrow">SHOP BY MOOD</p><h2>Find your everyday favourite</h2></div><div className="category-grid">{(categoryCards.length?categoryCards:homeCategories.map(([image,title])=>({image,name:title}))).map(category => <a href={"/shop?category="+encodeURIComponent(category.name)} key={category._id||category.slug||category.name}><img src={image(category.image||"cat-nuts_ze0A.jpg")} alt={category.name} /><span>{category.name} <i>→</i></span></a>)}</div></section><section className="shop" id="shop"><div className="section-heading row"><div><p className="eyebrow">THE PANTRY EDIT</p><h2>Popular right now</h2></div><a className="text-link" href="/shop">View all products →</a></div>{loading ? <p>Loading catalogue…</p> : <div className="products">{featured.map(product => <article className="product" key={product.slug}><button className="home-product-image" onClick={()=>open(product)}><img src={image(product.image)} alt={product.title} /></button><h3><a className="product-title-link" href={"/products/"+encodeURIComponent(product.slug)}>{product.title}</a></h3><p>{product.shortDescription || product.description}</p><div className="buy"><span className="price">{money(product.variants?.[0]?.pricePaise ?? product.pricePaise)} <small>/ {product.variants?.[0]?.size ?? 'pack'}</small></span><button className="add" onClick={() => add(product.slug, product.variants?.find(v => v.isActive && v.stockQuantity > 0)?.size)}>Add +</button></div></article>)}</div>}</section><ProductStrip eyebrow="PANTRY FAVOURITES" title="Bestsellers" products={bestsellers} add={add} open={open} /><ProductStrip eyebrow="JUST IN" title="New arrivals" products={newArrivals} add={add} open={open} /><section className="feature" id="learn"><div className="feature-copy"><p className="eyebrow">THE NUTRI STANDARD</p><h2>Better choices,<br /><em>simply made.</em></h2><p>Nothing unnecessary. Just naturally nutrient-rich food, sourced with a little more thought and packed to stay fresh.</p><div className="points"><div><b>01</b><span>No artificial colours or preservatives</span></div><div><b>02</b><span>Source-traceable quality you can taste</span></div><div><b>03</b><span>Sealed fresh in small, mindful batches</span></div></div><a className="button dark" href="/shop">Why Nutri Heaven →</a></div><div className="feature-image"><img src={image('walnuts_ze0A.jpg')} alt="Walnuts in a bowl" /><div className="stamp">NATURALLY<br />BETTER</div></div></section><section className="faq" id="faq"><p className="eyebrow">GOOD TO KNOW</p><h2>Your questions, answered.</h2><div className="faq-list">{String(settings.content?.faq||'').trim()?<p>{settings.content.faq}</p>:DEFAULT_FAQS.map((faq,index)=><details key={faq.question} open={index===0}><summary>{faq.question}<b>+</b></summary><p>{faq.answer}</p></details>)}</div></section></main><CmsFaqs faqs={cms?.faqs}/><CmsSocialLinks links={cms?.socialLinks}/><Footer settings={settings} /></>;
}

function Checkout({ cart, busy, error, back, submit, paymentConfig }) {
  const [form, setForm] = useState({ name:'', email:'', phone:'', address:'', landmark:'', city:'', state:'', pin:'', couponCode:'', acceptedTerms:false, paymentMethod:'cod' });
  const [savedCustomer, setSavedCustomer] = useState(null);
  const useAddress = address => { if (address) setForm(current => ({ ...current, name: address.name, phone: address.phone, address: address.street, landmark: address.landmark ?? '', city: address.city, state: address.state, pin: address.pin })); };
  useEffect(() => {
    if (!customerApi.token()) return;
    let active = true;
    customerApi.me().then(me => { if (!active) return; setSavedCustomer(me); setForm(current => ({ ...current, email: me.email, name: me.name, phone: me.phone ?? '' })); useAddress(me.addresses.find(address => address.isDefault)); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const [couponQuote, setCouponQuote] = useState(null), [couponError, setCouponError] = useState(''), [couponBusy, setCouponBusy] = useState(false);
  const [validationError, setValidationError] = useState('');
  const handleSubmit = event => {
    event.preventDefault();
    if (busy) return;
    setValidationError('');
    const checkoutForm = event.currentTarget;
    // Read the displayed values, including browser/password-manager autofill.
    const values = Object.fromEntries(new FormData(checkoutForm));
    const phoneDigits = String(values.phone || '').replace(/[^0-9]/g, '');
    values.phone = phoneDigits.length === 12 && phoneDigits.startsWith('91') ? phoneDigits.slice(2) : phoneDigits;
    for (const field of ['name', 'email', 'address', 'landmark', 'city', 'state', 'pin']) values[field] = String(values[field] || '').trim();
    for (const field of ['phone', 'email', 'pin']) checkoutForm.elements.namedItem(field).value = values[field];
    values.acceptedTerms = checkoutForm.elements.namedItem('acceptedTerms').checked;
    setForm(current => ({ ...current, ...values }));
    for (const field of ['name', 'address', 'city', 'state']) {
      const input = checkoutForm.elements.namedItem(field);
      input.setCustomValidity(input.value.trim() ? '' : 'Please fill out this field.');
    }
    if (!checkoutForm.reportValidity()) {
      const invalid = checkoutForm.querySelector('input:invalid, select:invalid, textarea:invalid');
      const label = invalid?.closest('label')?.textContent.trim() || 'Checkout';
      setValidationError(`${label}: ${invalid?.validationMessage || 'Please check this field.'}`);
      return;
    }
    if (!cart?.items?.length) { setValidationError('Your bag is empty. Add a product before placing an order.'); return; }
    submit({ ...form, ...values, couponCode: couponQuote?.code ?? '' });
  };
  const update = event => { const { name, type, checked, value } = event.target; event.target.setCustomValidity(''); setValidationError(''); setForm(current => ({ ...current, [name]: type === 'checkbox' ? checked : value })); if (name === 'couponCode') setCouponQuote(null); };
  const applyCoupon = async () => { if (!form.couponCode.trim()) return; setCouponBusy(true); setCouponError(''); try { const result = await storefrontApi.quoteCoupon(form.couponCode, (cart?.items ?? []).map(item => ({ slug: item.productId, packSize: item.packSize, quantity: item.quantity })), form.email || undefined); setCouponQuote(result); } catch (failure) { setCouponQuote(null); setCouponError(failure.message); } finally { setCouponBusy(false); } };
  return <main className="checkout-page"><header className="checkout-nav"><a className="brand" href="/" aria-label="Nutri Heaven home"><img src="/assets/nutri-heaven-logo.jpeg" alt="" width="58" height="58" /><span>NUTRI HEAVEN</span></a><button className="back-button" onClick={back} disabled={busy}>← Return to bag</button></header><div className="checkout-layout"><section className="checkout-form"><p className="eyebrow">SECURE CHECKOUT</p><h2>Almost there.</h2><form noValidate onSubmit={handleSubmit}><fieldset><legend>Contact</legend><div className="field-grid"><label className="wide">Email<input required type="email" name="email" autoComplete="email" readOnly={Boolean(savedCustomer)} value={form.email} onChange={update} /></label><label>Full name<input required name="name" autoComplete="name" value={form.name} onChange={update} /></label><label>Mobile number<input required type="tel" name="phone" inputMode="tel" autoComplete="tel" pattern="[0-9]{10}" title="Enter a 10-digit mobile number" value={form.phone} onChange={update} /></label></div></fieldset><fieldset><legend>Delivery address</legend>{savedCustomer?.addresses.length > 0 && <label>Use a saved address<select defaultValue="" onChange={e => useAddress(savedCustomer.addresses.find(address => address.id === e.target.value))}><option value="">Choose an address</option>{savedCustomer.addresses.map(address => <option key={address.id} value={address.id}>{address.label} · {address.city} {address.pin}</option>)}</select></label>}<div className="field-grid"><label className="wide">Street address<input required name="address" autoComplete="street-address" value={form.address} onChange={update} /></label><label className="wide">Landmark <small>(optional)</small><input name="landmark" value={form.landmark} onChange={update} /></label><label>City<input required name="city" autoComplete="address-level2" value={form.city} onChange={update} /></label><label>State<input required name="state" autoComplete="address-level1" value={form.state} onChange={update} /></label><label>PIN code<input required name="pin" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" value={form.pin} onChange={update} /></label></div></fieldset><fieldset><legend>Coupon</legend><div className="field-grid"><label>Discount code<input name="couponCode" value={form.couponCode} onChange={update} placeholder="Enter code" /></label><button type="button" className="admin-btn admin-btn-ghost" onClick={applyCoupon} disabled={couponBusy || !form.couponCode.trim()}>{couponBusy ? 'Checking…' : 'Apply code'}</button></div>{couponQuote && <p role="status">{couponQuote.code} applied · You save {money(couponQuote.discountPaise)}</p>}{couponError && <p role="alert" className="no-results">{couponError}</p>}</fieldset><fieldset disabled={busy}><legend>Payment</legend><label className="pay-option"><input type="radio" name="paymentMethod" value="cod" checked={form.paymentMethod==='cod'} onChange={update} /> Cash on delivery <span>Pay when it arrives</span></label><label className="pay-option"><input type="radio" name="paymentMethod" value="razorpay" checked={form.paymentMethod==='razorpay'} onChange={update} disabled={!paymentConfig.enabled} /> Pay online with Razorpay <span>UPI, cards &amp; netbanking</span></label>{!paymentConfig.enabled&&<p>{paymentConfig.loading?'Checking online payment availability…':'Online payments are currently unavailable. Please use cash on delivery.'}</p>}{paymentConfig.enabled&&paymentConfig.testMode&&<p role="status">Test mode: payments are simulated and no real money is charged.</p>}</fieldset><label className="checkout-terms"><input required type="checkbox" name="acceptedTerms" checked={form.acceptedTerms} onChange={update} /> I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms &amp; Conditions</a> and <a href="/privacy-policy" target="_blank" rel="noreferrer">Privacy Policy</a>.</label>{(validationError || error) && <p role="alert" className="no-results">{validationError || error}</p>}<button type="submit" className="checkout-button" disabled={busy}>{busy ? 'Processing…' : form.paymentMethod==='razorpay' ? 'Pay online' : 'Place COD order'} →</button></form></section><aside className="order-summary"><p className="eyebrow">ORDER SUMMARY</p>{cart?.items?.map(i => <div className="summary-line" key={`${i.productId}:${i.packSize}`}><img src={image(i.image)} alt="" /><span>{i.productName} ({i.packSize}) × {i.quantity}</span><b>{money(i.unitPricePaise * i.quantity)}</b></div>)}<div className="summary-total"><p><span>Subtotal</span><b>{money(cart?.subtotalPaise)}</b></p><p><span>Delivery</span><b>{cart?.shippingPaise ? money(cart.shippingPaise) : 'Free'}</b></p>{couponQuote && <p><span>Coupon {couponQuote.code}</span><b>−{money(couponQuote.discountPaise)}</b></p>}<p><span>Total</span><b>{money(Math.max(0, (cart?.totalPaise ?? 0) - (couponQuote?.discountPaise ?? 0)))}</b></p></div></aside></div></main>;
}


export default function App() {
  const [products,setProducts] = useState([]), [cart,setCart] = useState(null), [drawer,setDrawer] = useState(false), [screen,setScreen] = useState(readPendingCheckout()?'checkout':'shop'), [order,setOrder] = useState(null), [detail,setDetail] = useState(null), [loading,setLoading] = useState(true), [busy,setBusy] = useState(false), [error,setError] = useState(''), [selectedProduct,setSelectedProduct] = useState(null), [storeSettings,setStoreSettings] = useState({}), [cms,setCms] = useState({}), [categories,setCategories] = useState([]);
  const [pendingPayment,setPendingPayment] = useState(readPendingCheckout), [paymentConfig,setPaymentConfig] = useState({enabled:false,loading:true});
  const persistPayment = value => { savePendingCheckout(value); setPendingPayment(value); };
  useEffect(() => { paymentsApi.config().then(config=>setPaymentConfig({...config,loading:false})).catch(()=>setPaymentConfig({enabled:false,loading:false})); }, []);
  const loadCart = async () => { const next = await cartApi.get(); setCart(next); return next; };
  useEffect(() => { storefrontApi.listProducts().then(setProducts).catch(e => setError(e.message)).finally(() => setLoading(false)); storefrontApi.publicSettings().then(setStoreSettings).catch(()=>{}); storefrontApi.publicCms().then(setCms).catch(()=>{}); storefrontApi.listCategories().then(setCategories).catch(()=>{}); loadCart().catch(e => setError(e.message)); const match = location.pathname.match(/^\/products\/([^/]+)$/); if (match) storefrontApi.getProduct(match[1]).then(product=>setSelectedProduct(product)).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    initializeMetaPixel(storeSettings.metaPixel);
    if (selectedProduct && screen === 'shop') trackProductView(selectedProduct);
    if (screen === 'checkout' && cart?.items?.length) {
      trackMetaEvent('InitiateCheckout', commerceData(cart.items, cart.totalPaise), { once: 'checkout' });
    }
    if (screen === 'confirmed') trackPurchase(order);
  }, [storeSettings.metaPixel, selectedProduct, screen, cart, order]);
  useEffect(() => { updateSeo({ settings: storeSettings, product: /^\/products\//.test(location.pathname) ? selectedProduct : undefined, privateScreen: screen !== 'shop' }); }, [storeSettings, selectedProduct, screen]);
  const count = useMemo(() => (cart?.items ?? []).reduce((n,i) => n+i.quantity, 0), [cart]);
  const add = async (slug,size) => { setBusy(true); try { const next = await cartApi.add(slug,size); setCart(next); setDrawer(true);
    const line = next.items.find(item => item.productId === slug && item.packSize === size);
    if (line) trackMetaEvent('AddToCart', commerceData([{ ...line, quantity: 1 }], line.unitPricePaise)); } catch(e) { setError(e.message); } finally { setBusy(false); } };
  const change = async (index,quantity,packSize) => { setBusy(true); try { setCart(quantity ? await cartApi.update(index,{quantity, ...(packSize ? {packSize} : {})}) : await cartApi.remove(index)); } catch(e) { setError(e.message); } finally { setBusy(false); } };
  const completeCheckout = async result => {
    setOrder(result); setScreen('confirmed'); persistPayment(null);
    // A cart cleanup failure must never turn a paid order into a failed checkout.
    try { await cartApi.clear(); await loadCart(); } catch { setError('Your order is confirmed. Refresh your shopping bag before starting another order.'); }
  };
  const confirmedPayment = result => result.paymentStatus==='paid' && result.status==='confirmed' && !result.paymentReconciliationRequired;
  const resumePayment = async (checkOnly = false, attempt = pendingPayment) => {
    setBusy(true); setError('');
    try {
      if (!attempt || attempt.cartId !== cartId()) throw new Error('This checkout belongs to another shopping session.');
      let currentOrder;
      if (!attempt.orderId) {
        currentOrder = await storefrontApi.placeOrder(attempt.payload);
        attempt = {cartId:attempt.cartId, orderId:currentOrder.id, paymentMethod:currentOrder.paymentMethod};
        persistPayment(attempt);
      }
      if (attempt.paymentMethod==='cod') { await completeCheckout(currentOrder || await storefrontApi.getOrder(attempt.orderId)); return; }
      currentOrder = attempt.paymentResponse
        ? await paymentsApi.verify(attempt.orderId, attempt.paymentResponse)
        : await paymentsApi.status(attempt.orderId);
      setOrder(currentOrder);
      if (confirmedPayment(currentOrder)) { await completeCheckout(currentOrder); return; }
      if (currentOrder.paymentStatus==='paid' || currentOrder.paymentStatus==='refunded') throw new Error('This payment needs support review. Please contact us with order #'+currentOrder.id+' before paying again.');
      if (currentOrder.status==='cancelled') { persistPayment(null); setError('This order was cancelled. You can start a new checkout.'); return; }
      if (checkOnly) { setError('Payment is not confirmed yet. If you already paid, check again shortly before retrying.'); return; }
      const payment = await paymentsApi.create(currentOrder.id);
      const paymentResponse = await openRazorpay(payment,currentOrder,setError);
      // Save the signed response before verification so refresh/network failures are recoverable.
      attempt = {...attempt,paymentResponse}; persistPayment(attempt);
      const verified = await paymentsApi.verify(currentOrder.id,paymentResponse);
      if (!confirmedPayment(verified)) throw new Error('Payment received but your order needs support review. Please contact us with order #'+currentOrder.id+'.');
      await completeCheckout(verified);
    } catch(e) { if (!attempt?.orderId && [400,403,404,409,422].includes(e.status)) persistPayment(null); setError(e.message); } finally { setBusy(false); }
  };
  const cancelPayment = async () => {
    setBusy(true);setError('');
    try {
      let attempt = pendingPayment;
      if (!attempt.orderId) {
        const created = await storefrontApi.placeOrder(attempt.payload);
        attempt = {...attempt,orderId:created.id};persistPayment(attempt);
      }
      if (attempt.paymentMethod==='cod' || attempt.payload?.paymentMethod==='cod') throw new Error('A COD order was already submitted. Resume to view its confirmation.');
      if (attempt.paymentResponse) {
        const verified = await paymentsApi.verify(attempt.orderId,attempt.paymentResponse);
        if (confirmedPayment(verified)) { await completeCheckout(verified);return; }
      }
      await paymentsApi.cancel(attempt.orderId);
      persistPayment(null);setOrder(null);await loadCart();
    } catch(e) {setError(e.message);} finally {setBusy(false);}
  };
  const submit = async form => {
    setBusy(true);setError('');
    try {
      if (form.paymentMethod==='razorpay' && !paymentConfig.enabled) throw new Error('Online payments are currently unavailable.');
      const current = await loadCart();
      const attempt = {cartId:cartId(),paymentMethod:form.paymentMethod,payload:{cartId:cartId(),idempotencyKey:crypto.randomUUID(),customerName:form.name,customerEmail:form.email,customerPhone:form.phone.replace(/\D/g,''),deliveryAddress:{street:form.address,landmark:form.landmark,city:form.city,state:form.state,pin:form.pin},lines:current.items.map(i=>({productSlug:i.productId,packSize:i.packSize,quantity:i.quantity})),couponCode:form.couponCode||undefined,paymentMethod:form.paymentMethod}};
      persistPayment(attempt);
      await resumePayment(false,attempt);
    } catch(e) {setError(e.message);setBusy(false);}
  };
  if (screen === 'checkout') return <>{pendingPayment ? <main className="checkout-page"><section className="account-card"><h1>Complete your order</h1><p>{pendingPayment.orderId?'Order #'+pendingPayment.orderId:'Your checkout has been saved.'}</p>{order&&<p>Order total: {money(order.totalPaise)}</p>}<p>Resume this order to avoid creating a second order. If you already paid, check payment status first. Unpaid stock reservations expire after 30 minutes.</p>{paymentConfig.testMode&&<p>Razorpay test mode · no real money is charged.</p>}{error&&<p role="alert">{error}</p>}<button className="checkout-button" disabled={busy} onClick={()=>resumePayment(false)}>{busy?'Processing…':'Resume checkout'}</button><button className="back-button" disabled={busy} onClick={()=>resumePayment(true)}>Check payment status</button><button className="back-button" disabled={busy} onClick={cancelPayment}>Cancel unpaid order</button></section></main> : <Checkout cart={cart} busy={busy} error={error} back={() => setScreen('shop')} submit={submit} paymentConfig={paymentConfig} />}<Footer settings={storeSettings} /></>;
  if (screen === 'confirmed' && order) return <><OrderConfirmation order={order} products={products} settings={storeSettings} />{error&&<p role="status">{error}</p>}<Footer settings={storeSettings} /></>;
  if (location.pathname === '/account') return <><Header count={count} cart={() => setDrawer(true)} />{new URLSearchParams(location.search).has('newsletter') ? <NewsletterAction /> : <Account />}<Footer settings={storeSettings} />{drawer && <><button className="scrim" onClick={() => setDrawer(false)} aria-label="Close cart" /><CartDrawer data={cart} products={products} busy={busy} add={add} change={change} close={() => setDrawer(false)} checkout={() => { setDrawer(false); setScreen('checkout'); }} openProduct={slug=>{setSelectedProduct(products.find(p=>p.slug===slug));setDrawer(false);}} /></>}</>;
  const policyRoutes = { '/shipping-policy':['Shipping policy','shippingPolicy'], '/return-policy':['Returns and refunds','returnPolicy'], '/privacy-policy':['Privacy policy','privacyPolicy'], '/terms':['Terms and conditions','terms'] };
  if (policyRoutes[location.pathname]) { const [title,key]=policyRoutes[location.pathname]; return <><Header count={count} cart={() => setDrawer(true)} /><main className="policy-page"><p className="eyebrow">NUTRI HEAVEN · CUSTOMER CARE</p><h1>{title}</h1><div>{storeSettings.content?.[key] || 'This information is being updated. Please contact nutriheavenhsr@gmail.com for assistance.'}</div></main><Footer settings={storeSettings} /></>; }
  const productPath = /^\/products\//.test(location.pathname);
  if (!productPath && !['/', '/shop'].includes(location.pathname)) return <><Header count={count} cart={() => setDrawer(true)} /><main className="policy-page"><h1>Page not found</h1><a href="/shop">Browse the shop</a></main><Footer settings={storeSettings} /></>;
  const shopPath = location.pathname === '/shop';
  return <><Header count={count} cart={() => setDrawer(true)} />{error && <p role="alert" className="no-results">{error}</p>}{productPath ? (selectedProduct ? <><main className="shop-page"><section className="product-detail"><img src={image(selectedProduct.image)} alt={selectedProduct.title} /><div><p className="eyebrow">{selectedProduct.category}</p><h1>{selectedProduct.title}</h1><p>{selectedProduct.fullDescription || selectedProduct.description}</p><ProductCard product={selectedProduct} add={add} open={setSelectedProduct} /></div></section></main><Footer settings={storeSettings} /></> : <><p>Loading product…</p><Footer settings={storeSettings} /></>) : shopPath ? <><Shop products={products} loading={loading} add={add} open={setSelectedProduct} categories={categories} /><Footer settings={storeSettings} /></> : <Home products={products} loading={loading} add={add} open={setSelectedProduct} settings={storeSettings} cms={cms} categories={categories} />}{drawer && <><button className="scrim" onClick={() => setDrawer(false)} aria-label="Close cart" /><CartDrawer data={cart} products={products} busy={busy} add={add} change={change} close={() => setDrawer(false)} checkout={() => { setDrawer(false); setScreen('checkout'); }} openProduct={slug=>{setSelectedProduct(products.find(p=>p.slug===slug));setDrawer(false);}} /></>}{selectedProduct && !productPath && <ProductModal product={selectedProduct} close={()=>setSelectedProduct(null)} add={add} whatsappNumber={storeSettings.whatsappNumber} />}</>;
}
