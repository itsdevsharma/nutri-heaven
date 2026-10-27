// Run from the repository root:
// node --env-file=backend/.env backend/scripts/upload-store-gallery.cjs <input-manifest.json>
// The input contains { index, original, edited?, caption, alt } entries.
// Only public image metadata is written to the storefront; credentials stay in .env.
const { v2: cloudinary } = require('cloudinary');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

async function main() {
  if (!process.env.CLOUDINARY_URL) throw new Error('CLOUDINARY_URL is required');
  if (!process.argv[2]) throw new Error('Provide the input photo manifest path');
  cloudinary.config({ secure: true });
  const entries = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
  const uploaded = [];
  for (const entry of entries) {
    const upload = async (file, kind) => {
      const bytes = await fs.readFile(file);
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
      const params = {
        folder: 'nutri-heaven/store-gallery',
        public_id: `shop-${String(entry.index + 1).padStart(2, '0')}-${kind}-${hash}`,
        overwrite: 'false', timestamp: String(Math.floor(Date.now() / 1000)),
      };
      const config = cloudinary.config();
      const signature = cloudinary.utils.api_sign_request(params, config.api_secret);
      // curl also works on hosts where Node's direct TLS connection times out.
      const args = ['--silent', '--show-error', '--fail-with-body', '--connect-timeout', '15', '--max-time', '120',
        `https://api.cloudinary.com/v1_1/${config.cloud_name}/image/upload`,
        '--form', `file=@${path.resolve(file)}`, '--form-string', `api_key=${config.api_key}`,
        '--form-string', `signature=${signature}`];
      for (const [key, value] of Object.entries(params)) args.push('--form-string', `${key}=${value}`);
      let result;
      try { result = JSON.parse(execFileSync('curl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
      catch { throw new Error(`Cloudinary upload failed for photo ${entry.index + 1} (${kind})`); }
      if (!result.secure_url) throw new Error('Cloudinary returned no image URL');
      return { url: result.secure_url, publicId: result.public_id, width: result.width, height: result.height };
    };
    const original = await upload(entry.original, 'original');
    const edited = entry.edited ? await upload(entry.edited, 'edited') : original;
    uploaded.push({ ...edited, originalUrl: original.url, originalPublicId: original.publicId, caption: entry.caption, alt: entry.alt });
    // Persist progress so successful uploads remain reviewable if a later upload fails.
    await fs.mkdir('output/store-gallery', { recursive: true });
    await fs.writeFile('output/store-gallery/upload-progress.json', JSON.stringify(uploaded, null, 2) + '\n');
    console.log(`Uploaded photo ${uploaded.length}/${entries.length} (source and gallery version)`);
  }
  await fs.mkdir('frontend/src/store', { recursive: true });
  await fs.writeFile('frontend/src/store/photos.json.tmp', JSON.stringify(uploaded, null, 2) + '\n');
  await fs.rename('frontend/src/store/photos.json.tmp', 'frontend/src/store/photos.json');
}
main().catch(error => { console.error('Store gallery upload failed:', { code: error.http_code || error.code, message: String(error.message || 'Unknown error').replace(/cloudinary:\/\/[^\s]+/g, '[redacted]') }); process.exitCode = 1; });
