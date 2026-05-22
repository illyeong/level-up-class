import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const DUNGEON_URL = '/Dungeon_Main/index.html';

function ExplorationDungeon({ studentCode, tickets, onUseTicket }) {
  const [phase, setPhase]               = useState('lobby');
  const [isBusy, setIsBusy]             = useState(false);
  const [dungeonReward, setDungeonReward] = useState(null);
  const iframeRef                       = useRef(null);
  const dungeonTickets                  = tickets?.dungeon ?? 0;
  const characterDataRef                = useRef(null);
  const studentDocIdRef                 = useRef(null);

  const getMaxExpForLevel = (lv) =>
    lv <= 10 ? 500 : lv <= 30 ? 1000 : lv <= 60 ? 2000 : 3500;

  const calcLevelUp = (level, exp, maxExp, gained) => {
    let lv = level || 1, ex = (exp || 0) + gained;
    let mx = maxExp || getMaxExpForLevel(lv), leveled = false;
    while (ex >= mx && lv < 99) { ex -= mx; lv++; mx = getMaxExpForLevel(lv); leveled = true; }
    return { level: lv, exp: ex, maxExp: mx, leveled };
  };

  // 입장 전 Firebase에서 캐릭터 데이터 미리 로드
  useEffect(() => {
    if (!studentCode) return;
    const load = async () => {
      try {
        const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          studentDocIdRef.current = snap.docs[0].id;
          const d = snap.docs[0].data();
          characterDataRef.current = {
            parts:  d.parts  ?? null,
            colors: d.colors ?? null,
            stats: {
              level:         d.level         ?? 1,
              exp:           d.exp           ?? 0,
              maxExp:        d.maxExp        ?? 1000,
              gold:          d.gold          ?? 0,
              diamonds:      d.diamonds      ?? 0,
              maxHealth:     d.maxHealth     ?? 100,
              currentHealth: d.currentHealth ?? d.maxHealth ?? 100,
            }
          };
        }
      } catch (e) { console.error('캐릭터 데이터 로드 에러:', e); }
    };
    load();
  }, [studentCode]);

  // 던전 보상 Firebase 반영
  const applyDungeonReward = async ({ gold = 0, exp = 0, diamond = 0 }) => {
    const docId = studentDocIdRef.current;
    const cd    = characterDataRef.current;
    if (!docId || !cd) return;

    const s = cd.stats;
    const { level, exp: newExp, maxExp } = calcLevelUp(s.level, s.exp, s.maxExp, exp);
    try {
      await updateDoc(doc(db, 'students', docId), {
        gold:     (s.gold     || 0) + gold,
        diamonds: (s.diamonds || 0) + diamond,
        exp: newExp, level, maxExp,
      });
      // 로컬 stats 갱신
      cd.stats = { ...s, gold: (s.gold||0)+gold, diamonds: (s.diamonds||0)+diamond, exp: newExp, level, maxExp };
    } catch (e) { console.error('던전 보상 저장 에러:', e); }
  };

  // Unity → React 메시지 수신
  useEffect(() => {
    if (phase !== 'playing') return;
    const handler = (e) => {
      if (!e.data?.type) return;
      if (e.data.type === 'DUNGEON_EXIT') setPhase('lobby');

      // Unity 준비 완료 → 캐릭터 데이터 전송
      if (e.data.type === 'UNITY_READY' || e.data.type === 'DUNGEON_READY') {
        sendCharacterData();
      }

      // 던전 결과 수신 → Firebase 반영 + 보상 오버레이
      if (e.data.type === 'DUNGEON_RESULT') {
        const { gold = 0, exp = 0, diamond = 0 } = e.data;
        applyDungeonReward({ gold, exp, diamond });
        setDungeonReward({ gold, exp, diamond });
        setTimeout(() => setDungeonReward(null), 4000);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [phase]);

  const sendCharacterData = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    if (studentCode)
      win.postMessage({ type: 'REACT_STUDENT_CODE', studentCode }, '*');
    const cd = characterDataRef.current;
    if (cd) {
      const msg = { type: 'REACT_LOAD_AVATAR' };
      if (cd.parts)  msg.parts  = cd.parts;
      if (cd.colors) msg.colors = cd.colors;
      if (cd.stats)  msg.stats  = cd.stats;
      win.postMessage(msg, '*');
    }
  };

  const handleIframeLoad = () => {
    // DUNGEON_READY 신호를 못 받았을 경우 대비 — 3초/6초 fallback
    setTimeout(sendCharacterData, 3000);
    setTimeout(sendCharacterData, 6000);
  };

  const handleEnter = async () => {
    if (dungeonTickets <= 0 || isBusy) return;
    setIsBusy(true);
    try {
      // 캐릭터 데이터가 아직 없으면 여기서 확실히 로드
      if (!characterDataRef.current && studentCode) {
        const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0].data();
          characterDataRef.current = {
            parts:  d.parts  ?? null,
            colors: d.colors ?? null,
            stats: {
              level:         d.level         ?? 1,
              exp:           d.exp           ?? 0,
              maxExp:        d.maxExp        ?? 1000,
              gold:          d.gold          ?? 0,
              diamonds:      d.diamonds      ?? 0,
              maxHealth:     d.maxHealth     ?? 100,
              currentHealth: d.currentHealth ?? d.maxHealth ?? 100,
            }
          };
        }
      }
      await onUseTicket('dungeon');
      setPhase('playing');
    } catch (err) {
      console.error('이용권 사용 에러:', err);
    } finally {
      setIsBusy(false);
    }
  };

  // ── 플레이 중: Unity iframe 전체화면 ──────────────────────────
  if (phase === 'playing') {
    return (
      <div className="relative w-full" style={{ height: 'calc(100vh - 88px)' }}>
        <iframe
          ref={iframeRef}
          id="dungeon-iframe"
          src={DUNGEON_URL}
          onLoad={handleIframeLoad}
          className="w-full h-full border-0"
          allow="fullscreen"
          title="탐험던전"
        />
        {/* 나가기 버튼 */}
        <button
          onClick={() => setPhase('lobby')}
          className="absolute top-3 right-3 z-10 bg-slate-900/70 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors backdrop-blur-sm">
          ✕ 나가기
        </button>

        {/* 던전 보상 오버레이 */}
        {dungeonReward && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur-sm rounded-3xl px-8 py-6 text-center shadow-2xl border border-white/20 animate-bounce">
              <p className="text-white font-extrabold text-lg mb-3">🎁 던전 보상!</p>
              <div className="flex gap-5 justify-center">
                {dungeonReward.gold    > 0 && <div className="flex flex-col items-center"><span className="text-2xl">🪙</span><span className="text-yellow-300 font-extrabold text-sm">+{dungeonReward.gold}G</span></div>}
                {dungeonReward.exp     > 0 && <div className="flex flex-col items-center"><span className="text-2xl">⭐</span><span className="text-indigo-300 font-extrabold text-sm">+{dungeonReward.exp} EXP</span></div>}
                {dungeonReward.diamond > 0 && <div className="flex flex-col items-center"><span className="text-2xl">💎</span><span className="text-cyan-300 font-extrabold text-sm">+{dungeonReward.diamond}</span></div>}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 로비 ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="text-8xl mb-5 drop-shadow-lg">🗺️</div>
      <h1 className="text-3xl font-extrabold text-slate-800 mb-2">탐험던전</h1>
      <p className="text-slate-500 text-sm mb-6">미지의 던전을 탐험하고 보물을 찾으세요!</p>

      {/* 이용권 표시 */}
      <div className="flex items-center gap-3 mb-8 bg-slate-100 px-6 py-3 rounded-2xl border border-slate-200">
        <span className="text-2xl">🗡️</span>
        <div className="text-left">
          <div className="text-xs text-slate-500 font-medium">던전 이용권</div>
          <div className="flex items-center gap-1 mt-0.5">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className={`w-3 h-3 rounded-full border
                ${i < dungeonTickets ? 'bg-sky-400 border-sky-300' : 'bg-slate-200 border-slate-300'}`} />
            ))}
            <span className={`ml-1 font-extrabold text-sm ${dungeonTickets > 0 ? 'text-slate-700' : 'text-rose-500'}`}>
              {dungeonTickets}/3
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={handleEnter}
        disabled={dungeonTickets <= 0 || isBusy}
        className={`px-10 py-4 rounded-2xl font-extrabold text-lg transition-all active:scale-95 shadow-lg
          ${dungeonTickets > 0 && !isBusy
            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 cursor-pointer'
            : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'}`}>
        {isBusy ? '처리 중...' : dungeonTickets <= 0 ? '이용권 없음' : '입장하기 →'}
      </button>

      {dungeonTickets <= 0 && (
        <p className="text-sm text-slate-400 mt-3">
          매주 <span className="font-bold text-indigo-400">월요일</span>에 이용권이 자동 지급됩니다
        </p>
      )}
    </div>
  );
}

export default ExplorationDungeon;
