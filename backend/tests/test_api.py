"""
OptiSeat API 統合テスト

FastAPI TestClient を使い、各エンドポイントの動作を検証する。

実行方法（Dev Container 内）:
  pytest backend/tests/test_api.py -v
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from backend.api.main import app

client = TestClient(app)

# テストフィクスチャ読み込み
FIXTURES_DIR = Path(__file__).parent / "fixtures"
_raw = json.loads((FIXTURES_DIR / "sample_class.json").read_text())
# アンダースコアで始まるコメントキーを除外
SAMPLE_REQUEST = {k: v for k, v in _raw.items() if not k.startswith("_")}


# ===========================================================================
# GET /health
# ===========================================================================


class TestHealthEndpoint:
    def test_returns_200(self):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_status_is_ok(self):
        resp = client.get("/health")
        data = resp.json()
        assert data["status"] == "ok"

    def test_includes_clingo_version(self):
        resp = client.get("/health")
        data = resp.json()
        assert "clingo" in data["solver"]

    def test_includes_api_version(self):
        resp = client.get("/health")
        data = resp.json()
        assert "version" in data


# ===========================================================================
# GET /api/v1/config
# ===========================================================================


class TestConfigEndpoint:
    def test_returns_200(self):
        resp = client.get("/api/v1/config")
        assert resp.status_code == 200

    def test_returns_seat_max_rows_and_cols(self):
        resp = client.get("/api/v1/config")
        data = resp.json()
        assert "seat_max_rows" in data
        assert "seat_max_cols" in data

    def test_does_not_return_classroom_keys(self):
        resp = client.get("/api/v1/config")
        data = resp.json()
        assert "classroom_max_rows" not in data
        assert "classroom_max_cols" not in data

    def test_seat_max_rows_is_positive_int(self):
        resp = client.get("/api/v1/config")
        data = resp.json()
        assert isinstance(data["seat_max_rows"], int)
        assert data["seat_max_rows"] > 0

    def test_seat_max_cols_is_positive_int(self):
        resp = client.get("/api/v1/config")
        data = resp.json()
        assert isinstance(data["seat_max_cols"], int)
        assert data["seat_max_cols"] > 0


# ===========================================================================
# POST /api/v1/solve
# ===========================================================================


class TestSolveEndpoint:
    def test_returns_200(self):
        resp = client.post("/api/v1/solve", json=SAMPLE_REQUEST)
        assert resp.status_code == 200

    def test_status_is_ok(self):
        resp = client.post("/api/v1/solve", json=SAMPLE_REQUEST)
        data = resp.json()
        assert data["status"] == "ok"

    def test_has_at_least_one_solution(self):
        resp = client.post("/api/v1/solve", json=SAMPLE_REQUEST)
        data = resp.json()
        assert len(data["solutions"]) >= 1

    def test_assignments_cover_all_students(self):
        resp = client.post("/api/v1/solve", json=SAMPLE_REQUEST)
        data = resp.json()
        num_students = len(SAMPLE_REQUEST["students"])
        for sol in data["solutions"]:
            assert len(sol["assignments"]) == num_students

    def test_each_solution_has_score(self):
        resp = client.post("/api/v1/solve", json=SAMPLE_REQUEST)
        data = resp.json()
        for sol in data["solutions"]:
            assert "score" in sol
            assert "total" in sol["score"]
            assert "breakdown" in sol["score"]
            assert sol["score"]["total"] >= 0

    def test_score_breakdown_has_all_fields(self):
        resp = client.post("/api/v1/solve", json=SAMPLE_REQUEST)
        data = resp.json()
        bd = data["solutions"][0]["score"]["breakdown"]
        for field in [
            "front_preferred_violation",
            "back_preferred_violation",
            "group_gender_imbalance",
            "loneliness_violation",
            "prev_assign_same",
        ]:
            assert field in bd

    def test_solution_ranks_are_sequential(self):
        resp = client.post("/api/v1/solve", json=SAMPLE_REQUEST)
        data = resp.json()
        for i, sol in enumerate(data["solutions"], start=1):
            assert sol["rank"] == i

    def test_max_solutions_option(self):
        req = {
            **SAMPLE_REQUEST,
            "options": {"max_solutions": 2, "timeout": 30},
        }
        resp = client.post("/api/v1/solve", json=req)
        data = resp.json()
        if data["status"] == "ok":
            assert len(data["solutions"]) <= 2

    def test_elapsed_ms_is_non_negative(self):
        resp = client.post("/api/v1/solve", json=SAMPLE_REQUEST)
        data = resp.json()
        assert data["elapsed_ms"] >= 0

    def test_front_preferred_student_in_front_row(self):
        """front_preferred タグを持つ児童・生徒が前列に配置されることを確認。"""
        resp = client.post("/api/v1/solve", json=SAMPLE_REQUEST)
        data = resp.json()
        assert data["status"] == "ok"

        # 最適解では student_id=1 (front_preferred) が前列（seat 1,2,3）にいるはず
        front_seat_ids = {
            s["id"]
            for s in SAMPLE_REQUEST["seats"]
            if s["row"] in SAMPLE_REQUEST["classroom"]["front_rows"]
        }
        sol = data["solutions"][0]
        assign_map = {
            a["student_id"]: a["seat_id"] for a in sol["assignments"]
        }
        student_1_seat = assign_map.get(1)  # student_id=1 は front_preferred
        assert student_1_seat in front_seat_ids

    def test_score_total_matches_breakdown(self):
        """score.total が breakdown の重み付き合計と一致することを確認。"""
        from backend.api.score import CONSTRAINT_WEIGHTS

        resp = client.post("/api/v1/solve", json=SAMPLE_REQUEST)
        data = resp.json()
        for sol in data["solutions"]:
            bd = sol["score"]["breakdown"]
            expected_total = sum(
                bd[key] * weight for key, weight in CONSTRAINT_WEIGHTS.items()
            )
            assert sol["score"]["total"] == expected_total

    def test_unsatisfiable_when_two_students_fixed_to_same_seat(self):
        req = dict(SAMPLE_REQUEST)
        req["constraints"] = {
            "fixed": [
                {"student_id": 1, "seat_id": 1},
                {"student_id": 2, "seat_id": 1},  # 同じ座席に2人を固定 → UNSAT
            ],
            "forbidden": [],
        }
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "unsatisfiable"
        assert data["solutions"] == []
        assert data["error"]["code"] == "UNSATISFIABLE"

    def test_validation_error_invalid_gender(self):
        req = dict(SAMPLE_REQUEST)
        req["students"] = [
            {"id": 1, "gender": "unknown", "tags": []}
        ] + SAMPLE_REQUEST["students"][1:]
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 422

    def test_validation_error_more_students_than_seats(self):
        req = dict(SAMPLE_REQUEST)
        req["students"] = SAMPLE_REQUEST["students"] + [
            {"id": 99, "gender": "male", "tags": []}
        ]
        # 7 students, 6 seats → バリデーションエラー
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 422

    def test_response_without_prev_assign(self):
        """prev_assign なしでも正常に動作することを確認。"""
        req = {k: v for k, v in SAMPLE_REQUEST.items() if k != "prev_assign"}
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

    def test_response_without_groups(self):
        """groups なしでも正常に動作することを確認。"""
        req = {k: v for k, v in SAMPLE_REQUEST.items() if k != "groups"}
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"


# ===========================================================================
# POST /api/v1/validate
# ===========================================================================


class TestValidateEndpoint:
    def _make_req(self, constraints: dict | None = None) -> dict:
        return {
            "students": SAMPLE_REQUEST["students"],
            "seats": SAMPLE_REQUEST["seats"],
            "constraints": constraints or {"fixed": [], "forbidden": []},
        }

    def test_returns_200(self):
        resp = client.post("/api/v1/validate", json=self._make_req())
        assert resp.status_code == 200

    def test_valid_true_for_clean_request(self):
        resp = client.post("/api/v1/validate", json=self._make_req())
        data = resp.json()
        assert data["valid"] is True
        assert data["warnings"] == []

    def test_warns_on_unknown_student_id_in_fixed(self):
        constraints = {
            "fixed": [{"student_id": 999, "seat_id": 1}],
            "forbidden": [],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        assert any(w["code"] == "UNKNOWN_STUDENT_ID" for w in data["warnings"])

    def test_warns_on_unknown_seat_id_in_fixed(self):
        constraints = {
            "fixed": [{"student_id": 1, "seat_id": 999}],
            "forbidden": [],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        assert any(w["code"] == "UNKNOWN_SEAT_ID" for w in data["warnings"])

    def test_warns_on_fixed_seat_conflict(self):
        constraints = {
            "fixed": [
                {"student_id": 1, "seat_id": 1},
                {"student_id": 2, "seat_id": 1},
            ],
            "forbidden": [],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        assert any(
            w["code"] == "FIXED_SEAT_CONFLICT" for w in data["warnings"]
        )

    def test_warns_on_unknown_student_id_in_forbidden(self):
        constraints = {
            "fixed": [],
            "forbidden": [{"student_id_a": 999, "student_id_b": 1}],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        assert any(w["code"] == "UNKNOWN_STUDENT_ID" for w in data["warnings"])

    def test_multiple_warnings_accumulated(self):
        """複数の問題がある場合、すべて警告として返されることを確認。"""
        constraints = {
            "fixed": [
                {"student_id": 999, "seat_id": 888},  # both unknown
            ],
            "forbidden": [],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        # student_id 不明 + seat_id 不明の2件
        assert len(data["warnings"]) >= 2


# ===========================================================================
# POST /api/v1/solve — ソフト制約トグル
# ===========================================================================


class TestSoftToggles:
    def test_gender_balance_true_minimizes_imbalance(self):
        """gender_balance=True の最適解では班内男女偏りが0になる。"""
        req = {
            **SAMPLE_REQUEST,
            "options": {
                "soft_toggles": {"gender_balance": True, "loneliness": True}
            },
        }
        resp = client.post("/api/v1/solve", json=req)
        data = resp.json()
        assert data["status"] == "ok"
        bd = data["solutions"][0]["score"]["breakdown"]
        assert bd["group_gender_imbalance"] == 0

    def test_gender_balance_false_still_solves(self):
        """gender_balance=False でも解が返ること。"""
        req = {
            **SAMPLE_REQUEST,
            "options": {
                "soft_toggles": {"gender_balance": False, "loneliness": True}
            },
        }
        resp = client.post("/api/v1/solve", json=req)
        assert resp.json()["status"] == "ok"

    def test_loneliness_false_still_solves(self):
        """loneliness=False でも解が返ること。"""
        req = {
            **SAMPLE_REQUEST,
            "options": {
                "soft_toggles": {"gender_balance": True, "loneliness": False}
            },
        }
        resp = client.post("/api/v1/solve", json=req)
        assert resp.json()["status"] == "ok"

    def test_both_toggles_false_still_solves(self):
        """両方 False でも解が返ること。"""
        req = {
            **SAMPLE_REQUEST,
            "options": {
                "soft_toggles": {"gender_balance": False, "loneliness": False}
            },
        }
        resp = client.post("/api/v1/solve", json=req)
        assert resp.json()["status"] == "ok"


# ===========================================================================
# POST /api/v1/solve — 前回座席オプション
# ===========================================================================


class TestPrevSeatOptions:
    def test_differ_seat_false_default_allows_same(self):
        """differ_seat=False（デフォルト）では前回と同じ座席も許可される。"""
        req = {
            **SAMPLE_REQUEST,
            "options": {"prev_options": {"differ_seat": False}},
        }
        resp = client.post("/api/v1/solve", json=req)
        assert resp.json()["status"] == "ok"

    def test_differ_seat_true_avoids_prev_seat(self):
        """differ_seat=True の場合、最適解で前回と同席する児童・生徒がいない。"""
        req = {
            **SAMPLE_REQUEST,
            "options": {
                "max_solutions": 1,
                "prev_options": {"differ_seat": True},
            },
        }
        resp = client.post("/api/v1/solve", json=req)
        data = resp.json()
        assert data["status"] == "ok"
        # differ_seat はハード制約なので prev_assign_same=0 が保証される
        bd = data["solutions"][0]["score"]["breakdown"]
        assert bd["prev_assign_same"] == 0

    def test_differ_neighbor_true_still_solves(self):
        """differ_neighbor=True でも解が返ること。"""
        req = {
            **SAMPLE_REQUEST,
            "options": {"prev_options": {"differ_neighbor": True}},
        }
        resp = client.post("/api/v1/solve", json=req)
        assert resp.json()["status"] == "ok"

    def test_differ_group_true_still_solves(self):
        """differ_group=True でも解が返ること。"""
        req = {
            **SAMPLE_REQUEST,
            "options": {"prev_options": {"differ_group": True}},
        }
        resp = client.post("/api/v1/solve", json=req)
        assert resp.json()["status"] == "ok"

    def test_all_prev_options_true_still_solves(self):
        """3つ全て True でも解が返ること。"""
        req = {
            **SAMPLE_REQUEST,
            "options": {
                "prev_options": {
                    "differ_seat": True,
                    "differ_neighbor": True,
                    "differ_group": True,
                }
            },
        }
        resp = client.post("/api/v1/solve", json=req)
        assert resp.json()["status"] == "ok"


# ===========================================================================
# POST /api/v1/validate — 追加チェック
# ===========================================================================


class TestValidateEndpointAdditional:
    def _make_req(self, constraints: dict | None = None) -> dict:
        return {
            "students": SAMPLE_REQUEST["students"],
            "seats": SAMPLE_REQUEST["seats"],
            "constraints": constraints or {"fixed": [], "forbidden": []},
        }

    def test_warns_on_gender_fixed_conflict(self):
        """female 固定 → male_only 座席 → GENDER_FIXED_CONFLICT 警告。"""
        # student4 は female（SAMPLE_REQUEST より）
        constraints = {
            "fixed": [{"student_id": 4, "seat_id": 1}],
            "forbidden": [],
            "seat_gender": [{"seat_id": 1, "allowed_gender": "male"}],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        assert any(
            w["code"] == "GENDER_FIXED_CONFLICT" for w in data["warnings"]
        )

    def test_no_warning_gender_matches_fixed(self):
        """male 固定 → male_only 座席 → GENDER_FIXED_CONFLICT 警告なし。"""
        # student1 は male（SAMPLE_REQUEST より）
        constraints = {
            "fixed": [{"student_id": 1, "seat_id": 1}],
            "forbidden": [],
            "seat_gender": [{"seat_id": 1, "allowed_gender": "male"}],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        assert not any(
            w["code"] == "GENDER_FIXED_CONFLICT" for w in data["warnings"]
        )

    def test_warns_on_relative_fixed_unknown_student_a(self):
        """relative_fixed の student_id_a が不明 → UNKNOWN_STUDENT_ID 警告。"""
        constraints = {
            "fixed": [],
            "forbidden": [],
            "relative_fixed": [
                {
                    "student_id_a": 999,
                    "student_id_b": 1,
                    "d_row": 0,
                    "d_col": 1,
                }
            ],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        assert any(w["code"] == "UNKNOWN_STUDENT_ID" for w in data["warnings"])

    def test_warns_on_relative_fixed_unknown_student_b(self):
        """relative_fixed の student_id_b が不明 → UNKNOWN_STUDENT_ID 警告。"""
        constraints = {
            "fixed": [],
            "forbidden": [],
            "relative_fixed": [
                {
                    "student_id_a": 1,
                    "student_id_b": 999,
                    "d_row": 0,
                    "d_col": 1,
                }
            ],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        assert any(w["code"] == "UNKNOWN_STUDENT_ID" for w in data["warnings"])

    def test_warns_on_seat_gender_unknown_seat(self):
        """seat_gender の seat_id が不明 → UNKNOWN_SEAT_ID 警告。"""
        constraints = {
            "fixed": [],
            "forbidden": [],
            "seat_gender": [{"seat_id": 999, "allowed_gender": "male"}],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        assert any(w["code"] == "UNKNOWN_SEAT_ID" for w in data["warnings"])

    def test_valid_is_false_when_warnings_exist(self):
        """警告がある場合 valid=False。"""
        constraints = {
            "fixed": [{"student_id": 999, "seat_id": 1}],
            "forbidden": [],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        assert data["valid"] is False
        assert len(data["warnings"]) >= 1

    def test_warns_on_relative_fixed_forbidden_conflict(self):
        """relative_fixed + forbidden(adjacent8) の矛盾 → RELATIVE_FIXED_FORBIDDEN_CONFLICT 警告。"""
        constraints = {
            "fixed": [],
            "forbidden": [
                {"student_id_a": 1, "student_id_b": 2, "type": "adjacent8"}
            ],
            "relative_fixed": [
                {"student_id_a": 1, "student_id_b": 2, "d_row": 0, "d_col": 1}
            ],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        assert any(
            w["code"] == "RELATIVE_FIXED_FORBIDDEN_CONFLICT"
            for w in data["warnings"]
        )

    def test_no_conflict_for_same_group_forbidden(self):
        """relative_fixed + forbidden(same_group) の組合せは RELATIVE_FIXED_FORBIDDEN_CONFLICT にならない。"""
        constraints = {
            "fixed": [],
            "forbidden": [
                {"student_id_a": 1, "student_id_b": 2, "type": "same_group"}
            ],
            "relative_fixed": [
                {"student_id_a": 1, "student_id_b": 2, "d_row": 0, "d_col": 1}
            ],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        assert not any(
            w["code"] == "RELATIVE_FIXED_FORBIDDEN_CONFLICT"
            for w in data["warnings"]
        )

    def test_relative_fixed_forbidden_conflict_not_duplicate(self):
        """同じペアの逆順エントリが重複しても1件の警告にまとめられる。"""
        constraints = {
            "fixed": [],
            "forbidden": [
                {"student_id_a": 1, "student_id_b": 2, "type": "adjacent8"},
                {
                    "student_id_a": 2,
                    "student_id_b": 1,
                    "type": "adjacent8",
                },  # 逆順
            ],
            "relative_fixed": [
                {"student_id_a": 1, "student_id_b": 2, "d_row": 0, "d_col": 1}
            ],
        }
        resp = client.post(
            "/api/v1/validate", json=self._make_req(constraints)
        )
        data = resp.json()
        conflicts = [
            w
            for w in data["warnings"]
            if w["code"] == "RELATIVE_FIXED_FORBIDDEN_CONFLICT"
        ]
        assert len(conflicts) == 1


# ===========================================================================
# H-1 修正テスト: ソルバ内部エラー時に 500 ではなく適切なレスポンスを返す
# ===========================================================================


class TestSolverErrorHandling:
    """runner.run_solver が例外を送出した場合、API が 500 でなく適切なレスポンスを返すことを確認"""

    def test_solver_runtime_error_returns_non_500(self, monkeypatch):
        """run_solver が RuntimeError を起こしても HTTP 500 にならない"""
        import backend.api.routes as routes_module

        def mock_run_solver(*args, **kwargs):
            raise RuntimeError("テスト用ソルバエラー")

        monkeypatch.setattr(routes_module, "run_solver", mock_run_solver)

        resp = client.post("/api/v1/solve", json=SAMPLE_REQUEST)
        assert resp.status_code == 200  # 500 ではない
        data = resp.json()
        assert data["status"] in ("unsatisfiable", "timeout")
        assert data.get("error") is not None
        assert data["error"]["code"] == "SOLVER_ERROR"

    def test_solver_unexpected_exception_returns_non_500(self, monkeypatch):
        """run_solver が ValueError 等の予期しない例外を起こしても HTTP 500 にならない"""
        import backend.api.routes as routes_module

        def mock_run_solver(*args, **kwargs):
            raise ValueError("unexpected error")

        monkeypatch.setattr(routes_module, "run_solver", mock_run_solver)

        resp = client.post("/api/v1/solve", json=SAMPLE_REQUEST)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("unsatisfiable", "timeout")
        assert data["error"]["code"] == "SOLVER_ERROR"


# ===========================================================================
# 入力の防御的検証（重複・値域チェック → 422）
# ===========================================================================


class TestDefensiveInputValidation:
    """schemas.py の防御的検証。

    フロントエンドは正しい値しか送らないが、API は単体でも公開されるため
    （/docs 参照）、不正入力は 422 で明示的に拒否する。範囲外の front_rows 等は
    ソルバをクラッシュさせないものの最適化を静かに歪めるため、黙って受理しない。
    """

    def test_duplicate_student_id_rejected(self):
        req = dict(SAMPLE_REQUEST)
        req["students"] = SAMPLE_REQUEST["students"][:-1] + [
            {**SAMPLE_REQUEST["students"][0]}  # 先頭の生徒と同じ id
        ]
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 422

    def test_duplicate_seat_id_rejected(self):
        req = dict(SAMPLE_REQUEST)
        seats = [dict(s) for s in SAMPLE_REQUEST["seats"]]
        seats[1]["id"] = seats[0]["id"]
        req["seats"] = seats
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 422

    def test_duplicate_seat_position_rejected(self):
        req = dict(SAMPLE_REQUEST)
        seats = [dict(s) for s in SAMPLE_REQUEST["seats"]]
        seats[1]["row"] = seats[0]["row"]
        seats[1]["col"] = seats[0]["col"]
        req["seats"] = seats
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 422

    def test_seat_row_exceeding_max_rejected(self):
        req = dict(SAMPLE_REQUEST)
        seats = [dict(s) for s in SAMPLE_REQUEST["seats"]]
        seats[0]["row"] = 999
        req["seats"] = seats
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 422

    def test_front_rows_out_of_range_rejected(self):
        req = dict(SAMPLE_REQUEST)
        req["classroom"] = {**SAMPLE_REQUEST["classroom"], "front_rows": [99]}
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 422

    def test_back_rows_zero_rejected(self):
        req = dict(SAMPLE_REQUEST)
        req["classroom"] = {**SAMPLE_REQUEST["classroom"], "back_rows": [0, 1]}
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 422

    def test_duplicate_front_rows_rejected(self):
        req = dict(SAMPLE_REQUEST)
        req["classroom"] = {**SAMPLE_REQUEST["classroom"], "front_rows": [1, 1]}
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 422

    def test_empty_front_rows_accepted(self):
        """front_rows=[] は「前側配慮エリアなし」の正当な設定（フロントは
        frontRowCount=0 のときこれを送る）。拒否しないことを保証する回帰テスト。"""
        req = dict(SAMPLE_REQUEST)
        req["classroom"] = {**SAMPLE_REQUEST["classroom"], "front_rows": []}
        resp = client.post("/api/v1/solve", json=req)
        assert resp.status_code == 200

    def test_validate_endpoint_rejects_duplicate_seats(self):
        """/api/v1/validate も同じ防御的検証を共有していることを確認。"""
        seats = [dict(s) for s in SAMPLE_REQUEST["seats"]]
        seats[1]["id"] = seats[0]["id"]
        resp = client.post(
            "/api/v1/validate",
            json={
                "students": SAMPLE_REQUEST["students"],
                "seats": seats,
                "constraints": {},
            },
        )
        assert resp.status_code == 422

    def test_score_endpoint_rejects_out_of_range_front_rows(self):
        """/api/v1/score も SeatConfig の値域検証を共有していることを確認。"""
        resp = client.post(
            "/api/v1/score",
            json={
                "assignments": [
                    {"student_id": s["id"], "seat_id": s["id"]}
                    for s in SAMPLE_REQUEST["students"]
                ],
                "students": SAMPLE_REQUEST["students"],
                "seats": SAMPLE_REQUEST["seats"],
                "classroom": {
                    **SAMPLE_REQUEST["classroom"],
                    "front_rows": [99],
                },
            },
        )
        assert resp.status_code == 422
