import { useEffect, useState } from 'react';
import { customerApi, storefrontApi } from '../cart-api.js';
import './reviews.css';

export default function Reviews({ slug }) {
  return <ProductReviews key={slug} slug={slug} />;
}

function ProductReviews({ slug }) {
  const [data, setData] = useState(null), [state, setState] = useState(null);
  const [rating, setRating] = useState(5), [body, setBody] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [loadError, setLoadError] = useState(''), [accountError, setAccountError] = useState(''), [retry, setRetry] = useState(0);
  const signedIn = Boolean(customerApi.token());
  useEffect(() => {
    let active = true;
    setLoadError(''); setAccountError('');
    storefrontApi.reviews(slug).then(result => { if (active) setData(result); }).catch(e => { if (active) setLoadError(e.message); });
    if (signedIn) customerApi.reviewState(slug).then(result => { if (active) setState(result); }).catch(e => { if (active) setAccountError(e.message); });
    return () => { active = false; };
  }, [slug, signedIn, retry]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const review = await customerApi.review({ productSlug: slug, rating, body: body.trim() });
      setState({ canReview: false, review }); setBody('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <section className="product-reviews" aria-label="Customer reviews">
    <h3>Customer reviews</h3>
    {loadError ? <p role="alert">{loadError} <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></p> : !data ? <p role="status">Loading reviews…</p> : <>
      <p>{data.count ? `${data.average.toFixed(1)} / 5 · ${data.count} ${data.count === 1 ? 'review' : 'reviews'}` : 'No reviews yet. Share your experience with this product.'}</p>
      {data.items.map(item => <article key={item._id}>
        <b>{item.customerName}</b> <span className="review-stars" aria-label={`${item.rating} out of 5 stars`}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span>
        {item.verifiedPurchase && <small> · Verified purchase</small>}
        <p>{item.body}</p><small>{new Date(item.createdAt).toLocaleDateString('en-IN')}</small>
      </article>)}
      {data.count > data.items.length && <p>Showing the latest {data.items.length} approved reviews.</p>}
    </>}
    <div className="review-compose">
      <h4>Share your review</h4>
      <p>Reviews appear on the website only after admin approval.</p>
      {!signedIn ? <a href="/account">Sign in to review your purchase</a> : accountError ? <p role="alert">{accountError} <a href="/account">Go to your account</a> <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></p> : !state ? <p role="status">Checking your purchase…</p> : state.review ? <div role="status">
        <p>{({ pending: 'Thank you! Your review is awaiting admin approval.', approved: 'Your review is approved and visible on the website.', rejected: 'Your review was not approved for publication.' })[state.review.status]}</p>
        <b>Your rating: {state.review.rating} / 5</b><p>{state.review.body}</p>
      </div> : !state.canReview ? <p>You can review this product once an order placed with your account has been delivered.</p> : <form className="customer-form" onSubmit={submit}>
        <fieldset className="review-rating" disabled={busy}><legend>Your rating</legend>{[1, 2, 3, 4, 5].map(value => <label key={value}>
          <input type="radio" name={`rating-${slug}`} value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`} />
          <span aria-hidden="true">{value <= rating ? '★' : '☆'}</span>
        </label>)}<span>{rating} / 5</span></fieldset>
        <label>Your review<textarea minLength={10} maxLength={2000} required rows={4} disabled={busy} placeholder="How was the taste, quality and freshness?" value={body} onChange={e => setBody(e.target.value)} /></label>
        <small>10–2,000 characters · One review per product</small>
        <button disabled={busy || body.trim().length < 10}>{busy ? 'Submitting…' : 'Submit review for approval'}</button>
      </form>}
      {error && <p role="alert">{error}</p>}
    </div>
  </section>;
}
