import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const DUNGEON_URL = '/Dungeon_Main/index.html';

// ── 던전 데이터 ───────────────────────────────────────────────
const DUNGEONS = [
  {
    id: 0, name: '고블린 동굴',
    desc: '마을 외곽에 나타난 고블린 무리. 입문자를 위한 던전.',
    level: 1, pos: { x: 12, y: 75 },
    reward: '🪙 50G · ⭐ 30EXP',
  },
  {
    id: 1, name: '어둠의 숲',
    desc: '빛이 닿지 않는 깊은 숲. 나무 정령들이 침입자를 막는다.',
    level: 3, pos: { x: 25, y: 60 },
    reward: '🪙 80G · ⭐ 50EXP',
  },
  {
    id: 2, name: '해적 항구',
    desc: '저주받은 항구를 점령한 해적 유령들의 소굴.',
    level: 5, pos: { x: 42, y: 70 },
    reward: '🪙 120G · ⭐ 70EXP',
  },
  {
    id: 3, name: '용암 동굴',
    desc: '지하 깊은 곳, 마그마가 흐르는 고온의 동굴.',
    level: 8, pos: { x: 58, y: 58 },
    reward: '🪙 160G · ⭐ 90EXP',
  },
  {
    id: 4, name: '폭풍 요새',
    desc: '번개를 다루는 마법사가 지키는 하늘 위의 요새.',
    level: 12, pos: { x: 72, y: 42 },
    reward: '🪙 200G · ⭐ 120EXP',
  },
  {
    id: 5, name: '얼음 신전',
    desc: '영원한 겨울 속에 잠든 고대 신전. 냉기가 뼛속까지 스민다.',
    level: 16, pos: { x: 52, y: 28 },
    reward: '🪙 250G · ⭐ 150EXP',
  },
  {
    id: 6, name: '번개의 탑',
    desc: '구름을 뚫고 솟아있는 마력의 탑. 정상에 강력한 마법사가 기다린다.',
    level: 20, pos: { x: 32, y: 18 },
    reward: '🪙 300G · ⭐ 180EXP',
  },
  {
    id: 7, name: '마왕 성채',
    desc: '세계를 지배하려는 마왕의 최후 요새. 모든 용사의 최종 목표.',
    level: 25, pos: { x: 72, y: 12 },
    reward: '🪙 500G · 💎 5 · ⭐ 300EXP',
  },
];

// ── 유틸 ──────────────────────────────────────────────────────
const getMaxExpForLevel = (lv) =>
  lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;

const calcLevelUp = (level, exp, maxExp, gained) => {
  let lv = level || 1, ex = (exp || 0) + gained;
  let mx = maxExp || getMaxExpForLevel(lv), leveled = false;
  while (ex >= mx && lv < 99) { ex -= mx; lv++; mx = getMaxExpForLevel(lv); leveled = true; }
  return { level: lv, exp: ex, maxExp: mx, leveled };
};

// 진행도: { 0:'completed', 1:'current', 2:'locked', ... }
const buildProgress = (raw = {}) => {
  const p = {};
  DUNGEONS.forEach((d, i) => {
    p[i] = raw[i] || (i === 0 ? 'current' : 'locked');
  });
  return p;
};

// ── 던전 노드 ─────────────────────────────────────────────────
function DungeonNode({ dungeon, state, isSelected, onClick }) {
  const icon =
    state === 'completed' && isSelected ? '/images/CompletedSelected.png'
    : state === 'completed'             ? '/images/Completed.png'
    : state === 'current'               ? '/images/Current.png'
    :                                     '/images/Locked.png';

  const size = state === 'locked' ? 48 : 56;

  return (
    <button
      onClick={() => state !== 'locked' && onClick(dungeon)}
      disabled={state === 'locked'}
      style={{
        position:  'absolute',
        left:      `${dungeon.pos.x}%`,
        top:       `${dungeon.pos.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex:    10,
      }}
      className={`flex flex-col items-center gap-1 transition-transform
        ${state === 'locked' ? 'opacity-70 cursor-not-allowed' : 'hover:scale-110 active:scale-95 cursor-pointer'}`}>
      <img
        src={icon}
        alt={dungeon.name}
        style={{ width: size, height: size, objectFit: 'contain',
          filter: isSelected ? 'drop-shadow(0 0 8px #facc15)' : undefined }}
      />
      {state !== 'locked' && (
        <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shadow
          ${state === 'completed' ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-amber-900'}`}>
          {dungeon.name}
        </span>
      )}
    </button>
  );
}

// ── 던전 정보 팝업 ────────────────────────────────────────────
function DungeonPopup({ dungeon, state, onEnter, onClose, isBusy, dungeonTickets }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/40"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-extrabold">{dungeon.name}</h2>
            <button onClick={onClose} className="text-white/70 hover:text-white text-xl">✕</button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="bg-white/20 px-2 py-0.5 rounded-full font-bold">
              권장 Lv.{dungeon.level}
            </span>
            {state === 'completed' && (
              <span className="bg-emerald-400/80 px-2 py-0.5 rounded-full font-bold text-emerald-900">
                ✅ 클리어
              </span>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-slate-600 text-sm leading-relaxed">{dungeon.desc}</p>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm">
            <div className="font-bold text-amber-700 mb-1">🎁 클리어 보상</div>
            <div className="text-amber-600 font-medium">{dungeon.reward}</div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>🗡️ 던전 이용권</span>
            <span className={`font-extrabold ${dungeonTickets > 0 ? 'text-sky-600' : 'text-rose-500'}`}>
              {dungeonTickets}장 보유
            </span>
          </div>

          <button
            onClick={onEnter}
            disabled={dungeonTickets <= 0 || isBusy}
            className={`w-full py-3 rounded-2xl font-extrabold text-base transition-all active:scale-95
              ${dungeonTickets > 0 && !isBusy
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
            {isBusy ? '처리 중...'
              : dungeonTickets <= 0 ? '이용권 없음'
              : state === 'completed' ? '🔄 재도전하기 (이용권 1개)'
              : '⚔️ 입장하기 (이용권 1개)'}
          </button>

          {dungeonTickets <= 0 && (
            <p className="text-center text-xs text-slate-400">
              매주 <span className="font-bold text-indigo-400">월요일</span>에 이용권이 자동 지급됩니다
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function ExplorationDungeon({ studentCode, tickets, onUseTicket }) {
  const [phase, setPhase]             = useState('map');
  const [isBusy, setIsBusy]           = useState(false);
  const [student, setStudent]         = useState(null);
  const [progress, setProgress]       = useState({});
  const [selectedDungeon, setSelectedDungeon] = useState(null);
  const [dungeonReward, setDungeonReward]     = useState(null);

  const iframeRef        = useRef(null);
  const characterDataRef = useRef(null);
  const studentDocIdRef  = useRef(null);
  const dungeonTickets   = tickets?.dungeon ?? 0;

  // 학생 데이터 로드
  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
        if (!snap.empty) {
          const d = snap.docs[0];
          const data = d.data();
          studentDocIdRef.current = d.id;
          setStudent({ id: d.id, ...data });
          setProgress(buildProgress(data.dungeonProgress || {}));
          characterDataRef.current = {
            parts: data.parts ?? null,
            colors: data.colors ?? null,
            stats: {
              level: data.level ?? 1, exp: data.exp ?? 0,
              maxExp: data.maxExp ?? 100, gold: data.gold ?? 0,
              diamonds: data.diamonds ?? 0,
              maxHealth: 100 + Math.floor((data.level ?? 1) * 10),
              currentHealth: 100 + Math.floor((data.level ?? 1) * 10),
            },
          };
        }
      } catch (e) { console.error(e); }
    })();
  }, [studentCode]);

  // Unity 메시지 수신
  useEffect(() => {
    if (phase !== 'playing') return;
    const handler = (e) => {
      if (!e.data?.type) return;
      if (e.data.type === 'DUNGEON_EXIT') setPhase('map');
      if (e.data.type === 'UNITY_READY' || e.data.type === 'DUNGEON_READY') sendCharacterData();
      if (e.data.type === 'DUNGEON_RESULT') {
        const { gold = 0, exp = 0, diamond = 0 } = e.data;
        applyReward({ gold, exp, diamond });
        // 클리어 처리
        if (selectedDungeon !== null) markCompleted(selectedDungeon.id);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [phase, selectedDungeon]);

  const sendCharacterData = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    if (studentCode) win.postMessage({ type: 'REACT_STUDENT_CODE', studentCode }, '*');
    const cd = characterDataRef.current;
    if (cd) win.postMessage({ type: 'REACT_LOAD_AVATAR', ...cd }, '*');
  };

  const handleIframeLoad = () => {
    setTimeout(sendCharacterData, 3000);
    setTimeout(sendCharacterData, 6000);
  };

  const applyReward = async ({ gold, exp, diamond }) => {
    const docId = studentDocIdRef.current;
    const s = student;
    if (!docId || !s) return;
    const { level, exp: newExp, maxExp } = calcLevelUp(s.level, s.exp, s.maxExp, exp);
    try {
      await updateDoc(doc(db, 'students', docId), {
        gold:     (s.gold     || 0) + gold,
        diamonds: (s.diamonds || 0) + diamond,
        exp: newExp, level, maxExp,
      });
      setStudent(prev => ({ ...prev, gold: (prev.gold||0)+gold, diamonds: (prev.diamonds||0)+diamond, exp: newExp, level, maxExp }));
      if (gold || exp || diamond) setDungeonReward({ gold, exp, diamond });
    } catch (e) { console.error(e); }
  };

  const markCompleted = async (stageId) => {
    const docId = studentDocIdRef.current;
    if (!docId) return;
    const newProgress = { ...progress };
    newProgress[stageId] = 'completed';
    const nextId = stageId + 1;
    if (nextId < DUNGEONS.length && newProgress[nextId] === 'locked')
      newProgress[nextId] = 'current';
    try {
      await updateDoc(doc(db, 'students', docId), { dungeonProgress: newProgress });
      setProgress(newProgress);
    } catch (e) { console.error(e); }
  };

  const handleEnter = async () => {
    if (!selectedDungeon || dungeonTickets <= 0 || isBusy) return;
    setIsBusy(true);
    try {
      await onUseTicket('dungeon');
      setPhase('playing');
      setSelectedDungeon(null);
      setDungeonReward(null);
    } catch (e) { console.error(e); }
    finally { setIsBusy(false); }
  };

  // ── Unity 플레이 화면 ──────────────────────────────────────
  if (phase === 'playing') {
    return (
      <div className="relative w-full" style={{ height: 'calc(100vh - 88px)' }}>
        <iframe ref={iframeRef} id="dungeon-iframe" src={DUNGEON_URL}
          onLoad={handleIframeLoad} className="w-full h-full border-0"
          allow="fullscreen" title="탐험던전" />
        <button onClick={() => setPhase('map')}
          className="absolute top-3 right-3 z-10 bg-slate-900/70 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl backdrop-blur-sm">
          ✕ 나가기
        </button>
        {dungeonReward && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur-sm rounded-3xl px-8 py-6 text-center shadow-2xl border border-white/20 animate-bounce">
              <p className="text-white font-extrabold text-lg mb-3">🎁 던전 보상!</p>
              <div className="flex gap-5 justify-center">
                {dungeonReward.gold    > 0 && <div className="flex flex-col items-center"><span className="text-2xl">🪙</span><span className="text-yellow-300 font-extrabold text-sm">+{dungeonReward.gold}G</span></div>}
                {dungeonReward.exp     > 0 && <div className="flex flex-col items-center"><span className="text-2xl">⭐</span><span className="text-indigo-300 font-extrabold text-sm">+{dungeonReward.exp}</span></div>}
                {dungeonReward.diamond > 0 && <div className="flex flex-col items-center"><span className="text-2xl">💎</span><span className="text-cyan-300 font-extrabold text-sm">+{dungeonReward.diamond}</span></div>}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 맵 선택 화면 ──────────────────────────────────────────
  const completedCount = Object.values(progress).filter(s => s === 'completed').length;

  return (
    <div className="min-h-full bg-slate-900 flex flex-col">
      {/* 상단 바 */}
      <div className="bg-slate-800 border-b border-slate-700 px-5 py-3 flex items-center gap-4 shrink-0">
        <h1 className="font-extrabold text-white text-base">🗺️ 탐험던전</h1>
        <span className="text-slate-400 text-xs">클리어: {completedCount}/{DUNGEONS.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">🗡️ 이용권</span>
          <span className={`font-extrabold text-sm ${dungeonTickets > 0 ? 'text-sky-400' : 'text-rose-400'}`}>
            {dungeonTickets}장
          </span>
        </div>
      </div>

      {/* 맵 영역 */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative w-full max-w-4xl" style={{ aspectRatio: '2236/1080' }}>
          {/* 배경 맵 */}
          <img
            src="/images/FantasyGameMap.png"
            alt="던전 맵"
            className="w-full h-full object-cover rounded-2xl"
            onError={e => { e.target.style.background = 'linear-gradient(135deg,#1e3a5f,#2d1b69)'; e.target.style.borderRadius = '16px'; }}
          />

          {/* 던전 노드들 */}
          {DUNGEONS.map(dungeon => (
            <DungeonNode
              key={dungeon.id}
              dungeon={dungeon}
              state={progress[dungeon.id] || 'locked'}
              isSelected={selectedDungeon?.id === dungeon.id}
              onClick={d => setSelectedDungeon(prev => prev?.id === d.id ? null : d)}
            />
          ))}

          {/* 던전 정보 팝업 */}
          {selectedDungeon && (
            <DungeonPopup
              dungeon={selectedDungeon}
              state={progress[selectedDungeon.id] || 'locked'}
              onEnter={handleEnter}
              onClose={() => setSelectedDungeon(null)}
              isBusy={isBusy}
              dungeonTickets={dungeonTickets}
            />
          )}
        </div>
      </div>
    </div>
  );
}
