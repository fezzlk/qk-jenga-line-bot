<!-- Shared guidance from fezzlk/agent-kit @ 1089cb3036e50c7d354c63dbc3c7236321feb6f7. Project-specific guidance follows. -->

# Shared AI development guidance

- Keep changes small, preserve existing user work, and run appropriate verification.
- Do not expose secrets or commit environment values.
- Before cloud or paid API changes, state the likely cost and impact.
- pico is the long-term memory: read its project context and decisions when needed; record completed facts and decisions only when asked.
- Linear is the only source of task status, priority, owner, due date, and next actions. Do not duplicate them here or in pico.
- For AI features, add versioned evaluation cases, expected behavior, and failure handling before expanding scope.

## Existing project guidance

# qk-jenga-line-bot

## プロジェクト情報

- **GCPプロジェクトID**: qk-jenga-line-bot
- **Cloud Runサービス名**: qk-jenga-line-bot
- **リージョン**: asia-northeast1

## 技術スタック

Node.js + TypeScript（Express, `@line/bot-sdk`, `firebase-admin`/Firestore）。詳細は`SPECIFICATION.md`を参照。

## 開発

```bash
npm install
cp .env.local.example .env.local   # LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN を設定
docker compose up                  # アプリ + Firestoreエミュレータをホットリロードで起動
```

```bash
npm run dev         # ローカルで直接起動（tsx watch）
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test              # vitest
npm run build          # tsc（本番ビルド）
```

## デプロイ

`main` ブランチへの push で Cloud Build が自動デプロイを実行する。デプロイ前に、Secret Managerへ`line-channel-secret`・`line-channel-access-token`の2シークレットを作成しておく必要がある（`cloudbuild.yaml`参照）。

```bash
git push origin main
```

## ログ確認

Cloud Run のログは cloud-run-logging MCP を使って確認できる。

## 出力ファイル

調査報告・スクリプトなどは `~/ai-output/qk-jenga-line-bot/` に保存すること。
