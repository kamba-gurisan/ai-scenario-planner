AI Scenario Planner - デプロイガイドこのドキュメントは、AI Scenario Planner を本番環境（Vercel, Netlify等）にデプロイする際の手順と、Firebaseの認証エラーを解決する方法について説明します。1. Firebase 承認済みドメインの設定Canvas環境で発生していた auth/unauthorized-domain エラーは、本番環境のドメインをFirebaseコンソールに登録することで完全に解消されます。Firebase Console にアクセスし、プロジェクトを開きます。左メニューから Authentication を選択します。設定 (Settings) タブをクリックします。承認済みドメイン (Authorized domains) セクションまでスクロールします。ドメインを追加 (Add domain) ボタンをクリックします。デプロイ先のドメインを入力します（例: your-app-name.vercel.app）。localhost はデフォルトで許可されています。追加 をクリックして完了です。これで、登録したドメインからの Googleログイン が正常に機能するようになります。2. APIキーの環境変数設定セキュリティを強化するため、ソースコードに直書きされているAPIキーを削除し、環境変数を使用するように変更することを強く推奨します。手順.env.local ファイルの作成プロジェクトのルートに .env.local ファイルを作成し、以下の内容を記述します。NEXT_PUBLIC_GEMINI_API_KEY=あなたのGemini_APIキー
App.jsx の修正App.jsx 内の apiKey 定義部分を以下のように修正します。変更前:// Gemini API Key (Running in Canvas environment)
const apiKey = ""; 
変更後:// Gemini API Key
const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
デプロイ先での環境変数設定Vercelなどのホスティングサービスを使用する場合、ダッシュボードの設定画面（Settings > Environment Variables）で同じ環境変数を追加してください。3. Firebase 設定の隠蔽（オプション）現在、firebaseConfig はコード内にハードコードされています。これを環境変数に移すことも可能です。.env.local に各項目を追加します。NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
...
App.jsx で firebaseConfig オブジェクトを以下のように書き換えます。const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  // ... 他の項目も同様に
};
4. 本番公開後の動作確認デプロイが完了したら、以下の点を確認してください。Googleログイン: 「Login」ボタンを押し、Googleアカウント選択画面が表示され、正常にログインできること。※ エラーが出る場合は、手順1のドメイン設定が反映されるまで数分待ってから再試行してください。シナリオ生成: テーマを入力して生成ボタンを押し、AIからの応答があること。データ保存: 生成結果がFirestoreに保存され、再読み込みしても履歴に残っていること。以上の手順で、商用利用可能なレベルでアプリケーションを公開できます。