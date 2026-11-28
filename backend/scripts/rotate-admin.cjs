// Run in backend: node --env-file=.env scripts/rotate-admin.cjs
// ADMIN_PASSWORD_FILE must point to a mode-0600 file containing the new secret.
// ADMIN_EMAIL selects the existing account; this never creates an administrator.
const fs = require('node:fs');
const mongoose = require('mongoose');
const { hash } = require('bcryptjs');
const { validateProductionAdminPassword } = require('../dist/auth/admin-password');
async function main() {
  const path = process.env.ADMIN_PASSWORD_FILE;
  if (!path || !process.env.ADMIN_EMAIL || !process.env.MONGODB_URI) throw new Error('Set ADMIN_PASSWORD_FILE, ADMIN_EMAIL and MONGODB_URI');
  if ((fs.statSync(path).mode & 0o077) !== 0) throw new Error('Password file must be accessible only to its owner (chmod 600)');
  const password = fs.readFileSync(path, 'utf8').trim();
  validateProductionAdminPassword(password);
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const result = await mongoose.connection.collection('admins').updateOne(
      { email: process.env.ADMIN_EMAIL.trim().toLowerCase(), isActive: true },
      { $set: { passwordHash: await hash(password, 12), updatedAt: new Date() }, $inc: { authVersion: 1 }, $unset: { refreshTokenHash: '' } },
    );
    if (result.matchedCount !== 1) throw new Error('Active administrator not found; nothing was changed');
    console.log('Administrator password rotated; existing administrator sessions revoked.');
  } finally { await mongoose.disconnect(); }
}
main().catch(() => { console.error('Administrator rotation failed; check configuration and database access.'); process.exitCode = 1; });
