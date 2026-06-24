import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, orderBy, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import SpriteMonster from '../../components/SpriteMonster';
import { MONSTERS_DB } from '../../data/monsterData';

const getKstDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};
const HUNGER_STEP_HOURS = 7.2;
const HAPPINESS_DECAY_PER_DAY = 80;
const CLEANLINESS_DECAY_PER_DAY = 10;
const ENERGY_RECOVERY_PER_DAY = 20;
const toDate = value => value?.toDate?.() ?? (value?.seconds ? new Date(value.seconds * 1000) : null);
const getElapsedDays = (date, now = Date.now()) => Math.floor(Math.max(0, now - date.getTime()) / 86400000);

const calculateTimedPetState = pet => {
  const now = Date.now();
  const hungerRef = toDate(pet.lastHungerDecay) || toDate(pet.lastCareAt) || toDate(pet.obtainedAt) || new Date();
  const happinessRef = toDate(pet.lastHappinessDecay) || toDate(pet.lastCareAt) || toDate(pet.obtainedAt) || new Date();
  const cleanlinessRef = toDate(pet.lastCleanlinessDecay) || toDate(pet.lastCareAt) || toDate(pet.obtainedAt) || new Date();
  const energyRef = toDate(pet.lastEnergyRecovery) || toDate(pet.lastCareAt) || toDate(pet.obtainedAt) || new Date();
  const hungerSteps = Math.floor(Math.max(0, now - hungerRef.getTime()) / (HUNGER_STEP_HOURS * 3600000));
  const happinessLoss = Math.floor(Math.max(0, now - happinessRef.getTime()) * HAPPINESS_DECAY_PER_DAY / 86400000);
  const cleanlinessLoss = getElapsedDays(cleanlinessRef, now) * CLEANLINESS_DECAY_PER_DAY;
  const energyGain = getElapsedDays(energyRef, now) * ENERGY_RECOVERY_PER_DAY;
  return {
    ...pet,
    hunger: Math.max(0, (pet.hunger ?? 100) - hungerSteps * 10),
    happiness: Math.max(0, Math.round((pet.happiness ?? 100) - happinessLoss)),
    cleanliness: Math.max(0, (pet.cleanliness ?? 100) - cleanlinessLoss),
    energy: Math.min(100, (pet.energy ?? 100) + energyGain),
  };
};

// ── 펫 등급 (5단계) ──────────────────────────────────────────
const RARITY = {
  common:    { label: '일반',   badge: '⚪', bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-300',   tierKey: 'tiny'   },
  rare:      { label: '희귀',   badge: '🔵', bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-300',    tierKey: 'small'  },
  epic:      { label: '영웅',   badge: '🟣', bg: 'bg-purple-50',   text: 'text-purple-700',  border: 'border-purple-300',  tierKey: 'medium' },
  legendary: { label: '전설',   badge: '🟡', bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-300',   tierKey: 'large'  },
  mythic:    { label: '신화',   badge: '🌈', bg: 'bg-rose-50',     text: 'text-rose-600',    border: 'border-rose-400',    tierKey: 'boss'   },
};

// ── 펫 레벨 시스템 ───────────────────────────────────────────
const MAX_PET_LEVEL = 30;
const EXP_PER_LEVEL = 100; // 레벨당 100 EXP
const getPetLevel   = (exp) => Math.min(MAX_PET_LEVEL, Math.floor((exp || 0) / EXP_PER_LEVEL) + 1);
const getLevelProgress = (exp) => {
  const lv = getPetLevel(exp);
  if (lv >= MAX_PET_LEVEL) return { level: lv, current: EXP_PER_LEVEL, needed: EXP_PER_LEVEL, pct: 100 };
  const base = (lv - 1) * EXP_PER_LEVEL;
  const current = (exp || 0) - base;
  return { level: lv, current, needed: EXP_PER_LEVEL, pct: Math.round((current / EXP_PER_LEVEL) * 100) };
};

// 레벨별 스탯 배율: 레벨당 +5% (Lv1=1.0, Lv10=1.45, Lv20=1.95, Lv30=2.45)
export const getPetStatMultiplier = (level) => 1 + (Math.max(1, level) - 1) * 0.05;

// ── 친밀도 칭호 ─────────────────────────────────────────────
const getAffectionTitle = (aff) =>
  aff >= 500 ? '💖 소울메이트' :
  aff >= 300 ? '💛 베스트 프렌드' :
  aff >= 200 ? '🤝 단짝' :
  aff >= 100 ? '😊 친한 친구' :
  aff >= 50  ? '👋 새 친구' : null;

// ── 스탯 메타 (전투 스탯 기반) ───────────────────────────────
export const STATS_META = {
  atk:  { label: '공격력',    icon: '⚔️',  unit: '' },
  hp:   { label: '체력',      icon: '❤️',  unit: '' },
  def:  { label: '방어력',    icon: '🛡️',  unit: '' },
  crit: { label: '크리 확률', icon: '💥',  unit: '%' },
};

// 등급별 스탯 풀 ([stat, min, max])
const STAT_POOLS = {
  common: [
    [['hp',  5, 15]],
    [['atk', 3, 8]],
    [['def', 3, 8]],
  ],
  rare: [
    [['atk', 8,  15]],
    [['hp',  15, 30]],
    [['def', 8,  15]],
    [['crit', 3,  7]],
  ],
  epic: [
    [['atk', 15, 25], ['hp',   20, 40]],
    [['atk', 15, 25], ['crit',  5, 10]],
    [['def', 15, 25], ['hp',   25, 45]],
    [['hp',  30, 50], ['crit',  5, 10]],
  ],
  legendary: [
    [['atk', 25, 40], ['hp',   40, 70], ['crit', 8, 15]],
    [['atk', 30, 50], ['def',  20, 35], ['hp',  40, 60]],
    [['hp',  50, 80], ['def',  25, 40], ['crit', 8, 15]],
    [['atk', 30, 50], ['crit', 10, 20]],
  ],
  mythic: [
    [['atk', 60, 100], ['hp', 80, 140], ['crit', 15, 25]],
    [['atk', 70, 110], ['def', 50, 80],  ['crit', 12, 22]],
    [['hp', 100, 160], ['def', 60, 90],  ['atk', 50, 80]],
    [['atk', 80, 130], ['hp', 90, 150],  ['def', 40, 70], ['crit', 15, 25]],
  ],
};

function rand(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function generateStats(rarity) {
  const pool = STAT_POOLS[rarity];
  if (!pool?.length) return { hp: 5 };
  const combo = pool[Math.floor(Math.random() * pool.length)];
  return Object.fromEntries(combo.map(([stat, min, max]) => [stat, rand(min, max)]));
}

// 스탯 표시용 문자열 배열
export function formatStats(stats = {}) {
  return Object.entries(stats)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => {
      const m = STATS_META[k];
      return m ? `${m.icon} ${m.label} +${v}${m.unit}` : null;
    })
    .filter(Boolean);
}

// ── 알 부화 시스템 ───────────────────────────────────────────
export const REQUIRED_CLEARS = { common: 10, rare: 20, epic: 30, legendary: 40, mythic: 50 };

const EGG_FRAMES = {
  common:    { path: 'Egg_Common',    total: 20 },
  rare:      { path: 'Egg_Rare',      total: 30 },
  epic:      { path: 'Egg_Epic',      total: 16 },
  legendary: { path: 'Egg_Legendary', total: 30 },
  mythic:    { path: 'Egg_Mythic',    total: 30 },
};

// 알 부화 프레임 애니메이션
function EggHatchAnim({ eggType, onComplete }) {
  const [frame, setFrame] = useState(1);
  const [phase, setPhase] = useState('anim'); // anim | flash | done
  const cfg = EGG_FRAMES[eggType] || EGG_FRAMES.common;

  useEffect(() => {
    let f = 1;
    const iv = setInterval(() => {
      f++;
      setFrame(f);
      if (f >= cfg.total) {
        clearInterval(iv);
        setPhase('flash');
        setTimeout(() => { setPhase('done'); setTimeout(onComplete, 800); }, 500);
      }
    }, 50); // ~20fps
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-8">
      {phase === 'anim' && (
        <img
          src={`/images/Eggs/${cfg.path}/512x512/${encodeURIComponent(`Egg ${frame}.png`)}`}
          alt="부화 중"
          className="w-48 h-48 object-contain"
          onError={e => { e.target.style.opacity = '0'; }}
        />
      )}
      {phase === 'flash' && (
        <div className="w-48 h-48 rounded-full bg-white/80 animate-ping" />
      )}
      {phase === 'done' && (
        <p className="text-white font-extrabold text-3xl animate-bounce">✨ 부화 완료!</p>
      )}
    </div>
  );
}

// 인벤토리 알 카드
function EggInventoryCard({ egg, isIncubating, onIncubate, onDiscard, rarity }) {
  const r = RARITY[egg.eggType] || RARITY.common;
  const required = REQUIRED_CLEARS[egg.eggType] || 10;
  const current  = egg.currentClears || 0;
  const ready    = current >= required;
  const cfg = EGG_FRAMES[egg.eggType] || EGG_FRAMES.common;
  const gachaImg = `/images/Eggs/Egg_${egg.eggType.charAt(0).toUpperCase() + egg.eggType.slice(1)}_Gacha.png`;
  const displayImg = egg.frameImg || gachaImg; // 저장된 512x512 프레임 우선

  return (
    <div className={`rounded-2xl border-2 p-3 transition-all text-center
      ${isIncubating ? `${r.border} bg-slate-800 shadow-lg` : 'border-slate-700 bg-slate-800/50'}`}>
      <img src={displayImg} alt={r.label} className="w-14 h-14 object-contain mx-auto mb-1"
        onError={e => { e.target.src = gachaImg; }} />
      <p className={`text-[10px] font-bold ${r.text} mb-1`}>{r.badge} {r.label} 알</p>
      {isIncubating ? (
        <>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-1">
            <div className="h-full bg-indigo-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, (current / required) * 100)}%` }} />
          </div>
          <p className="text-[10px] text-slate-400">{current}/{required}회</p>
          {ready && <p className="text-[10px] text-emerald-400 font-bold mt-0.5">부화 준비 완료!</p>}
        </>
      ) : (
        <>
          <p className="text-[10px] text-slate-500 mb-1.5">AI학습관 {required}회</p>
          <button onClick={() => onIncubate(egg)}
            className="w-full text-[10px] font-bold py-1 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 mb-1">
            인큐베이터 넣기
          </button>
          <button onClick={() => onDiscard(egg)}
            className="w-full text-[10px] font-bold py-1 rounded-lg bg-slate-700 text-rose-400 hover:bg-rose-700 hover:text-white">
            버리기 🗑
          </button>
        </>
      )}
    </div>
  );
}

// ── 가챠 알 설정 (5등급 포함) ────────────────────────────────
const EGGS = [
  {
    id: 'normal', name: '일반 펫 알', cost: 500,
    img: '/images/Eggs/Egg_Common_Gacha.png',
    gradient: 'from-slate-500 to-slate-700',
    rates: { common: 65, rare: 30, epic: 5, legendary: 0, mythic: 0 },
    rateRows: [{ label: '일반 ⚪', pct: 65 }, { label: '희귀 🔵', pct: 30 }, { label: '영웅 🟣', pct: 5 }],
  },
  {
    id: 'rare', name: '희귀 펫 알', cost: 1000,
    img: '/images/Eggs/Egg_Rare_Gacha.png',
    gradient: 'from-blue-600 to-indigo-700',
    rates: { common: 20, rare: 54, epic: 22, legendary: 3, mythic: 1 },
    rateRows: [{ label: '일반 ⚪', pct: 20 }, { label: '희귀 🔵', pct: 54 }, { label: '영웅 🟣', pct: 22 }, { label: '전설 🟡', pct: 3 }, { label: '신화 🌈', pct: 1 }],
  },
  {
    id: 'epic', name: '영웅 펫 알', cost: 1500,
    img: '/images/Eggs/Egg_Epic_Gacha.png',
    gradient: 'from-purple-600 to-violet-800',
    rates: { common: 0, rare: 30, epic: 55, legendary: 12, mythic: 3 },
    rateRows: [{ label: '희귀 🔵', pct: 30 }, { label: '영웅 🟣', pct: 55 }, { label: '전설 🟡', pct: 12 }, { label: '신화 🌈', pct: 3 }],
  },
  {
    id: 'legendary', name: '전설 펫 알', cost: 2000,
    img: '/images/Eggs/Egg_Legendary_Gacha.png',
    gradient: 'from-amber-500 to-orange-700',
    rates: { common: 0, rare: 37, epic: 45, legendary: 15, mythic: 3 },
    rateRows: [{ label: '희귀 🔵', pct: 37 }, { label: '영웅 🟣', pct: 45 }, { label: '전설 🟡', pct: 15 }, { label: '신화 🌈', pct: 3 }],
  },
  {
    id: 'mythic', name: '신화 펫 알', cost: 3000,
    img: '/images/Eggs/Egg_Mythic_Gacha.png',
    gradient: 'from-rose-600 via-purple-700 to-indigo-700',
    rates: { common: 0, rare: 0, epic: 30, legendary: 55, mythic: 15 },
    rateRows: [{ label: '영웅 🟣', pct: 30 }, { label: '전설 🟡', pct: 55 }, { label: '신화 🌈', pct: 15 }],
  },
];

// ── 가챠 유틸 ────────────────────────────────────────────────
function rollRarity(egg) {
  const r = Math.random() * 100;
  let acc = 0;
  for (const [key, pct] of Object.entries(egg.rates)) {
    acc += pct;
    if (r < acc) return key;
  }
  return 'common';
}
function pickMonster(rarity) {
  const tierKey = RARITY[rarity].tierKey;
  const pool = Object.values(MONSTERS_DB).filter(m => m.tier === tierKey);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

// 등급별 알 이미지 (가챠 결과 표시용)
const RARITY_EGG_IMG = {
  common:    '/images/Eggs/Egg_Common_Gacha.png',
  rare:      '/images/Eggs/Egg_Rare_Gacha.png',
  epic:      '/images/Eggs/Egg_Epic_Gacha.png',
  legendary: '/images/Eggs/Egg_Legendary_Gacha.png',
  mythic:    '/images/Eggs/Egg_Mythic_Gacha.png',
};

// ── 등급별 테마 ──────────────────────────────────────────────
const RARITY_THEME = {
  common:    { glow: '#94a3b8', flash: 'rgba(255,255,255,0.35)', label: '',              stars: '✦✧✦' },
  rare:      { glow: '#60a5fa', flash: 'rgba(96,165,250,0.45)',  label: '',              stars: '✦★✦' },
  epic:      { glow: '#c084fc', flash: 'rgba(192,132,252,0.55)', label: '✨ 영웅 등장!',  stars: '★✦★' },
  legendary: { glow: '#fbbf24', flash: 'rgba(251,191,36,0.65)',  label: '🌟 전설 등장!!', stars: '🌟★🌟' },
  mythic:    { glow: '#f43f5e', flash: 'rgba(244,63,94,0.70)',   label: '🌈 신화 등장!!!', stars: '🌈💥🌈' },
};

// ── 폭발형 파티클 버스트 ─────────────────────────────────────
const SHAPES = ['✦', '★', '✸', '◆', '●', '✿', '⬟', '✵'];
function ParticleBurst({ color, count = 48, cx = '50%', cy = '50%' }) {
  const [fired, setFired] = useState(false);
  const pts = useState(() => Array.from({ length: count }, (_, i) => {
    const angle  = (i / count) * 360 + (Math.random() - 0.5) * (360 / count) * 2;
    const dist   = 60 + Math.random() * 140;
    const rad    = (angle * Math.PI) / 180;
    const tx     = Math.cos(rad) * dist;
    const ty     = Math.sin(rad) * dist;
    const size   = 10 + Math.random() * 20;
    const dur    = 700 + Math.random() * 600;
    const delay  = Math.random() * 120;
    return { id: i, tx, ty, size, dur, delay, shape: SHAPES[i % SHAPES.length] };
  }))[0];

  useEffect(() => { const t = setTimeout(() => setFired(true), 30); return () => clearTimeout(t); }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {pts.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          fontSize: p.size,
          color,
          transition: `transform ${p.dur}ms cubic-bezier(0.05,0.9,0.3,1) ${p.delay}ms, opacity ${p.dur * 0.7}ms ease-in ${p.delay + p.dur * 0.4}ms`,
          transform: fired ? `translate(${p.tx}px, ${p.ty}px) scale(0) rotate(${p.tx > 0 ? 180 : -180}deg)` : 'translate(0,0) scale(1) rotate(0deg)',
          opacity: fired ? 0 : 1,
          left: cx, top: cy, marginLeft: -p.size / 2, marginTop: -p.size / 2,
        }}>{p.shape}</div>
      ))}
    </div>
  );
}

// ── 부화 애니메이션 (개선판) ─────────────────────────────────
// eggFrameImg: 랜덤 선택된 512x512 프레임 이미지
function HatchAnim({ egg, rarity, eggFrameImg, onDone }) {
  // stage 0→1→2→3→4→5  (전체 ~8초)
  // 0: 대기  1: 약한 흔들기(2s)  2: 강한 흔들기(2s)
  // 3: 균열(1s)  4: 폭발(1s)  5: 등장(onDone 2s후)
  const [stage, setStage] = useState(0);
  const [tick, setTick]   = useState(0);
  const [flash, setFlash] = useState(false);
  const theme = RARITY_THEME[rarity] || RARITY_THEME.common;

  useEffect(() => {
    const T = [
      setTimeout(() => setStage(1), 100),
      setTimeout(() => setStage(2), 2100),  // 약한 흔들기 2s
      setTimeout(() => setStage(3), 4100),  // 강한 흔들기 2s
      setTimeout(() => {
        setStage(4);
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      }, 5200),                              // 균열 1.1s
      setTimeout(() => { setStage(5); setTimeout(onDone, 2200); }, 6300), // 폭발 1.1s
    ];
    return () => T.forEach(clearTimeout);
  }, []);

  // 흔들기 틱
  useEffect(() => {
    if (stage !== 1 && stage !== 2 && stage !== 3) return;
    const spd = stage === 1 ? 280 : stage === 2 ? 130 : 90;
    const iv = setInterval(() => setTick(t => t + 1), spd);
    return () => clearInterval(iv);
  }, [stage]);

  const eggStyle = (() => {
    if (stage === 0) return {};
    const deg = stage === 1 ? 6 : stage === 2 ? 14 : stage === 3 ? 18 : 0;
    const sc  = stage === 4 ? 1.4 : stage === 5 ? 0 : (tick % 2 === 0 ? 1.04 : 0.97);
    const rot = tick % 2 === 0 ? -deg : deg;
    return {
      transform: `rotate(${rot}deg) scale(${sc})`,
      transition: stage >= 4 ? 'transform 0.3s ease' : `transform ${stage === 1 ? 220 : 100}ms ease`,
      filter: stage >= 2 ? `drop-shadow(0 0 ${stage >= 3 ? 28 : 14}px ${theme.glow})` : 'none',
    };
  })();

  // stage 5 텍스트: 등급 노출 X → 결과화면에서만 공개
  const msgs = ['', '부화 중...', '🔥 곧 나온다!', '💢 균열 발생!', '💥 CRACK!', '✨ 등장!'];

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[360px] gap-4 overflow-hidden rounded-3xl"
      style={{ background: `radial-gradient(ellipse at center, ${theme.glow}22 0%, #0f172a 70%)` }}>

      {/* 플래시 오버레이 */}
      {flash && (
        <div className="absolute inset-0 rounded-3xl z-20 transition-opacity duration-300"
          style={{ background: theme.flash }} />
      )}

      {/* 파티클 (stage 4+) — 중심에서 방사형 폭발 */}
      {stage >= 4 && <ParticleBurst color={theme.glow} count={52} />}

      {/* 글로우 링 (stage 2-3) */}
      {(stage === 2 || stage === 3) && (
        <div className="absolute w-52 h-52 rounded-full animate-ping opacity-20"
          style={{ backgroundColor: theme.glow }} />
      )}

      {/* 메시지 */}
      <p className="relative z-10 font-extrabold text-xl min-h-[32px] transition-all"
        style={{ color: stage >= 4 ? theme.glow : '#e2e8f0' }}>
        {stage >= 4
          ? <span className="animate-bounce inline-block">{msgs[stage]}</span>
          : <span className="animate-pulse">{msgs[stage]}</span>}
      </p>

      {/* 알 — stage 2부터 랜덤 선택된 결과 등급 알 이미지 */}
      {stage < 5 && (
        <div className="relative z-10 select-none" style={{ ...eggStyle, width: 140, height: 140 }}>
          <img
            src={egg.img}
            alt={egg.name}
            className="w-full h-full object-contain" draggable={false} />
          {/* 균열 이모지 오버레이 */}
          {stage === 3 && (
            <span className="absolute -top-2 -right-2 text-3xl animate-ping">💢</span>
          )}
        </div>
      )}

      {/* 별 파티클 텍스트 (stage 3) */}
      {stage === 3 && (
        <p className="text-2xl animate-spin" style={{ color: theme.glow }}>{theme.stars}</p>
      )}

      {/* 등장 텍스트 (stage 5) */}
      {stage === 5 && !theme.label && (
        <p className="text-3xl font-extrabold text-white animate-bounce">✨ 등장! ✨</p>
      )}

      {/* 진행 바 */}
      <div className="relative z-10 w-48 h-1.5 bg-white/10 rounded-full overflow-hidden mt-2">
        <div className="h-full rounded-full transition-all duration-300"
          style={{
            backgroundColor: theme.glow,
            width: `${[0,20,50,70,90,100][stage] ?? 0}%`,
          }} />
      </div>
    </div>
  );
}

// ── 펫 카드 ──────────────────────────────────────────────────
function PetCard({ pet, isActive, onSetActive, onRename }) {
  const [anim, setAnim] = useState('idle');
  const md = MONSTERS_DB[pet.monsterId];
  const r = RARITY[pet.rarity] || RARITY.common;
  const statLines = formatStats(pet.stats || {});
  const isMythic = pet.rarity === 'mythic';
  // 티어별 표시 높이 목표 (크기 비교가 확실히 되도록)
  const TIER_H = { tiny: 38, small: 54, medium: 76, large: 120, boss: 148 };
  const targetH   = TIER_H[md.tier] || 60;
  const cardScale = targetH / (md.frameHeight || 120);
  const slotH     = targetH + 14; // 스프라이트 컨테이너 높이 (여유 포함)
  if (!md) return null;
  return (
    <div className={`relative rounded-2xl p-3 pt-5 transition-all
      ${isMythic
        ? 'border-2 border-rose-400 bg-gradient-to-b from-rose-950/50 to-purple-950/50 shadow-[0_0_16px_#f43f5e60]'
        : isActive
          ? `border-2 ${r.border} bg-slate-800 shadow-lg`
          : 'border-2 border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>

      {/* 대표 펫 배지 — pt-5로 공간 확보 후 내부에 표시 */}
      {isActive && (
        <span className={`absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border whitespace-nowrap
          ${r.bg} ${r.text} ${r.border}`}>
          ★ 대표 펫
        </span>
      )}

      {/* 스프라이트 — 티어별 높이 */}
      <div className="flex justify-center items-end mb-2 cursor-pointer overflow-hidden"
        style={{ height: slotH }}
        onClick={() => setAnim(a => a === 'idle' ? 'attack' : 'idle')}>
        <SpriteMonster data={md} anim={anim} scale={cardScale} onAnimEnd={() => setAnim('idle')} />
      </div>

      <p className="text-center text-xs font-extrabold text-slate-200 truncate">{pet.nickname || md.name}</p>
      <p className={`text-center text-[10px] font-bold ${r.text} mb-1.5`}>{r.badge} {r.label}</p>

      {/* 스탯 보너스 */}
      <div className="space-y-0.5 mb-2 min-h-[28px]">
        {statLines.map((line, i) => (
          <p key={i} className="text-center text-[9px] text-slate-300 bg-slate-700/60 rounded px-1.5 py-0.5 font-bold">{line}</p>
        ))}
      </div>

      <div className="flex gap-1">
        {!isActive && (
          <button onClick={() => onSetActive(pet.id)}
            className="flex-1 text-[10px] font-bold py-1 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600">
            대표 설정
          </button>
        )}
        <button onClick={() => onRename(pet)}
          className="flex-1 text-[10px] font-bold py-1 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600">
          이름 변경
        </button>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function PetHouse({ studentCode }) {
  const [tab, setTab]           = useState('myPets');
  const [student, setStudent]   = useState(null);
  const [pets, setPets]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [activePetId, setActivePetId] = useState(null);

  // 알 부화 시스템
  const [eggs,        setEggs]        = useState([]); // studentEggs 목록
  const [selectedPet, setSelectedPet] = useState(null); // 상세 패널 선택 펫
  const [detailAnim,  setDetailAnim]  = useState('idle');
  const [petBubble,   setPetBubble]   = useState(null);  // 쓰다듬기 말풍선
  const [showHearts,  setShowHearts]  = useState(false); // 하트 이펙트
  const [careEffectPos, setCareEffectPos] = useState(null);
  const detailPetRef = useRef(null);
  const careEffectTimerRef = useRef(null);
  const petServerDataRef = useRef([]);
  const [hatchPhase,  setHatchPhase]  = useState('idle'); // idle|animating|result
  const [hatchingEgg, setHatchingEgg] = useState(null);
  const [hatchedPet,  setHatchedPet]  = useState(null);

  const [gachaPhase, setGachaPhase]   = useState('idle'); // idle|confirm|hatching|result
  const [selectedEgg, setSelectedEgg] = useState(null);
  const [gachaResult, setGachaResult] = useState(null);
  const [hatchDone, setHatchDone]     = useState(false);  // 애니 완료 여부

  // 애니 완료 + 알 저장 완료 둘 다 됐을 때 result로 전환
  useEffect(() => {
    if (hatchDone && gachaResult?.eggId) {
      setGachaPhase('result');
      setHatchDone(false);
    }
  }, [hatchDone, gachaResult]);

  const [renamePet, setRenamePet]   = useState(null);
  const [renameInput, setRenameInput] = useState('');

  const captureCareEffectPos = () => {
    const rect = detailPetRef.current?.getBoundingClientRect?.();
    if (!rect) {
      setCareEffectPos(null);
      return;
    }
    setCareEffectPos({
      x: rect.left + rect.width / 2,
      top: Math.max(72, rect.top - 12),
      middle: rect.top + rect.height * 0.45,
    });
  };

  const showCareEffect = (lines, { hearts = true, anim = null } = {}) => {
    clearTimeout(careEffectTimerRef.current);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      captureCareEffectPos();
      if (anim) setDetailAnim(anim);
      setPetBubble(lines[Math.floor(Math.random() * lines.length)]);
      setShowHearts(hearts);
      careEffectTimerRef.current = setTimeout(() => {
        setPetBubble(null);
        setShowHearts(false);
        setDetailAnim('idle');
      }, 2500);
    }));
  };

  useEffect(() => () => clearTimeout(careEffectTimerRef.current), []);

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  // 로드
  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      const stuSnap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
      if (!stuSnap.empty) {
        const d = stuSnap.docs[0];
        setStudent({ id: d.id, ...d.data() });
        setActivePetId(d.data().activePetId || null);
      }
      const petSnap = await getDocs(query(collection(db, 'studentPets'), where('studentCode', '==', studentCode)));
      const petList = petSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // ── 펫 상태 시간 감소 ────────────────────────────────────
      // 배고픔: 7.2시간마다 -10 (72h=3일에 0), 행복도/청결: 하루마다 감소
      // lastHungerDecay: 배고픔 감소 전용 타임스탬프 (lastCareAt과 분리)
      const stateUpdates = petList.map(async pet => {
        const now = Date.now();
        // ① 배고픔 감소 (lastHungerDecay 기준)
        const decayRef = pet.lastHungerDecay?.toDate?.() || pet.lastCareAt?.toDate?.() || pet.obtainedAt?.toDate?.() || new Date();
        const hoursElapsed = (now - decayRef.getTime()) / 3600000;
        const hungerSteps  = Math.floor(hoursElapsed / HUNGER_STEP_HOURS);

        const happinessRef = pet.lastHappinessDecay?.toDate?.() || pet.lastCareAt?.toDate?.() || pet.obtainedAt?.toDate?.() || new Date();
        const happinessElapsedMs = Math.max(0, now - happinessRef.getTime());
        const happinessLoss = Math.floor(happinessElapsedMs * HAPPINESS_DECAY_PER_DAY / 86400000);

        // ② 행복도·청결도·기력 변화는 각각의 전용 기준 시각으로 계산
        const cleanlinessRef = pet.lastCleanlinessDecay?.toDate?.() || pet.lastCareAt?.toDate?.() || pet.obtainedAt?.toDate?.() || new Date();
        const energyRef = pet.lastEnergyRecovery?.toDate?.() || pet.lastCareAt?.toDate?.() || pet.obtainedAt?.toDate?.() || new Date();
        const cleanlinessDaysElapsed = getElapsedDays(cleanlinessRef, now);
        const energyDaysElapsed = getElapsedDays(energyRef, now);

        if (hungerSteps === 0 && happinessLoss === 0 && cleanlinessDaysElapsed === 0 && energyDaysElapsed === 0) return pet;

        const newHunger      = Math.max(0,   (pet.hunger      ?? 100) - hungerSteps * 10);
        const newHappiness   = Math.max(0,   Math.round((pet.happiness ?? 100) - happinessLoss));
        const newCleanliness = Math.max(0,   (pet.cleanliness ?? 100) - cleanlinessDaysElapsed * CLEANLINESS_DECAY_PER_DAY);
        const newEnergy      = Math.min(100, (pet.energy      ?? 100) + energyDaysElapsed * ENERGY_RECOVERY_PER_DAY);

        const updates = {
          hunger: newHunger,
          happiness: newHappiness,
          cleanliness: newCleanliness,
          energy: newEnergy,
        };
        if (hungerSteps > 0) updates.lastHungerDecay = new Date(decayRef.getTime() + hungerSteps * HUNGER_STEP_HOURS * 3600000); // 배고픔만 별도 기록
        if (happinessLoss > 0) updates.lastHappinessDecay = new Date(happinessRef.getTime() + happinessLoss * 86400000 / HAPPINESS_DECAY_PER_DAY);
        if (cleanlinessDaysElapsed > 0) updates.lastCleanlinessDecay = new Date(cleanlinessRef.getTime() + cleanlinessDaysElapsed * 86400000);
        if (energyDaysElapsed > 0) updates.lastEnergyRecovery = new Date(energyRef.getTime() + energyDaysElapsed * 86400000);

        await updateDoc(doc(db, 'studentPets', pet.id), updates);
        return { ...pet, ...updates };
      });
      const updatedPets = await Promise.all(stateUpdates);
      setPets(updatedPets);

      // 알 인벤토리 로드
      const eggSnap = await getDocs(query(
        collection(db, 'studentEggs'),
        where('studentCode', '==', studentCode),
        where('hatched', '==', false),
      ));
      setEggs(eggSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      setLoading(false);
    })();
  }, [studentCode]);

  // 워킹펫과 펫하우스의 상태를 실시간으로 동일하게 유지합니다.
  useEffect(() => {
    if (!studentCode) return undefined;
    const studentQuery = query(collection(db, 'students'), where('studentCode', '==', studentCode));
    const petQuery = query(collection(db, 'studentPets'), where('studentCode', '==', studentCode));

    const unsubscribeStudent = onSnapshot(studentQuery, snapshot => {
      if (snapshot.empty) return;
      const studentDoc = snapshot.docs[0];
      const data = { id: studentDoc.id, ...studentDoc.data() };
      setStudent(data);
      setActivePetId(data.activePetId || null);
    });
    const unsubscribePets = onSnapshot(petQuery, snapshot => {
      const serverPets = snapshot.docs.map(petDoc => ({ id: petDoc.id, ...petDoc.data() }));
      petServerDataRef.current = serverPets;
      const nextPets = serverPets.map(calculateTimedPetState);
      setPets(nextPets);
      setSelectedPet(previous => previous
        ? nextPets.find(pet => pet.id === previous.id) || null
        : previous);
    });

    return () => {
      unsubscribeStudent();
      unsubscribePets();
    };
  }, [studentCode]);

  useEffect(() => {
    const refreshTimedState = () => {
      const nextPets = petServerDataRef.current.map(calculateTimedPetState);
      if (nextPets.length === 0) return;
      setPets(nextPets);
      setSelectedPet(previous => previous
        ? nextPets.find(pet => pet.id === previous.id) || null
        : previous);
    };
    const timer = setInterval(refreshTimedState, 60000);
    return () => clearInterval(timer);
  }, []);

  // 알 버리기
  const discardEgg = async (egg) => {
    const r = RARITY[egg.eggType] || RARITY.common;
    if (!window.confirm(`${r.badge} ${r.label} 알을 버리시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    await deleteDoc(doc(db, 'studentEggs', egg.id));
    setEggs(prev => prev.filter(e => e.id !== egg.id));
    showToast('알을 버렸습니다.');
  };

  // EXP 추가 + 레벨업 체크
  const addPetExp = async (pet, expGain) => {
    const oldExp   = pet.petExp ?? 0;
    const newExp   = oldExp + expGain;
    const oldLevel = getPetLevel(oldExp);
    const newLevel = getPetLevel(newExp);
    const updates  = { petExp: newExp };
    if (newLevel !== oldLevel) {
      updates.petLevel = newLevel;
      showToast(`🎉 레벨업! Lv.${newLevel} 달성!`);
    }
    await updateDoc(doc(db, 'studentPets', pet.id), updates);
    const patched = { ...pet, petExp: newExp, petLevel: newLevel };
    setPets(prev => prev.map(p => p.id === pet.id ? patched : p));
    if (selectedPet?.id === pet.id) setSelectedPet(patched);
  };

  // ── 펫 케어 시스템 ─────────────────────────────────────────────
  const TODAY = getKstDateKey();

  const getDailyCare = (pet) => {
    const base = { date: TODAY, feedCount: 0, petCount: 0, washCount: 0, playCount: 0 };
    if (!pet.dailyCare || pet.dailyCare.date !== TODAY) return base;
    return { ...base, ...pet.dailyCare }; // 누락된 필드 기본값으로 채움
  };

  // 상태 단계 (0-19/20-49/50-79/80-100)
  const getPetState = (pet) => {
    const h = pet.hunger ?? 100, hap = pet.happiness ?? 100;
    const avg = (h + hap) / 2;
    if (avg >= 80) return 'great';
    if (avg >= 50) return 'normal';
    if (avg >= 20) return 'bad';
    return 'terrible';
  };

  // 대사 생성
  const getPetDialogue = (pet) => {
    const h = pet.hunger ?? 100, hap = pet.happiness ?? 100;
    if (h <= 0) return '배가 너무 고파서 움직일 힘이 없어요... 🍖';
    if (h < 20) return '배가 너무 고파요... 🍖';
    if (hap < 20) return '너무 심심해요... 💭';
    if (h < 50) return '배고파요~ 먹이 줘요 🍖';
    if (hap < 50) return '같이 놀아줘요! 💭';
    if (h >= 80 && hap >= 80) return '오늘도 같이 공부하자! ✨';
    return '안녕하세요! 😊';
  };

  // 먹이 3종
  const FOOD_OPTIONS = [
    { id: 'small',   name: '작은 먹이',   costType: 'gold',    cost: 100, hunger: 20,  happiness: 0,  emoji: '🌾' },
    { id: 'nice',    name: '맛있는 먹이', costType: 'gold',    cost: 300, hunger: 50,  happiness: 5,  emoji: '🍖' },
    { id: 'special', name: '특별 간식',   costType: 'diamond', cost: 40,  hunger: 100, happiness: 20, emoji: '🍰' },
  ];

  const feedPet = async (pet, food) => {
    const care = getDailyCare(pet);
    if (care.feedCount >= 3) { showToast('오늘 먹이를 이미 3번 줬습니다!', 'error'); return; }
    if ((pet.hunger ?? 100) >= 100) { showToast('이미 배가 부릅니다! 🐾', 'error'); return; }
    const currency = food.costType === 'gold' ? (student?.gold || 0) : (student?.diamonds || 0);
    if (currency < food.cost) { showToast(`${food.costType === 'gold' ? '골드' : '다이아'} 부족!`, 'error'); return; }

    const newHunger    = Math.min(100, (pet.hunger    ?? 50) + food.hunger);
    const newHappiness = Math.min(100, (pet.happiness ?? 50) + food.happiness);
    const newCare      = { ...care, feedCount: care.feedCount + 1 };

    const updates = { hunger: newHunger, happiness: newHappiness, dailyCare: newCare, lastCareAt: serverTimestamp(), lastHungerDecay: serverTimestamp() };
    if (food.happiness > 0) updates.lastHappinessDecay = serverTimestamp();
    await updateDoc(doc(db, 'studentPets', pet.id), updates);

    if (food.costType === 'gold') {
      const newGold = (student.gold || 0) - food.cost;
      await updateDoc(doc(db, 'students', student.id), { gold: newGold });
      setStudent(p => ({ ...p, gold: newGold }));
    } else {
      const newDia = (student.diamonds || 0) - food.cost;
      await updateDoc(doc(db, 'students', student.id), { diamonds: newDia });
      setStudent(p => ({ ...p, diamonds: newDia }));
    }

    const patched = { ...pet, ...updates, dailyCare: newCare };
    setPets(prev => prev.map(p => p.id === pet.id ? patched : p));
    if (selectedPet?.id === pet.id) setSelectedPet(patched);
    showToast(`${food.emoji} ${food.name} 줬습니다! 배고픔 +${food.hunger}${food.happiness ? `, 행복 +${food.happiness}` : ''}`);
    addPetExp(patched, 10);
  };

  // 쓰다듬기 (하루 3회, 무료)
  const petThePet = async (pet) => {
    if ((pet.hunger ?? 100) <= 0) { showToast('먹이를 주면 다시 움직일 수 있어요 🍖', 'error'); return; }
    const care = getDailyCare(pet);
    if (care.petCount >= 3) { showToast('오늘 쓰다듬기를 이미 3번 했습니다!', 'error'); return; }
    const newHappiness = Math.min(100, (pet.happiness ?? 50) + 15);
    const newAffection = (pet.affection ?? 0) + 2;
    const newCare      = { ...care, petCount: care.petCount + 1 };
    const updates = { happiness: newHappiness, affection: newAffection, dailyCare: newCare, lastCareAt: serverTimestamp(), lastHappinessDecay: serverTimestamp() };
    await updateDoc(doc(db, 'studentPets', pet.id), updates);
    const patched = { ...pet, ...updates, dailyCare: newCare };
    setPets(prev => prev.map(p => p.id === pet.id ? patched : p));
    if (selectedPet?.id === pet.id) setSelectedPet(patched);
    // 쓰다듬기 대사 + 하트 이펙트
    const lines = ['기분 좋아요~ 💕', '더 해줘요! 🥰', '행복해요! ✨', '좋아요~ 💝', '이게 최고야! 💖', '쓰다듬어줘서 고마워요!'];
    showCareEffect(lines, { hearts: true, anim: MONSTERS_DB[pet.monsterId]?.animations?.attack ? 'attack' : 'run' });
    addPetExp(patched, 5);
  };

  // 친밀도 마일스톤
  const AFFECTION_MILESTONES = [
    { val: 50,  label: '이름 변경권',   emoji: '✏️' },
    { val: 100, label: '대시보드 특별모션', emoji: '💫' },
    { val: 200, label: '펫 칭호',       emoji: '🎖️' },
    { val: 300, label: '배경 장식',     emoji: '🌸' },
    { val: 500, label: '특기 강화',     emoji: '⚡' },
  ];

  // 씻기기 (하루 1회)
  const washPet = async (pet) => {
    if ((pet.hunger ?? 100) <= 0) { showToast('먹이를 주면 다시 움직일 수 있어요 🍖', 'error'); return; }
    const care = getDailyCare(pet);
    if (care.washCount >= 1) { showToast('오늘은 이미 씻겼습니다!', 'error'); return; }
    const newClean = Math.min(100, (pet.cleanliness ?? 100) + 30);
    const newHap   = Math.min(100, (pet.happiness   ?? 100) + 5);
    const newAff   = (pet.affection ?? 0) + 3;
    const newCare  = { ...care, washCount: (care.washCount || 0) + 1 };
    const updates  = { cleanliness: newClean, happiness: newHap, affection: newAff, dailyCare: newCare, lastCareAt: serverTimestamp(), lastHappinessDecay: serverTimestamp(), lastCleanlinessDecay: serverTimestamp() };
    await updateDoc(doc(db, 'studentPets', pet.id), updates);
    const patched = { ...pet, ...updates, dailyCare: newCare };
    setPets(prev => prev.map(p => p.id === pet.id ? patched : p));
    if (selectedPet?.id === pet.id) setSelectedPet(patched);
    // 씻기기 이펙트
    const washLines = ['개운해요! 🛁', '깨끗해졌어요! ✨', '상쾌해요~ 💧', '감사해요! 🧼', '몸이 가벼워요!'];
    showCareEffect(washLines);
    addPetExp(patched, 8);
  };

  // 놀아주기 (하루 2회)
  const playWithPet = async (pet) => {
    if ((pet.hunger ?? 100) <= 0) { showToast('먹이를 주면 다시 움직일 수 있어요 🍖', 'error'); return; }
    const care = getDailyCare(pet);
    if (care.playCount >= 2) { showToast('오늘 놀아주기를 이미 2번 했습니다!', 'error'); return; }
    if ((pet.energy ?? 100) < 15) { showToast('기력이 부족합니다! 내일 다시 시도하세요.', 'error'); return; }
    const newHap   = Math.min(100, (pet.happiness ?? 100) + 25);
    const newEng   = Math.max(0,   (pet.energy    ?? 100) - 15);
    const newAff   = (pet.affection ?? 0) + 5;
    const newCare  = { ...care, playCount: (care.playCount || 0) + 1 };
    const updates  = { happiness: newHap, energy: newEng, affection: newAff, dailyCare: newCare, lastCareAt: serverTimestamp(), lastHappinessDecay: serverTimestamp(), lastEnergyRecovery: serverTimestamp() };
    await updateDoc(doc(db, 'studentPets', pet.id), updates);
    const patched = { ...pet, ...updates, dailyCare: newCare };
    setPets(prev => prev.map(p => p.id === pet.id ? patched : p));
    if (selectedPet?.id === pet.id) setSelectedPet(patched);
    // 놀아주기 이펙트
    const playLines = ['신나요! 🎮', '같이 놀아서 행복해요! 🎉', '최고야! ⭐', '또 해요! 🥳', '재밌어요!!! 🎊'];
    showCareEffect(playLines, { anim: 'run' });
    addPetExp(patched, 10);
  };

  // 인큐베이터에서 알 꺼내기
  const removeFromIncubator = async (egg) => {
    await updateDoc(doc(db, 'studentEggs', egg.id), { isIncubating: false });
    setEggs(prev => prev.map(e => e.id === egg.id ? { ...e, isIncubating: false } : e));
    showToast('알을 인큐베이터에서 꺼냈습니다');
  };

  // 인큐베이터에 알 넣기
  const startIncubating = async (egg) => {
    // 이미 부화중인 알이 있으면 불가
    if (eggs.some(e => e.isIncubating)) {
      showToast('이미 부화 중인 알이 있습니다!', 'error'); return;
    }
    await updateDoc(doc(db, 'studentEggs', egg.id), { isIncubating: true });
    setEggs(prev => prev.map(e => e.id === egg.id ? { ...e, isIncubating: true } : e));
    showToast('인큐베이터에 넣었습니다! AI학습관에서 문제를 풀어보세요 🥚');
  };

  // 부화 실행
  const hatchEgg = async (egg) => {
    setHatchingEgg(egg);
    setHatchPhase('animating');

    // 부화 결과 결정
    const rarity = egg.eggType;
    const md = pickMonster(rarity);
    if (!md) { showToast('오류', 'error'); setHatchPhase('idle'); return; }

    const petData = {
      studentCode, teacherUid: student?.teacherUid || '',
      monsterId: md.id, nickname: md.name, rarity, tier: md.tier,
      level: 1, exp: 0, hunger: 100, happiness: 100, cleanliness: 100, energy: 100,
      stats: generateStats(rarity),
      isActive: false, obtainedFrom: 'hatch', obtainedAt: serverTimestamp(), lastHungerDecay: serverTimestamp(), lastHappinessDecay: serverTimestamp(), lastCleanlinessDecay: serverTimestamp(), lastEnergyRecovery: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, 'studentPets'), petData);
    const newPet = { id: ref.id, ...petData, monsterData: md };
    setPets(prev => [...prev, newPet]);

    // 알 부화 완료 처리
    await updateDoc(doc(db, 'studentEggs', egg.id), { hatched: true, isIncubating: false, resultPetId: ref.id });
    setEggs(prev => prev.filter(e => e.id !== egg.id));
    setHatchedPet(newPet);
  };

  const closeHatch = () => {
    setHatchPhase('idle');
    setHatchingEgg(null);
    setHatchedPet(null);
    setTab('myPets');
  };

  // 대표 설정
  const handleSetActive = async (petId) => {
    if (!student?.id) return;
    await updateDoc(doc(db, 'students', student.id), { activePetId: petId });
    setActivePetId(petId);
    showToast('대표 펫이 변경됐습니다! 🐾');
  };

  // 이름 변경
  const confirmRename = async () => {
    if (!renameInput.trim() || !renamePet) return;
    await updateDoc(doc(db, 'studentPets', renamePet.id), { nickname: renameInput.trim() });
    setPets(prev => prev.map(p => p.id === renamePet.id ? { ...p, nickname: renameInput.trim() } : p));
    setRenamePet(null);
    showToast('이름이 변경됐습니다!');
  };

  // 가챠 실행 — 알 획득 방식 (펫 직접 지급 X)
  const runGacha = async () => {
    if (!selectedEgg || !student) return;
    // 일반 알: 첫 구매 100💎, 이후 500💎
    const isNormal     = selectedEgg.id === 'normal';
    const firstBuy     = isNormal && !student.firstNormalEggPurchased;
    const actualCost   = firstBuy ? 100 : selectedEgg.cost;
    if ((student.diamonds || 0) < actualCost) {
      showToast(`다이아 부족! 필요: ${actualCost}💎`, 'error');
      return;
    }

    // 1. 결과 등급 결정 (동기)
    const rarity = rollRarity(selectedEgg);

    // 랜덤 프레임 이미지 선택 (등급별 512x512 폴더에서)
    const cfg = EGG_FRAMES[rarity] || EGG_FRAMES.common;
    const safeMax = Math.max(1, Math.floor(cfg.total * 0.5)); // 앞쪽 50% 프레임 (알이 온전한 단계)
    const randFrame = 1 + Math.floor(Math.random() * safeMax);
    const eggFrameImg = `/images/Eggs/${cfg.path}/512x512/${encodeURIComponent(`Egg ${randFrame}.png`)}`;

    // 2. 애니메이션 시작
    setGachaResult({ rarity, eggId: null, eggFrameImg });
    setHatchDone(false);
    setGachaPhase('hatching');

    // 3. 백그라운드 저장
    try {
      const newDiamonds = (student.diamonds || 0) - actualCost;
      const stuUpdates = { diamonds: newDiamonds };
      if (firstBuy) stuUpdates.firstNormalEggPurchased = true; // 첫 구매 기록
      await updateDoc(doc(db, 'students', student.id), stuUpdates);
      setStudent(p => ({ ...p, diamonds: newDiamonds, ...(firstBuy ? { firstNormalEggPurchased: true } : {}) }));

      const REQUIRED = { common:10, rare:20, epic:30, legendary:40, mythic:50 };
      const eggData = {
        studentCode, teacherUid: student.teacherUid || '',
        eggType: rarity,
        frameImg: eggFrameImg, // 선택된 512x512 프레임 이미지 저장
        currentClears: 0,
        requiredClears: REQUIRED[rarity] || 10,
        isIncubating: false,
        hatched: false,
        obtainedFrom: 'gacha',
        obtainedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'studentEggs'), eggData);
      setEggs(prev => [...prev, { id: ref.id, ...eggData }]);

      addDoc(collection(db, 'petGachaLogs'), {
        studentCode, teacherUid: student.teacherUid || '',
        eggType: selectedEgg.id, costDiamonds: selectedEgg.cost,
        resultEggId: ref.id, resultRarity: rarity,
        createdAt: serverTimestamp(),
      });

      // eggId 저장 완료 → effect에서 hatchDone과 조합해 result 전환
      setGachaResult({ rarity, eggId: ref.id, eggFrameImg });
    } catch (e) {
      console.error('가챠 저장 오류:', e);
      showToast('저장 오류가 발생했습니다', 'error');
      setGachaPhase('idle');
    }
  };

  const closeGacha = () => { setGachaPhase('idle'); setSelectedEgg(null); setGachaResult(null); };

  // ── 가챠 전체화면 ──────────────────────────────────────────
  // ── 알 부화 애니메이션 전체화면 ──────────────────────────────
  if (hatchPhase === 'animating' || hatchPhase === 'result') {
    const theme = RARITY_THEME[hatchingEgg?.eggType] || RARITY_THEME.common;
    return (
      <div className="min-h-screen flex items-center justify-center p-6"
        style={{ background: `radial-gradient(ellipse at 50% 40%, ${theme.glow}30, #0f172a 65%)` }}>
        <div className="w-full max-w-sm text-center">
          {hatchPhase === 'animating' && (
            <>
              <p className="text-white font-extrabold text-xl mb-4 animate-pulse">부화 중...✨</p>
              <EggHatchAnim eggType={hatchingEgg.eggType} onComplete={() => setHatchPhase('result')} />
              <p className="text-slate-400 text-sm mt-2">
                {(RARITY[hatchingEgg?.eggType] || RARITY.common).badge} {(RARITY[hatchingEgg?.eggType] || RARITY.common).label} 알
              </p>
            </>
          )}
          {hatchPhase === 'result' && hatchedPet && (() => {
            const { monsterData: md, rarity } = hatchedPet;
            const r = RARITY[rarity];
            const burstCount = rarity === 'mythic' ? 80 : rarity === 'legendary' ? 64 : rarity === 'epic' ? 52 : 40;
            return (
              <div className="relative">
                <ParticleBurst color={theme.glow} count={burstCount} />
                <ParticleBurst color="#ffffff" count={Math.floor(burstCount / 3)} />
                <p className="relative text-white font-extrabold text-3xl mb-2 animate-bounce">🐣 부화 성공!</p>
                <span className={`inline-block text-sm font-extrabold px-4 py-1.5 rounded-full mb-4 ${r.bg} ${r.text} border ${r.border}`}
                  style={{ boxShadow: `0 0 12px ${theme.glow}60` }}>
                  {r.badge} {r.label}
                </span>
                <div className="flex justify-center items-end mb-3" style={{ height: 150 }}>
                  <div style={{ filter: `drop-shadow(0 0 16px ${theme.glow})` }}>
                    <SpriteMonster data={md} anim="idle"
                      scale={Math.min(md.scale * 3, 150 / (md.frameHeight || 120))} />
                  </div>
                </div>
                <p className="text-white font-extrabold text-xl mb-1">{hatchedPet.nickname}</p>
                <div className="flex flex-wrap justify-center gap-1.5 mb-5">
                  {formatStats(hatchedPet.stats || {}).map((line, i) => (
                    <span key={i} className="text-[11px] bg-white/15 text-white px-2.5 py-1 rounded-full font-bold">{line}</span>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { handleSetActive(hatchedPet.id); closeHatch(); }}
                    className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold rounded-2xl">
                    대표 펫으로 설정
                  </button>
                  <button onClick={closeHatch}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl">
                    펫 목록 보기
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  if (gachaPhase === 'hatching' || gachaPhase === 'result') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-950 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          {gachaPhase === 'hatching' && (
            <HatchAnim
              egg={selectedEgg}
              rarity={gachaResult?.rarity || 'common'}
              eggFrameImg={gachaResult?.eggFrameImg}
              onDone={() => setHatchDone(true)}
            />
          )}
          {gachaPhase === 'result' && gachaResult?.eggId && (() => {
            const { rarity } = gachaResult;
            const r = RARITY[rarity];
            const theme = RARITY_THEME[rarity] || RARITY_THEME.common;
            const burstCount = rarity === 'mythic' ? 80 : rarity === 'legendary' ? 64 : rarity === 'epic' ? 52 : 40;
            const REQUIRED = { common:10, rare:20, epic:30, legendary:40, mythic:50 };
            return (
              <div className="relative text-center">
                <ParticleBurst color={theme.glow} count={burstCount} />
                <ParticleBurst color="#ffffff" count={Math.floor(burstCount / 3)} />
                <p className="relative text-white font-extrabold text-3xl mb-2 animate-bounce">🥚 알 획득!</p>
                <span className={`inline-block text-sm font-extrabold px-4 py-1.5 rounded-full mb-5 ${r.bg} ${r.text} border ${r.border}`}
                  style={{ boxShadow: `0 0 12px ${theme.glow}60` }}>
                  {r.badge} {r.label}
                </span>
                {/* 알 이미지 — 랜덤 프레임 (없으면 gacha 이미지 fallback) */}
                <div className="flex justify-center mb-4"
                  style={{ filter: `drop-shadow(0 0 24px ${theme.glow})` }}>
                  <img
                    src={gachaResult.eggFrameImg || RARITY_EGG_IMG[rarity]}
                    alt={r.label}
                    className="w-40 h-40 object-contain animate-bounce"
                    onError={e => { e.target.src = RARITY_EGG_IMG[rarity]; }}
                  />
                </div>
                <p className="text-white/80 text-sm font-bold mb-1">알 인벤토리에 추가됐습니다!</p>
                <p className="text-slate-400 text-xs mb-6">
                  AI학습관 문제 {REQUIRED[rarity]}회 완료 후 부화 가능
                </p>
                <div className="flex gap-3">
                  <button onClick={() => { setTab('hatch'); closeGacha(); }}
                    className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold rounded-2xl text-sm">
                    🥚 알 부화 탭으로 →
                  </button>
                  <button onClick={closeGacha}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl text-sm">
                    계속 뽑기
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 p-4 pb-24">
      {/* ── 케어 이펙트 fixed 오버레이 (항상 화면 중앙에 표시) ── */}
      {(petBubble || showHearts) && (
        <div className="fixed inset-0 pointer-events-none z-[9999]">
          {petBubble && (
            <div
              className="absolute bg-white text-slate-800 text-lg font-extrabold px-6 py-3 rounded-3xl shadow-2xl border-2 border-slate-200 animate-bounce whitespace-nowrap"
              style={{
                left: careEffectPos?.x ?? '50%',
                top: careEffectPos?.top ?? '50%',
                transform: 'translate(-50%, -100%)',
              }}
            >
              {petBubble}
              <div style={{ position:'absolute', bottom:-8, left:'50%', transform:'translateX(-50%) rotate(45deg)', width:14, height:14, background:'white', borderRight:'2px solid #e2e8f0', borderBottom:'2px solid #e2e8f0' }} />
            </div>
          )}
          {showHearts && (
            <div
              className="absolute w-32 h-32"
              style={{
                left: careEffectPos?.x ?? '50%',
                top: careEffectPos?.middle ?? '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
                {['💕','❤️','💖','✨','💝','🌟'].map((h, i) => (
                  <span key={i} style={{
                    position:'absolute',
                    left: `${10 + i * 15}%`,
                    bottom: 0,
                    fontSize: 20 + (i % 3) * 6,
                    animation: `petFloatUp${i % 3} 1.5s ease-out ${i * 0.18}s forwards`,
                    opacity: 0,
                  }}>{h}</span>
                ))}
                <style>{`
                  @keyframes petFloatUp0 { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-80px) scale(1.2) rotate(-12deg)} }
                  @keyframes petFloatUp1 { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-95px) scale(1.3) rotate(10deg)} }
                  @keyframes petFloatUp2 { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-65px) scale(1.1) rotate(-6deg)} }
                `}</style>
            </div>
          )}
        </div>
      )}
      <div className="w-full max-w-[1240px] mx-auto px-3 sm:px-5">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-black text-white">🐾 펫 하우스</h1>
            <p className="text-indigo-300/70 text-xs mt-1">함께 성장할 대표 펫을 돌보고 관리하세요</p>
          </div>
          <div className="flex items-center gap-2 bg-indigo-900/60 border border-indigo-600/80 px-4 py-2 rounded-xl shadow-lg shadow-indigo-950/30">
            <span>💎</span>
            <span className="text-white font-black text-sm">{student?.diamonds ?? '--'}</span>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-5 border-b border-indigo-900/70 pb-4">
          {[{ id: 'myPets', label: '🐾 내 펫' }, { id: 'hatch', label: '🥚 알 부화' }, { id: 'gacha', label: '💎 펫 알 뽑기' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 rounded-xl font-extrabold text-sm transition-all
                ${tab === t.id ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-950/30' : 'bg-indigo-900/40 text-indigo-300 hover:bg-indigo-900/70 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 내 펫 */}
        {tab === 'myPets' && (() => {
          // 티어별 상세 패널 표시 높이
          const DETAIL_H = { tiny:125, small:145, medium:175, large:225, boss:255 };
          // 티어별 목록 썸네일 높이
          const LIST_H   = { tiny:40, small:50, medium:62, large:78, boss:88 };

          const sp = selectedPet ? pets.find(p => p.id === selectedPet.id) || selectedPet : pets[0] || null;
          const spMd = sp ? MONSTERS_DB[sp.monsterId] : null;

          // 목록에서 선택 없으면 첫 번째 자동 선택
          if (!selectedPet && pets.length > 0 && !loading) {
            setTimeout(() => setSelectedPet(pets[0]), 0);
          }

          if (loading) return <div className="text-center py-16 text-indigo-300 text-sm">불러오는 중...</div>;
          if (pets.length === 0) return (
            <div className="text-center py-16">
              <div className="text-6xl mb-3">🥚</div>
              <p className="text-white font-extrabold text-lg mb-1">아직 펫이 없어요!</p>
              <p className="text-indigo-300 text-sm mb-5">펫 알 뽑기 또는 퀴즈 던전에서 획득하세요</p>
              <button onClick={() => setTab('gacha')}
                className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold rounded-2xl">
                펫 알 뽑기 →
              </button>
            </div>
          );

          return (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[280px_350px_minmax(0,1fr)]">

              {/* 정보 카드 + 조작 카드 */}
              {sp && spMd ? (() => {
                const r = RARITY[sp.rarity] || RARITY.common;
                const isMythic = sp.rarity === 'mythic';
                const isActive = sp.id === activePetId;
                const dh = DETAIL_H[spMd.tier] || 100;
                const dScale = dh / (spMd.frameHeight || 120);
                const lv = getPetLevel(sp.petExp ?? 0);
                const mult = getPetStatMultiplier(lv);
                const baseStats = sp.stats || {};
                const aff = sp.affection ?? 0;
                // 친밀도 500+ 특기 강화: 레벨 배율 적용 후 추가 +20%
                const affBoost = aff >= 500 ? 1.2 : 1.0;
                const effStats = Object.fromEntries(Object.entries(baseStats).map(([k, v]) => [k, Math.floor(v * mult * affBoost)]));
                const isDead = (sp.hunger ?? 100) <= 0;
                const { level, current, needed, pct } = getLevelProgress(sp.petExp ?? 0);
                const title = getAffectionTitle(aff);
                const hunger = sp.hunger ?? 100;
                const happiness = sp.happiness ?? 100;
                const care = getDailyCare(sp);
                const dialogue = getPetDialogue(sp);
                const clean = sp.cleanliness ?? 100;
                const energy = sp.energy ?? 100;
                const nextMs = AFFECTION_MILESTONES.find(m => m.val > aff);
                const currentAnim = isDead ? 'death' : (detailAnim === 'attack' && !spMd.animations?.attack ? 'run' : detailAnim);
                const bar = (v, bg) => (
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${v}%`, background: bg }} />
                  </div>
                );
                return (
                  <>
                    {/* 정보 카드 */}
                    <section className="bg-slate-800/75 border border-slate-700 rounded-2xl flex flex-col overflow-hidden p-5 items-center shadow-xl shadow-slate-950/20">
                      <div className="w-full flex items-center justify-between mb-3">
                        <div>
                          <p className="text-[10px] font-extrabold text-indigo-300">선택한 펫</p>
                          <p className="text-xs font-bold text-slate-500">상세 정보와 능력치</p>
                        </div>
                        {isActive && <span className={`text-[9px] font-extrabold px-2 py-1 rounded-full border ${r.bg} ${r.text} ${r.border}`}>★ 대표 펫</span>}
                      </div>
                      <div ref={detailPetRef} className="w-full flex justify-center items-end mb-3 cursor-pointer rounded-2xl border border-slate-700/80 bg-gradient-to-b from-indigo-950/20 to-slate-900/60"
                        style={{ height: dh + 10, filter: isMythic ? 'drop-shadow(0 0 10px #f43f5e)' : `drop-shadow(0 0 8px ${RARITY_THEME[sp.rarity]?.glow || '#60a5fa'})`, opacity: isDead ? 0.5 : 1 }}
                        onClick={() => !isDead && setDetailAnim(a => a === 'idle' ? 'attack' : 'idle')}>
                        <SpriteMonster data={spMd} anim={currentAnim} scale={dScale} onAnimEnd={() => !isDead && setDetailAnim('idle')} />
                      </div>
                      {isDead && <p className="text-rose-400 text-[10px] font-bold text-center mb-1 animate-pulse">🍖 먹이가 필요해요</p>}
                      <p className="text-white font-black text-lg mb-0.5 text-center w-full truncate">{sp.nickname || spMd.name}</p>
                      <p className={`text-[11px] font-bold ${r.text} mb-3 text-center`}>{r.badge} {r.label}</p>
                      <div className="w-full space-y-1 mb-2">
                        {Object.entries(baseStats).filter(([, v]) => v > 0).map(([k, base], i) => {
                          const eff = effStats[k] || 0;
                          const meta = STATS_META[k];
                          const unit = k === 'crit' ? '%' : '';
                          return (
                            <div key={i} className="bg-slate-700/70 border border-slate-600/70 rounded-lg px-2.5 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 text-slate-100 text-[11px] font-extrabold truncate">
                                  <span className="mr-1">{meta?.icon}</span>{meta?.label || k}
                                </span>
                                <span className="text-white text-[12px] font-black">+{eff}{unit}</span>
                              </div>
                              <div className="mt-0.5 text-right text-[9px] font-bold text-slate-400">
                                기본 +{base}{unit}
                              </div>
                            </div>
                          );
                        })}
                        {Object.entries(baseStats).filter(([, v]) => v > 0).length === 0 && (
                          <div className="bg-slate-700/70 border border-slate-600/70 rounded-lg px-2.5 py-2 text-center text-[11px] font-bold text-slate-300">
                            능력치 없음
                          </div>
                        )}
                      </div>
                      <div className="w-full bg-slate-800/60 rounded-xl p-2 mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-extrabold text-indigo-300">Lv.{level}</span>
                          {title && <span className="text-[9px] font-bold text-amber-400">{title}</span>}
                        </div>
                        {level < MAX_PET_LEVEL ? (
                          <>
                            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[9px] text-slate-500 text-right mt-0.5">{current}/{needed} EXP</p>
                          </>
                        ) : <p className="text-[9px] text-amber-400 text-center">✨ MAX</p>}
                        {lv > 1 && <p className="text-[9px] text-indigo-500 text-right">×{mult.toFixed(2)}{aff>=500?' ×1.2⚡':''}</p>}
                      </div>
                      <div className="w-full space-y-1.5">
                        {!isActive && (
                          <button onClick={() => handleSetActive(sp.id)}
                            className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold rounded-xl text-xs">
                            ⭐ 대표 펫
                          </button>
                        )}
                        {aff >= 50 ? (
                          <button onClick={() => { setRenamePet(sp); setRenameInput(sp.nickname || ''); }}
                            className="w-full py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold rounded-xl text-xs">
                            이름 변경
                          </button>
                        ) : (
                          <p className="text-[9px] text-slate-600 text-center">이름 변경 (친밀도 {50 - aff} 남음)</p>
                        )}
                      </div>
                      <p className="text-slate-500 text-[9px] text-center mt-3">펫을 눌러 움직임을 확인하세요</p>
                    </section>

                    {/* 조작 카드 */}
                    <section className="bg-slate-800/75 border border-slate-700 rounded-2xl flex flex-col p-5 shadow-xl shadow-slate-950/20">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-black text-white">오늘의 돌봄</p>
                          <p className="text-[10px] font-bold text-slate-500">상태를 확인하고 펫과 교감하세요</p>
                        </div>
                        <span className="rounded-full bg-slate-700 px-2.5 py-1 text-[10px] font-extrabold text-slate-300">
                          Lv.{level}
                        </span>
                      </div>
                      <div className="bg-slate-700/50 border border-slate-600/60 rounded-xl px-3 py-2.5 text-center text-xs text-slate-200 font-bold italic mb-4">
                        💬 "{dialogue}"
                      </div>
                      <div className="mb-2">
                        <div className="flex justify-between mb-1">
                          <span className="text-[11px] text-slate-300 font-bold">🍖 배고픔</span>
                          <span className={`text-[10px] font-bold ${hunger < 20 ? 'text-rose-400 animate-pulse' : hunger < 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {hunger}/100 ({care.feedCount}/3)
                          </span>
                        </div>
                        {bar(hunger, hunger >= 70 ? '#34d399' : hunger >= 40 ? '#fbbf24' : '#f87171')}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-1.5 mb-4">
                        {FOOD_OPTIONS.map(food => {
                          const bal = food.costType === 'gold' ? (student?.gold || 0) : (student?.diamonds || 0);
                          const noMoney = bal < food.cost;
                          const full = hunger >= 100;
                          const maxed = care.feedCount >= 3;
                          return (
                            <button key={food.id} onClick={() => feedPet(sp, food).catch(error => {
                              console.error('[PetHouse] feed failed:', error);
                              showToast('먹이주기에 실패했습니다. 다시 시도해주세요.', 'error');
                            })}
                              disabled={noMoney || full || maxed}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all
                                ${noMoney || full || maxed ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-700 hover:bg-amber-600 hover:text-white text-slate-200'}`}>
                              <span>{food.emoji} {food.name}</span>
                              <span className="opacity-70">{food.cost}{food.costType === 'gold' ? '🪙' : '💎'}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mb-2">
                        <div className="flex justify-between mb-1">
                          <span className="text-[11px] text-slate-300 font-bold">💝 행복도</span>
                          <span className={`text-[10px] font-bold ${happiness < 20 ? 'text-rose-400' : happiness < 50 ? 'text-amber-400' : 'text-sky-400'}`}>
                            {happiness}/100 ({care.petCount}/3)
                          </span>
                        </div>
                        {bar(happiness, happiness >= 70 ? '#38bdf8' : happiness >= 40 ? '#fbbf24' : '#f87171')}
                      </div>
                      <button onClick={() => (isDead ? feedPet(sp, FOOD_OPTIONS[0]) : petThePet(sp)).catch(error => {
                        console.error('[PetHouse] care failed:', error);
                        showToast('펫 돌보기에 실패했습니다. 다시 시도해주세요.', 'error');
                      })}
                        disabled={!isDead && (care.petCount >= 3 || happiness >= 100)}
                        className={`w-full py-2 rounded-xl font-extrabold text-xs mb-3 transition-all
                          ${isDead ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg' : care.petCount >= 3 || happiness >= 100 ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-pink-500 hover:bg-pink-400 text-white shadow-lg'}`}>
                        {isDead ? '🍖 먹이 필요' : care.petCount >= 3 ? '💝 완료' : `💝 쓰다듬기 (${3 - care.petCount}회)`}
                      </button>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-slate-800/60 rounded-xl p-2">
                          <div className="flex justify-between mb-1">
                            <span className="text-[10px] text-slate-300 font-bold">🛁 청결</span>
                            <span className="text-[9px] text-slate-400">{clean}</span>
                          </div>
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${clean}%` }} />
                          </div>
                        </div>
                        <div className="bg-slate-800/60 rounded-xl p-2">
                          <div className="flex justify-between mb-1">
                            <span className="text-[10px] text-slate-300 font-bold">⚡ 기력</span>
                            <span className="text-[9px] text-slate-400">{energy}</span>
                          </div>
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${energy}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <button onClick={() => washPet(sp).catch(error => {
                          console.error('[PetHouse] wash failed:', error);
                          showToast('씻기기에 실패했습니다. 다시 시도해주세요.', 'error');
                        })}
                          disabled={isDead || care.washCount >= 1 || clean >= 100}
                          className={`py-2 rounded-xl font-bold text-xs transition-all
                            ${isDead || care.washCount >= 1 || clean >= 100 ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-cyan-500 hover:bg-cyan-400 text-white'}`}>
                          {isDead ? '🍖' : care.washCount >= 1 ? '🛁 완료' : '🛁 씻기기'}
                        </button>
                        <button onClick={() => playWithPet(sp).catch(error => {
                          console.error('[PetHouse] play failed:', error);
                          showToast('놀아주기에 실패했습니다. 다시 시도해주세요.', 'error');
                        })}
                          disabled={isDead || care.playCount >= 2 || energy < 15}
                          className={`py-2 rounded-xl font-bold text-xs transition-all
                            ${isDead || care.playCount >= 2 || energy < 15 ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-violet-500 hover:bg-violet-400 text-white'}`}>
                          {isDead ? '🍖' : care.playCount >= 2 ? '🎮 완료' : `🎮 놀기(${2 - care.playCount})`}
                        </button>
                      </div>
                      <div className="bg-slate-900/45 border border-slate-700/70 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] text-slate-300 font-extrabold">🤝 친밀도</span>
                          <span className="text-[10px] text-amber-400 font-extrabold">{aff} / {nextMs?.val || 'MAX'}</span>
                        </div>
                        {nextMs && (
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${Math.min(100, (aff / nextMs.val) * 100)}%` }} />
                          </div>
                        )}
                        <div className="space-y-1">
                          {AFFECTION_MILESTONES.map(m => {
                            const unlocked = aff >= m.val;
                            const isCurrent = nextMs?.val === m.val;
                            return (
                              <div key={m.val} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg
                                ${unlocked ? 'bg-amber-500/20 border border-amber-500/40' : isCurrent ? 'bg-slate-700/50 border border-slate-500 border-dashed' : 'bg-slate-800/40 border border-slate-700/50'}`}>
                                <span className={`text-sm shrink-0 ${unlocked ? '' : 'opacity-40'}`}>{m.emoji}</span>
                                <p className={`text-[10px] font-bold flex-1 truncate ${unlocked ? 'text-amber-300' : 'text-slate-400'}`}>{m.label}</p>
                                <span className={`text-[9px] font-extrabold shrink-0 ${unlocked ? 'text-amber-400' : isCurrent ? 'text-slate-400' : 'text-slate-600'}`}>
                                  {unlocked ? '✅' : m.val}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {nextMs && <p className="text-[9px] text-slate-400 text-center mt-1.5">다음까지 <span className="text-amber-400 font-bold">{nextMs.val - aff}</span> 필요</p>}
                      </div>
                      <p className="text-[9px] text-slate-500 text-center mt-3">⚔️ 대표 펫으로 설정하면 능력치가 적용됩니다</p>
                    </section>
                  </>
                );
              })() : (
                <>
                  <div className="bg-slate-800/40 border border-slate-700 rounded-2xl flex items-center justify-center min-h-52">
                    <p className="text-slate-600 text-xs text-center p-4">펫을 선택하세요</p>
                  </div>
                  <div className="bg-slate-800/40 border border-slate-700 rounded-2xl min-h-52" />
                </>
              )}

              {/* ── 오른쪽: 3열 그리드 목록 ─────────────────────── */}
              <section className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4 lg:col-span-2 xl:col-span-1 shadow-xl shadow-slate-950/20">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-black text-white">보유 펫</p>
                    <p className="text-[10px] font-bold text-slate-500">펫을 선택해 상세 정보와 돌봄 상태를 확인하세요</p>
                  </div>
                  <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-[10px] font-extrabold text-indigo-300">
                    {pets.length}마리
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-2">
                  {pets.map(pet => {
                    const md    = MONSTERS_DB[pet.monsterId];
                    const r     = RARITY[pet.rarity] || RARITY.common;
                    const lh    = LIST_H[md?.tier] || 36;
                    const lScale = md ? lh / (md.frameHeight || 120) : 0.3;
                    const isSel = sp?.id === pet.id;
                    const isAct = pet.id === activePetId;
                    return (
                      <button key={pet.id}
                        onClick={() => { setSelectedPet(pet); setDetailAnim('idle'); }}
                        className={`relative flex min-h-[154px] flex-col items-center justify-end px-2 py-3 rounded-xl border transition-all
                          ${isSel ? 'border-indigo-400 bg-indigo-900/60 shadow-lg shadow-indigo-950/30 ring-1 ring-indigo-500/30' : 'border-slate-700 bg-slate-900/45 hover:border-slate-500 hover:bg-slate-700/50'}`}>
                        {isAct && (
                          <span className="absolute left-2 top-2 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[8px] font-black text-amber-300">
                            대표
                          </span>
                        )}
                        {/* 티어별 크기 스프라이트 */}
                        <div className="flex items-end justify-center mb-1.5 overflow-hidden"
                          style={{ height: 96, width: '100%' }}>
                          {md && <SpriteMonster data={md} anim="idle" scale={lScale} />}
                        </div>
                        {/* 이름 + 등급 */}
                        <div className="w-full text-center">
                          <div className="flex items-center justify-center gap-0.5 mb-0.5">
                            <p className="text-slate-200 text-[10px] font-extrabold truncate max-w-full">{pet.nickname || md?.name}</p>
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <p className={`text-[9px] font-bold ${r.text}`}>{r.badge} {r.label}</p>
                            <span className="text-[9px] text-indigo-300 font-bold">Lv.{getPetLevel(pet.petExp ?? 0)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          );
        })()}

        {/* 알 부화 탭 */}
        {tab === 'hatch' && (() => {
          const incubating = eggs.find(e => e.isIncubating);
          const inventory  = eggs.filter(e => !e.isIncubating);

          // 부화 애니메이션 전체화면은 return 상위에서 처리
          return (
            <div className="space-y-4">
              {/* 인큐베이터 슬롯 */}
              <>
              <style>{`
                @keyframes eggWobble {
                  0%,100%{transform:rotate(0deg) scale(1)}
                  15%{transform:rotate(-10deg) scale(1.06)}
                  30%{transform:rotate(10deg) scale(0.97)}
                  50%{transform:rotate(-7deg) scale(1.04)}
                  70%{transform:rotate(7deg) scale(0.98)}
                  85%{transform:rotate(-4deg) scale(1.02)}
                }
                .egg-wobble { animation: eggWobble 1.6s ease-in-out infinite; }
              `}</style>
              <div className="bg-slate-800/60 border border-slate-600 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white font-extrabold text-sm">🔮 인큐베이터 슬롯 (1/1)</p>
                  {incubating && (
                    <button
                      onClick={() => removeFromIncubator(incubating)}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-700 text-slate-300 hover:bg-rose-700 hover:text-white transition-colors">
                      꺼내기 ✕
                    </button>
                  )}
                </div>
                {incubating ? (() => {
                  const r = RARITY[incubating.eggType] || RARITY.common;
                  const req = REQUIRED_CLEARS[incubating.eggType] || 10;
                  const cur = incubating.currentClears || 0;
                  const pct = Math.min(100, Math.round((cur / req) * 100));
                  const ready = cur >= req;
                  const gachaFallback = `/images/Eggs/Egg_${incubating.eggType.charAt(0).toUpperCase() + incubating.eggType.slice(1)}_Gacha.png`;
                  const gImg = incubating.frameImg || gachaFallback;
                  return (
                    <div className="flex items-center gap-4">
                      <img src={gImg} alt="" className={`w-16 h-16 object-contain shrink-0 ${ready ? 'animate-bounce' : 'egg-wobble'}`}
                        onError={e => { e.target.src = gachaFallback; }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm">{r.badge} {r.label} 알 부화 중</p>
                        <div className="flex items-center gap-2 mt-1 mb-1">
                          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${ready ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-slate-400 shrink-0">{cur}/{req}</span>
                        </div>
                        <p className="text-[11px] text-slate-400">AI학습관 문제 풀기로 진행</p>
                        {ready ? (
                          <button onClick={() => hatchEgg(incubating)}
                            className="mt-2 w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold text-sm animate-pulse">
                            ✨ 지금 부화하기!
                          </button>
                        ) : (
                          <p className="text-[11px] text-emerald-400 mt-1">
                            {req - cur}회 더 풀면 부화 가능!
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="text-center py-4 text-slate-500 text-sm">
                    <p>슬롯이 비어 있습니다</p>
                    <p className="text-xs mt-1">아래 알 인벤토리에서 알을 넣어주세요</p>
                  </div>
                )}
              </div>
              </>

              {/* 알 인벤토리 */}
              <div>
                <p className="text-slate-400 text-xs font-bold mb-2">알 인벤토리 ({inventory.length}개)</p>
                {inventory.length === 0 ? (
                  <div className="text-center py-8 text-slate-600 text-sm">
                    <p>보유한 알이 없습니다</p>
                    <p className="text-xs mt-1">퀴즈 던전 클리어 시 낮은 확률로 획득</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {inventory.map(egg => (
                      <EggInventoryCard key={egg.id} egg={egg}
                        isIncubating={false}
                        onIncubate={startIncubating}
                        onDiscard={discardEgg}
                        rarity={RARITY[egg.eggType]}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* 가챠 */}
        {tab === 'gacha' && (
          <div className="space-y-3">
            {EGGS.map(egg => {
              const isNormalFirst = egg.id === 'normal' && !student?.firstNormalEggPurchased;
              const displayCost   = isNormalFirst ? 100 : egg.cost;
              return (
              <div key={egg.id} className={`rounded-2xl bg-gradient-to-r ${egg.gradient} shadow-lg p-4`}>
                <div className="flex items-center gap-4">
                  <img src={egg.img} alt={egg.name} className="w-14 h-14 object-contain shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-extrabold text-sm">{egg.name}</p>
                      {isNormalFirst && (
                        <span className="text-[10px] font-extrabold bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full">첫 구매 특가!</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {egg.rateRows.map(row => (
                        <span key={row.label} className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded-full font-bold">
                          {row.label} {row.pct}%
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {isNormalFirst && (
                      <p className="text-white/50 text-xs line-through">{egg.cost.toLocaleString()}</p>
                    )}
                    <p className="text-white font-extrabold text-lg">{displayCost.toLocaleString()}</p>
                    <p className="text-white/60 text-xs">💎 다이아</p>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedEgg(egg); setGachaPhase('confirm'); }}
                  disabled={(student?.diamonds || 0) < displayCost}
                  className="w-full mt-3 py-2.5 bg-white/25 hover:bg-white/35 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-xl text-sm transition-colors">
                  {(student?.diamonds || 0) < displayCost
                    ? `💎 ${displayCost - (student?.diamonds || 0)} 부족`
                    : '🥚 뽑기!'}
                </button>
              </div>
              );
            })}
            <p className="text-center text-indigo-400/50 text-xs pt-2">
              다이아는 퀘스트·퀴즈 던전에서 획득 가능합니다
            </p>
          </div>
        )}
      </div>

      {/* 확인 모달 */}
      {gachaPhase === 'confirm' && selectedEgg && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4 pb-8">
          <div className="w-full max-w-sm bg-slate-800 border border-slate-600 rounded-3xl p-6 text-center">
            <img src={selectedEgg.img} alt={selectedEgg.name} className="w-20 h-20 object-contain mx-auto mb-2" />
            <p className="text-white font-extrabold text-lg mb-1">{selectedEgg.name}</p>
            {(() => {
              const isFirst = selectedEgg.id === 'normal' && !student?.firstNormalEggPurchased;
              const cost    = isFirst ? 100 : selectedEgg.cost;
              return (
                <>
                  {isFirst && <p className="text-yellow-400 text-xs font-extrabold mb-1">🎉 첫 구매 특가 100💎!</p>}
                  <p className="text-indigo-300 text-sm mb-5">
                    보유: {student?.diamonds ?? 0}💎 → 구매 후: {(student?.diamonds || 0) - cost}💎
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setGachaPhase('idle')}
                      className="flex-1 py-3 bg-slate-700 text-slate-300 font-bold rounded-2xl">취소</button>
                    <button onClick={runGacha}
                      className={`flex-1 py-3 bg-gradient-to-r ${selectedEgg.gradient} text-white font-extrabold rounded-2xl`}>
                      {cost.toLocaleString()}💎 사용
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* 이름 변경 모달 */}
      {renamePet && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-xs bg-slate-800 border border-slate-600 rounded-3xl p-6">
            <p className="text-white font-extrabold text-lg mb-4 text-center">이름 변경</p>
            <input
              className="w-full bg-slate-700 text-white rounded-xl px-4 py-3 text-sm mb-4 outline-none border border-slate-500 focus:border-indigo-400"
              placeholder="새 이름 (최대 8자)"
              value={renameInput} onChange={e => setRenameInput(e.target.value)}
              maxLength={8} autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setRenamePet(null)}
                className="flex-1 py-2.5 bg-slate-700 text-slate-300 font-bold rounded-2xl text-sm">취소</button>
              <button onClick={confirmRename}
                className="flex-1 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold rounded-2xl text-sm">
                변경
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500' : 'bg-indigo-500'} text-white`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
