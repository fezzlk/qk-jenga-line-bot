# qk-jenga-line-bot

## プロジェクト情報

- **GCPプロジェクトID**: qk-jenga-line-bot
- **Cloud Runサービス名**: qk-jenga-line-bot
- **リージョン**: asia-northeast1

## デプロイ

`main` ブランチへの push で Cloud Build が自動デプロイを実行する。

```bash
git push origin main
```

## ログ確認

Cloud Run のログは cloud-run-logging MCP を使って確認できる。

## 出力ファイル

調査報告・スクリプトなどは `~/ai-output/qk-jenga-line-bot/` に保存すること。
