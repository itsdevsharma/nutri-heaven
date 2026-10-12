import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader.jsx';
import { EmptyState, ErrorState, LoadingBlock } from '../components/Feedback.jsx';
import { Modal } from '../components/Modal.jsx';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { useResource } from '../lib/useResource.js';
import { adminApi, API_URL } from '../lib/api.js';

const blank = () => ({ heading:'',description:'',buttonText:'',buttonLink:'/shop',imageUrl:'',displayOrder:0,isActive:false });
const payload = value => ({ heading:value.heading.trim(),description:value.description.trim(),buttonText:value.buttonText.trim(),buttonLink:value.buttonLink.trim(),imageUrl:value.imageUrl.trim(),displayOrder:Number(value.displayOrder),isActive:value.isActive===true });
const imageUrl = value => value?.startsWith('/') ? `${API_URL}${value}` : value;
function BannerPreview({ banner, editing = false }) {
  const [broken,setBroken]=useState(false);
  useEffect(()=>setBroken(false),[banner.imageUrl]);
  return <div className={`banner-preview ${editing?'banner-preview-editor':''}`}>
    {banner.imageUrl&&!broken?<img src={imageUrl(banner.imageUrl)} alt={banner.heading||'Banner image'} onError={()=>setBroken(true)}/>:<div className="banner-image-placeholder"><span aria-hidden="true">▧</span><small>{broken?'Image unavailable':'Add a banner image'}</small></div>}
    <div className="banner-preview-shade"/>
    <div className="banner-preview-copy"><span>PREMIUM PANTRY</span><h3>{banner.heading || 'Your banner heading'}</h3>{banner.description&&<p>{banner.description}</p>}{banner.buttonText&&<span className="banner-preview-cta">{banner.buttonText} <span aria-hidden="true">→</span></span>}</div>
  </div>;
}
export default function BannersPage() {
  const {data,loading,error,reload}=useResource(()=>adminApi.cms.list('banners'),[]);
  const [search,setSearch]=useState(''),[status,setStatus]=useState('all'),[editor,setEditor]=useState(null),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false),[formError,setFormError]=useState(''),[busyId,setBusyId]=useState(''),[dragging,setDragging]=useState(false);
  const fileInput=useRef(null), original=useRef('');
  const confirm=useConfirm(),toast=useToast();
  const items=data||[], active=items.filter(item=>item.isActive).length;
  const filtered=useMemo(()=>items.filter(item=>(status==='all'||Boolean(item.isActive)===(status==='active'))&&`${item.heading} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase())),[data,search,status]);
  const open=item=>{const value=item?{...blank(),...item}: {...blank(),displayOrder:items.length?Math.max(...items.map(item=>item.displayOrder||0))+10:0};original.current=JSON.stringify(value);setEditor(value);setFormError('');};
  const close=async()=>{if(saving||uploading)return;if(JSON.stringify(editor)!==original.current&&!await confirm({title:'Discard unsaved changes?',message:'Your banner edits have not been saved.',confirmLabel:'Discard changes'}))return;setEditor(null);};
  const change=(key,value)=>setEditor(current=>({...current,[key]:value}));
  const upload=async file=>{
    if(!file||uploading||saving)return;
    setFormError('');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setFormError('Choose a JPEG, PNG or WebP image.');return;}
    if(file.size>12*1024*1024){setFormError('Choose an image smaller than 12 MB.');return;}
    setUploading(true);
    try{const result=await adminApi.cms.uploadImage(file);change('imageUrl',imageUrl(result.url));toast.success('Image uploaded. Save the banner to apply it.');}catch(cause){setFormError(cause.message);}finally{setUploading(false);if(fileInput.current)fileInput.current.value='';}
  };
  const save=async event=>{
    event.preventDefault();setFormError('');
    const value=payload(editor);
    if(!value.heading||!value.imageUrl){setFormError('Add a heading and an image before saving.');return;}
    if(!/^(https?:\/\/|\/)/i.test(value.imageUrl)){setFormError('Use an image URL beginning with http://, https:// or /.');return;}
    if(value.buttonText&&!/^(https?:\/\/|\/(?!\/)|#)/i.test(value.buttonLink)){setFormError('Add a button destination such as /shop or an HTTPS URL.');return;}
    if(!Number.isInteger(value.displayOrder)||value.displayOrder<0){setFormError('Display order must be a whole number of zero or more.');return;}
    setSaving(true);
    try{if(editor._id)await adminApi.cms.update('banners',editor._id,value);else await adminApi.cms.create('banners',value);setEditor(null);toast.success(value.isActive?'Banner saved and published.':'Banner saved as a draft.');await reload();}catch(cause){setFormError(cause.message);}finally{setSaving(false);}
  };
  const toggle=async item=>{setBusyId(item._id);try{await adminApi.cms.update('banners',item._id,payload({...blank(),...item,isActive:!item.isActive}));toast.success(item.isActive?'Banner hidden from the storefront.':'Banner published on the storefront.');await reload();}catch(cause){toast.error(cause.message);}finally{setBusyId('');}};
  const remove=async item=>{if(!await confirm({title:'Delete banner?',message:`“${item.heading}” will be permanently removed, including its uploaded image.`,tone:'danger',confirmLabel:'Delete banner'}))return;setBusyId(item._id);try{await adminApi.cms.remove('banners',item._id);toast.success('Banner deleted.');await reload();}catch(cause){toast.error(cause.message);}finally{setBusyId('');}};
  const working=saving||uploading;
  return <div className="banners-page">
    <PageHeader eyebrow="MARKETING / STOREFRONT" title="Banners" description="Create and manage the promotions customers see on your homepage." actions={<button className="admin-btn admin-btn-primary" onClick={()=>open()} disabled={loading||Boolean(error)}><span aria-hidden="true">+</span> Add banner</button>}/>
    <div className="banners-overview"><div><span className="banners-overview-icon" aria-hidden="true">▧</span><div><b>Homepage carousel</b><p>Active banners rotate in display order. Lower numbers appear first.</p></div></div><div className="banners-counts"><span><b>{items.length}</b> Total</span><span className="banners-count-live"><b>{active}</b> Active</span><span><b>{items.length-active}</b> Drafts</span></div></div>
    <div className="banners-toolbar"><label className="banners-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search banners" placeholder="Search banners…" value={search} onChange={event=>setSearch(event.target.value)}/></label><div className="banners-tabs" role="group" aria-label="Filter banners">{[['all','All banners'],['active','Active'],['draft','Drafts']].map(([value,label])=><button type="button" key={value} aria-pressed={status===value} className={status===value?'selected':''} onClick={()=>setStatus(value)}>{label}</button>)}</div><button className="admin-btn admin-btn-ghost" disabled={loading} onClick={reload} aria-label="Refresh banners">↻</button></div>
    {error?<ErrorState error={error} onRetry={reload}/>:loading?<LoadingBlock label="Loading banners…" rows={4}/>:!filtered.length?<div className="banners-empty"><EmptyState icon="▧" title={items.length?'No matching banners':'Your next promotion starts here'} description={items.length?'Try a different search or status filter.':'Add an image, a short headline and a link to your collection.'} action={items.length?<button className="admin-btn admin-btn-ghost" onClick={()=>{setSearch('');setStatus('all');}}>Clear filters</button>:<button className="admin-btn admin-btn-primary" onClick={()=>open()}>Create your first banner</button>}/></div>:<div className="banners-grid">{filtered.map(item=><article className="banner-card" key={item._id}><div className="banner-card-image"><BannerPreview banner={item}/><span className={`banner-status ${item.isActive?'banner-status-live':''}`}><i/>{item.isActive?'Active':'Draft'}</span><span className="banner-order">Order {item.displayOrder}</span></div><div className="banner-card-body"><h2>{item.heading}</h2><p>{item.description || 'No supporting description'}</p><div className="banner-link"><span aria-hidden="true">↗</span>{item.buttonText?<><b>{item.buttonText}</b><span>{item.buttonLink||'No destination'}</span></>:<span>No button added</span>}</div></div><footer className="banner-card-footer"><button className="admin-btn admin-btn-ghost" disabled={Boolean(busyId)} onClick={()=>open(item)}>Edit banner</button><button className="banner-publish" disabled={Boolean(busyId)} onClick={()=>toggle(item)}>{busyId===item._id?'Updating…':item.isActive?'Hide banner':'Publish'}</button><button className="banner-delete" aria-label={`Delete ${item.heading}`} disabled={Boolean(busyId)} onClick={()=>remove(item)}>Delete</button></footer></article>)}</div>}
    <Modal open={Boolean(editor)} title={editor?._id?'Edit banner':'Create a banner'} description="Build your promotion, preview it, then choose when to publish." onClose={close} size="lg" footer={editor&&<><button className="admin-btn admin-btn-ghost" disabled={working} onClick={close}>Cancel</button><button type="submit" form="banner-editor-form" className="admin-btn admin-btn-primary" disabled={working}>{uploading?'Uploading image…':saving?'Saving…':editor.isActive?'Save and publish':'Save draft'}</button></>}>
      {editor&&<div className="banner-editor-layout"><form id="banner-editor-form" className="banner-editor-form" onSubmit={save}><fieldset disabled={working}>
        <div className="banner-form-section"><h3>1. Banner image</h3><p>Use a wide image for the homepage carousel.</p><button type="button" className={`banner-upload ${dragging?'banner-upload-dragging':''}`} onClick={()=>fileInput.current?.click()} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);upload(event.dataTransfer.files?.[0]);}}><span aria-hidden="true">↑</span><b>{uploading?'Uploading…':editor.imageUrl?'Replace image':'Upload banner image'}</b><small>Drop an image here or click to browse</small></button><input ref={fileInput} className="banner-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload banner image file" onChange={event=>upload(event.target.files?.[0])}/><p className="banner-field-hint">1080 × 330 px recommended · 2160 × 660 px for sharper images. JPEG, PNG or WebP · up to 12 MB.</p><details className="banner-url-input"><summary>Or use an image URL</summary><label>Image URL<input maxLength={500} value={editor.imageUrl} placeholder="https://… or /uploads/…" onChange={event=>change('imageUrl',event.target.value)}/></label></details></div>
        <div className="banner-form-section"><h3>2. Your message</h3><label>Headline <span className="banner-required">*</span><input required maxLength={140} placeholder="e.g. Goodness in every handful" value={editor.heading} onChange={event=>change('heading',event.target.value)}/></label><label>Supporting text <span className="banner-optional">Optional</span><textarea rows={3} maxLength={5000} placeholder="Keep it short and easy to read." value={editor.description} onChange={event=>change('description',event.target.value)}/></label><div className="banner-form-row"><label>Button text <span className="banner-optional">Optional</span><input maxLength={80} placeholder="Shop now" value={editor.buttonText} onChange={event=>change('buttonText',event.target.value)}/></label><label>Button destination<input maxLength={500} placeholder="/shop" value={editor.buttonLink} onChange={event=>change('buttonLink',event.target.value)}/></label></div></div>
        <div className="banner-form-section"><h3>3. Visibility &amp; order</h3><label className="banner-active-check"><input type="checkbox" checked={editor.isActive} onChange={event=>change('isActive',event.target.checked)}/><span><b>Show on the storefront</b><small>{editor.isActive?'This banner will go live when you save.':'Keep this banner as a draft until you are ready.'}</small></span></label><label>Display order<input type="number" min={0} step={1} required value={editor.displayOrder} onChange={event=>change('displayOrder',event.target.value)}/><small className="banner-field-hint">Lower numbers appear earlier in the carousel.</small></label></div>
      </fieldset>{formError&&<p className="banner-form-error" role="alert">{formError}</p>}</form><aside className="banner-editor-preview"><div className="banner-preview-heading"><b>Live preview</b><span>Homepage</span></div><BannerPreview banner={editor} editing/><p>Your text is placed over the image. Keep important details near the centre; mobile screens crop the sides.</p><div className="banner-preview-note"><span aria-hidden="true">◈</span><div><b>{editor.isActive?'Ready to publish':'Draft mode'}</b><p>{editor.isActive?'Saving makes this banner visible to customers.':'You can save now and publish later from the banner list.'}</p></div></div></aside></div>}
    </Modal>
  </div>;
}
