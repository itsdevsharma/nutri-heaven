import { useEffect, useMemo, useState } from 'react';

const asset = '/assets/';
const products = [
  { id: 'almonds', image: 'almonds_ze0A.jpg', title: 'California Almonds', description: 'Crisp, buttery and naturally wholesome', price: 275 },
  { id: 'cashews', image: 'cashews_ze0A.jpg', title: 'Roasted Cashews', description: 'Jumbo, golden and full of flavour', price: 299 },
  { id: 'pistachios', image: 'pistachios_ze0A.jpg', title: 'Iranian Pistachios', description: 'Lightly salted, naturally opened', price: 349 },
  { id: 'walnuts', image: 'walnuts_ze0A.jpg', title: 'Kashmiri Walnuts', description: 'Tender kernels with a mellow finish', price: 389 },
  { id: 'dates', image: 'dates_ze0A.jpg', title: 'Medjool Dates', description: 'Caramel-rich, soft and satisfyingly sweet', price: 425 },
  { id: 'pumpkin', image: 'pumpkin_seeds_ze0A.jpg', title: 'Pumpkin Seeds', description: 'Little green powerhouses for every day', price: 220 },
  { id: 'raisins', image: 'black_raisins_ze0A.jpg', title: 'Black Raisins', description: 'Sun-dried sweetness in every bite', price: 189 },
  { id: 'makhana', image: 'makhana_ze0A.jpg', title: 'Himalayan Makhana', description: 'Lightly roasted, irresistibly crisp', price: 245 },
];
const categories = [['cat-dryfruits_ze0A.jpg', 'Dry Fruits'], ['cat-nuts_ze0A.jpg', 'Premium Nuts'], ['cat-seeds_ze0A.png', 'Super Seeds'], ['cat-spices_ze0A.png', 'Whole Spices']];
const heroGallery = [
  ['pistachios_ze0A.jpg', 'Pistachios'],
  ['almonds_ze0A.jpg', 'Almonds'],
  ['mixed_dryfruits_ze0A.jpg', 'Mixed dry fruits'],
  ['cashews_ze0A.jpg', 'Cashews'],
  ['walnuts_ze0A.jpg', 'Walnuts'],
  ['raisins_ze0A.jpg', 'Black raisins'],  
];
const heroSlides = [
  { image: 'almonds_ze0A.jpg', tag: 'BEST SELLER', title: 'Premium California Almonds', description: '100% natural, crisp whole almonds packed with healthy nutrients.' },
  { image: 'cashews_ze0A.jpg', tag: 'PANTRY FAVOURITE', title: 'Golden Roasted Cashews', description: 'Buttery, satisfying cashews for every little ritual.' },
  { image: 'pistachios_ze0A.jpg', tag: 'HAND PICKED', title: 'Naturally Open Pistachios', description: 'Vibrant, flavourful nuts selected for their freshness.' },
  { image: 'walnuts_ze0A.jpg', tag: 'FRESH HARVEST', title: 'Kashmiri Walnut Kernels', description: 'Tender, rich and ready for your everyday table.' },
];
const heroShopCategories = [
  ['cat-dryfruits_ze0A.jpg', 'Dry Fruits'],
  ['cat-nuts_ze0A.jpg', 'Nuts'],
  ['cat-seeds_ze0A.png', 'Super Seeds'],
  ['cat-spices_ze0A.png', 'Spices'],
  ['dates_ze0A.jpg', 'Dates & Berries'],
  ['figs_ze0A.jpg', 'Dried Fruits'],
  ['makhana_ze0A.jpg', 'Healthy Snacks'],
  ['mixed_dryfruits_ze0A.jpg', 'Gift Hampers'],
];
const money = amount => `₹${amount.toLocaleString('en-IN')}`;

function ShopByCategory() {
  return <section className="hero-categories" aria-labelledby="shop-by-category"><div className="hero-categories-head"><h2 id="shop-by-category">Shop by Category</h2><a href="#shop">See all →</a></div><div className="hero-category-list">{heroShopCategories.map(([image, title]) => <a href="#shop" key={title}><img src={asset + image} alt={title} /><span>{title}</span></a>)}</div></section>;
}

function HeroCarousel() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setActive(current => (current + 1) % heroSlides.length), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const slide = heroSlides[active];
  const move = direction => setActive(current => (current + direction + heroSlides.length) % heroSlides.length);
  return <><section className="showcase" aria-label="Featured products"><img className="showcase-image" src={asset + slide.image} alt={slide.title} key={slide.image} /><div className="showcase-shade" /><div className="showcase-copy"><span>{slide.tag}</span><h1>{slide.title}</h1><p>{slide.description}</p><a href="#shop">Shop now <b>→</b></a></div><button className="showcase-arrow previous" onClick={() => move(-1)} aria-label="Previous product">‹</button><button className="showcase-arrow next" onClick={() => move(1)} aria-label="Next product">›</button><div className="showcase-dots" aria-label="Choose featured product">{heroSlides.map((item, index) => <button className={index === active ? 'active' : ''} onClick={() => setActive(index)} aria-label={`Show ${item.title}`} key={item.image} />)}</div></section><a className="fssai-certificate" href="/NUTRI-HEAVEN-FSSAI-RC.pdf" target="_blank" rel="noreferrer">FSSAI Registered <b>20826007002548</b><span>View registration certificate ↗</span></a><ShopByCategory /></>;
}

function CartDrawer({ cart, update, close, checkout }) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal === 0 || subtotal >= 999 ? 0 : 79;
  return <aside className="drawer" aria-label="Shopping bag"><div className="drawer-head"><div><span className="eyebrow">YOUR BAG</span><h2>Good choices.</h2></div><button className="icon-button" onClick={close} aria-label="Close cart">×</button></div>{cart.length === 0 ? <div className="empty"><span>◌</span><h3>Your bag is empty</h3><p>Let’s fill it with something wholesome.</p><button className="button dark" onClick={close}>Continue shopping <span>→</span></button></div> : <><div className="cart-lines">{cart.map(item => <div className="cart-line" key={item.id}><img src={asset + item.image} alt="" /><div className="line-info"><h3>{item.title}</h3><p>250g · {money(item.price)}</p><div className="quantity"><button onClick={() => update(item.id, item.quantity - 1)} aria-label={`Remove one ${item.title}`}>−</button><span>{item.quantity}</span><button onClick={() => update(item.id, item.quantity + 1)} aria-label={`Add one ${item.title}`}>+</button></div></div><button className="remove" onClick={() => update(item.id, 0)} aria-label={`Remove ${item.title}`}>×</button></div>)}</div><div className="cart-summary"><p><span>Subtotal</span><b>{money(subtotal)}</b></p><p><span>Delivery</span><b>{shipping ? money(shipping) : 'Free'}</b></p><small>{subtotal < 999 ? `${money(999 - subtotal)} away from free delivery` : 'You’ve unlocked free delivery!'}</small><p className="cart-total"><span>Total</span><b>{money(subtotal + shipping)}</b></p><button className="checkout-button" onClick={checkout}>Proceed to checkout <span>→</span></button></div></>}</aside>;
}

function Checkout({ cart, back, placeOrder }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', city: '', pin: '' });
  const [payment, setPayment] = useState('cod');
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal >= 999 ? 0 : 79;
  const valid = Object.values(form).every(Boolean);
  const change = event => setForm({ ...form, [event.target.name]: event.target.value });
  return <main className="checkout-page"><header className="checkout-nav"><a className="brand" href="#top">NUTRI<span>HEAVEN</span></a><button className="back-button" onClick={back}>← Return to bag</button></header><div className="checkout-layout"><section className="checkout-form"><p className="eyebrow">SECURE DEMO CHECKOUT</p><h1>Almost there.</h1><form onSubmit={event => { event.preventDefault(); if (valid) placeOrder({ ...form, payment }); }}><fieldset><legend>Contact</legend><div className="field-grid"><label className="wide">Email<input required type="email" name="email" value={form.email} onChange={change} placeholder="you@example.com" /></label><label>Full name<input required name="name" value={form.name} onChange={change} placeholder="Your name" /></label><label>Phone<input required type="tel" name="phone" value={form.phone} onChange={change} placeholder="10-digit number" /></label></div></fieldset><fieldset><legend>Delivery address</legend><div className="field-grid"><label className="wide">Street address<input required name="address" value={form.address} onChange={change} placeholder="House no., street, landmark" /></label><label>City<input required name="city" value={form.city} onChange={change} placeholder="City" /></label><label>PIN code<input required name="pin" value={form.pin} onChange={change} placeholder="000000" /></label></div></fieldset><fieldset><legend>Payment</legend><label className="pay-option"><input type="radio" name="payment" checked={payment === 'cod'} onChange={() => setPayment('cod')} /> Cash on delivery <span>Pay when it arrives</span></label><label className="pay-option"><input type="radio" name="payment" checked={payment === 'upi'} onChange={() => setPayment('upi')} /> UPI / card <span>Demo payment</span></label></fieldset><button className="checkout-button" type="submit">Place demo order <span>→</span></button></form></section><aside className="order-summary"><p className="eyebrow">ORDER SUMMARY</p>{cart.map(item => <div className="summary-line" key={item.id}><img src={asset + item.image} alt="" /><span>{item.title} × {item.quantity}</span><b>{money(item.price * item.quantity)}</b></div>)}<div className="summary-total"><p><span>Subtotal</span><b>{money(subtotal)}</b></p><p><span>Delivery</span><b>{shipping ? money(shipping) : 'Free'}</b></p><p><span>Total</span><b>{money(subtotal + shipping)}</b></p></div></aside></div></main>;
}

function Confirmation({ order, restart }) { return <main className="confirmation"><div className="success-mark">✓</div><p className="eyebrow">ORDER CONFIRMED</p><h1>Thank you,<br /><em>{order.name.split(' ')[0]}.</em></h1><p>Your order <b>#{order.id}</b> is being prepared with care. We’ll send updates to {order.email}.</p><div className="confirmation-card"><span>Estimated delivery</span><b>3–7 business days</b><span>Delivering to</span><b>{order.city}, {order.pin}</b></div><button className="button dark" onClick={restart}>Continue shopping <span>→</span></button></main>; }

function Footer() {
  return <footer><div className="footer-top"><div className="footer-brand"><a className="brand" href="#top">NUTRI<span>HEAVEN</span></a><p>Thoughtfully selected dry fruits, nuts and seeds for better everyday rituals.</p><a className="footer-contact" href="mailto:hello@nutriheaven.in">hello@nutriheaven.in <span>·</span> Hisar, Haryana</a></div><div className="footer-links"><div><b>Shop</b><a href="#shop">All products</a><a href="#shop">Dry fruits</a><a href="#shop">Nuts & seeds</a></div><div><b>Support</b><a href="#faq">FAQs</a><a href="#faq">Shipping & returns</a><a href="mailto:hello@nutriheaven.in">Contact support</a></div></div><form onSubmit={event => event.preventDefault()}><label htmlFor="email">A note from our pantry</label><p>Fresh arrivals, pantry notes, and member-only offers.</p><div><input id="email" type="email" placeholder="Your email address" /><button aria-label="Subscribe">Subscribe →</button></div><small>By subscribing, you agree to receive Nutri Heaven updates.</small></form></div><div className="footer-trust"><span>✓ FSSAI Registered</span><span>✓ Secure checkout</span><span>✓ Free delivery over ₹999</span></div><div className="footer-bottom"><span>© 2026 Nutri Heaven</span><div><a href="/NUTRI-HEAVEN-FSSAI-RC.pdf" target="_blank" rel="noreferrer">FSSAI certificate</a><a href="#faq">Privacy</a><a href="#faq">Terms</a></div><span>Follow us: Instagram · Pinterest</span></div></footer>;
}

function ShopPage({ cart, add, openCart }) {
  const [category, setCategory] = useState('All products'); const [sort, setSort] = useState('Featured'); const [sizes, setSizes] = useState({}); const [onlyInStock, setOnlyInStock] = useState(false); const [search, setSearch] = useState('');
  const catalogue = products.map((product, index) => ({ ...product, category: index < 4 ? 'Premium Nuts' : index === 4 || index === 6 ? 'Dry Fruits' : 'Super Seeds' }));
  const categories = ['All products', ...new Set(catalogue.map(product => product.category))];
  let visible = catalogue.filter(product => category === 'All products' || product.category === category);
  if (onlyInStock) visible = visible.filter(product => product.id !== 'dates');
  const fuzzyScore = product => { const needle = search.toLowerCase().replace(/[^a-z0-9]/g, ''); const haystack = `${product.title}${product.category}${product.description}`.toLowerCase().replace(/[^a-z0-9]/g, ''); if (!needle) return 0; if (haystack.includes(needle)) return 1000 - haystack.indexOf(needle); let cursor = 0; let score = 0; for (const character of needle) { const index = haystack.indexOf(character, cursor); if (index < 0) return -Infinity; score += Math.max(1, 30 - (index - cursor)); cursor = index + 1; } return score; };
  visible = visible.map(product => ({ product, score: fuzzyScore(product) })).filter(item => item.score > -Infinity).sort((a, b) => sort === 'Price: low to high' ? a.product.price - b.product.price : sort === 'Price: high to low' ? b.product.price - a.product.price : b.score - a.score).map(item => item.product);
  const priceFor = (product, size) => Math.round(product.price * ({ '250g': 1, '500g': 1.9, '1kg': 3.65 }[size] ?? 1)); const count = cart.reduce((sum, item) => sum + item.quantity, 0); const bag = count; const setBag = () => openCart();
  useEffect(() => {
    const handleShopAction = event => {
      if (event.target.closest('.shop-nav .bag')) { event.preventDefault(); openCart(); return; }
      const button = event.target.closest('.shop-buy button');
      if (!button) return;
      const card = button.closest('.shop-product');
      const title = card?.querySelector('h2')?.textContent;
      const product = products.find(item => item.title === title);
      if (!product) return;
      const size = card.querySelector('select')?.value ?? '250g';
      event.preventDefault();
      event.stopPropagation();
      add({ ...product, id: `${product.id}-${size}`, price: priceFor(product, size), size });
    };
    document.addEventListener('click', handleShopAction, true);
    return () => document.removeEventListener('click', handleShopAction, true);
  }, [add, openCart]);
  return <><header className="nav shop-nav"><a className="brand" href="/">NUTRI<span>HEAVEN</span></a><nav><a href="/">Home</a><a href="#catalogue">Shop all</a><a href="/#story">Our story</a><a href="/#faq">FAQs</a></nav><div className="tools"><button className="bag">Bag <i>{bag}</i></button></div></header><main className="shop-page"><section className="catalogue" id="catalogue"><aside className="shop-filters"><div><p className="eyebrow">BROWSE BY</p>{categories.map(item => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}<span>{item === 'All products' ? catalogue.length : catalogue.filter(product => product.category === item).length}</span></button>)}</div><div><p className="eyebrow">FILTERS</p><label className="filter-check"><input type="checkbox" checked={onlyInStock} onChange={event => setOnlyInStock(event.target.checked)} /> In stock only</label><button onClick={() => { setCategory('All products'); setOnlyInStock(false); setSearch(''); }}>Clear filters</button></div></aside><div className="catalogue-products"><div className="catalogue-head"><label className="shop-search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search nuts, seeds, dry fruits…" aria-label="Search products" /></label><span>{visible.length} products</span><label>Sort by <select value={sort} onChange={event => setSort(event.target.value)}><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option></select></label></div><div className="shop-grid">{visible.map(product => { const size = sizes[product.id] ?? '250g'; return <article className="shop-product" key={product.id}><img src={asset + product.image} alt={product.title} /><p className="product-category">{product.category}</p><h2>{product.title}</h2><p className="product-description">{product.description}</p><label className="pack-select">Pack size<select value={size} onChange={event => setSizes({ ...sizes, [product.id]: event.target.value })}>{['250g', '500g', '1kg'].map(option => <option key={option}>{option}</option>)}</select></label><div className="shop-buy"><span>{money(priceFor(product, size))}<small> / {size}</small></span><button onClick={() => setBag(bag + 1)}>Add +</button></div></article>; })}</div>{search && !visible.length && <p className="no-results">No close matches yet. Try a shorter search.</p>}</div></section></main></>;
  return <><header className="nav shop-nav"><a className="brand" href="/">NUTRI<span>HEAVEN</span></a><nav><a href="/">Home</a><a href="#catalogue">Shop all</a><a href="/#story">Our story</a><a href="/#faq">FAQs</a></nav><div className="tools"><button className="bag" aria-label="Shopping bag">Bag <i>{bag}</i></button></div></header><main className="shop-page"><section className="shop-banner"><p className="eyebrow">THE PANTRY EDIT</p><h1>Find your everyday<br /><em>favourite.</em></h1><p>Thoughtfully sourced ingredients, packaged in the size that suits your ritual.</p></section><section className="catalogue" id="catalogue"><aside className="shop-filters"><div><p className="eyebrow">BROWSE BY</p>{categories.map(item => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}<span>{item === 'All products' ? catalogue.length : catalogue.filter(product => product.category === item).length}</span></button>)}</div><div><p className="eyebrow">FILTERS</p><label className="filter-check"><input type="checkbox" checked={onlyInStock} onChange={event => setOnlyInStock(event.target.checked)} /> In stock only</label><button onClick={() => { setCategory('All products'); setOnlyInStock(false); }}>Clear filters</button></div></aside><div className="catalogue-products"><div className="catalogue-head"><span>{visible.length} products</span><label>Sort by <select value={sort} onChange={event => setSort(event.target.value)}><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option></select></label></div><div className="shop-grid">{visible.map(product => { const size = sizes[product.id] ?? '250g'; return <article className="shop-product" key={product.id}><img src={asset + product.image} alt={product.title} /><p className="product-category">{product.category}</p><h2>{product.title}</h2><p className="product-description">{product.description}</p><div className="pack-sizes" aria-label={`Choose pack size for ${product.title}`}>{['250g', '500g', '1kg'].map(option => <button className={size === option ? 'selected' : ''} onClick={() => setSizes({ ...sizes, [product.id]: option })} key={option}>{option}</button>)}</div><div className="shop-buy"><span>{money(priceFor(product, size))}<small> / {size}</small></span><button onClick={() => setBag(bag + 1)}>Add +</button></div></article>; })}</div></div></section></main></>;
}

function App() {
  const [cart, setCart] = useState([]); const [drawer, setDrawer] = useState(false); const [mobileNav, setMobileNav] = useState(false); const [screen, setScreen] = useState('shop'); const [order, setOrder] = useState(null);
  useEffect(() => {
    const links = [...document.querySelectorAll('a[href="#shop"]')];
    const openShop = event => { event.preventDefault(); window.location.assign('/shop'); };
    links.forEach(link => link.addEventListener('click', openShop));
    return () => links.forEach(link => link.removeEventListener('click', openShop));
  }, []);
  const count = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const add = product => { setCart(old => { const match = old.find(item => item.id === product.id); return match ? old.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...old, { ...product, quantity: 1 }]; }); setDrawer(true); };
  const update = (id, quantity) => setCart(old => quantity ? old.map(item => item.id === id ? { ...item, quantity } : item) : old.filter(item => item.id !== id));
  const checkout = () => { setDrawer(false); setScreen('checkout'); window.scrollTo(0, 0); };
  const placeOrder = details => { setOrder({ ...details, id: `NH${String(Date.now()).slice(-6)}` }); setCart([]); setScreen('confirmed'); window.scrollTo(0, 0); };
  if (screen === 'checkout') return <Checkout cart={cart} back={() => setScreen('shop')} placeOrder={placeOrder} />;
  if (screen === 'confirmed') return <Confirmation order={order} restart={() => setScreen('shop')} />;
  if (window.location.pathname === '/shop') return <><ShopPage cart={cart} add={add} openCart={() => setDrawer(true)} />{drawer && <><button className="scrim" aria-label="Close cart" onClick={() => setDrawer(false)} /><CartDrawer cart={cart} update={update} close={() => setDrawer(false)} checkout={checkout} /></>}</>;
  return <><header className="nav"><a className="brand" href="#top">NUTRI<span>HEAVEN</span></a><button className="menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle menu">{mobileNav ? '×' : '☰'}</button><nav className={mobileNav ? 'open' : ''}><a onClick={() => setMobileNav(false)} href="#shop">Shop all</a><a onClick={() => setMobileNav(false)} href="#story">Our story</a><a onClick={() => setMobileNav(false)} href="#learn">Learn</a><a onClick={() => setMobileNav(false)} href="#faq">FAQs</a></nav><div className="tools"><button className="search-icon" aria-label="Search">⌕</button><button className="bag" onClick={() => setDrawer(true)} aria-label="Open bag">Bag <i>{count}</i></button></div></header><HeroCarousel />
    <main id="top"><section className="hero"><div className="hero-copy"><p className="eyebrow">NOURISHING LITTLE RITUALS</p><h1>Goodness in<br /><em>every handful.</em></h1><p>Premium dry fruits, nuts and seeds—selected at source and packed with care for your everyday table.</p><a className="button light" href="#shop">Shop the collection <span>→</span></a></div><div className="hero-art"><div className="orb" /><div className="hero-gallery" aria-label="A rotating selection of Nutri Heaven products"><div className="hero-track track-up">{[...heroGallery, ...heroGallery].map(([image, label], index) => <figure className="hero-card" key={`up-${index}`}><img src={asset + image} alt={index < heroGallery.length ? label : ''} /></figure>)}</div><div className="hero-track track-down">{[...heroGallery.slice(3), ...heroGallery.slice(0, 3), ...heroGallery.slice(3), ...heroGallery.slice(0, 3)].map(([image, label], index) => <figure className="hero-card" key={`down-${index}`}><img src={asset + image} alt={index < heroGallery.length ? label : ''} /></figure>)}</div></div><div className="seal">NUTRI<br />HEAVEN<br /><small>EST. 2024</small></div></div></section><section className="marquee"><span>100% NATURAL</span><b>✦</b><span>HAND PICKED</span><b>✦</b><span>PACKED FRESH</span><b>✦</b><span>DELIVERED WITH LOVE</span><b>✦</b></section><section className="intro" id="story"><div className="intro-image"><img src={asset+'mixed_dryfruits_ze0A.jpg'} alt="A selection of premium dry fruits" /></div><div className="intro-copy"><p className="eyebrow">FROM NATURE, TO YOU</p><h2>Small harvests.<br />Big <em>flavour.</em></h2><p>We work closely with trusted growers to bring you ingredients that are naturally delicious, beautifully fresh, and worth sharing.</p><a className="text-link" href="#learn">Discover our story →</a></div></section><section className="categories"><div className="section-heading"><p className="eyebrow">SHOP BY MOOD</p><h2>Find your everyday favourite</h2></div><div className="category-grid">{categories.map(([image,title]) => <a href="#shop" key={title}><img src={asset+image} alt={title} /><span>{title} <i>→</i></span></a>)}</div></section><section className="shop" id="shop"><div className="section-heading row"><div><p className="eyebrow">THE PANTRY EDIT</p><h2>Popular right now</h2></div><a className="text-link" href="#shop">View all products →</a></div><div className="products">{products.map(product => <article className="product" key={product.id}><img src={asset+product.image} alt={product.title} /><h3>{product.title}</h3><p>{product.description}</p><div className="buy"><span className="price">{money(product.price)} <small>/ 250g</small></span><button className="add" onClick={() => add(product)}>ADD +</button></div></article>)}</div></section><section className="feature" id="learn"><div className="feature-copy"><p className="eyebrow">THE NUTRI STANDARD</p><h2>Better choices,<br /><em>simply made.</em></h2><p>Nothing unnecessary. Just naturally nutrient-rich food, sourced with a little more thought and packed to stay fresh.</p><div className="points"><div><b>01</b><span>No artificial colours or preservatives</span></div><div><b>02</b><span>Source-traceable quality you can taste</span></div><div><b>03</b><span>Sealed fresh in small, mindful batches</span></div></div><a className="button dark" href="#faq">Why Nutri Heaven <span>→</span></a></div><div className="feature-image"><img src={asset+'walnuts_ze0A.jpg'} alt="Walnuts in a bowl" /><div className="stamp">NATURALLY<br />BETTER</div></div></section><section className="faq" id="faq"><p className="eyebrow">GOOD TO KNOW</p><h2>Your questions, answered.</h2><div className="faq-list"><details open><summary>What makes Nutri Heaven special?<b>+</b></summary><p>We select high-quality ingredients and keep things simple: clean food, carefully packed, with no unnecessary extras.</p></details><details><summary>How should I store my dry fruits?<b>+</b></summary><p>Keep them in a cool, dry place. For the freshest experience, refrigerate after opening.</p></details><details><summary>Do you offer free shipping?<b>+</b></summary><p>Yes—shipping is free on all orders over ₹999 across India.</p></details></div></section></main>
    <Footer />
    {drawer && <><button className="scrim" aria-label="Close cart" onClick={() => setDrawer(false)} /><CartDrawer cart={cart} update={update} close={() => setDrawer(false)} checkout={checkout} /></>}
  </>;
}
export default App;
