// 반지(ring) 장비 시드 데이터
const BASE = '/images/Equipment/Rings';

const mk = (grade, file, name, stats) => ({
  name,
  type: 'ring',
  grade,
  active: true,
  image: `${BASE}/${grade.charAt(0).toUpperCase() + grade.slice(1)}/${file}.png`,
  stats,
});

const S = {
  common:    { hp: 2,  defense: 0, attack: 2,  crit: 3,  attackSpeed: 1 },
  rare:      { hp: 4,  defense: 0, attack: 4,  crit: 6,  attackSpeed: 2 },
  epic:      { hp: 8,  defense: 0, attack: 8,  crit: 10, attackSpeed: 3 },
  legendary: { hp: 15, defense: 0, attack: 12, crit: 18, attackSpeed: 5 },
};

export const RING_SEED = [
  // ── Common ───────────────────────────────────────────────────
  mk('common','TypeA', '철 반지',    S.common),
  mk('common','TypeB', '청동 반지',  S.common),
  mk('common','TypeC', '나무 반지',  S.common),
  mk('common','TypeF', '뼈 반지',    S.common),
  mk('common','TypeG', '돌 반지',    S.common),
  mk('common','TypeJ', '가죽 반지',  S.common),
  mk('common','TypeK', '구리 반지',  S.common),
  mk('common','TypeR', '수정 반지',  S.common),

  // ── Rare ─────────────────────────────────────────────────────
  mk('rare','TypeD', '은 반지',      S.rare),
  mk('rare','TypeE', '루비 반지',    S.rare),
  mk('rare','TypeM', '에메랄드 반지',S.rare),
  mk('rare','TypeN', '사파이어 반지',S.rare),
  mk('rare','TypeO', '진주 반지',    S.rare),
  mk('rare','TypeP', '황옥 반지',    S.rare),

  // ── Epic ─────────────────────────────────────────────────────
  mk('epic','TypeQ', '황금 반지',    S.epic),
  mk('epic','TypeS', '용 반지',      S.epic),
  mk('epic','TypeT', '마법 반지',    S.epic),
  mk('epic','TypeU', '암흑의 반지',  S.epic),

  // ── Legendary ────────────────────────────────────────────────
  mk('legendary','TypeL', '천상의 반지', S.legendary),
  mk('legendary','TypeV', '전설의 반지', S.legendary),
];
