import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// FIX (post-Track-D user report): "Tap to refresh" on the update-available
// banner (F1League.jsx's registerSW()/updateSW(true)) silently did nothing.
// vite-plugin-pwa's injectManifest strategy (unlike generateSW) does NOT
// auto-inject a SKIP_WAITING message handler into the service worker — the
// client-side updateSW(true) call correctly posts that message to the
// waiting worker, but with nothing listening for it here, self.skipWaiting()
// never ran, the new worker never activated, and the page never reloaded.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Firebase Messaging Service Worker. This remains a classic script after
// injectManifest bundles it, so importScripts continues to work in Firefox.
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "__VITE_FIREBASE_API_KEY__",
  authDomain:        "__VITE_FIREBASE_AUTH_DOMAIN__",
  projectId:         "__VITE_FIREBASE_PROJECT_ID__",
  storageBucket:     "__VITE_FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
  appId:             "__VITE_FIREBASE_APP_ID__",
});

const messaging = firebase.messaging();

// Handle background notifications (app is closed / backgrounded)
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  if (!title) return;
  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data ?? {},
    requireInteraction: false,
  });
});

// Clicking a notification opens the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.actionUrl || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
