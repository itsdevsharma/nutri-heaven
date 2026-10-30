/** Trust only explicit ingress networks; never every forwarded hop. */
export function proxyTrust(environment: NodeJS.ProcessEnv = process.env): false | string[] {
  if (environment.TRUST_PROXY !== 'true') {
    if (environment.NODE_ENV === 'production') throw new Error('TRUST_PROXY=true is required behind the production HTTPS proxy');
    return false;
  }
  const networks = (environment.TRUST_PROXY_CIDRS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (!networks.length) throw new Error('TRUST_PROXY_CIDRS must list the trusted ingress IP addresses or CIDRs');
  if (networks.some(value => ['0.0.0.0/0', '::/0'].includes(value))) throw new Error('TRUST_PROXY_CIDRS cannot trust the entire internet');
  return networks;
}
