const CACHE_NAME = 'iwacusystem-shell-v4';
const API_CACHE_NAME = 'iwacusystem-api-v1';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/iwacu-mark-192.png',
  '/iwacu-mark-512.png',
  '/iwacu-app-icon-192.png',
  '/iwacu-app-icon-512.png',
];

function getUserSession(request) {
  const authorization = request.headers.get('Authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  try {
    let payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    payload += '='.repeat((4 - payload.length % 4) % 4);
    const userId = JSON.parse(atob(payload)).sub;
    return typeof userId === 'string' ? { userId, token } : null;
  } catch (error) {
    console.error('Unable to identify user for offline cache:', error);
    return null;
  }
}

async function cacheKey(request, userSession) {
  const url = new URL(request.url);
  const tokenHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userSession.token));
  const sessionKey = Array.from(new Uint8Array(tokenHash), byte => byte.toString(16).padStart(2, '0')).join('');
  url.searchParams.set('__offline_user', userSession.userId);
  url.searchParams.set('__offline_session', sessionKey);
  url.searchParams.set('__offline_method', request.method.toLowerCase());
  for (const header of ['Accept', 'Range', 'Prefer', 'Accept-Profile']) {
    const value = request.headers.get(header);
    if (value) url.searchParams.set(`__offline_${header.toLowerCase()}`, value);
  }
  return new Request(url.toString(), { method: 'GET', mode: 'cors' });
}

async function notifyClients(type) {
  try {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type }));
  } catch (error) {
    console.error('Unable to broadcast offline connection status:', error);
  }
}

async function clearUserCache(cache, userId) {
  if (!userId) return;
  const keys = await cache.keys();
  await Promise.all(keys.filter(request => {
    return new URL(request.url).searchParams.get('__offline_user') === userId;
  }).map(request => cache.delete(request)));
}

function markOfflineResponse(cached) {
  const headers = new Headers(cached.headers);
  headers.set('X-Iwacu-Offline-Cache', 'true');
  return new Response(cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers,
  });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== API_CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CLEAR_USER_OFFLINE_CACHE' || typeof event.data.userId !== 'string') return;

  event.waitUntil(
    caches.open(API_CACHE_NAME).then(async cache => {
      const keys = await cache.keys();
      await Promise.all(keys.filter(request => {
        return new URL(request.url).searchParams.get('__offline_user') === event.data.userId;
      }).map(request => cache.delete(request)));
    }).catch(error => console.error('Unable to clear signed-out user offline data:', error))
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  if ((event.request.method === 'GET' || event.request.method === 'HEAD') && requestUrl.pathname.includes('/rest/v1/')) {
    const userSession = getUserSession(event.request);
    if (!userSession) return;

    event.respondWith((async () => {
      const key = await cacheKey(event.request, userSession);
      const cache = await caches.open(API_CACHE_NAME);
      if (self.navigator.onLine === false) {
        await notifyClients('OFFLINE_NETWORK_UNAVAILABLE');
        const cached = await cache.match(key, { ignoreVary: true });
        if (!cached) throw new Error('No saved response is available for this offline request.');
        return markOfflineResponse(cached);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(new Request(event.request, { signal: controller.signal }));
        clearTimeout(timeout);
        await notifyClients('OFFLINE_NETWORK_AVAILABLE');
        if (response.ok && response.type !== 'opaque' && !response.headers.get('Cache-Control')?.toLowerCase().includes('no-store')) {
          try {
            const cacheableResponse = event.request.method === 'HEAD'
              ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers })
              : response.clone();
            await cache.put(key, cacheableResponse);
          } catch (error) {
            console.error('Unable to save Supabase response for offline use:', error);
          }
        }
        return response;
      } catch (error) {
        clearTimeout(timeout);
        await notifyClients('OFFLINE_NETWORK_UNAVAILABLE');
        const cached = await cache.match(key, { ignoreVary: true });
        if (!cached) throw error;
        return markOfflineResponse(cached);
      }
    })());
    return;
  }

  if (event.request.method !== 'GET' && requestUrl.pathname.includes('/rest/v1/')) {
    const userSession = getUserSession(event.request);
    event.respondWith(fetch(event.request).then(async response => {
      if (response.ok && userSession) {
        const cache = await caches.open(API_CACHE_NAME);
        await clearUserCache(cache, userSession.userId);
      }
      await notifyClients('OFFLINE_NETWORK_AVAILABLE');
      return response;
    }).catch(async error => {
      await notifyClients('OFFLINE_NETWORK_UNAVAILABLE');
      throw error;
    }));
    return;
  }

  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  if (requestUrl.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }))
    );
  }
});
