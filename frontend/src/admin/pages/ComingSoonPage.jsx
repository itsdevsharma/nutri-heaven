import { Card, PageHeader } from '../components/PageHeader.jsx';

/**
 * Renders nav entries whose module is planned but not built.
 *
 * `ADMIN_COMMERCE_PLAN.md` sequences the admin system, and phases 5–7 (orders,
 * promotions, coupons, audit timeline) have no API yet. Rather than hiding the
 * module or faking data locally, the console shows what is coming and exactly
 * which endpoints it is waiting for — the same honesty the README applies to the
 * storefront's demo checkout.
 */
export default function ComingSoonPage({ route }) {
  const planned = route?.planned ?? {};

  return (
    <>
      <PageHeader
        eyebrow="PLANNED MODULE"
        title={route?.title ?? 'Planned module'}
        description={planned.summary}
      />

      <div className="admin-stack">
        <Card title="What this screen will do" description={planned.phase}>
          <ul className="admin-list">
            {(planned.bullets ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>

        <Card
          title="Backend endpoints it is waiting for"
          description="None of these exist yet. The console does not invent them or fake the data locally."
        >
          <ul className="admin-list admin-list-mono">
            {(planned.endpoints ?? []).map((endpoint) => (
              <li key={endpoint}>
                <code>{endpoint}</code>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Where it is tracked">
          <p className="admin-hint">
            <code>backend/ADMIN_COMMERCE_PLAN.md</code> lists the delivery sequence; this module is
            still in an earlier step. The navigation entry exists so the information architecture
            does not have to change when the API lands.
          </p>
        </Card>
      </div>
    </>
  );
}
