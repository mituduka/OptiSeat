"""
FastAPI アプリケーション

起動方法 (Dev Container 内):
  uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8000

APIドキュメント:
  http://localhost:8000/docs
"""

from __future__ import annotations

import asyncio
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

app = FastAPI(
    title="OptiSeat API",
    description="学校席替え最適化API（clingoベース）",
    version="1.0.0",
)

# CORS設定（フロントエンドとの通信用）
# Cookie 等の資格情報は使用しないため allow_credentials は付けない
# （CORS_ORIGINS にワイルドカードを設定された場合の安全側の既定）。
_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

# ソルバ同時実行制限（CPU バウンドなので並列数を制限して DoS を防止）
app.state.solve_semaphore = asyncio.Semaphore(2)

app.include_router(router)
