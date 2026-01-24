"use client"; // これはおまじない（ブラウザで動く部品であることを示す）

import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  // 送信ボタンを押した時の処理
  const handleGenerate = async () => {
    if (!input) return;
    setLoading(true);
    setResult("");

    try {
      // さっき作った裏側のAPI (/api/generate) を呼び出す
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input }),
      });

      const data = await response.json();
      if (data.text) {
        setResult(data.text);
      } else {
        setResult("エラーが発生しました。");
      }
    } catch (error) {
      console.error(error);
      setResult("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex flex-col items-center">
      <main className="max-w-2xl w-full bg-white p-6 rounded-xl shadow-md space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">AI Scenario Planner Pro</h1>
        
        {/* 入力エリア */}
        <textarea
          className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
          rows={5}
          placeholder="ここにシナリオの条件やプロンプトを入力してください..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        {/* ボタン */}
        <button
          onClick={handleGenerate}
          disabled={loading}
          className={`w-full py-3 px-6 rounded-lg font-bold text-white transition-colors ${
            loading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {loading ? "AIが思考中..." : "シナリオを生成する"}
        </button>

        {/* 結果表示エリア */}
        {result && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h2 className="font-bold text-blue-800 mb-2">生成結果:</h2>
            <div className="whitespace-pre-wrap text-gray-800">{result}</div>
          </div>
        )}
      </main>
    </div>
  );
}