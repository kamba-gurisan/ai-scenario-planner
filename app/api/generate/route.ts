import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode, prompt, text, theme, details, axes } = body;

    // --- Mode 1: シナリオ生成 ---
    if (mode === 'scenario') {
      let systemInstructionText = `あなたは世界最高峰の戦略コンサルタントであり、SF作家です。STEEP分析を用い、2030年の未来シナリオを構築します。
      
      ## タスク
      1. 事業テーマに基づき、不確実性が高く影響度の大きい2つの変動要因（X軸、Y軸）を特定。
         Min/Maxの状態は「4文字以内の短い単語」で表現。
      2. 4つの未来シナリオ(A:左上, B:右上, C:左下, D:右下)を作成。
      3. 各シナリオの発生確率は、現在の「初期兆候(Early Signs)」に基づき、合計100%になるようメリハリをつけて配分（一律25%は禁止）。

      ## 出力JSONフォーマット (厳守)
      {
          "axisX": { "label": "...", "min": "...", "max": "..." },
          "axisY": { "label": "...", "min": "...", "max": "..." },
          "rationale": "...",
          "scenarios": [
              { 
                  "id": "Scenario A", 
                  "title": "...", 
                  "headline": "...", 
                  "insight": {"context":"...","issue":"...","breakthrough":"..."}, 
                  "actionAdvice": "...", 
                  "story": "...", 
                  "earlySigns": ["兆候1", "兆候2"], 
                  "imgPrompt": "Detailed prompt...",
                  "audioTone": "Speak in a ... tone:", 
                  "probability": 40, 
                  "allocation": [
                    // ★重要: valは 1(低)〜5(高) の5段階評価で出力すること
                    {"subject":"イノベーション","val":5}, 
                    {"subject":"マーケティング","val":3}, 
                    {"subject":"人材・組織","val":2}, 
                    {"subject":"既存事業","val":4}, 
                    {"subject":"財務・リスク","val":3}
                  ] 
              }
          ]
      }`;

      if (axes) {
        systemInstructionText += `\n\n【重要】以下の軸設定を必ず使用してください。空欄(undefined/null/空文字)の項目については、テーマに合わせてあなたが最適値を補完してください。\n`;
        
        const xLabel = axes.x.label ? `"${axes.x.label}"` : "AIが決定";
        const xMin = axes.x.min ? `"${axes.x.min}"` : "AIが決定";
        const xMax = axes.x.max ? `"${axes.x.max}"` : "AIが決定";
        systemInstructionText += `Thinking Axis X: Label=${xLabel}, Min=${xMin}, Max=${xMax}\n`;

        const yLabel = axes.y.label ? `"${axes.y.label}"` : "AIが決定";
        const yMin = axes.y.min ? `"${axes.y.min}"` : "AIが決定";
        const yMax = axes.y.max ? `"${axes.y.max}"` : "AIが決定";
        systemInstructionText += `Thinking Axis Y: Label=${yLabel}, Min=${yMin}, Max=${yMax}\n`;
      }

      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        systemInstruction: systemInstructionText,
        generationConfig: { responseMimeType: "application/json" }
      });

      const userPrompt = `テーマ: ${theme}\n詳細コンテキスト: ${details}`;
      const result = await model.generateContent(userPrompt);
      const response = await result.response;
      return NextResponse.json({ text: response.text() });
    }

    // --- Mode 2: 画像生成 ---
    if (mode === 'image') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: prompt }],
          parameters: { sampleCount: 1, aspectRatio: "16:9" }
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      const base64 = data.predictions?.[0]?.bytesBase64Encoded || data.predictions?.[0]?.image?.bytesBase64Encoded;
      return NextResponse.json({ base64 });
    }

    // --- Mode 3: 音声生成 ---
    if (mode === 'speech') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } }
          }
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      return NextResponse.json({ audioData: data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data });
    }

    // --- Mode 4: 要約 (Summarize) ---
    if (mode === 'summarize') {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const promptText = `以下のテキストを、プレゼン資料の表紙に載せる「前提条件」として、箇条書きまたは短い文章で3行以内（150文字程度）に要約してください。
      
      【重要】
      ・「以下に要約します」「要約は以下の通りです」といった導入文や挨拶は一切書かないでください。
      ・純粋な要約テキストのみを出力してください。
      
      テキスト:\n${text}`;
      
      const result = await model.generateContent(promptText);
      const response = await result.response;
      return NextResponse.json({ summary: response.text() });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });

  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}