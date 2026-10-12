// Run the replica bootstrap in native Node, outside Jest's VM realm. The MongoDB
// 7 driver/BSON metadata Map handling fails across realms during the handshake.
const { MongoMemoryReplSet } = require('mongodb-memory-server');
let replica;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (replica) await replica.stop();
  process.exit(0);
}
process.on('message', message => { if (message === 'stop') void stop(); });
process.on('disconnect', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
(async () => {
  try {
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    if (process.connected) process.send({ uri: replica.getUri('website_completion') });
    else await stop();
  } catch (error) {
    if (process.connected) process.send({ error: error.message });
    await stop();
  }
})();
