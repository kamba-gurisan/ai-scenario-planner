"use client";

import { useState } from "react";
// 👇 さっき確認した共通ファイルを読み込む（パスは必要なら "../firebase" などに調整）
import { db, auth } from "../lib/firebase"; 
import { collection, addDoc, onSnapshot } from "firebase/firestore";

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

    // 念のためログで確認（F12コンソールで見れます）
    console.log("User ID:", user.uid); 

    try {
      // 1. Firestoreの 'users' コレクションに書き込む
      const docRef = await addDoc(
        collection(db, "users", user.uid, "checkout_sessions"), 
        {
          price: "price_1SuxSuBmI7NWOgZIPX8UxsSH", // あなたのID
          success_url: window.location.origin,
          cancel_url: window.location.origin,
        }
      );

      // 2. 拡張機能の反応を待つ
      onSnapshot(docRef, (snap) => {
        const data = snap.data() as any;
        if (data?.error) {
          console.error("Stripe Error:", data.error);
          alert(`エラー: ${data.error.message}`);
          setLoading(false);
        }
        if (data?.url) {
          window.location.assign(data.url);
        }
      });

    } catch (error) {
      console.error("Error:", error);
      alert("エラーが発生しました。ログインし直してみてください。");
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleCheckout}
      disabled={loading}
      style={{
        backgroundColor: "#635bff", color: "white", padding: "12px 24px", 
        border: "none", borderRadius: "4px", fontSize: "16px", cursor: "pointer", opacity: loading ? 0.7 : 1
      }}
    >
      {loading ? "準備中..." : "Proプランにアップグレード (¥1,480)"}
    </button>
  );
}