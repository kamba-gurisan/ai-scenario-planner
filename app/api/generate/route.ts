import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// .env.localに設定したAPIキーを読み込む
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(request: Request) {
  try {
    // 画面(フロントエンド)から送られてきたメッセージを受け取る
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    // Geminiモデルの準備 (必要に応じて "gemini-1.5-pro" などに変更可)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // AIに生成を依頼
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 結果を画面に返す
    return NextResponse.json({ text });
    
  } catch (error) {
    console.error("Error generating content:", error);
    return NextResponse.json({ error: "Failed to generate content" }, { status: 500 });
  }
}