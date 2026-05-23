import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, getDocs, doc, updateDoc, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { GRADE, SLOTS, ENHANCE, PITY_LIMIT, STAT_LABEL } from '../../constants/equipment';

const STAR_IMG = '/images/Icon_Resources_Star01_Gold.png';

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
  return (
    <button onClick={onClick}
      className={`relative flex flex-col items-center rounded-2xl border-2 transition-all active:scale-95
        ${g.border} ${g.bg}
        ${compact ? 'p-2 gap-1' : 'p-3 gap-2'}
        ${isEquipped ? 'ring-2 ring-indigo-500 ring-offset-2 shadow-lg' : 'hover:shadow-md hover:-translate-y-0.5'}
        ${item.grade === 'legendary' ? 'shadow-amber-100 shadow-md' : ''}
        ${item.grade === 'epic'      ? 'shadow-violet-100 shadow-md' : ''}`}>
      <span className={`absolute top-1 right-1 text-xs font-extrabold px-2 py-0.5 rounded-full ${g.badge}`}>
        {g.label}
      </span>
      {isEquipped && (
        <span className="absolute top-1 left-1 text-[8px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-bold">착용</span>
      )}
      <div className={`${compact ? 'w-20 h-20' : 'w-28 h-28'} flex items-center justify-center`}>
        {item.image
          ? <img src={item.image} alt={item.name} className="w-full h-full object-contain drop-shadow-sm" />
          : <span className={compact ? 'text-4xl' : 'text-5xl'}>{SLOTS.find(s => s.key === item.type)?.icon || '🗡️'}</span>}
      </div>
      <div className={`font-extrabold text-slate-800 truncate w-full text-center leading-tight
        ${compact ? 'text-[11px]' : 'text-sm'}`}>
        {item.name}
      </div>
      <Stars count={stars} size="sm" />
      {statEntries.length > 0 && (
        <div className="w-full space-y-0.5 border-t border-slate-200/70 pt-1 mt-0.5">
          {statEntries.map(([key, meta]) => {
            const base = item.stats[key];
            const total = base + enhBonus;
            return (
              <div key={key} className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-0.5">
                  {meta.img
                    ? <img src={meta.img} alt="" className="w-3 h-3 object-contain" />
                    : <span className="text-[9px]">{meta.icon}</span>}
                  <span className={`text-slate-500 ${compact ? 'text-[7px]' : 'text-[9px]'}`}>{meta.label}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <span className={`font-extrabold text-indigo-600 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>+{total}</span>
                  {enhBonus > 0 && (
                    <span className={`text-amber-500 font-bold ${compact ? 'text-[7px]' : 'text-[8px]'}`}>(★+{enhBonus})</span>
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

// ── 강화석 구매 모달 ──────────────────────────────────────────
function BuyStoneModal({ diamonds, onBuy, onClose }) {
  const [qty, setQty] = useState(1);
  const total  = qty * 100;
  const canBuy = qty > 0 && diamonds >= total;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-3xl w-full max-w-xs border border-slate-700 shadow-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-slate-800">
          <h2 className="font-extrabold text-white text-base">🔮 강화석 구매</h2>
          <button onClick={onClose}
            className="text-slate-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-800 transition-colors">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-800 rounded-2xl p-3 text-center border border-slate-700">
            <div className="text-xs text-slate-400">강화석 1개 = 💎 100 다이아</div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-2">구매 수량</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-xl bg-slate-800 text-white font-bold text-lg border border-slate-700 hover:border-slate-500 active:scale-95">−</button>
              <input type="number" min="1" value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 bg-slate-800 border border-slate-700 text-white text-center text-xl font-extrabold rounded-xl py-2 focus:outline-none focus:border-sky-500" />
              <button onClick={() => setQty(q => q + 1)}
                className="w-10 h-10 rounded-xl bg-slate-800 text-white font-bold text-lg border border-slate-700 hover:border-slate-500 active:scale-95">+</button>
            </div>
            <div className="flex gap-2 mt-2">
              {[5, 10, 30].map(n => (
                <button key={n} onClick={() => setQty(n)}
                  className="flex-1 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700 hover:border-sky-600 hover:text-sky-400 transition-colors active:scale-95">
                  {n}개
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 flex justify-between items-center">
            <span className="text-slate-400 text-sm">합계</span>
            <span className={`font-extrabold text-lg ${canBuy ? 'text-cyan-400' : 'text-rose-400'}`}>
              💎 {total.toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-slate-500 text-right -mt-2">보유: 💎 {diamonds.toLocaleString()}</div>

          <button onClick={() => canBuy && onBuy(qty)} disabled={!canBuy}
            className={`w-full py-3.5 rounded-2xl font-extrabold text-sm transition-all active:scale-95
              ${canBuy
                ? 'bg-gradient-to-r from-cyan-500 to-sky-600 text-white shadow-lg hover:from-cyan-400'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
            {canBuy ? `🔮 강화석 ${qty}개 구매` : '다이아 부족'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function Equipment({ studentCode }) {
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
  const [showBuyStone, setShowBuyStone]   = useState(false);

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
    if (!studentDocId) return;
    const newDiamonds = diamonds - qty * 100;
    const newStones   = stones + qty;
    setDiamonds(newDiamonds);
    setStones(newStones);
    setShowBuyStone(false);
    await updateDoc(doc(db, 'students', studentDocId), { diamonds: newDiamonds, enhancementStones: newStones });
  };

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
    <div className="flex items-center justify-center h-64 text-slate-400 font-bold animate-pulse">불러오는 중...</div>
  );

  const slotItems   = selectedSlot ? inventory.filter(inv => getItem(inv.itemId)?.type === selectedSlot) : [];
  const filteredInv = inventory.filter(inv => {
    const item = getItem(inv.itemId);
    return item && (gradeFilter === 'all' || item.grade === gradeFilter);
  });

  return (
    <div className="min-h-full bg-slate-100">

      {/* 헤더 */}
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 px-5 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-extrabold text-white tracking-wide">⚔️ 장비</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-sky-900/50 border border-sky-700/50 text-sky-300 px-3 py-1.5 rounded-xl text-sm font-extrabold">
              🔮 {stones}
            </div>
            <button onClick={() => setShowBuyStone(true)}
              className="bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors border border-cyan-500/50">
              + 구매
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          {[['equip', '⚔️ 장착 관리'], ['inventory', '📦 인벤토리']].map(([v, l]) => (
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

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-extrabold text-slate-700 text-sm">장착 슬롯</h3>
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
                        className={`rounded-2xl border-2 flex flex-col items-center justify-center p-3 transition-all active:scale-95 min-h-[190px]
                          ${isSel
                            ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100'
                            : item
                              ? `${g.border} ${g.bg} hover:shadow-md`
                              : 'border-dashed border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                        {item ? (
                          <>
                            <div className="w-24 h-24 flex items-center justify-center">
                              {item.image
                                ? <img src={item.image} alt="" className="w-full h-full object-contain drop-shadow-sm" />
                                : <span className="text-5xl">{slot.icon}</span>}
                            </div>
                            <div className="text-[9px] font-extrabold text-slate-700 truncate w-full text-center mt-1 leading-tight">{item.name}</div>
                            <div className="flex gap-px mt-1">
                              {Array.from({ length: 5 }, (_, i) => (
                                <img key={i} src={STAR_IMG} alt="★"
                                  className={`w-9 h-9 object-contain ${i < (invItem?.stars || 0) ? 'opacity-100' : 'opacity-10 grayscale'}`} />
                              ))}
                            </div>
                            <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full mt-1 ${g.badge}`}>{g.label}</span>
                            {(() => {
                              const enh = (invItem?.stars || 0) * 5;
                              const sEntries = Object.entries(STAT_LABEL).filter(([k]) => (item.stats?.[k] || 0) > 0);
                              if (!sEntries.length) return null;
                              return (
                                <div className="w-full mt-1.5 space-y-0.5 border-t border-white/40 pt-1.5">
                                  {sEntries.map(([k, meta]) => {
                                    const base = item.stats[k];
                                    return (
                                      <div key={k} className="flex items-center justify-between px-1">
                                        <div className="flex items-center gap-0.5">
                                          {meta.img
                                            ? <img src={meta.img} alt="" className="w-3 h-3 object-contain" />
                                            : <span className="text-[8px]">{meta.icon}</span>}
                                          <span className="text-[8px] text-slate-600">{meta.label}</span>
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-[9px] font-extrabold text-indigo-700">+{base + enh}</span>
                                          {enh > 0 && <span className="text-[7px] text-amber-600 font-bold">(★+{enh})</span>}
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
                            <span className="text-xs text-slate-400 font-bold mt-1">{slot.label}</span>
                            <span className="text-[10px] text-slate-300 mt-0.5">비어 있음</span>
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
              <div className="bg-white rounded-3xl shadow-sm border border-indigo-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-extrabold text-indigo-700 text-sm flex items-center gap-1.5">
                    {SLOTS.find(s => s.key === selectedSlot)?.icon}
                    {SLOTS.find(s => s.key === selectedSlot)?.label} 선택
                  </h3>
                  <button onClick={() => setSelectedSlot(null)}
                    className="text-slate-400 hover:text-slate-600 text-xs px-2 py-0.5 rounded-lg hover:bg-slate-100 transition-colors">
                    ✕ 닫기
                  </button>
                </div>
                {slotItems.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-6">
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

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-4">
              <h3 className="font-extrabold text-slate-700 text-sm mb-3">⚡ 장비 보너스</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(STAT_LABEL).map(([key, meta]) => {
                  const val = equipBonus[key] || 0;
                  return (
                    <div key={key} className={`flex items-center justify-between rounded-xl px-3 py-2.5 border
                      ${val > 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
                      <span className="text-xs text-slate-500 flex items-center gap-1.5">
                        {meta.img
                          ? <img src={meta.img} alt="" className="w-4 h-4 object-contain" />
                          : <span>{meta.icon}</span>}
                        {meta.label}
                      </span>
                      <span className={`text-sm font-extrabold ${val > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
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
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
              {['all', 'legendary', 'epic', 'rare', 'common'].map(g => (
                <button key={g} onClick={() => setGradeFilter(g)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors border
                    ${gradeFilter === g
                      ? g === 'all'
                        ? 'bg-slate-700 text-white border-slate-700'
                        : `${(GRADE[g] || GRADE.common).badge} border-transparent`
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                  {g === 'all' ? '전체' : (GRADE[g] || GRADE.common).label}
                </button>
              ))}
              <span className="text-[10px] text-slate-400 self-center ml-1 shrink-0">{filteredInv.length}개</span>
            </div>

            {filteredInv.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
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
      </div>

      {enhanceTarget && (
        <EnhanceModal
          invItem={enhanceTarget}
          item={getItem(enhanceTarget.itemId)}
          stones={stones}
          onEnhance={onEnhanceDone}
          onClose={() => setEnhanceTarget(null)}
        />
      )}

      {showBuyStone && (
        <BuyStoneModal
          diamonds={diamonds}
          onBuy={buyStones}
          onClose={() => setShowBuyStone(false)}
        />
      )}
    </div>
  );
}
