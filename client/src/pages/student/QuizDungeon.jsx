import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, getDocs, getDoc, doc, writeBatch,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import SpriteMonster from '../../components/SpriteMonster';
import { MONSTERS_DB, DIFF_MONSTER, TIER_LABEL, TIER_COST, generateWaves } from '../../data/monsterData';
import { fireProjectile } from '../../utils/projectile';

const PROJECTILE_TYPE = { easy: 'ice', normal: 'magic', hard: 'fire' };

// ── 유틸 ──────────────────────────────────────────────────────
const getMaxExpForLevel = (lv) =>
  lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;

const calcLevelUp = (currentLevel, currentExp, currentMaxExp, gainedExp) => {
  let level = currentLevel || 1;
  let exp   = (currentExp || 0) + gainedExp;
  let maxExp = getMaxExpForLevel(level);
  let leveled = false;
  while (exp >= maxExp && level < 99) {
    exp -= maxExp; level++; maxExp = getMaxExpForLevel(level); leveled = true;
  }
  return { level, exp, maxExp, leveled };
};

const toStars = (acc) => acc >= 90 ? 3 : acc >= 70 ? 2 : acc >= 50 ? 1 : 0;

const cleanExplanation = (text) => {
  if (!text) return '';
  return text
    .replace(/슬라이드\s*\d*/gi, '')
    .replace(/'[^']*용의자[^']*'/g, '')
    .replace(/"[^"]*용의자[^"]*"/g, '')
    .replace(/용의자.{0,30}코드/gi, '')
    .replace(/에서\s+로(\s|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
};
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

// 난이도별 테마
const DIFF_THEME = {
  easy:   {
    grad:   'from-emerald-950 via-emerald-900 to-slate-900',
    border: 'border-emerald-700/50',
    badge:  'bg-emerald-500/20 text-emerald-300 border border-emerald-600/50',
    btn:    'from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-900/40',
    label:  '쉬움',
    dot:    'bg-emerald-400',
  },
  normal: {
    grad:   'from-sky-950 via-sky-900 to-slate-900',
    border: 'border-sky-700/50',
    badge:  'bg-sky-500/20 text-sky-300 border border-sky-600/50',
    btn:    'from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 shadow-sky-900/40',
    label:  '보통',
    dot:    'bg-sky-400',
  },
  hard:   {
    grad:   'from-rose-950 via-rose-900 to-slate-900',
    border: 'border-rose-700/50',
    badge:  'bg-rose-500/20 text-rose-300 border border-rose-600/50',
    btn:    'from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 shadow-rose-900/40',
    label:  '어려움',
    dot:    'bg-rose-400',
  },
};

// ── 던전 로비 ─────────────────────────────────────────────────
function DungeonLobby({ dungeons, bestScores, onPreview, isLoading }) {
  if (isLoading) return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4 opacity-60 animate-pulse">⚔️</div>
        <p className="text-slate-400 font-bold animate-pulse">던전 목록 불러오는 중...</p>
      </div>
    </div>
  );

  if (!dungeons.length) return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 flex items-center justify-center">
      <div className="text-center p-8">
        <div className="text-7xl mb-5 opacity-20">⚔️</div>
        <p className="font-extrabold text-xl text-slate-400 mb-2">열린 퀴즈 던전이 없습니다</p>
        <p className="text-slate-600 text-sm">선생님이 퀴즈를 만들면 여기 표시됩니다</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-indigo-950/20 to-slate-950">
      {/* 타이틀 헤더 */}
      <div className="sticky top-0 z-10 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/70 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">⚔️</span>
          <h1 className="text-base font-extrabold text-white tracking-wide">퀴즈 던전</h1>
          <span className="text-xs font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
            {dungeons.length}개
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3 pb-10">
        {dungeons.map(d => {
          const best    = bestScores[d.id];
          const isFirst = !best?.cleared;
          const theme   = DIFF_THEME[d.difficulty] || DIFF_THEME.normal;
          const totalQ  = d.questions?.length || d.questionCount || 5;

          const isMulti  = Array.isArray(d.monsterIds) && d.monsterIds.length > 0;
          const isRandom = !isMulti && (!d.monsterId || d.monsterId === 'random');
          const resolvedMonsterId = isMulti
            ? d.monsterIds[d.monsterIds.length - 1]
            : (d.monsterId && d.monsterId !== 'random' ? d.monsterId : DIFF_MONSTER[d.difficulty]);
          const mDat = MONSTERS_DB[resolvedMonsterId] || null;
          const mScale = mDat
            ? Math.min(88 / mDat.frameHeight, 88 / mDat.frameWidth) * 0.88
            : 0;

          const timer = d.timeLimit !== 0
            ? (d.timeLimit != null ? d.timeLimit : (DIFF_TIMER[d.difficulty] ?? 12))
            : null;

          const waveCount = isMulti ? d.monsterIds.length
            : mDat ? Math.max(1, Math.floor(totalQ / (TIER_COST[mDat.tier] || 1)) + (totalQ % (TIER_COST[mDat.tier] || 1) > 0 ? 1 : 0)) : 1;

          return (
            <div key={d.id}
              className={`rounded-3xl overflow-hidden border shadow-2xl ${theme.border} bg-slate-900`}>

              {/* ── 카드 상단: 몬스터 + 정보 ── */}
              <div className={`bg-gradient-to-br ${theme.grad} px-4 pt-4 pb-3`}>
                <div className="flex items-center gap-4">

                  {/* 몬스터 스프라이트 박스 */}
                  {isMulti ? (
                    <div className="shrink-0 relative">
                      <div className="flex items-end gap-1 bg-black/30 rounded-2xl border border-white/10 px-2 pt-2 pb-4"
                        style={{ minHeight: 68 }}>
                        {d.monsterIds.map((mid, idx) => {
                          const md = MONSTERS_DB[mid];
                          const ms = md ? Math.min(44 / md.frameHeight, 44 / md.frameWidth) * 0.88 : 0;
                          return md ? (
                            <div key={idx} className="flex items-center justify-center" style={{ width: 36, height: 44 }}>
                              <SpriteMonster data={md} anim="idle" scale={ms} />
                            </div>
                          ) : null;
                        })}
                      </div>
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-extrabold bg-slate-950 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-full whitespace-nowrap shadow">
                        {waveCount}웨이브
                      </div>
                    </div>
                  ) : (
                    <div className="shrink-0 relative flex items-center justify-center rounded-2xl bg-black/30 border border-white/10"
                      style={{ width: 88, height: 96 }}>
                      {mDat ? (
                        <SpriteMonster data={mDat} anim="idle" scale={mScale} />
                      ) : (
                        <div className="text-5xl opacity-70">{MONSTER[d.difficulty]?.emoji || '⚔️'}</div>
                      )}
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-extrabold bg-slate-950 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-full whitespace-nowrap shadow">
                        {isRandom ? '랜덤' : `${waveCount}웨이브`}
                      </div>
                    </div>
                  )}

                  {/* 텍스트 영역 */}
                  <div className="flex-1 min-w-0 pt-1">
                    {/* 난이도 + 클리어 여부 */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${theme.badge}`}>
                        {theme.label}
                      </span>
                      {best?.cleared && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-600/40">
                          클리어 ✓
                        </span>
                      )}
                    </div>

                    {/* 던전 제목 */}
                    <h3 className="text-white font-extrabold text-base leading-snug mb-2 line-clamp-2">
                      {d.title}
                    </h3>

                    {/* 스탯 칩 */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                        📝 {totalQ}문제
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                        ⏱ {timer !== null ? `${timer}초` : '무제한'}
                      </span>
                      {d.playCount > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-400">
                          👥 {d.playCount}회
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 별점 (클리어 이력 있을 때) */}
                {best && (
                  <div className="flex items-center gap-1 mt-3">
                    {[0,1,2].map(i => (
                      <span key={i} className={`text-lg transition-all ${i < best.stars ? 'text-amber-400 drop-shadow' : 'text-slate-700'}`}>⭐</span>
                    ))}
                    <span className="text-slate-400 text-[10px] ml-1">최고 {best.accuracy}%</span>
                  </div>
                )}
              </div>

              {/* ── 카드 하단: 보상 + 입장 버튼 ── */}
              <div className="px-4 py-3 bg-slate-900/80 flex items-center justify-between gap-3 border-t border-slate-800/80">
                <div className="flex gap-1.5 flex-wrap">
                  {(d.rewards?.gold    || 0) > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-800/60">
                      🪙 {d.rewards.gold}G
                    </span>
                  )}
                  {(d.rewards?.exp     || 0) > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-800/60">
                      ⭐ {d.rewards.exp}
                    </span>
                  )}
                  {(d.rewards?.diamond || 0) > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-900/60 text-sky-300 border border-sky-800/60">
                      💎 {d.rewards.diamond}
                    </span>
                  )}
                  {isFirst && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-600/40">
                      🌟 첫클리어 ×1.5
                    </span>
                  )}
                </div>
                <button
                  onClick={() => !best?.cleared && onPreview(d)}
                  disabled={best?.cleared}
                  className={`shrink-0 px-5 py-2 rounded-2xl font-extrabold text-sm transition-all
                    ${best?.cleared
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : `bg-gradient-to-r ${theme.btn} text-white shadow-lg active:scale-95`}`}>
                  {best?.cleared ? '✓ 클리어' : '⚔️ 입장'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 보스 소개 팝업 ────────────────────────────────────────────
function BossIntroModal({ dungeon, onConfirm, onCancel }) {
  const m     = MONSTER[dungeon.difficulty] || MONSTER.normal;
  const theme = DIFF_THEME[dungeon.difficulty] || DIFF_THEME.normal;

  // 미리 확정된 웨이브 사용
  const waves = dungeon.waves || [];

  // 메인 스프라이트: 마지막 웨이브(가장 강한 몬스터)
  const mainMonsterDat = waves.length > 0 ? (MONSTERS_DB[waves[waves.length - 1].monsterId] || null) : null;
  const mScale = mainMonsterDat
    ? Math.min(130 / mainMonsterDat.frameHeight, 130 / mainMonsterDat.frameWidth) * 0.9
    : 0;

  // 제목: 고유 몬스터 이름 나열
  const uniqueNames = [...new Set(waves.map(w => MONSTERS_DB[w.monsterId]?.name).filter(Boolean))];
  const monsterDisplayName = uniqueNames.join(' + ') || m.name;

  const hasTimeLimit = dungeon.timeLimit !== 0;
  const timer = hasTimeLimit
    ? (dungeon.timeLimit != null ? dungeon.timeLimit : (DIFF_TIMER[dungeon.difficulty] || 12))
    : null;
  const totalQ      = dungeon.questions?.length || dungeon.questionCount || 5;
  const playerMaxHP = totalQ * DAMAGE_WRONG;

  const INFO = [
    { icon: '📝', label: '문제 수',   value: `${totalQ}문제` },
    { icon: '⏱',  label: '제한 시간', value: timer !== null ? `${timer}초/문제` : '무제한' },
    { icon: '❤️', label: '내 HP',    value: `${playerMaxHP}` },
    { icon: '💥', label: '오답 피해', value: `-${DAMAGE_WRONG}` },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className={`bg-slate-950 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl border-t border-slate-800 sm:border overflow-hidden shadow-2xl`}>

        {/* 상단 몬스터 배너 — 모든 몬스터를 가로 배열로 표시 */}
        <div className={`bg-gradient-to-b ${theme.grad} px-6 pt-6 pb-5 text-center relative`}>
          <div className="flex justify-center items-end gap-3 mb-3 flex-wrap" style={{ minHeight: 90 }}>
            {waves.length > 0
              ? waves.map((wave, i) => {
                  const wMon   = MONSTERS_DB[wave.monsterId];
                  if (!wMon) return null;
                  const wScale = Math.min(80 / wMon.frameHeight, 80 / wMon.frameWidth) * 0.88;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <SpriteMonster data={wMon} anim="idle" scale={wScale} />
                      <span className="text-[10px] text-white/70 font-bold leading-tight">{wMon.name}</span>
                      <span className="text-[9px] text-white/40">{wave.questionCount}문</span>
                    </div>
                  );
                })
              : <div className="text-8xl opacity-80 select-none">{m.emoji}</div>
            }
          </div>

          <div className="flex justify-center mb-2">
            <span className={`text-[11px] font-extrabold px-3 py-0.5 rounded-full ${theme.badge}`}>
              {theme.label}
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-white leading-tight">{monsterDisplayName}</h2>
          <p className="text-slate-400 text-xs mt-1 line-clamp-1">{dungeon.title}</p>
          <p className="text-slate-500 text-xs mt-0.5">{m.desc}</p>
        </div>

        {/* 정보 그리드 */}
        <div className="grid grid-cols-2 gap-2 px-5 pt-4 pb-2">
          {INFO.map(({ icon, label, value }) => (
            <div key={label} className="bg-slate-900 rounded-2xl px-3 py-2.5 border border-slate-800">
              <div className="text-slate-500 text-[10px] mb-0.5">{icon} {label}</div>
              <div className="text-white font-extrabold text-sm">{value}</div>
            </div>
          ))}
        </div>

        {/* 보상 */}
        {(dungeon.rewards?.gold || dungeon.rewards?.exp || dungeon.rewards?.diamond) && (
          <div className="mx-5 mb-2 px-4 py-2.5 bg-amber-900/20 rounded-2xl border border-amber-800/30 flex gap-3 justify-center">
            {dungeon.rewards?.gold    > 0 && <span className="text-xs font-bold text-amber-300">🪙 {dungeon.rewards.gold}G</span>}
            {dungeon.rewards?.exp     > 0 && <span className="text-xs font-bold text-indigo-300">⭐ {dungeon.rewards.exp}</span>}
            {dungeon.rewards?.diamond > 0 && <span className="text-xs font-bold text-sky-300">💎 {dungeon.rewards.diamond}</span>}
          </div>
        )}

        {/* 버튼 */}
        <div className="grid grid-cols-2 gap-3 px-5 pt-2 pb-6">
          <button onClick={onCancel}
            className="py-3.5 rounded-2xl bg-slate-800 text-slate-300 font-bold border border-slate-700 hover:bg-slate-700 transition-colors active:scale-95">
            취소
          </button>
          <button onClick={onConfirm}
            className={`py-3.5 rounded-2xl bg-gradient-to-r ${theme.btn} text-white font-extrabold shadow-lg transition-all active:scale-95`}>
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

  // 첫 몬스터 이미지 로드 확인 (대형 PNG 디코딩 렉 방지)
  const [imgReady, setImgReady] = useState(() => {
    const firstId = waves[0]?.monsterId;
    const m = firstId ? MONSTERS_DB[firstId] : null;
    if (!m?.src) return true;
    const img = new Image();
    img.src = m.src;
    return img.complete; // 캐시된 경우 즉시 true
  });

  useEffect(() => {
    if (imgReady) return;
    const ids = [...new Set(waves.map(w => w.monsterId))];
    const promises = ids.map(id => {
      const m = MONSTERS_DB[id];
      if (!m?.src) return Promise.resolve();
      const img = new Image();
      img.src = m.src;
      const p = img.decode ? img.decode().catch(() => {}) : new Promise(r => { img.onload = r; img.onerror = r; });
      return Promise.race([p, new Promise(r => setTimeout(r, 4000))]); // 최대 4초 대기
    });
    Promise.all(promises).then(() => setImgReady(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const nextRef      = useRef(null);
  const pendingRef   = useRef(null);
  const floatIdRef   = useRef(0);
  const handlerRef   = useRef(null);
  const monsterRef   = useRef(null);
  const playerRef    = useRef(null);

  const [waitingConfirm, setWaitingConfirm] = useState(false);

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

      // 파티클 발사: 플레이어 → 몬스터
      const monEl = monsterRef.current;
      const plEl  = playerRef.current;
      if (monEl) {
        const mRect = monEl.getBoundingClientRect();
        const pRect = plEl ? plEl.getBoundingClientRect() : null;
        fireProjectile({
          from: {
            x: pRect ? pRect.left + pRect.width  * 0.5 : window.innerWidth  * 0.22,
            y: pRect ? pRect.top  + pRect.height * 0.55 : window.innerHeight * 0.55,
          },
          to: {
            x: mRect.left + mRect.width  * 0.5,
            y: mRect.top  + mRect.height * 0.35,
          },
          type: PROJECTILE_TYPE[dungeon.difficulty] || 'magic',
        });
      }
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

      // 파티클 발사: 몬스터 → 플레이어
      const monEl = monsterRef.current;
      const plEl  = playerRef.current;
      if (monEl && plEl) {
        const mRect = monEl.getBoundingClientRect();
        const pRect = plEl.getBoundingClientRect();
        fireProjectile({
          from: { x: mRect.left + mRect.width * 0.5, y: mRect.top + mRect.height * 0.35 },
          to:   { x: pRect.left + pRect.width * 0.5, y: pRect.top  + pRect.height * 0.55 },
          type: 'fire',
        });
      }
    }
    setWrongIdxs(newWrong);

    const nextQ            = currentQ + 1;
    const waveCleared      = newWaveHP <= 0;
    const isLastWave       = currentWaveIdx >= waves.length - 1;
    const playerDead       = newPlayerHP <= 0;
    const allQDone         = nextQ >= totalQ;
    const cleared          = !playerDead && waveCleared && isLastWave;
    const failedByQuestion = !playerDead && allQDone && !cleared;

    const isOver      = playerDead || cleared || failedByQuestion;
    const doWaveNext  = waveCleared && !isLastWave && !playerDead;

    const advance = () => {
      setWaitingConfirm(false);
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
    };

    if (ok) {
      nextRef.current = setTimeout(advance, 1400);
    } else {
      pendingRef.current = advance;
      setWaitingConfirm(true);
    }
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

  useEffect(() => () => {
    if (nextRef.current) clearTimeout(nextRef.current);
    pendingRef.current = null;
  }, []);

  const q       = dungeon.questions[currentQ];
  const mHPpct  = (waveMonsterHP / waveMaxHP) * 100;
  const pHPpct  = (playerHP / playerMaxHP) * 100;
  const comboLv = getComboLv(combo);

  // 대형 몬스터 이미지 디코딩 대기 (최대 4초)
  if (!imgReady) {
    return (
      <div className="flex flex-col h-full bg-slate-900 items-center justify-center gap-5 select-none">
        <div className="text-5xl animate-bounce">⚔️</div>
        <div className="text-white font-extrabold text-lg">전투 준비 중...</div>
        <div className="text-slate-400 text-sm">몬스터 소환 중</div>
        <div className="flex gap-1 mt-2">
          {[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 bg-rose-500 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

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

        {/* 바닥 그라데이션 */}
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none" />
        {/* 바닥 라인 */}
        <div className="absolute inset-x-0 bottom-14 h-px bg-indigo-500/20" />

        {/* ── HP 바 행 (씬 상단 고정) ── */}
        <div className="absolute top-0 inset-x-0 z-20 px-4 pt-2 pb-2 flex items-center gap-2 bg-gradient-to-b from-slate-950/90 to-transparent pointer-events-none">
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-sky-300 font-extrabold truncate">{playerData?.name || '나'}</span>
              <span className="text-emerald-400 font-extrabold tabular-nums">{playerHP}</span>
            </div>
            <div className="w-full h-3 bg-slate-900/80 rounded-full overflow-hidden border border-slate-600/40">
              <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${hpGrad(pHPpct)}`}
                style={{ width: `${pHPpct}%` }} />
            </div>
          </div>
          <span className="text-slate-600 font-bold text-sm shrink-0 select-none">⚔️</span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-rose-300 font-extrabold truncate">{monsterData?.name || monsterMeta.name}</span>
              <span className="text-rose-400 font-extrabold tabular-nums">{waveMonsterHP}</span>
            </div>
            <div className="w-full h-3 bg-slate-900/80 rounded-full overflow-hidden border border-slate-600/40">
              <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${hpGrad(mHPpct)}`}
                style={{ width: `${mHPpct}%` }} />
            </div>
          </div>
        </div>

        {/* ── 플레이어 (좌 절대위치) ── */}
        {(() => {
          const effH = Math.round(layoutCfg.playerCharHeightPx * layoutCfg.playerScale);
          return (
            <div ref={playerRef} className={`absolute flex flex-col items-center ${playerShake ? 'animate-shake' : ''}`}
              style={{ left: `${layoutCfg.playerLeftPct}%`, bottom: layoutCfg.playerBottomPx }}>
              {/* 캐릭터 - height만 고정, width는 이미지 비율에 맡겨 letterbox 방지 */}
              <div style={{ height: effH }} className="flex items-end justify-center">
                {playerData?.characterImage
                  ? <img src={playerData.characterImage} alt=""
                      style={{ height: effH, width: 'auto', imageRendering: 'pixelated', transform: 'scaleX(-1)' }} />
                  : <span style={{ fontSize: effH * 0.6, lineHeight: 1 }}>🧙‍♂️</span>}
              </div>
            </div>
          );
        })()}

        {/* 중앙 VS */}
        <div className="absolute left-1/2 bottom-[45%] -translate-x-1/2 select-none">
          <span className="text-slate-500/60 font-extrabold text-3xl tracking-widest">VS</span>
        </div>

        {/* ── 몬스터 (우 절대위치) ── */}
        <div ref={monsterRef} className="absolute flex flex-col items-center"
          style={{ right: `${layoutCfg.monsterRightPct}%`, bottom: layoutCfg.monsterBottomPx }}>
          {/* 몬스터 */}
          <div style={{ height: layoutCfg.monsterCharHeightPx, width: layoutCfg.monsterCharHeightPx * 0.85 }}
            className="flex items-end justify-center">
            {monsterData ? (
              <SpriteMonster
                data={monsterData}
                anim={monsterAnim}
                flash={monsterFlash}
                scale={Math.min(
                  layoutCfg.monsterCharHeightPx / monsterData.frameHeight,
                  (layoutCfg.monsterCharHeightPx * 0.85) / monsterData.frameWidth
                ) * 0.9}
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
      <div className="flex-1 bg-slate-950/90 overflow-y-auto">
        <div className="p-3 space-y-2.5">

          {/* 문제 */}
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4">
            <p className="font-bold text-white text-base leading-relaxed">{q.question}</p>
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
                    ? 'border-slate-700 focus:border-amber-400 bg-slate-800 text-slate-200'
                    : answered === 'correct'
                      ? 'border-emerald-500 bg-emerald-900/60 text-emerald-200'
                      : 'border-rose-500 bg-rose-900/40 text-rose-300'
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
                let cls = 'bg-slate-800 border-2 border-slate-700 text-slate-200 hover:border-rose-400 hover:bg-slate-700';
                if (answered !== null) {
                  if (oi === q.answer)         cls = 'bg-emerald-900/60 border-2 border-emerald-500 text-emerald-200';
                  else if (oi === selectedOpt) cls = 'bg-rose-900/40 border-2 border-rose-500 text-rose-300';
                  else                         cls = 'bg-slate-800/50 border-2 border-slate-700 text-slate-500 opacity-50';
                }
                return (
                  <button key={oi}
                    onClick={() => handleAnswer(oi)}
                    disabled={answered !== null}
                    className={`py-3.5 px-3 rounded-2xl font-bold text-sm text-left transition-all active:scale-95 ${cls}`}>
                    <span className="text-slate-500 mr-1.5">{['①','②','③','④'][oi]}</span>{opt}
                  </button>
                );
              })}
            </div>
          )}

          {/* 해설 */}
          {answered !== null && (q.explanation || q.type === 'sa') && (
            <div className={`rounded-xl p-3 font-medium leading-relaxed
              ${answered === 'correct'
                ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700 text-xs'
                : 'bg-rose-900/30 text-rose-300 border border-rose-800 text-sm'}`}>
              {answered === 'correct'
                ? '✅ 정답! '
                : `❌ 정답: ${q.type === 'sa' ? q.answer : (q.options?.[q.answer] || '')} — `}
              {cleanExplanation(q.explanation)}
            </div>
          )}

          {/* 틀렸을 때 확인 버튼 */}
          {waitingConfirm && (
            <button
              onClick={() => {
                if (pendingRef.current) {
                  pendingRef.current();
                  pendingRef.current = null;
                }
              }}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-2xl text-base active:scale-95 transition-all">
              ✓ 확인 — 다음 문제
            </button>
          )}

        </div>
      </div>
    </div>
  );
}

// ── 결과 화면 ──────────────────────────────────────────────────
function ResultScreen({
  dungeon, score, totalQ, wrongIdxs, cleared,
  earnedRewards, leveledUp, isSaving, maxCombo,
  canRetry, onRetry, onReturnLobby,
}) {
  const accuracy  = totalQ > 0 ? Math.round(score / totalQ * 100) : 0;
  const stars     = toStars(accuracy);
  const [visStars, setVisStars] = useState(0);

  useEffect(() => {
    if (stars === 0) return;
    let n = 0;
    const t = setInterval(() => {
      n++;
      setVisStars(n);
      if (n >= stars) clearInterval(t);
    }, 420);
    return () => clearInterval(t);
  }, [stars]);

  const STATS = [
    ['정답 수',   `${score} / ${totalQ}`,                null],
    ['정확도',    `${accuracy}%`,                         accuracy >= 70 ? 'text-emerald-600' : 'text-rose-500'],
    ['최고 콤보', `🔥 ${maxCombo}연속`,                   'text-orange-500'],
    ...(wrongIdxs.length ? [['오답 수', `${wrongIdxs.length}개`, 'text-rose-500']] : []),
  ];

  return (
    <div className="flex flex-col items-center min-h-full p-5 bg-slate-50">
      <div className="text-6xl mt-4 mb-2">{cleared ? '🏆' : '💀'}</div>
      <h2 className="text-2xl font-extrabold text-slate-800 mb-1">
        {cleared ? '던전 클리어!' : '던전 실패'}
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
          ${cleared ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className={`font-bold mb-2 text-sm ${cleared ? 'text-emerald-700' : 'text-slate-600'}`}>
            {cleared ? '🎁 획득 보상' : '🎁 정답 수 비례 보상'}
          </div>
          {(earnedRewards.goldEarned > 0 || earnedRewards.expEarned > 0 || earnedRewards.diamondEarned > 0) ? (
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
          ) : (
            <div className="text-sm text-slate-500">획득 보상이 없습니다.</div>
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
                  {cleanExplanation(wq.explanation) && (
                    <div className="text-slate-500 mt-0.5">{cleanExplanation(wq.explanation)}</div>
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

function QuizDungeon({ studentCode, studentDocId, tickets, onUseTicket, isTeacher = false, teacherUid = null }) {
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
        // teacherUid 결정: 교사 모드는 prop, 학생 모드는 학생 문서에서 추출
        let filterUid = teacherUid;
        if (!filterUid && studentDocId) {
          const sSnap = await getDoc(doc(db, 'students', studentDocId));
          filterUid = sSnap.data()?.teacherUid || null;
        }

        const dungeonQuery = filterUid
          ? query(collection(db, 'quizDungeons'), where('active', '==', true), where('teacherUid', '==', filterUid))
          : query(collection(db, 'quizDungeons'), where('active', '==', true));

        const [dungSnap, resSnap] = await Promise.all([
          getDocs(dungeonQuery),
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
  }, [studentDocId, teacherUid]);

  // 학생 데이터 로드
  useEffect(() => {
    if (!studentDocId) return;
    getDoc(doc(db, 'students', studentDocId)).then(snap => {
      if (snap.exists()) setStudentData({ id: snap.id, ...snap.data() });
    });
  }, [studentDocId]);

  // 교사 캐릭터 데이터 로드 (isTeacher 모드)
  useEffect(() => {
    if (!isTeacher || !teacherUid) return;
    getDoc(doc(db, 'teacherProfiles', teacherUid)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        const lv = d.level ?? 50;
        setStudentData({
          id:             teacherUid,
          characterImage: d.characterImage ?? '',
          parts:          d.parts ?? {},
          level:          lv,
          exp:            0,
          maxExp:         800,
          gold:           0,
          diamonds:       0,
        });
      }
    }).catch(() => {});
  }, [isTeacher, teacherUid]);

  const enterDungeon = (dungeon) => {
    const totalQ = dungeon.questions.length;
    // 미리 확정된 웨이브가 있으면 재사용, 없으면 새로 생성 (재도전 등)
    const waves  = dungeon.waves || generateWaves(totalQ, dungeon.monsterIds || dungeon.monsterId, dungeon.id);
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
    const totalQ   = (dungeon.questions || []).length || dungeon.questionCount || 0;
    const accuracy = totalQ > 0 ? Math.round(score / totalQ * 100) : 0;
    const isFirst  = !bestScores[dungeon.id]?.cleared;
    const rewardRatio = totalQ > 0 ? Math.max(0, Math.min(1, score / totalQ)) : 0;

    const mult          = (isFirst && cleared) ? 1.5 : 1;
    const goldEarned    = Math.round((dungeon.rewards?.gold    || 0) * rewardRatio * mult);
    const expEarned     = Math.round((dungeon.rewards?.exp     || 0) * rewardRatio * mult);
    const diamondEarned = Math.round((dungeon.rewards?.diamond || 0) * rewardRatio * mult);

    setEarnedRewards({
      goldEarned, expEarned, diamondEarned,
      firstClear: isFirst && cleared,
    });

    if (isTeacher || !studentDocId || !studentData) { setIsSaving(false); return; }

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

  // 몬스터 이미지 미리 디코딩 (큰 보스 PNG 로드 렉 방지)
  const preloadWaveImages = (waves) => {
    const ids = [...new Set(waves.map(w => w.monsterId))];
    ids.forEach(id => {
      const m = MONSTERS_DB[id];
      if (!m?.src) return;
      const img = new Image();
      img.src = m.src;
      img.decode?.().catch(() => {});
    });
  };

  // "입장" 클릭 시 웨이브를 미리 확정해서 모달과 배틀이 같은 몬스터를 사용하게 함
  const handlePreview = (d) => {
    const totalQ = (d.questions || []).length;
    const waves  = generateWaves(totalQ, d.monsterIds || d.monsterId, d.id);
    preloadWaveImages(waves); // 팝업 보는 동안 백그라운드 로드
    setPreviewDungeon({ ...d, waves });
  };

  if (screen === 'lobby') return (
    <>
      <DungeonLobby
        dungeons={dungeons}
        bestScores={bestScores}
        onPreview={handlePreview}
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
      totalQ={(selectedDungeon.questions || []).length || selectedDungeon.questionCount || 0}
      wrongIdxs={battleRes.wrongIdxs}
      cleared={!!battleRes.cleared}
      earnedRewards={earnedRewards}
      leveledUp={leveledUp}
      isSaving={isSaving}
      maxCombo={battleRes.maxCombo}
      canRetry={!battleRes.cleared}
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
