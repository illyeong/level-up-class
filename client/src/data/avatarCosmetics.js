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
