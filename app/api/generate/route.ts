import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode, prompt, text, theme, details, axes } = body;

    // --- Mode 1: シナリオ生成 (STORY 600文字版) ---
    if (mode === 'scenario') {
      let systemInstructionText = `あなたは世界最高峰の戦略コンサルタントであり、同時に**希望を描くベストセラー作家**でもあります。
      これから作成するシナリオには、**「論理的なビジネス分析」と「情緒的な希望の物語」の両方が求められます。**
      以下のルールに従い、モードを明確に切り替えて出力してください。
      
      ## タスク
      1. 事業テーマに基づき、不確実性が高く影響度の大きい2つの変動要因（X軸、Y軸）を特定。
      2. 4つの未来シナリオ(A, B, C, D)を作成。
      3. 各シナリオの発生確率は、現在の「初期兆候」に基づきメリハリをつけて配分。
      4. **ポートフォリオ分析**: 各シナリオで求められる「理想的なリソース配分」を比較分析。

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
      - **文字数: 日本語で600文字程度（厳守）。**

      ### 2. 【Insight & Action】フィールド: "高校生でもわかる論理的解説"
      - ここは**「物語」ではありません**が、専門用語ばかりの難解なレポートも禁止です。
      - **ターゲット**: **「高校生」に向けて、ビジネスの仕組みや戦略をわかりやすく解説するつもりで書いてください。**
      - **文体**: 「〜です/ます」調。専門用語は噛み砕いて説明すること。
      - **各項目の定義**:
         - **context**: 市場環境の概況。**（重要: カード表示用に100文字程度に短く要約すること）**
         - **issue**: 企業が直面する構造的な経営課題。
         - **breakthrough (BUSINESS INSIGHT)**: 
             - なぜその解決策がビジネスとして成り立つのか？ 従来と何が違うのか？
             - **300文字程度**で、論理的かつ丁寧に解説してください。
         - **actionAdvice (ACTION)**:
             - 企業や個人は具体的にどう動くべきか？ 成功の鍵は何か？
             - **300文字程度**で、具体的なアクションを提案してください。
      
      ### 3. 【Early Signs】フィールド
      - 現在すでに起きている、または起き始めている「未来の兆候」を**必ず3つ**挙げてください。

      ### 4. 【Allocation & Portfolio Analysis】フィールド (戦略リソース配分)
      - **allocation**: そのシナリオが現実になった際、**「企業が成功するためにとるべき理想的なリソース配分（戦略）」**を5段階で示してください。
      - **portfolioAnalysis**: 4つのシナリオそれぞれの「理想的な戦略（配分）」を見比べ、**共通して投資すべき分野や、シナリオによって判断が分かれる戦略的ポイント**を、100文字程度の日本語で特徴的に解説してください。

      ## 出力JSONフォーマット (厳守)
      {
          "axisX": { "label": "...", "min": "...", "max": "..." },
          "axisY": { "label": "...", "min": "...", "max": "..." },
          "rationale": "...",
          "portfolioAnalysis": "4つの戦略配分全体の特徴や違いについての分析コメント(100文字程度)",
          "scenarios": [
              { 
                  "id": "Scenario A", 
                  "title": "...", 
                  "headline": "...", 
                  "insight": {
                    "context": "市場環境の概況(100文字程度)...",
                    "issue": "...",
                    "breakthrough": "高校生でもわかる300文字程度の丁寧なビジネスインサイト解説..."
                  }, 
                  "actionAdvice": "高校生でもわかる300文字程度の具体的なアクション提案...", 
                  "story": "主人公の物語(600文字程度)...", 
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