import { DEFAULT_FAQS } from '../../defaultFaqs.js';
import { adminApi } from '../lib/api.js';
import { useResource } from '../lib/useResource.js';
import { Card } from './PageHeader.jsx';
import { ErrorState, LoadingBlock } from './Feedback.jsx';
import { Link } from '../router.jsx';

export function ExistingFaqs() {
  const { data, loading, error, reload } = useResource(() => adminApi.settings.get(), []);
  const content = String(data?.value?.content?.faq ?? '').trim();
  return <Card title="Existing homepage FAQs" description="The FAQ content already shown in the homepage’s main questions section.">
    {loading ? <LoadingBlock label="Loading existing FAQs…" /> : error ? <ErrorState error={error} onRetry={reload} /> : content ? <>
      <p className="admin-hint">Source: Store content</p>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{content}</p>
      <Link className="admin-btn admin-btn-ghost" to="/admin/store-content">Edit in Store content</Link>
    </> : <div className="admin-stack">{DEFAULT_FAQS.map(faq => <section key={faq.question}>
      <h3>{faq.question}</h3><p>{faq.answer}</p>
    </section>)}<p className="admin-hint">Source: built-in homepage FAQs. To replace this section, edit Frequently asked questions in Store content. FAQs created below appear as additional questions on the storefront.</p><div><Link className="admin-btn admin-btn-ghost" to="/admin/store-content">Edit homepage FAQ content</Link></div></div>}
  </Card>;
}
