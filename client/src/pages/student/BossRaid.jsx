import React, { useState, useEffect, useRef } from 'react';
import { fireProjectile } from '../../utils/projectile';
import {
  collection, doc, updateDoc, onSnapshot,
  increment, serverTimestamp, getDoc, deleteField,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { MONSTERS_DB } from '../../data/monsterData';
import SpriteMonster from '../../components/SpriteMonster';

// ── HP 바 ────────────────────────────────────────────────────────
function BossHpBar({ current, max }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round(current / max * 100))) : 0;
  const col  = pct > 60 ? 'from-emerald-400 to-emerald-600'
             : pct > 30 ? 'from-amber-400   to-amber-600'
             :             'from-rose-500    to-rose-700';
  return (
    <div>
      <div className="flex justify-between text-sm font-bold text-white mb-1.5">
        <span>보스 HP</span>
        <span>{Math.max(0, current).toLocaleString()} / {max.toLocaleString()}</span>
      </div>
      <div className="w-full h-5 bg-slate-700 rounded-full overflow-hidden shadow-inner">
        <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${col}`}
          style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right text-xs text-slate-400 mt-0.5">{pct}%</div>
    </div>
  );
}

// ── 보스 스프라이트 (SpriteMonster 래퍼) ─────────────────────────
function BossSprite({ bossData, anim, flash, scale = 2, onAnimEnd }) {
  if (!bossData) return <div className="text-8xl select-none">🐉</div>;
  return (
    <SpriteMonster
      data={bossData}
      anim={anim}
      scale={bossData.scale * scale}
      flash={flash}
      onAnimEnd={onAnimEnd}
    />
  );
}

// ── 타이머 링 ────────────────────────────────────────────────────
function TimerRing({ timeLeft, duration }) {
  const pct = duration > 0 ? timeLeft / duration : 0;
  const r   = 18;
  const circ = 2 * Math.PI * r;
  const col = timeLeft > duration * 0.4 ? '#22c55e'
            : timeLeft > duration * 0.2 ? '#f59e0b'
            : '#ef4444';
  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      <svg className="absolute inset-0" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#334155" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={col} strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
          style={{ transition: 'stroke-dashoffset 0.4s linear' }}
        />
      </svg>
      <span className="text-sm font-extrabold text-white">{timeLeft}</span>
    </div>
  );
}

// ── 참가자 로스터 (하단) ─────────────────────────────────────────
function ParticipantRoster({ participants, currentQuestionIdx }) {
  const list = Object.entries(participants)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));

  if (list.length === 0) return null;

  const getStatus = (p) => {
    if (p.lastAnsweredIdx !== currentQuestionIdx) return 'pending';
    return p.lastAnsweredCorrect ? 'correct' : 'wrong';
  };

  return (
    <div className="bg-slate-900 border-t border-slate-700">
      <div className="flex gap-2.5 px-3 py-2.5 overflow-x-auto scrollbar-none">
        {list.map(p => {
          const st = getStatus(p);
          return (
            <div key={p.id} className="flex flex-col items-center gap-1 shrink-0 w-28">
              <div className="relative">
                {p.characterImage
                  ? <div className="w-24 h-24 rounded-xl bg-slate-800 border border-slate-600 flex items-center justify-center">
                      <img src={p.characterImage} alt=""
                        className="w-full h-full object-contain"
                        style={{ imageRendering: 'pixelated' }} />
                    </div>
                  : <div className="w-24 h-24 rounded-xl bg-slate-700 flex items-center justify-center text-4xl">🧑</div>
                }
                <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold
                  ${st === 'correct' ? 'bg-emerald-500' : st === 'wrong' ? 'bg-rose-500' : 'bg-slate-600'}`}>
                  {st === 'correct' ? '✓' : st === 'wrong' ? '✗' : '○'}
                </div>
              </div>
              <div className="text-xs text-slate-300 font-bold truncate w-full text-center">
                {(p.name || '학생').slice(0, 4)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 없는 레이드 화면 ─────────────────────────────────────────────
function NoBossScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col items-center justify-center p-8 text-center">
      <div className="text-7xl mb-5 opacity-40 animate-pulse">🐉</div>
      <p className="font-extrabold text-xl text-slate-400 mb-2">활성화된 보스 레이드가 없습니다</p>
      <p className="text-slate-500 text-sm">선생님이 레이드를 열면 여기에 표시됩니다</p>
    </div>
  );
}

// ── 뷰포트 진입 시에만 스프라이트 로드 (대용량 PNG 렉 방지) ────────
function LazySprite({ data, scale, w = 60, h = 60 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: w, height: h }} className="flex items-center justify-center">
      {visible && <SpriteMonster data={data} anim="idle" scale={scale} frozen />}
    </div>
  );
}

// ── 초기 소개 화면 ─────────────────────────────────────────────────
function IntroScreen({ raid, bossData, onEnter }) {
  const bossList = Object.entries(MONSTERS_DB)
    .filter(([, m]) => m.tier === 'boss')
    .map(([id, m]) => ({ id, ...m }));

  const isOpen = raid && (raid.status === 'waiting' || raid.status === 'active');

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 overflow-y-auto">
      {/* 헤더 */}
      <div className="flex flex-col items-center px-6 pt-8 pb-4 text-center">
        <div className="text-xs font-extrabold text-rose-400 tracking-widest mb-2 uppercase">World Boss Raid</div>
        <h1 className="text-3xl font-extrabold text-white mb-3">보스 레이드</h1>
        <p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-6">
          학급 전원이 힘을 합쳐 강력한 보스를 쓰러뜨려라!<br/>
          퀴즈를 맞출수록 보스에게 더 큰 데미지를 입힙니다.
        </p>

        {/* 레이드 오픈 현황 */}
        {isOpen ? (
          <div className="w-full max-w-sm bg-rose-900/40 border border-rose-600/60 rounded-3xl p-5 mb-6">
            <div className="text-xs font-extrabold text-rose-400 tracking-widest mb-1">🔥 레이드 오픈!</div>
            <div className="text-xl font-extrabold text-white mb-1">{raid.bossName}</div>
            <div className="text-sm text-slate-400 mb-4">
              {raid.status === 'waiting' ? '대기 중 — 지금 입장 가능!' : '⚔️ 전투 진행 중'}
            </div>
            {bossData && (
              <div className="flex justify-center mb-4">
                <BossSprite bossData={bossData} anim="idle" scale={1.6} />
              </div>
            )}
            <button
              onClick={onEnter}
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-base rounded-2xl shadow-lg transition-all">
              ⚔️ 입장하기
            </button>
          </div>
        ) : (
          <div className="w-full max-w-sm bg-slate-800/60 border border-slate-700 rounded-3xl p-5 mb-6 text-center">
            <div className="text-4xl mb-3 opacity-40">🔒</div>
            <div className="text-slate-400 font-bold">현재 오픈된 레이드가 없습니다</div>
            <div className="text-slate-500 text-xs mt-1">선생님이 레이드를 열면 여기에 표시됩니다</div>
          </div>
        )}
      </div>

      {/* 보스 도감 */}
      <div className="px-4 pb-10">
        <div className="text-sm font-extrabold text-slate-300 mb-3 px-1">등장 보스 도감 ({bossList.length}종)</div>
        <div className="grid grid-cols-3 gap-2.5">
          {bossList.map(m => {
            const sc = Math.min(52 / m.frameHeight, 52 / m.frameWidth) * 0.85;
            return (
              <div key={m.id} className="flex flex-col items-center gap-1 bg-slate-900/60 border border-slate-700/60 rounded-2xl px-2 pt-3 pb-2">
                <LazySprite data={m} scale={sc} w={60} h={60} />
                <span className="text-[9px] font-bold text-slate-400 text-center truncate w-full">{m.name || m.id}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 교사용 레이드 시작 함수
const teacherStartRaid = async (raidId) => {
  await updateDoc(doc(db, 'worldBossRaids', raidId), {
    status:             'active',
    currentQuestionIdx: 0,
    questionStartedAt:  serverTimestamp(),
    startedAt:          serverTimestamp(),
  });
};

// ── 대기실 (Lobby) ────────────────────────────────────────────────
function LobbyPhase({ raid, bossData, myId, isTeacher }) {
  const participants  = raid.participants || {};
  const pList = Object.entries(participants)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0));

  // 보스 랜덤 애니
  const [bossLobbyAnim, setBossLobbyAnim] = useState('idle');
  const lobbyTimerRef = useRef(null);

  const scheduleNext = () => {
    const delay = 2500 + Math.random() * 2500; // 2.5~5초 후
    lobbyTimerRef.current = setTimeout(() => {
      const pick = Math.random();
      if (pick < 0.45) {
        setBossLobbyAnim('attack'); // attack은 loop:false → onAnimEnd로 복귀
      } else if (pick < 0.75) {
        setBossLobbyAnim('run');
        setTimeout(() => { setBossLobbyAnim('idle'); scheduleNext(); }, 1400);
      } else {
        setBossLobbyAnim('idle');
        scheduleNext();
      }
    }, delay);
  };

  useEffect(() => {
    scheduleNext();
    return () => clearTimeout(lobbyTimerRef.current);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 overflow-y-auto">
      {/* 보스 배너 */}
      <div className="flex flex-col items-center px-6 pt-6 pb-4">
        <div className="text-xs font-extrabold text-rose-400 tracking-widest mb-1 uppercase">World Boss Raid</div>
        <h1 className="text-2xl font-extrabold text-white mb-4">{raid.bossName}</h1>

        {/* 보스 스프라이트 */}
        <div className="flex items-end justify-center mb-4 bg-slate-900/60 rounded-3xl px-8 py-4 shadow-2xl border border-slate-700">
          <BossSprite bossData={bossData} anim={bossLobbyAnim} scale={2.0}
            onAnimEnd={() => { setBossLobbyAnim('idle'); scheduleNext(); }} />
        </div>

        {/* HP */}
        <div className="w-full max-w-sm mb-3">
          <BossHpBar current={raid.maxHP} max={raid.maxHP} />
        </div>

        {/* 레이드 정보 */}
        <div className="flex gap-3 text-center text-sm mb-4">
          <div className="bg-slate-800/80 rounded-2xl px-3 py-2 border border-slate-700">
            <div className="font-extrabold text-white">{raid.questionDuration}초</div>
            <div className="text-slate-400 text-xs">문제당 시간</div>
          </div>
          <div className="bg-slate-800/80 rounded-2xl px-3 py-2 border border-slate-700">
            <div className="font-extrabold text-white">{(raid.questions || []).length}문제</div>
            <div className="text-slate-400 text-xs">총 문제 수</div>
          </div>
          <div className="bg-slate-800/80 rounded-2xl px-3 py-2 border border-slate-700">
            <div className="font-extrabold text-white">{raid.damagePerHit}</div>
            <div className="text-slate-400 text-xs">정답당 데미지</div>
          </div>
        </div>

        {/* 보상 */}
        <div className="bg-amber-900/40 border border-amber-700/50 rounded-2xl px-5 py-2.5 mb-4 flex gap-4 text-sm font-extrabold">
          {(raid.rewards?.gold    || 0) > 0 && <span className="text-amber-400">🪙 {raid.rewards.gold}G</span>}
          {(raid.rewards?.exp     || 0) > 0 && <span className="text-indigo-300">⭐ {raid.rewards.exp} EXP</span>}
          {(raid.rewards?.diamond || 0) > 0 && <span className="text-blue-300">💎 {raid.rewards.diamond}</span>}
        </div>

        {isTeacher ? (
          <button
            onClick={() => teacherStartRaid(raid.id)}
            className="px-10 py-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-lg rounded-2xl shadow-lg shadow-rose-900/40 transition-all">
            ⚔️ 레이드 시작 ({pList.length}명 대기 중)
          </button>
        ) : (
          <div className="flex items-center gap-2 text-slate-400 text-sm animate-pulse">
            <span className="text-lg">⏳</span>
            <span className="font-bold">선생님이 시작 버튼을 누르면 배틀이 시작됩니다!</span>
          </div>
        )}
      </div>

      {/* 참가자 목록 - 바로 아래 */}
      <div className="border-t border-slate-700/60 px-4 py-4">
        <div className="text-sm font-bold text-slate-300 mb-3">
          접속 중 {pList.length}명
          {!isTeacher && participants[myId] && <span className="text-emerald-400 ml-2">✓ 입장 완료</span>}
        </div>
        {pList.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-4">아직 참가자가 없습니다</div>
        ) : (
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
            {pList.map(p => (
              <div key={p.id}
                className={`flex flex-col items-center gap-1 p-1 rounded-xl border transition-all
                  ${!isTeacher && p.id === myId
                    ? 'border-emerald-500 bg-emerald-900/30'
                    : 'border-slate-700 bg-slate-800/60'}`}>
                {p.characterImage
                  ? <div className="w-full rounded-lg bg-slate-700 overflow-hidden flex items-center justify-center" style={{ aspectRatio: '1', minHeight: 26 }}>
                      <img src={p.characterImage} alt=""
                        className="w-full h-full object-contain"
                        style={{ imageRendering: 'pixelated', transform: 'scale(2.7)', transformOrigin: 'center' }} />
                    </div>
                  : <div className="w-full rounded-lg bg-slate-700 flex items-center justify-center text-xl" style={{ aspectRatio: '1', minHeight: 26 }}>🧑</div>
                }
                <span className={`text-[9px] font-bold text-center truncate w-full leading-tight
                  ${!isTeacher && p.id === myId ? 'text-emerald-300' : 'text-slate-200'}`}>
                  {p.name || '학생'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 배틀 ─────────────────────────────────────────────────────────
function BattlePhase({ raid, bossData, myId, myAnswer, timeLeft, bossAnim, bossFlash, onAnswer }) {
  const questions = (raid.questions || []).filter(q => q.type !== 'short');
  const qIdx      = raid.currentQuestionIdx ?? 0;
  const q         = questions[qIdx];
  const totalQ    = questions.length;
  const myP       = raid.participants?.[myId] || {};
  const bossAreaRef = useRef(null);

  const alreadyAnswered = myP.lastAnsweredIdx === qIdx || myAnswer !== null;
  const displayAnswer   = myAnswer ?? (alreadyAnswered
    ? { idx: -1, correct: myP.lastAnsweredCorrect }
    : null);

  // ── 킬피드 (정답자 이름 피드) ───────────────────────────────────
  const [hitFeed, setHitFeed] = useState([]);
  const feedPrevRef = useRef({});
  const feedIdRef   = useRef(0);

  useEffect(() => {
    if (!raid?.participants) return;
    const prev = feedPrevRef.current;
    const newHits = [];
    Object.entries(raid.participants).forEach(([id, p]) => {
      const prevP = prev[id];
      if (!prevP) return;
      if ((p.correctCount || 0) > (prevP.correctCount || 0)) {
        newHits.push({ uid: feedIdRef.current++, name: p.name || '학생', damage: raid.damagePerHit || 100, ts: Date.now() });
      }
    });
    const next = {};
    Object.entries(raid.participants).forEach(([id, p]) => { next[id] = { correctCount: p.correctCount || 0 }; });
    feedPrevRef.current = next;
    if (newHits.length === 0) return;
    setHitFeed(cur => [...newHits, ...cur].slice(0, 10));
  }, [raid?.participants]);

  // 5초 후 오래된 항목 제거
  useEffect(() => {
    if (hitFeed.length === 0) return;
    const t = setTimeout(() => {
      const now = Date.now();
      setHitFeed(cur => cur.filter(h => now - h.ts < 5000));
    }, 5000);
    return () => clearTimeout(t);
  }, [hitFeed]);

  // 정답/오답 시 파티클 발사
  useEffect(() => {
    if (myAnswer === null) return;
    const el = bossAreaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const bossCX  = rect.left + rect.width / 2;
    const bossY   = rect.top + rect.height * 0.4;
    const playerX = window.innerWidth / 2;
    const playerY = window.innerHeight - 100;
    if (myAnswer.correct) {
      fireProjectile({ from: { x: playerX, y: playerY }, to: { x: bossCX, y: bossY }, type: 'magic' });
    } else {
      fireProjectile({ from: { x: bossCX, y: bossY },   to: { x: playerX, y: playerY }, type: 'fire' });
    }
  }, [myAnswer]);

  if (!q) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
      문제를 불러오는 중...
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* 상단: HP 바 */}
      <div className="bg-slate-900 px-4 pt-3 pb-4 shadow-lg">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="font-bold text-white">{raid.bossName}</span>
          <span>👥 {Object.keys(raid.participants || {}).length}명 참전</span>
        </div>
        <BossHpBar current={raid.currentHP} max={raid.maxHP} />
      </div>

      {/* 보스 스프라이트 영역 */}
      <div ref={bossAreaRef} className="bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center relative py-6 min-h-[260px]">
        <BossSprite bossData={bossData} anim={bossAnim} flash={bossFlash} scale={3.0} />

        {/* 킬피드 — 우측 세로 목록 */}
        {hitFeed.length > 0 && (
          <div className="absolute right-3 top-3 flex flex-col gap-1 items-end pointer-events-none z-10 max-w-[160px]">
            {hitFeed.map((h, i) => (
              <div key={h.uid}
                className="flex items-center gap-1.5 bg-slate-900/85 border border-emerald-600/50 text-emerald-300 text-[11px] font-bold px-2.5 py-1 rounded-xl backdrop-blur-sm"
                style={{ opacity: Math.max(0.35, 1 - i * 0.09) }}>
                <span className="truncate max-w-[90px]">⚔️ {h.name}</span>
                <span className="text-rose-400 shrink-0">-{h.damage}</span>
              </div>
            ))}
          </div>
        )}

        {/* 데미지 이펙트 */}
        {myAnswer?.correct && (
          <div className="absolute top-4 right-8 text-yellow-300 font-extrabold text-2xl animate-bounce pointer-events-none">
            💥 -{raid.damagePerHit}!
          </div>
        )}
        {myAnswer !== null && !myAnswer?.correct && (
          <div className="absolute top-4 left-8 text-slate-400 font-bold text-base animate-bounce pointer-events-none">
            빗나감...
          </div>
        )}

        {/* 내 데미지 / 정답 수 */}
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-3">
          <span className="bg-slate-900/80 text-rose-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
            💥 내 데미지 {(myP.totalDamage || 0).toLocaleString()}
          </span>
          <span className="bg-slate-900/80 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
            ✓ {myP.correctCount || 0}정답
          </span>
        </div>
      </div>

      {/* 문제 영역 */}
      <div className="flex-1 bg-slate-950 p-4 space-y-3">
        {/* 문제 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-slate-400">Q{qIdx + 1}/{totalQ}</span>
            <div className="h-1.5 w-24 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${((qIdx + 1) / totalQ) * 100}%` }} />
            </div>
          </div>
          {raid.autoAdvance && timeLeft !== null && (
            <TimerRing timeLeft={timeLeft} duration={raid.questionDuration} />
          )}
        </div>

        {/* 문제 */}
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
          <p className="font-bold text-white text-base leading-relaxed">{q.question}</p>
        </div>

        {/* 보기 */}
        <div className="grid grid-cols-2 gap-2.5">
          {(q.options || []).map((opt, oi) => {
            let cls = 'bg-slate-800 border-2 border-slate-700 text-slate-200 hover:border-rose-400 hover:bg-slate-700 active:scale-95';
            if (displayAnswer !== null) {
              if (oi === q.answer)                   cls = 'bg-emerald-900/60 border-2 border-emerald-500 text-emerald-200';
              else if (oi === displayAnswer?.idx)     cls = 'bg-rose-900/40 border-2 border-rose-500 text-rose-300';
              else                                    cls = 'bg-slate-800/50 border-2 border-slate-700 text-slate-500 opacity-50';
            }
            return (
              <button key={oi} onClick={() => onAnswer(oi)}
                disabled={alreadyAnswered}
                className={`py-3 px-3 rounded-2xl font-bold text-sm text-left transition-all ${cls}`}>
                <span className="text-xs opacity-60 mr-1">{['①','②','③','④'][oi]}</span>
                {opt}
              </button>
            );
          })}
        </div>

        {/* 정답/해설 */}
        {displayAnswer !== null && (
          <div className={`rounded-xl p-3 text-sm font-medium leading-relaxed
            ${displayAnswer?.correct
              ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700'
              : 'bg-rose-900/30 text-rose-300 border border-rose-800'}`}>
            {displayAnswer?.correct ? '✅ 정답!' : `❌ 정답: ${q.options?.[q.answer]}`}
            {q.explanation && <span className="ml-1 opacity-80">{q.explanation}</span>}
          </div>
        )}
      </div>

      {/* 하단: 참가자 로스터 */}
      <ParticipantRoster participants={raid.participants || {}} currentQuestionIdx={qIdx} />
    </div>
  );
}

// ── 결과 화면 ─────────────────────────────────────────────────────
function ResultPhase({ raid, myId, bossData, onGoToIntro }) {
  const isCleared = raid.status === 'cleared';
  const myP       = raid.participants?.[myId] || {};
  const sorted    = Object.entries(raid.participants || {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));
  const myRank    = sorted.findIndex(p => p.id === myId) + 1;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col items-center justify-center p-6 text-center">
      {/* 보스 최종 상태 */}
      <div className="flex items-end justify-center mb-4" style={{ height: 120 }}>
        <BossSprite bossData={bossData} anim={isCleared ? 'death' : 'idle'} scale={1.8} />
      </div>

      <div className="text-5xl mb-3">{isCleared ? '🏆' : '💀'}</div>
      <h2 className="text-3xl font-extrabold text-white mb-1">
        {isCleared ? '보스 처치 성공!' : '레이드 실패...'}
      </h2>
      <p className="text-slate-400 text-sm mb-6">{raid.bossName}</p>

      {/* 내 기여도 */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 w-full max-w-xs mb-4 shadow-lg">
        <div className="text-xs text-slate-400 font-bold mb-3">내 기여도</div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xl font-extrabold text-rose-400">💥 {(myP.totalDamage || 0).toLocaleString()}</div>
            <div className="text-[10px] text-slate-400">총 데미지</div>
          </div>
          <div>
            <div className="text-xl font-extrabold text-emerald-400">{myP.correctCount || 0}</div>
            <div className="text-[10px] text-slate-400">정답 수</div>
          </div>
          <div>
            <div className="text-xl font-extrabold text-amber-400">
              {myRank > 0 ? `${myRank}위` : '-'}
            </div>
            <div className="text-[10px] text-slate-400">기여 순위</div>
          </div>
        </div>
      </div>

      {/* 보상 (선생님이 지급) */}
      {isCleared && (raid.rewards?.gold || raid.rewards?.exp || raid.rewards?.diamond) && (
        <div className="bg-amber-900/40 border border-amber-700/50 rounded-2xl p-4 w-full max-w-xs mb-4">
          <div className="font-bold text-amber-300 text-sm mb-2">
            🎁 클리어 보상 {raid.rewardsPaid ? '(지급 완료!)' : '(선생님이 지급 예정)'}
          </div>
          <div className="flex justify-center gap-4 font-extrabold text-sm">
            {(raid.rewards?.gold    || 0) > 0 && <span className="text-amber-400">🪙 {raid.rewards.gold}G</span>}
            {(raid.rewards?.exp     || 0) > 0 && <span className="text-indigo-300">⭐ {raid.rewards.exp} EXP</span>}
            {(raid.rewards?.diamond || 0) > 0 && <span className="text-blue-300">💎 {raid.rewards.diamond}</span>}
          </div>
        </div>
      )}

      {/* 초기화면으로 */}
      {onGoToIntro && (
        <button
          onClick={onGoToIntro}
          className="mt-2 mb-2 px-8 py-3 bg-slate-700 hover:bg-slate-600 active:scale-95 text-white font-bold rounded-2xl transition-all">
          🏠 초기화면으로
        </button>
      )}

      {/* 전체 기여도 */}
      {sorted.length > 0 && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-xs overflow-hidden shadow-lg">
          <div className="px-4 py-2 bg-slate-700 text-xs font-bold text-slate-300">
            참가자 기여도 ({sorted.length}명)
          </div>
          <div className="divide-y divide-slate-700 max-h-52 overflow-y-auto">
            {sorted.map((p, idx) => (
              <div key={p.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${p.id === myId ? 'bg-indigo-900/30' : ''}`}>
                <span className="text-xs font-extrabold text-slate-500 w-5">{idx + 1}</span>
                {p.characterImage
                  ? <img src={p.characterImage} alt="" className="w-7 h-7 rounded-lg object-contain bg-slate-700" />
                  : <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-sm">🧑</div>
                }
                <span className="flex-1 text-sm font-bold text-slate-200 truncate">
                  {p.name || '학생'} {p.id === myId && <span className="text-indigo-400 text-[10px]">(나)</span>}
                </span>
                <div className="text-right shrink-0">
                  <div className="text-xs font-extrabold text-rose-400">💥 {(p.totalDamage || 0).toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500">{p.correctCount || 0}정답</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export default function BossRaid({ studentCode, studentDocId, isTeacher = false }) {
  const [raid, setRaid]           = useState(undefined); // undefined=로딩, null=없음
  const [studentData, setStudentData] = useState(null);
  const [showIntro, setShowIntro] = useState(true);

  // 내 답변 상태 (로컬)
  const [myAnswer, setMyAnswer]   = useState(null);  // { idx, correct } | null
  const [bossAnim, setBossAnim]   = useState('idle');
  const [bossFlash, setBossFlash] = useState(false);
  const [timeLeft, setTimeLeft]   = useState(null);

  const prevHpRef          = useRef(null);
  const advancedRef        = useRef(-1);
  const timerRef           = useRef(null);
  const raidRef            = useRef(null);
  const prevParticipantsRef = useRef({});

  // 학생 데이터 로드
  useEffect(() => {
    if (!studentDocId) return;
    getDoc(doc(db, 'students', studentDocId)).then(snap => {
      if (snap.exists()) setStudentData({ id: snap.id, ...snap.data() });
    });
  }, [studentDocId]);

  // raidRef 최신 raid 추적 (언마운트 시 사용)
  useEffect(() => { raidRef.current = raid; }, [raid]);

  // 페이지 이탈 시 대기실에서 자동 제거
  useEffect(() => {
    return () => {
      const r = raidRef.current;
      if (isTeacher || !r || r.status !== 'waiting' || !studentDocId) return;
      updateDoc(doc(db, 'worldBossRaids', r.id), {
        [`participants.${studentDocId}`]: deleteField(),
      }).catch(() => {});
    };
  }, []);

  // 레이드 실시간 리스닝 (컬렉션 전체 — 소규모)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'worldBossRaids'), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      // 1순위: waiting/active
      const open = all.find(r => r.status === 'waiting' || r.status === 'active');
      if (open) { setRaid(open); return; }

      // 2순위: 내가 참여한 최근 ended
      const ended = all.find(r =>
        (r.status === 'cleared' || r.status === 'failed') &&
        r.participants?.[studentDocId]
      );
      setRaid(ended || null);
    });
    return () => unsub();
  }, [studentDocId]);

  // 대기실 자동 입장 (교사 모드에서는 참가자로 등록 안 함)
  useEffect(() => {
    if (isTeacher) return;
    if (!raid || raid.status !== 'waiting' || !studentDocId || !studentData) return;
    if (raid.participants?.[studentDocId]) return;
    updateDoc(doc(db, 'worldBossRaids', raid.id), {
      [`participants.${studentDocId}`]: {
        name:               studentData.name || studentData.studentCode || '학생',
        characterImage:     studentData.characterImage || '',
        joinedAt:           serverTimestamp(),
        totalDamage:        0,
        correctCount:       0,
        wrongCount:         0,
        answeredCount:      0,
        lastAnsweredIdx:    -1,
        lastAnsweredCorrect: false,
      },
    }).catch(() => {});
  }, [raid?.id, raid?.status, studentDocId, studentData, isTeacher]);

  // 인트로 화면에서 레이드가 active로 전환되면 자동 입장
  useEffect(() => {
    if (showIntro && raid?.status === 'active' && raid.participants?.[studentDocId]) {
      setShowIntro(false);
    }
  }, [raid?.status]);

  // 문제 바뀌면 내 답변 초기화
  useEffect(() => {
    setMyAnswer(null);
    setBossAnim('idle');
  }, [raid?.currentQuestionIdx]);

  // 보스 HP 변화 → 피격 이펙트
  useEffect(() => {
    if (!raid || raid.status !== 'active') return;
    if (prevHpRef.current !== null && raid.currentHP < prevHpRef.current) {
      setBossFlash(true);
      setBossAnim('attack');
      const t = setTimeout(() => { setBossFlash(false); setBossAnim('idle'); }, 400);
      return () => clearTimeout(t);
    }
    prevHpRef.current = raid.currentHP;

    // HP 0 → 클리어 전환 시도
    if (raid.currentHP <= 0 && raid.status === 'active') {
      updateDoc(doc(db, 'worldBossRaids', raid.id), {
        status: 'cleared', clearedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }, [raid?.currentHP]);

  // 클리어/실패 시 보스 애니
  useEffect(() => {
    if (raid?.status === 'cleared') setBossAnim('death');
  }, [raid?.status]);

  // 다른 참가자 답변 실시간 파티클 공유 (item 6)
  useEffect(() => {
    if (!raid?.participants || raid.status !== 'active') return;
    const prev = prevParticipantsRef.current;
    const cx = window.innerWidth / 2;
    const bossY  = window.innerHeight * 0.32;
    const playerY = window.innerHeight - 100;

    Object.entries(raid.participants).forEach(([id, p]) => {
      if (id === studentDocId) return; // 자신은 myAnswer로 처리
      const prevP = prev[id];
      if (!prevP) return; // 첫 스냅샷은 기준값만 설정
      if ((p.correctCount || 0) > (prevP.correctCount || 0)) {
        fireProjectile({ from: { x: cx, y: playerY }, to: { x: cx, y: bossY }, type: 'magic' });
      }
      if ((p.wrongCount || 0) > (prevP.wrongCount || 0)) {
        fireProjectile({ from: { x: cx, y: bossY }, to: { x: cx, y: playerY }, type: 'fire' });
      }
    });

    // 이번 스냅샷을 기준값으로 저장
    const next = {};
    Object.entries(raid.participants).forEach(([id, p]) => {
      next[id] = { correctCount: p.correctCount || 0, wrongCount: p.wrongCount || 0 };
    });
    prevParticipantsRef.current = next;
  }, [raid?.participants]);

  // 타이머
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!raid || raid.status !== 'active' || !raid.questionStartedAt) {
      setTimeLeft(null);
      return;
    }
    const tick = () => {
      const started = raid.questionStartedAt.toDate?.()?.getTime?.() ?? Date.now();
      const elapsed = (Date.now() - started) / 1000;
      const dur     = raid.questionDuration || 20;
      const left    = Math.max(0, Math.ceil(dur - elapsed));
      setTimeLeft(left);
      if (left === 0 && raid.autoAdvance) tryAdvance();
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => clearInterval(timerRef.current);
  }, [raid?.currentQuestionIdx, raid?.questionStartedAt]);

  const tryAdvance = async () => {
    if (!raid || raid.status !== 'active') return;
    if (advancedRef.current === raid.currentQuestionIdx) return;
    advancedRef.current = raid.currentQuestionIdx;

    const questions = (raid.questions || []).filter(q => q.type !== 'short');
    const nextIdx   = raid.currentQuestionIdx + 1;

    if (nextIdx >= questions.length || raid.currentHP <= 0) {
      updateDoc(doc(db, 'worldBossRaids', raid.id), {
        status: raid.currentHP <= 0 ? 'cleared' : 'failed',
        clearedAt: serverTimestamp(),
      }).catch(() => {});
    } else {
      updateDoc(doc(db, 'worldBossRaids', raid.id), {
        currentQuestionIdx: nextIdx,
        questionStartedAt:  serverTimestamp(),
      }).catch(() => {});
    }
  };

  const submitAnswer = async (answerIdx) => {
    if (!raid || !studentDocId || raid.status !== 'active') return;
    if (myAnswer !== null) return;

    const myP = raid.participants?.[studentDocId];
    if (myP?.lastAnsweredIdx === raid.currentQuestionIdx) return;

    const questions = (raid.questions || []).filter(q => q.type !== 'short');
    const q = questions[raid.currentQuestionIdx];
    if (!q) return;

    const correct = answerIdx === q.answer;
    setMyAnswer({ idx: answerIdx, correct });

    const updates = {
      [`participants.${studentDocId}.lastAnsweredIdx`]:    raid.currentQuestionIdx,
      [`participants.${studentDocId}.lastAnsweredCorrect`]: correct,
      [`participants.${studentDocId}.answeredCount`]:      increment(1),
      [`participants.${studentDocId}.qResults.${raid.currentQuestionIdx}`]: correct ? 1 : 0,
    };
    if (correct) {
      updates.currentHP = increment(-raid.damagePerHit);
      updates[`participants.${studentDocId}.totalDamage`]  = increment(raid.damagePerHit);
      updates[`participants.${studentDocId}.correctCount`] = increment(1);
    } else {
      updates[`participants.${studentDocId}.wrongCount`] = increment(1);
      if (raid.penaltyType === 'hp_restore' && (raid.penaltyAmount || 0) > 0) {
        updates.currentHP = increment(raid.penaltyAmount);
      }
    }

    await updateDoc(doc(db, 'worldBossRaids', raid.id), updates).catch(() => {});
  };

  // ── 렌더링 ──────────────────────────────────────────────────
  const bossData = raid?.bossId ? MONSTERS_DB[raid.bossId] : null;
  const isOpen   = raid && (raid.status === 'waiting' || raid.status === 'active');

  // 초기 소개 화면
  if (showIntro) {
    return (
      <IntroScreen
        raid={isOpen ? raid : null}
        bossData={isOpen ? bossData : null}
        onEnter={() => setShowIntro(false)}
      />
    );
  }

  if (raid === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-sm font-bold animate-pulse">로딩 중...</div>
      </div>
    );
  }

  if (!raid) return <IntroScreen raid={null} bossData={null} onEnter={() => {}} />;

  // 레이드가 active인데 내가 참가자가 아닌 경우 (늦은 접속, 학생 전용)
  if (!isTeacher && raid.status === 'active' && !raid.participants?.[studentDocId]) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
        <div className="flex items-end justify-center mb-4" style={{ height: 100 }}>
          <BossSprite bossData={bossData} anim="idle" scale={1.8} />
        </div>
        <h2 className="text-xl font-extrabold text-white mb-2">레이드 진행 중</h2>
        <p className="text-slate-400 text-sm">이미 시작된 레이드에는 참가할 수 없습니다.</p>
        <p className="text-slate-500 text-xs mt-2">다음 레이드를 기다려주세요!</p>
        <button onClick={() => setShowIntro(true)}
          className="mt-5 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-2xl transition-all">
          🏠 초기화면으로
        </button>
      </div>
    );
  }

  if (raid.status === 'waiting') {
    return <LobbyPhase raid={raid} bossData={bossData} myId={studentDocId} isTeacher={isTeacher} />;
  }

  if (raid.status === 'active') {
    return (
      <BattlePhase
        raid={raid}
        bossData={bossData}
        myId={studentDocId}
        myAnswer={myAnswer}
        timeLeft={timeLeft}
        bossAnim={bossAnim}
        bossFlash={bossFlash}
        onAnswer={submitAnswer}
      />
    );
  }

  // cleared / failed
  return <ResultPhase raid={raid} myId={studentDocId} bossData={bossData} onGoToIntro={() => setShowIntro(true)} />;
}
