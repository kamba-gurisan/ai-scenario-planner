"use client"; // Next.js (App Router)の場合はこれが必要

import { useState } from "react";
import { getFirestore, collection, addDoc, onSnapshot } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { initializeApp, getApps, getApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyD4YzalqlL1wzzLB-zUTFwQCUTMNgyefWY",
  authDomain: "ai-scenario-pro-2026.firebaseapp.com",
  projectId: "ai-scenario-pro-2026",
  storageBucket: "ai-scenario-pro-2026.firebasestorage.app",
  messagingSenderId: "439423354212",
  appId: "1:439423354212:web:62fc734dc452a03082e671"
};

// Firebaseの初期化（二重初期化防止）
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

export default function CheckoutButton() {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    const user = auth.currentUser;

    if (!user) {
      alert("ログインしてから押してください！");
      setLoading(false);
      return;
    }

    try {
      // 1. Firestoreに「支払いたい」というデータを書き込む
      const docRef = await addDoc(
        collection(db, "customers", user.uid, "checkout_sessions"), 
        {
          price: "price_1SuxSuBmI7NWOGzIPX8UxssH", // ★ここにStripeのID（price_...）を貼り付け！
          success_url: window.location.origin, // 成功したら元のページに戻る
          cancel_url: window.location.origin,  // キャンセルしても戻る
        }
      );

      // 2. 拡張機能がURLを作ってくれるのを監視する
      onSnapshot(docRef, (snap) => {
       const { error, url } = snap.data() as any;
        
        if (error) {
          console.error("Stripe Error:", error);
          alert(`エラーが発生しました: ${error.message}`);
          setLoading(false);
        }
        
        if (url) {
          // 3. URLができたらStripeの決済画面へジャンプ！
          window.location.assign(url);
        }
      });

    } catch (error) {
      console.error("Error:", error);
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleCheckout}
      disabled={loading}
      style={{
        backgroundColor: "#635bff", 
        color: "white", 
        padding: "12px 24px", 
        border: "none", 
        borderRadius: "4px", 
        fontSize: "16px",
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.7 : 1
      }}
    >
      {loading ? "準備中..." : "Proプランにアップグレード (¥1,000)"}
    </button>
  );
}