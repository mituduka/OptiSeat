// 制約名・ラベルの一元管理
// 全ての制約名・説明はこのファイルから取得する

import type { ConstraintMeta } from '@/types'

// --- 制約マスター定義 ---

export const CONSTRAINT_DEFS = {
  // ハード制約
  fixed: {
    label: '座席固定',
    short: '固定',
    badge: '固定',
    violationLabel: '座席固定違反',
    constraintDescription: '特定の座席に固定する制約',
    violationDescription: '固定制約を違反した件数（手動変更で発生しうる）',
    settingDescription: '特定の座席に固定します',
  },
  forbidden_adjacent8: {
    label: '隣接禁止（周囲8席）',
    short: '隣接禁止',
    badge: '隣接禁止',
    violationLabel: '隣接禁止違反',
    constraintDescription: '指定ペアを隣接させない制約',
    violationDescription: '隣接禁止制約に違反した件数（手動変更で発生しうる）',
    settingDescription: '指定ペアを隣接させないように配置します（周囲8席）',
  },
  forbidden_same_group: {
    label: '同班割り当て禁止',
    short: '同班禁止',
    badge: '同班禁止',
    violationLabel: '同班禁止違反',
    constraintDescription: '指定ペアを隣接させない制約',
    violationDescription: '同班禁止制約に違反した件数（手動変更で発生しうる）',
    settingDescription: '指定ペアが同じ班にならないように配置します',
  },
  relative_fixed: {
    label: '隣接固定',
    short: '隣接固定',
    badge: '隣接固定',
    violationLabel: '隣接固定違反',
    constraintDescription: '指定ペアを隣接して配置する制約',
    violationDescription: '隣接固定制約に違反した件数（手動変更で発生しうる）',
    settingDescription: '指定ペアを隣接する位置に配置します',
  },
  gender_constraint: {
    label: '性別配置制約',
    short: '性別制約',
    badge: '性別制約',
    violationLabel: '性別制約違反',
    constraintDescription: '座席ごとに配置できる性別を指定する制約',
    violationDescription: '性別配置制約に違反した件数（手動変更で発生しうる）',
    settingDescription: '座席ごとに配置できる性別を制限します。指定なしは男女どちらでも可です。',
  },
  // ソフト制約
  front_preferred: {
    label: '前側配慮',
    short: '前側配慮',
    badge: '前側配慮',
    violationLabel: '前側配慮違反',
    constraintDescription: '前側配慮の設定がある人を前側エリアに配置する制約',
    violationDescription: '前側配慮が満たされていない件数',
    settingDescription: '前側配慮の設定がある人を前側エリアに配置します',
  },
  back_preferred: {
    label: '後側配慮',
    short: '後側配慮',
    badge: '後側配慮',
    violationLabel: '後側配慮違反',
    constraintDescription: '後側配慮の設定がある人を後側エリアに配置する制約',
    violationDescription: '後側配慮が満たされていない件数',
    settingDescription: '後側配慮の設定がある人を後側エリアに配置します',
  },
  group_gender_imbalance: {
    label: '班内男女バランス',
    short: '班内男女偏り',
    badge: '班男女',
    violationLabel: '班内男女偏り',
    constraintDescription: '班内に男女を最低1人ずつ配置する制約',
    violationDescription: '班内に男女を最低1人ずつ配置されていない件数',
    settingDescription: '班内に男女を最低1人ずつ配置します',
  },
  loneliness: {
    label: '近隣同性バランス',
    short: '近隣同性偏り',
    badge: '近隣同性',
    violationLabel: '近隣同性なし',
    constraintDescription: '横隣や同班に同性を最低1人配置する制約',
    violationDescription: '横隣や同班に同性がいない件数',
    settingDescription: '横隣や同班に同性を最低1人配置します',
  },
  prev_assign_same: {
    label: '前回と異なる座席',
    short: '前回同席',
    badge: '前回席',
    violationLabel: '前回同席',
    constraintDescription: '前回と同じ座席への配置を避ける制約',
    violationDescription: '前回と同じ座席に配置された件数',
    settingDescription: '前回と同じ席への配置を避けます',
  },
  prev_neighbor_same: {
    label: '前回と左右の隣を変える',
    short: '前回左右一致',
    badge: '前回隣',
    violationLabel: '前回左右一致',
    constraintDescription: '前回と同じ横隣を避ける制約',
    violationDescription: '前回横隣だったペアが今回も横隣になっている件数',
    settingDescription: '横隣が前回と同じ配置を避けます',
  },
  prev_group_same: {
    label: '前回と異なる班メンバー',
    short: '前回同班',
    badge: '前回班',
    violationLabel: '前回同班構成',
    constraintDescription: '前回と同じ班メンバーを避ける制約',
    violationDescription: '前回と同じメンバー構成になっている班の件数',
    settingDescription: '前回と同じメンバー構成の班を避けます',
  },
  leader_group: {
    label: '班分散グループ',
    short: '班分散G',
    badge: '班分散G',
    violationLabel: '班分散グループ違反',
    constraintDescription: 'グループ内のメンバーを別々の班に配置する制約',
    violationDescription: '班分散グループ内メンバーが同じ班に配置された件数（手動変更で発生しうる）',
    settingDescription: 'グループ内のメンバーが同じ班にならないよう配置します',
  },
} as const

// --- 禁止制約のタイプラベル（ForbiddenConstraint.type → ラベル）---

export const FORBID_TYPE_LABELS: Record<string, string> = {
  adjacent8: CONSTRAINT_DEFS.forbidden_adjacent8.label,
  same_group: CONSTRAINT_DEFS.forbidden_same_group.label,
}

export const FORBID_VIOLATION_LABELS: Record<string, string> = {
  adjacent8: CONSTRAINT_DEFS.forbidden_adjacent8.violationLabel,
  same_group: CONSTRAINT_DEFS.forbidden_same_group.violationLabel,
}

// --- 矛盾ラベル（CONSTRAINT_DEFS から導出）---

export const CONFLICT_LABELS = {
  GENDER_FIXED: `${CONSTRAINT_DEFS.gender_constraint.short}と${CONSTRAINT_DEFS.fixed.short}の矛盾`,
  RF_FB: `${CONSTRAINT_DEFS.relative_fixed.short}と${CONSTRAINT_DEFS.forbidden_adjacent8.short}の矛盾`,
  FIXED_SEAT: `${CONSTRAINT_DEFS.fixed.label}の重複`,
  FIXED_FORBIDDEN: `${CONSTRAINT_DEFS.forbidden_adjacent8.short}と${CONSTRAINT_DEFS.fixed.short}の矛盾`,
  FIXED_RELATIVE: `${CONSTRAINT_DEFS.relative_fixed.short}条件の不一致`,
  FIXED_SAME_GROUP: `${CONSTRAINT_DEFS.forbidden_same_group.short}と${CONSTRAINT_DEFS.fixed.short}の矛盾`,
} as const

// --- 制約メタデータ（違反テーブル表示用）---

export const CONSTRAINT_META: ConstraintMeta[] = [
  // ソフト制約（priorityLevel 降順）
  { key: 'front_preferred_violation', label: CONSTRAINT_DEFS.front_preferred.violationLabel, description: CONSTRAINT_DEFS.front_preferred.violationDescription, weight: 3, priorityLevel: 5 },
  { key: 'back_preferred_violation', label: CONSTRAINT_DEFS.back_preferred.violationLabel, description: CONSTRAINT_DEFS.back_preferred.violationDescription, weight: 3, priorityLevel: 5 },
  { key: 'group_gender_imbalance', label: CONSTRAINT_DEFS.group_gender_imbalance.violationLabel, description: CONSTRAINT_DEFS.group_gender_imbalance.violationDescription, weight: 2, priorityLevel: 4 },
  { key: 'loneliness_violation', label: CONSTRAINT_DEFS.loneliness.violationLabel, description: CONSTRAINT_DEFS.loneliness.violationDescription, weight: 2, priorityLevel: 4 },
  { key: 'prev_neighbor_same', label: CONSTRAINT_DEFS.prev_neighbor_same.violationLabel, description: CONSTRAINT_DEFS.prev_neighbor_same.violationDescription, weight: 1, priorityLevel: 3 },
  { key: 'prev_group_same', label: CONSTRAINT_DEFS.prev_group_same.violationLabel, description: CONSTRAINT_DEFS.prev_group_same.violationDescription, weight: 1, priorityLevel: 2 },
  { key: 'prev_assign_same', label: CONSTRAINT_DEFS.prev_assign_same.violationLabel, description: CONSTRAINT_DEFS.prev_assign_same.violationDescription, weight: 1, priorityLevel: 1 },
  // ハード制約違反（手動変更で発生しうる）
  { key: 'fixed_violation', label: CONSTRAINT_DEFS.fixed.violationLabel, description: CONSTRAINT_DEFS.fixed.violationDescription, weight: null, priorityLevel: null },
  { key: 'gender_constraint_violation', label: CONSTRAINT_DEFS.gender_constraint.violationLabel, description: CONSTRAINT_DEFS.gender_constraint.violationDescription, weight: null, priorityLevel: null },
  { key: 'relative_fixed_violation', label: CONSTRAINT_DEFS.relative_fixed.violationLabel, description: CONSTRAINT_DEFS.relative_fixed.violationDescription, weight: null, priorityLevel: null },
  { key: 'forbidden_violation', label: CONSTRAINT_DEFS.forbidden_adjacent8.violationLabel, description: CONSTRAINT_DEFS.forbidden_adjacent8.violationDescription, weight: null, priorityLevel: null },
  { key: 'leader_group_violation', label: CONSTRAINT_DEFS.leader_group.violationLabel, description: CONSTRAINT_DEFS.leader_group.violationDescription, weight: null, priorityLevel: null },
]

// --- セル内違反テキスト生成ヘルパー ---

export const violationText = {
  fixedMismatch: (specRow: number, specCol: number, curRow: number, curCol: number) =>
    `${CONSTRAINT_DEFS.fixed.violationLabel}: ${specRow}行${specCol}列指定 → 現在${curRow}行${curCol}列`,
  frontPreferred: () => CONSTRAINT_DEFS.front_preferred.violationLabel,
  backPreferred: () => CONSTRAINT_DEFS.back_preferred.violationLabel,
  forbiddenViolation: (type: string, nameA: string, nameB: string) =>
    `${FORBID_VIOLATION_LABELS[type] ?? CONSTRAINT_DEFS.forbidden_adjacent8.violationLabel}: ${nameA} ↔ ${nameB}`,
  lonelinessViolation: () => CONSTRAINT_DEFS.loneliness.violationLabel,
  groupGenderImbalance: (groupId: number) => `${CONSTRAINT_DEFS.group_gender_imbalance.violationLabel}: 班${groupId}`,
  prevSameSeat: () => CONSTRAINT_DEFS.prev_assign_same.violationLabel,
  genderConstraintViolation: (gender: 'male' | 'female') =>
    `${CONSTRAINT_DEFS.gender_constraint.violationLabel}: この席は${gender === 'male' ? '男性' : '女性'}のみ`,
  relativeFixedOutOfRange: (name: string) =>
    `${CONSTRAINT_DEFS.relative_fixed.violationLabel}: ${name}の配置先が範囲外`,
  relativeFixedMissing: (name: string) =>
    `${CONSTRAINT_DEFS.relative_fixed.violationLabel}: ${name}が指定位置にいません`,
  prevNeighborSame: (name: string) => `${CONSTRAINT_DEFS.prev_neighbor_same.violationLabel}: ${name}`,
  prevGroupSame: (groupId: number) => `${CONSTRAINT_DEFS.prev_group_same.violationLabel}: 班${groupId}`,
  leaderGroupViolation: (groupName: string, otherName: string) =>
    `${CONSTRAINT_DEFS.leader_group.violationLabel}: 「${groupName}」の${otherName}と同班`,
}
