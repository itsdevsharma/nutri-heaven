// Parser-blocking boot marker: runs before the server-rendered body is painted.
// An external file keeps the site's strict script policy intact.
(function () {
  document.documentElement.dataset.appBooting = 'true';
  setTimeout(function () {
    delete document.documentElement.dataset.appBooting;
    var root = document.getElementById('root');
    if (!root || !root.querySelector('.store-fallback')) return;
    var note = document.createElement('p');
    note.className = 'store-boot-note';
    note.append('The interactive store could not load. ');
    var retry = document.createElement('a');
    retry.href = '';
    retry.textContent = 'Try again';
    note.append(retry);
    root.prepend(note);
  }, 15000);
})();
