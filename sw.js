// Service Worker version
const CACHE_VERSION = 'v1';
const CACHE_NAME = `simplos-cache-${CACHE_VERSION}`;

// Files to cache
const urlsToCache = [
  '/',
  '/index.min.html',
  '/vocabs.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install event - caches app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((cacheName) => {
          return cacheName.startsWith('simplos-cache-') && cacheName !== CACHE_NAME;
        }).map((cacheName) => {
          return caches.delete(cacheName);
        })
      );
    })
  );
});

// Fetch event - serve from cache if possible
self.addEventListener('fetch', (event) => {
  // Handle non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip Supabase API requests to ensure fresh data
  if (event.request.url.includes('mczfgzffyyyacisrccqb.supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then(
          (response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
              
            return response;
          }
        ).catch(() => {
          // Fallback for offline experience
          if (event.request.url.endsWith('.html') || event.request.url === '/' || event.request.url.endsWith('/')) {
            return caches.match('/index.min.html');
          }
        });
      })
  );
});