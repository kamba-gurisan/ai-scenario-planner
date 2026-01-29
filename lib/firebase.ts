import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ご提供いただいた設定情報（本来は環境変数で管理しますが、今回は直接記述します）
const firebaseConfig = {
  apiKey: "AIzaSyD4YzalqlL1wzzLB-zUTFwQCUTMNgyefWY",
  authDomain: "ai-scenario-pro-2026.firebaseapp.com",
  projectId: "ai-scenario-pro-2026",
  storageBucket: "ai-scenario-pro-2026.firebasestorage.app",
  messagingSenderId: "439423354212",
  appId: "1:439423354212:web:62fc734dc452a03082e671"
};

// アプリの初期化（二重起動防止）
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// 他のファイルで使えるようにエクスポートする
export { app, auth, db };