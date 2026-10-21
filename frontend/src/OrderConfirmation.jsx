import './order-confirmation.css';

const money = value => `₹${((value || 0) / 100).toLocaleString('en-IN')}`;
const asset = value => value.startsWith('/') || value.startsWith('http') ? value : `/assets/${value}`;

export default function OrderConfirmation({ order, products = [], settings = {} }) {
  const address = order.deliveryAddress;
  const paid = order.paymentStatus === 'paid';
  const count = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const email = settings.supportEmail || 'nutriheavenhsr@gmail.com';
  return <main className="order-celebration">
    <header className="oc-header">
      <a href="/" className="oc-brand"><img src="/assets/nutri-heaven-logo.jpeg" alt="" /><span>NUTRI HEAVEN<small>A little goodness, every day.</small></span></a>
      <a href="/shop" className="oc-back">Back to the pantry <span aria-hidden="true">↗</span></a>
    </header>
    <div className="oc-layout">
      <section className="oc-welcome" aria-labelledby="oc-title">
        <div className="oc-welcome-copy">
          <span className="oc-confirmed"><span aria-hidden="true">✓</span> ORDER CONFIRMED</span>
          <h1 id="oc-title">Good things<br />are on their way,<br /><em>{order.customerName.trim().split(/\s+/)[0]}.</em></h1>
          <p>Your next little ritual starts here. Thank you for making Nutri Heaven part of your everyday.</p>
          <div className="oc-order-reference"><span>YOUR ORDER</span><strong>#{order.id}</strong></div>
        </div>
        <div className="oc-pantry-photo"><img src="/assets/mixed_dryfruits_ze0A.jpg" alt="A selection of dry fruits and nuts from the Nutri Heaven pantry" /><div className="oc-photo-caption"><span>FROM OUR PANTRY, WITH CARE</span><strong>Goodness in every handful.</strong></div><span className="oc-seal" aria-hidden="true">PACKED<br />WITH<br /><i>care</i></span></div>
      </section>
      <section className="oc-receipt" aria-labelledby="oc-receipt-title">
        <div className="oc-receipt-heading"><div><span className="oc-kicker">A LOVELY LITTLE HAUL</span><h2 id="oc-receipt-title">Your order</h2></div><span className="oc-item-count">{count} {count === 1 ? 'item' : 'items'}</span></div>
        <div className="oc-lines">{order.lines.map((line, index) => {
          const photo = line.image || products.find(product => product.slug === line.productSlug)?.image;
          return <div className="oc-line" key={`${line.productSlug}:${line.packSize}:${index}`}>
            <div className="oc-product-photo">{photo ? <img src={asset(photo)} alt="" /> : <span aria-hidden="true">✳</span>}</div>
            <div><h3>{line.productName}</h3><p>{line.packSize} <span>·</span> Qty {line.quantity}</p></div><strong>{money(line.lineTotalPaise)}</strong>
          </div>;
        })}</div>
        <dl className="oc-totals"><div><dt>Subtotal</dt><dd>{money(order.subtotalPaise)}</dd></div><div><dt>Delivery</dt><dd>{order.shippingPaise ? money(order.shippingPaise) : <span className="oc-free">On us</span>}</dd></div>{order.couponDiscountPaise > 0 && <div><dt>Savings {order.couponCode && `(${order.couponCode})`}</dt><dd>−{money(order.couponDiscountPaise)}</dd></div>}<div className="oc-grand-total"><dt>Order total</dt><dd>{money(order.totalPaise)}</dd></div></dl>
        <div className="oc-delivery-details"><div><span className="oc-kicker">DELIVERING TO</span><strong>{order.customerName}</strong><address>{address.street}{address.landmark && <>, {address.landmark}</>}<br />{address.city}, {address.state} {address.pin}</address></div><div><span className="oc-kicker">PAYMENT</span><strong>{paid ? 'Payment received' : order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Online payment'}</strong><p>{paid ? 'You’re all paid up.' : order.paymentMethod === 'cod' ? `${money(order.totalPaise)} payable on delivery` : 'Check your order for payment updates.'}</p></div></div>
        <a href="/shop" className="oc-shop-link">A little more goodness? Keep exploring <span aria-hidden="true">→</span></a>
        <p className="oc-support">Need a hand? <a href={`mailto:${email}?subject=${encodeURIComponent(`Help with order ${order.id}`)}`}>We’re here for you ↗</a></p>
      </section>
      <section className="oc-next" aria-labelledby="oc-next-title"><div className="oc-next-heading"><span className="oc-kicker">THE JOURNEY TO YOUR DOOR</span><h2 id="oc-next-title">What happens next</h2></div><ol><li><span className="oc-step-number">01</span><div><h3>A little preparation</h3><p>Our team will review your order and get your pantry favourites ready.</p></div></li><li><span className="oc-step-number">02</span><div><h3>Packed with care</h3><p>Your goodies will be carefully packed for their journey to you.</p></div></li><li><span className="oc-step-number">03</span><div><h3>Goodness at your door</h3><p>We’ll contact you with delivery details. Keep your order number handy.</p></div></li></ol></section>
    </div>
  </main>;
}
