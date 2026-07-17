// Service Worker להתראות דחיפה — מציג התראות גם כשהאפליקציה סגורה.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDt-39XAEA7lxI84nmi_2A1uq1amIQwPJ0",
  authDomain: "family-recipes-e9d80.firebaseapp.com",
  projectId: "family-recipes-e9d80",
  storageBucket: "family-recipes-e9d80.firebasestorage.app",
  messagingSenderId: "862756721156",
  appId: "1:862756721156:web:3d99bfba5e02bfff641b51"
});

const messaging = firebase.messaging();

// הודעות שמגיעות כ"נתונים" (בלי notification מוכן) — מציגים ידנית.
messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  if (!d.title) return; // אם יש notification בהודעה, הדפדפן מציג לבד
  self.registration.showNotification(d.title, {
    body: d.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    dir: 'rtl',
    lang: 'he',
    tag: d.tag || undefined,
    data: { url: d.url || './' }
  });
});

// לחיצה על התראה — פותחת את האפליקציה.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return clients.openWindow('./');
    })
  );
});
