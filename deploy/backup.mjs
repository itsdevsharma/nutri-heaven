// Runs as root with Node's --env-file pointing to backend/.env.
// Credentials go into a mode-0600 mongodump config, never command arguments.
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, rename, readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.umask(0o077);
const root = '/var/www/apps/nutri-heaven';
const directory = '/var/backups/nutri/daily';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const temporary = await mkdtemp(join(tmpdir(), 'nutri-backup-'));
const archive = join(directory, `nutri-${stamp}.tar.gz`);
const retentionDays = 14;
function run(command, args) {
  // Tool output may contain database connection details: retain only in a
  // private diagnostic file, never in the public service journal.
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30 * 60_000 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed`);
}
try {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const config = join(temporary, 'mongo.yml');
  await writeFile(config, JSON.stringify({ uri: process.env.MONGODB_URI }), { mode: 0o600 });
  run('/usr/local/bin/mongodump', [`--config=${config}`, `--archive=${join(temporary, 'database.archive.gz')}`, '--gzip', '--quiet']);
  await rm(config);
  run('/usr/bin/tar', ['-czf', join(temporary, 'application.tar.gz'), '--exclude=node_modules', '--exclude=.git', '--exclude=frontend/dist.backup*', '--exclude=frontend/release-*', '-C', root, 'backend', 'frontend', 'deploy']);
  run('/usr/bin/tar', ['-czf', `${archive}.partial`, '-C', temporary, 'database.archive.gz', 'application.tar.gz', '-C', '/', 'etc/nginx', 'etc/systemd/system/nutri-seo.service', 'etc/systemd/system/pm2-deploy.service']);
  await rename(`${archive}.partial`, archive);
  // Rotate only after a complete successful backup. Incomplete jobs never
  // remove the last good backup or update the success marker.
  for (const name of await readdir(directory)) {
    if (!/^nutri-.*\.tar\.gz$/.test(name)) continue;
    const path = join(directory, name);
    if (Date.now() - (await stat(path)).mtimeMs > retentionDays * 86400_000) await rm(path);
  }
  await writeFile(join(directory, 'last-success.json'), JSON.stringify({ completedAt: new Date().toISOString(), archive, bytes: (await stat(archive)).size }) + '\n', { mode: 0o600 });
  console.log('Application and database backup completed. Local retention: 14 days.');
} catch (error) {
  console.error(`Backup failed: ${error.message}`);
  await rm(`${archive}.partial`, { force: true });
  process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
