// Scripts for firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCSDdPaACXeTpupdbitnoNTfe0tbr67Qf8",
  authDomain: "heartly-d5ea0.firebaseapp.com",
  projectId: "heartly-d5ea0",
  storageBucket: "heartly-d5ea0.firebasestorage.app",
  messagingSenderId: "971471751446",
  appId: "1:971471751446:web:255cad0aa011ddc8252837"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Background Message Handler
// Note: If payload contains 'notification' key, browser might handle it automatically.
// We add this to handle 'data' only messages or enhance notification if possible.
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // If the browser hasn't already shown a notification (because of the 'notification' key),
  // or if we want to show a custom one based on 'data'.
  
  // Typically, if 'notification' key exists in payload, this callback runs but
  // the system *also* shows a notification. To prevent duplicates, check payload structure.
  
  if (payload.data && !payload.notification) {
    const notificationTitle = payload.data.title || 'Heartly Voice';
    const notificationOptions = {
      body: payload.data.body,
      icon: payload.data.icon || '/icon.png',
      badge: '/icon.png',
      data: {
          url: payload.data.url || '/'
      },
      requireInteraction: true,
      vibrate: [200, 100, 200]
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
  }
});

// Handle Notification Click
self.addEventListener('notificationclick', function(event) {
  console.log('Notification clicked', event);
  event.notification.close();

  // Try to find the URL from data, fallback to root
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Focus existing window if available
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        const clientUrl = new URL(client.url, self.location.origin).pathname;
        
        // Simple match or root match
        if (clientUrl === '/' || client.url.includes(targetUrl)) {
            if ('focus' in client) {
                return client.focus();
            }
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});