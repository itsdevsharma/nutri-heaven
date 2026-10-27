// Run from the repository root with: node --env-file=backend/.env backend/scripts/migrate-cloudinary.cjs
// Copies referenced Cloudinary images, checkpoints progress, then updates exact URLs.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { v2: cloudinary } = require('cloudinary');
const mongoose = require('mongoose');
const target = 'n5epotfs';
const stateDir = path.resolve('backend/.migration');
const galleryFile = 'frontend/src/store/photos.json';
const cloudUrl = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/(.+)$/;
function collect(value, urls) {
  if (typeof value === 'string' && cloudUrl.test(value) && !value.startsWith(`https://res.cloudinary.com/${target}/`)) urls.add(value);
  else if (Array.isArray(value)) value.forEach(item => collect(item, urls));
  else if (value && typeof value === 'object' && value.constructor === Object) Object.values(value).forEach(item => collect(item, urls));
}
function replacements(value, mapping, prefix = '', changes = {}) {
  if (typeof value === 'string' && mapping[value]) changes[prefix] = mapping[value].url;
  else if (Array.isArray(value)) value.forEach((item, index) => replacements(item, mapping, prefix ? `${prefix}.${index}` : String(index), changes));
  else if (value && typeof value === 'object' && value.constructor === Object) Object.entries(value).forEach(([key,item]) => { if (key !== '_id') replacements(item, mapping, prefix ? `${prefix}.${key}` : key, changes); });
  return changes;
}
function upload(url) {
  return new Promise((resolve, reject) => {
    const parts = new URL(url).pathname.split('/upload/')[1].split('/');
    if (/^v\d+$/.test(parts[0])) parts.shift();
    // Only original delivery URLs are supported, to avoid silently copying a transformed derivative.
    if (parts[0].includes(',')) return reject(new Error('Transformed URL needs manual review'));
    const publicId = parts.join('/').replace(/\.[^/.]+$/, '');
    const params = { public_id: publicId, overwrite: false, timestamp: Math.floor(Date.now()/1000) };
    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
    const fields = { file: url, api_key: process.env.CLOUDINARY_API_KEY, signature, ...params };
    const quote = value => '"' + String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n') + '"';
    const config = [`url = "https://api.cloudinary.com/v1_1/${target}/image/upload"`, 'silent', 'show-error', 'max-time = 120', ...Object.entries(fields).map(([key,value])=>`form-string = ${quote(`${key}=${value}`)}`)].join('\n');
    const child = spawn('curl',['--config','-'],{stdio:['pipe','pipe','pipe']});
    let result=''; child.stdout.on('data',chunk=>result+=chunk); child.stderr.resume();
    child.on('error',()=>reject(new Error('Unable to launch upload')));
    child.on('close',code=> { try { const data=JSON.parse(result); if(code || !data.secure_url) throw new Error('Upload rejected'); resolve({url:data.secure_url,publicId:data.public_id}); } catch { reject(new Error(`Upload failed for ${publicId}`)); } });
    child.stdin.end(config);
  });
}
async function main() {
  await fs.mkdir(stateDir,{recursive:true,mode:0o700});
  const mappingFile=path.join(stateDir,'cloudinary-map.json');
  let mapping={}; try { mapping=JSON.parse(await fs.readFile(mappingFile,'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; }
  const gallery=JSON.parse(await fs.readFile(galleryFile,'utf8'));
  const urls=new Set(); collect(gallery,urls);
  let db, databaseError;
  const documents=[];
  try {
    await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:15000}); db=mongoose.connection.db;
    for(const collection of await db.listCollections({}, {nameOnly:true}).toArray()) {
      if(collection.name.startsWith('system.')) continue;
      for await(const document of db.collection(collection.name).find({})) {
        const found=new Set(); collect(document,found);
        if(found.size) { found.forEach(url=>urls.add(url)); documents.push({collection:collection.name,document}); }
      }
    }
    console.log(`Found ${documents.length} database documents with Cloudinary references.`);
  } catch { databaseError=true; console.log('Database could not be read. Database references will not be modified.'); }
  console.log(`Found ${urls.size} source image URLs.`);
  for(const url of urls) {
    if(!mapping[url]) { mapping[url]=await upload(url); await fs.writeFile(mappingFile,JSON.stringify(mapping,null,2),{mode:0o600}); }
    console.log(`Copied ${Object.keys(mapping).length} images (including checkpointed copies).`);
  }
  await fs.writeFile(path.join(stateDir,'gallery-before.json'),JSON.stringify(gallery,null,2),{flag:'wx',mode:0o600}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  for(const photo of gallery) {
    if(mapping[photo.url]) { const copy=mapping[photo.url]; photo.url=copy.url; photo.publicId=copy.publicId; }
    if(mapping[photo.originalUrl]) { const copy=mapping[photo.originalUrl]; photo.originalUrl=copy.url; photo.originalPublicId=copy.publicId; }
  }
  await fs.writeFile(galleryFile,JSON.stringify(gallery,null,2)+'\n');
  if(db) {
    // Extended JSON keeps BSON types intact in the recoverable snapshot.
    const {EJSON}=mongoose.mongo.BSON;
    await fs.writeFile(path.join(stateDir,`db-before-${Date.now()}.json`),EJSON.stringify(documents),{mode:0o600});
    for(const {collection,document} of documents) {
      const changes=replacements(document,mapping);
      // Compare each old value so concurrent edits are never overwritten.
      const filter={_id:document._id};
      for(const field of Object.keys(changes)) filter[field]=field.split('.').reduce((value,key)=>value[key],document);
      const result=await db.collection(collection).updateOne(filter,{$set:changes});
      if(result.matchedCount!==1) throw new Error(`Document changed during migration in ${collection}; rerun to reconcile`);
    }
    console.log(`Updated ${documents.length} database documents.`);
  }
  console.log('Store gallery references updated. Source images were retained.');
  await mongoose.disconnect();
  if(databaseError) process.exitCode=2;
}
main().catch(async error=>{console.error(String(error.message).replace(/mongodb[^\s]+|cloudinary:\/\/[^\s]+/g,'[redacted]')); await mongoose.disconnect(); process.exitCode=1;});
