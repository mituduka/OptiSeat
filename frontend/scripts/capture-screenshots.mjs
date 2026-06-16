/**
 * README 用スクリーンショットの自動撮影スクリプト
 *
 * サンプルデータ（src/lib/sampleData.ts）を localStorage にシードした状態で
 * 各画面を開き、実バックエンドで席替え計算まで実行して
 * .github/screenshots/ の PNG を上書きする。
 *
 * 実行方法（コンテナ内。docker compose up -d で起動済みであること）:
 *   docker exec optiseat-frontend-1 bash -c "cd /workspace/frontend && npx playwright install --with-deps chromium"  # 初回のみ
 *   docker exec optiseat-frontend-1 bash -c "cd /workspace/frontend && npm run screenshots"
 *
 * 環境変数:
 *   SCREENSHOT_BASE_URL  撮影対象のフロントエンド URL（既定: http://localhost:3000）
 *   SCREENSHOT_API_URL   バックエンド API の転送先（既定: http://backend:8000）
 *                        ブラウザは NEXT_PUBLIC_API_URL（localhost:8000）へ
 *                        リクエストするが、コンテナ内からは届かないため
 *                        Playwright の route でこの URL へプロキシする。
 *
 * WARNING: 座席配置はマルチシード探索のため毎回変わる（画像差分は毎回発生する）
 */

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

import {
  SAMPLE_STUDENTS,
  SAMPLE_SEAT_SETTINGS,
  SAMPLE_GROUPS,
  SAMPLE_FIXED,
  SAMPLE_FORBIDDEN,
  SAMPLE_SEAT_GENDER,
  SAMPLE_RELATIVE_FIXED,
  SAMPLE_LEADER_GROUPS,
  SAMPLE_CONSTRAINT_TOGGLES,
} from '../src/lib/sampleData.ts'

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3000'
const API_TARGET = process.env.SCREENSHOT_API_URL ?? 'http://backend:8000'
const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.github/screenshots',
)

// zustand persist（optiseat-store, version 1）の永続化形式に合わせたシード。
// 形式は src/lib/store.ts の partialize と一致させること。
const SEED_STATE = {
  students: SAMPLE_STUDENTS,
  seat: SAMPLE_SEAT_SETTINGS,
  groups: SAMPLE_GROUPS,
  fixedConstraints: SAMPLE_FIXED,
  forbiddenConstraints: SAMPLE_FORBIDDEN,
  seatGenderConstraints: SAMPLE_SEAT_GENDER,
  relativeFixedConstraints: SAMPLE_RELATIVE_FIXED,
  leaderGroups: SAMPLE_LEADER_GROUPS,
  prevAssign: [],
  adoptedAssignments: null,
  adjustingAssignments: null,
  finalizedAssignments: null,
  constraintToggles: SAMPLE_CONSTRAINT_TOGGLES,
}
const SEED_PAYLOAD = JSON.stringify({ state: SEED_STATE, version: 1 })

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
}

async function shoot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: file })
  console.log(`✔ ${name}.png`)
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 760 },
    deviceScaleFactor: 2,
    locale: 'ja-JP',
    reducedMotion: 'reduce',
  })

  // ブラウザが投げる API リクエストをバックエンドコンテナへプロキシする
  await context.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const response = await context.request.fetch(
      `${API_TARGET}${url.pathname}${url.search}`,
      {
        method: req.method(),
        headers: { 'Content-Type': 'application/json' },
        data: req.postData() ?? undefined,
      },
    )
    await route.fulfill({ response })
  })

  // 各 goto でサンプルデータを再シード（毎回クリーンな初期状態から撮影）
  await context.addInitScript((payload) => {
    localStorage.setItem('optiseat-store', payload)
  }, SEED_PAYLOAD)

  const page = await context.newPage()
  page.on('pageerror', (err) => console.error('pageerror:', err.message))

  // ① 名簿管理
  await page.goto(`${BASE_URL}/students`)
  await settle(page)
  await shoot(page, 'students')

  // ② 条件設定
  await page.goto(`${BASE_URL}/settings`)
  await settle(page)
  await shoot(page, 'settings')

  // ③ 実行 → 実バックエンドで計算し、結果が出た状態を撮影
  await page.goto(`${BASE_URL}/solve`)
  await settle(page)
  await page.getByRole('button', { name: '計算実行' }).click()
  const adoptButton = page
    .getByRole('button', { name: 'この配置を採用して次へ' })
    .first()
  await adoptButton.waitFor({ timeout: 120_000 })
  await settle(page)
  await shoot(page, 'solve')

  // ④ 配置調整（③から実際のフローで遷移し、採用直後の状態を撮影）
  await adoptButton.click()
  await page.waitForURL('**/finalize')
  await page.getByRole('button', { name: '配置確定' }).waitFor()
  await settle(page)
  await shoot(page, 'finalize')

  // ⑤ 結果・表示（配置確定して遷移）
  await page.getByRole('button', { name: '配置確定' }).click()
  await page.waitForURL('**/display')
  await page.getByRole('button', { name: 'PDFをダウンロード' }).waitFor()
  await settle(page)
  await shoot(page, 'display')

  // ⑥ データ管理モーダル（エクスポートタブ）
  await page.goto(`${BASE_URL}/students`)
  await settle(page)
  await page.getByRole('button', { name: 'データ管理' }).click()
  await page.getByRole('dialog').waitFor()
  await shoot(page, 'export')

  await browser.close()
  console.log(`完了: ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
