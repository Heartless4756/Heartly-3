
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
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title || 'Heartly Voice';
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png', // Ensure you have an icon.png in public folder
    badge: '/icon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
