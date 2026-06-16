import type {
  Student,
  SeatSettings,
  Group,
  FixedConstraint,
  ForbiddenConstraint,
  SeatGenderConstraint,
  RelativeFixedConstraint,
  LeaderGroup,
  ConstraintToggles,
} from '@/types'

export const SAMPLE_STUDENTS: Student[] = [
  { id: 27, name: '池田 結菜',   gender: 'female', tags: [] },
  { id: 5,  name: '井沢 陽翔',   gender: 'male',   tags: [] },
  { id: 20, name: '伊藤 莉奈',   gender: 'female', tags: [] },
  { id: 29, name: '井上 詩織',   gender: 'female', tags: [] },
  { id: 14, name: '井本 拓海',   gender: 'male',   tags: [] },
  { id: 10, name: '加藤 湊',     gender: 'male',   tags: ['front_preferred'] },
  { id: 30, name: '木村 澪',     gender: 'female', tags: [] },
  { id: 9,  name: '小林 律',     gender: 'male',   tags: [] },
  { id: 24, name: '小林 結愛',   gender: 'female', tags: [] },
  { id: 1,  name: '佐藤 健太',   gender: 'male',   tags: [] },
  { id: 25, name: '齋藤 澪',     gender: 'female', tags: [] },
  { id: 8,  name: '佐々木 翔太', gender: 'male',   tags: [] },
  { id: 16, name: '佐藤 咲良',   gender: 'female', tags: [] },
  { id: 18, name: '鈴木 美咲',   gender: 'female', tags: [] },
  { id: 3,  name: '鈴木 悠真',   gender: 'male',   tags: [] },
  { id: 19, name: '高田 葵',     gender: 'female', tags: [] },
  { id: 4,  name: '高橋 蓮',     gender: 'male',   tags: [] },
  { id: 17, name: '田中 結衣',   gender: 'female', tags: [] },
  { id: 23, name: '中村 咲良',   gender: 'female', tags: ['front_preferred'] },
  { id: 12, name: '林 晴人',     gender: 'male',   tags: [] },
  { id: 13, name: '松本 葵',     gender: 'male',   tags: ['front_preferred'] },
  { id: 28, name: '松本 杏奈',   gender: 'female', tags: [] },
  { id: 2,  name: '村上 翼',     gender: 'male',   tags: [] },
  { id: 15, name: '山崎 拓也',   gender: 'male',   tags: [] },
  { id: 22, name: '山本 芽衣',   gender: 'female', tags: [] },
  { id: 7,  name: '山本 陸',     gender: 'male',   tags: [] },
  { id: 26, name: '芳田 陽菜',   gender: 'female', tags: ['front_preferred'] },
  { id: 11, name: '吉田 大和',   gender: 'male',   tags: [] },
  { id: 21, name: '渡辺 詩織',   gender: 'female', tags: [] },
  { id: 6,  name: '渡邊 隼人',   gender: 'male',   tags: ['back_preferred'] },
]

export const SAMPLE_SEAT_SETTINGS: SeatSettings = {
  numRows: 5,
  numCols: 6,
  frontRowCount: 1,
  backRowCount: 1,
  emptySeats: [],
  numGroups: 6,
}

export const SAMPLE_GROUPS: Group[] = [
  {
    groupId: 1,
    seatCoords: [
      { row: 1, col: 1 }, { row: 1, col: 2 },
      { row: 2, col: 1 }, { row: 2, col: 2 },
      { row: 3, col: 1 },
    ],
  },
  {
    groupId: 2,
    seatCoords: [
      { row: 3, col: 2 },
      { row: 4, col: 1 }, { row: 4, col: 2 },
      { row: 5, col: 1 }, { row: 5, col: 2 },
    ],
  },
  {
    groupId: 3,
    seatCoords: [
      { row: 1, col: 3 }, { row: 1, col: 4 },
      { row: 2, col: 3 }, { row: 2, col: 4 },
      { row: 3, col: 3 },
    ],
  },
  {
    groupId: 4,
    seatCoords: [
      { row: 3, col: 4 },
      { row: 4, col: 3 }, { row: 4, col: 4 },
      { row: 5, col: 3 }, { row: 5, col: 4 },
    ],
  },
  {
    groupId: 5,
    seatCoords: [
      { row: 1, col: 5 }, { row: 1, col: 6 },
      { row: 2, col: 5 }, { row: 2, col: 6 },
      { row: 3, col: 5 },
    ],
  },
  {
    groupId: 6,
    seatCoords: [
      { row: 4, col: 5 }, { row: 4, col: 6 },
      { row: 5, col: 5 }, { row: 5, col: 6 },
      { row: 3, col: 6 },
    ],
  },
]

export const SAMPLE_FIXED: FixedConstraint[] = [
  { studentId: 7, row: 1, col: 6 },
]

export const SAMPLE_FORBIDDEN: ForbiddenConstraint[] = [
  { studentIdA: 8, studentIdB: 15, type: 'adjacent8' },
  { studentIdA: 8, studentIdB: 14, type: 'adjacent8' },
  { studentIdA: 8, studentIdB: 20, type: 'adjacent8' },
  { studentIdA: 8, studentIdB: 15, type: 'same_group' },
  { studentIdA: 8, studentIdB: 14, type: 'same_group' },
  { studentIdA: 8, studentIdB: 20, type: 'same_group' },
]

export const SAMPLE_SEAT_GENDER: SeatGenderConstraint[] = [
  { row: 1, col: 1, allowedGender: 'female' },
  { row: 2, col: 2, allowedGender: 'female' },
  { row: 3, col: 1, allowedGender: 'female' },
  { row: 4, col: 2, allowedGender: 'female' },
  { row: 1, col: 3, allowedGender: 'female' },
  { row: 2, col: 4, allowedGender: 'female' },
  { row: 3, col: 3, allowedGender: 'female' },
  { row: 4, col: 4, allowedGender: 'female' },
  { row: 1, col: 5, allowedGender: 'female' },
  { row: 2, col: 6, allowedGender: 'female' },
  { row: 3, col: 5, allowedGender: 'female' },
  { row: 4, col: 6, allowedGender: 'female' },
  { row: 1, col: 2, allowedGender: 'male' },
  { row: 2, col: 1, allowedGender: 'male' },
  { row: 3, col: 2, allowedGender: 'male' },
  { row: 4, col: 1, allowedGender: 'male' },
  { row: 1, col: 4, allowedGender: 'male' },
  { row: 2, col: 3, allowedGender: 'male' },
  { row: 3, col: 4, allowedGender: 'male' },
  { row: 4, col: 3, allowedGender: 'male' },
  { row: 1, col: 6, allowedGender: 'male' },
  { row: 2, col: 5, allowedGender: 'male' },
  { row: 3, col: 6, allowedGender: 'male' },
  { row: 4, col: 5, allowedGender: 'male' },
]

export const SAMPLE_RELATIVE_FIXED: RelativeFixedConstraint[] = [
  { studentIdA: 8, studentIdB: 12, dRow:  0, dCol: 1 },
  { studentIdA: 8, studentIdB: 11, dRow: -1, dCol: 0 },
]

export const SAMPLE_LEADER_GROUPS: LeaderGroup[] = [
  {
    id: '_r_0_-1778244752945',
    name: '班長',
    studentIds: [27, 26, 21, 18, 24, 16],
    showLabel: true,
  },
  {
    id: '_R_15esnflb_-1778257662202',
    name: '消極的',
    studentIds: [4, 17, 28, 15, 7],
    showLabel: false,
  },
]

export const SAMPLE_CONSTRAINT_TOGGLES: ConstraintToggles = {
  gender_balance:  false,
  loneliness:      false,
  differ_seat:     false,
  differ_neighbor: false,
  differ_group:    false,
}
