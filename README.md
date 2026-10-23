# グラグラタワーBot（仮称）

LINEグループで遊ぶ、崩落リスク管理型のミニゲームBot。

> **この名称は暫定案です。** [FEZ-33](https://linear.app/fezzlk/issue/FEZ-33/名称企画を再検討するjengaqk謎解きジェンガの言及を排除)の一環として、旧名称（Jenga/QK/謎解きジェンガへの直接言及）を排除するために提案した候補のひとつです。正式名称はユーザー承認後に確定し、確定後にリポジトリ名・GCPプロジェクト名・Cloud Runサービス名も別途移行します（本PRではコード・インフラ名は変更していません）。
>
> 候補の一覧・選定理由は [`docs/naming-candidates.md`](./docs/naming-candidates.md) を、企画の再構成内容は [`SPECIFICATION.md`](./SPECIFICATION.md) を参照してください。

## これは何か

複数人でLINEグループチャット上に1つの問題（画像 or 文章）を少しずつ隠して仕込み、別の参加者（解答者）がそれを少しずつ開示されながら挑戦するゲームです。物理的な積み木は使わず、「作成フェーズ」で問題を隠し、「解答フェーズ」で解答者がどのタイミングで正解にたどり着くか（あるいは誤答を重ねて上限に達するか）で結果が決まります。詳細な仕様・用語は [`SPECIFICATION.md`](./SPECIFICATION.md) を参照してください。

## 現在の状態

- 実装: 文章問題・画像問題の作成〜解答〜スコアの基本フローを実装済み。操作はボタン（Quick Reply/Postback）中心で、引数を手打ちするコマンドはない
- 公開: 保留（[FEZ-33](https://linear.app/fezzlk/issue/FEZ-33/名称企画を再検討するjengaqk謎解きジェンガの言及を排除)の名称・企画確定、その後の公開可否判断を待っています）

## ドキュメント

- [`SPECIFICATION.md`](./SPECIFICATION.md): ゲーム仕様（独自コンセプトとしての再構成）
- [`docs/naming-candidates.md`](./docs/naming-candidates.md): 名称候補と選定理由

## 開発

```bash
git push origin main
```

で Cloud Build が自動デプロイを実行します（詳細は `CLAUDE.md` を参照）。

## 画像問題のインフラ準備

画像問題は、マスク加工した画像を非公開のCloud Storageバケットに置き、署名付きURL（有効期限1時間）でLINEへ配信します。デプロイ前に一度だけ以下を実施してください（`PROJECT`・`BUCKET`は環境に合わせて置き換え）。

```bash
PROJECT=qk-jenga-line-bot
BUCKET=qk-jenga-line-bot-puzzle-images
SA=qk-jenga-line-bot-run@${PROJECT}.iam.gserviceaccount.com

# 非公開バケット（均一アクセス・公開アクセス防止）
gcloud storage buckets create gs://${BUCKET} --project=${PROJECT} --location=asia-northeast1 \
  --uniform-bucket-level-access --public-access-prevention

# 7日で自動削除（元画像・開示ステップごとの加工画像はすべて使い捨て）
cat > /tmp/lifecycle.json <<'JSON'
{"rule": [{"action": {"type": "Delete"}, "condition": {"age": 7}}]}
JSON
gcloud storage buckets update gs://${BUCKET} --lifecycle-file=/tmp/lifecycle.json

# Cloud Runの実行SAに、バケットの読み書きと署名付きURL発行（signBlob）の権限を付与
gcloud storage buckets add-iam-policy-binding gs://${BUCKET} \
  --member=serviceAccount:${SA} --role=roles/storage.objectAdmin
gcloud iam service-accounts add-iam-policy-binding ${SA} --project=${PROJECT} \
  --member=serviceAccount:${SA} --role=roles/iam.serviceAccountTokenCreator
```

バケット名は `cloudbuild.yaml` の `PUZZLE_IMAGES_BUCKET` で渡します。文章問題だけを使う場合、この環境変数は不要です（画像問題を扱う時にだけ参照します）。
