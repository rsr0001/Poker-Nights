(() => {
  'use strict';
  const bar = document.createElement('section');
  bar.className = 'app-tools';
  bar.setAttribute('aria-label', 'App installation and updates');
  bar.innerHTML = '<div class="actions"><button type="button" class="secondary" id="install-app">Add to home screen</button><button type="button" class="secondary" id="refresh-app">Refresh app</button></div><p id="app-update-status" role="status" aria-live="polite"></p>';
  document.querySelector('footer').before(bar);
  const install = bar.querySelector('#install-app');
  const refresh = bar.querySelector('#refresh-app');
  const status = bar.querySelector('#app-update-status');
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  install.hidden = standalone();
  let prompt, registration, refreshing = false;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); prompt = event; install.hidden = standalone();
  });
  window.addEventListener('appinstalled', () => { install.hidden = true; prompt = null; status.textContent = 'Poker Nights is installed.'; });
  install.addEventListener('click', async () => {
    if (prompt) {
      await prompt.prompt(); await prompt.userChoice; prompt = null;
    } else {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      status.textContent = ios ? 'In Safari, tap Share, then Add to Home Screen. Turn on Open as Web App if shown, then tap Add.' : 'Open this link in Chrome or Edge, then choose Install app or Add to home screen from the browser menu.';
    }
  });
  const offerUpdate = () => {
    if (registration?.waiting) { status.textContent = 'A new version is ready. Tap Refresh app to update. Your saved game stays on this device.'; refresh.textContent = 'Refresh to update'; }
  };
  async function checkUpdates() {
    if (registration && navigator.onLine) { await registration.update(); offerUpdate(); }
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (refreshing) window.location.reload(); });
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(value => {
      registration = value; offerUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offerUpdate(); });
      });
      checkUpdates().catch(() => {});
    }).catch(() => { status.textContent = 'Home-screen installation may be unavailable in this browser. You can still play and refresh.'; });
    window.addEventListener('focus', () => checkUpdates().catch(() => {}));
    window.addEventListener('online', () => checkUpdates().catch(() => {}));
    setInterval(() => { if (!document.hidden) checkUpdates().catch(() => {}); }, 15 * 60 * 1000);
  }
  refresh.addEventListener('click', async () => {
    if (!navigator.onLine) { status.textContent = 'You are offline. Your saved game is available; reconnect to download updates.'; return; }
    refresh.disabled = true; status.textContent = 'Checking for updates…';
    try {
      await checkUpdates();
      if (registration?.installing) {
        const worker = registration.installing;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error('Update is still downloading. Try Refresh app again shortly.')), 15000);
          const changed = () => {
            if (worker.state === 'installed' || worker.state === 'redundant') {
              clearTimeout(timer); worker.removeEventListener('statechange', changed); resolve();
            }
          };
          worker.addEventListener('statechange', changed); changed();
        });
      }
      if (registration?.waiting) { refreshing = true; registration.waiting.postMessage({type:'ACTIVATE_UPDATE'}); }
      else window.location.reload();
    } catch (error) { status.textContent = error.message || 'Could not check for updates. Try again when connected.'; refresh.disabled = false; }
  });
})();
