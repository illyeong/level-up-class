// 귀걸이(earring) 장비 시드 데이터
const BASE = '/images/Equipment/Earrings';

const mk = (grade, file, name, stats) => ({
  name,
  type: 'earring',
  grade,
  active: true,
  image: `${BASE}/${grade.charAt(0).toUpperCase() + grade.slice(1)}/${file}.png`,
  stats,
});

const S = {
  common:    { hp: 4,  defense: 0, attack: 0, crit: 2,  attackSpeed: 1 },
  rare:      { hp: 8,  defense: 0, attack: 0, crit: 4,  attackSpeed: 2 },
  epic:      { hp: 14, defense: 0, attack: 2, crit: 8,  attackSpeed: 3 },
  legendary: { hp: 22, defense: 0, attack: 5, crit: 15, attackSpeed: 4 },
};

export const EARRING_SEED = [
  // ── Common ───────────────────────────────────────────────────
  mk('common','01', '철 귀걸이',    S.common),
  mk('common','02', '청동 귀걸이',  S.common),
  mk('common','07', '가죽 귀걸이',  S.common),
  mk('common','09', '뼈 귀걸이',    S.common),
  mk('common','14', '나무 귀걸이',  S.common),

  // ── Rare ─────────────────────────────────────────────────────
  mk('rare','03', '은 귀걸이',      S.rare),
  mk('rare','04', '루비 귀걸이',    S.rare),
  mk('rare','16', '에메랄드 귀걸이',S.rare),
  mk('rare','17', '사파이어 귀걸이',S.rare),

  // ── Epic ─────────────────────────────────────────────────────
  mk('epic','05', '황금 귀걸이',    S.epic),
  mk('epic','06', '마법사의 귀걸이',S.epic),
  mk('epic','08', '용 귀걸이',      S.epic),
  mk('epic','13', '암흑 귀걸이',    S.epic),

  // ── Legendary ────────────────────────────────────────────────
  mk('legendary','10', '천상의 귀걸이', S.legendary),
  mk('legendary','11', '신성한 귀걸이', S.legendary),
  mk('legendary','12', '고대의 귀걸이', S.legendary),
  mk('legendary','15', '전설의 귀걸이', S.legendary),
];
