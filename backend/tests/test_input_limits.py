"""
API 入力サイズ上限のテスト

各リストの件数上限と ID の値域上限について、
  - 上限ちょうどは受け付けること
  - 上限 + 1 は 422 で拒否されること
  - 既存 fixture・通常規模の入力が引き続き通ること
を検証する。上限値は環境変数で変わりうるため、定数を import して組み立てる。
"""

from __future__ import annotations

import copy
import inspect
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.api import routes
from backend.api.config import MAX_STUDENTS, SEAT_MAX_COLS, SEAT_MAX_ROWS
from backend.api.main import app
from backend.api.schemas import (
    MAX_FORBIDDEN,
    MAX_LEADER_GROUPS,
    MAX_RELATIVE_FIXED,
    MAX_SEATS,
    STUDENT_ID_MAX,
    ScoreRequest,
    SolveRequest,
    TagType,
    ValidateRequest,
)

client = TestClient(app)

FIXTURES_DIR = Path(__file__).parent / "fixtures"
_raw = json.loads((FIXTURES_DIR / "sample_class.json").read_text())
SAMPLE_REQUEST = {k: v for k, v in _raw.items() if not k.startswith("_")}

ENDPOINTS = {
    "solve": "/api/v1/solve",
    "score": "/api/v1/score",
    "validate": "/api/v1/validate",
}

# 上限ちょうどの入力を 1 つずつ作るための (行, 列) オフセット（中心を除く 8 方向）
OFFSETS = [(dr, dc) for dr in (-1, 0, 1) for dc in (-1, 0, 1) if (dr, dc) != (0, 0)]


# ---------------------------------------------------------------------------
# 上限いっぱいの入力を組み立てるヘルパ
# ---------------------------------------------------------------------------


def _students() -> list[dict[str, Any]]:
    return [
        {"id": i, "gender": "male" if i % 2 else "female", "tags": []}
        for i in range(1, MAX_STUDENTS + 1)
    ]


def _seats() -> list[dict[str, Any]]:
    # frontend の generateSeats と同じ行優先の連番
    return [
        {"id": (r - 1) * SEAT_MAX_COLS + c, "row": r, "col": c}
        for r in range(1, SEAT_MAX_ROWS + 1)
        for c in range(1, SEAT_MAX_COLS + 1)
    ]


def _full_constraints() -> dict[str, Any]:
    ids = range(1, MAX_STUDENTS + 1)
    forbidden = [
        {"student_id_a": a, "student_id_b": b, "type": t}
        for t in ("adjacent8", "same_group")
        for a in ids
        for b in ids
        if a != b
    ]
    relative_fixed = [
        {
            "student_id_a": a,
            "student_id_b": a % MAX_STUDENTS + 1,
            "d_row": dr,
            "d_col": dc,
        }
        for a in ids
        for dr, dc in OFFSETS
    ]
    return {
        "fixed": [{"student_id": i, "seat_id": i} for i in ids],
        "forbidden": forbidden,
        "seat_gender": [
            {"seat_id": s, "allowed_gender": "male"} for s in range(1, MAX_SEATS + 1)
        ],
        "relative_fixed": relative_fixed,
        "leader_groups": [
            {"group_id": g, "student_ids": list(ids)}
            for g in range(MAX_LEADER_GROUPS)
        ],
    }


def _full_payload(endpoint: str) -> dict[str, Any]:
    """endpoint 用に、全リストを上限ちょうどにした入力を返す。"""
    students = _students()
    students[0]["tags"] = [t.value for t in TagType]
    base: dict[str, Any] = {
        "students": students,
        "seats": _seats(),
        "constraints": _full_constraints(),
    }
    if endpoint == "validate":
        return base
    base["classroom"] = {
        "num_rows": SEAT_MAX_ROWS,
        "num_cols": SEAT_MAX_COLS,
        "front_rows": list(range(1, SEAT_MAX_ROWS + 1)),
        "back_rows": list(range(1, SEAT_MAX_ROWS + 1)),
    }
    # 1 席ずつの班を座席数ぶん（班の数が上限ちょうど）
    base["groups"] = [
        {"group_id": s, "seat_ids": [s]} for s in range(1, MAX_SEATS + 1)
    ]
    base["prev_assign"] = [
        {"student_id": i, "seat_id": i} for i in range(1, MAX_STUDENTS + 1)
    ]
    if endpoint == "score":
        base["assignments"] = [
            {"student_id": i, "seat_id": MAX_SEATS - i + 1}
            for i in range(1, MAX_STUDENTS + 1)
        ]
    return base


def _full_payload_single_group(endpoint: str) -> dict[str, Any]:
    """1 班に全座席を入れた入力（GroupLayout.seat_ids が上限ちょうど）。"""
    p = _full_payload(endpoint)
    p["groups"] = [{"group_id": 1, "seat_ids": list(range(1, MAX_SEATS + 1))}]
    return p


# ---------------------------------------------------------------------------
# 上限 + 1 にする変更（payload を破壊的に変更する）
# ---------------------------------------------------------------------------


def _append_dup(path: list[str | int]) -> Callable[[dict[str, Any]], None]:
    """path のリストに先頭要素の複製を 1 件足して上限 + 1 にする。"""

    def mutate(p: dict[str, Any]) -> None:
        target: Any = p
        for key in path:
            target = target[key]
        target.append(copy.deepcopy(target[0]))

    return mutate


def _set_tags_over(p: dict[str, Any]) -> None:
    p["students"][0]["tags"] = [t.value for t in TagType] + [TagType.front_preferred.value]


def _set_rows_over(key: str) -> Callable[[dict[str, Any]], None]:
    def mutate(p: dict[str, Any]) -> None:
        p["classroom"][key] = list(range(1, SEAT_MAX_ROWS + 1)) + [1]

    return mutate


# (名前, 対象 endpoint, 上限ちょうどの payload 生成, 上限 + 1 にする変更)
LIST_CASES: list[
    tuple[str, tuple[str, ...], Callable[[str], dict[str, Any]], Callable[[dict[str, Any]], None]]
] = [
    ("tags", ("solve", "score", "validate"), _full_payload, _set_tags_over),
    ("fixed", ("solve", "score", "validate"), _full_payload, _append_dup(["constraints", "fixed"])),
    ("forbidden", ("solve", "score", "validate"), _full_payload, _append_dup(["constraints", "forbidden"])),
    ("seat_gender", ("solve", "score", "validate"), _full_payload, _append_dup(["constraints", "seat_gender"])),
    ("relative_fixed", ("solve", "score", "validate"), _full_payload, _append_dup(["constraints", "relative_fixed"])),
    ("leader_groups", ("solve", "score", "validate"), _full_payload, _append_dup(["constraints", "leader_groups"])),
    (
        "leader_groups.student_ids",
        ("solve", "score", "validate"),
        _full_payload,
        _append_dup(["constraints", "leader_groups", 0, "student_ids"]),
    ),
    ("groups", ("solve", "score"), _full_payload, _append_dup(["groups"])),
    ("groups.seat_ids", ("solve", "score"), _full_payload_single_group, _append_dup(["groups", 0, "seat_ids"])),
    ("prev_assign", ("solve", "score"), _full_payload, _append_dup(["prev_assign"])),
    ("assignments", ("score",), _full_payload, _append_dup(["assignments"])),
    ("front_rows", ("solve", "score"), _full_payload, _set_rows_over("front_rows")),
    ("back_rows", ("solve", "score"), _full_payload, _set_rows_over("back_rows")),
]

MODELS = {"solve": SolveRequest, "score": ScoreRequest, "validate": ValidateRequest}

LIST_PARAMS = [
    pytest.param(endpoint, make, mutate, id=f"{name}-{endpoint}")
    for name, endpoints, make, mutate in LIST_CASES
    for endpoint in endpoints
]


# ---------------------------------------------------------------------------
# 上限値そのものの確認
# ---------------------------------------------------------------------------


class TestDerivedLimits:
    def test_limits_are_derived_from_config(self):
        assert MAX_SEATS == SEAT_MAX_ROWS * SEAT_MAX_COLS
        # 順序付きペア × type 2 種類（frontend は (A,B) と (B,A) を別に持てる）
        assert MAX_FORBIDDEN == MAX_STUDENTS * (MAX_STUDENTS - 1) * 2
        assert MAX_RELATIVE_FIXED == MAX_STUDENTS * 8
        assert MAX_LEADER_GROUPS == MAX_STUDENTS

    def test_student_id_max_fits_clingo_int(self):
        import clingo

        clingo.Number(STUDENT_ID_MAX)
        with pytest.raises(OverflowError):
            clingo.Number(STUDENT_ID_MAX + 1)


# ---------------------------------------------------------------------------
# 上限ちょうどは通る
# ---------------------------------------------------------------------------


class TestAtLimitAccepted:
    @pytest.mark.parametrize("endpoint", ["solve", "score", "validate"])
    @pytest.mark.parametrize(
        "make", [_full_payload, _full_payload_single_group], ids=["many_groups", "one_group"]
    )
    def test_model_accepts_full_payload(self, endpoint, make):
        # /solve は上限いっぱいだとソルバ実行が重いため、スキーマ検証のみ確認する
        MODELS[endpoint].model_validate(make(endpoint))

    def test_score_endpoint_accepts_full_payload(self):
        resp = client.post(ENDPOINTS["score"], json=_full_payload("score"))
        assert resp.status_code == 200, resp.text

    def test_score_endpoint_accepts_single_full_group(self):
        resp = client.post(
            ENDPOINTS["score"], json=_full_payload_single_group("score")
        )
        assert resp.status_code == 200, resp.text

    def test_validate_endpoint_accepts_full_payload(self):
        resp = client.post(ENDPOINTS["validate"], json=_full_payload("validate"))
        assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------------------
# 上限 + 1 は 422
# ---------------------------------------------------------------------------


class TestOverLimitRejected:
    @pytest.mark.parametrize(("endpoint", "make", "mutate"), LIST_PARAMS)
    def test_list_over_limit_returns_422(self, endpoint, make, mutate):
        payload = make(endpoint)
        mutate(payload)
        resp = client.post(ENDPOINTS[endpoint], json=payload)
        assert resp.status_code == 422, resp.text
        types = {e["type"] for e in resp.json()["detail"]}
        # front_rows / back_rows は重複で行検証にも引っかかりうるが、
        # まず件数上限（too_long）で弾かれることを確認する
        assert "too_long" in types, resp.json()["detail"]


def _small_payload(endpoint: str) -> dict[str, Any]:
    payload = copy.deepcopy(SAMPLE_REQUEST)
    if endpoint == "validate":
        return {
            "students": payload["students"],
            "seats": payload["seats"],
            "constraints": payload["constraints"],
        }
    if endpoint == "score":
        payload["assignments"] = [
            {"student_id": s["id"], "seat_id": seat["id"]}
            for s, seat in zip(payload["students"], payload["seats"])
        ]
    return payload


class TestIdRange:
    @pytest.mark.parametrize("endpoint", ["solve", "score", "validate"])
    def test_seat_id_over_limit_rejected(self, endpoint):
        payload = _small_payload(endpoint)
        payload["constraints"]["seat_gender"] = [
            {"seat_id": MAX_SEATS + 1, "allowed_gender": "male"}
        ]
        resp = client.post(ENDPOINTS[endpoint], json=payload)
        assert resp.status_code == 422

    @pytest.mark.parametrize("endpoint", ["solve", "score", "validate"])
    def test_seat_input_id_over_limit_rejected(self, endpoint):
        payload = _small_payload(endpoint)
        payload["seats"][0]["id"] = MAX_SEATS + 1
        resp = client.post(ENDPOINTS[endpoint], json=payload)
        assert resp.status_code == 422

    @pytest.mark.parametrize("endpoint", ["solve", "score", "validate"])
    def test_student_id_over_limit_rejected(self, endpoint):
        payload = _small_payload(endpoint)
        payload["constraints"]["fixed"] = [
            {"student_id": STUDENT_ID_MAX + 1, "seat_id": 1}
        ]
        resp = client.post(ENDPOINTS[endpoint], json=payload)
        assert resp.status_code == 422

    def test_prev_assign_seat_id_over_limit_rejected(self):
        payload = _small_payload("solve")
        payload["prev_assign"] = [{"student_id": 1, "seat_id": MAX_SEATS + 1}]
        resp = client.post(ENDPOINTS["solve"], json=payload)
        assert resp.status_code == 422

    def test_score_assignment_ids_over_limit_rejected(self):
        payload = _small_payload("score")
        payload["assignments"][0]["seat_id"] = MAX_SEATS + 1
        resp = client.post(ENDPOINTS["score"], json=payload)
        assert resp.status_code == 422

    def test_group_id_over_limit_rejected(self):
        payload = _small_payload("solve")
        payload["groups"][0]["group_id"] = MAX_SEATS + 1
        resp = client.post(ENDPOINTS["solve"], json=payload)
        assert resp.status_code == 422

    def test_leader_group_id_over_limit_rejected(self):
        payload = _small_payload("validate")
        payload["constraints"]["leader_groups"] = [
            {"group_id": MAX_LEADER_GROUPS, "student_ids": [1, 2]}
        ]
        resp = client.post(ENDPOINTS["validate"], json=payload)
        assert resp.status_code == 422

    def test_seat_id_at_limit_accepted(self):
        payload = _small_payload("validate")
        payload["constraints"]["seat_gender"] = [
            {"seat_id": MAX_SEATS, "allowed_gender": "male"}
        ]
        resp = client.post(ENDPOINTS["validate"], json=payload)
        assert resp.status_code == 200
        # 名簿に無い座席なので警告になるだけ（参照整合性は拒否しない）
        assert any(w["code"] == "UNKNOWN_SEAT_ID" for w in resp.json()["warnings"])

    def test_student_id_at_limit_solves(self):
        # 値域上限の ID が clingo に渡っても解ける（オーバーフローしない）こと
        payload = {
            "students": [
                {"id": 1, "gender": "male"},
                {"id": STUDENT_ID_MAX, "gender": "female"},
            ],
            "seats": [{"id": 1, "row": 1, "col": 1}, {"id": 2, "row": 1, "col": 2}],
            "classroom": {"num_rows": 1, "num_cols": 2},
            "constraints": {"fixed": [{"student_id": STUDENT_ID_MAX, "seat_id": 2}]},
            "options": {"max_solutions": 1, "timeout": 5},
        }
        resp = client.post(ENDPOINTS["solve"], json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok", data
        assigned = {
            a["student_id"]: a["seat_id"] for a in data["solutions"][0]["assignments"]
        }
        assert assigned[STUDENT_ID_MAX] == 2

    def test_student_id_at_limit_with_all_rules(self):
        # 上限 ID が全ルール（ソフト制約・前回席・班・各ハード制約）を通っても
        # clingo の整数演算・集約でオーバーフローしないこと
        big = STUDENT_ID_MAX
        payload = {
            "students": [
                {"id": 1, "gender": "male", "tags": ["front_preferred"]},
                {"id": 2, "gender": "female", "tags": []},
                {"id": 3, "gender": "male", "tags": ["back_preferred"]},
                {"id": big, "gender": "female", "tags": ["back_preferred"]},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
                {"id": 3, "row": 2, "col": 1},
                {"id": 4, "row": 2, "col": 2},
            ],
            "classroom": {"num_rows": 2, "num_cols": 2},
            "groups": [
                {"group_id": 1, "seat_ids": [1, 3]},
                {"group_id": 2, "seat_ids": [2, 4]},
            ],
            "constraints": {
                "forbidden": [
                    {"student_id_a": big, "student_id_b": 2, "type": "same_group"}
                ],
                "relative_fixed": [
                    {"student_id_a": 1, "student_id_b": 2, "d_row": 0, "d_col": 1}
                ],
                "leader_groups": [{"group_id": 0, "student_ids": [3, big]}],
            },
            "prev_assign": [
                {"student_id": 1, "seat_id": 1},
                {"student_id": 2, "seat_id": 2},
                {"student_id": 3, "seat_id": 3},
                {"student_id": big, "seat_id": 4},
            ],
            "options": {
                "max_solutions": 1,
                "timeout": 10,
                "prev_options": {
                    "differ_seat": True,
                    "differ_neighbor": True,
                    "differ_group": True,
                },
                "soft_toggles": {"gender_balance": True, "loneliness": True},
            },
        }
        resp = client.post(ENDPOINTS["solve"], json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok", data
        assigned = {
            a["student_id"]: a["seat_id"] for a in data["solutions"][0]["assignments"]
        }
        assert big in assigned


# ---------------------------------------------------------------------------
# 既存 fixture・通常規模の入力は引き続き通る
# ---------------------------------------------------------------------------


def _normal_payload() -> dict[str, Any]:
    """30 人・6×6 教室・各種制約を少しずつ入れた通常規模の入力。"""
    rows, cols, n = 6, 6, 30
    seats = [
        {"id": (r - 1) * cols + c, "row": r, "col": c}
        for r in range(1, rows + 1)
        for c in range(1, cols + 1)
    ]
    students = [
        {"id": i, "gender": "male" if i % 2 else "female", "tags": []}
        for i in range(1, n + 1)
    ]
    students[0]["tags"] = ["front_preferred"]
    students[1]["tags"] = ["back_preferred"]
    groups = [
        {
            "group_id": g + 1,
            "seat_ids": [
                (r - 1) * cols + c
                for r in range(1, rows + 1)
                for c in range(1, cols + 1)
                if (c - 1) // 2 == g
            ],
        }
        for g in range(3)
    ]
    return {
        "students": students,
        "seats": seats,
        "classroom": {
            "num_rows": rows,
            "num_cols": cols,
            "front_rows": [1, 2],
            "back_rows": [6],
        },
        "groups": groups,
        "constraints": {
            "fixed": [{"student_id": 3, "seat_id": 1}],
            "forbidden": [
                {"student_id_a": 4, "student_id_b": 5, "type": "adjacent8"},
                {"student_id_a": 6, "student_id_b": 7, "type": "same_group"},
            ],
            "seat_gender": [{"seat_id": 36, "allowed_gender": "female"}],
            "relative_fixed": [
                {"student_id_a": 8, "student_id_b": 9, "d_row": 0, "d_col": 1}
            ],
            "leader_groups": [{"group_id": 0, "student_ids": [10, 11, 12]}],
        },
        "prev_assign": [{"student_id": i, "seat_id": i} for i in range(1, n + 1)],
        "options": {"max_solutions": 1, "timeout": 10},
    }


class TestNormalInputStillAccepted:
    def test_sample_fixture_solves(self):
        resp = client.post(ENDPOINTS["solve"], json=SAMPLE_REQUEST)
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    @pytest.mark.parametrize("endpoint", ["score", "validate"])
    def test_sample_fixture_score_and_validate(self, endpoint):
        resp = client.post(ENDPOINTS[endpoint], json=_small_payload(endpoint))
        assert resp.status_code == 200, resp.text

    def test_normal_size_solves(self):
        resp = client.post(ENDPOINTS["solve"], json=_normal_payload())
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_normal_size_score(self):
        payload = _normal_payload()
        payload.pop("options")
        payload["assignments"] = payload["prev_assign"]
        resp = client.post(ENDPOINTS["score"], json=payload)
        assert resp.status_code == 200, resp.text
        assert resp.json()["score"]["breakdown"]["prev_assign_same"] == 30

    def test_normal_size_validate(self):
        p = _normal_payload()
        payload = {k: p[k] for k in ("students", "seats", "constraints")}
        resp = client.post(ENDPOINTS["validate"], json=payload)
        assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------------------
# /score と /validate がイベントループをブロックしない
# ---------------------------------------------------------------------------


class TestHandlersRunInThreadpool:
    @pytest.mark.parametrize("handler", [routes.score, routes.validate])
    def test_handler_is_sync_def(self, handler):
        # 同期 def のハンドラは FastAPI がスレッドプールで実行する
        assert not inspect.iscoroutinefunction(handler)
