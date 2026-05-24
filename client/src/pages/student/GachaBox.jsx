import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, doc, updateDoc, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { GRADE, CHESTS } from '../../constants/equipment';

// ── 가중치 뽑기 ───────────────────────────────────────────────
const weightedRandom = (rates) => {
  const r = Math.random() * 100;
  let acc = 0;
  for (const [grade, weight] of Object.entries(rates)) {
    acc += weight;
    if (r < acc) return grade;
  }
  return 'common';
};

// ── 파티클 이펙트 ────────────────────────────────────────────
const PARTICLE_COLORS = {
  legendary: ['#fbbf24','#f59e0b','#fde68a','#fcd34d','#fff','#fb923c'],
  epic:      ['#a78bfa','#8b5cf6','#c4b5fd','#ddd6fe','#fff','#e879f9'],
  rare:      ['#34d399','#10b981','#6ee7b7','#a7f3d0','#fff','#38bdf8'],
  common:    ['#94a3b8','#cbd5e1','#e2e8f0','#fff','#f1f5f9','#64748b'],
};

function GachaParticles({ grade }) {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors  = PARTICLE_COLORS[grade] || PARTICLE_COLORS.common;
    const count   = grade === 'legendary' ? 120 : grade === 'epic' ? 90 : 60;
    const cx      = canvas.width / 2;
    const cy      = canvas.height / 2;

    const particles = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = (grade === 'legendary' ? 8 : 5) + Math.random() * 6;
      return {
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 4,
        size: 4 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: 0.012 + Math.random() * 0.015,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      };
    });

    let raf;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach(p => {
        if (p.life <= 0) return;
        alive = true;
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += 0.25; // gravity
        p.life -= p.decay;
        p.rotation += p.rotSpeed;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle   = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      if (alive) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(raf); };
  }, [grade]);

  return (
    <canvas ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[60]"
      style={{ width: '100vw', height: '100vh' }} />
  );
}

// ── 결과 아이템 카드 ──────────────────────────────────────────
function ResultCard({ item, isNew, delay = 0 }) {
  const [show, setShow] = useState(false);
  const g = GRADE[item.grade] || GRADE.common;

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div className={`relative flex flex-col items-center rounded-2xl border-2 p-2.5 transition-all duration-300
      ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
      ${g.border} ${g.bg}
      ${item.grade === 'legendary' ? 'shadow-lg shadow-amber-300/40 ring-1 ring-amber-400/50' : ''}
      ${item.grade === 'epic'      ? 'shadow-md shadow-violet-300/40 ring-1 ring-violet-400/50' : ''}`}>
      {isNew && (
        <span className="absolute -top-2 -right-2 text-[8px] bg-rose-500 text-white font-extrabold px-1.5 py-0.5 rounded-full shadow-sm z-10">NEW</span>
      )}
      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-full mb-1.5 ${g.badge}`}>{g.label}</span>
      <div className="w-12 h-12 flex items-center justify-center relative">
        {item.image ? (
          <img src={item.image} alt={item.name} className="w-full h-full object-contain drop-shadow-sm"
            onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
        ) : null}
        <span className="text-2xl absolute inset-0 flex items-center justify-center" style={{ display: item.image ? 'none' : 'flex' }}>
          ⛑️
        </span>
      </div>
      {item.grade === 'legendary' && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-amber-400/10 to-transparent pointer-events-none" />
      )}
      <div className="text-[9px] font-extrabold text-slate-800 truncate w-full text-center mt-1.5 leading-tight">
        {item.name}
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function GachaBox({ studentCode }) {
  const [allItems, setAllItems]     = useState([]);
  const [diamonds, setDiamonds]     = useState(0);
  const [inventory, setInventory]   = useState([]);
  const [studentDocId, setStudentDocId] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [pulling, setPulling]       = useState(false);
  const [results, setResults]       = useState(null);
  const [lastChest, setLastChest]   = useState(null);
  const [pityMap, setPityMap]       = useState({});
  const [openRates, setOpenRates]   = useState(null); // 확률 보기 펼친 상자 id

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
          setDiamonds(data.diamonds || 0);
          setInventory(data.equipInventory || []);
          setPityMap(data.gachaPity || {});
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [studentCode]);

  const pull = async (chest, count = 1) => {
    if (!studentDocId || pulling) return;
    const totalCost = chest.cost * count;
    if (diamonds < totalCost) { alert('💎 다이아몬드가 부족합니다!'); return; }

    setPulling(true);
    setResults(null);
    await new Promise(r => setTimeout(r, 800));

    const curPity = pityMap[chest.id] || 0;
    const drawn = [];
    let newPity = curPity;

    for (let i = 0; i < count; i++) {
      let grade;
      if (newPity >= 9) {
        const r2 = { legendary: chest.rates.legendary, epic: chest.rates.epic, rare: 100 - chest.rates.legendary - chest.rates.epic };
        grade = weightedRandom(r2);
        newPity = 0;
      } else {
        grade = weightedRandom(chest.rates);
        newPity++;
        if (grade !== 'common') newPity = 0;
      }
      const pool = allItems.filter(it => it.grade === grade && it.active !== false);
      drawn.push(pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : allItems[Math.floor(Math.random() * allItems.length)]);
    }

    const newInv = [...inventory];
    const isNew  = drawn.map(item => {
      const already = newInv.some(inv => inv.itemId === item.id);
      newInv.push({ id: `inv_${Date.now()}_${Math.random().toString(36).slice(2)}`, itemId: item.id, stars: 0, obtainedAt: new Date().toISOString() });
      return !already;
    });

    const newDiamonds = diamonds - totalCost;
    const newPityMap  = { ...pityMap, [chest.id]: newPity };
    setDiamonds(newDiamonds);
    setInventory(newInv);
    setPityMap(newPityMap);
    setLastChest(chest);
    setResults(drawn.map((item, i) => ({ item, isNew: isNew[i] })));

    await updateDoc(doc(db, 'students', studentDocId), {
      diamonds: newDiamonds,
      equipInventory: newInv,
      gachaPity: newPityMap,
    });
    setPulling(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400 font-bold animate-pulse">불러오는 중...</div>
  );

  // 하이라이트 등급 (가장 높은 등급 아이템)
  const topGrade = results
    ? (['legendary','epic','rare','common'].find(g => results.some(r => r.item.grade === g)) || 'common')
    : null;

  const CHEST_BG = {
    wood:    'from-amber-900/80 to-amber-950',
    luck:    'from-emerald-900/80 to-emerald-950',
    silver:  'from-slate-700/80 to-slate-900',
    gold:    'from-yellow-800/80 to-amber-950',
    premium: 'from-indigo-900/80 to-slate-900',
    special: 'from-purple-900/80 to-indigo-950',
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-900 to-slate-950">

      {/* 헤더 */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-extrabold text-white">📦 보물상자</h1>
          <div className="flex items-center gap-1.5 bg-cyan-900/60 border border-cyan-700 text-cyan-300 px-3 py-1.5 rounded-xl text-sm font-extrabold">
            💎 {(diamonds||0).toLocaleString()}
          </div>
        </div>
        <p className="text-slate-500 text-xs">상자를 열어 장비를 획득하세요</p>
      </div>

      {/* 상자 카드 그리드 */}
      <div className="px-4 pb-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CHESTS.map(chest => {
          const pity      = pityMap[chest.id] || 0;
          const canPull1  = diamonds >= chest.cost;
          const canPull10 = diamonds >= chest.cost * 10;
          const isOpen    = openRates === chest.id;

          return (
            <div key={chest.id}
              className={`rounded-3xl overflow-hidden border border-white/10 shadow-xl flex flex-col
                bg-gradient-to-b ${CHEST_BG[chest.id] || 'from-slate-800 to-slate-900'}`}>

              {/* 상자 이미지 영역 */}
              <div className="flex flex-col items-center pt-5 pb-3 px-3">
                <div className="relative">
                  {chest.image
                    ? <img src={chest.image} alt={chest.name}
                        className="w-20 h-20 object-contain drop-shadow-[0_4px_12px_rgba(255,255,255,0.2)]" />
                    : <span className="text-5xl">📦</span>}
                  {/* 빛 효과 */}
                  <div className="absolute inset-0 bg-white/5 rounded-full blur-xl" />
                </div>
                <div className="font-extrabold text-white text-sm mt-2">{chest.name}</div>
                <div className="text-cyan-300 font-extrabold text-base mt-0.5">💎 {chest.cost}</div>
              </div>

              {/* 천장 게이지 */}
              <div className="px-3 pb-2">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>천장</span>
                  <span className={pity >= 8 ? 'text-amber-400 font-bold' : ''}>{pity}/10</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pity >= 8 ? 'bg-amber-400' : 'bg-indigo-400'}`}
                    style={{ width: `${(pity/10)*100}%` }} />
                </div>
              </div>

              {/* 확률 보기 토글 */}
              <button onClick={() => setOpenRates(isOpen ? null : chest.id)}
                className="mx-3 mb-2 py-1.5 px-3 rounded-lg text-xs font-bold text-slate-400 hover:text-white hover:bg-white/10 transition-colors text-center">
                {isOpen ? '▲ 접기' : '▼ 확률 보기'}
              </button>

              {isOpen && (
                <div className="mx-3 mb-3 bg-black/30 rounded-xl p-3.5 space-y-2.5">
                  {[
                    { g:'legendary', label:'전설', cls:'text-amber-400' },
                    { g:'epic',      label:'영웅', cls:'text-violet-400' },
                    { g:'rare',      label:'희귀', cls:'text-emerald-400' },
                    { g:'common',    label:'일반', cls:'text-slate-400' },
                  ].map(({ g, label, cls }) => (
                    <div key={g} className="flex justify-between items-center gap-2">
                      <span className={`text-sm font-extrabold w-10 shrink-0 ${cls}`}>{label}</span>
                      <div className="flex-1 h-2.5 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${cls.replace('text','bg')}`}
                          style={{ width: `${chest.rates[g]}%` }} />
                      </div>
                      <span className={`text-sm font-extrabold w-10 text-right shrink-0 ${cls}`}>{chest.rates[g]}%</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 뽑기 버튼 */}
              <div className="px-3 pb-3 mt-auto flex flex-col gap-1.5">
                <button onClick={() => pull(chest, 1)} disabled={!canPull1 || pulling}
                  className={`w-full py-2.5 rounded-2xl font-extrabold text-xs transition-all active:scale-95
                    ${canPull1 && !pulling
                      ? 'bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-sm'
                      : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/10'}`}>
                  1회 · 💎{chest.cost}
                </button>
                <button onClick={() => pull(chest, 10)} disabled={!canPull10 || pulling}
                  className={`w-full py-2.5 rounded-2xl font-extrabold text-xs transition-all active:scale-95
                    ${canPull10 && !pulling
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 text-white shadow-lg shadow-indigo-900/50'
                      : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/10'}`}>
                  10회 · 💎{chest.cost*10}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 뽑기 로딩 */}
      {pulling && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center gap-4">
          <div className="text-7xl animate-bounce">📦</div>
          <p className="text-white font-extrabold text-xl animate-pulse">상자 열리는 중...</p>
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i*0.15}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* 결과 팝업 */}
      {results && lastChest && <GachaParticles grade={topGrade} />}

      {results && lastChest && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          {/* 배경 빛 효과 */}
          <div className={`absolute inset-0 pointer-events-none
            ${topGrade==='legendary' ? 'bg-amber-500/5' : topGrade==='epic' ? 'bg-violet-500/5' : ''}`} />

          <div className={`relative bg-slate-900 rounded-3xl w-full max-w-lg border shadow-2xl overflow-hidden
            ${topGrade==='legendary' ? 'border-amber-500/50 shadow-amber-900/50'
            : topGrade==='epic'      ? 'border-violet-500/50 shadow-violet-900/50'
            : 'border-slate-700'}`}>

            {/* 결과 헤더 */}
            <div className={`flex flex-col items-center pt-6 pb-3 px-5
              ${topGrade==='legendary' ? 'bg-gradient-to-b from-amber-900/40 to-transparent'
              : topGrade==='epic'      ? 'bg-gradient-to-b from-violet-900/40 to-transparent'
              : ''}`}>
              {/* 열린 상자 이미지 */}
              {lastChest.openImage && (
                <img src={lastChest.openImage} alt=""
                  className="w-24 h-24 object-contain drop-shadow-2xl mb-2" />
              )}
              <h2 className="font-extrabold text-white text-lg">{lastChest.name} 오픈!</h2>
              <p className="text-slate-400 text-xs mt-0.5">{results.length}개 획득</p>
              {topGrade === 'legendary' && (
                <div className="mt-2 text-amber-400 font-extrabold text-sm animate-pulse">✨ 전설 등급 획득!</div>
              )}
              {topGrade === 'epic' && (
                <div className="mt-2 text-violet-400 font-extrabold text-sm animate-pulse">💜 영웅 등급 획득!</div>
              )}
            </div>

            {/* 아이템 그리드 */}
            <div className="px-4 pb-2 grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-52 overflow-y-auto">
              {results.map(({ item, isNew }, i) => (
                <ResultCard key={i} item={item} isNew={isNew} delay={i * 60} />
              ))}
            </div>

            <div className="p-4 border-t border-slate-800">
              <button onClick={() => { setResults(null); setLastChest(null); }}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-extrabold text-base transition-all active:scale-95">
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
