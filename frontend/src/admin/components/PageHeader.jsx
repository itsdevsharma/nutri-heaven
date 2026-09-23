/** Consistent page heading: eyebrow, title, one line of context, actions right. */
export function PageHeader({ eyebrow, title, description, actions, back }) {
  return (
    <header className="admin-page-head">
      <div>
        {back ? <div className="admin-page-back">{back}</div> : null}
        {eyebrow ? <p className="admin-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="admin-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </header>
  );
}

/** A titled block used to group form fields or secondary content. */
export function Card({ title, description, actions, children, tone = 'default', className = '' }) {
  return (
    <section className={`admin-card admin-card-${tone} ${className}`.trim()}>
      {title || actions ? (
        <header className="admin-card-head">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="admin-card-body">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, tone = 'default', foot }) {
  return (
    <article className={`admin-stat admin-stat-${tone}`}>
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
      {hint ? <p className="admin-stat-hint">{hint}</p> : null}
      {foot ? <p className="admin-stat-foot">{foot}</p> : null}
    </article>
  );
}
