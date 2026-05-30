import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, addDoc, updateDoc,
  query, where, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase';
import SpriteMonster from '../../components/SpriteMonster';
import { MONSTERS_DB } from '../../data/monsterData';

// ── 펫 등급 (5단계) ──────────────────────────────────────────
const RARITY = {
  common:    { label: '일반',   badge: '⚪', bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-300',   tierKey: 'tiny'   },
  rare:      { label: '희귀',   badge: '🔵', bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-300',    tierKey: 'small'  },
  epic:      { label: '영웅',   badge: '🟣', bg: 'bg-purple-50',   text: 'text-purple-700',  border: 'border-purple-300',  tierKey: 'medium' },
  legendary: { label: '전설',   badge: '🟡', bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-300',   tierKey: 'large'  },
  mythic:    { label: '신화',   badge: '🌈', bg: 'bg-rose-50',     text: 'text-rose-600',    border: 'border-rose-400',    tierKey: 'boss'   },
};

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
          src={`/images/Eggs/${cfg.path}/512x512/Egg ${frame}.png`}
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
function EggInventoryCard({ egg, isIncubating, onIncubate, rarity }) {
  const r = RARITY[egg.eggType] || RARITY.common;
  const required = REQUIRED_CLEARS[egg.eggType] || 10;
  const current  = egg.currentClears || 0;
  const ready    = current >= required;
  const cfg = EGG_FRAMES[egg.eggType] || EGG_FRAMES.common;
  const gachaImg = `/images/Eggs/Egg_${egg.eggType.charAt(0).toUpperCase() + egg.eggType.slice(1)}_Gacha.png`;

  return (
    <div className={`rounded-2xl border-2 p-3 transition-all text-center
      ${isIncubating ? `${r.border} bg-slate-800 shadow-lg` : 'border-slate-700 bg-slate-800/50'}`}>
      <img src={gachaImg} alt={r.label} className="w-14 h-14 object-contain mx-auto mb-1"
        onError={e => { e.target.style.display='none'; }} />
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
            className="w-full text-[10px] font-bold py-1 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600">
            인큐베이터 넣기
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
    rates: { common: 0, rare: 37, epic: 50, legendary: 10, mythic: 3 },
    rateRows: [{ label: '희귀 🔵', pct: 37 }, { label: '영웅 🟣', pct: 50 }, { label: '전설 🟡', pct: 10 }, { label: '신화 🌈', pct: 3 }],
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
function HatchAnim({ egg, rarity, onDone }) {
  // stage 0→1→2→3→4→5
  // 0: 대기   1: 약한 흔들기(0-1.2s)  2: 강한 흔들기(1.2-2.8s)
  // 3: 균열(2.8-3.4s)  4: 폭발(3.4-4.0s)  5: 등장(4.0s+, onDone 1.5s후)
  const [stage, setStage] = useState(0);
  const [tick, setTick]   = useState(0);
  const [flash, setFlash] = useState(false);
  const theme = RARITY_THEME[rarity] || RARITY_THEME.common;

  useEffect(() => {
    const T = [
      setTimeout(() => setStage(1), 100),
      setTimeout(() => setStage(2), 1200),
      setTimeout(() => setStage(3), 2800),
      setTimeout(() => {
        setStage(4);
        setFlash(true);
        setTimeout(() => setFlash(false), 400);
      }, 3400),
      setTimeout(() => { setStage(5); setTimeout(onDone, 1600); }, 4000),
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

  const msgs = ['', '부화 중...', '🔥 곧 나온다!', '💢 균열 발생!', '💥 CRACK!', theme.label];

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

      {/* 알 */}
      {stage < 5 && (
        <div className="relative z-10 select-none" style={{ ...eggStyle, width: 120, height: 120 }}>
          <img src={egg.img} alt={egg.name} className="w-full h-full object-contain" draggable={false} />
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
  const TIER_H = { tiny: 38, small: 54, medium: 76, large: 100, boss: 100 };
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
  const [hatchPhase,  setHatchPhase]  = useState('idle'); // idle|animating|result
  const [hatchingEgg, setHatchingEgg] = useState(null);
  const [hatchedPet,  setHatchedPet]  = useState(null);

  const [gachaPhase, setGachaPhase]   = useState('idle'); // idle|confirm|hatching|result
  const [selectedEgg, setSelectedEgg] = useState(null);
  const [gachaResult, setGachaResult] = useState(null);
  const [hatchDone, setHatchDone]     = useState(false);  // 애니 완료 여부

  // 애니 완료 + 데이터 준비 둘 다 됐을 때 result로 전환
  useEffect(() => {
    if (hatchDone && gachaResult?.pet) {
      setGachaPhase('result');
      setHatchDone(false);
    }
  }, [hatchDone, gachaResult]);

  const [renamePet, setRenamePet]   = useState(null);
  const [renameInput, setRenameInput] = useState('');

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
      setPets(petSnap.docs.map(d => ({ id: d.id, ...d.data() })));

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
      level: 1, exp: 0, hunger: 100, happiness: 100,
      stats: generateStats(rarity),
      isActive: false, obtainedFrom: 'hatch', obtainedAt: serverTimestamp(),
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

  // 가챠 실행 — rarity를 먼저 동기 계산 후 애니 시작, Firestore 저장은 백그라운드
  const runGacha = async () => {
    if (!selectedEgg || !student) return;
    if ((student.diamonds || 0) < selectedEgg.cost) {
      showToast(`다이아 부족! 필요: ${selectedEgg.cost}💎`, 'error');
      return;
    }

    // 1. 결과를 동기로 먼저 결정
    const rarity = rollRarity(selectedEgg);
    const md = pickMonster(rarity);
    if (!md) { showToast('오류: 몬스터를 찾을 수 없습니다', 'error'); return; }

    // 2. 애니메이션 시작 (rarity 정보 전달 → 테마 적용)
    setGachaResult({ rarity, monsterData: md, pet: null }); // pet은 아직 null
    setHatchDone(false);
    setGachaPhase('hatching');

    // 3. 백그라운드에서 Firestore 저장 (애니 중에 끝남)
    try {
      const newDiamonds = (student.diamonds || 0) - selectedEgg.cost;
      await updateDoc(doc(db, 'students', student.id), { diamonds: newDiamonds });
      setStudent(p => ({ ...p, diamonds: newDiamonds }));

      const petData = {
        studentCode, teacherUid: student.teacherUid || '',
        monsterId: md.id, nickname: md.name, rarity, tier: md.tier,
        level: 1, exp: 0, hunger: 100, happiness: 100,
        stats: generateStats(rarity),
        isActive: false, obtainedFrom: 'gacha', obtainedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'studentPets'), petData);
      const newPet = { id: ref.id, ...petData };
      setPets(p => [...p, newPet]);

      addDoc(collection(db, 'petGachaLogs'), {
        studentCode, teacherUid: student.teacherUid || '',
        eggType: selectedEgg.id, costDiamonds: selectedEgg.cost,
        resultPetId: ref.id, resultMonsterId: md.id, resultRarity: rarity,
        createdAt: serverTimestamp(),
      });

      // pet 저장 완료 → effect에서 hatchDone과 조합해 result로 전환
      setGachaResult({ rarity, monsterData: md, pet: newPet });
    } catch (e) {
      console.error('가챠 저장 오류:', e);
      showToast('저장 오류가 발생했습니다', 'error');
      setGachaPhase('idle');
    }
  };

  const closeGacha = () => { setGachaPhase('idle'); setSelectedEgg(null); setGachaResult(null); setTab('myPets'); };

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
              onDone={() => setHatchDone(true)}
            />
          )}
          {gachaPhase === 'result' && gachaResult?.pet && (() => {
            const { pet, monsterData: md, rarity } = gachaResult;
            const r = RARITY[rarity];
            const theme = RARITY_THEME[rarity] || RARITY_THEME.common;
            // 전설·신화는 파티클 더 많이
            const burstCount = rarity === 'mythic' ? 80 : rarity === 'legendary' ? 64 : rarity === 'epic' ? 52 : 40;
            return (
              <div className="relative">
                {/* 획득 순간 파티클 폭발 */}
                <ParticleBurst color={theme.glow} count={burstCount} />
                {/* 2차 파티클 (흰색) */}
                <ParticleBurst color="#ffffff" count={Math.floor(burstCount / 3)} />
                <p className="relative text-white font-extrabold text-3xl mb-2 animate-bounce">✨ 획득!</p>
                <span className={`inline-block text-sm font-extrabold px-4 py-1.5 rounded-full mb-4 ${r.bg} ${r.text} border ${r.border}`}
                  style={{ boxShadow: `0 0 12px ${theme.glow}60` }}>
                  {r.badge} {r.label}
                </span>
                {/* 결과 스프라이트 — 최대 150px 높이 제한 */}
                <div className="flex justify-center items-end mb-3 relative overflow-hidden"
                  style={{ height: 150 }}>
                  <div style={{ filter: `drop-shadow(0 0 16px ${theme.glow})` }}>
                    <SpriteMonster
                      data={md} anim="idle"
                      scale={Math.min(md.scale * 3, 150 / (md.frameHeight || 120))}
                    />
                  </div>
                </div>
                <p className="text-white font-extrabold text-xl mb-1">{md.name}</p>
                <div className="flex flex-wrap justify-center gap-1.5 mb-6">
                  {formatStats(pet.stats || {}).map((line, i) => (
                    <span key={i} className="text-[11px] bg-white/15 text-white px-2.5 py-1 rounded-full font-bold">{line}</span>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { handleSetActive(pet.id); closeGacha(); }}
                    className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold rounded-2xl">
                    대표 펫으로 설정
                  </button>
                  <button onClick={closeGacha}
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 p-4 pb-24">
      <div className="max-w-lg mx-auto">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-extrabold text-white">🐾 펫 하우스</h1>
            <p className="text-indigo-300/70 text-xs mt-0.5">보유 펫 {pets.length}마리</p>
          </div>
          <div className="flex items-center gap-1.5 bg-indigo-900/60 border border-indigo-700 px-3 py-1.5 rounded-xl">
            <span>💎</span>
            <span className="text-white font-extrabold text-sm">{student?.diamonds ?? '--'}</span>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-5">
          {[{ id: 'myPets', label: '🐾 내 펫' }, { id: 'hatch', label: '🥚 알 부화' }, { id: 'gacha', label: '💎 펫 알 뽑기' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-2 rounded-xl font-extrabold text-sm transition-colors
                ${tab === t.id ? 'bg-indigo-500 text-white shadow-md' : 'bg-indigo-900/40 text-indigo-300 hover:bg-indigo-900/60'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 내 펫 */}
        {tab === 'myPets' && (
          loading ? (
            <div className="text-center py-16 text-indigo-300 text-sm">불러오는 중...</div>
          ) : pets.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-3">🥚</div>
              <p className="text-white font-extrabold text-lg mb-1">아직 펫이 없어요!</p>
              <p className="text-indigo-300 text-sm mb-5">펫 알 뽑기에서 첫 번째 펫을 획득해보세요</p>
              <button onClick={() => setTab('gacha')}
                className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold rounded-2xl">
                펫 알 뽑기 →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {pets.map(pet => (
                <PetCard key={pet.id} pet={pet} isActive={pet.id === activePetId}
                  onSetActive={handleSetActive}
                  onRename={p => { setRenamePet(p); setRenameInput(p.nickname || ''); }}
                />
              ))}
            </div>
          )
        )}

        {/* 알 부화 탭 */}
        {tab === 'hatch' && (() => {
          const incubating = eggs.find(e => e.isIncubating);
          const inventory  = eggs.filter(e => !e.isIncubating);

          // 부화 애니메이션 전체화면은 return 상위에서 처리
          return (
            <div className="space-y-4">
              {/* 인큐베이터 슬롯 */}
              <div className="bg-slate-800/60 border border-slate-600 rounded-2xl p-4">
                <p className="text-white font-extrabold text-sm mb-3">🔮 인큐베이터 슬롯 (1/1)</p>
                {incubating ? (() => {
                  const r = RARITY[incubating.eggType] || RARITY.common;
                  const req = REQUIRED_CLEARS[incubating.eggType] || 10;
                  const cur = incubating.currentClears || 0;
                  const pct = Math.min(100, Math.round((cur / req) * 100));
                  const ready = cur >= req;
                  const gImg = `/images/Eggs/Egg_${incubating.eggType.charAt(0).toUpperCase() + incubating.eggType.slice(1)}_Gacha.png`;
                  return (
                    <div className="flex items-center gap-4">
                      <img src={gImg} alt="" className="w-16 h-16 object-contain shrink-0" />
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
            {EGGS.map(egg => (
              <div key={egg.id} className={`rounded-2xl bg-gradient-to-r ${egg.gradient} shadow-lg p-4`}>
                <div className="flex items-center gap-4">
                  <img src={egg.img} alt={egg.name} className="w-14 h-14 object-contain shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-extrabold text-sm">{egg.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {egg.rateRows.map(row => (
                        <span key={row.label} className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded-full font-bold">
                          {row.label} {row.pct}%
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-white font-extrabold text-lg">{egg.cost.toLocaleString()}</p>
                    <p className="text-white/60 text-xs">💎 다이아</p>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedEgg(egg); setGachaPhase('confirm'); }}
                  disabled={(student?.diamonds || 0) < egg.cost}
                  className="w-full mt-3 py-2.5 bg-white/25 hover:bg-white/35 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-xl text-sm transition-colors">
                  {(student?.diamonds || 0) < egg.cost
                    ? `💎 ${egg.cost - (student?.diamonds || 0)} 부족`
                    : '🥚 뽑기!'}
                </button>
              </div>
            ))}
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
            <p className="text-indigo-300 text-sm mb-5">
              보유: {student?.diamonds ?? 0}💎 → 구매 후: {(student?.diamonds || 0) - selectedEgg.cost}💎
            </p>
            <div className="flex gap-3">
              <button onClick={() => setGachaPhase('idle')}
                className="flex-1 py-3 bg-slate-700 text-slate-300 font-bold rounded-2xl">취소</button>
              <button onClick={runGacha}
                className={`flex-1 py-3 bg-gradient-to-r ${selectedEgg.gradient} text-white font-extrabold rounded-2xl`}>
                {selectedEgg.cost.toLocaleString()}💎 사용
              </button>
            </div>
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
