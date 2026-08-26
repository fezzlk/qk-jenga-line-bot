# グラグラタワーBot（仮称）

LINEグループで遊ぶ、崩落リスク管理型のミニゲームBot。

> **この名称は暫定案です。** [FEZ-33](https://linear.app/fezzlk/issue/FEZ-33/名称企画を再検討するjengaqk謎解きジェンガの言及を排除)の一環として、旧名称（Jenga/QK/謎解きジェンガへの直接言及）を排除するために提案した候補のひとつです。正式名称はユーザー承認後に確定し、確定後にリポジトリ名・GCPプロジェクト名・Cloud Runサービス名も別途移行します（本PRではコード・インフラ名は変更していません）。
>
> 候補の一覧・選定理由は [`docs/naming-candidates.md`](./docs/naming-candidates.md) を、企画の再構成内容は [`SPECIFICATION.md`](./SPECIFICATION.md) を参照してください。

## これは何か

積み木を1本ずつ抜いていくと、いつか崩れる――という緊張感を、LINEグループチャット上でBotが仮想的に再現するゲームです。物理的な積み木は使わず、Botが「崩落リスク（残り安全本数）」を内部で管理し、参加者が交代で「引く」たびにリスクが上昇していきます。

## 現在の状態

- 実装: 未着手（このリポジトリはプロジェクトスキャフォールドの段階です）
- 公開: 保留（[FEZ-33](https://linear.app/fezzlk/issue/FEZ-33/名称企画を再検討するjengaqk謎解きジェンガの言及を排除)の名称・企画確定、その後の公開可否判断を待っています）

## ドキュメント

- [`SPECIFICATION.md`](./SPECIFICATION.md): ゲーム仕様（独自コンセプトとしての再構成）
- [`docs/naming-candidates.md`](./docs/naming-candidates.md): 名称候補と選定理由

## 開発

```bash
git push origin main
```

で Cloud Build が自動デプロイを実行します（詳細は `CLAUDE.md` を参照）。
