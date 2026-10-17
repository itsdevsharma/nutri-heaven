import { useState } from 'react';
import { MODULE_GUIDES } from '../lib/moduleGuides.js';
import { MODULE_LOCATIONS } from '../lib/moduleLocations.js';
import { Modal } from './Modal.jsx';

export function ModuleGuide({ route }) {
  const [open, setOpen] = useState(false);
  const guide = MODULE_GUIDES[route.id];
  if (!guide) return null;

  return (
    <>
      <button type="button" className="admin-btn admin-btn-ghost admin-guide-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="admin-guide-icon" aria-hidden="true">i</span>
        <span>How to use</span>
      </button>
      <Modal open={open} title={`How to use ${route.title}`} size="lg" onClose={() => setOpen(false)} footer={<button type="button" className="admin-btn admin-btn-primary" onClick={() => setOpen(false)}>Got it</button>}>
      <div className="admin-guide-body">
        <p>{guide.description}</p>
        <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        {MODULE_LOCATIONS[route.id] && <section className="admin-guide-locations">
          <h3>Where this appears on the website</h3>
          <p>After saving, reload the relevant storefront page to check the change. Visibility and active settings still apply.</p>
          <div className="admin-table-wrap"><table className="admin-table">
            <caption className="admin-visually-hidden">Fields and their website locations</caption>
            <thead><tr><th scope="col">Field or action</th><th scope="col">Website location or effect</th></tr></thead>
            <tbody>{MODULE_LOCATIONS[route.id].map(([field, location]) => <tr key={field}><th scope="row">{field}</th><td>{location}</td></tr>)}</tbody>
          </table></div>
        </section>}
        {guide.tip && <p className="admin-guide-tip"><strong>Good to know:</strong> {guide.tip}</p>}
      </div>
      </Modal>
    </>
  );
}
