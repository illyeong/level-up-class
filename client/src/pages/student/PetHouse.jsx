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

// ── 패시브 스킬 ───────────────────────────────────────────────
const SKILLS = {
  luck:     { name: '행운',        desc: '골드 획득 +3%',    icon: '🍀' },
  sharpEye: { name: '날카로운 눈',  desc: '퀴즈 힌트 1회/일', icon: '👁️' },
  warrior:  { name: '투사의 기운', desc: 'EXP 획득 +3%',     icon: '⚔️' },
  king:     { name: '왕의 위엄',   desc: '전체 보너스 +2%',   icon: '👑' },
};
const TIER_SKILL = { tiny: 'luck', small: 'sharpEye', medium: 'warrior', large: 'king' };

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

// ── 부화 애니메이션 ──────────────────────────────────────────
function HatchAnim({ egg, onDone }) {
  const [phase, setPhase] = useState('shake');
  const [tilt, setTilt] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => setTilt(t => !t), 350);
    const t1 = setTimeout(() => {
      clearInterval(iv);
      setPhase('crack');
      const t2 = setTimeout(() => { setPhase('reveal'); setTimeout(onDone, 1500); }, 700);
      return () => clearTimeout(t2);
    }, 2000);
    return () => { clearInterval(iv); clearTimeout(t1); };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-6">
      {phase === 'shake' && (
        <>
          <p className="text-indigo-200 font-extrabold text-xl animate-pulse">부화 중...</p>
          <div className="text-[110px] transition-transform duration-150"
            style={{ transform: tilt ? 'rotate(-10deg) scale(1.06)' : 'rotate(10deg) scale(0.96)' }}>
            {egg.icon}
          </div>
        </>
      )}
      {phase === 'crack' && (
        <div className="text-center">
          <div className="text-[110px] animate-bounce">💥</div>
          <p className="text-white font-extrabold text-2xl animate-pulse">CRACK!</p>
        </div>
      )}
      {phase === 'reveal' && (
        <p className="text-4xl font-extrabold text-white animate-bounce">✨ 등장! ✨</p>
      )}
    </div>
  );
}

// ── 펫 카드 ──────────────────────────────────────────────────
function PetCard({ pet, isActive, onSetActive, onRename }) {
  const [anim, setAnim] = useState('idle');
  const md = MONSTERS_DB[pet.monsterId];
  const r = RARITY[pet.rarity] || RARITY.common;
  const skill = SKILLS[pet.passiveSkillId] || SKILLS.luck;
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
      <p className="text-center text-[9px] text-slate-400 mb-2">{skill.icon} {skill.name}</p>
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

  // 가챠 실행
  const runGacha = async () => {
    if (!selectedEgg || !student) return;
    if ((student.diamonds || 0) < selectedEgg.cost) {
      showToast(`다이아 부족! 필요: ${selectedEgg.cost}💎`, 'error');
      setGachaPhase('idle');
      return;
    }
    setGachaPhase('hatching');

    const newDiamonds = (student.diamonds || 0) - selectedEgg.cost;
    await updateDoc(doc(db, 'students', student.id), { diamonds: newDiamonds });
    setStudent(p => ({ ...p, diamonds: newDiamonds }));

    const rarity = rollRarity(selectedEgg);
    const md = pickMonster(rarity);
    if (!md) { showToast('오류: 몬스터 없음', 'error'); setGachaPhase('idle'); return; }

    const petData = {
      studentCode, teacherUid: student.teacherUid || '',
      monsterId: md.id, nickname: md.name, rarity, tier: md.tier,
      level: 1, exp: 0, hunger: 100, happiness: 100,
      passiveSkillId: TIER_SKILL[md.tier] || 'luck',
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

    setGachaResult({ pet: newPet, monsterData: md, rarity });
  };

  const closeGacha = () => { setGachaPhase('idle'); setSelectedEgg(null); setGachaResult(null); setTab('myPets'); };

  // ── 가챠 전체화면 ──────────────────────────────────────────
  if (gachaPhase === 'hatching' || gachaPhase === 'result') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-950 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          {gachaPhase === 'hatching' && (
            <HatchAnim egg={selectedEgg} onDone={() => setGachaPhase('result')} />
          )}
          {gachaPhase === 'result' && gachaResult && (() => {
            const { pet, monsterData: md, rarity } = gachaResult;
            const r = RARITY[rarity];
            const skill = SKILLS[pet.passiveSkillId] || SKILLS.luck;
            return (
              <>
                <p className="text-white font-extrabold text-2xl mb-2">✨ 획득!</p>
                <span className={`inline-block text-sm font-extrabold px-4 py-1 rounded-full mb-5 ${r.bg} ${r.text}`}>
                  {r.badge} {r.label}
                </span>
                <div className="flex justify-center items-end h-36 mb-3">
                  <SpriteMonster data={md} anim="idle" scale={md.scale * 2.8} />
                </div>
                <p className="text-white font-extrabold text-xl mb-1">{md.name}</p>
                <p className="text-indigo-300 text-sm mb-6">{skill.icon} {skill.name} — {skill.desc}</p>
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
