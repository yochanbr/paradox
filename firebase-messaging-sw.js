importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Must match your firebase-config.js exactly
const firebaseConfig = {
  apiKey: "AIzaSyDbU2GGI-w5T1p-NA3bJ7_ULjqq-P_k2Z8",
  authDomain: "paradox-489b5.firebaseapp.com",
  projectId: "paradox-489b5",
  storageBucket: "paradox-489b5.firebasestorage.app",
  messagingSenderId: "287620619857",
  appId: "1:287620619857:web:4824932c7e62d52cf22270"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/assets/logo.png' // Ensure this exists
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
