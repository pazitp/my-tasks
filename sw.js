// Service Worker — מאפשר לאפליקציה לעבוד גם בלי אינטרנט ולהיות מותקנת במסך הבית.
const CACHE = 'tasks-v4';
const FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// קודם מנסים מהרשת (כדי לקבל עדכונים), ואם אין אינטרנט — מהמטמון.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

// ===== התראות דחיפה =====
// השרת שולח הודעות "נתונים" דרך Firebase Cloud Messaging, וכאן מציגים אותן —
// גם כשהאפליקציה סגורה וגם כשהיא פתוחה.
self.addEventListener('push', e => {
  let d = {};
  try { d = (e.data && e.data.json().data) || {}; } catch (err) { /* הודעה לא מוכרת */ }
  if (!d.title) return;
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    dir: 'rtl',
    lang: 'he',
    tag: d.tag || undefined,
    data: { url: d.url || './' }
  }));
});

// לחיצה על התראה — פותחת את האפליקציה
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return clients.openWindow('./');
    })
  );
});
