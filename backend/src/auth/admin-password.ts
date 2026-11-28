/** Bootstrap/rotation passwords must never reuse development credentials. */
export function validateProductionAdminPassword(password: string): void {
  if (password.length < 16 || /^(dev|admin|password|changeme|replace)/i.test(password)) {
    throw new Error('Use a unique production administrator password of at least 16 characters');
  }
}
