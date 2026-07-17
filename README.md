# המשימות שלי ✅

אפליקציית משימות ותזכורות בעברית — מחליפה את Remember the Milk, בחינם.

- **כתובת (אחרי פרסום):** https://pazitp.github.io/my-tasks/
- **תשתית:** GitHub Pages + Firebase (אותו פרויקט כמו אפליקציית המתכונים: `family-recipes-e9d80`)
- **קוד מקומי:** `C:\Users\user\my-tasks`

## מה יש בפנים

- הוספת משימות בשפה חופשית בעברית: "לשלם לגננת ביום ראשון האחרון של כל חודש #תשלומים"
- חזרות מתוחכמות: כל X ימים/שבועות/חודשים, ימים מסוימים בשבוע, יום ה-N (או האחרון) בחודש, ו"X זמן אחרי שסיימתי"
- רשימות עם צבעים, עדיפויות, הערות, דחייה במקש אחד
- תזכורות דחיפה לטלפון + סיכום בוקר יומי (נשלחים ע"י GitHub Actions כל 10 דקות)
- רקעים לבחירה, עברית מלאה RTL, עובד גם בלי אינטרנט (PWA)

## שלבי התקנה שנותרו (עושים פעם אחת)

1. **GitHub** — ליצור מאגר ציבורי `my-tasks` תחת החשבון pazitp, לדחוף את הקוד, ולהפעיל
   GitHub Pages (Settings ‣ Pages ‣ Deploy from branch ‣ main).
2. **סיסמה** — בכניסה הראשונה לאפליקציה מקלידים סיסמה חדשה ולוחצים על
   "פעם ראשונה כאן?" — זה יוצר את המשתמש `pazit@tasks.app` (ההרשמה בסיסמת אימייל
   כבר מופעלת בפרויקט בזכות אפליקציית המתכונים).
3. **חוקי אבטחה** — במסוף Firebase ‣ Firestore ‣ Rules להדביק את התוכן של
   `firestore.rules` (מוסיף את tasks/taskLists/taskMeta לחוקים של המתכונים).
4. **מפתח התראות (VAPID)** — במסוף Firebase ‣ Project settings ‣ Cloud Messaging ‣
   Web configuration ‣ Generate key pair, ולהעתיק את המפתח אל `window.VAPID_KEY`
   ב-`firebase-config.js`.
5. **מפתח לשרת התזכורות** — במסוף Firebase ‣ Project settings ‣ Service accounts ‣
   Generate new private key. את תוכן קובץ ה-JSON שומרים ב-GitHub כסוד בשם
   `FIREBASE_SERVICE_ACCOUNT` (Settings ‣ Secrets and variables ‣ Actions).
6. **בטלפון** — לפתוח את הכתובת בכרום, "הוספה למסך הבית", לפתוח את האפליקציה,
   ובהגדרות ⚙️ ללחוץ "הפעלת התראות במכשיר הזה".

## פיתוח מקומי

```
npx http-server . -p 8318 -c-1
```

ואז לפתוח `http://localhost:8318/?demo` — מצב הדגמה ששומר נתונים במכשיר בלבד.
