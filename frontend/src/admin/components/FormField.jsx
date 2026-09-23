/**
 * Form layout primitives. Inputs themselves are plain `<input className="admin-input">`
 * elements in the pages — the wrapper only takes care of the label, the hint and
 * the field-level error so every form reads the same way.
 */

export function FormField({ label, hint, error, required, children, span }) {
  return (
    <div className={`admin-field${span ? ` admin-field-span-${span}` : ''}`}>
      {label ? (
        <label className="admin-field-label">
          {label}
          {required ? <span className="admin-required" aria-hidden="true"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="admin-field-error" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="admin-field-hint">{hint}</p>
      )}
    </div>
  );
}

export function FormGrid({ children, columns = 2 }) {
  return <div className={`admin-form-grid admin-form-grid-${columns}`}>{children}</div>;
}

export function FormSection({ title, description, children, aside }) {
  return (
    <section className="admin-fieldset">
      <header className="admin-fieldset-head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {aside}
      </header>
      <div className="admin-fieldset-body">{children}</div>
    </section>
  );
}

/** Checkbox with an inline label — the shape flag toggles need. */
export function CheckboxField({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={`admin-check${disabled ? ' admin-check-disabled' : ''}`}>
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span>
        <b>{label}</b>
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}
