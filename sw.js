/**
 * Service Worker for Heimdall Landing Page
 * Provides caching for faster repeat visits without triggering install prompt
 */

const CACHE_NAME = 'heimdall-v1';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// Assets to cache on install (critical resources)
const PRECACHE_ASSETS = [
  '/',
  '/fonts/inter-latin.woff2',
];

// Cache strategies
const CACHE_FIRST_EXTENSIONS = [
  '.woff2', '.woff', '.ttf',  // Fonts
  '.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.ico',  // Images
];

const STALE_WHILE_REVALIDATE_EXTENSIONS = [
  '.css', '.js',  // Stylesheets and scripts
];

// Install event - precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache with appropriate strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  const extension = url.pathname.split('.').pop()?.toLowerCase() || '';

  // Cache-first for static assets (fonts, images)
  if (CACHE_FIRST_EXTENSIONS.some(ext => url.pathname.endsWith(ext))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Stale-while-revalidate for CSS/JS
  if (STALE_WHILE_REVALIDATE_EXTENSIONS.some(ext => url.pathname.endsWith(ext))) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Network-first for HTML (navigation requests)
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Default: network with cache fallback
  event.respondWith(networkFirst(request));
});

// Cache-first strategy (best for immutable assets)
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return offline fallback if available
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Stale-while-revalidate (serve cached, update in background)
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

// Network-first strategy (best for HTML)
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    // Return a basic offline page for navigation requests
    if (request.mode === 'navigate') {
      return new Response(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title></head><body style="background:#00161d;color:#bceafa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center"><h1>You are offline</h1><p>Please check your connection and try again.</p></div></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    }
    throw error;
  }
}
