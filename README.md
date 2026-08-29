# グラグラタワーBot（仮称）

LINEグループで遊ぶ、崩落リスク管理型のミニゲームBot。

> **この名称は暫定案です。** [FEZ-33](https://linear.app/fezzlk/issue/FEZ-33/名称企画を再検討するjengaqk謎解きジェンガの言及を排除)の一環として、旧名称（Jenga/QK/謎解きジェンガへの直接言及）を排除するために提案した候補のひとつです。正式名称はユーザー承認後に確定し、確定後にリポジトリ名・GCPプロジェクト名・Cloud Runサービス名も別途移行します（本PRではコード・インフラ名は変更していません）。
>
> 候補の一覧・選定理由は [`docs/naming-candidates.md`](./docs/naming-candidates.md) を、企画の再構成内容は [`SPECIFICATION.md`](./SPECIFICATION.md) を参照してください。

## これは何か

複数人でLINEグループチャット上に1つの問題（画像 or 文章）を少しずつ隠して仕込み、別の参加者（解答者）がそれを少しずつ開示されながら挑戦するゲームです。物理的な積み木は使わず、「作成フェーズ」で問題を隠し、「解答フェーズ」で解答者がどのタイミングで正解にたどり着くか（あるいは誤答を重ねて上限に達するか）で結果が決まります。詳細な仕様・用語は [`SPECIFICATION.md`](./SPECIFICATION.md) を参照してください。

## 現在の状態

- 実装: v1（文章パズルのみ、解答者1人まで）実装済み。画像パズル・複数解答者は未実装（詳細は `SPECIFICATION.md`）
- 公開: 保留（[FEZ-33](https://linear.app/fezzlk/issue/FEZ-33/名称企画を再検討するjengaqk謎解きジェンガの言及を排除)の名称・企画確定、その後の公開可否判断を待っています）

## ドキュメント

- [`SPECIFICATION.md`](./SPECIFICATION.md): ゲーム仕様（独自コンセプトとしての再構成）
- [`docs/naming-candidates.md`](./docs/naming-candidates.md): 名称候補と選定理由

## 開発

技術スタック・開発コマンド（`npm install` / `docker compose up` / テスト実行など）は `CLAUDE.md` を参照してください。

```bash
git push origin main
```

で Cloud Build が自動デプロイを実行します（デプロイ前にSecret Managerへの認証情報登録が必要。詳細は `CLAUDE.md` を参照）。
