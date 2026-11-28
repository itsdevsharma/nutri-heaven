import './pending-checkout.css';

export default function PendingCheckout({ pendingPayment, order, busy, error, resume, cancel, back }) {
  const total = order?.totalPaise;
  return (
    <main className="checkout-page pending-checkout">
      <header className="checkout-nav">
        <a className="brand" href="/" aria-label="Nutri Heaven home">
          <img src="/assets/nutri-heaven-logo.jpeg" alt="" width="58" height="58" />
          <span>NUTRI HEAVEN</span>
        </a>
        <button type="button" className="back-button" disabled={busy} onClick={back}>← Return to bag</button>
      </header>
      <div className="pending-checkout-content">
        <section className="pending-checkout-panel" aria-labelledby="pending-checkout-title" aria-busy={busy}>
          <p className="pending-checkout-eyebrow">SAVED CHECKOUT</p>
          <h1 id="pending-checkout-title">Complete your order</h1>
          <p className="pending-checkout-intro">Your checkout is saved. Resume the same order to finish without placing a second order.</p>
          <dl className="pending-checkout-summary">
            <div><dt>{pendingPayment.orderId ? 'Order number' : 'Checkout'}</dt><dd>{pendingPayment.orderId ? `#${pendingPayment.orderId}` : 'Saved for this session'}</dd></div>
            {Number.isFinite(total) && <div><dt>Order total</dt><dd className="pending-checkout-total">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(total / 100)}</dd></div>}
          </dl>
          {error && <div className="pending-checkout-notice" role="alert"><p>{error}</p></div>}
          <div className="pending-checkout-guidance">
            <h2>Already paid?</h2>
            <p>Check your payment status before trying again. Unpaid stock reservations expire after 30 minutes.</p>
          </div>
          <div className="pending-checkout-actions">
            <button type="button" className="pending-checkout-primary" disabled={busy} onClick={() => resume(false)}>{busy ? 'Processing…' : 'Resume checkout'}<span aria-hidden="true">→</span></button>
            <button type="button" className="pending-checkout-secondary" disabled={busy} onClick={() => resume(true)}>Check payment status</button>
          </div>
          {pendingPayment.source === 'account' && <p className="pending-checkout-intro"><a href="/account#account-orders">Back to My orders</a>. Sign in to the account that placed this order to complete payment.</p>}
          <div className="pending-checkout-cancel-row">
            <button type="button" className="pending-checkout-cancel" disabled={busy} onClick={cancel}>Cancel unpaid order</button>
          </div>
        </section>
      </div>
    </main>
  );
}
