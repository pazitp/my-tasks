// הגדרות החיבור למסד הנתונים (Firebase) — אותו פרויקט כמו אפליקציית המתכונים.
// המפתחות האלה מזהים את הפרויקט בלבד — הגישה לנתונים מוגנת בסיסמה (Firebase Auth).

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDt-39XAEA7lxI84nmi_2A1uq1amIQwPJ0",
  authDomain: "family-recipes-e9d80.firebaseapp.com",
  projectId: "family-recipes-e9d80",
  storageBucket: "family-recipes-e9d80.firebasestorage.app",
  messagingSenderId: "862756721156",
  appId: "1:862756721156:web:3d99bfba5e02bfff641b51"
};

// חשבון המשימות הפרטי של פזית (נפרד מחשבון המתכונים המשפחתי)
window.TASKS_EMAIL = "pazit@tasks.app";

// מפתח להתראות דחיפה (Web Push) — מתמלא בשלב ההתקנה מתוך מסוף Firebase.
window.VAPID_KEY = "BFbn7sUjD_6BlzGQPE4VK-DSdOdE87NHFMJg1IvYTJdsmq2Dg4GXv330OGpRLMfaG4mv0uH8Wc93h951dIzuKGM";
