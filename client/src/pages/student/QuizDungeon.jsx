import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, getDocs, getDoc, doc, writeBatch,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import SpriteMonster from '../../components/SpriteMonster';
import { MONSTERS_DB, DIFF_MONSTER, TIER_LABEL, TIER_COST, generateWaves } from '../../data/monsterData';

// ── 유틸 ──────────────────────────────────────────────────────
const getMaxExpForLevel = (lv) =>
  lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;

const calcLevelUp = (currentLevel, currentExp, currentMaxExp, gainedExp) => {
  let level = currentLevel || 1;
  let exp   = (currentExp || 0) + gainedExp;
  let maxExp = currentMaxExp || getMaxExpForLevel(level);
  let leveled = false;
  while (exp >= maxExp && level < 99) {
    exp -= maxExp; level++; maxExp = getMaxExpForLevel(level); leveled = true;
  }
  return { level, exp, maxExp, leveled };
};

const toStars = (acc) => acc >= 90 ? 3 : acc >= 70 ? 2 : acc >= 50 ? 1 : 0;
const hpGrad  = (pct) =>
  pct > 60 ? 'from-emerald-400 to-emerald-500'
  : pct > 30 ? 'from-amber-400 to-amber-500'
  : 'from-rose-400 to-rose-500';

// ── 상수 ──────────────────────────────────────────────────────
// PLAYER_MAX_HP는 totalQ * DAMAGE_WRONG 으로 동적 계산 (모든 문제 틀리면 HP=0)
const DAMAGE_WRONG  = 150;
const DAMAGE_RIGHT  = 100;
const DIFF_TIMER    = { easy: 15, normal: 12, hard: 8 };

const MONSTER = {
  easy:   { name: '지식의 슬라임', emoji: '🟢', desc: '기본 개념을 확인하세요!', monsterId: DIFF_MONSTER.easy   },
  normal: { name: '수학의 골렘',   emoji: '🗿', desc: '집중력이 필요합니다!',    monsterId: DIFF_MONSTER.normal },
  hard:   { name: '시험의 드래곤', emoji: '🐉', desc: '최고 난이도! 도전하세요!', monsterId: DIFF_MONSTER.hard  },
};

const DIFF_BADGE = {
  easy:   'bg-emerald-500',
  normal: 'bg-sky-500',
  hard:   'bg-rose-500',
};

const COMBO_CFG = [
  { min: 5, label: '⚡ MAX COMBO!', mult: 2.0, cls: 'bg-yellow-500 text-yellow-900' },
  { min: 3, label: '🔥 FEVER!',     mult: 1.5, cls: 'bg-orange-500 text-white'      },
  { min: 2, label: '🎯 COMBO',      mult: 1.0, cls: 'bg-sky-500 text-white'         },
];

const getComboLv = (n) => COMBO_CFG.find(c => n >= c.min) || null;

// ── SVG 원형 타이머 ────────────────────────────────────────────
function CircleTimer({ timeLeft, maxTime }) {
  const R    = 20;
  const circ = 2 * Math.PI * R;
  const pct  = Math.max(0, timeLeft / maxTime);
  const color = timeLeft <= 3 ? '#ef4444' : timeLeft <= Math.ceil(maxTime / 2) ? '#f59e0b' : '#22c55e';
  return (
    <div className="relative flex items-center justify-center w-14 h-14 shrink-0">
      <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="28" cy="28" r={R} fill="none" stroke="#1e293b" strokeWidth="5" />
        <circle cx="28" cy="28" r={R} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }} />
      </svg>
      <span className={`absolute text-sm font-extrabold ${timeLeft <= 3 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
        {timeLeft}
      </span>
    </div>
  );
}

// ── 던전 로비 ─────────────────────────────────────────────────
function DungeonLobby({ dungeons, bestScores, onPreview, isLoading }) {
  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-slate-400 font-bold animate-pulse">
      던전 목록 불러오는 중...
    </div>
  );

  if (!dungeons.length) return (
    <div className="text-center py-20 text-slate-400">
      <div className="text-6xl mb-4">⚔️</div>
      <p className="font-bold text-lg text-slate-600">열린 퀴즈 던전이 없습니다</p>
      <p className="text-sm mt-1">선생님이 퀴즈를 만들면 여기 표시됩니다</p>
    </div>
  );

  return (
    <div className="p-5 space-y-3">
      {dungeons.map(d => {
        const best    = bestScores[d.id];
        const isFirst = !best?.cleared;
        // 출현 몬스터 스프라이트 (정적 썸네일)
        const isMulti  = Array.isArray(d.monsterIds) && d.monsterIds.length > 0;
        const isRandom = !isMulti && (!d.monsterId || d.monsterId === 'random');
        const resolvedMonsterId = isMulti
          ? d.monsterIds[d.monsterIds.length - 1]
          : (d.monsterId && d.monsterId !== 'random' ? d.monsterId : DIFF_MONSTER[d.difficulty]);
        const mDat = MONSTERS_DB[resolvedMonsterId] || null;
        const mScale = mDat ? Math.min(0.45, 72 / Math.max(mDat.frameWidth, mDat.frameHeight)) : 0;
        const mDw = mDat ? Math.round(mDat.frameWidth  * mScale) : 0;
        const mDh = mDat ? Math.round(mDat.frameHeight * mScale) : 0;
        const mRow = mDat?.animations?.idle?.row ?? 0;
        const totalQ = d.questions?.length || d.questionCount || 5;
        const waveCount = isMulti ? d.monsterIds.length
          : mDat ? Math.max(1, Math.floor(totalQ / (TIER_COST[mDat.tier] || 1)) + (totalQ % (TIER_COST[mDat.tier] || 1) > 0 ? 1 : 0)) : 1;

        return (
          <div key={d.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            {/* 헤더 띠: 몬스터 이미지 + 던전 제목 */}
            <div className={`${DIFF_BADGE[d.difficulty] || 'bg-sky-500'} px-4 pt-3 pb-2 flex items-end gap-3`}>
              {/* 몬스터 스프라이트 + 마릿수 뱃지 */}
              <div className="shrink-0 flex flex-col items-center justify-end" style={{ height: 76 }}>
                {mDat ? (
                  <div style={{
                    width: mDw, height: mDh,
                    backgroundImage:    `url('${mDat.src}')`,
                    backgroundPosition: `0px ${-(mRow * mDh)}px`,
                    backgroundRepeat:   'no-repeat',
                    backgroundSize:     `${mDat.sheetCols * mDw}px ${mDat.sheetRows * mDh}px`,
                    imageRendering:     'pixelated',
                    transform:          mDat.flip ? 'scaleX(-1)' : undefined,
                  }} />
                ) : (
                  <span className="text-5xl leading-none pb-1">
                    {MONSTER[d.difficulty]?.emoji || '⚔️'}
                  </span>
                )}
                <div className="mt-0.5 text-[9px] font-extrabold bg-black/40 text-white px-1.5 py-0.5 rounded-full leading-none">
                  {isRandom ? '랜덤' : `×${waveCount}`}
                </div>
              </div>
              {/* 제목 + 난이도 */}
              <div className="flex-1 pb-1.5 min-w-0">
                <div className="text-white font-extrabold text-base leading-tight truncate">{d.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold bg-white/25 text-white px-2 py-0.5 rounded-full">
                    {d.difficulty === 'easy' ? '쉬움' : d.difficulty === 'hard' ? '어려움' : '보통'}
                  </span>
                  <span className="text-[10px] text-white/80">
                    {d.timeLimit === 0 ? '∞ 무제한' : `${d.timeLimit ?? DIFF_TIMER[d.difficulty] ?? 12}초/문제`}
                  </span>
                  <span className="text-[10px] text-white/80">{d.questionCount}문제</span>
                </div>
              </div>
              {/* 별점 */}
              {best && (
                <div className="shrink-0 text-right pb-1.5">
                  <div className="flex gap-0.5 justify-end">
                    {[0,1,2].map(i => (
                      <span key={i} className={`text-base ${i < best.stars ? 'text-amber-300' : 'text-white/20'}`}>⭐</span>
                    ))}
                  </div>
                  <div className="text-[10px] text-white/70">최고 {best.accuracy}%</div>
                </div>
              )}
            </div>

            {/* 보상 + 입장 버튼 */}
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="flex flex-wrap gap-2 text-xs text-slate-500 flex-1">
                {d.rewards?.gold    > 0 && <span>🪙 {d.rewards.gold}G</span>}
                {d.rewards?.exp     > 0 && <span>⭐ {d.rewards.exp} EXP</span>}
                {d.rewards?.diamond > 0 && <span>💎 {d.rewards.diamond}</span>}
                {isFirst && <span className="text-amber-500 font-bold">🌟 첫 클리어 ×1.5</span>}
              </div>
              <button onClick={() => onPreview(d)}
                className="shrink-0 px-5 py-2 rounded-xl font-extrabold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all active:scale-95">
                ⚔️ 입장
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 보스 소개 팝업 ────────────────────────────────────────────
function BossIntroModal({ dungeon, onConfirm, onCancel }) {
  const m          = MONSTER[dungeon.difficulty] || MONSTER.normal;
  const monsterId  = dungeon.monsterId && dungeon.monsterId !== 'random' ? dungeon.monsterId : m.monsterId;
  const monsterDat = MONSTERS_DB[monsterId] || null;
  const hasTimeLimitModal = dungeon.timeLimit !== 0;
  const timer = hasTimeLimitModal
    ? (dungeon.timeLimit != null ? dungeon.timeLimit : (DIFF_TIMER[dungeon.difficulty] || 12))
    : null;
  const totalQ      = dungeon.questions?.length || dungeon.questionCount || 5;
  const playerMaxHP = totalQ * DAMAGE_WRONG;
  const INFO  = [
    ['📝 문제 수',   `${totalQ}문제`],
    ['⏱️ 제한 시간', timer !== null ? `${timer}초/문제` : '∞ 무제한'],
    ['❤️ 내 HP',    `${playerMaxHP}`],
    ['💥 오답 피해', `-${DAMAGE_WRONG} HP`],
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-3xl w-full max-w-sm border border-slate-700 shadow-2xl p-6 text-center animate-pop-in">
        {/* 몬스터 미리보기 */}
        {monsterDat ? (
          <div className="flex justify-center mb-3">
            <SpriteMonster data={monsterDat} anim="idle" scale={0.22} />
          </div>
        ) : (
          <div className="text-7xl mb-3 select-none">{m.emoji}</div>
        )}
        <h2 className="text-2xl font-extrabold text-white mb-1">{m.name}</h2>
        <p className="text-slate-400 text-sm mb-2">{dungeon.title}</p>
        <p className="text-slate-500 text-xs mb-5">{m.desc}</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {INFO.map(([l, v]) => (
            <div key={l} className="bg-slate-800 rounded-xl px-3 py-2.5 border border-slate-700">
              <div className="text-slate-400 text-[10px] mb-0.5">{l}</div>
              <div className="text-white font-extrabold text-sm">{v}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCancel}
            className="py-3 rounded-2xl bg-slate-800 text-slate-300 font-bold border border-slate-700 hover:bg-slate-700 transition-colors active:scale-95">
            취소
          </button>
          <button onClick={onConfirm}
            className="py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-extrabold shadow-lg hover:from-indigo-500 transition-all active:scale-95">
            ⚔️ 전투 시작!
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 퀴즈 배틀 ──────────────────────────────────────────────────
function QuizBattle({ dungeon, playerData, onBattleEnd, layoutCfg = BATTLE_LAYOUT_DEFAULTS }) {
  const hasTimeLimit = dungeon.timeLimit !== 0;
  const maxTime = hasTimeLimit
    ? (dungeon.timeLimit != null ? dungeon.timeLimit : (DIFF_TIMER[dungeon.difficulty] || 12))
    : null;
  const totalQ  = dungeon.questions.length;

  // 웨이브 배열 (dungeon.waves는 enterDungeon에서 미리 생성됨)
  const waves = dungeon.waves || [{
    monsterId:     DIFF_MONSTER[dungeon.difficulty],
    questionCount: totalQ,
  }];

  const [currentWaveIdx, setCurrentWaveIdx] = useState(0);
  const [waveMonsterHP,  setWaveMonsterHP]  = useState(waves[0].questionCount * DAMAGE_RIGHT);

  const playerMaxHP  = totalQ * DAMAGE_WRONG;   // 모든 문제 틀리면 HP=0
  const currentWave  = waves[currentWaveIdx];
  const waveMaxHP    = currentWave.questionCount * DAMAGE_RIGHT;
  const monsterId    = currentWave.monsterId;
  const monsterData  = MONSTERS_DB[monsterId] || null;
  const monsterMeta  = MONSTER[dungeon.difficulty] || MONSTER.normal;

  const [timeLeft,     setTimeLeft]     = useState(maxTime ?? 0);
  const [currentQ,     setCurrentQ]     = useState(0);
  const [answered,     setAnswered]     = useState(null);
  const [selectedOpt,  setSelectedOpt]  = useState(null);
  const [saInput,      setSaInput]      = useState('');
  const [playerHP,     setPlayerHP]     = useState(playerMaxHP);
  const [score,        setScore]        = useState(0);
  const [wrongIdxs,    setWrongIdxs]    = useState([]);
  const [combo,        setCombo]        = useState(0);
  const [maxCombo,     setMaxCombo]     = useState(0);
  const [timeBonus,    setTimeBonus]    = useState(0);
  const [monsterFlash, setMonsterFlash] = useState(false);
  const [monsterAnim,  setMonsterAnim]  = useState('idle');
  const [playerShake,  setPlayerShake]  = useState(false);
  const [floats,       setFloats]       = useState([]);

  const nextRef    = useRef(null);
  const floatIdRef = useRef(0);
  const handlerRef = useRef(null);

  const addFloat = (text, isPlayer) => {
    const id = floatIdRef.current++;
    setFloats(p => [...p, { id, text, isPlayer }]);
    setTimeout(() => setFloats(p => p.filter(f => f.id !== id)), 1100);
  };

  const handleAnswer = useCallback((value, timeout = false) => {
    if (answered !== null) return;
    const q    = dungeon.questions[currentQ];
    const isSA = q.type === 'sa';
    const ok   = !timeout && (
      isSA
        ? String(value || '').trim().toLowerCase() === String(q.answer || '').trim().toLowerCase()
        : value === q.answer
    );

    setSelectedOpt(isSA ? null : (timeout ? null : value));
    setAnswered(ok ? 'correct' : timeout ? 'timeout' : 'wrong');

    const newScore = ok ? score + 1 : score;
    const newWrong = ok ? wrongIdxs : [...wrongIdxs, currentQ];
    let newWaveHP   = waveMonsterHP;
    let newPlayerHP = playerHP;
    let newCombo    = combo;
    let newTimeBonus = timeBonus;

    if (ok) {
      newCombo = combo + 1;
      const cf   = getComboLv(newCombo);
      const mult = cf ? cf.mult : 1.0;
      const dmg  = Math.round(DAMAGE_RIGHT * mult);
      newWaveHP    = Math.max(0, waveMonsterHP - dmg);
      newTimeBonus = timeBonus + timeLeft * 2;

      setWaveMonsterHP(newWaveHP);
      setScore(newScore);
      setCombo(newCombo);
      setMaxCombo(m => Math.max(m, newCombo));
      setTimeBonus(newTimeBonus);
      setMonsterFlash(true);
      setTimeout(() => setMonsterFlash(false), 350);
      addFloat(`-${dmg}${mult > 1 ? ` ×${mult}` : ''}`, false);
      if (newWaveHP <= 0) setMonsterAnim('death');
    } else {
      newPlayerHP = Math.max(0, playerHP - DAMAGE_WRONG);
      newCombo    = 0;
      setPlayerHP(newPlayerHP);
      setCombo(0);
      setPlayerShake(true);
      setTimeout(() => setPlayerShake(false), 500);
      addFloat(`-${DAMAGE_WRONG}`, true);
      setMonsterAnim('attack');
      setTimeout(() => setMonsterAnim('idle'), 1350);
    }
    setWrongIdxs(newWrong);

    const nextQ        = currentQ + 1;
    const waveCleared  = newWaveHP <= 0;
    const isLastWave   = currentWaveIdx >= waves.length - 1;
    const playerDead   = newPlayerHP <= 0;
    const allQDone     = nextQ >= totalQ;
    const cleared      = waveCleared && isLastWave && !playerDead;

    const isOver      = playerDead || allQDone || (waveCleared && isLastWave);
    const doWaveNext  = waveCleared && !isLastWave && !playerDead;

    nextRef.current = setTimeout(() => {
      if (isOver) {
        onBattleEnd({
          score: newScore, cleared,
          playerHP: newPlayerHP,
          wrongIdxs: newWrong,
          maxCombo: Math.max(maxCombo, newCombo),
          timeBonus: newTimeBonus,
        });
      } else if (doWaveNext) {
        const nextWaveIdx = currentWaveIdx + 1;
        setCurrentWaveIdx(nextWaveIdx);
        setWaveMonsterHP(waves[nextWaveIdx].questionCount * DAMAGE_RIGHT);
        setMonsterAnim('idle');
        setCurrentQ(nextQ);
        setAnswered(null);
        setSelectedOpt(null);
        setSaInput('');
        if (maxTime !== null) setTimeLeft(maxTime);
      } else {
        setCurrentQ(nextQ);
        setAnswered(null);
        setSelectedOpt(null);
        setSaInput('');
        if (maxTime !== null) setTimeLeft(maxTime);
      }
    }, 1400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, currentQ, score, wrongIdxs, waveMonsterHP, playerHP,
      combo, timeBonus, timeLeft, maxCombo, maxTime, dungeon,
      currentWaveIdx, waves, totalQ]);

  handlerRef.current = handleAnswer;

  useEffect(() => {
    if (!hasTimeLimit || answered !== null) return;
    if (timeLeft <= 0) { handlerRef.current(null, true); return; }
    const t = setTimeout(() => setTimeLeft(tl => tl - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, answered]);

  useEffect(() => () => { if (nextRef.current) clearTimeout(nextRef.current); }, []);

  const q       = dungeon.questions[currentQ];
  const mHPpct  = (waveMonsterHP / waveMaxHP) * 100;
  const pHPpct  = (playerHP / playerMaxHP) * 100;
  const comboLv = getComboLv(combo);

  return (
    <div className="flex flex-col h-full bg-slate-900 select-none overflow-hidden">

      {/* ── 상단 상태바 ── */}
      <div className="bg-slate-950 px-4 py-2 flex items-center gap-3 shrink-0">
        <div className="flex-1">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-extrabold text-white">
              Q{currentQ + 1}<span className="text-slate-500 font-normal"> / {totalQ}</span>
            </span>
            <div className="flex items-center gap-2">
              {waves.length > 1 && (
                <span className="text-[10px] font-bold bg-indigo-700 text-indigo-200 px-1.5 py-0.5 rounded-full">
                  Wave {currentWaveIdx + 1}/{waves.length}
                </span>
              )}
              <span className="text-slate-400 text-[10px]">정답 {score}개</span>
            </div>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${(currentQ / totalQ) * 100}%` }} />
          </div>
        </div>
        {comboLv && (
          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full shrink-0 animate-pop-in ${comboLv.cls}`}>
            {comboLv.label} {combo}×
          </span>
        )}
        {hasTimeLimit
          ? <CircleTimer timeLeft={timeLeft} maxTime={maxTime} />
          : <div className="relative flex items-center justify-center w-14 h-14 shrink-0">
              <svg width="56" height="56">
                <circle cx="28" cy="28" r="20" fill="none" stroke="#1e293b" strokeWidth="5" />
              </svg>
              <span className="absolute text-xl font-extrabold text-slate-400">∞</span>
            </div>
        }
      </div>

      {/* ── 전투 씬 ── */}
      <div className="relative shrink-0 overflow-hidden bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-800"
           style={{ height: `${layoutCfg.sceneHeightVh}vh`, minHeight: '300px' }}>

        {/* 배경 파티클 효과 */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute rounded-full bg-indigo-500/10 animate-pulse"
              style={{
                width: `${40 + i * 20}px`, height: `${40 + i * 20}px`,
                left: `${10 + i * 14}%`, bottom: `${20 + (i % 3) * 10}%`,
                animationDelay: `${i * 0.4}s`, animationDuration: `${2 + i * 0.5}s`,
              }} />
          ))}
        </div>

        {/* 바닥 그라데이션 */}
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none" />
        {/* 바닥 라인 */}
        <div className="absolute inset-x-0 bottom-14 h-px bg-indigo-500/20" />

        {/* ── 플레이어 (좌 절대위치) ── */}
        <div className={`absolute flex flex-col items-center ${playerShake ? 'animate-shake' : ''}`}
          style={{ left: `${layoutCfg.playerLeftPct}%`, bottom: layoutCfg.playerBottomPx }}>
          {/* HP 바 */}
          <div style={{ width: 120 }} className="mb-2">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-sky-300 font-bold truncate max-w-[72px]">{playerData?.name || '나'}</span>
              <span className="text-emerald-400 font-extrabold">{playerHP}</span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
              <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${hpGrad(pHPpct)}`}
                style={{ width: `${pHPpct}%` }} />
            </div>
          </div>
          {/* 캐릭터 */}
          <div style={{ height: layoutCfg.playerCharHeightPx, width: layoutCfg.playerCharHeightPx }}
            className="flex items-end justify-center">
            {playerData?.characterImage
              ? <img src={playerData.characterImage} alt=""
                  style={{
                    height: layoutCfg.playerCharHeightPx,
                    width:  layoutCfg.playerCharHeightPx,
                    objectFit: 'contain', imageRendering: 'pixelated',
                    transform: `scale(${layoutCfg.playerScale})`,
                    transformOrigin: 'bottom center',
                  }} />
              : <span className="text-8xl leading-none">🧙‍♂️</span>}
          </div>
        </div>

        {/* 중앙 VS */}
        <div className="absolute left-1/2 bottom-[45%] -translate-x-1/2 select-none">
          <span className="text-slate-500/60 font-extrabold text-3xl tracking-widest">VS</span>
        </div>

        {/* ── 몬스터 (우 절대위치) ── */}
        <div className="absolute flex flex-col items-center"
          style={{ right: `${layoutCfg.monsterRightPct}%`, bottom: layoutCfg.monsterBottomPx }}>
          {/* HP 바 */}
          <div style={{ width: 140 }} className="mb-2">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-rose-300 font-bold truncate max-w-[90px]">{monsterData?.name || monsterMeta.name}</span>
              <span className="text-rose-400 font-extrabold">{waveMonsterHP}</span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
              <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${hpGrad(mHPpct)}`}
                style={{ width: `${mHPpct}%` }} />
            </div>
          </div>
          {/* 몬스터 */}
          <div style={{ height: layoutCfg.monsterCharHeightPx, width: layoutCfg.monsterCharHeightPx * 0.85 }}
            className="flex items-end justify-center">
            {monsterData ? (
              <SpriteMonster
                data={monsterData}
                anim={monsterAnim}
                flash={monsterFlash}
                scale={Math.min(
                  monsterData.scale * layoutCfg.monsterScaleMult,
                  layoutCfg.monsterCharHeightPx / monsterData.frameHeight
                )}
              />
            ) : (
              <span className="text-8xl leading-none"
                style={{ filter: monsterFlash ? 'brightness(4) saturate(0)' : undefined }}>
                {monsterMeta.emoji}
              </span>
            )}
          </div>
        </div>

        {/* ── 플로팅 데미지 ── */}
        {floats.filter(f => f.isPlayer).map(f => (
          <div key={f.id}
            className="absolute font-extrabold text-2xl text-rose-400 pointer-events-none animate-float-up z-20"
            style={{ left: '20%', bottom: 120, textShadow: '0 0 10px rgba(248,113,113,0.9)' }}>
            {f.text}
          </div>
        ))}
        {floats.filter(f => !f.isPlayer).map(f => (
          <div key={f.id}
            className="absolute font-extrabold text-2xl text-yellow-300 pointer-events-none animate-float-up z-20"
            style={{ right: '18%', bottom: 140, textShadow: '0 0 10px rgba(251,191,36,0.9)' }}>
            {f.text}
          </div>
        ))}

        {/* HIT / 빗나감 */}
        {answered === 'correct' && (
          <div className="absolute top-4 right-[25%] text-yellow-300 font-extrabold text-2xl animate-bounce drop-shadow-lg">💥 HIT!</div>
        )}
        {answered === 'wrong' && (
          <div className="absolute top-4 left-[18%] text-rose-400 font-extrabold text-lg animate-bounce">😵 빗나감!</div>
        )}
        {answered === 'timeout' && (
          <div className="absolute top-4 left-[18%] text-rose-400 font-extrabold text-lg animate-bounce">⏰ 시간 초과!</div>
        )}
      </div>

      {/* ── 퀴즈 영역 ── */}
      <div className="flex-1 bg-slate-100 overflow-y-auto">
        <div className="p-3 space-y-2.5">

          {/* 문제 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="font-bold text-slate-800 text-base leading-relaxed">{q.question}</p>
          </div>

          {/* 보기 (객관식) / 입력창 (주관식) */}
          {q.type === 'sa' ? (
            <div className="space-y-2">
              <input
                value={saInput}
                onChange={e => setSaInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && answered === null && saInput.trim()) handleAnswer(saInput); }}
                disabled={answered !== null}
                autoFocus
                placeholder="정답을 입력하세요"
                className={`w-full border-2 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none transition-colors
                  ${answered === null
                    ? 'border-slate-200 focus:border-amber-400 bg-white'
                    : answered === 'correct'
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                      : 'border-rose-400 bg-rose-50 text-rose-700'
                  } disabled:opacity-70`}
              />
              {answered === null && (
                <button
                  onClick={() => saInput.trim() && handleAnswer(saInput)}
                  disabled={!saInput.trim()}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-white font-extrabold rounded-2xl disabled:opacity-40 active:scale-95 transition-all">
                  확인 ✓
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(q.options || []).map((opt, oi) => {
                let cls = 'bg-white border-2 border-slate-200 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50';
                if (answered !== null) {
                  if (oi === q.answer)         cls = 'bg-emerald-100 border-2 border-emerald-500 text-emerald-800';
                  else if (oi === selectedOpt) cls = 'bg-rose-100 border-2 border-rose-400 text-rose-700';
                  else                         cls = 'bg-slate-50 border-2 border-slate-100 text-slate-400 opacity-40';
                }
                return (
                  <button key={oi}
                    onClick={() => handleAnswer(oi)}
                    disabled={answered !== null}
                    className={`py-3.5 px-3 rounded-2xl font-bold text-sm text-left transition-all active:scale-95 ${cls}`}>
                    <span className="text-slate-400 mr-1.5">{['①','②','③','④'][oi]}</span>{opt}
                  </button>
                );
              })}
            </div>
          )}

          {/* 해설 */}
          {answered !== null && (q.explanation || q.type === 'sa') && (
            <div className={`rounded-xl p-3 text-xs font-medium leading-relaxed
              ${answered === 'correct'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {answered === 'correct'
                ? '✅ 정답! '
                : `❌ 정답: ${q.type === 'sa' ? q.answer : (q.options?.[q.answer] || '')} — `}
              {q.explanation || ''}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── 결과 화면 ──────────────────────────────────────────────────
function ResultScreen({
  dungeon, score, totalQ, wrongIdxs, playerAlive,
  earnedRewards, leveledUp, isSaving, maxCombo,
  canRetry, onRetry, onReturnLobby,
}) {
  const accuracy  = Math.round(score / totalQ * 100);
  const stars     = toStars(accuracy);
  const [visStars, setVisStars] = useState(0);

  useEffect(() => {
    if (!playerAlive || stars === 0) return;
    let n = 0;
    const t = setInterval(() => {
      n++;
      setVisStars(n);
      if (n >= stars) clearInterval(t);
    }, 420);
    return () => clearInterval(t);
  }, [playerAlive, stars]);

  const STATS = [
    ['정답 수',   `${score} / ${totalQ}`,                null],
    ['정확도',    `${accuracy}%`,                         accuracy >= 70 ? 'text-emerald-600' : 'text-rose-500'],
    ['최고 콤보', `🔥 ${maxCombo}연속`,                   'text-orange-500'],
    ...(wrongIdxs.length ? [['오답 수', `${wrongIdxs.length}개`, 'text-rose-500']] : []),
  ];

  return (
    <div className="flex flex-col items-center min-h-full p-5 bg-slate-50">
      <div className="text-6xl mt-4 mb-2">{playerAlive ? '🏆' : '💀'}</div>
      <h2 className="text-2xl font-extrabold text-slate-800 mb-1">
        {playerAlive ? '던전 클리어!' : '던전 실패'}
      </h2>
      <p className="text-slate-500 text-sm mb-4">{dungeon.title}</p>

      {leveledUp && (
        <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-2xl px-6 py-3 mb-4 font-extrabold text-lg shadow-lg animate-bounce w-full max-w-xs text-center">
          🎉 레벨 업! Lv.{leveledUp} 달성!
        </div>
      )}

      {/* 별 */}
      <div className="flex gap-3 mb-5">
        {[0,1,2].map(i => (
          <span key={i}
            className={`text-5xl transition-all duration-300 ${i < visStars ? 'scale-125 drop-shadow-lg' : 'opacity-20 scale-90'}`}>
            ⭐
          </span>
        ))}
      </div>

      {/* 스탯 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 w-full max-w-xs mb-4 space-y-2.5">
        {STATS.map(([label, val, cls]) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-slate-500">{label}</span>
            <span className={`font-extrabold ${cls || 'text-slate-800'}`}>{val}</span>
          </div>
        ))}
      </div>

      {/* 보상 */}
      {isSaving ? (
        <div className="text-sm text-slate-400 mb-4 animate-pulse">💾 결과 저장 중...</div>
      ) : earnedRewards ? (
        <div className={`border rounded-2xl p-4 w-full max-w-xs mb-4
          ${playerAlive ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className={`font-bold mb-2 text-sm ${playerAlive ? 'text-emerald-700' : 'text-slate-500'}`}>
            {playerAlive ? '🎁 획득 보상' : '😢 실패 — 보상 없음'}
          </div>
          {playerAlive && (
            <div className="space-y-1.5">
              {earnedRewards.goldEarned    > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">🪙 골드</span>
                  <span className="font-extrabold text-amber-600">+{earnedRewards.goldEarned}G</span>
                </div>
              )}
              {earnedRewards.expEarned     > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">경험치</span>
                  <span className="font-extrabold text-indigo-600">⭐ +{earnedRewards.expEarned}</span>
                </div>
              )}
              {earnedRewards.diamondEarned > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">다이아</span>
                  <span className="font-extrabold text-blue-600">💎 +{earnedRewards.diamondEarned}</span>
                </div>
              )}
              {earnedRewards.firstClear && (
                <div className="text-center text-amber-600 font-bold text-xs pt-1.5 border-t border-amber-200">
                  🌟 첫 클리어 보너스 ×1.5 적용!
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* 오답 복습 */}
      {wrongIdxs.length > 0 && (
        <div className="bg-white border border-rose-200 rounded-2xl p-4 w-full max-w-sm mb-4 text-left">
          <div className="text-xs font-bold text-rose-600 mb-2">❌ 오답 복습</div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {wrongIdxs.map(i => {
              const wq = dungeon.questions[i];
              const correctAnswer = wq.type === 'sa'
                ? wq.answer
                : (wq.options?.[wq.answer] || '');
              return (
                <div key={i} className="text-xs bg-rose-50 rounded-lg p-2.5">
                  <div className="font-bold text-slate-700 mb-0.5">
                    Q{i+1}. {wq.question}
                    {wq.type === 'sa' && <span className="ml-1 text-amber-500 font-normal">[주관식]</span>}
                  </div>
                  <div className="text-emerald-600">정답: {correctAnswer}</div>
                  {wq.explanation && (
                    <div className="text-slate-400 mt-0.5">{wq.explanation}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={`grid gap-3 w-full max-w-xs ${canRetry ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {canRetry && (
          <button onClick={onRetry}
            className="py-3.5 bg-amber-500 hover:bg-amber-400 text-white font-extrabold rounded-2xl active:scale-95 transition-all">
            🔄 재도전
          </button>
        )}
        <button onClick={onReturnLobby}
          className="py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl active:scale-95 transition-all">
          목록으로
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
const BATTLE_LAYOUT_DEFAULTS = {
  sceneHeightVh:       55,
  playerLeftPct:        8,
  playerBottomPx:       4,
  playerCharHeightPx:  130,
  playerScale:         2.6,
  monsterRightPct:      8,
  monsterBottomPx:      4,
  monsterCharHeightPx: 230,
  monsterScaleMult:    1.7,
};

function QuizDungeon({ studentCode, studentDocId, tickets, onUseTicket }) {
  const [screen,          setScreen]         = useState('lobby');
  const [dungeons,        setDungeons]       = useState([]);
  const [isLoading,       setIsLoading]      = useState(true);
  const [previewDungeon,  setPreviewDungeon] = useState(null);
  const [selectedDungeon, setSelectedDungeon] = useState(null);
  const [studentData,     setStudentData]    = useState(null);
  const [bestScores,      setBestScores]     = useState({});
  const [battleRes,       setBattleRes]      = useState(null);
  const [earnedRewards,   setEarnedRewards]  = useState(null);
  const [leveledUp,       setLeveledUp]      = useState(null);
  const [isSaving,        setIsSaving]       = useState(false);
  const [layoutCfg,       setLayoutCfg]      = useState(BATTLE_LAYOUT_DEFAULTS);

  useEffect(() => {
    getDoc(doc(db, 'siteConfig', 'battleLayout')).then(snap => {
      if (snap.exists() && snap.data().quiz) {
        setLayoutCfg({ ...BATTLE_LAYOUT_DEFAULTS, ...snap.data().quiz });
      }
    }).catch(() => {});
  }, []);

  // 던전 목록 + 베스트 기록 로드
  useEffect(() => {
    const load = async () => {
      try {
        const [dungSnap, resSnap] = await Promise.all([
          getDocs(query(collection(db, 'quizDungeons'), where('active', '==', true))),
          studentDocId
            ? getDocs(query(collection(db, 'quizResults'), where('studentId', '==', studentDocId)))
            : Promise.resolve({ docs: [] }),
        ]);

        setDungeons(
          dungSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        );

        const best = {};
        resSnap.docs.forEach(d => {
          const r = d.data();
          if (!best[r.dungeonId] || r.accuracy > best[r.dungeonId].accuracy) {
            best[r.dungeonId] = { accuracy: r.accuracy, stars: toStars(r.accuracy) };
          }
          if (r.cleared) best[r.dungeonId] = { ...best[r.dungeonId], cleared: true };
        });
        setBestScores(best);
      } catch (err) { console.error(err); }
      finally { setIsLoading(false); }
    };
    load();
  }, [studentDocId]);

  // 학생 데이터 로드
  useEffect(() => {
    if (!studentDocId) return;
    getDoc(doc(db, 'students', studentDocId)).then(snap => {
      if (snap.exists()) setStudentData({ id: snap.id, ...snap.data() });
    });
  }, [studentDocId]);

  const enterDungeon = (dungeon) => {
    const totalQ = dungeon.questions.length;
    const waves  = generateWaves(totalQ, dungeon.monsterIds || dungeon.monsterId);
    setSelectedDungeon({ ...dungeon, waves });
    setBattleRes(null);
    setEarnedRewards(null);
    setLeveledUp(null);
    setPreviewDungeon(null);
    setScreen('battle');
  };

  const handleBattleEnd = async (result) => {
    setBattleRes(result);
    setScreen('result');
    await doSaveResult(result);
  };

  const doSaveResult = async ({ score, cleared, playerHP, wrongIdxs, timeBonus }) => {
    if (!selectedDungeon) return;
    setIsSaving(true);
    const dungeon  = selectedDungeon;
    const totalQ   = dungeon.questionCount;
    const accuracy = Math.round(score / totalQ * 100);
    const isFirst  = !bestScores[dungeon.id]?.cleared;

    const mult          = (isFirst && cleared) ? 1.5 : 1;
    const goldEarned    = cleared ? Math.round((dungeon.rewards?.gold    || 0) * mult) : 0;
    const expEarned     = cleared ? Math.round((dungeon.rewards?.exp     || 0) * mult) : 0;
    const diamondEarned = cleared ? (dungeon.rewards?.diamond || 0) : 0;

    setEarnedRewards({
      goldEarned, expEarned, diamondEarned,
      firstClear: isFirst && cleared,
    });

    if (!studentDocId || !studentData) { setIsSaving(false); return; }

    try {
      const { level, exp, maxExp, leveled } = calcLevelUp(
        studentData.level, studentData.exp, studentData.maxExp, expEarned
      );
      if (leveled) setLeveledUp(level);

      const batch = writeBatch(db);
      batch.update(doc(db, 'students', studentDocId), {
        gold:     (studentData.gold     || 0) + goldEarned,
        diamonds: (studentData.diamonds || 0) + diamondEarned,
        exp, level, maxExp,
      });
      batch.set(doc(collection(db, 'quizResults')), {
        studentId: studentDocId,
        studentCode: studentData.studentCode,
        studentName: studentData.name || studentData.studentCode,
        dungeonId: dungeon.id,
        dungeonTitle: dungeon.title,
        score, totalQuestions: totalQ, accuracy,
        cleared, wrongIndexes: wrongIdxs,
        goldEarned, expEarned, diamondEarned,
        completedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'quizDungeons', dungeon.id), {
        playCount: (dungeon.playCount || 0) + 1,
      });
      await batch.commit();

      setStudentData(prev => ({
        ...prev,
        gold:     (prev?.gold     || 0) + goldEarned,
        diamonds: (prev?.diamonds || 0) + diamondEarned,
        exp, level, maxExp,
      }));
      setBestScores(prev => {
        const cur = prev[dungeon.id];
        const updated = cur && cur.accuracy >= accuracy ? cur : { accuracy, stars: toStars(accuracy) };
        if (cleared) updated.cleared = true;
        return { ...prev, [dungeon.id]: updated };
      });
    } catch (err) { console.error('결과 저장 에러:', err); }
    finally { setIsSaving(false); }
  };

  if (screen === 'lobby') return (
    <>
      <DungeonLobby
        dungeons={dungeons}
        bestScores={bestScores}
        onPreview={setPreviewDungeon}
        isLoading={isLoading}
      />
      {previewDungeon && (
        <BossIntroModal
          dungeon={previewDungeon}
          onConfirm={() => enterDungeon(previewDungeon)}
          onCancel={() => setPreviewDungeon(null)}
        />
      )}
    </>
  );

  if (screen === 'battle' && selectedDungeon) return (
    <QuizBattle
      dungeon={selectedDungeon}
      playerData={studentData}
      onBattleEnd={handleBattleEnd}
      layoutCfg={layoutCfg}
    />
  );

  if (screen === 'result' && selectedDungeon && battleRes) return (
    <ResultScreen
      dungeon={selectedDungeon}
      score={battleRes.score}
      totalQ={selectedDungeon.questionCount}
      wrongIdxs={battleRes.wrongIdxs}
      playerAlive={battleRes.cleared ?? (battleRes.playerHP > 0)}
      earnedRewards={earnedRewards}
      leveledUp={leveledUp}
      isSaving={isSaving}
      maxCombo={battleRes.maxCombo}
      canRetry={true}
      onRetry={() => enterDungeon(selectedDungeon)}
      onReturnLobby={() => {
        setScreen('lobby');
        setBattleRes(null);
        setEarnedRewards(null);
        setLeveledUp(null);
      }}
    />
  );

  return null;
}

export default QuizDungeon;
