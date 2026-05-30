import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, addDoc, updateDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import SpriteMonster from '../../components/SpriteMonster';
import { MONSTERS_DB } from '../../data/monsterData';

// ── 펫 등급 ──────────────────────────────────────────────────
const RARITY = {
  common:    { label: '일반',   badge: '⚪', bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-300',  tierKey: 'tiny'   },
  rare:      { label: '희귀',   badge: '🔵', bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-300',   tierKey: 'small'  },
  epic:      { label: '영웅',   badge: '🟣', bg: 'bg-purple-50',  text: 'text-purple-700', border: 'border-purple-300', tierKey: 'medium' },
  legendary: { label: '전설',   badge: '🟡', bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-300',  tierKey: 'large'  },
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
};

function rand(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function generateStats(rarity) {
  const pool = STAT_POOLS[rarity];
  if (!pool?.length) return { goldBonus: 2 };
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

// ── 가챠 알 설정 ─────────────────────────────────────────────
const EGGS = [
  {
    id: 'normal', name: '일반 펫 알', cost: 500, icon: '🥚',
    gradient: 'from-slate-400 to-slate-600',
    rates: { common: 65, rare: 30, epic: 5, legendary: 0 },
    rateRows: [{ label: '일반 ⚪', pct: 65 }, { label: '희귀 🔵', pct: 30 }, { label: '영웅 🟣', pct: 5 }],
  },
  {
    id: 'rare', name: '희귀 펫 알', cost: 1000, icon: '💙',
    gradient: 'from-blue-500 to-indigo-600',
    rates: { common: 20, rare: 55, epic: 22, legendary: 3 },
    rateRows: [{ label: '일반 ⚪', pct: 20 }, { label: '희귀 🔵', pct: 55 }, { label: '영웅 🟣', pct: 22 }, { label: '전설 🟡', pct: 3 }],
  },
  {
    id: 'legendary', name: '전설 펫 알', cost: 2000, icon: '⭐',
    gradient: 'from-amber-400 to-orange-600',
    rates: { common: 0, rare: 40, epic: 50, legendary: 10 },
    rateRows: [{ label: '희귀 🔵', pct: 40 }, { label: '영웅 🟣', pct: 50 }, { label: '전설 🟡', pct: 10 }],
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
  common:    { glow: '#94a3b8', flash: 'rgba(255,255,255,0.35)', label: '',          stars: '✦✧✦' },
  rare:      { glow: '#60a5fa', flash: 'rgba(96,165,250,0.45)', label: '',          stars: '✦★✦' },
  epic:      { glow: '#c084fc', flash: 'rgba(192,132,252,0.55)', label: '✨ 영웅 등장!', stars: '★✦★' },
  legendary: { glow: '#fbbf24', flash: 'rgba(251,191,36,0.65)', label: '🌟 전설 등장!!', stars: '🌟★🌟' },
};

// ── 파티클 ───────────────────────────────────────────────────
function Particles({ color }) {
  const pts = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    x: 10 + Math.random() * 80,
    y: 5  + Math.random() * 80,
    size: 14 + Math.floor(Math.random() * 18),
    delay: i * 60,
    dur: 400 + Math.floor(Math.random() * 400),
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pts.map(p => (
        <div key={p.id} className="absolute animate-ping"
          style={{ left: `${p.x}%`, top: `${p.y}%`, fontSize: p.size, color,
            animationDelay: `${p.delay}ms`, animationDuration: `${p.dur}ms` }}>
          ✦
        </div>
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

      {/* 파티클 (stage 4+) */}
      {stage >= 4 && <Particles color={theme.glow} />}

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
        <div className="relative z-10 text-[110px] select-none" style={eggStyle}>
          {egg.icon}
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
  if (!md) return null;
  return (
    <div className={`relative rounded-2xl border-2 p-3 transition-all
      ${isActive ? `${r.border} ${r.bg} shadow-lg` : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
      {isActive && (
        <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${r.bg} ${r.text} ${r.border} border whitespace-nowrap`}>
          ★ 대표 펫
        </span>
      )}
      <div className="flex justify-center items-end h-16 mb-2 cursor-pointer"
        onClick={() => setAnim(a => a === 'idle' ? 'attack' : 'idle')}>
        <SpriteMonster data={md} anim={anim} scale={md.scale * 1.5} onAnimEnd={() => setAnim('idle')} />
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
      setLoading(false);
    })();
  }, [studentCode]);

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
            return (
              <>
                <p className="text-white font-extrabold text-3xl mb-2 animate-bounce">✨ 획득!</p>
                <span className={`inline-block text-sm font-extrabold px-4 py-1.5 rounded-full mb-4 ${r.bg} ${r.text} border ${r.border}`}
                  style={{ boxShadow: `0 0 12px ${theme.glow}60` }}>
                  {r.badge} {r.label}
                </span>
                <div className="flex justify-center items-end h-40 mb-3 relative">
                  <div style={{ filter: `drop-shadow(0 0 16px ${theme.glow})` }}>
                    <SpriteMonster data={md} anim="idle" scale={md.scale * 3} />
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
              </>
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
          {[{ id: 'myPets', label: '🐾 내 펫' }, { id: 'gacha', label: '🥚 펫 알 뽑기' }].map(t => (
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

        {/* 가챠 */}
        {tab === 'gacha' && (
          <div className="space-y-3">
            {EGGS.map(egg => (
              <div key={egg.id} className={`rounded-2xl bg-gradient-to-r ${egg.gradient} shadow-lg p-4`}>
                <div className="flex items-center gap-4">
                  <span className="text-5xl shrink-0">{egg.icon}</span>
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
            <div className="text-6xl mb-2">{selectedEgg.icon}</div>
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
