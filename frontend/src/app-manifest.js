export function appManifestFor(path) {
  const admin = /^\/admin(?:\/|$)/.test(path);
  return admin
    ? { href: '/assets/pwa/admin.webmanifest', name: 'Nutri Heaven Admin' }
    : { href: '/manifest.webmanifest', name: 'Nutri Heaven' };
}

export function configureAppManifest(document, path) {
  const app = appManifestFor(path);
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', app.href);
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', app.name);
}
