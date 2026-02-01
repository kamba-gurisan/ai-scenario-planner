# 実装計画 - ヘルプボタンとGeminiダイアログの追加

UI上部に「HELP」ボタンを追加し、クリックするとこのアプリについての質問に回答するGeminiダイアログを表示します。

## ユーザーレビューが必要な項目
- ダイアログのデザイン（現在は簡易的なチャットインターフェースを想定）
- Geminiのシステムプロンプト（アプリの機能説明をどの程度詳細にするか）

## Proposed Changes

### [Backend] API Layer

#### [MODIFY] [route.ts](file:///Users/kanbayashiakira/Desktop/ai-scenario-pro/app/api/generate/route.ts)
- `mode === 'help'` を追加。
- アプリの機能（シナリオ生成、画像生成、音声生成、PPTX出力など）に関する知識を持つシステムプロンプトを設定。
- ユーザーの問いかけに対して、アプリの仕様に基づいた回答を生成するように設定。

### [Frontend] UI Component

#### [MODIFY] [page.tsx](file:///Users/kanbayashiakira/Desktop/ai-scenario-pro/app/page.tsx)
- `HelpDialog` コンポーネントを新規作成。
- 状態管理として `isHelpOpen` (ダイアログの開閉) と `helpMessages` (チャット履歴) を追加。
- ヘッダー部分（既存のボタン群の左側など）に「HELP」ボタンを追加。
- ダイアログが開いた際、初期メッセージとして「お手伝いします。」を表示。

---

## Verification Plan

### Automated Tests
- 現時点で自動テスト環境がないため、手動検証を中心に行います。

### Manual Verification
1. 画面上部の「HELP」ボタンをクリックし、ダイアログが開くことを確認。
2. 初期メッセージ「お手伝いします。」が表示されることを確認。
3. アプリの機能について質問（例：「このアプリで何ができますか？」）し、Geminiが適切に回答することを確認。
4. プロンプトがアプリ以外の話題に答えないようになっているか確認（例：「今日の天気は？」に対してアプリについての質問のみ受け付ける旨を回答するか）。
5. ダイアログを閉じ、再度開いた際に履歴が保持されているか（またはリセットされるか、要件に合わせて調整）を確認。
