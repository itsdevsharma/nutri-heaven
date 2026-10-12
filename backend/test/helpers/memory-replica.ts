import { fork } from 'node:child_process';
import { join } from 'node:path';
export async function startMemoryReplica(): Promise<{ uri: string; stop: () => Promise<void> }> {
  const child = fork(join(__dirname, 'memory-replica.cjs'), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const stop = () => new Promise<void>(resolve => {
    if (child.exitCode !== null) { resolve(); return; }
    child.once('exit', () => resolve());
    if (child.connected) child.send('stop'); else child.kill('SIGTERM');
  });
  try {
    const uri = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Replica startup timed out')), 90000);
      child.once('message', (message: { uri?: string; error?: string }) => { clearTimeout(timer); if (message.uri) resolve(message.uri); else reject(new Error(message.error ?? 'Replica startup failed')); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Replica exited before startup: ${code}`)); });
    });
    return { uri, stop };
  } catch (error) { await stop(); throw error; }
}
