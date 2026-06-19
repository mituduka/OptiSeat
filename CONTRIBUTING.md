# コントリビューションガイド

> 最終更新: 2026-06-17

OptiSeat への貢献に興味を持っていただきありがとうございます。本プロジェクトは個人開発の OSS であり、無償・無保証で提供されています。受け入れ可否は最終的にメンテナの判断によります。大きな変更（新機能・破壊的変更）は、PR 前に Issue で方針を共有してください。

## はじめての方へ

- バグ報告・機能要望は [GitHub Issues](https://github.com/mituduka/OptiSeat/issues) へ
- 脆弱性は [`SECURITY.md`](./SECURITY.md) の手順で **公開せず** 報告してください
- ドキュメントの誤字修正・リンク切れの修正等の小さな変更は、Issue を立てずに直接 PR で構いません

## 開発環境

すべての開発は `docker compose` 内で行います。ホスト環境に Node.js / Python / clingo をインストールする必要はありません。

開発では `docker-compose.dev.yml` を使ってください。

```bash
docker compose -f docker-compose.dev.yml up -d     # 起動（初回は npm install のため数分かかります）
docker compose -f docker-compose.dev.yml logs -f   # ログ確認
docker compose -f docker-compose.dev.yml down      # 停止
```

| URL | 用途 |
|---|---|
| <http://localhost:3000> | フロントエンド（Next.js） |
| <http://localhost:8000> | バックエンド API（FastAPI） |
| <http://localhost:8000/docs> | Swagger UI |

`npm` / `node` / `pytest` 等のコマンドは **コンテナ内で実行** してください（ホストの Node/Python とのバージョン不整合を避けるため）。

```bash
docker exec optiseat-frontend-1 bash -c "cd /workspace/frontend && <command>"
docker exec optiseat-backend-1  bash -c "cd /workspace && <command>"
```

## テスト

PR を出す前に、テストとリントを通してください。

### バックエンド（pytest）

```bash
docker exec optiseat-backend-1 bash -c "cd /workspace && pytest backend/tests/ -q"
```

| ファイル | 内容 |
|---|---|
| `backend/tests/test_solver.py` | clingo ソルバの単体テスト（Hard / Soft 制約・班分散グループ含む） |
| `backend/tests/test_api.py` | REST API の統合テスト（solve / validate / ソフト制約・前回座席オプション・ソルバエラー処理） |
| `backend/tests/test_score_and_meta.py` | スコア計算・制約メタデータのテスト（ソルバ不使用・高速） |
| `backend/tests/test_score.py` | `compute_score()` の詳細テスト（ハード制約違反・欠損 seat_id 耐性・孤独感最適化） |
| `backend/tests/test_validation.py` | バリデーションロジックの単体テスト |

### フロントエンド（Vitest + 型チェック）

```bash
docker exec optiseat-frontend-1 bash -c "cd /workspace/frontend && npm test -- --run"
docker exec optiseat-frontend-1 bash -c "cd /workspace/frontend && npm run lint"
```

`npm run lint` は `tsc --noEmit` による型チェックを行います（Next.js 16 で `next lint` が廃止されたため）。

### 本番ビルドの確認

```bash
docker exec optiseat-frontend-1 bash -c "cd /workspace/frontend && npm run build"
```

`build` は `prebuild` フックで `LICENSE` 等を `frontend/public/` に同梱したうえでビルドします。

### README 用スクリーンショットの更新

UI に見た目の変更を入れた場合は、撮影スクリプトで `.github/screenshots/` を更新できます。
手順は [`.github/screenshots/README.md`](./.github/screenshots/README.md) を参照してください。

## ブランチ・コミット

- **`main` への直接 push は禁止**されています（ブランチ保護）。必ず作業ブランチから PR を出してください
- 作業ブランチは `feature/<トピック>` または `fix/<トピック>` を推奨
- コミットメッセージは日本語・英語どちらでも構いません。`feat:` / `fix:` / `refactor:` / `docs:` / `test:` などの prefix を付けると履歴が読みやすくなります
- マージ方式は **Squash マージのみ**です。PR 単位で 1 コミットになります。マージ後のブランチは自動削除されます

## Pull Request

- 変更点と動作確認方法を簡潔に記述してください
- UI 変更があればスクリーンショットを添えると確認がスムーズです
- 大きな依存追加には、サイズ・ライセンス・代替検討を本文に記載してください

### マージ条件（すべて満たす必要があります）

| 条件 | 詳細 |
|---|---|
| CI グリーン | `Backend (pytest + ruff)` と `Frontend (vitest + tsc)` が全件パス |
| メンテナの Approve | @mituduka（CODEOWNERS）の承認が必須です |
| コメント全解決 | レビューコメントがすべて Resolved になっていること |
| ブランチ最新 | PR ブランチが `main` の最新コミットを含んでいること |

> **注意:** PR に新しいコミットを push すると、既存の Approve は自動的に無効になります。再度 Approve が必要です。

## ライセンス

本プロジェクトへの貢献は、リポジトリと同一の [MIT License](./LICENSE) の下で提供されたものとみなされます。
