# ASPロジック設計書

**プロジェクト名**: OptiSeat  
**バージョン**: 1.0.0  
**最終更新**: 2026-06-17

> [!NOTE]
> 本ドキュメントは ASP ロジックの設計意図を説明するものです。
> ここでは要点と代表ルールのみを抜粋します。

## 目次

1. [設計方針と座席ID体系](#1-設計方針と座席id体系)
2. [clorm Predicateクラス設計](#2-clorm-predicateクラス設計)
3. [ASPロジックファイル設計](#3-aspロジックファイル設計)
4. [Pythonオーケストレーター設計](#4-pythonオーケストレーター設計)
5. [サンプルデータと期待動作](#5-サンプルデータと期待動作)
6. [テスト設計](#6-テスト設計)　

## 1. 設計方針と座席ID体系

### 1.1 ロジックの層構成

ASP ロジックを以下の層に分け、ファイルを分離する:

| 層 | 役割 | ファイル |
|----|------|---------|
| **Generate** | 可能性のある割り当てを全て生成 | `base.lp` |
| **Define** | 補助述語を定義（隣接関係・班所属など） | `base.lp` |
| **Test** | 不正な解を排除（integrity constraint） | `hard.lp` |
| **Optimize** | Soft制約（弱制約 `:~`）でスコア最小化 | `soft.lp` |

### 1.2 座席ID体系

座席は `seat_id`（整数）で一意に識別し、`row` と `col` の2次元座標を持つ。

```
座席グリッド例（3行×4列 = 12席）:
行は前（黒板側）から1始まり、列は左から1始まり。

     Col:1  Col:2  Col:3  Col:4
Row:1  [1]    [2]    [3]    [4]   ← 前列（黒板側）
Row:2  [5]    [6]    [7]    [8]
Row:3  [9]   [10]   [11]   [12]  ← 後列

seat_id = (row - 1) * num_cols + col
```

## 2. clorm Predicateクラス設計

ファイル: [`backend/solver/predicates.py`](../backend/solver/predicates.py)

ASP の述語を clorm の `Predicate` クラスとして表現する。  
各クラスのインスタンスが 1 つの ASP ファクトに対応する。クラス定義・docstring の全文はソースを参照。

### 2.1 述語一覧

#### 入力述語  
ソルバへの入力データ。API リクエストをもとに `facts.py` が生成し、clorm の `FactBase` に格納する。

| 述語 | フィールド | 意味 |
|------|-----------|------|
| `student/2` | student_id, gender | 児童・生徒（gender は `male` / `female` の ASP 定数） |
| `tag/2` | student_id, tag | 配慮タグ（`front_preferred` / `back_preferred`） |
| `seat/3` | seat_id, row, col | 座席（row: 前列=1、col: 左=1） |
| `front_row/1` | row | 前列の行番号 |
| `back_row/1` | row | 後列の行番号（省略時は最終行を Python 側で自動補完） |
| `group/2` | group_id, seat_id | 班レイアウト（座席の班所属） |
| `fixed/2` | student_id, seat_id | 座席固定（H-03） |
| `forbidden8/2` | student_id_a, student_id_b | 8方向隣接禁止（H-04、a<b に正規化） |
| `forbidden_group/2` | student_id_a, student_id_b | 同班禁止（H-05、a<b に正規化） |
| `seat_gender_constraint/2` | seat_id, allowed_gender | 座席性別制約（H-06） |
| `relative_fixed/4` | student_id_a, student_id_b, d_row, d_col | 相対的固定制約（H-08） |
| `leader_group/2` | group_id, student_id | 班分散グループ（H-10） |
| `prev_assign/2` | student_id, seat_id | 前回の配置（Soft） |
| `prev_row_neighbor/2` | a, b | 前回横隣だったペア（Soft、`facts.py` が事前計算） |
| `prev_group_member/2` | group_id, student_id | 前回の班メンバー（Soft、`facts.py` が事前計算） |
| `prev_group_id/1` | group_id | 前回の班ID（Soft、`facts.py` が事前計算） |

#### オプションフラグ述語
対応するオプション有効時のみファクトとして追加し、対応する弱制約を活性化する。

| 述語 | 対応する最適化 |
|------|---------------|
| `opt_gender_balance/0` | S-03 班内男女バランス |
| `opt_loneliness/0` | S-04 孤独感緩和 |
| `opt_prev_seat_differ/0` | O-1 前回同席の追加ペナルティ |
| `opt_prev_neighbor_differ/0` | S-06 前回横隣の解消 |
| `opt_prev_group_differ/0` | S-07 前回班構成の変更 |

#### 出力述語
clingo が生成する解から抽出される。

| 述語 | フィールド | 意味 |
|------|-----------|------|
| `assign/2` | student_id, seat_id | 座席割り当て結果 |

### 2.2 clorm の命名規則（注意点）

clorm はデフォルトでクラス名を lowercase にした名前を述語名にする（例: `Student` → `student`）。  
snake_case にはならないため、複数語のクラスは `Meta.name` で明示する（例: `FrontRow` → `front_row`、`PrevAssign` → `prev_assign`）。  
フィールド型は `IntegerField`（整数）と `ConstantField`（クォートなし定数）を使い分ける（`ConstantField` は `StringField` とは異なる点に注意）。

### 2.3 FactBase 構築

ファイル: [`backend/solver/facts.py`](../backend/solver/facts.py)

`build_factbase(data: dict) -> FactBase` が API リクスト由来のフラット dict を受け取り、
全ファクトを格納した `FactBase` を構築する。入力 dict の形は §4 の `flat_data` を参照。
`prev_row_neighbor` / `prev_group_member` / `prev_group_id` のように ASP 側で計算すると
グラウンディングが重くなる前回情報は、ここで Python が事前計算してファクト化する。

## 3. ASPロジックファイル設計

詳細は [`base.lp`](../backend/solver/lp/base.lp) / [`hard.lp`](../backend/solver/lp/hard.lp) / [`soft.lp`](../backend/solver/lp/soft.lp) を参照。  
以下は各ルールの設計意図と一部例。

### 3.1 `base.lp` — Generate & Define

**Generate**: 各児童・生徒にちょうど 1 席を割り当てる choice rule。`hard.lp` の H-02 と合わせて「1 人 1 席・1 席 1 人」を保証する。

```prolog
1 { assign(S, R) : seat(R, _, _) } 1 :- student(S, _).
```

**Define**: 以下の補助述語を定義する。

| 述語 | 意味 |
|------|------|
| `adjacent8(R1, R2)` | 座席 R1・R2 が8方向隣接（行差・列差がともに1以下）、`R1<R2` で生成し対称ルールで両方向化 |
| `in_front(R)` / `in_back(R)` | 座席 R が前列 / 後列に属する |
| `in_group(S, G)` | 児童・生徒 S が班 G に所属（`assign` 経由で逆引き） |
| `group_has_male(G)` / `group_has_female(G)` | 班 G に男性 / 女性が存在する |
| `group_id(G)` | 班ID一覧（班単位で1件カウントするための重複排除） |
| `has_seat(Row, Col)` | 座標 (Row, Col) に座席が存在する（H-08 用） |

例: 8方向隣接の定義

幾何結合は `R1<R2` の対だけ評価して計算コストを削減している。  
逆向きは射影ルールで対称化し、H-04 が座席の順序を問わず参照できるようにする。

```prolog
adjacent8(R1, R2) :- seat(R1, Row1, Col1), seat(R2, Row2, Col2),
                     R1 < R2, |Row1 - Row2| <= 1, |Col1 - Col2| <= 1.
adjacent8(R2, R1) :- adjacent8(R1, R2).
```

### 3.2 `hard.lp` — Hard 制約

integrity constraint（`:- ...`）として記述し、違反する解を完全に除外する。

| ID | 制約 | 概要 |
|----|------|------|
| H-01 | 1人1席 | `base.lp` の choice rule で保証（明示ルールなし） |
| H-02 | 1席1人 | 同一座席に2人以上を配置しない |
| H-03 | 座席固定 | `fixed(S, R)` なら必ず `assign(S, R)` |
| H-04 | 8方向隣接禁止 | `forbidden8` のペアを `adjacent8` な座席に置かない |
| H-05 | 同班禁止 | `forbidden_group` のペアを同じ班に置かない |
| H-06 | 座席性別制約 | `seat_gender_constraint(R, G)` の座席に G 以外の性別を置かない |
| H-08 | 相対的固定制約 | `relative_fixed(SA,SB,DR,DC)`: SA から (DR,DC) 先に座席があれば SB を必ずそこに置く |
| H-10 | 班分散グループ | `leader_group` の同一グループのメンバーを同じ班に置かない |

例:

```prolog
% H-02: 1席に複数人を配置してはならない
:- seat(R, _, _), #count { S : assign(S, R) } > 1.

% H-04: 8方向隣接禁止
:- forbidden8(S1, S2), assign(S1, R1), assign(S2, R2), adjacent8(R1, R2).
```

> [!IMPORTANT]
> `differ_seat` / `differ_neighbor` / `differ_group` はハード制約ではなく、`soft.lp` の
> 弱制約（S-05〜S-07 と O-1: 前回同席への追加ペナルティ）として実装されている。詳細は §3.3 を参照。

### 3.3 `soft.lp` — Soft 制約

弱制約 `:~ 条件. [重み@優先度レベル, 識別子...]` で記述する。  
clingo は各優先度レベルで合計ペナルティを最小化し、**高いレベルほど優先的に**最小化する（辞書式最適化）。

| ID | 優先度 | 制約 | 活性化条件 |
|----|--------|------|-----------|
| S-01 | @5 | 前列希望: 最近接前列からの行距離をペナルティ | 常時 |
| S-02 | @5 | 後列希望: 最近接後列からの行距離をペナルティ | 常時 |
| S-03 | @4 | 班内男女バランス: 班に男女どちらかが0人 | `opt_gender_balance` |
| S-04 | @4 | 孤独感緩和: 横隣∪同班に同性が1人もいない | `opt_loneliness` |
| S-05 | @1 | 前回同席ペナルティ | 常時 |
| S-06 | @3 | 前回横隣ペアが今回も横隣 | `opt_prev_neighbor_differ` |
| S-07 | @2 | 前回と同じ班メンバー構成 | `opt_prev_group_differ` |
| O-1 | @1 | 前回同席の追加ペナルティ（S-05 を強化） | `opt_prev_seat_differ` |

例: 前列機能に関する制約（S-01）

前列希望は行距離 `D` の gradual penalty。`D=0` はペナルティなし。

```prolog
front_preferred_dist(S, D) :- tag(S, front_preferred), assign(S, R),
                              seat(R, RowR, _), D = #min { |RowR - RowF| : front_row(RowF) }.
:~ front_preferred_dist(S, D), D > 0. [D@5, S]
```

> [!NOTE]
> **UI 上の違反点数とバックエンド側の差異について**  
> `soft.lp` は行距離（gradual）でペナルティを与え「充足不能でもできるだけ前/後に寄せる」最適化を働かせる。一方 `score.py`（`compute_score`）は、距離の大小を問わずエリア外にいる児童・生徒の人数を数える（各児童・生徒をエリア内＝0／外＝1 で判定して合計）。UI 表示は件数で十分なため、この数値差は意図的かつ許容済み。

> [!NOTE]
> **探索誘導（`#heuristic`）**  
> S-01/S-02 には `#heuristic assign(S,R) : tag(...), in_front/back(R). [2, true]` を指定し、配慮タグの児童・生徒を希望エリアに置いた状態から探索を始めさせる。最適解の定義は変えず、短い持ち時間でも良い解を早く得るための誘導。clingo 起動時に `--heuristic=Domain` が必要（`runner.py` で指定済み）で、ハード制約ではないため UNSAT にはならない。

## 4. Pythonオーケストレーター設計

ファイル: [`backend/solver/runner.py`](../backend/solver/runner.py)

`run_solver(data, max_solutions=5, timeout=30) -> tuple[list[list[dict]], bool]` が clingo を実行し、`(solutions, timed_out)` を返す。  
`solutions` が空かつ `timed_out=False` なら UNSAT であることが確定する。

### 4.1 処理フロー（マルチショット × 並列求解）

#### 1. フラット展開

ネスト形式の API リクエスト（`classroom` / `constraints` / `options`）を `flat_data` に展開する。

   ```
   flat_data = {
     students, seats,
     front_rows, back_rows,        # back_rows=None は facts.py で最終行を自動補完
     groups,
     fixed, forbidden, seat_gender, relative_fixed, leader_groups,
     prev_assign, prev_options, soft_toggles,
   }
   ```

#### 2. FactBase 構築 & grounding

`build_factbase()` で `FactBase` を作り、 `ctrl.ground()` を Control 生成直後に1回だけ呼ぶ。  
以降の `solve()` はグラウンドプログラムを再利用するため grounding コストはゼロ（multi-shot solving）。

#### 3. マルチショットループ（最大 `max_solutions` 回）

- 各ショットで**全スレッド**の `configuration.solver[i].seed` を変更し、独立した探索空間から解を得る
  （`configuration.solver.seed` への代入は solver[0] にしか効かないため、スレッド数分ループする）。
- ショット内では `--parallel-mode=max_workers`（`max_workers = min(max_solutions, SOLVER_WORKERS)`）で
  C レベルのスレッドが並列探索する。`on_model` は clingo が mutex 保護するためスレッドセーフ。
- タイムアウトは `per_shot_timeout = max(1.0, timeout / max_solutions)` で均等分配。
- `wait()` が False ならタイムアウト（`handle.cancel()`、`timed_out=True`）。
- 各ショットの最良解を `frozenset` キーで重複排除して収集する。
- 解を収集するたびに**距離制約**を追加 grounding する（§4.2）。
- `unsatisfiable and exhausted` の場合:
  - 距離制約をまだ追加していなければ**確定 UNSAT**として早期終了（`timed_out=False`）。
  - 距離制約追加後なら「十分に異なる解が尽きた」証明なので、それまでの解群を返して打ち切る。

**clingo 起動引数について**

| 引数 | 役割 |
|------|------|
| `-n 1` | compete モードで各スレッドが最適解を1件証明した時点でショット終了 |
| `--opt-mode=optN` | 最適スコアを求めた後に列挙（中間解も `on_model` に届く） |
| `--heuristic=Domain` | `soft.lp` の `#heuristic` ディレクティブを有効化（前/後配慮の初期解品質向上） |
| `--rand-freq=SOLVER_RAND_FREQ` | ランダム選択頻度（既定 0.05。大きくすると探索誘導が壊れ解品質が劣化する） |
| `--seed`, `--parallel-mode` | シードとショット内並列スレッド数 |

### 4.2 距離制約による解の多様化

シード変更だけでは「数人が入れ替わっただけの類似解」や完全一致解が返ることがある
（特に `--rand-freq` が小さいと顕著）。そこでショット k の解を得るたびに、
解をファクト化した小さな program part を追加 grounding する:

```
divsolK(1,5). divsolK(2,3). ...   % ショット K の解（生徒ID, 座席ID）
:- #count { S : divsolK(S, R), assign(S, R) } > N - min_diff.
```

これは「既出解と同じ座席に座る生徒数が `N - min_diff` を超える配置」を禁止する
integrity constraint であり、以降のショットの解は既出の**全解**から
`min_diff` 人以上が別の座席になることが**保証**される（ハミング距離の下限保証）。

- `min_diff = floor(生徒数 × SOLVER_MIN_DIFF_RATIO)`（既定比率 0.5 = 半数以上が移動）。
- 固定制約で動けない生徒は差分に寄与できないため `生徒数 − 固定人数` でクランプする。
- base の再 grounding は発生しない（multi-shot solving のインクリメンタル grounding）。
- 距離制約下で UNSAT になったら「これ以上大きく異なる解は存在しない」ことが
  証明されたので、類似解で件数を水増しせずに打ち切る（`max_solutions` 未満で返る）。

## 5. サンプルデータと期待動作

テスト用サンプルは [`backend/tests/fixtures/sample_class.json`](../backend/tests/fixtures/sample_class.json)
（6名・2×3グリッド・2班構成）。

```
グリッド（行1=前列、行2=後列）:
     Col:1  Col:2  Col:3
Row:1  [1]    [2]    [3]   ← 前列（黒板側）
Row:2  [4]    [5]    [6]

班構成:
  班1: 座席 1,2,4,5（左2列の4席）
  班2: 座席 3,6（右1列の2席）
```

このサンプルでの期待動作（`student_id` 1 が `front_preferred`、4 が `back_preferred`、
2 と 5 が隣接禁止ペアの場合）:

- **S-01**: 児童・生徒1が前列（seat 1〜3）に配置される
- **S-02**: 児童・生徒4が後列（seat 4〜6）に配置される
- **S-03**（`opt_gender_balance`）: 各班に男女が1人以上いる
- **S-04**（`opt_loneliness`）: 各児童・生徒の横隣または同班に同性が1人以上いる
- **H-04**: 児童・生徒2と5が8方向隣接しない
- **S-05**: 全員が前回と異なる席になるよう最適化される

## 6. テスト設計

ソルバの単体テストは [`backend/tests/test_solver.py`](../backend/tests/test_solver.py)。  
スコア・バリデーション等も含むバックエンド全体の構成は次の通り。

| ファイル | 観点 |
|---------|------|
| `test_solver.py` | Hard/Soft制約の動作・班分散グループ（clingo 実行） |
| `test_api.py` | REST API 統合・ソフトトグル・前回オプション・ソルバエラー処理 |
| `test_score_and_meta.py` | `compute_score()` の各違反カウント・制約メタデータ（ソルバ不使用） |
| `test_score.py` | `compute_score()` 詳細（ハード違反検出・欠損seat_id耐性・孤独感） |
| `test_validation.py` | 制約整合性チェックの単体テスト |

**ソルバの主な検証観点**（`test_solver.py`）:

- Hard制約: 1人1席・1席1人、固定、8方向隣接禁止、同班禁止、性別制約、相対固定、班分散
- Soft制約: front/back 配慮の最適解、班内男女バランス、孤独感緩和
- 複数解: 解が複数返り、互いに異なること

### デバッグ用: ソルバの直接実行

```bash
# コンテナ内で .lp を直接実行（FactBase なしの構文確認）
docker exec optiseat-backend-1 bash -c "
  clingo backend/solver/lp/base.lp backend/solver/lp/hard.lp backend/solver/lp/soft.lp \
         --opt-mode=optN --heuristic=Domain -n 5
"

# fixture を使って Python から実行
docker exec optiseat-backend-1 bash -c "cd /workspace && python -c \"
from backend.solver.runner import run_solver
import json
with open('backend/tests/fixtures/sample_class.json') as f:
    data = json.load(f)
solutions, timed_out = run_solver(data)
for i, sol in enumerate(solutions):
    print(f'Solution {i+1}:', sorted(sol, key=lambda x: x['seat_id']))
\""
```
