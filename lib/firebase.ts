import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
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

// Firebaseアプリの初期化
const app = initializeApp(firebaseConfig);

// Auth（認証）機能の初期化
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Firestore（DB）機能の初期化（今後のためにエクスポートしておきます）
export const db = getFirestore(app);