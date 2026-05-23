// ── 등급 ─────────────────────────────────────────────────────
export const GRADE = {
  common:    { label: '일반', bg: 'bg-slate-100',   border: 'border-slate-300',  badge: 'bg-slate-400 text-white',                        glow: '' },
  rare:      { label: '희귀', bg: 'bg-emerald-50',  border: 'border-emerald-400', badge: 'bg-emerald-500 text-white',                      glow: 'shadow-emerald-200' },
  epic:      { label: '영웅', bg: 'bg-violet-50',   border: 'border-violet-500',  badge: 'bg-violet-600 text-white',                       glow: 'shadow-violet-200' },
  legendary: { label: '전설', bg: 'bg-amber-50',    border: 'border-amber-500',   badge: 'bg-gradient-to-r from-amber-400 to-orange-500 text-white', glow: 'shadow-amber-200' },
};

// ── 장비 슬롯 ─────────────────────────────────────────────────
export const SLOTS = [
  { key: 'weapon',    icon: '⚔️',  label: '무기',    stat: 'attack' },
  { key: 'armor',     icon: '🛡️',  label: '방어구',  stat: 'defense' },
  { key: 'helmet',    icon: '⛑️',  label: '투구',    stat: 'hp' },
  { key: 'ring',      icon: '💍',  label: '반지',    stat: 'crit' },
  { key: 'necklace',  icon: '📿',  label: '목걸이',  stat: 'hp' },
  { key: 'accessory', icon: '✨',  label: '액세서리', stat: 'attackSpeed' },
];

// ── 강화 설정 ─────────────────────────────────────────────────
export const ENHANCE = [
  { from: 0, to: 1, rate: 1.00, stones:  2 },
  { from: 1, to: 2, rate: 0.65, stones:  5 },
  { from: 2, to: 3, rate: 0.45, stones: 10 },
  { from: 3, to: 4, rate: 0.25, stones: 18 },
  { from: 4, to: 5, rate: 0.10, stones: 30 },
];
export const PITY_LIMIT = 15; // ★4→★5 연속 실패 이 횟수 초과 시 100% 확정

// ── 상자 설정 ─────────────────────────────────────────────────
export const CHESTS = [
  {
    id: 'wood',    name: '나무 상자',    cost:   50,
    image:     '/images/Chests/chest_wood.png',
    openImage: '/images/Chests/chest_wood_open.png',
    rates: { legendary: 1, epic:  4, rare: 20, common: 75 },
  },
  {
    id: 'luck',    name: '행운 상자',    cost:  100,
    image:     '/images/Chests/chest_luck.png',
    openImage: '/images/Chests/chest_luck_open.png',
    rates: { legendary: 2, epic:  8, rare: 30, common: 60 },
  },
  {
    id: 'silver',  name: '실버 상자',   cost:  200,
    image:     '/images/Chests/chest_silver.png',
    openImage: '/images/Chests/chest_silver_open.png',
    rates: { legendary: 4, epic: 12, rare: 36, common: 48 },
  },
  {
    id: 'gold',    name: '골드 상자',   cost:  400,
    image:     '/images/Chests/chest_gold.png',
    openImage: '/images/Chests/chest_gold_open.png',
    rates: { legendary: 8, epic: 20, rare: 40, common: 32 },
  },
  {
    id: 'premium', name: '프리미엄 상자', cost:  800,
    image:     '/images/Chests/chest_premium.png',
    openImage: '/images/Chests/chest_premium_open.png',
    rates: { legendary: 12, epic: 28, rare: 40, common: 20 },
  },
  {
    id: 'special', name: '스페셜 상자',  cost: 1500,
    image:     '/images/Chests/chest_special.png',
    openImage: '/images/Chests/chest_special_open.png',
    rates: { legendary: 20, epic: 35, rare: 30, common: 15 },
  },
];

// ── 스탯 이름 ─────────────────────────────────────────────────
export const STAT_LABEL = {
  attack:      { label: '공격력',  icon: '⚔️' },
  defense:     { label: '방어력',  icon: '🛡️' },
  hp:          { label: '체력',    icon: '❤️' },
  crit:        { label: '크리티컬', icon: '💥' },
  attackSpeed: { label: '공격속도', icon: '💨' },
};
