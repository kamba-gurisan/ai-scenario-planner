import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode, prompt, text, theme, details, axes } = body;

    // --- Mode 1: シナリオ生成 (ポートフォリオ分析コメント追加版) ---
    if (mode === 'scenario') {
      let systemInstructionText = `あなたは世界最高峰の戦略コンサルタントであり、同時に**希望を描くベストセラー作家**でもあります。
      これから作成するシナリオには、**「論理的なビジネス分析」と「情緒的な希望の物語」の両方が求められます。**
      以下のルールに従い、モードを明確に切り替えて出力してください。
      
      ## タスク
      1. 事業テーマに基づき、不確実性が高く影響度の大きい2つの変動要因（X軸、Y軸）を特定。
      2. 4つの未来シナリオ(A, B, C, D)を作成。
      3. 各シナリオの発生確率は、現在の「初期兆候」に基づきメリハリをつけて配分。
      4. **ポートフォリオ分析**: 4つのシナリオ全体のリソース配分傾向を分析し、解説文を作成。

      ## ★重要: マトリクス定義 (厳守)
      - **X軸**: 左 = Min, 右 = Max
      - **Y軸**: 下 = Min, 上 = Max
      - **Scenario A (左上)**: [X=Min, Y=Max]
      - **Scenario B (右上)**: [X=Max, Y=Max]
      - **Scenario C (左下)**: [X=Min, Y=Min]
      - **Scenario D (右下)**: [X=Max, Y=Min]

      ## 記述ルールの切り替え (最重要)

      ### 1. 【Story】フィールド: "希望と人間賛歌の物語"
      - **絶対ルール**: 設定がいかに過酷な状況（Min/Min）であっても、**最後は必ず「希望」「救い」「笑顔」で終わらせてください。**
      - 重苦しい結末、バッドエンドは一切禁止です。
      - **主人公の設定**: テーマに関連する職業の人物を設定。
        - **★名前のルール**: **「カタカナで氏または名のみ」**（例：タナカ、ケンジ）にすること。フルネーム禁止。
      - 内容は、その環境下で懸命に生き、知恵とテクノロジーで未来を切り開く**「人間賛歌」**のトーンにすること。
      - **文字数: 日本語で450文字以内（厳守）。**

      ### 2. 【Insight】フィールド: "論理的・客観的"
      - ここは**「物語」ではありません。** 戦略コンサルタントとして、冷徹かつ客観的に分析してください。
      - 主人公の名前やストーリーの要素は一切出さないでください。
      - **文体**: ビジネスレポート調（「〜である」）。断定形で簡潔に。
      - **内容は具体的かつ戦略的に**:
         - context: そのシナリオにおける市場環境の概況。**（重要: カード表示用に100文字程度に短く要約すること）**
         - issue: 企業が直面する構造的な経営課題。
         - breakthrough: 収益化のための具体的なビジネスモデルや技術的解決策。
      
      ### 3. 【Early Signs】フィールド
      - 現在すでに起きている、または起き始めている「未来の兆候」を**必ず3つ**挙げてください。

      ## 出力JSONフォーマット (厳守)
      {
          "axisX": { "label": "...", "min": "...", "max": "..." },
          "axisY": { "label": "...", "min": "...", "max": "..." },
          "rationale": "...",
          "portfolioAnalysis": "戦略ポートフォリオ（リソース配分）の全体傾向、あるいは各シナリオ間の顕著な違いについての戦略的考察。100文字程度の日本語で解説。",
          "scenarios": [
              { 
                  "id": "Scenario A", 
                  "title": "...", 
                  "headline": "...", 
                  "insight": {
                    "context": "市場環境の概況(100文字程度)...",
                    "issue": "...",
                    "breakthrough": "..."
                  }, 
                  "actionAdvice": "...", 
                  "story": "主人公の物語...", 
                  "earlySigns": ["兆候1", "兆候2", "兆候3"], 
                  "imgPrompt": "Detailed prompt in English describing a cinematic shot of the protagonist (from the story) smiling confidently in a successful moment. Bright lighting, inspiring atmosphere. No text.",
                  "audioTone": "Speak in a positive, inspiring, and confident tone:", 
                  "probability": 40, 
                  "allocation": [
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

    // --- Mode 2: 画像生成 (Imagen 4.0) ---
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
      if (!response.ok) {
        const errText = await response.text();
        console.error("Imagen Error:", errText);
        throw new Error(`Image Gen Failed: ${errText}`);
      }
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