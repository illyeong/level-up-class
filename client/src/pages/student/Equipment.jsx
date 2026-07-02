import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, getDocs, doc, updateDoc, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { GRADE, SLOTS, ENHANCE, PITY_LIMIT, STAT_LABEL } from '../../constants/equipment';

const STAR_IMG = '/images/Icon_Resources_Star01_Gold.png';
const STONE_DROP_RATE = 0.2;

const DISMANTLE_REWARDS = {
  common:    { stones: 1 },
  rare:      { stones: 3 },
  epic:      { stones: 8 },
  legendary: { stones: 20 },
};

const SYNTHESIS_RECIPES = [
  { fromGrade: 'common', required: 5, toGrade: 'rare' },
  { fromGrade: 'rare', required: 4, toGrade: 'epic' },
  { fromGrade: 'epic', required: 3, toGrade: 'legendary' },
];

const DISMANTLE_EFFECT_MS = 3000;
const SYNTHESIS_SUCCESS_RATE = 0.25;
const SYNTHESIS_EFFECT_MS = 3000;

// ── 별 표시 컴포넌트 ──────────────────────────────────────────
function Stars({ count, total = 5, size = 'md' }) {
  const cls = size === 'lg' ? 'w-8 h-8' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: total }, (_, i) => (
        <img key={i} src={STAR_IMG} alt="★"
          className={`${cls} object-contain transition-all duration-300
            ${i < count ? 'opacity-100' : 'opacity-15 grayscale'}`} />
      ))}
    </div>
  );
}

// ── 장비 카드 ─────────────────────────────────────────────────
export function EquipCard({ item, stars = 0, isEquipped, onClick, compact = false }) {
  const g = GRADE[item?.grade] || GRADE.common;
  if (!item) return null;
  const statEntries = Object.entries(STAT_LABEL).filter(([key]) => (item.stats?.[key] || 0) > 0);
  const enhBonus = (stars || 0) * 5;

  // ── compact=false : 이름(상단) → 이미지(중앙) → 등급/별 → 스탯(하단) ──
  if (!compact) {
    return (
      <button onClick={onClick}
        className={`relative flex flex-col items-center rounded-2xl border-2 transition-all active:scale-95 text-left w-full
          ${g.border} ${g.bg} p-3 gap-2
          ${isEquipped ? 'ring-2 ring-indigo-500 ring-offset-2 shadow-lg' : 'hover:shadow-md hover:-translate-y-0.5'}
          ${item.grade === 'legendary' ? 'shadow-amber-100 shadow-md' : ''}
          ${item.grade === 'epic'      ? 'shadow-violet-100 shadow-md' : ''}`}>

        {isEquipped && (
          <span className="absolute top-1 left-1 text-[8px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-bold">착용</span>
        )}

        {/* 이름 - 상단 */}
        <div className="font-extrabold text-slate-800 text-xs leading-tight text-center w-full px-1 line-clamp-2 bg-white/70 rounded-md py-0.5">
          {item.name}
        </div>

        {/* 이미지 - 중앙 */}
        <div className="w-20 h-20 flex items-center justify-center bg-white/40 rounded-xl overflow-hidden shadow-sm">
          {item.image
            ? <img src={item.image} alt={item.name} className="w-full h-full object-contain drop-shadow-sm" />
            : <span className="text-4xl">{SLOTS.find(s => s.key === item.type)?.icon || '🗡️'}</span>}
        </div>

        {/* 등급 뱃지 + 별 */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${g.badge}`}>{g.label}</span>
          <Stars count={stars} size="sm" />
        </div>

        {/* 스탯 - 하단 */}
        {statEntries.length > 0 && (
          <div className="w-full space-y-1 border-t border-slate-200/60 pt-1.5">
            {statEntries.map(([key, meta]) => {
              const base  = item.stats[key];
              const total = base + enhBonus;
              return (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-0.5">
                    {meta.img
                      ? <img src={meta.img} alt="" className="w-3 h-3 object-contain" />
                      : <span className="text-[10px]">{meta.icon}</span>}
                    <span className="text-slate-500 text-[10px]">{meta.label}</span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <span className="font-extrabold text-indigo-600 text-[11px]">+{total}</span>
                    {enhBonus > 0 && (
                      <span className="text-amber-500 font-bold text-[9px]">(★+{enhBonus})</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </button>
    );
  }

  // ── compact=true : 기존 세로 레이아웃 유지 ──
  return (
    <button onClick={onClick}
      className={`relative flex w-full min-h-[230px] flex-col items-center justify-start rounded-2xl border-2 transition-all active:scale-95
        ${g.border} ${g.bg} p-2.5 gap-1.5
        ${isEquipped ? 'ring-2 ring-indigo-500 ring-offset-2 shadow-lg' : 'hover:shadow-md hover:-translate-y-0.5'}
        ${item.grade === 'legendary' ? 'shadow-amber-100 shadow-md' : ''}
        ${item.grade === 'epic'      ? 'shadow-violet-100 shadow-md' : ''}`}>
      <span className={`absolute top-1 right-1 text-xs font-extrabold px-2 py-0.5 rounded-full ${g.badge}`}>
        {g.label}
      </span>
      {isEquipped && (
        <span className="absolute top-1 left-1 text-[8px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-bold">착용</span>
      )}
      <div className="w-24 h-24 flex items-center justify-center">
        {item.image
          ? <img src={item.image} alt={item.name} className="w-full h-full object-contain drop-shadow-sm" />
          : <span className="text-4xl">{SLOTS.find(s => s.key === item.type)?.icon || '🗡️'}</span>}
      </div>
      <div className="font-extrabold text-slate-800 line-clamp-2 min-h-[30px] w-full text-center leading-tight text-xs">
        {item.name}
      </div>
      <Stars count={stars} size="sm" />
      {statEntries.length > 0 && (
        <div className="w-full space-y-0.5 border-t border-slate-200/70 pt-1.5 mt-0.5">
          {statEntries.map(([key, meta]) => {
            const base  = item.stats[key];
            const total = base + enhBonus;
            return (
              <div key={key} className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-0.5">
                  {meta.img
                    ? <img src={meta.img} alt="" className="w-3 h-3 object-contain" />
                    : <span className="text-[9px]">{meta.icon}</span>}
                  <span className="text-slate-500 text-[9px]">{meta.label}</span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="font-extrabold text-indigo-600 text-[10px]">+{total}</span>
                  {enhBonus > 0 && (
                    <span className="text-amber-500 font-bold text-[7px]">(★+{enhBonus})</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </button>
  );
}

// ── 강화 모달 ─────────────────────────────────────────────────
function EnhanceModal({ invItem, item, stones, onEnhance, onClose }) {
  // stage: 'idle' | 'confirm' | 'loading' | 'result'
  const [stage, setStage]               = useState('idle');
  const [result, setResult]             = useState(null);   // 'success' | 'fail'
  const [currentStars, setCurrentStars] = useState(invItem?.stars || 0);
  const canvasRef  = useRef(null);
  const itemImgRef = useRef(null);   // item image element for particle origin
  const starImgRef = useRef(null);   // preloaded star PNG

  const cfg        = ENHANCE[currentStars];
  const canEnhance = cfg && stones >= cfg.stones;
  const g          = GRADE[item?.grade] || GRADE.common;

  // star 이미지 프리로드
  useEffect(() => {
    const img = new Image();
    img.src = STAR_IMG;
    starImgRef.current = img;
  }, []);

  // ── 강화 결과 계산 ── (useEffect보다 먼저 선언)
  const doEnhanceResult = useCallback(() => {
    const stars     = currentStars;           // 호출 시점의 별 수 (클로저 안전)
    const cfg2      = ENHANCE[stars];
    if (!cfg2) return;

    const pityKey    = `pity_${invItem.id}`;
    const pityCount  = parseInt(localStorage.getItem(pityKey) || '0');
    const guaranteed = stars === 4 && pityCount >= PITY_LIMIT;
    const success    = guaranteed || Math.random() < cfg2.rate;
    localStorage.setItem(pityKey, success ? '0' : String(pityCount + 1));

    if (success) setCurrentStars(s => s + 1);
    setResult(success ? 'success' : 'fail');
    setStage('result');
    onEnhance(success);

    if (success) setTimeout(() => spawnParticles(), 80);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStars, invItem?.id]);

  // 5초 후 강화 결과 처리
  useEffect(() => {
    if (stage !== 'loading') return;
    const t = setTimeout(doEnhanceResult, 5000);
    return () => clearTimeout(t);
  }, [stage, doEnhanceResult]);

  // ── loading 중 지속 파티클 (별/스파크 위로 떠오르기) ──
  useEffect(() => {
    if (stage !== 'loading') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const COLORS = ['#f59e0b', '#fbbf24', '#fcd34d', '#fb923c', '#fed7aa', '#fde68a'];
    const particles = [];
    let rafId = null;
    let stopped = false;

    const spawnBatch = () => {
      if (stopped) return;
      const itemEl = itemImgRef.current;
      const rect   = itemEl?.getBoundingClientRect();
      const cx     = rect ? rect.left + rect.width  / 2 : window.innerWidth  / 2;
      const cy     = rect ? rect.top  + rect.height / 2 : window.innerHeight / 3;

      for (let i = 0; i < 4; i++) {
        particles.push({
          x:     cx + (Math.random() - 0.5) * rect?.width * 0.8 ?? 30,
          y:     cy + (Math.random() - 0.5) * 10,
          vx:    (Math.random() - 0.5) * 1.2,
          vy:    -(1.5 + Math.random() * 2.5),
          size:  4 + Math.random() * 8,
          rot:   Math.random() * Math.PI * 2,
          rotV:  (Math.random() - 0.5) * 0.18,
          life:  1,
          decay: 0.012 + Math.random() * 0.010,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          isStar: Math.random() < 0.5,
        });
      }
    };

    const spawnInterval = setInterval(spawnBatch, 120);

    const si = starImgRef.current;
    const animate = () => {
      if (stopped) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x   += p.vx;
        p.y   += p.vy;
        p.vx  *= 0.99;
        p.rot += p.rotV;
        p.life -= p.decay;

        if (p.life <= 0) { particles.splice(i, 1); continue; }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);

        if (p.isStar && si?.complete && si.naturalWidth > 0) {
          ctx.drawImage(si, -p.size / 2, -p.size / 2, p.size, p.size);
        } else {
          // 다이아몬드 점 형태
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(0, -p.size / 2);
          ctx.lineTo(p.size / 3, 0);
          ctx.lineTo(0, p.size / 2);
          ctx.lineTo(-p.size / 3, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      rafId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      stopped = true;
      clearInterval(spawnInterval);
      if (rafId) cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ── 파티클 ──
  const spawnParticles = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    // 아이템 이미지 위치에서 파티클 출발
    const itemEl = itemImgRef.current;
    const rect   = itemEl?.getBoundingClientRect();
    const cx     = rect ? rect.left + rect.width  / 2 : window.innerWidth  / 2;
    const cy     = rect ? rect.top  + rect.height / 2 : window.innerHeight / 3;

    const particles = Array.from({ length: 55 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 9;
      return {
        x:  cx + (Math.random() - 0.5) * 20,
        y:  cy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3.5,
        size:  12 + Math.random() * 20,
        rot:   Math.random() * Math.PI * 2,
        rotV:  (Math.random() - 0.5) * 0.3,
        life:  1,
        decay: 0.010 + Math.random() * 0.008,
      };
    });

    const si = starImgRef.current;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let anyAlive = false;
      for (const p of particles) {
        if (p.life <= 0) continue;
        anyAlive = true;
        p.x   += p.vx;
        p.y   += p.vy;
        p.vy  += 0.2;
        p.vx  *= 0.98;
        p.rot += p.rotV;
        p.life -= p.decay;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (si?.complete && si.naturalWidth > 0) {
          ctx.drawImage(si, -p.size / 2, -p.size / 2, p.size, p.size);
        } else {
          ctx.fillStyle = `hsl(${40 + Math.random() * 25}, 100%, 60%)`;
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (anyAlive) requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    animate();
  };

  return (
    <>
      {/* 파티클 캔버스 - 전체 화면, 클릭 통과 */}
      <canvas ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-[60]"
        style={{ width: '100vw', height: '100vh' }} />

      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
        <div className="bg-slate-900 rounded-3xl w-full max-w-md border border-slate-700 shadow-2xl overflow-hidden">

          {/* 헤더 */}
          <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-slate-800">
            <h2 className="font-extrabold text-white text-lg flex items-center gap-2">
              <img src={STAR_IMG} className="w-6 h-6" alt="" />
              장비 강화
            </h2>
            {stage !== 'loading' && (
              <button onClick={onClose}
                className="text-slate-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-800 transition-colors">✕</button>
            )}
          </div>

          <div className="p-5 space-y-4">

            {/* 아이템 미리보기 - 항상 표시 */}
            <div className={`relative flex items-center gap-4 rounded-2xl p-4 border overflow-hidden
              ${g.border} ${g.bg}
              ${stage === 'loading'      ? 'animate-item-glow' : ''}
              ${result === 'success'     ? 'animate-enhance-success' : ''}
              ${result === 'fail'        ? 'animate-enhance-fail'    : ''}`}>

              {result === 'success' && (
                <div className="absolute inset-0 bg-gradient-to-r from-amber-300/30 to-yellow-300/30 pointer-events-none" />
              )}
              {result === 'fail' && (
                <div className="absolute inset-0 bg-red-900/25 pointer-events-none" />
              )}

              <div ref={itemImgRef}
                className="w-16 h-16 rounded-xl bg-white/60 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                {item?.image
                  ? <img src={item.image} alt="" className="w-full h-full object-contain" />
                  : <span className="text-3xl">{SLOTS.find(s => s.key === item?.type)?.icon || '🗡️'}</span>}
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-slate-800 text-sm truncate">{item?.name}</div>
                <span className={`inline-block text-sm font-bold px-2 py-1 rounded-full ${g.badge} mt-0.5`}>
                  {g.label}
                </span>
                <div className="mt-2">
                  <Stars count={currentStars} />
                </div>
              </div>
            </div>

            {/* ─── IDLE: 정보 표시 ─── */}
            {stage === 'idle' && (
              <>
                {cfg ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-800 rounded-2xl p-3.5 text-center border border-slate-700">
                        <div className="text-[10px] text-slate-400 mb-1">성공 확률</div>
                        <div className={`text-3xl font-extrabold
                          ${cfg.rate >= 0.6 ? 'text-emerald-400' : cfg.rate >= 0.3 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {(cfg.rate * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className="bg-slate-800 rounded-2xl p-3.5 text-center border border-slate-700">
                        <div className="text-[10px] text-slate-400 mb-1">필요 강화석</div>
                        <div className={`text-3xl font-extrabold ${stones >= cfg.stones ? 'text-sky-400' : 'text-rose-400'}`}>
                          {cfg.stones}
                        </div>
                      </div>
                    </div>

                    <div className={`flex items-center justify-between rounded-xl px-4 py-3
                      ${stones >= cfg.stones ? 'bg-sky-950/50 border border-sky-800' : 'bg-rose-950/50 border border-rose-900'}`}>
                      <span className="text-slate-400 text-sm font-medium">보유 강화석</span>
                      <span className={`font-extrabold text-base ${stones >= cfg.stones ? 'text-sky-400' : 'text-rose-400'}`}>
                        🔮 {stones}개
                      </span>
                    </div>

                    <button onClick={() => canEnhance && setStage('confirm')} disabled={!canEnhance}
                      className={`w-full py-4 rounded-2xl font-extrabold text-base transition-all active:scale-95 flex items-center justify-center gap-2
                        ${canEnhance
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 text-white shadow-lg shadow-amber-900/40'
                          : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                      <img src={STAR_IMG} className={`w-5 h-5 ${!canEnhance && 'grayscale opacity-30'}`} alt="" />
                      {canEnhance ? `★${currentStars} → ★${currentStars + 1} 강화하기` : '강화석 부족'}
                    </button>
                  </>
                ) : (
                  <div className="text-center py-8 flex flex-col items-center gap-3">
                    <Stars count={5} size="lg" />
                    <div className="text-amber-400 font-extrabold text-xl">🌟 최고 강화 달성!</div>
                  </div>
                )}
              </>
            )}

            {/* ─── CONFIRM: 강화하시겠습니까? ─── */}
            {stage === 'confirm' && cfg && (
              <div className="space-y-4">
                <div className="bg-slate-800 rounded-2xl p-5 border border-amber-600/40 text-center">
                  <div className="text-amber-400 font-extrabold text-base mb-4">⚠️ 강화하시겠습니까?</div>
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-xs text-slate-400 mb-2">현재</div>
                      <Stars count={currentStars} size="lg" />
                    </div>
                    <div className="text-slate-300 text-2xl font-bold">→</div>
                    <div className="text-center">
                      <div className="text-xs text-amber-400 mb-2 font-bold">강화 후</div>
                      <Stars count={currentStars + 1} size="lg" />
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="text-slate-400">
                      강화석 <span className="text-sky-400 font-extrabold">{cfg.stones}개</span> 소모
                    </div>
                    <div className="text-slate-400">
                      성공 확률
                      <span className={`font-extrabold ml-1
                        ${cfg.rate >= 0.6 ? 'text-emerald-400' : cfg.rate >= 0.3 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {(cfg.rate * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-rose-400 text-xs mt-2">실패 시 강화석만 소모됩니다</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setStage('idle')}
                    className="py-3.5 rounded-2xl font-extrabold text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors active:scale-95">
                    취소
                  </button>
                  <button onClick={() => setStage('loading')}
                    className="py-3.5 rounded-2xl font-extrabold text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 text-white shadow-lg active:scale-95 transition-all">
                    ⚒️ 강화 시작
                  </button>
                </div>
              </div>
            )}

            {/* ─── LOADING: 5초 게이지 ─── */}
            {stage === 'loading' && (
              <div className="space-y-5 py-2">

                <div className="text-center space-y-1">
                  <div className="text-white font-extrabold text-xl animate-pulse">⚒️ 강화 중...</div>
                  <div className="text-slate-500 text-xs">잠시 기다려주세요</div>
                </div>

                <div className="space-y-2">
                  <div className="relative h-7 bg-slate-800 rounded-full overflow-hidden border border-slate-700 shadow-inner">
                    <div className="gauge-bar-5s w-full h-full rounded-full bg-gradient-to-r from-sky-500 via-amber-400 to-orange-500 shadow-lg" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-extrabold text-white drop-shadow">강화 중...</span>
                    </div>
                    {/* 빛 흐르는 효과 */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent
                      animate-pulse rounded-full pointer-events-none" />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>★{currentStars}</span>
                    <span>★{currentStars + 1}</span>
                  </div>
                </div>

                <div className="flex justify-center gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}

            {/* ─── RESULT ─── */}
            {stage === 'result' && (
              <div className="space-y-4">
                {result === 'success' ? (
                  <div className="bg-amber-900/40 border border-amber-600/50 rounded-2xl p-5 text-center">
                    <div className="text-4xl mb-2">✨</div>
                    <div className="text-amber-400 font-extrabold text-2xl mb-1">강화 성공!</div>
                    <div className="text-amber-300 text-sm mb-4">★{currentStars - 1} → ★{currentStars} 달성!</div>
                    <div className="flex justify-center">
                      <Stars count={currentStars} size="lg" />
                    </div>
                  </div>
                ) : (
                  <div className="bg-rose-900/40 border border-rose-700/50 rounded-2xl p-5 text-center">
                    <div className="text-4xl mb-2">💔</div>
                    <div className="text-rose-400 font-extrabold text-2xl mb-1">강화 실패</div>
                    <div className="text-rose-300 text-sm">강화석이 사라졌습니다...</div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {result === 'fail' && (
                    <button onClick={() => { setStage('idle'); setResult(null); }}
                      className="py-3.5 rounded-2xl font-extrabold text-sm bg-amber-600 hover:bg-amber-500 text-white transition-colors active:scale-95">
                      다시 시도
                    </button>
                  )}
                  <button onClick={onClose}
                    className={`py-3.5 rounded-2xl font-extrabold text-sm bg-slate-700 hover:bg-slate-600 text-white transition-colors active:scale-95
                      ${result === 'success' ? 'col-span-2' : ''}`}>
                    {result === 'success' ? '✅ 확인' : '닫기'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
function DismantleModal({ plan, onApply, onClose }) {
  const [stage, setStage] = useState('confirm');
  const [error, setError] = useState('');
  const appliedRef = useRef(false);

  const entries = plan?.entries || [];
  const totalStones = plan?.totalStones || 0;
  const possibleStones = plan?.possibleStones || 0;
  const firstEntry = entries[0];
  const firstItem = firstEntry?.item;
  const topEntry = entries.reduce((best, entry) => {
    const bestOrder = best ? (best.gradeOrder ?? 99) : 99;
    return entry.gradeOrder < bestOrder ? entry : best;
  }, null);
  const topGrade = topEntry?.item?.grade || firstItem?.grade || 'common';
  const g = GRADE[topGrade] || GRADE.common;
  const isBatch = entries.length > 1;

  useEffect(() => {
    if (stage !== 'processing') return undefined;
    const t = setTimeout(async () => {
      if (appliedRef.current) return;
      appliedRef.current = true;
      try {
        await onApply(plan);
        setStage('result');
      } catch (e) {
        console.error(e);
        setError('분해 처리 중 오류가 발생했습니다.');
        setStage('confirm');
        appliedRef.current = false;
      }
    }, DISMANTLE_EFFECT_MS);
    return () => clearTimeout(t);
  }, [onApply, plan, stage]);

  if (!plan || entries.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4">
      <style>{`
        @keyframes dismantlePulse { 0%,100% { transform: scale(1); opacity:.75; } 50% { transform: scale(1.12); opacity:1; } }
        @keyframes dismantleSpin { to { transform: rotate(360deg); } }
        @keyframes dismantleShake { 0%,100% { transform: translate(0,0) rotate(0deg); } 20% { transform: translate(-3px,2px) rotate(-2deg); } 40% { transform: translate(4px,-2px) rotate(2deg); } 60% { transform: translate(-2px,-3px) rotate(1deg); } 80% { transform: translate(3px,3px) rotate(-1deg); } }
        @keyframes dismantleShard { 0% { transform: translate(0,0) scale(.4); opacity:0; } 25% { opacity:1; } 100% { transform: translate(var(--dx), var(--dy)) scale(1); opacity:0; } }
        @keyframes dismantleFlash { 0%,75% { opacity:0; } 86% { opacity:.95; } 100% { opacity:0; } }
        @keyframes dismantleBar { from { width: 0%; } to { width: 100%; } }
      `}</style>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-600 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-white">장비 분해</h2>
            <p className="text-xs font-bold text-slate-500">{isBatch ? `${entries.length}개 일괄 분해` : firstItem?.name}</p>
          </div>
          {stage !== 'processing' && (
            <button onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-800 hover:text-white">
              ×
            </button>
          )}
        </div>

        <div className="p-5">
          <div className={`relative mb-4 flex min-h-[260px] items-center justify-center overflow-hidden rounded-3xl border ${g.border} bg-slate-900`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.18),transparent_55%)]" />
            <div className="absolute h-44 w-44 rounded-full border border-amber-300/30"
              style={{ animation: stage === 'processing' ? 'dismantleSpin 2.4s linear infinite' : 'dismantlePulse 2s ease-in-out infinite' }} />
            <div className="absolute h-32 w-32 rounded-full border border-cyan-300/25"
              style={{ animation: stage === 'processing' ? 'dismantleSpin 1.5s linear infinite reverse' : 'dismantlePulse 2.4s ease-in-out infinite' }} />

            {stage === 'processing' && Array.from({ length: topGrade === 'legendary' ? 30 : topGrade === 'epic' ? 24 : 18 }, (_, i) => {
              const angle = (i / 30) * Math.PI * 2;
              const distance = 80 + (i % 5) * 15;
              const dx = `${Math.cos(angle) * distance}px`;
              const dy = `${Math.sin(angle) * distance}px`;
              return (
                <span key={i}
                  className="absolute h-2 w-2 rounded-sm bg-amber-300 shadow-lg shadow-amber-400/50"
                  style={{
                    '--dx': dx,
                    '--dy': dy,
                    left: '50%',
                    top: '50%',
                    animation: `dismantleShard 1.1s ease-out ${0.18 + (i % 10) * 0.08}s infinite`,
                  }} />
              );
            })}

            {stage === 'processing' && totalStones > 0 && Array.from({ length: 10 }, (_, i) => (
              <span key={`crystal-${i}`}
                className="absolute h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-lg shadow-cyan-300/70"
                style={{
                  '--dx': `${(i % 2 ? 1 : -1) * (55 + i * 7)}px`,
                  '--dy': `${-80 + (i % 4) * 22}px`,
                  left: '50%',
                  top: '50%',
                  animation: `dismantleShard 1.25s ease-out ${1.4 + i * 0.06}s infinite`,
                }} />
            ))}

            <div className="absolute inset-0 bg-white pointer-events-none" style={{ animation: stage === 'processing' ? 'dismantleFlash 3s ease-out forwards' : 'none' }} />

            <div className="relative z-10 flex flex-col items-center">
              <div className="mb-4 rounded-full border border-amber-500/40 bg-slate-950 px-4 py-1.5 text-xs font-black tracking-wider text-amber-300 shadow-[0_0_24px_rgba(245,158,11,0.25)]">
                {stage === 'processing' ? 'DISMANTLING' : stage === 'result' ? 'COMPLETE' : 'READY'}
              </div>
              <div className={`relative flex h-28 w-28 items-center justify-center rounded-3xl border-2 bg-white/90 ${g.border}`}
                style={{ animation: stage === 'processing' ? 'dismantleShake .28s linear infinite' : 'none' }}>
                {isBatch ? (
                  <div className="flex flex-col items-center">
                    <div className="text-4xl">⚒️</div>
                    <div className="mt-1 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-extrabold text-white">{entries.length}개</div>
                  </div>
                ) : firstItem?.image ? (
                  <img src={firstItem.image} alt="" className="h-full w-full object-contain drop-shadow-md" />
                ) : (
                  <span className="text-5xl">{SLOTS.find(s => s.key === firstItem?.type)?.icon || '⚔️'}</span>
                )}
              </div>
            </div>
          </div>

          {stage === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-400">분해 대상</span>
                  <span className="font-extrabold text-white">{entries.length}개</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-400">강화석 기회</span>
                  <span className="font-extrabold text-cyan-300">최대 {possibleStones}개, 각 장비 20%</span>
                </div>
              </div>
              {error && <div className="rounded-xl border border-rose-700 bg-rose-950/60 px-3 py-2 text-xs font-bold text-rose-300">{error}</div>}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={onClose}
                  className="rounded-2xl border border-slate-700 bg-slate-800 py-3.5 text-sm font-extrabold text-slate-300 transition-colors hover:bg-slate-700">
                  취소
                </button>
                <button onClick={() => setStage('processing')}
                  className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-orange-950/40 transition-all active:scale-95">
                  분해 시작
                </button>
              </div>
            </div>
          )}

          {stage === 'processing' && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-xl font-extrabold text-white">장비를 분해하는 중...</div>
                <div className="mt-1 text-xs font-bold text-slate-500">제련로가 보상을 추출하고 있습니다</div>
              </div>
              <div className="h-7 overflow-hidden rounded-full border border-slate-700 bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-400 to-cyan-300"
                  style={{ animation: `dismantleBar ${DISMANTLE_EFFECT_MS}ms linear forwards` }} />
              </div>
            </div>
          )}

          {stage === 'result' && (
            <div className="space-y-4">
              <div className={`rounded-2xl border p-5 text-center ${totalStones > 0 ? 'border-cyan-500/50 bg-cyan-950/40' : 'border-slate-700 bg-slate-900'}`}>
                <div className="mb-2 text-4xl">{totalStones > 0 ? '💎' : '🌫️'}</div>
                <div className="text-2xl font-extrabold text-white">분해 완료</div>
                <div className="mt-3">
                  <div className="rounded-xl bg-slate-950/70 px-3 py-3">
                    <div className="text-xs font-bold text-slate-500">강화석</div>
                    <div className={`text-lg font-extrabold ${totalStones > 0 ? 'text-cyan-300' : 'text-slate-500'}`}>+{totalStones}</div>
                  </div>
                </div>
                {totalStones === 0 && <p className="mt-3 text-xs font-bold text-slate-500">이번에는 강화석이 나오지 않았습니다.</p>}
              </div>
              <button onClick={onClose}
                className="w-full rounded-2xl bg-slate-700 py-3.5 text-sm font-extrabold text-white transition-colors hover:bg-slate-600">
                확인
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SynthesisModal({ plan, onApply, onClose }) {
  const [stage, setStage] = useState('confirm');
  const [error, setError] = useState('');
  const appliedRef = useRef(false);

  const recipe = plan?.recipe;
  const fromGrade = GRADE[recipe?.fromGrade] || GRADE.common;
  const toGrade = GRADE[recipe?.toGrade] || GRADE.common;
  const success = !!plan?.success;
  const resultItem = plan?.resultItem;
  const materialCount = plan?.materials?.length || 0;

  useEffect(() => {
    if (stage !== 'processing') return undefined;
    const t = setTimeout(async () => {
      if (appliedRef.current) return;
      appliedRef.current = true;
      try {
        await onApply(plan);
        setStage('result');
      } catch (e) {
        console.error(e);
        setError('합성 처리 중 오류가 발생했습니다.');
        setStage('confirm');
        appliedRef.current = false;
      }
    }, SYNTHESIS_EFFECT_MS);
    return () => clearTimeout(t);
  }, [onApply, plan, stage]);

  if (!plan || !recipe) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4">
      <style>{`
        @keyframes synthPulse { 0%,100% { transform: scale(1); opacity:.7; } 50% { transform: scale(1.14); opacity:1; } }
        @keyframes synthSpin { to { transform: rotate(360deg); } }
        @keyframes synthFloat { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-10px) scale(1.05); } }
        @keyframes synthShard { 0% { transform: translate(0,0) scale(.4); opacity:0; } 25% { opacity:1; } 100% { transform: translate(var(--dx), var(--dy)) scale(1); opacity:0; } }
        @keyframes synthFlash { 0%,72% { opacity:0; } 86% { opacity:.95; } 100% { opacity:0; } }
        @keyframes synthBar { from { width: 0%; } to { width: 100%; } }
      `}</style>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-violet-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-white">장비 합성</h2>
            <p className="text-xs font-bold text-slate-500">{fromGrade.label} {materialCount}개 → {toGrade.label} 도전</p>
          </div>
          {stage !== 'processing' && (
            <button onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-800 hover:text-white">
              ×
            </button>
          )}
        </div>

        <div className="p-5">
          <div className={`relative mb-4 flex min-h-[270px] items-center justify-center overflow-hidden rounded-3xl border ${success && stage === 'result' ? toGrade.border : 'border-violet-700'} bg-slate-900`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.26),transparent_58%)]" />
            <div className="absolute h-48 w-48 rounded-full border border-violet-300/30"
              style={{ animation: stage === 'processing' ? 'synthSpin 2s linear infinite' : 'synthPulse 2.2s ease-in-out infinite' }} />
            <div className="absolute h-32 w-32 rounded-full border border-fuchsia-300/25"
              style={{ animation: stage === 'processing' ? 'synthSpin 1.25s linear infinite reverse' : 'synthPulse 2.6s ease-in-out infinite' }} />

            {stage === 'processing' && Array.from({ length: 26 }, (_, i) => {
              const angle = (i / 26) * Math.PI * 2;
              const distance = 75 + (i % 6) * 12;
              return (
                <span key={i}
                  className="absolute h-2 w-2 rounded-full bg-violet-300 shadow-lg shadow-violet-400/70"
                  style={{
                    '--dx': `${Math.cos(angle) * distance}px`,
                    '--dy': `${Math.sin(angle) * distance}px`,
                    left: '50%',
                    top: '50%',
                    animation: `synthShard 1.15s ease-out ${0.16 + (i % 9) * 0.08}s infinite`,
                  }} />
              );
            })}

            {stage === 'processing' && success && Array.from({ length: 10 }, (_, i) => (
              <span key={`gold-${i}`}
                className="absolute h-2.5 w-2.5 rounded-full bg-amber-300 shadow-lg shadow-amber-300/70"
                style={{
                  '--dx': `${(i % 2 ? 1 : -1) * (45 + i * 8)}px`,
                  '--dy': `${-90 + (i % 5) * 24}px`,
                  left: '50%',
                  top: '50%',
                  animation: `synthShard 1.25s ease-out ${1.45 + i * 0.05}s infinite`,
                }} />
            ))}

            <div className={`absolute inset-0 pointer-events-none ${success ? 'bg-white' : 'bg-rose-500'}`}
              style={{ animation: stage === 'processing' ? 'synthFlash 3s ease-out forwards' : 'none' }} />

            <div className="relative z-10 flex flex-col items-center">
              <div className="mb-4 rounded-full border border-violet-400/40 bg-slate-950 px-4 py-1.5 text-xs font-black tracking-wider text-violet-200 shadow-[0_0_24px_rgba(139,92,246,0.3)]">
                {stage === 'processing' ? 'SYNTHESIZING' : stage === 'result' ? (success ? 'SUCCESS' : 'FAILED') : 'READY'}
              </div>
              <div className="flex items-center gap-3">
                <div className={`flex h-20 w-20 flex-col items-center justify-center rounded-2xl border-2 bg-white/90 ${fromGrade.border}`}
                  style={{ animation: stage === 'processing' ? 'synthFloat 1.1s ease-in-out infinite' : 'none' }}>
                  <div className="text-2xl font-black text-slate-800">{materialCount}</div>
                  <div className="text-[10px] font-extrabold text-slate-500">재료</div>
                </div>
                <div className="text-3xl font-black text-violet-200">→</div>
                <div className={`flex h-24 w-24 items-center justify-center rounded-3xl border-2 bg-white/90 ${toGrade.border}`}
                  style={{ animation: stage === 'processing' ? 'synthFloat 1.1s ease-in-out .12s infinite' : 'none' }}>
                  {stage === 'result' && success && resultItem?.image ? (
                    <img src={resultItem.image} alt="" className="h-full w-full object-contain drop-shadow-md" />
                  ) : (
                    <div className="text-center">
                      <div className="text-3xl">{success || stage !== 'result' ? '✨' : '💥'}</div>
                      <div className="mt-1 text-[10px] font-black text-slate-700">{toGrade.label}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {stage === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-400">성공률</span>
                  <span className="font-extrabold text-amber-300">25%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-400">재료 소모</span>
                  <span className="font-extrabold text-rose-300">성공/실패 모두 {materialCount}개</span>
                </div>
              </div>
              {error && <div className="rounded-xl border border-rose-700 bg-rose-950/60 px-3 py-2 text-xs font-bold text-rose-300">{error}</div>}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={onClose}
                  className="rounded-2xl border border-slate-700 bg-slate-800 py-3.5 text-sm font-extrabold text-slate-300 transition-colors hover:bg-slate-700">
                  취소
                </button>
                <button onClick={() => setStage('processing')}
                  className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 transition-all active:scale-95">
                  합성 시작
                </button>
              </div>
            </div>
          )}

          {stage === 'processing' && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-xl font-extrabold text-white">장비를 합성하는 중...</div>
                <div className="mt-1 text-xs font-bold text-slate-500">마력 회로가 장비를 재구성하고 있습니다</div>
              </div>
              <div className="h-7 overflow-hidden rounded-full border border-slate-700 bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-400 to-amber-300"
                  style={{ animation: `synthBar ${SYNTHESIS_EFFECT_MS}ms linear forwards` }} />
              </div>
            </div>
          )}

          {stage === 'result' && (
            <div className="space-y-4">
              <div className={`rounded-2xl border p-5 text-center ${success ? 'border-amber-500/50 bg-amber-950/30' : 'border-rose-700/60 bg-rose-950/30'}`}>
                <div className="mb-2 text-4xl">{success ? '🏆' : '💥'}</div>
                <div className={`text-2xl font-extrabold ${success ? 'text-amber-300' : 'text-rose-300'}`}>
                  {success ? '합성 성공!' : '합성 실패'}
                </div>
                <p className="mt-2 text-sm font-bold text-slate-300">
                  {success ? `${resultItem?.name || '새 장비'}을(를) 획득했습니다.` : '재료 장비가 소모되었습니다.'}
                </p>
                {success && resultItem && (
                  <div className={`mt-4 rounded-xl border px-3 py-2 ${toGrade.border} ${toGrade.bg}`}>
                    <span className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full ${toGrade.badge}`}>{toGrade.label}</span>
                    <div className="mt-1 text-sm font-extrabold text-slate-800">{resultItem.name}</div>
                  </div>
                )}
              </div>
              <button onClick={onClose}
                className="w-full rounded-2xl bg-slate-700 py-3.5 text-sm font-extrabold text-white transition-colors hover:bg-slate-600">
                확인
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Equipment({ studentCode, themeMode = 'dark' }) {
  const isDark = themeMode === 'dark';
  const [tab, setTab]             = useState('equip');
  const [allItems, setAllItems]   = useState([]);
  const [inventory, setInventory] = useState([]);
  const [equipped, setEquipped]   = useState({});
  const [stones, setStones]       = useState(0);
  const [diamonds, setDiamonds]   = useState(0);
  const [studentDocId, setStudentDocId] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [enhanceTarget, setEnhanceTarget] = useState(null);
  const [selectedSlot, setSelectedSlot]   = useState(null);
  const [gradeFilter, setGradeFilter]     = useState('all');
  const [slotFilter, setSlotFilter]       = useState('all');
  const [buyQty, setBuyQty]               = useState(1);
  const [confirmBuy, setConfirmBuy]       = useState(false);
  const [selectedDismantleIds, setSelectedDismantleIds] = useState([]);
  const [dismantlePlan, setDismantlePlan] = useState(null);
  const [synthesisPlan, setSynthesisPlan] = useState(null);

  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      try {
        const [itemsSnap, sSnap] = await Promise.all([
          getDocs(query(collection(db, 'equipmentItems'), where('active', '==', true))),
          getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode))),
        ]);
        setAllItems(itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (!sSnap.empty) {
          const sd = sSnap.docs[0];
          setStudentDocId(sd.id);
          const data = sd.data();
          setInventory(data.equipInventory || []);
          setEquipped(data.equipped || {});
          setStones(data.enhancementStones || 0);
          setDiamonds(data.diamonds || 0);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [studentCode]);

  const getItem    = id => allItems.find(i => i.id === id);
  const getInvItem = id => inventory.find(i => i.id === id);
  const isEquippedInv = id => Object.values(equipped).includes(id);

  const toggleEquip = async (invItem) => {
    if (!studentDocId) return;
    const item = getItem(invItem.itemId);
    if (!item) return;
    const newEquipped = { ...equipped };
    const isEquipped  = Object.values(equipped).includes(invItem.id);
    if (isEquipped) {
      Object.keys(newEquipped).forEach(k => { if (newEquipped[k] === invItem.id) delete newEquipped[k]; });
    } else {
      newEquipped[item.type] = invItem.id;
    }
    setEquipped(newEquipped);
    setSelectedSlot(null);
    await updateDoc(doc(db, 'students', studentDocId), { equipped: newEquipped });
  };

  const onEnhanceDone = async (success) => {
    if (!success || !enhanceTarget || !studentDocId) return;
    const cfg     = ENHANCE[enhanceTarget.stars || 0];
    const newInv  = inventory.map(i => i.id === enhanceTarget.id ? { ...i, stars: (i.stars || 0) + 1 } : i);
    const newSt   = Math.max(0, stones - (cfg?.stones || 0));
    setInventory(newInv);
    setStones(newSt);
    setEnhanceTarget(prev => prev ? { ...prev, stars: (prev.stars || 0) + 1 } : null);
    await updateDoc(doc(db, 'students', studentDocId), { equipInventory: newInv, enhancementStones: newSt });
  };

  const buyStones = async (qty) => {
    if (!studentDocId || diamonds < qty * 100) return;
    const newDiamonds = diamonds - qty * 100;
    const newStones   = stones + qty;
    setDiamonds(newDiamonds);
    setStones(newStones);
    await updateDoc(doc(db, 'students', studentDocId), { diamonds: newDiamonds, enhancementStones: newStones });
  };

  const createDismantlePlan = useCallback((items) => {
    const equippedIds = new Set(Object.values(equipped));
    const entries = items
      .filter(inv => inv && !equippedIds.has(inv.id))
      .map(inv => {
        const item = allItems.find(i => i.id === inv.itemId);
        if (!item) return null;
        const reward = DISMANTLE_REWARDS[item.grade] || DISMANTLE_REWARDS.common;
        const stoneDropped = Math.random() < STONE_DROP_RATE;
        const gradeOrder = { legendary: 0, epic: 1, rare: 2, common: 3 }[item.grade] ?? 99;
        return {
          inv,
          item,
          reward,
          gradeOrder,
          earnedStones: stoneDropped ? reward.stones : 0,
          possibleStones: reward.stones || 0,
          stoneDropped,
        };
      })
      .filter(Boolean);

    if (entries.length === 0) return null;

    return {
      id: `dismantle_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      entries,
      totalStones: entries.reduce((sum, entry) => sum + entry.earnedStones, 0),
      possibleStones: entries.reduce((sum, entry) => sum + entry.possibleStones, 0),
    };
  }, [allItems, equipped]);

  const openDismantleModal = useCallback((items) => {
    const plan = createDismantlePlan(items);
    if (!plan) return;
    setDismantlePlan(plan);
  }, [createDismantlePlan]);

  const applyDismantlePlan = useCallback(async (plan) => {
    if (!studentDocId || !plan?.entries?.length) return;
    const consumedIds = new Set(plan.entries.map(entry => entry.inv.id));
    const newInventory = inventory.filter(inv => !consumedIds.has(inv.id));
    const newStones = stones + (plan.totalStones || 0);

    await updateDoc(doc(db, 'students', studentDocId), {
      equipInventory: newInventory,
      enhancementStones: newStones,
    });

    setInventory(newInventory);
    setStones(newStones);
    setSelectedDismantleIds(ids => ids.filter(id => !consumedIds.has(id)));
  }, [inventory, stones, studentDocId]);

  const toggleDismantleSelection = useCallback((id) => {
    setSelectedDismantleIds(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]);
  }, []);

  const synthesizeEquipment = useCallback(async (recipe) => {
    if (!studentDocId || !recipe) return;

    const candidates = inventory
      .filter(inv => !Object.values(equipped).includes(inv.id) && allItems.find(item => item.id === inv.itemId)?.grade === recipe.fromGrade)
      .sort((a, b) => (a.stars || 0) - (b.stars || 0));

    if (candidates.length < recipe.required) return;

    const resultPool = allItems.filter(item => item.grade === recipe.toGrade && item.active !== false);
    if (resultPool.length === 0) {
      alert('합성 결과로 받을 장비가 없습니다.');
      return;
    }

    const success = Math.random() < SYNTHESIS_SUCCESS_RATE;
    setSynthesisPlan({
      id: `synthesis_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      recipe,
      materials: candidates.slice(0, recipe.required),
      success,
      resultItem: success ? resultPool[Math.floor(Math.random() * resultPool.length)] : null,
    });
  }, [allItems, equipped, inventory, studentDocId]);

  const applySynthesisPlan = useCallback(async (plan) => {
    if (!studentDocId || !plan?.recipe || !plan?.materials?.length) return;
    const consumedIds = new Set(plan.materials.map(inv => inv.id));
    const baseInventory = inventory.filter(inv => !consumedIds.has(inv.id));
    const newInventory = plan.success && plan.resultItem
      ? [...baseInventory, {
        id: `inv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        itemId: plan.resultItem.id,
        stars: 0,
        obtainedAt: new Date().toISOString(),
        source: 'synthesis',
      }]
      : baseInventory;

    await updateDoc(doc(db, 'students', studentDocId), { equipInventory: newInventory });
    setInventory(newInventory);
    setSelectedDismantleIds(ids => ids.filter(id => !consumedIds.has(id)));
  }, [inventory, studentDocId]);

  const equipBonus = Object.keys(STAT_LABEL).reduce((acc, key) => {
    acc[key] = Object.values(equipped).reduce((sum, invId) => {
      const inv  = getInvItem(invId);
      const item = inv ? getItem(inv.itemId) : null;
      if (!item?.stats?.[key]) return sum;
      return sum + (item.stats[key] || 0) + (inv.stars || 0) * 5;
    }, 0);
    return acc;
  }, {});

  if (loading) return (
    <div className="flex items-center justify-center gap-2.5 h-64">
      <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
      <span className="text-slate-400 font-bold">불러오는 중...</span>
    </div>
  );

  const GRADE_ORDER = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const sortByGradeDesc = (a, b) => {
    const aOrder = GRADE_ORDER[getItem(a.itemId)?.grade] ?? 99;
    const bOrder = GRADE_ORDER[getItem(b.itemId)?.grade] ?? 99;
    return aOrder - bOrder;
  };

  const unequippedInventory = inventory.filter(inv => !isEquippedInv(inv.id));
  const sortedUnequippedInventory = [...unequippedInventory].sort(sortByGradeDesc);
  const selectedDismantleItems = sortedUnequippedInventory.filter(inv => selectedDismantleIds.includes(inv.id));
  const selectDismantleGrade = (grade) => {
    const ids = sortedUnequippedInventory
      .filter(inv => getItem(inv.itemId)?.grade === grade)
      .map(inv => inv.id);
    setSelectedDismantleIds(ids);
  };

  const slotItems   = selectedSlot
    ? inventory.filter(inv => getItem(inv.itemId)?.type === selectedSlot).sort(sortByGradeDesc)
    : [];
  const filteredInv = inventory
    .filter(inv => {
      const item = getItem(inv.itemId);
      return item &&
        (gradeFilter === 'all' || item.grade === gradeFilter) &&
        (slotFilter  === 'all' || item.type  === slotFilter);
    })
    .sort(sortByGradeDesc);

  return (
    <div className={`min-h-full ${isDark ? '' : 'bg-slate-100'}`}>

      {/* 헤더 */}
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 px-5 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-extrabold text-white tracking-wide">⚔️ 장비</h1>
          <div className="flex items-center gap-2 rounded-2xl border border-cyan-400/50 bg-gradient-to-r from-cyan-950/70 via-sky-900/60 to-blue-950/70 px-2.5 py-2 shadow-[0_0_24px_rgba(34,211,238,0.18)]">
            <span className="rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[10px] font-black tracking-wider text-cyan-200">
              STONE SHOP
            </span>
            {/* 보유 강화석 */}
            <div className="flex items-center gap-1.5 rounded-lg border border-sky-600/50 bg-sky-900/55 px-3 py-2 text-sm font-extrabold text-sky-200">
              🔮 {stones}
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-cyan-600/50 bg-cyan-900/55 px-3 py-2 text-sm font-extrabold text-cyan-200">
              💎 {diamonds.toLocaleString()}
            </div>
            {/* 인라인 수량 조절 */}
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-500 bg-slate-900/90">
              <button onClick={() => setBuyQty(q => Math.max(1, q - 1))}
                className="px-3 py-2 text-base font-black text-slate-300 transition-colors hover:bg-slate-800 hover:text-white active:scale-95">−</button>
              <span className="w-8 text-center text-base font-extrabold text-white">{buyQty}</span>
              <button onClick={() => setBuyQty(q => q + 1)}
                className="px-3 py-2 text-base font-black text-slate-300 transition-colors hover:bg-slate-800 hover:text-white active:scale-95">+</button>
            </div>
            {/* 즉시 구매 버튼 */}
            <button onClick={() => diamonds >= buyQty * 100 && setConfirmBuy(true)}
              disabled={diamonds < buyQty * 100}
              className={`rounded-lg px-4 py-2 text-sm font-extrabold whitespace-nowrap transition-all active:scale-95
                ${diamonds >= buyQty * 100
                  ? 'border border-cyan-200/70 bg-cyan-400 text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.35)] hover:bg-cyan-300'
                  : 'cursor-not-allowed border border-slate-600 bg-slate-700 text-slate-400'}`}>
              구매 · 💎 {(buyQty * 100).toLocaleString()}
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          {[['equip', '⚔️ 장착 관리'], ['inventory', '📦 인벤토리'], ['forge', '⚒️ 대장간']].map(([v, l]) => (
            <button key={v} onClick={() => { setTab(v); setSelectedSlot(null); }}
              className={`flex-1 py-2.5 rounded-xl font-extrabold text-sm transition-colors
                ${tab === v ? 'bg-white text-slate-800 shadow-sm' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">

        {/* ── 장착 관리 탭 ── */}
        {tab === 'equip' && (
          <div className="space-y-3">

            <div className={`rounded-3xl shadow-sm border p-4 ${isDark ? 'bg-slate-900/80 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-extrabold text-sm ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>장착 슬롯</h3>
                <span className="text-[10px] text-slate-400">탭 → 변경  ·  ⚒️ → 강화</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {SLOTS.map(slot => {
                  const invId   = equipped[slot.key];
                  const invItem = invId ? getInvItem(invId) : null;
                  const item    = invItem ? getItem(invItem.itemId) : null;
                  const g       = item ? (GRADE[item.grade] || GRADE.common) : null;
                  const isSel   = selectedSlot === slot.key;
                  return (
                    <div key={slot.key} className="flex flex-col gap-1.5">
                      <button
                        onClick={() => setSelectedSlot(prev => prev === slot.key ? null : slot.key)}
                        className={`rounded-2xl border-2 flex flex-col p-3 transition-all active:scale-95 min-h-[190px]
                          ${isSel
                            ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100'
                            : item
                              ? `${g.border} ${g.bg} hover:shadow-md`
                              : isDark
                                ? 'border-dashed border-slate-600 bg-slate-800/70 hover:border-indigo-400 hover:bg-slate-800'
                                : 'border-dashed border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                        {item ? (
                          <>
                            {/* 장비명 - 상단 */}
                            <div className="text-xs font-extrabold leading-tight text-center w-full line-clamp-2 mb-1 bg-white/75 text-slate-900 rounded-md py-0.5">
                              {item.name}
                            </div>
                            {/* 이미지(좌) + 등급 + 강화등급(우) */}
                            <div className="flex items-center gap-2 w-full">
                              <div className="w-16 h-16 shrink-0 flex items-center justify-center bg-white/50 rounded-xl">
                                {item.image
                                  ? <img src={item.image} alt="" className="w-full h-full object-contain drop-shadow-sm" />
                                  : <span className="text-4xl">{slot.icon}</span>}
                              </div>
                              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full w-fit ${g.badge}`}>{g.label}</span>
                                <div className="flex gap-px flex-wrap">
                                  {Array.from({ length: 5 }, (_, i) => (
                                    <img key={i} src={STAR_IMG} alt="★"
                                      className={`w-3.5 h-3.5 object-contain ${i < (invItem?.stars || 0) ? 'opacity-100' : 'opacity-10 grayscale'}`} />
                                  ))}
                                </div>
                              </div>
                            </div>
                            {/* 하단: 스탯 */}
                            {(() => {
                              const enh = (invItem?.stars || 0) * 5;
                              const sEntries = Object.entries(STAT_LABEL).filter(([k]) => (item.stats?.[k] || 0) > 0);
                              if (!sEntries.length) return null;
                              return (
                                <div className="w-full mt-1 space-y-1 border-t border-white/50 pt-2">
                                  {sEntries.map(([k, meta]) => {
                                    const base = item.stats[k];
                                    return (
                                      <div key={k} className="flex items-center justify-between">
                                        <div className="flex items-center gap-0.5">
                                          {meta.img
                                            ? <img src={meta.img} alt="" className="w-3 h-3 object-contain" />
                                            : <span className="text-[10px]">{meta.icon}</span>}
                                          <span className={`text-[10px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{meta.label}</span>
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <span className="text-xs font-extrabold text-indigo-700">+{base + enh}</span>
                                          {enh > 0 && <span className="text-[9px] text-amber-600 font-bold">(★+{enh})</span>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <>
                            <span className="text-5xl opacity-20">{slot.icon}</span>
                            <span className={`text-xs font-bold mt-1 ${isDark ? 'text-slate-300' : 'text-slate-400'}`}>{slot.label}</span>
                            <span className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-300'}`}>비어 있음</span>
                          </>
                        )}
                      </button>
                      {/* 강화 버튼 - 더 크게 */}
                      {item && invItem && (
                        <button onClick={() => setEnhanceTarget(invItem)}
                          className="w-full py-2.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 text-white shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1">
                          <img src={STAR_IMG} className="w-3.5 h-3.5" alt="" />
                          강화하기 ★{invItem.stars || 0}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedSlot && (
              <div className={`rounded-3xl shadow-sm border p-4 ${isDark ? 'bg-slate-900/80 border-indigo-600/40' : 'bg-white border-indigo-200'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-extrabold text-indigo-700 text-sm flex items-center gap-1.5">
                    {SLOTS.find(s => s.key === selectedSlot)?.icon}
                    {SLOTS.find(s => s.key === selectedSlot)?.label} 선택
                  </h3>
                  <button onClick={() => setSelectedSlot(null)}
                    className={`text-xs px-2 py-0.5 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
                    ✕ 닫기
                  </button>
                </div>
                {slotItems.length === 0 ? (
                  <p className={`text-sm text-center py-6 ${isDark ? 'text-slate-300' : 'text-slate-400'}`}>
                    보유한 {SLOTS.find(s => s.key === selectedSlot)?.label}가 없습니다
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5">
                    {slotItems.map(inv => {
                      const it = getItem(inv.itemId);
                      if (!it) return null;
                      return (
                        <EquipCard key={inv.id} item={it} stars={inv.stars}
                          isEquipped={Object.values(equipped).includes(inv.id)}
                          onClick={() => toggleEquip(inv)} compact />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className={`rounded-3xl shadow-sm border p-4 ${isDark ? 'bg-slate-900/80 border-slate-700' : 'bg-white border-slate-200'}`}>
              <h3 className={`font-extrabold text-sm mb-3 ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>⚡ 장비 보너스</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(STAT_LABEL).map(([key, meta]) => {
                  const val = equipBonus[key] || 0;
                  return (
                    <div key={key} className={`flex items-center justify-between rounded-xl px-3 py-2.5 border
                      ${val > 0
                        ? (isDark ? 'bg-indigo-900/30 border-indigo-700/50' : 'bg-indigo-50 border-indigo-100')
                        : (isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100')}`}>
                      <span className={`text-xs flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                        {meta.img
                          ? <img src={meta.img} alt="" className="w-4 h-4 object-contain" />
                          : <span>{meta.icon}</span>}
                        {meta.label}
                      </span>
                      <span className={`text-sm font-extrabold ${val > 0 ? 'text-indigo-500' : (isDark ? 'text-slate-500' : 'text-slate-300')}`}>
                        +{val}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── 인벤토리 탭 ── */}
        {tab === 'inventory' && (
          <div>
            {/* 등급 필터 */}
            <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
              {['all', 'legendary', 'epic', 'rare', 'common'].map(g => (
                <button key={g} onClick={() => setGradeFilter(g)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors border
                    ${gradeFilter === g
                      ? g === 'all'
                        ? 'bg-slate-700 text-white border-slate-700'
                        : `${(GRADE[g] || GRADE.common).badge} border-transparent`
                      : (isDark ? 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400')}`}>
                  {g === 'all' ? '전체' : (GRADE[g] || GRADE.common).label}
                </button>
              ))}
            </div>
            {/* 부위 필터 */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
              <button onClick={() => setSlotFilter('all')}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors border
                  ${slotFilter === 'all'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : (isDark ? 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400')}`}>
                전체
              </button>
              {SLOTS.map(slot => (
                <button key={slot.key} onClick={() => setSlotFilter(slot.key)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors border flex items-center gap-1
                    ${slotFilter === slot.key
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : (isDark ? 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400')}`}>
                  {slot.icon} {slot.label}
                </button>
              ))}
              <span className="text-[10px] text-slate-400 self-center ml-1 shrink-0">{filteredInv.length}개</span>
            </div>

            {filteredInv.length === 0 ? (
              <div className={`text-center py-20 ${isDark ? 'text-slate-300' : 'text-slate-400'}`}>
                <div className="text-5xl mb-3">📦</div>
                <p className="font-bold">보유한 장비가 없습니다</p>
                <p className="text-sm mt-1">보물상자를 뽑아 장비를 얻어보세요!</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {filteredInv.map(inv => {
                  const item = getItem(inv.itemId);
                  if (!item) return null;
                  const isEq = Object.values(equipped).includes(inv.id);
                  return (
                    <div key={inv.id} className="flex flex-col gap-1.5">
                      <EquipCard item={item} stars={inv.stars} isEquipped={isEq} onClick={() => toggleEquip(inv)} />
                      <button onClick={() => setEnhanceTarget(inv)}
                        className="w-full py-2.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 flex items-center justify-center gap-1
                          bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 text-white shadow-sm">
                        <img src={STAR_IMG} className="w-3.5 h-3.5" alt="" />
                        강화 ({inv.stars || 0}/5)
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'forge' && (
          <div className="flex flex-col gap-4">
            <div className={`order-2 rounded-2xl border p-4 sm:p-5 ${isDark ? 'bg-slate-950/95 border-cyan-900/60 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                <div>
                  <h3 className={`font-extrabold text-sm ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>⚒️ 장비 분해소</h3>
                  <p className="text-[11px] text-slate-400 mt-1">착용 중인 장비는 보호됩니다. 강화석은 20% 확률로 획득합니다.</p>
                </div>
                <div className="flex gap-2 text-xs font-extrabold">
                  <span className="rounded-xl border border-sky-300/50 bg-sky-100 px-3 py-2 text-sky-700 shadow-sm">🔮 {stones}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                {Object.entries(DISMANTLE_REWARDS).map(([grade, reward]) => {
                  const g = GRADE[grade] || GRADE.common;
                  return (
                    <div key={grade} className={`rounded-xl border px-3 py-2.5 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
                      <span className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full ${g.badge}`}>{g.label}</span>
                      <div className={`mt-1 text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        🔮 {reward.stones}개 20%
                      </div>
                    </div>
                  );
                })}
              </div>

              {unequippedInventory.length > 0 && (
                <div className={`mb-4 rounded-2xl border p-3.5 ${isDark ? 'border-cyan-800/70 bg-cyan-950/20' : 'border-cyan-200 bg-cyan-50'}`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <div className={`text-xs font-extrabold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>일괄분해 선택</div>
                      <div className="text-[11px] font-bold text-slate-400">등급이 섞여도 한 번에 분해할 수 있습니다.</div>
                    </div>
                    <div className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-xs font-extrabold text-cyan-300">{selectedDismantleItems.length}개 선택</div>
                  </div>
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    <button onClick={() => setSelectedDismantleIds(sortedUnequippedInventory.map(inv => inv.id))}
                      className="shrink-0 rounded-lg border border-cyan-600/60 bg-slate-950 px-3 py-2 text-[11px] font-extrabold text-white hover:bg-cyan-950">
                      전체
                    </button>
                    {['legendary', 'epic', 'rare', 'common'].map(grade => {
                      const g = GRADE[grade] || GRADE.common;
                      const count = sortedUnequippedInventory.filter(inv => getItem(inv.itemId)?.grade === grade).length;
                      return (
                        <button key={grade} onClick={() => selectDismantleGrade(grade)} disabled={count === 0}
                          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold disabled:cursor-not-allowed disabled:opacity-35 ${g.badge}`}>
                          {g.label} {count}
                        </button>
                      );
                    })}
                    <button onClick={() => setSelectedDismantleIds([])}
                      className="shrink-0 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-[11px] font-extrabold text-slate-300 hover:bg-slate-800">
                      해제
                    </button>
                  </div>
                  <button onClick={() => openDismantleModal(selectedDismantleItems)} disabled={selectedDismantleItems.length === 0}
                    className={`w-full rounded-xl py-3 text-sm font-extrabold transition-all active:scale-95
                      ${selectedDismantleItems.length > 0
                        ? 'bg-gradient-to-r from-rose-600 to-orange-600 text-white shadow-lg shadow-rose-950/30 hover:from-rose-500 hover:to-orange-500'
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
                    선택 장비 {selectedDismantleItems.length}개 일괄분해
                  </button>
                </div>
              )}

              {unequippedInventory.length === 0 ? (
                <div className={`text-center py-10 rounded-2xl border border-dashed ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-400'}`}>
                  분해할 수 있는 장비가 없습니다
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 items-stretch">
                  {sortedUnequippedInventory.map(inv => {
                    const item = getItem(inv.itemId);
                    if (!item) return null;
                    const selected = selectedDismantleIds.includes(inv.id);
                    return (
                      <div key={inv.id} className={`flex min-w-0 flex-col gap-2 rounded-2xl border p-2 transition-all ${selected ? 'border-cyan-400 bg-cyan-950/30 shadow-[0_0_18px_rgba(34,211,238,0.18)]' : isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white'}`}>
                        <div className={`rounded-2xl transition-all ${selected ? 'ring-2 ring-cyan-400' : ''}`}>
                          <EquipCard item={item} stars={inv.stars} compact onClick={() => toggleDismantleSelection(inv.id)} />
                        </div>
                        <button onClick={() => toggleDismantleSelection(inv.id)}
                          className={`w-full py-2.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 border
                            ${selected
                              ? 'bg-cyan-600 text-white border-cyan-500'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'}`}>
                          {selected ? '선택됨' : '선택'}
                        </button>
                        <button onClick={() => openDismantleModal([inv])}
                          className="w-full py-2.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 bg-rose-950/70 hover:bg-rose-700 text-white border border-rose-800/70">
                          분해 🔮 20%
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={`order-1 rounded-2xl border p-4 sm:p-5 ${isDark ? 'bg-slate-950/95 border-violet-900/60 shadow-[0_0_0_1px_rgba(139,92,246,0.08)]' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4">
                <div>
                  <h3 className={`font-extrabold text-sm ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>✨ 장비 합성</h3>
                  <p className="text-[11px] text-slate-400 mt-1">착용하지 않은 낮은 강화 장비부터 재료로 사용합니다. 실패해도 재료는 소모됩니다.</p>
                </div>
                <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-extrabold text-violet-200">
                  성공률 25%
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {SYNTHESIS_RECIPES.map(recipe => {
                  const fromGrade = GRADE[recipe.fromGrade] || GRADE.common;
                  const toGrade = GRADE[recipe.toGrade] || GRADE.common;
                  const count = unequippedInventory.filter(inv => getItem(inv.itemId)?.grade === recipe.fromGrade).length;
                  const canSynthesize = count >= recipe.required;
                  const missing = Math.max(0, recipe.required - count);
                  const progressPct = Math.min(100, Math.round((count / recipe.required) * 100));
                  return (
                    <div key={recipe.fromGrade} className={`rounded-2xl border p-3.5 flex flex-col gap-3 ${canSynthesize
                      ? (isDark ? 'border-violet-600/60 bg-violet-950/20 shadow-[0_0_18px_rgba(139,92,246,0.12)]' : 'border-violet-200 bg-violet-50')
                      : (isDark ? 'border-slate-700 bg-slate-900/80' : 'border-slate-200 bg-slate-50')}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-extrabold px-2 py-1 rounded-full ${fromGrade.badge}`}>{fromGrade.label} 재료</span>
                        <span className={`text-[10px] font-extrabold px-2 py-1 rounded-full ${toGrade.badge}`}>{toGrade.label} 도전</span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="text-center">
                          <div className={`text-2xl font-black ${canSynthesize ? 'text-violet-300' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {count}
                          </div>
                          <div className="text-[10px] font-bold text-slate-500">보유</div>
                        </div>
                        <div className="flex-1">
                          <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-slate-400">
                            <span>{recipe.required}개 필요</span>
                            <span>{progressPct}%</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                            <div className={`h-full rounded-full ${canSynthesize ? 'bg-gradient-to-r from-violet-500 to-fuchsia-400' : 'bg-slate-600'}`}
                              style={{ width: `${progressPct}%` }} />
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-black text-amber-300">25%</div>
                          <div className="text-[10px] font-bold text-slate-500">성공</div>
                        </div>
                      </div>

                      <div className={`rounded-xl px-3 py-2 text-[11px] font-bold ${canSynthesize
                        ? 'bg-rose-950/40 text-rose-200 border border-rose-800/50'
                        : 'bg-slate-950/50 text-slate-400 border border-slate-800'}`}>
                        {canSynthesize ? '실패 시 재료가 모두 소모됩니다.' : `재료 ${missing}개 부족`}
                      </div>

                      <button onClick={() => synthesizeEquipment(recipe)} disabled={!canSynthesize}
                        className={`w-full px-4 py-3 rounded-xl text-xs font-extrabold transition-all active:scale-95
                          ${canSynthesize
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-950/30'
                            : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
                        {canSynthesize ? '합성 도전 25%' : '재료 부족'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {dismantlePlan && (
        <DismantleModal
          plan={dismantlePlan}
          onApply={applyDismantlePlan}
          onClose={() => setDismantlePlan(null)}
        />
      )}

      {synthesisPlan && (
        <SynthesisModal
          plan={synthesisPlan}
          onApply={applySynthesisPlan}
          onClose={() => setSynthesisPlan(null)}
        />
      )}

      {enhanceTarget && (
        <EnhanceModal
          invItem={enhanceTarget}
          item={getItem(enhanceTarget.itemId)}
          stones={stones}
          onEnhance={onEnhanceDone}
          onClose={() => setEnhanceTarget(null)}
        />
      )}

      {confirmBuy && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-600 rounded-3xl p-7 w-80 shadow-2xl flex flex-col items-center gap-5">
            <div className="text-4xl">🔮</div>
            <div className="text-center">
              <div className="text-white font-extrabold text-lg mb-1">강화석 구매</div>
              <div className="text-slate-300 text-sm">
                강화석 <span className="text-sky-400 font-extrabold">{buyQty}개</span>를<br />
                💎 <span className="text-cyan-400 font-extrabold">{(buyQty * 100).toLocaleString()} 다이아</span>로 구매하시겠습니까?
              </div>
              <div className="text-cyan-300 text-xs font-bold mt-2">
                보유 다이아: 💎 {diamonds.toLocaleString()}
              </div>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setConfirmBuy(false)}
                className="flex-1 py-3 rounded-2xl font-extrabold text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 transition-colors active:scale-95">
                취소
              </button>
              <button onClick={() => { setConfirmBuy(false); buyStones(buyQty); }}
                className="flex-1 py-3 rounded-2xl font-extrabold text-sm bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-500/50 transition-colors active:scale-95">
                구매
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
