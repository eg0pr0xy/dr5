/* INSTRUMENT-DR5 service worker: offline shell + dynamic icons */
const CACHE_NAME = 'dr5-shell-v2';
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '/');
const SHELL_URLS = [BASE_PATH, `${BASE_PATH}index.html`, `${BASE_PATH}manifest.webmanifest`];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(SHELL_URLS);
      } catch {}
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

async function generatePngIcon(size) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#E5D9C4';
      ctx.lineWidth = Math.max(2, Math.floor(size * 0.02));
      // grid frame
      ctx.strokeRect(0.5 * ctx.lineWidth, 0.5 * ctx.lineWidth, size - ctx.lineWidth, size - ctx.lineWidth);
      // text
      ctx.fillStyle = '#E5D9C4';
      ctx.font = `${Math.floor(size * 0.33)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DR5', size / 2, size / 2);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return new Response(blob, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } });
    }
  } catch {}
  // Fallback SVG if OffscreenCanvas unavailable
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#0A0A0A"/><rect x="2" y="2" width="${size-4}" height="${size-4}" fill="none" stroke="#E5D9C4" stroke-width="4"/><text x="50%" y="54%" fill="#E5D9C4" font-family="monospace" font-size="${Math.floor(size*0.33)}" text-anchor="middle">DR5</text></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Dynamic icon endpoints
  if (url.pathname.endsWith('/icons/icon-192.png')) {
    event.respondWith(generatePngIcon(192));
    return;
  }
  if (url.pathname.endsWith('/icons/icon-512.png')) {
    event.respondWith(generatePngIcon(512));
    return;
  }

  // App shell for navigations
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(request);
          // Update cache in background
          const cache = await caches.open(CACHE_NAME);
          cache.put(`${BASE_PATH}index.html`, net.clone());
          return net;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(`${BASE_PATH}index.html`);
          if (cached) return cached;
          return new Response('<h1>OFFLINE</h1>', { headers: { 'Content-Type': 'text/html' } });
        }
      })()
    );
    return;
  }

  // Cache-first for static assets
  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const net = await fetch(request);
          cache.put(request, net.clone());
          return net;
        } catch {
          return new Response('', { status: 504 });
        }
      })()
    );
    return;
  }
});
