// Service Worker — מאפשר לאפליקציה לעבוד גם בלי אינטרנט ולהיות מותקנת במסך הבית.
self.window = self; // firebase-config.js נכתב לדפדפן וכותב ל-window
importScripts('./firebase-config.js');
const CACHE = 'tasks-v24';
const FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './manifest.webmanifest',
  './icon.svg',
  './badge-96.png',
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
    badge: './badge-96.png',
    dir: 'rtl',
    lang: 'he',
    tag: d.tag || undefined,
    data: { url: d.url || './', taskId: d.taskId || null, taskTitle: (d.title || '').replace(/^⏰ /, '') },
    // כפתורי פעולה על תזכורת של משימה: נודניק וסימון כבוצע
    actions: d.taskId ? [
      { action: 'snooze60', title: '⏰ נודניק שעה' },
      { action: 'done', title: '✔ בוצע' }
    ] : []
  }));
});

// ===== פעולות מהתראות בלי לפתוח את האפליקציה =====
// "בוצע" מקפיץ התראת אישור, והאישור (וגם הנודניק) מעדכנים את המסד ישירות
// מהרקע דרך Firestore REST. אם משהו נכשל — נפתחת האפליקציה כמו פעם.

// אסימון גישה מהחיבור השמור של Firebase (נשמר על ידי האפליקציה ב-IndexedDB)
async function getIdToken() {
  const cfg = self.FIREBASE_CONFIG;
  if (!cfg) throw new Error('אין הגדרות Firebase');
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('firebaseLocalStorageDb');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const rows = await new Promise((res, rej) => {
    const rq = db.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').getAll();
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  db.close();
  const row = rows.find(r => String(r.fbase_key || '').startsWith('firebase:authUser:'));
  const refresh = row && row.value && row.value.stsTokenManager && row.value.stsTokenManager.refreshToken;
  if (!refresh) throw new Error('אין התחברות שמורה');
  const resp = await fetch(`https://securetoken.googleapis.com/v1/token?key=${cfg.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refresh)}`
  });
  if (!resp.ok) throw new Error('חידוש ההתחברות נכשל');
  return (await resp.json()).access_token;
}

const fsBase = () => `https://firestore.googleapis.com/v1/projects/${self.FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

async function fsGetTask(token, id) {
  const r = await fetch(`${fsBase()}/tasks/${id}`, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('קריאת המשימה נכשלה');
  const f = (await r.json()).fields || {};
  return {
    hasRepeat: !!(f.repeat && f.repeat.mapValue),
    done: !!(f.done && f.done.booleanValue),
    remindAts: ((f.remindAts && f.remindAts.arrayValue && f.remindAts.arrayValue.values) || [])
      .map(v => Number(v.integerValue || v.doubleValue || 0)).filter(Boolean)
  };
}

async function fsPatch(token, id, fields, masks) {
  const qs = masks.map(m => 'updateMask.fieldPaths=' + m).join('&');
  const r = await fetch(`${fsBase()}/tasks/${id}?${qs}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!r.ok) throw new Error('עדכון המשימה נכשל');
}

function miniNotify(title, d, extra) {
  return self.registration.showNotification(title, {
    body: d.taskTitle || '', icon: './icon-192.png', badge: './badge-96.png',
    dir: 'rtl', lang: 'he', tag: 'confirm-' + d.taskId, data: { url: './' }, ...extra
  });
}

async function completeFromNotification(d) {
  try {
    const token = await getIdToken();
    const t = await fsGetTask(token, d.taskId);
    if (t.done) { await miniNotify('✔ כבר סומנה כבוצעה', d); return; }
    if (t.hasRepeat) {
      // משימה חוזרת — חישוב המועד הבא נעשה באפליקציה; נפתחת בלי לשאול שוב
      await clients.openWindow(`./?act=done-confirmed&task=${d.taskId}&ts=${Date.now()}`);
      return;
    }
    await fsPatch(token, d.taskId, {
      done: { booleanValue: true },
      completedAt: { integerValue: String(Date.now()) }
    }, ['done', 'completedAt']);
    await miniNotify('✔ המשימה סומנה כבוצעה', d);
  } catch (err) {
    await clients.openWindow(`./?act=done-confirmed&task=${d.taskId}&ts=${Date.now()}`);
  }
}

async function snoozeFromNotification(d) {
  try {
    const token = await getIdToken();
    const t = await fsGetTask(token, d.taskId);
    const now = Date.now();
    const remindAts = [...new Set([...t.remindAts.filter(ms => ms > now), now + 3600000])].sort((a, b) => a - b);
    await fsPatch(token, d.taskId, {
      remindAts: { arrayValue: { values: remindAts.map(ms => ({ integerValue: String(ms) })) } },
      remindAt: { nullValue: null }
    }, ['remindAts', 'remindAt']);
    await miniNotify('⏰ אזכיר שוב בעוד שעה', d);
  } catch (err) {
    await clients.openWindow(`./?act=snooze60&task=${d.taskId}&ts=${Date.now()}`);
  }
}

// לחיצה על התראה — פעולות ברקע; לחיצה על גוף ההתראה פותחת את האפליקציה
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  if (e.action === 'cancel') return;
  if (e.action === 'confirm-done' && d.taskId) {
    e.waitUntil(completeFromNotification(d));
    return;
  }
  if (e.action === 'done' && d.taskId) {
    // שלב אישור בתוך ההתראות — בלי לפתוח את האפליקציה
    e.waitUntil(self.registration.showNotification('לסמן כבוצע? ✔', {
      body: d.taskTitle || '',
      icon: './icon-192.png', badge: './badge-96.png', dir: 'rtl', lang: 'he',
      tag: 'confirm-' + d.taskId,
      requireInteraction: true,
      data: d,
      actions: [{ action: 'confirm-done', title: '✔ כן, בוצע' }, { action: 'cancel', title: 'ביטול' }]
    }));
    return;
  }
  if (e.action === 'snooze60' && d.taskId) {
    e.waitUntil(snoozeFromNotification(d));
    return;
  }
  if (e.action && d.taskId) {
    // פעולה לא מוכרת — הזרימה הישנה דרך האפליקציה
    e.waitUntil(clients.openWindow(`./?act=${e.action}&task=${d.taskId}&ts=${Date.now()}`));
    return;
  }
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return clients.openWindow('./');
    })
  );
});
