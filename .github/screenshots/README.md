# スクリーンショット

ルート `README.md` の「主な機能」節から参照される画像の置き場です。
画像は手動で撮るのではなく、撮影スクリプトで自動生成します。

| ファイル名 | 画面 | 内容 |
|---|---|---|
| `students.png` | 名簿管理（`/students`） | サンプル名簿 30 名 |
| `settings.png` | 条件設定（`/settings`） | 座席・班・各種制約 |
| `solve.png` | 実行（`/solve`） | 実バックエンドで計算した複数案 |
| `finalize.png` | 配置調整（`/finalize`） | 採用直後の調整グリッド |
| `display.png` | 結果（`/display`） | 確定した座席表 |
| `export.png` | データ管理モーダル | エクスポートタブ |

## 自動更新の手順

`docker compose up -d` で起動した状態で、コンテナ内から実行します
（スクリプト本体は [`frontend/scripts/capture-screenshots.mjs`](../../frontend/scripts/capture-screenshots.mjs)）。

```bash
# 初回のみ: Chromium と依存ライブラリをコンテナにインストール
# （コンテナを作り直した場合も再実行が必要）
docker exec optiseat-frontend-1 bash -c "cd /workspace/frontend && npx playwright install --with-deps chromium"

# 撮影（このディレクトリの PNG を上書き）
docker exec optiseat-frontend-1 bash -c "cd /workspace/frontend && npm run screenshots"
```

仕組み:

- サンプルデータ（`frontend/src/lib/sampleData.ts`）を localStorage にシードして各画面を再現
- 「計算実行 → この配置を採用 → 配置確定」を実際のフローで操作し、solve / finalize / display を撮影
- 計算は実バックエンド（clingo）で行うため、**座席配置は実行のたびに変わります**（マルチシード探索のため）
- ビューポート 1440×760・デバイスピクセル比 2（出力 2880×1520）

## 注意

- 個人情報を含めない（サンプルデータのみで撮影する）
- README 側の `<img>` パスとファイル名を一致させること
