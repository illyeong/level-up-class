import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, getDocs, getDoc, doc, writeBatch,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import SpriteMonster from '../../components/SpriteMonster';
import { MONSTERS_DB, DIFF_MONSTER, TIER_LABEL } from '../../data/monsterData';

const getRandomMonsterId = () => {
  const ids = Object.keys(MONSTERS_DB);
  return ids[Math.floor(Math.random() * ids.length)];
};

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
const PLAYER_MAX_HP = 500;
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
        const resolvedMonsterId = d.monsterId && d.monsterId !== 'random'
          ? d.monsterId : DIFF_MONSTER[d.difficulty];
        const mDat = MONSTERS_DB[resolvedMonsterId] || null;
        const mScale = mDat ? Math.min(0.45, 72 / Math.max(mDat.frameWidth, mDat.frameHeight)) : 0;
        const mDw = mDat ? Math.round(mDat.frameWidth  * mScale) : 0;
        const mDh = mDat ? Math.round(mDat.frameHeight * mScale) : 0;
        const mRow = mDat?.animations?.idle?.row ?? 0;

        return (
          <div key={d.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            {/* 헤더 띠: 몬스터 이미지 + 던전 제목 */}
            <div className={`${DIFF_BADGE[d.difficulty] || 'bg-sky-500'} px-4 pt-3 pb-2 flex items-end gap-3`}>
              {/* 몬스터 스프라이트 */}
              <div className="shrink-0 flex items-end" style={{ height: 76 }}>
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
              </div>
              {/* 제목 + 난이도 */}
              <div className="flex-1 pb-1.5 min-w-0">
                <div className="text-white font-extrabold text-base leading-tight truncate">{d.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold bg-white/25 text-white px-2 py-0.5 rounded-full">
                    {d.difficulty === 'easy' ? '쉬움' : d.difficulty === 'hard' ? '어려움' : '보통'}
                  </span>
                  <span className="text-[10px] text-white/80">{DIFF_TIMER[d.difficulty] || 12}초/문제</span>
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
  const timer = DIFF_TIMER[dungeon.difficulty] || 12;
  const INFO  = [
    ['📝 문제 수',   `${dungeon.questionCount}문제`],
    ['⏱️ 제한 시간', `${timer}초/문제`],
    ['❤️ 내 HP',    `${PLAYER_MAX_HP}`],
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
function QuizBattle({ dungeon, playerData, onBattleEnd }) {
  const maxTime      = DIFF_TIMER[dungeon.difficulty] || 12;
  const monsterMaxHP = dungeon.questions.length * DAMAGE_RIGHT;

  const [timeLeft,     setTimeLeft]     = useState(maxTime);
  const [currentQ,     setCurrentQ]     = useState(0);
  const [answered,     setAnswered]     = useState(null); // null | 'correct' | 'wrong' | 'timeout'
  const [selectedOpt,  setSelectedOpt]  = useState(null);
  const [playerHP,     setPlayerHP]     = useState(PLAYER_MAX_HP);
  const [monsterHP,    setMonsterHP]    = useState(monsterMaxHP);
  const [score,        setScore]        = useState(0);
  const [wrongIdxs,    setWrongIdxs]    = useState([]);
  const [combo,        setCombo]        = useState(0);
  const [maxCombo,     setMaxCombo]     = useState(0);
  const [timeBonus,    setTimeBonus]    = useState(0);
  const [monsterFlash, setMonsterFlash] = useState(false);
  const [monsterAnim,  setMonsterAnim]  = useState('idle');
  const [playerShake,  setPlayerShake]  = useState(false);
  const [floats,       setFloats]       = useState([]);

  // monster / monsterData는 state보다 먼저 결정 (props 기반이므로 안전)
  const monster     = MONSTER[dungeon.difficulty] || MONSTER.normal;
  const monsterId   = dungeon.monsterId && dungeon.monsterId !== 'random'
    ? dungeon.monsterId : monster.monsterId;
  const monsterData = MONSTERS_DB[monsterId] || null;

  const nextRef    = useRef(null);
  const floatIdRef = useRef(0);
  const handlerRef = useRef(null); // latest handleAnswer ref (timer safe)

  const addFloat = (text, isPlayer) => {
    const id = floatIdRef.current++;
    setFloats(p => [...p, { id, text, isPlayer }]);
    setTimeout(() => setFloats(p => p.filter(f => f.id !== id)), 1100);
  };

  const handleAnswer = useCallback((optIdx, timeout = false) => {
    if (answered !== null) return;
    const q  = dungeon.questions[currentQ];
    const ok = !timeout && optIdx === q.answer;

    setSelectedOpt(timeout ? null : optIdx);
    setAnswered(ok ? 'correct' : timeout ? 'timeout' : 'wrong');

    const newScore = ok ? score + 1 : score;
    const newWrong = ok ? wrongIdxs : [...wrongIdxs, currentQ];
    let newMonsterHP = monsterHP;
    let newPlayerHP  = playerHP;
    let newCombo     = combo;
    let newTimeBonus = timeBonus;

    if (ok) {
      newCombo = combo + 1;
      const cf   = getComboLv(newCombo);
      const mult = cf ? cf.mult : 1.0;
      const dmg  = Math.round(DAMAGE_RIGHT * mult);
      newMonsterHP = Math.max(0, monsterHP - dmg);
      newTimeBonus = timeBonus + timeLeft * 2;

      setMonsterHP(newMonsterHP);
      setScore(newScore);
      setCombo(newCombo);
      setMaxCombo(m => Math.max(m, newCombo));
      setTimeBonus(newTimeBonus);
      setMonsterFlash(true);
      setTimeout(() => setMonsterFlash(false), 350);
      addFloat(`-${dmg}${mult > 1 ? ` ×${mult}` : ''}`, false);
      // 몬스터 사망 시 death 애니메이션
      if (newMonsterHP <= 0) setMonsterAnim('death');
    } else {
      newPlayerHP = Math.max(0, playerHP - DAMAGE_WRONG);
      newCombo    = 0;
      setPlayerHP(newPlayerHP);
      setCombo(0);
      setPlayerShake(true);
      setTimeout(() => setPlayerShake(false), 500);
      addFloat(`-${DAMAGE_WRONG}`, true);
      // 오답 → 몬스터 공격 애니메이션
      setMonsterAnim('attack');
      setTimeout(() => setMonsterAnim('idle'), 1350);
    }
    setWrongIdxs(newWrong);

    const nextQ  = currentQ + 1;
    const isOver = newMonsterHP <= 0 || newPlayerHP <= 0
                || nextQ >= dungeon.questions.length;

    nextRef.current = setTimeout(() => {
      if (isOver) {
        onBattleEnd({
          score: newScore,
          playerHP: newPlayerHP,
          wrongIdxs: newWrong,
          maxCombo: Math.max(maxCombo, newCombo),
          timeBonus: newTimeBonus,
        });
      } else {
        setCurrentQ(nextQ);
        setAnswered(null);
        setSelectedOpt(null);
        setTimeLeft(maxTime);
      }
    }, 1400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, currentQ, score, wrongIdxs, monsterHP, playerHP,
      combo, timeBonus, timeLeft, maxCombo, maxTime, dungeon]);

  handlerRef.current = handleAnswer;

  // 타이머
  useEffect(() => {
    if (answered !== null) return;
    if (timeLeft <= 0) { handlerRef.current(null, true); return; }
    const t = setTimeout(() => setTimeLeft(tl => tl - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, answered]);

  useEffect(() => () => { if (nextRef.current) clearTimeout(nextRef.current); }, []);

  const q      = dungeon.questions[currentQ];
  const qTotal = dungeon.questions.length;
  const mHPpct  = (monsterHP / monsterMaxHP) * 100;
  const pHPpct  = (playerHP  / PLAYER_MAX_HP) * 100;
  const comboLv = getComboLv(combo);

  return (
    <div className="flex flex-col h-full bg-slate-900 select-none overflow-hidden">

      {/* ── 상단 상태바 ── */}
      <div className="bg-slate-950 px-4 py-2 flex items-center gap-3 shrink-0">
        <div className="flex-1">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-extrabold text-white">
              Q{currentQ + 1}<span className="text-slate-500 font-normal"> / {qTotal}</span>
            </span>
            <span className="text-slate-400 text-[10px]">정답 {score}개</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${(currentQ / qTotal) * 100}%` }} />
          </div>
        </div>
        {comboLv && (
          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full shrink-0 animate-pop-in ${comboLv.cls}`}>
            {comboLv.label} {combo}×
          </span>
        )}
        <CircleTimer timeLeft={timeLeft} maxTime={maxTime} />
      </div>

      {/* ── 전투 씬 ── */}
      <div className="relative shrink-0 overflow-hidden bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-800"
           style={{ height: '220px' }}>

        {/* 바닥 그라데이션 */}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-800/70 to-transparent pointer-events-none" />

        {/* ── 플레이어 (좌측) ── */}
        <div className={`absolute left-3 bottom-3 flex flex-col items-center ${playerShake ? 'animate-shake' : ''}`}>
          <div className="w-24 mb-1.5">
            <div className="flex justify-between text-[9px] mb-0.5">
              <span className="text-slate-300 font-bold truncate max-w-[52px]">{playerData?.name || '나'}</span>
              <span className="text-emerald-400 font-bold">{playerHP}</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${hpGrad(pHPpct)}`}
                style={{ width: `${pHPpct}%` }} />
            </div>
          </div>
          <div className="flex items-end justify-center" style={{ height: 72 }}>
            {playerData?.characterImage
              ? <img src={playerData.characterImage} alt=""
                  style={{ height: 72, width: 72, objectFit: 'contain', imageRendering: 'pixelated', transform: 'scale(1.6)', transformOrigin: 'bottom center' }} />
              : <span className="text-5xl leading-none">🧙‍♂️</span>}
          </div>
        </div>

        {/* ── 중앙 VS ── */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-2xl text-slate-600/80 font-extrabold select-none">⚔️</span>
        </div>

        {/* ── 몬스터 (우측) ── */}
        <div className="absolute right-3 bottom-3 flex flex-col items-center">
          <div className="w-28 mb-1.5">
            <div className="flex justify-between text-[9px] mb-0.5">
              <span className="text-slate-300 font-bold truncate max-w-[72px]">{monster.name}</span>
              <span className="text-rose-400 font-bold">{monsterHP}</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${hpGrad(mHPpct)}`}
                style={{ width: `${mHPpct}%` }} />
            </div>
          </div>
          <div className="flex items-end justify-center" style={{ height: 130 }}>
            {monsterData ? (
              <SpriteMonster
                data={monsterData}
                anim={monsterAnim}
                flash={monsterFlash}
                scale={Math.min(monsterData.scale, 130 / monsterData.frameHeight)}
              />
            ) : (
              <span className="text-7xl leading-none"
                style={{ filter: monsterFlash ? 'brightness(4) saturate(0)' : undefined }}>
                {monster.emoji}
              </span>
            )}
          </div>
        </div>

        {/* ── 플로팅 데미지 ── */}
        {floats.filter(f => f.isPlayer).map(f => (
          <div key={f.id}
            className="absolute font-extrabold text-xl text-rose-400 pointer-events-none animate-float-up z-20"
            style={{ left: 56, bottom: 90, textShadow: '0 0 8px rgba(248,113,113,0.9)' }}>
            {f.text}
          </div>
        ))}
        {floats.filter(f => !f.isPlayer).map(f => (
          <div key={f.id}
            className="absolute font-extrabold text-xl text-yellow-300 pointer-events-none animate-float-up z-20"
            style={{ right: 56, bottom: 90, textShadow: '0 0 8px rgba(251,191,36,0.9)' }}>
            {f.text}
          </div>
        ))}

        {/* HIT / 빗나감 */}
        {answered === 'correct' && (
          <div className="absolute top-3 right-6 text-yellow-300 font-extrabold text-lg animate-bounce">💥 HIT!</div>
        )}
        {answered === 'wrong' && (
          <div className="absolute top-3 left-6 text-rose-400 font-extrabold text-sm animate-bounce">😵 빗나감!</div>
        )}
        {answered === 'timeout' && (
          <div className="absolute top-3 left-6 text-rose-400 font-extrabold text-sm animate-bounce">⏰ 시간 초과!</div>
        )}
      </div>

      {/* ── 퀴즈 영역 ── */}
      <div className="flex-1 bg-slate-100 overflow-y-auto">
        <div className="p-3 space-y-2.5">

          {/* 문제 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="font-bold text-slate-800 text-base leading-relaxed">{q.question}</p>
          </div>

          {/* 보기 */}
          <div className="grid grid-cols-2 gap-2">
            {q.options.map((opt, oi) => {
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

          {/* 해설 */}
          {answered !== null && q.explanation && (
            <div className={`rounded-xl p-3 text-xs font-medium leading-relaxed
              ${answered === 'correct'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {answered === 'correct'
                ? '✅ 정답! '
                : `❌ 정답: ${q.options[q.answer]} — `}
              {q.explanation}
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
            {wrongIdxs.map(i => (
              <div key={i} className="text-xs bg-rose-50 rounded-lg p-2.5">
                <div className="font-bold text-slate-700 mb-0.5">Q{i+1}. {dungeon.questions[i].question}</div>
                <div className="text-emerald-600">정답: {dungeon.questions[i].options[dungeon.questions[i].answer]}</div>
                {dungeon.questions[i].explanation && (
                  <div className="text-slate-400 mt-0.5">{dungeon.questions[i].explanation}</div>
                )}
              </div>
            ))}
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

  const enterDungeon = async (dungeon) => {
    // 랜덤 몬스터면 입장 시점에 한 번 확정
    const resolved = (!dungeon.monsterId || dungeon.monsterId === 'random')
      ? { ...dungeon, monsterId: getRandomMonsterId() }
      : dungeon;
    setSelectedDungeon(resolved);
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

  const doSaveResult = async ({ score, playerHP, wrongIdxs, timeBonus }) => {
    if (!selectedDungeon) return;
    setIsSaving(true);
    const dungeon  = selectedDungeon;
    const totalQ   = dungeon.questionCount;
    const cleared  = playerHP > 0;
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
    />
  );

  if (screen === 'result' && selectedDungeon && battleRes) return (
    <ResultScreen
      dungeon={selectedDungeon}
      score={battleRes.score}
      totalQ={selectedDungeon.questionCount}
      wrongIdxs={battleRes.wrongIdxs}
      playerAlive={battleRes.playerHP > 0}
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
