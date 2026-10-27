import { useEffect, useRef, useState } from 'react';
import photos from './photos.json';
import './store-gallery.css';

const mapsUrl = 'https://maps.app.goo.gl/3hVgaoeoAfFxbPyn7';
const delivery = (url, width) => url.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${width}/`);

export default function StoreGallery({ settings = {} }) {
  const dialog = useRef(null);
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const current = photos[selected];
  useEffect(() => {
    if (window.location.hash === '#our-store') {
      const frame = requestAnimationFrame(() => document.getElementById('our-store')?.scrollIntoView());
      return () => cancelAnimationFrame(frame);
    }
  }, []);
  const open = index => { setSelected(index); dialog.current.showModal(); };
  const move = step => setSelected(index => (index + step + photos.length) % photos.length);
  if (!photos.length) return null;
  return <section className="store-visit" id="our-store" aria-labelledby="store-visit-title">
    <div className="store-visit-heading">
      <div><p className="store-visit-eyebrow"><span aria-hidden="true">✦</span> A LITTLE CLOSER TO GOODNESS · HISAR</p><h2 id="store-visit-title">A little look around<br /><em>Nutri Heaven.</em></h2></div>
      <div className="store-visit-intro"><p>Good things feel even better in person. Come browse our favourite nuts, discover a thoughtful gift, or simply say hello.</p><a className="store-directions" href={mapsUrl} target="_blank" rel="noopener noreferrer">Come find us <span aria-hidden="true">↗</span></a></div>
    </div>
    <div className="store-gallery-heading"><p>THE STORE, THROUGH OUR LENS</p><span>{photos.length} little glimpses <span aria-hidden="true">↙</span></span></div>
    <div className="store-visit-grid" id="store-gallery-photos">{(expanded ? photos : photos.slice(0, 5)).map((photo, index) => <button type="button" key={photo.publicId} className={`store-visit-photo${index === 0 ? ' store-visit-featured' : ''}`} onClick={() => open(index)} aria-label={`Enlarge photo: ${photo.alt}`}>
      <img src={delivery(photo.url, 800)} srcSet={`${delivery(photo.url, 480)} 480w, ${delivery(photo.url, 800)} 800w, ${delivery(photo.url, 1200)} 1200w`} sizes={index === 0 ? "(max-width: 600px) 100vw, 45vw" : "(max-width: 600px) 50vw, 28vw"} width={photo.width} height={photo.height} alt={photo.alt} loading="lazy" decoding="async" />
      <span className="store-photo-caption"><span><small>{index === 0 ? 'YOUR NEXT HAPPY PLACE' : `A CLOSER LOOK / ${String(index + 1).padStart(2, '0')}`}</small>{photo.caption}</span><b aria-hidden="true">↗</b></span>
    </button>)}</div>
    <div className="store-gallery-footer"><p>Fresh finds. Familiar faces. A warm welcome.</p><button type="button" aria-expanded={expanded} aria-controls="store-gallery-photos" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show fewer photos' : `Explore all ${photos.length} photos`} <span aria-hidden="true">{expanded ? '−' : '+'}</span></button></div>
    <div className="store-visit-address"><div className="store-address-icon" aria-hidden="true">⌖</div><div><span className="store-address-kicker">MAKE YOURSELF AT HOME</span><h3>We’d love to see you.</h3><p>{settings.address || '258, Siwach complex Bishnoi colony near HAU gate no. 4 (sec-15) Hisar'}</p>{settings.businessHours && <p className="store-business-hours">{settings.businessHours}</p>}</div><a href={mapsUrl} target="_blank" rel="noopener noreferrer">Get directions <span aria-hidden="true">↗</span></a></div>
    <dialog ref={dialog} className="store-photo-dialog" aria-label="Store photo gallery" onClick={event => { if (event.target === event.currentTarget) dialog.current.close(); }} onKeyDown={event => { if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); } if (event.key === 'ArrowRight') { event.preventDefault(); move(1); } }}>
      <div className="store-photo-viewer"><button type="button" autoFocus className="store-photo-close" onClick={() => dialog.current.close()} aria-label="Close photo gallery">×</button><img src={delivery(current.url, 1800)} alt={current.alt} /><div className="store-photo-controls"><button type="button" onClick={() => move(-1)} aria-label="Previous store photo">←</button><p aria-live="polite">{current.caption}<small>{selected + 1} / {photos.length}</small></p><button type="button" onClick={() => move(1)} aria-label="Next store photo">→</button></div></div>
    </dialog>
  </section>;
}
