# API仕様書

**プロジェクト名**: OptiSeat  
**バージョン**: 1.0.0  
**最終更新**: 2026-06-17

## 目次

1. [概要](#1-概要)
2. [共通仕様](#2-共通仕様)
3. [エンドポイント一覧](#3-エンドポイント一覧)
4. [エンドポイント詳細](#4-エンドポイント詳細)
   - 4.1 GET /health
   - 4.2 GET /api/v1/config
   - 4.3 POST /api/v1/solve
   - 4.4 POST /api/v1/score
   - 4.5 POST /api/v1/validate
5. [スキーマ定義](#5-スキーマ定義)
6. [制約メタデータ](#6-制約メタデータ)
7. [バリデーション警告コード一覧](#7-バリデーション警告コード一覧)

## 1. 概要

OptiSeat バックエンドAPIは FastAPI で実装された REST API です。  
フロントエンドからの席替え計算リクエストを受け付け、clingo ソルバを実行して結果を返します。

**ベースURL（開発環境）**: `http://localhost:8000`  
**APIドキュメント（自動生成）**: `http://localhost:8000/docs`  
**OpenAPIスキーマ**: `http://localhost:8000/openapi.json`

## 2. 共通仕様

- Content-Type: `application/json`
- 文字コード: UTF-8
- 認証: なし（ローカル開発環境のみ）
- CORS許可オリジン: `http://localhost:3000`（既定値。環境変数 `CORS_ORIGINS` で変更可能）

## 3. エンドポイント一覧

| メソッド | パス | 概要 |
|---------|------|------|
| `GET` | `/health` | サーバー・ソルバの稼働確認 |
| `GET` | `/api/v1/config` | アプリケーション設定取得（最大人数・タイムアウト上限など） |
| `POST` | `/api/v1/solve` | 席替え計算の実行 |
| `POST` | `/api/v1/score` | 手動調整後の制約違反数再計算（ソルバ不使用） |
| `POST` | `/api/v1/validate` | 制約設定の矛盾チェック（ソルバ不使用） |

## 4. エンドポイント詳細

### 4.1 GET /health

サーバーとソルバが正常動作しているかを確認する。

**レスポンス: 200 OK**
```json
{
  "status": "ok",
  "solver": "clingo 5.8.0",
  "version": "1.0.0"
}
```

### 4.2 GET /api/v1/config

アプリケーション設定値を返す。  
フロントエンドが起動時に取得し、入力バリデーションの上限値として使用する。

**レスポンス: 200 OK**
```json
{
  "max_students": 50,
  "solver_timeout_default": 30,
  "solver_timeout_max": 120,
  "solver_max_solutions_default": 5,
  "solver_max_solutions_max": 10,
  "seat_max_rows": 12,
  "seat_max_cols": 12
}
```

| フィールド | 説明 | 環境変数 |
|-----------|------|---------|
| `max_students` | 登録可能な最大児童・生徒数 | `MAX_STUDENTS`（デフォルト50） |
| `solver_timeout_default` | デフォルトのタイムアウト秒数 | `SOLVER_TIMEOUT_DEFAULT`（デフォルト30） |
| `solver_timeout_max` | タイムアウトの上限秒数 | `SOLVER_TIMEOUT_MAX`（デフォルト120） |
| `solver_max_solutions_default` | デフォルトの最大解数 | `SOLVER_MAX_SOLUTIONS_DEFAULT`（デフォルト5） |
| `solver_max_solutions_max` | 最大解数の上限 | `SOLVER_MAX_SOLUTIONS_MAX`（デフォルト10） |
| `seat_max_rows` | グリッドの最大行数 | `SEAT_MAX_ROWS`（デフォルト12） |
| `seat_max_cols` | グリッドの最大列数 | `SEAT_MAX_COLS`（デフォルト12） |

### 4.3 POST /api/v1/solve

席替え計算を実行し、座席配置の候補を返す。  
clingoソルバをマルチシードループで実行し、重複排除した上位解を返す。

**リクエストボディ**: [`SolveRequest`](#solvequest)

```json
{
  "students": [
    {"id": 1, "gender": "male",   "tags": ["front_preferred"]},
    {"id": 2, "gender": "female", "tags": []},
    {"id": 3, "gender": "male",   "tags": []},
    {"id": 4, "gender": "female", "tags": ["back_preferred"]},
    {"id": 5, "gender": "male",   "tags": []},
    {"id": 6, "gender": "female", "tags": []}
  ],
  "seats": [
    {"id": 1, "row": 1, "col": 1}, {"id": 2, "row": 1, "col": 2},
    {"id": 3, "row": 1, "col": 3}, {"id": 4, "row": 2, "col": 1},
    {"id": 5, "row": 2, "col": 2}, {"id": 6, "row": 2, "col": 3}
  ],
  "classroom": {
    "num_rows": 2, "num_cols": 3,
    "front_rows": [1], "back_rows": [2]
  },
  "groups": [
    {"group_id": 1, "seat_ids": [1, 2, 4, 5]},
    {"group_id": 2, "seat_ids": [3, 6]}
  ],
  "constraints": {
    "fixed": [{"student_id": 3, "seat_id": 2}],
    "forbidden": [{"student_id_a": 2, "student_id_b": 5, "type": "adjacent8"}],
    "seat_gender": [{"seat_id": 1, "allowed_gender": "female"}],
    "relative_fixed": [
      {"student_id_a": 1, "student_id_b": 2, "d_row": 0, "d_col": 1}
    ],
    "leader_groups": [
      {"group_id": 0, "student_ids": [1, 4]}
    ]
  },
  "prev_assign": [
    {"student_id": 1, "seat_id": 1},
    {"student_id": 2, "seat_id": 2}
  ],
  "options": {
    "max_solutions": 5,
    "timeout": 30,
    "prev_options": {
      "differ_seat": false,
      "differ_neighbor": false,
      "differ_group": false
    },
    "soft_toggles": {
      "gender_balance": true,
      "loneliness": true
    }
  }
}
```

**レスポンス: 200 OK（解あり）**

```json
{
  "status": "ok",
  "elapsed_ms": 342,
  "solutions": [
    {
      "rank": 1,
      "score": {
        "total": 3,
        "breakdown": {
          "front_preferred_violation": 0,
          "back_preferred_violation": 0,
          "group_gender_imbalance": 0,
          "loneliness_violation": 1,
          "prev_neighbor_same": 0,
          "prev_group_same": 0,
          "prev_assign_same": 1,
          "fixed_violation": 0,
          "gender_constraint_violation": 0,
          "relative_fixed_violation": 0,
          "forbidden_violation": 0,
          "leader_group_violation": 0
        }
      },
      "assignments": [
        {"student_id": 1, "seat_id": 2},
        {"student_id": 2, "seat_id": 4}
      ]
    }
  ]
}
```

**レスポンス: 200 OK（解なし）**

```json
{
  "status": "unsatisfiable",
  "elapsed_ms": 128,
  "solutions": [],
  "error": {
    "code": "UNSATISFIABLE",
    "message": "指定された制約を同時に満たす座席配置が存在しません。",
    "conflicting_constraints": []
  }
}
```

**レスポンス: 200 OK（タイムアウト）**

`status: "timeout"` は制限時間内に解が 1 件も得られなかった場合のみ返る。  
タイムアウトしても部分的に解が得られていれば、その解とともに `status: "ok"` を返す。

```json
{
  "status": "timeout",
  "elapsed_ms": 30000,
  "solutions": []
}
```

**レスポンス: 200 OK（ソルバ内部エラー）**

ソルバ初期化・実行中に予期しない例外が発生した場合。  
HTTP 500 ではなく 200 で返す。

```json
{
  "status": "unsatisfiable",
  "elapsed_ms": 45,
  "solutions": [],
  "error": {
    "code": "SOLVER_ERROR",
    "message": "配置の計算中に内部エラーが発生しました。"
  }
}
```

**レスポンス: 422（バリデーションエラー）**

Pydantic による入力バリデーション失敗。  
例：`gender` に `"unknown"` を渡した場合、児童・生徒数 > 座席数 の場合など。

### 4.4 POST /api/v1/score

座席配置の制約違反数を計算して返す。ソルバは実行しない。  
手動でドラッグ＆ドロップ調整した後のペナルティ再計算に使用する。

**リクエストボディ**: [`ScoreRequest`](#scorerequest)

```json
{
  "assignments": [
    {"student_id": 1, "seat_id": 2},
    {"student_id": 2, "seat_id": 1}
  ],
  "students": [ ... ],
  "seats": [ ... ],
  "classroom": { "num_rows": 2, "num_cols": 3, "front_rows": [1], "back_rows": [2] },
  "groups": [ ... ],
  "constraints": { "fixed": [], "forbidden": [], "seat_gender": [], "relative_fixed": [] },
  "prev_assign": [ ... ]
}
```

**レスポンス: 200 OK**

```json
{
  "score": {
    "total": 5,
    "breakdown": {
      "front_preferred_violation": 1,
      "back_preferred_violation": 0,
      "group_gender_imbalance": 1,
      "loneliness_violation": 0,
      "prev_neighbor_same": 0,
      "prev_group_same": 0,
      "prev_assign_same": 0,
      "fixed_violation": 0,
      "gender_constraint_violation": 0,
      "relative_fixed_violation": 0,
      "forbidden_violation": 0,
      "leader_group_violation": 0
    }
  }
}
```

> [!IMPORTANT]
> `total` は soft 制約の重み付き合計のみ。hard 制約（`fixed_violation` / `gender_constraint_violation` / `relative_fixed_violation` / `forbidden_violation` / `leader_group_violation`）は `total` に含まれない（`weight=null`）。

### 4.5 POST /api/v1/validate

制約設定の矛盾チェックのみ行う（ソルバ実行なし）。  
矛盾する可能性がある場合は `warnings` に追加され、`valid` は `false` になる（警告が 1 件もなければ `true`）。  
ハード制約の充足可能性を検証するものではない。

**リクエストボディ**: [`ValidateRequest`](#validaterequest)

```json
{
  "students": [ ... ],
  "seats": [ ... ],
  "constraints": {
    "fixed": [{"student_id": 1, "seat_id": 1}],
    "forbidden": [{"student_id_a": 2, "student_id_b": 5}],
    "seat_gender": [{"seat_id": 1, "allowed_gender": "male"}],
    "relative_fixed": [
      {"student_id_a": 1, "student_id_b": 2, "d_row": 0, "d_col": 1}
    ]
  }
}
```

**レスポンス: 200 OK（問題なし）**

```json
{"valid": true, "warnings": []}
```

**レスポンス: 200 OK（警告あり）**

```json
{
  "valid": false,
  "warnings": [
    {
      "code": "GENDER_FIXED_CONFLICT",
      "message": "座席ID 1 に固定されたID:4 の性別が性別制約（maleのみ）と矛盾します。"
    }
  ]
}
```

警告コード一覧は [§7 バリデーション警告コード一覧](#7-バリデーション警告コード一覧) を参照。

## 5. スキーマ定義

### SolveRequest

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `students` | `StudentInput[]` | ✓ | — | 1〜`MAX_STUDENTS`人（既定50） |
| `seats` | `SeatInput[]` | ✓ | — | 座席一覧（児童・生徒数以上必要） |
| `classroom` | `ClassroomConfig` | ✓ | — | 教室設定 |
| `groups` | `GroupLayout[]` | | `[]` | 班レイアウト |
| `constraints` | `ConstraintConfig` | | `{}` | 各種制約 |
| `prev_assign` | `PrevAssignment[]` | | `[]` | 前回座席情報 |
| `options` | `SolveOptions` | | デフォルト値 | 計算オプション |

### ScoreRequest

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `assignments` | `AssignmentResult[]` | ✓ | — | 評価対象の配置（1件以上） |
| `students` | `StudentInput[]` | ✓ | — | |
| `seats` | `SeatInput[]` | ✓ | — | |
| `classroom` | `ClassroomConfig` | ✓ | — | |
| `groups` | `GroupLayout[]` | | `[]` | |
| `constraints` | `ConstraintConfig` | | `{}` | |
| `prev_assign` | `PrevAssignment[]` | | `[]` | |

### ValidateRequest

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `students` | `StudentInput[]` | ✓ | |
| `seats` | `SeatInput[]` | ✓ | |
| `constraints` | `ConstraintConfig` | | |

### StudentInput

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | `int (≥1)` | ID |
| `gender` | `"male" \| "female"` | 性別 |
| `tags` | `("front_preferred" \| "back_preferred")[]` | タグ |

### SeatInput

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | `int (≥1)` | 座席ID |
| `row` | `int (≥1)` | 行番号（1=黒板側） |
| `col` | `int (≥1)` | 列番号（1=左端） |

### ClassroomConfig

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `num_rows` | `int (1〜SEAT_MAX_ROWS)` | 必須 | 行数（上限の既定は12、環境変数で変更可能） |
| `num_cols` | `int (1〜SEAT_MAX_COLS)` | 必須 | 列数（上限の既定は12、環境変数で変更可能） |
| `front_rows` | `int[]` | `[1]` | 前列とみなす行番号リスト。空リストは「前側エリアなし」（front_preferred は対象外） |
| `back_rows` | `int[] \| null` | `null` | 後列とみなす行番号リスト。`null`（省略）時は最終行を自動設定。空リストは「後側エリアなし」（back_preferred は対象外） |

### ConstraintConfig

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `fixed` | `FixedConstraint[]` | 座席固定（特定児童・生徒を特定座席に固定） |
| `forbidden` | `ForbiddenConstraint[]` | 隣接禁止または同班禁止 |
| `seat_gender` | `SeatGenderConstraint[]` | 座席への性別制限 |
| `relative_fixed` | `RelativeFixedConstraint[]` | 相対位置での隣接固定 |
| `leader_groups` | `LeaderGroupConstraint[]` | 班分散グループ（同一グループ内の児童・生徒同士は別班に分散） |

#### FixedConstraint
```json
{"student_id": 1, "seat_id": 3}
```

#### ForbiddenConstraint
```json
{
  "student_id_a": 2,
  "student_id_b": 5,
  "type": "adjacent8"
}
```
`type`: `"adjacent8"`（斜め含む8方向隣接禁止）または `"same_group"`（同班禁止）。デフォルトは `"adjacent8"`。

#### SeatGenderConstraint
```json
{"seat_id": 1, "allowed_gender": "male"}
```
`allowed_gender`: `"male"` または `"female"`。

#### RelativeFixedConstraint
```json
{"student_id_a": 1, "student_id_b": 2, "d_row": 0, "d_col": 1}
```
`student_id_a` の座席から `(d_row, d_col)` オフセットの位置に `student_id_b` を配置する。
`d_row`, `d_col` は `-1`〜`1`（`0, 0` は不可）。

#### LeaderGroupConstraint
```json
{"group_id": 0, "student_ids": [1, 4, 7]}
```
`group_id`: グループID（0始まり、整数 ≥ 0）。  
`student_ids`: 同じ班に入れたくない児童・生徒のIDリスト（2人以上必須）。  
グループ内のメンバー同士は別々の班に分散配置される。  
グループ人数が班数を超えると UNSAT になる。

### SolveOptions

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `max_solutions` | `int (1〜SOLVER_MAX_SOLUTIONS_MAX)` | `5` | 取得する最大解数（上限の既定は10、環境変数で変更可能） |
| `timeout` | `int (1〜SOLVER_TIMEOUT_MAX)` | `30` | タイムアウト秒数（上限の既定は120、環境変数で変更可能） |
| `prev_options` | `PrevSeatOptions` | — | 前回座席オプション |
| `soft_toggles` | `SoftToggles` | — | ソフト制約トグル |

#### PrevSeatOptions

| フィールド | デフォルト | 説明 |
|-----------|-----------|------|
| `differ_seat` | `false` | 前回と同じ座席への配置を避ける（ソフト制約 S-05 @1 を有効化） |
| `differ_neighbor` | `false` | 前回と左右の隣が同じになるのを避ける（ソフト制約 S-06 @3 を有効化） |
| `differ_group` | `false` | 前回と同じ班メンバー構成を避ける（ソフト制約 S-07 @2 を有効化） |

> [!NOTE]
> いずれもハード制約ではなく弱制約（違反があっても解は成立し、違反数が最小化される）。
> `ScoreBreakdown` の `prev_assign_same` / `prev_neighbor_same` / `prev_group_same` は
> トグルの ON/OFF によらず配置から機械的にカウントされる（UI 側がトグル OFF の項目を
> 「無効」として表示から除外する）。

#### SoftToggles

| フィールド | デフォルト | 説明 |
|-----------|-----------|------|
| `gender_balance` | `false` | 班内男女バランス最適化を有効にする |
| `loneliness` | `false` | 近隣同性バランス最適化を有効にする |

### ScoreBreakdown

| フィールド | 重み | 優先度 | 説明 |
|-----------|------|--------|------|
| `front_preferred_violation` | 3 | @5 | 前側希望が前側エリア以外に配置された件数 |
| `back_preferred_violation` | 3 | @5 | 後側希望が後側エリア以外に配置された件数 |
| `group_gender_imbalance` | 2 | @4 | 班内に男女どちらかが0人の件数 |
| `loneliness_violation` | 2 | @4 | 同性ピア（横隣∪同班）が0人の件数 |
| `prev_neighbor_same` | 1 | @3 | 前回横隣だったペアが今回も横隣な件数 |
| `prev_group_same` | 1 | @2 | 前回と全く同じメンバー構成の班の件数 |
| `prev_assign_same` | 1 | @1 | 前回と同じ座席に配置された件数 |
| `fixed_violation` | null | null | 固定制約違反件数（手動変更で発生） |
| `gender_constraint_violation` | null | null | 性別制約違反件数（手動変更で発生） |
| `relative_fixed_violation` | null | null | 隣接固定制約違反件数（手動変更で発生） |
| `forbidden_violation` | null | null | 隣接禁止制約違反件数（手動変更で発生） |
| `leader_group_violation` | null | null | 班分散グループ違反件数（手動変更で発生）。班分散グループ×班ごとに「同じ班に入った超過人数（メンバー数−1）」を合算した値 |

`total = Σ (soft違反数 × 重み)`。`weight=null` のハード制約フィールドは `total` に含まれない。

## 6. 制約メタデータ

> [!NOTE]
> 制約メタデータはフロントエンドの `src/lib/constraintLabels.ts` でローカル定数として管理しています。

12件の制約定義（`weight=null` はハード制約で total スコアに含まれない）:

| key | label | weight | priority_level |
|-----|-------|--------|---------------|
| `front_preferred_violation` | 前側配慮違反 | 3 | 5 |
| `back_preferred_violation` | 後側配慮違反 | 3 | 5 |
| `group_gender_imbalance` | 班内男女偏り | 2 | 4 |
| `loneliness_violation` | 近隣同性なし | 2 | 4 |
| `prev_neighbor_same` | 前回左右一致 | 1 | 3 |
| `prev_group_same` | 前回同班構成 | 1 | 2 |
| `prev_assign_same` | 前回同席 | 1 | 1 |
| `fixed_violation` | 座席固定違反 | null | null |
| `gender_constraint_violation` | 性別制約違反 | null | null |
| `relative_fixed_violation` | 隣接固定違反 | null | null |
| `forbidden_violation` | 隣接禁止違反 | null | null |
| `leader_group_violation` | 班分散グループ違反 | null | null |

## 7. バリデーション警告コード一覧

`POST /api/v1/validate` レスポンスの `warnings[].code` に現れるコード。

| コード | 発生条件 |
|--------|---------|
| `UNKNOWN_STUDENT_ID` | `fixed` / `forbidden` / `relative_fixed` / `leader_groups` で指定した `student_id` が `students` に存在しない |
| `UNKNOWN_SEAT_ID` | `fixed` / `seat_gender` で指定した `seat_id` が `seats` に存在しない |
| `FIXED_SEAT_CONFLICT` | `fixed` で同じ `seat_id` に複数の児童・生徒が固定されている |
| `GENDER_FIXED_CONFLICT` | `fixed` で特定座席に固定された児童・生徒の性別が、その座席の `seat_gender` 制約と矛盾する |
| `RELATIVE_FIXED_FORBIDDEN_CONFLICT` | 同じペアに `relative_fixed`（隣接固定）と `forbidden adjacent8`（8方向隣接禁止）が同時に設定されている |

> [!NOTE]
> 警告が 1 件以上ある場合、`valid` は `false` になる。警告があってもソルバへの送信は可能で、送信するかどうかはユーザーが判断する。
