export const DEFAULT_OWNED_COSMETICS = {
  frames: ['basic'],
  backgrounds: ['basic'],
};

export const DEFAULT_EQUIPPED_COSMETICS = {
  frame: 'basic',
  background: 'basic',
};

export const HALL_OF_FAME_FRAME_ID = 'hall_of_fame';

export const HALL_OF_FAME_CATEGORY_LABELS = {
  level: '레벨',
  gold: '골드',
  diamond: '다이아',
  arena: '투기장',
  enhance: '강화',
};

export const PROFILE_FRAMES = [
  {
    id: 'basic',
    type: 'frames',
    name: '기본 프레임',
    description: '깔끔한 기본 테두리입니다.',
    costType: 'free',
    cost: 0,
    rarity: '기본',
    style: {
      border: '2px solid rgba(129, 140, 248, 0.55)',
      boxShadow: 'inset 0 0 28px rgba(99, 102, 241, 0.12)',
    },
  },
  {
    id: 'forest',
    type: 'frames',
    name: '숲의 프레임',
    description: '초록빛이 감도는 생기 있는 테두리입니다.',
    costType: 'gold',
    cost: 800,
    rarity: '일반',
    style: {
      border: '3px solid #22c55e',
      boxShadow: '0 0 0 6px rgba(34, 197, 94, 0.12), inset 0 0 24px rgba(34, 197, 94, 0.18)',
    },
  },
  {
    id: 'royal_gold',
    type: 'frames',
    name: '황금 프레임',
    description: '랭커 느낌을 주는 금빛 테두리입니다.',
    costType: 'gold',
    cost: 1800,
    rarity: '희귀',
    style: {
      border: '3px solid #f59e0b',
      boxShadow: '0 0 24px rgba(245, 158, 11, 0.38), inset 0 0 26px rgba(251, 191, 36, 0.18)',
    },
  },
  {
    id: 'arcane',
    type: 'frames',
    name: '마법 프레임',
    description: '보랏빛 오라가 감도는 특별한 테두리입니다.',
    costType: 'diamond',
    cost: 35,
    rarity: '영웅',
    style: {
      border: '3px solid #8b5cf6',
      boxShadow: '0 0 28px rgba(139, 92, 246, 0.48), inset 0 0 30px rgba(168, 85, 247, 0.18)',
    },
  },
  {
    id: 'cherry',
    type: 'frames',
    name: '벚꽃 프레임',
    description: '분홍빛 벚꽃이 수놓인 달콤한 테두리입니다.',
    costType: 'gold',
    cost: 1200,
    rarity: '일반',
    style: {
      border: '3px solid #f9a8d4',
      boxShadow: '0 0 20px rgba(249,168,212,0.55), inset 0 0 24px rgba(244,114,182,0.15)',
    },
  },
  {
    id: 'ocean',
    type: 'frames',
    name: '바다 프레임',
    description: '시원한 바다빛이 감도는 청량한 테두리입니다.',
    costType: 'gold',
    cost: 1500,
    rarity: '희귀',
    style: {
      border: '3px solid #38bdf8',
      boxShadow: '0 0 24px rgba(56,189,248,0.5), inset 0 0 28px rgba(14,165,233,0.18)',
    },
  },
  {
    id: 'fire',
    type: 'frames',
    name: '화염 프레임',
    description: '뜨거운 불꽃이 타오르는 강렬한 테두리입니다.',
    costType: 'gold',
    cost: 2200,
    rarity: '희귀',
    style: {
      border: '3px solid #f97316',
      boxShadow: '0 0 28px rgba(249,115,22,0.6), 0 0 55px rgba(239,68,68,0.22), inset 0 0 30px rgba(251,146,60,0.18)',
    },
  },
  {
    id: 'rainbow',
    type: 'frames',
    name: '무지개 프레임',
    description: '화려한 무지개빛이 넘실대는 전설의 테두리입니다.',
    costType: 'diamond',
    cost: 80,
    rarity: '전설',
    style: {
      border: '3px solid #a855f7',
      boxShadow: '0 0 0 2px #f97316, 0 0 0 4px #facc15, 0 0 30px rgba(168,85,247,0.6), inset 0 0 28px rgba(255,255,255,0.1)',
    },
  },
  {
    id: 'ice',
    type: 'frames',
    name: '얼음 프레임',
    description: '투명한 얼음 결정이 빛나는 청순한 테두리입니다.',
    costType: 'diamond',
    cost: 50,
    rarity: '영웅',
    style: {
      border: '3px solid #bae6fd',
      boxShadow: '0 0 26px rgba(186,230,253,0.7), inset 0 0 30px rgba(224,242,254,0.25)',
    },
  },
  {
    id: HALL_OF_FAME_FRAME_ID,
    type: 'frames',
    name: '명예의 전당 프레임',
    description: '오전 8시 기준 명예의 전당 1위에게 자동 부여됩니다.',
    costType: 'reward',
    cost: 0,
    rarity: '명예',
    hidden: true,
    style: {
      border: '5px solid #facc15',
      outline: '2px solid rgba(255, 255, 255, 0.95)',
      outlineOffset: '-8px',
      boxShadow: '0 0 0 5px rgba(250, 204, 21, 0.28), 0 0 22px rgba(250, 204, 21, 0.95), 0 0 54px rgba(249, 115, 22, 0.55), inset 0 0 30px rgba(255, 255, 255, 0.42), inset 0 0 42px rgba(251, 191, 36, 0.34)',
      animation: 'hallFramePulse 1.8s ease-in-out infinite',
    },
  },
];

export const PROFILE_BACKGROUNDS = [
  {
    id: 'basic',
    type: 'backgrounds',
    name: '기본 배경',
    description: '밝고 부드러운 기본 프로필 배경입니다.',
    costType: 'free',
    cost: 0,
    rarity: '기본',
    style: {
      background: 'radial-gradient(circle at 50% 40%, rgba(199, 210, 254, 0.9), transparent 42%), linear-gradient(135deg, #eef2ff 0%, #e0f2fe 100%)',
    },
    floorStyle: {
      background: 'radial-gradient(ellipse, rgba(51, 65, 85, 0.24), rgba(51, 65, 85, 0.02) 68%)',
    },
  },
  {
    id: 'meadow',
    type: 'backgrounds',
    name: '초록 들판',
    description: '캐릭터 뒤에 은은한 들판 분위기를 더합니다.',
    costType: 'gold',
    cost: 700,
    rarity: '일반',
    style: {
      background: 'radial-gradient(circle at 28% 24%, rgba(187, 247, 208, 0.85), transparent 30%), radial-gradient(circle at 72% 28%, rgba(134, 239, 172, 0.6), transparent 34%), linear-gradient(160deg, #ecfdf5 0%, #bbf7d0 100%)',
    },
    floorStyle: {
      background: 'radial-gradient(ellipse, rgba(22, 101, 52, 0.28), rgba(22, 101, 52, 0.02) 70%)',
    },
  },
  {
    id: 'sunset',
    type: 'backgrounds',
    name: '노을빛 배경',
    description: '따뜻한 노을빛으로 캐릭터를 강조합니다.',
    costType: 'gold',
    cost: 1400,
    rarity: '희귀',
    style: {
      background: 'radial-gradient(circle at 50% 22%, rgba(253, 224, 71, 0.62), transparent 30%), linear-gradient(145deg, #fff7ed 0%, #fed7aa 42%, #f9a8d4 100%)',
    },
    floorStyle: {
      background: 'radial-gradient(ellipse, rgba(154, 52, 18, 0.26), rgba(154, 52, 18, 0.02) 70%)',
    },
  },
  {
    id: 'night_aura',
    type: 'backgrounds',
    name: '별빛 오라',
    description: '어두운 배경에 별빛이 도는 프리미엄 배경입니다.',
    costType: 'diamond',
    cost: 200,
    rarity: '영웅',
    style: {
      background: 'radial-gradient(circle at 30% 26%, rgba(96, 165, 250, 0.5), transparent 24%), radial-gradient(circle at 70% 22%, rgba(216, 180, 254, 0.48), transparent 26%), linear-gradient(145deg, #0f172a 0%, #312e81 100%)',
    },
    floorStyle: {
      background: 'radial-gradient(ellipse, rgba(191, 219, 254, 0.36), rgba(191, 219, 254, 0.02) 72%)',
    },
    dark: true,
  },
  {
    id: 'cherry_blossom',
    type: 'backgrounds',
    name: '벚꽃 배경',
    description: '봄날 벚꽃이 흩날리는 화사한 배경입니다.',
    costType: 'gold',
    cost: 900,
    rarity: '일반',
    style: {
      background: 'radial-gradient(circle at 30% 25%, rgba(249,168,212,0.7), transparent 28%), radial-gradient(circle at 72% 20%, rgba(244,114,182,0.5), transparent 32%), linear-gradient(145deg, #fff0f6 0%, #fce7f3 55%, #fbcfe8 100%)',
    },
    floorStyle: {
      background: 'radial-gradient(ellipse, rgba(244,114,182,0.3), rgba(244,114,182,0.02) 70%)',
    },
  },
  {
    id: 'winter',
    type: 'backgrounds',
    name: '겨울 배경',
    description: '눈처럼 맑고 고요한 겨울 배경입니다.',
    costType: 'gold',
    cost: 1600,
    rarity: '희귀',
    style: {
      background: 'radial-gradient(circle at 40% 22%, rgba(186,230,253,0.8), transparent 30%), radial-gradient(circle at 68% 28%, rgba(224,242,254,0.9), transparent 35%), linear-gradient(155deg, #f0f9ff 0%, #e0f2fe 50%, #bfdbfe 100%)',
    },
    floorStyle: {
      background: 'radial-gradient(ellipse, rgba(125,211,252,0.3), rgba(125,211,252,0.02) 70%)',
    },
  },
  {
    id: 'deep_ocean',
    type: 'backgrounds',
    name: '심해 배경',
    description: '깊고 신비로운 바다 속 배경입니다.',
    costType: 'gold',
    cost: 2500,
    rarity: '희귀',
    style: {
      background: 'radial-gradient(circle at 35% 25%, rgba(56,189,248,0.5), transparent 26%), radial-gradient(circle at 65% 20%, rgba(14,165,233,0.4), transparent 32%), linear-gradient(155deg, #0c4a6e 0%, #075985 45%, #0369a1 100%)',
    },
    floorStyle: {
      background: 'radial-gradient(ellipse, rgba(56,189,248,0.38), rgba(56,189,248,0.02) 72%)',
    },
    dark: true,
  },
  {
    id: 'galaxy',
    type: 'backgrounds',
    name: '은하 배경',
    description: '별이 가득한 신비로운 우주 배경입니다.',
    costType: 'diamond',
    cost: 120,
    rarity: '전설',
    style: {
      background: 'radial-gradient(circle at 25% 20%, rgba(167,139,250,0.6), transparent 22%), radial-gradient(circle at 75% 30%, rgba(251,191,36,0.35), transparent 18%), radial-gradient(circle at 50% 60%, rgba(99,102,241,0.3), transparent 25%), linear-gradient(145deg, #020617 0%, #1e1b4b 50%, #0c0a1a 100%)',
    },
    floorStyle: {
      background: 'radial-gradient(ellipse, rgba(167,139,250,0.4), rgba(167,139,250,0.02) 72%)',
    },
    dark: true,
  },
  {
    id: 'volcanic',
    type: 'backgrounds',
    name: '화산 배경',
    description: '용암이 흐르는 강렬한 화산 배경입니다.',
    costType: 'diamond',
    cost: 60,
    rarity: '영웅',
    style: {
      background: 'radial-gradient(circle at 50% 15%, rgba(251,191,36,0.65), transparent 20%), radial-gradient(circle at 30% 35%, rgba(249,115,22,0.6), transparent 28%), radial-gradient(circle at 70% 28%, rgba(239,68,68,0.5), transparent 30%), linear-gradient(160deg, #431407 0%, #7c2d12 45%, #9a3412 100%)',
    },
    floorStyle: {
      background: 'radial-gradient(ellipse, rgba(249,115,22,0.4), rgba(249,115,22,0.02) 70%)',
    },
    dark: true,
  },
];

export const COSMETIC_SECTIONS = [
  { key: 'frames', title: '프로필 프레임', description: '캐릭터 카드 테두리를 꾸밉니다.', items: PROFILE_FRAMES.filter(item => !item.hidden) },
  { key: 'backgrounds', title: '배경 꾸미기', description: '프로필 배경을 꾸밉니다.', items: PROFILE_BACKGROUNDS },
];

export const getOwnedCosmetics = (owned = {}) => ({
  frames: Array.from(new Set([...(DEFAULT_OWNED_COSMETICS.frames), ...(owned.frames || [])])),
  backgrounds: Array.from(new Set([...(DEFAULT_OWNED_COSMETICS.backgrounds), ...(owned.backgrounds || [])])),
});

export const getEquippedCosmetics = (equipped = {}) => ({
  frame: equipped.frame || DEFAULT_EQUIPPED_COSMETICS.frame,
  background: equipped.background || DEFAULT_EQUIPPED_COSMETICS.background,
});

export const getCosmeticById = (type, id) => {
  const list = type === 'frames' ? PROFILE_FRAMES : PROFILE_BACKGROUNDS;
  return list.find(item => item.id === id) || list[0];
};

export const getCosmeticStyles = (equipped = {}) => {
  const safeEquipped = getEquippedCosmetics(equipped);
  return {
    frame: getCosmeticById('frames', safeEquipped.frame),
    background: getCosmeticById('backgrounds', safeEquipped.background),
  };
};

export const getHallOfFameDateKey = (date = new Date()) => {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  if (kst.getUTCHours() < 8) kst.setUTCDate(kst.getUTCDate() - 1);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const hasActiveHallOfFameFrame = (student, dateKey = getHallOfFameDateKey()) => (
  student?.hallOfFameFrame?.dateKey === dateKey
  && (student.hallOfFameFrame.categories || []).length > 0
);

export const getHallOfFameCategoryLabels = (student, dateKey = getHallOfFameDateKey()) => {
  if (!hasActiveHallOfFameFrame(student, dateKey)) return [];
  return (student.hallOfFameFrame.categories || [])
    .map(id => HALL_OF_FAME_CATEGORY_LABELS[id] || id)
    .filter(Boolean);
};

export const getHallOfFameBadgeText = (student, dateKey = getHallOfFameDateKey()) => {
  const labels = getHallOfFameCategoryLabels(student, dateKey);
  if (labels.length === 0) return '';
  if (labels.length === 1) return `${labels[0]} 1위`;
  return `${labels[0]} 1위 외 ${labels.length - 1}관왕`;
};

export const getEffectiveCosmeticStyles = (student, dateKey = getHallOfFameDateKey()) => {
  const styles = getCosmeticStyles(student?.equippedCosmetics);
  if (!hasActiveHallOfFameFrame(student, dateKey)) return styles;
  return {
    ...styles,
    frame: getCosmeticById('frames', HALL_OF_FAME_FRAME_ID),
  };
};
