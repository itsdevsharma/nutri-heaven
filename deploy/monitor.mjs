import { readFile } from 'node:fs/promises';
let failed = false;
for (const [path, type] of [['/api/health', 'application/json'], ['/robots.txt', 'text/plain'], ['/sitemap.xml', 'xml']]) {
  try {
    const response = await fetch(`https://nutriheaven.co.in${path}`, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok || !response.headers.get('content-type')?.includes(type)) throw Error('Unexpected status/content');
    console.log(`Healthy: ${path}`);
  } catch { failed = true; console.error(`Unhealthy: ${path}`); }
}
try {
  const marker = JSON.parse(await readFile('/var/backups/nutri/daily/last-success.json', 'utf8'));
  const age = Date.now() - Date.parse(marker.completedAt);
  if (!Number.isFinite(age) || age > 27 * 3600_000 || marker.bytes <= 0) throw Error();
  console.log('Backup freshness: healthy');
} catch { failed = true; console.error('Backup missing, empty or older than 27 hours'); }
// A failed unit is visible in systemctl --failed and journald. This is local
// monitoring; off-server outage alerting still needs an external service.
process.exitCode = failed ? 1 : 0;
