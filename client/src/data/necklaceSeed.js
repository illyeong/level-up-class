// 목걸이(necklace) 장비 시드 데이터
const BASE = '/images/Equipment/Necklaces';

const mk = (grade, file, name, stats) => ({
  name,
  type: 'necklace',
  grade,
  active: true,
  image: `${BASE}/${grade.charAt(0).toUpperCase() + grade.slice(1)}/${file}.png`,
  stats,
});

const S = {
  common:    { hp: 3,  defense: 2,  attack: 2,  crit: 0, attackSpeed: 0 },
  rare:      { hp: 6,  defense: 4,  attack: 4,  crit: 2, attackSpeed: 0 },
  epic:      { hp: 12, defense: 8,  attack: 8,  crit: 4, attackSpeed: 1 },
  legendary: { hp: 20, defense: 15, attack: 15, crit: 8, attackSpeed: 2 },
};

export const NECKLACE_SEED = [
  // ── Common ───────────────────────────────────────────────────
  mk('common','01', '철 목걸이',    S.common),
  mk('common','02', '청동 목걸이',  S.common),
  mk('common','03', '나무 목걸이',  S.common),
  mk('common','04', '가죽 목걸이',  S.common),
  mk('common','13', '뼈 목걸이',    S.common),

  // ── Rare ─────────────────────────────────────────────────────
  mk('rare','05', '은 목걸이',          S.rare),
  mk('rare','09', '루비 목걸이',        S.rare),
  mk('rare','11', '에메랄드 목걸이',    S.rare),
  mk('rare','12', '사파이어 목걸이',    S.rare),
  mk('rare','15', '수정 목걸이',        S.rare),
  mk('rare','19', '진주 목걸이',        S.rare),

  // ── Epic ─────────────────────────────────────────────────────
  mk('epic','06', '황금 목걸이',        S.epic),
  mk('epic','07', '용의 이빨 목걸이',   S.epic),
  mk('epic','08', '마법사의 목걸이',    S.epic),
  mk('epic','10', '암흑의 목걸이',      S.epic),
  mk('epic','14', '불꽃 목걸이',        S.epic),
  mk('epic','16', '성기사 목걸이',      S.epic),
  mk('epic','17', '마법 크리스탈 목걸이',S.epic),

  // ── Legendary ────────────────────────────────────────────────
  mk('legendary','18', '천상의 목걸이', S.legendary),
  mk('legendary','20', '신성한 목걸이', S.legendary),
  mk('legendary','21', '고대의 목걸이', S.legendary),
  mk('legendary','22', '영원의 목걸이', S.legendary),
  mk('legendary','23', '전설의 목걸이', S.legendary),
];
