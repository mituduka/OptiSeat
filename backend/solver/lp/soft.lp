%=============================================================================
% soft.lp — Soft 制約（弱制約による最適化）
%
% 弱制約（:~）の構文:
%   :~ 条件. [重み@優先度レベル, 識別子...]
%
% clingo は各優先度レベルで合計ペナルティを最小化する。
% 高いレベルほど優先的に最小化される（辞書式最適化）。
%
% 優先度レベル:
%   @5 (最高): 座席希望（前列・後列）の充足
%   @4       : 班内の男女配慮（バランス・孤独感緩和）
%   @3       : 前回左右の隣が一致しない（opt_prev_neighbor_differ 有効時）
%   @2       : 前回と同じ班構成にならない（opt_prev_group_differ 有効時）
%   @1 (低)  : 前回と同じ座席にならない（opt_prev_seat_differ 有効時）
%=============================================================================


%-----------------------------------------------------------------------------
% S-01: 前列希望 → 最近接前列からの行距離をペナルティとする（優先度 @5）
%
% front_preferred タグを持つ児童・生徒 S が配置された座席の行 RowR から、
% 最も近い front_row(RowF) までの行距離 D を計算してペナルティとする。
% D=0 のとき（前列に配置）はペナルティなし（D > 0 ガード）。
%
% 【設計判断】front_preferred / back_preferred のコスト体系について
% soft.lp では行距離 D（gradual penalty）を使用する。
% これにより「充足不能時でもできるだけ前（後）に配置する」最適化が働く。
% 一方、compute_score（score.py）は距離を問わず「エリア外にいる人数」を数える（各児童・生徒をエリア内=0／外=1 で判定）。
% この差異は意図的なもの。ユーザーは行距離の大小ではなく
% 「前列エリアにいるかどうか」にのみ関心があり、
% 違反件数の表示（UI）は「エリア外かどうか」で十分と判断している。
% ASP のコスト値と Python のカウント値が数値として一致しないのは既知かつ許容済み。
%-----------------------------------------------------------------------------

% 座席ごとの最近接 front_row への距離（静的補助述語）
% seat / front_row のみに依存するため座席ごとに1回だけ grounding される
% （タグ付き生徒×座席ごとに #min を評価するより無駄がない）。
% front_row(_) ガード: 前側エリア未設定（front_row ファクトなし）の場合は
% 距離が定義できないため対象外とする（空集合の #min が #sup になる挙動に
% 依存せず、ルール自体を成立させない明示的なガード）。
% ※ #min のタプル内のグローバル変数 RowR に clingo が info 警告を出すが、
%   各座席ごとに独立した集約として意図どおりに評価される（無害）。
front_dist(R, D) :-
    seat(R, RowR, _),
    front_row(_),
    D = #min { |RowR - RowF| : front_row(RowF) }.

front_preferred_dist(S, D) :-
    tag(S, front_preferred),
    assign(S, R),
    front_dist(R, D).

:~ front_preferred_dist(S, D), D > 0. [D@5, S]

% 探索誘導: front_preferred の児童・生徒を前列座席に優先的に配置する（#heuristic）
%
% 【#heuristic 構文】
%   #heuristic <atom> : <condition>. [<weight>@<priority>, <modifier>]
%
%   - atom      : ヒューリスティックを適用する原子（assign(S, R)）
%   - condition : 適用条件（省略可）。条件が成立するときのみバイアスが有効
%   - weight    : バイアスの強さ（整数）。同一原子に複数の #heuristic が
%                 競合した場合、weight が大きいものが採用される
%   - @priority : 複数の #heuristic の適用順序（省略時は 0）。
%                 priority が高いものから順に変数選択に反映される。
%                 ここでは省略しているため 0 扱い
%   - modifier  : 原子の真偽を「どう優先するか」を指定する
%                   true  = その原子を優先的に選択して true にする（選択順も変える）
%                   false = その原子を優先的に選択して false にする
%                   sign  = 変数が選択されたとき weight の符号に応じた真偽を好む
%                           （選択順は変えない）
%                   level = 変数の decision level を weight に設定
%
% 【--heuristic=Domain フラグ】
%   clingo 起動時に --heuristic=Domain を付けないと #heuristic は完全に無視される。
%   このフラグを付けると clingo は "Domain" ヒューリスティックモードで動作し、
%   #heuristic ディレクティブで指定された原子を優先的に真偽決定する。
%
% 【本行の意味】
%   条件: tag(S, front_preferred) かつ in_front(R) が成立する (S, R) の組
%   効果: 変数が選択されたとき assign(S, R) を真にすることを好む（modifier=sign）
%   結果: front_preferred な児童・生徒が前列座席に配置された初期解が得られやすくなる。
%         タイムアウトで最適化が完了しなくても、初期解の質が向上する。
%         ハード制約ではないため UNSAT にはならず、最善努力を続ける。
%
% 【modifier を true でなく sign にする理由】
%   true は決定順を grounding 順に固定するため、配慮タグの児童・生徒が
%   実行間でも解候補間でも毎回同じ席（エリア内の最小 ID 席）に張り付く。
%   sign は選択順を強制せず符号の好みだけを与えるため、誘導効果
%   （タイムアウト時の @5 品質）を保ったままエリア内での席が
%   シード・ショットごとに分散する（両者とも実測で確認済み）。
%
% 参考: https://potassco.org/clingo/
%       https://github.com/ludaesch/clingo_guide/blob/master/heuristic.tex
#heuristic assign(S, R) : tag(S, front_preferred), in_front(R). [1, sign]


%-----------------------------------------------------------------------------
% S-02: 後列希望 → 最近接後列からの行距離をペナルティとする（優先度 @5）
%
% back_preferred タグを持つ児童・生徒 S が配置された座席の行 RowR から、
% 最も近い back_row(RowB) までの行距離 D を計算してペナルティとする。
% D=0 のとき（後列に配置）はペナルティなし（D > 0 ガード）。
%-----------------------------------------------------------------------------

% 座席ごとの最近接 back_row への距離（静的補助述語。S-01 の front_dist と同趣旨）
% back_row(_) ガード: 後側エリア未設定時は対象外
back_dist(R, D) :-
    seat(R, RowR, _),
    back_row(_),
    D = #min { |RowB - RowR| : back_row(RowB) }.

back_preferred_dist(S, D) :-
    tag(S, back_preferred),
    assign(S, R),
    back_dist(R, D).

:~ back_preferred_dist(S, D), D > 0. [D@5, S]

% 探索誘導: back_preferred の児童・生徒を後列座席に優先的に配置する（#heuristic）
%
% 構文・フラグ・sign を選ぶ理由の詳細は S-01 の #heuristic コメントを参照。
% 条件: tag(S, back_preferred) かつ in_back(R) が成立する (S, R) の組
% 効果: 変数が選択されたとき assign(S, R) を真にすることを好む（modifier=sign）
% 結果: back_preferred な児童・生徒が後列座席に配置された初期解が得られやすくなる。
#heuristic assign(S, R) : tag(S, back_preferred), in_back(R). [1, sign]


%-----------------------------------------------------------------------------
% S-03: 班内男女バランス（重み 1、優先度 @4）
%
% 班に男性が 0 人、または女性が 0 人の場合にペナルティを与える。
% 誰も配置されていない班（空班）は対象外とする。座席数 > 人数のとき、
% 空班にまでペナルティを与えると内部コストが score.py の表示
% （空班は males+females > 0 で除外）と乖離し、ソルバが空班を作らない
% 方向へ暗黙に誘導されてしまうため、表示側の解釈に合わせる。
%-----------------------------------------------------------------------------

% 班に誰か1人でも配置されているか（空班除外用）
group_occupied(G) :- in_group(_, G).

:~ opt_gender_balance, group_occupied(G), not group_has_male(G).   [1@4, G]
:~ opt_gender_balance, group_occupied(G), not group_has_female(G). [1@4, G]


%-----------------------------------------------------------------------------
% S-04: 孤独感緩和（重み 1、優先度 @4）
%
% 「孤独感緩和ピア集合」= ① 横隣（左右、最大 2 人） ∪ ② 同班の他メンバー（最大 2 人）
% この集合に同性が 1 人もいない場合にペナルティ。
%-----------------------------------------------------------------------------

% 補助①: 横隣（グループを跨いでよい、同じ行で列が 1 差）
% S < S2 で片方向ペアのみ生成してファクト数を半減（対称性は _same_gender の2ルールで対応）
% opt_loneliness をボディに含めることで、トグル OFF 時は O(N^2) の grounding 自体を省く
loneliness_peer(S, S2) :-
    opt_loneliness,
    assign(S, R1), assign(S2, R2), S < S2,
    seat(R1, Row, Col1), seat(R2, Row, Col2),
    |Col1 - Col2| = 1.

% 補助②: 同班の他メンバー（横隣でなくてもよい）
% S < S2 で片方向ペアのみ生成してファクト数を半減
loneliness_peer(S, S2) :-
    opt_loneliness,
    in_group(S, G), in_group(S2, G), S < S2.

% 補助: ピア集合に同性が存在するか（両方向チェックで意味論を保持）
loneliness_peer_same_gender(S) :-
    loneliness_peer(S, S2),
    student(S, Gender), student(S2, Gender).

loneliness_peer_same_gender(S) :-
    loneliness_peer(S2, S),
    student(S, Gender), student(S2, Gender).

% 弱制約本体: ピア集合に同性が 1 人もいない場合ペナルティ
:~ opt_loneliness,
   assign(S, _),
   not loneliness_peer_same_gender(S).
   [1@4, S]


%-----------------------------------------------------------------------------
% S-05: 前回配置との乖離（opt_prev_seat_differ 有効時、重み 1、優先度 @1）
%
% 前回と同じ座席に配置された場合にペナルティ。
% UI の「前回と異なる座席」トグル（differ_seat）に連動する。
%
% 【経緯】かつては S-05 を常時有効とし、トグル有効時に加算する O-1 が別に
% 存在したが、O-1 は S-05 と弱制約タプル (1@1, S) が同一のため潰れて無効
% だった（Issue #58）。また @1 レベルには他のコストが存在しないため、仮に
% 加算を有効化してもレベル内の一様な重み倍増となり最適解は変化しない。
% そこで S-05 自体をトグル連動にし、O-1 は削除した（トグル OFF 時は
% 前回席を考慮しない。違反リストの「無効」表示とも一致する）。
%-----------------------------------------------------------------------------

:~ opt_prev_seat_differ,
   prev_assign(S, R),
   assign(S, R).
   [1@1, S]


%-----------------------------------------------------------------------------
% 補助ルール: 前回班の同一構成チェック（S-07 用）
%-----------------------------------------------------------------------------

% 前回の班の人数
prev_group_size(G, N) :-
    prev_group_id(G),
    N = #count { S : prev_group_member(G, S) }.

% 現在の班 Gnew が前回の班 Gprev と同じメンバー構成かどうか
same_group_composition(Gnew, Gprev) :-
    group_id(Gnew),
    prev_group_id(Gprev),
    prev_group_size(Gprev, Size),
    #count { S : prev_group_member(Gprev, S), in_group(S, Gnew) } = Size,
    #count { S : in_group(S, Gnew) } = Size.


%-----------------------------------------------------------------------------
% S-06: 前回左右一致ペナルティ（opt_prev_neighbor_differ 有効時、優先度 @3）
%
% 前回横隣（同行・列差1）だったペアが今回も横隣になった場合にペナルティ。
%-----------------------------------------------------------------------------

:~ opt_prev_neighbor_differ,
   prev_row_neighbor(S1, S2),
   assign(S1, R1),
   assign(S2, R2),
   seat(R1, Row, Col1),
   seat(R2, Row, Col2),
   |Col1 - Col2| = 1.
   [1@3, S1, S2]


%-----------------------------------------------------------------------------
% S-07: 前回同班ペナルティ（opt_prev_group_differ 有効時、優先度 @2）
%
% 今回の班が前回の班と全く同じメンバー構成の場合にペナルティ。
%-----------------------------------------------------------------------------

:~ opt_prev_group_differ,
   same_group_composition(Gnew, Gprev).
   [1@2, Gnew, Gprev]
