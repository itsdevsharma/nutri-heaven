import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api.js';
import { Card, PageHeader } from '../components/PageHeader.jsx';

const fields = [
  ['shippingPolicy', 'Shipping policy'],
  ['returnPolicy', 'Returns and refund policy'],
  ['privacyPolicy', 'Privacy policy'],
  ['terms', 'Terms and conditions'],
  ['about', 'About Nutri Heaven'],
  ['contact', 'Contact details and store address'],
  ['faq', 'Frequently asked questions'],
];

export default function StoreContentPage() {
  const [value,setValue] = useState({content:{}}); const [loading,setLoading] = useState(true); const [saving,setSaving] = useState(false); const [message,setMessage] = useState('');
  useEffect(()=>{ adminApi.settings.get().then(record=>setValue(record?.value ?? {content:{}})).catch(error=>setMessage(error.message)).finally(()=>setLoading(false)); },[]);
  const update=(key,text)=>setValue(current=>({...current,content:{...(current.content??{}),[key]:text}}));
  const save=async()=>{setSaving(true);setMessage('');try{await adminApi.settings.update(value);setMessage('Store content saved and published.');}catch(error){setMessage(error.message);}finally{setSaving(false);}};
  return <><PageHeader eyebrow="STOREFRONT CMS" title="Store content" description="Edit shared customer information and policy pages together. Product details remain editable on each product form." actions={<button className="admin-btn admin-btn-primary" onClick={save} disabled={saving||loading}>{saving?'Saving…':'Save and publish'}</button>} /><div className="admin-stack">{message&&<p role="status" className="admin-hint">{message}</p>}<Card title="Shared customer content" description="Changes appear on the matching storefront policy or information page after saving.">{loading?<p>Loading content…</p>:fields.map(([key,label])=><label className="store-content-field" key={key}><span>{label}</span><textarea rows={key==='faq'?8:6} value={value.content?.[key]??''} onChange={event=>update(key,event.target.value)} placeholder={`Write the ${label.toLowerCase()} here`} /></label>)}</Card><Card title="Footer details" description="These values are shared across storefront pages."><label className="store-content-field"><span>Support email</span><input value={value.supportEmail??''} onChange={event=>setValue({...value,supportEmail:event.target.value})} /></label><label className="store-content-field"><span>Phone / WhatsApp</span><input value={value.supportPhone??''} onChange={event=>setValue({...value,supportPhone:event.target.value})} /></label><label className="store-content-field"><span>Store address</span><textarea rows={3} value={value.address??''} onChange={event=>setValue({...value,address:event.target.value})} /></label></Card></div></>;
}
