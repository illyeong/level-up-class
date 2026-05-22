import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, query, where, doc, updateDoc, addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

// ── 레벨 기반 스탯 ───────────────────────────────────────────
const getStats = (level = 1) => ({
  hp:          100 + Math.floor(level * 10),
  attack:      10  + Math.floor(level * 2),
  defense:     5   + Math.floor(level * 1.5),
  crit:        5   + Math.floor(level * 0.5),
  attackSpeed: 10  + Math.floor(level * 1),
});

const getMaxExpForLevel = (lv) =>
  lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;

const calcLevelUp = (level, exp, gained) => {
  let lv = level || 1, ex = (exp || 0) + gained;
  let mx = getMaxExpForLevel(lv), leveled = false;
  while (ex >= mx && lv < 99) { ex -= mx; lv++; mx = getMaxExpForLevel(lv); leveled = true; }
  return { level: lv, exp: ex, maxExp: mx, leveled };
};

const STAT_META = [
  { key:'hp',          label:'체력',    icon:'❤️' },
  { key:'attack',      label:'공격력',  icon:'⚔️' },
  { key:'defense',     label:'방어력',  icon:'🛡️' },
  { key:'crit',        label:'크리티컬',icon:'💥' },
  { key:'attackSpeed', label:'공격속도',icon:'💨' },
];

const WIN_REWARD  = { gold: 100, diamond: 50, exp: 50 };
const LOSE_REWARD = { gold: 0,   diamond: 0,  exp: 25 };
const CHANGE_COST = 30;
const MAX_CHANGES = 3;

// ── 캐릭터 카드 ───────────────────────────────────────────────
function CharacterCard({ student, label, isMe, highlight }) {
  const stats = getStats(student?.level || 1);
  const lv    = student?.level || 1;
  const expPct = Math.min(100, Math.round(((student?.exp||0) / getMaxExpForLevel(lv)) * 100));

  return (
    <div className={`flex flex-col items-center rounded-3xl p-5 transition-all
      ${highlight ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/20' : ''}
      ${isMe ? 'bg-indigo-950/60' : 'bg-rose-950/60'}`}>

      {/* 라벨 */}
      <div className={`text-[10px] font-extrabold px-3 py-0.5 rounded-full mb-3
        ${isMe ? 'bg-indigo-500 text-white' : 'bg-rose-500 text-white'}`}>
        {label}
      </div>

      {/* 캐릭터 이미지 */}
      <div className="w-28 h-28 rounded-2xl bg-slate-800 border border-slate-600 overflow-hidden flex items-center justify-center mb-3 relative">
        {student?.characterImage ? (
          <img src={student.characterImage} alt="" className="w-full h-full object-contain scale-[2.5]" />
        ) : (
          <span className="text-5xl">🧑‍🎓</span>
        )}
        <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-extrabold px-2 py-0.5 rounded-full
          ${isMe ? 'bg-indigo-500' : 'bg-rose-500'} text-white whitespace-nowrap`}>
          Lv.{lv}
        </div>
      </div>

      {/* 이름 */}
      <div className="font-extrabold text-white text-sm mb-1 truncate max-w-[120px]">
        {student?.name || student?.studentCode || '???'}
      </div>

      {/* EXP 바 */}
      <div className="w-full mb-3">
        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${isMe ? 'bg-indigo-400' : 'bg-rose-400'}`}
            style={{ width: `${expPct}%` }} />
        </div>
      </div>

      {/* 스탯 */}
      <div className="w-full space-y-1.5">
        {STAT_META.map(s => (
          <div key={s.key} className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1">
              <span>{s.icon}</span>{s.label}
            </span>
            <span className="font-extrabold text-white">{stats[s.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 결과 화면 ─────────────────────────────────────────────────
function ResultScreen({ isWin, opponent, reward, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-3xl p-8 w-full max-w-sm text-center border border-slate-700 shadow-2xl">
        <div className="text-6xl mb-4">{isWin ? '🏆' : '💀'}</div>
        <h2 className={`text-3xl font-extrabold mb-2 ${isWin ? 'text-yellow-400' : 'text-slate-400'}`}>
          {isWin ? '승리!' : '패배'}
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          {isWin
            ? `${opponent?.name || '상대'}를 물리쳤습니다!`
            : `${opponent?.name || '상대'}에게 패배했습니다.`}
        </p>

        {/* 보상 */}
        <div className={`rounded-2xl p-4 mb-6 ${isWin ? 'bg-yellow-950/60 border border-yellow-700' : 'bg-slate-800 border border-slate-700'}`}>
          <div className={`text-xs font-bold mb-3 ${isWin ? 'text-yellow-400' : 'text-slate-400'}`}>
            {isWin ? '🎁 획득 보상' : '위로 보상'}
          </div>
          <div className="flex justify-center gap-5">
            {reward.gold    > 0 && <div className="flex flex-col items-center"><span className="text-xl">🪙</span><span className="text-yellow-300 font-extrabold text-sm">+{reward.gold}G</span></div>}
            {reward.diamond > 0 && <div className="flex flex-col items-center"><span className="text-xl">💎</span><span className="text-cyan-300 font-extrabold text-sm">+{reward.diamond}</span></div>}
            {reward.exp     > 0 && <div className="flex flex-col items-center"><span className="text-xl">⭐</span><span className="text-indigo-300 font-extrabold text-sm">+{reward.exp}</span></div>}
          </div>
        </div>

        <button onClick={onClose}
          className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold transition-all active:scale-95">
          확인
        </button>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function Arena({ studentCode, tickets, onUseTicket }) {
  const [phase, setPhase]         = useState('lobby');  // lobby|matching|vs|result
  const [me, setMe]               = useState(null);
  const [classmates, setClassmates] = useState([]);
  const [opponent, setOpponent]   = useState(null);
  const [changes, setChanges]     = useState(0);
  const [isBusy, setIsBusy]       = useState(false);
  const [result, setResult]       = useState(null); // { isWin, reward }
  const [matchAnim, setMatchAnim] = useState(false);
  const studentDocIdRef           = useRef(null);
  const arenaTickets              = tickets?.arena ?? 0;

  // 내 정보 + 우리반 로드
  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      try {
        const meSnap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
        if (meSnap.empty) return;
        const meDoc = meSnap.docs[0];
        studentDocIdRef.current = meDoc.id;
        setMe({ id: meDoc.id, ...meDoc.data() });

        const tid = meDoc.data().teacherUid;
        const q   = tid
          ? query(collection(db, 'students'), where('teacherUid', '==', tid))
          : collection(db, 'students');
        const snap = await getDocs(q);
        const others = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s => s.id !== meDoc.id);
        setClassmates(others);
      } catch (e) { console.error(e); }
    })();
  }, [studentCode]);

  const pickRandom = (excludeId = null) => {
    const pool = classmates.filter(s => s.id !== excludeId);
    if (pool.length === 0) return classmates[0] ?? null;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // 매칭 시작
  const startMatching = async () => {
    if (arenaTickets <= 0 || isBusy) return;
    setIsBusy(true);
    setMatchAnim(true);
    setPhase('matching');
    await new Promise(r => setTimeout(r, 1800));
    const opp = pickRandom();
    setOpponent(opp);
    setChanges(0);
    setMatchAnim(false);
    setPhase('vs');
    setIsBusy(false);
  };

  // 상대 바꾸기
  const changeOpponent = async () => {
    if (changes >= MAX_CHANGES || isBusy) return;
    const myData = me;
    if ((myData?.diamonds || 0) < CHANGE_COST) return alert(`💎 부족! ${CHANGE_COST}💎 필요`);
    setIsBusy(true);
    try {
      const docId = studentDocIdRef.current;
      await updateDoc(doc(db, 'students', docId), {
        diamonds: (myData.diamonds || 0) - CHANGE_COST,
      });
      setMe(prev => ({ ...prev, diamonds: (prev.diamonds || 0) - CHANGE_COST }));
      setMatchAnim(true);
      await new Promise(r => setTimeout(r, 600));
      const opp = pickRandom(opponent?.id);
      setOpponent(opp);
      setChanges(c => c + 1);
      setMatchAnim(false);
    } catch (e) { console.error(e); }
    finally { setIsBusy(false); }
  };

  // 대련 시작 (이용권 소비 + 임시 결과)
  const startBattle = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await onUseTicket('arena');

      // 임시: 레벨 기반 승률 계산
      const myStats  = getStats(me?.level || 1);
      const oppStats = getStats(opponent?.level || 1);
      const myPower  = myStats.attack + myStats.defense + myStats.hp / 10;
      const oppPower = oppStats.attack + oppStats.defense + oppStats.hp / 10;
      const winChance = myPower / (myPower + oppPower);
      const isWin = Math.random() < winChance + 0.1; // 약간 유리하게

      const reward = isWin ? WIN_REWARD : LOSE_REWARD;
      const docId  = studentDocIdRef.current;

      // 보상 지급
      const { level, exp, maxExp, leveled } = calcLevelUp(me.level, me.exp, reward.exp);
      await updateDoc(doc(db, 'students', docId), {
        gold:     (me.gold     || 0) + reward.gold,
        diamonds: (me.diamonds || 0) + reward.diamond,
        exp, level, maxExp,
      });
      setMe(prev => ({ ...prev, gold: (prev.gold||0)+reward.gold, diamonds: (prev.diamonds||0)+reward.diamond, exp, level, maxExp }));

      // 대전 로그
      await addDoc(collection(db, 'arenaLogs'), {
        studentId: docId, studentCode: me.studentCode, studentName: me.name || me.studentCode,
        opponentId: opponent?.id, opponentCode: opponent?.studentCode, opponentName: opponent?.name || opponent?.studentCode,
        isWin, reward, createdAt: serverTimestamp(),
      });

      setResult({ isWin, reward });
      setPhase('result');
    } catch (e) { console.error(e); }
    finally { setIsBusy(false); }
  };

  const reset = () => {
    setPhase('lobby');
    setOpponent(null);
    setChanges(0);
    setResult(null);
  };

  // ── 로비 ────────────────────────────────────────────────────
  if (phase === 'lobby') {
    return (
      <div className="min-h-full bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col items-center justify-center p-6">
        <div className="text-6xl mb-4">🏟️</div>
        <h1 className="text-3xl font-extrabold text-white mb-2">투기장</h1>
        <p className="text-slate-400 text-sm mb-8 text-center">
          우리반 친구와 1:1 대련으로 실력을 겨뤄보세요!
        </p>

        {/* 내 캐릭터 미리보기 */}
        {me && (
          <div className="bg-slate-900/60 rounded-2xl p-4 mb-6 flex items-center gap-4 border border-slate-700 w-full max-w-xs">
            <div className="w-16 h-16 rounded-xl bg-slate-800 overflow-hidden flex items-center justify-center">
              {me.characterImage
                ? <img src={me.characterImage} alt="" className="w-full h-full object-contain scale-[2.2]" />
                : <span className="text-2xl">🧑‍🎓</span>}
            </div>
            <div>
              <div className="font-extrabold text-white text-sm">{me.name || me.studentCode}</div>
              <div className="text-slate-400 text-xs">Lv.{me.level || 1}</div>
              <div className="flex gap-2 mt-1 text-xs">
                <span className="text-amber-400">🪙 {(me.gold||0).toLocaleString()}</span>
                <span className="text-cyan-400">💎 {me.diamonds||0}</span>
              </div>
            </div>
          </div>
        )}

        {/* 보상 안내 */}
        <div className="bg-yellow-950/40 border border-yellow-700/50 rounded-2xl px-5 py-3 mb-6 w-full max-w-xs">
          <div className="text-xs font-bold text-yellow-400 mb-2">🏆 승리 보상</div>
          <div className="flex justify-around text-sm font-extrabold">
            <span className="text-amber-300">🪙 {WIN_REWARD.gold}G</span>
            <span className="text-cyan-300">💎 {WIN_REWARD.diamond}</span>
            <span className="text-indigo-300">⭐ {WIN_REWARD.exp}</span>
          </div>
        </div>

        {/* 이용권 + 입장 버튼 */}
        <div className="flex items-center gap-2 mb-4 text-sm text-slate-400">
          <span>🏟️ 이용권</span>
          <span className={`font-extrabold ${arenaTickets > 0 ? 'text-violet-400' : 'text-rose-400'}`}>
            {arenaTickets}장
          </span>
        </div>

        <button onClick={startMatching} disabled={arenaTickets <= 0 || isBusy || classmates.length === 0}
          className={`w-full max-w-xs py-4 rounded-2xl font-extrabold text-lg transition-all active:scale-95 shadow-lg
            ${arenaTickets > 0 && classmates.length > 0
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-900'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
          {classmates.length === 0 ? '대전 상대 없음' : arenaTickets <= 0 ? '이용권 없음' : '⚔️ 대전 상대 찾기'}
        </button>
      </div>
    );
  }

  // ── 매칭 중 ─────────────────────────────────────────────────
  if (phase === 'matching') {
    return (
      <div className="min-h-full bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col items-center justify-center gap-6">
        <div className="text-5xl animate-spin">⚔️</div>
        <p className="text-white font-extrabold text-xl animate-pulse">상대를 찾는 중...</p>
        <div className="flex gap-1">
          {[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.2}s` }} />
          ))}
        </div>
      </div>
    );
  }

  // ── VS 화면 ─────────────────────────────────────────────────
  if (phase === 'vs' && opponent) {
    const myStats  = getStats(me?.level || 1);
    const oppStats = getStats(opponent?.level || 1);
    const canChange = changes < MAX_CHANGES && (me?.diamonds || 0) >= CHANGE_COST;
    const myPower   = myStats.attack * 2 + myStats.defense + myStats.hp / 20;
    const oppPower  = oppStats.attack * 2 + oppStats.defense + oppStats.hp / 20;
    const advantage = myPower > oppPower ? 'win' : myPower < oppPower ? 'lose' : 'even';

    return (
      <div className="min-h-full bg-gradient-to-b from-slate-950 to-indigo-950 p-4 flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={reset} className="text-slate-400 hover:text-white text-sm font-bold px-3 py-1.5 bg-slate-800 rounded-xl">← 나가기</button>
          <div className={`text-xs font-extrabold px-3 py-1.5 rounded-full
            ${advantage==='win' ? 'bg-emerald-900 text-emerald-400' : advantage==='lose' ? 'bg-rose-900 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
            {advantage==='win' ? '⬆️ 유리' : advantage==='lose' ? '⬇️ 불리' : '🔄 互角'}
          </div>
          <div className="text-xs text-slate-400">변경 {MAX_CHANGES - changes}회 남음</div>
        </div>

        {/* VS 카드 */}
        <div className={`flex items-stretch gap-3 mb-4 transition-opacity duration-300 ${matchAnim ? 'opacity-30' : 'opacity-100'}`}>
          <div className="flex-1"><CharacterCard student={me} label="나" isMe /></div>

          <div className="flex flex-col items-center justify-center gap-2 shrink-0">
            <div className="text-2xl font-extrabold text-slate-500">VS</div>
            <div className="w-px flex-1 bg-slate-700" />
          </div>

          <div className="flex-1"><CharacterCard student={opponent} label="상대" isMe={false} /></div>
        </div>

        {/* 상대 바꾸기 */}
        <button onClick={changeOpponent} disabled={!canChange || isBusy}
          className={`w-full py-3 rounded-2xl font-bold text-sm mb-3 transition-all border
            ${canChange && !isBusy
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600 active:scale-95'
              : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'}`}>
          {changes >= MAX_CHANGES ? '변경 횟수 소진'
            : (me?.diamonds || 0) < CHANGE_COST ? `💎 부족 (${CHANGE_COST}💎 필요)`
            : `🔄 상대 바꾸기 (-💎${CHANGE_COST})  ·  ${MAX_CHANGES - changes}회 남음`}
        </button>

        {/* 대련 시작 */}
        <button onClick={startBattle} disabled={isBusy}
          className="w-full py-4 rounded-2xl font-extrabold text-lg bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white shadow-lg shadow-rose-900 transition-all active:scale-95 disabled:opacity-50">
          {isBusy ? '처리 중...' : '⚔️ 대련 시작!'}
        </button>

        <p className="text-center text-[10px] text-slate-600 mt-2">
          * 이용권 1개 소비 · 대련 시작 후 취소 불가
        </p>
      </div>
    );
  }

  // ── 결과 ────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    return (
      <div className="min-h-full bg-gradient-to-b from-slate-950 to-indigo-950">
        <ResultScreen
          isWin={result.isWin}
          opponent={opponent}
          reward={result.reward}
          onClose={reset}
        />
      </div>
    );
  }

  return null;
}
