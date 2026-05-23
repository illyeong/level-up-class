import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, updateDoc, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { GRADE, CHESTS } from '../../constants/equipment';

// 가중치 뽑기
const weightedRandom = (rates) => {
  const r = Math.random() * 100;
  let acc = 0;
  for (const [grade, weight] of Object.entries(rates)) {
    acc += weight;
    if (r < acc) return grade;
  }
  return 'common';
};

// ── 결과 카드 ─────────────────────────────────────────────────
function ResultCard({ item, isNew }) {
  const g = GRADE[item.grade] || GRADE.common;
  return (
    <div className={`relative rounded-2xl border-2 ${g.border} ${g.bg} p-3 text-center
      ${item.grade === 'legendary' ? 'shadow-lg shadow-amber-200' : ''}
      ${item.grade === 'epic' ? 'shadow-md shadow-violet-200' : ''}`}>
      {isNew && (
        <span className="absolute -top-2 -right-2 text-[9px] bg-rose-500 text-white font-bold px-1.5 py-0.5 rounded-full">NEW</span>
      )}
      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${g.badge}`}>{g.label}</span>
      <div className="mt-2 mb-1 flex items-center justify-center h-14">
        {item.image
          ? <img src={item.image} alt={item.name} className="h-full object-contain" />
          : <span className="text-3xl">🗡️</span>}
      </div>
      <div className="text-[10px] font-extrabold text-slate-800 truncate">{item.name}</div>
    </div>
  );
}

export default function GachaBox({ studentCode }) {
  const [allItems, setAllItems]     = useState([]);
  const [diamonds, setDiamonds]     = useState(0);
  const [inventory, setInventory]   = useState([]);
  const [studentDocId, setStudentDocId] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [pulling, setPulling]       = useState(false);
  const [results, setResults]       = useState(null);  // 뽑기 결과 아이템 배열
  const [pityMap, setPityMap]       = useState({});    // { chestId: count }

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
    await new Promise(r => setTimeout(r, 600));

    const curPity = pityMap[chest.id] || 0;
    const drawn = [];
    let newPity = curPity;

    for (let i = 0; i < count; i++) {
      // 천장: 10번에 희귀 이상 1개 보장
      let grade;
      if (newPity >= 9) {
        const higherRates = { legendary: chest.rates.legendary, epic: chest.rates.epic, rare: 100 - chest.rates.legendary - chest.rates.epic };
        grade = weightedRandom(higherRates);
        newPity = 0;
      } else {
        grade = weightedRandom(chest.rates);
        newPity++;
        if (grade !== 'common') newPity = 0;
      }

      const pool = allItems.filter(it => it.grade === grade && it.active !== false);
      if (pool.length === 0) {
        drawn.push(allItems[Math.floor(Math.random() * allItems.length)]);
      } else {
        drawn.push(pool[Math.floor(Math.random() * pool.length)]);
      }
    }

    // 인벤토리에 추가
    const newInv = [...inventory];
    const isNew  = drawn.map(item => {
      const alreadyOwned = newInv.some(inv => inv.itemId === item.id);
      newInv.push({ id: `inv_${Date.now()}_${Math.random().toString(36).slice(2)}`, itemId: item.id, stars: 0, obtainedAt: new Date().toISOString() });
      return !alreadyOwned;
    });

    const newDiamonds = diamonds - totalCost;
    const newPityMap = { ...pityMap, [chest.id]: newPity };
    setDiamonds(newDiamonds);
    setInventory(newInv);
    setPityMap(newPityMap);
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

  return (
    <div className="min-h-full bg-slate-50 p-4">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-extrabold text-slate-800">📦 보물상자</h1>
        <div className="bg-slate-800 text-cyan-400 px-3 py-1.5 rounded-xl text-sm font-bold">
          💎 {(diamonds || 0).toLocaleString()}
        </div>
      </div>

      {/* 상자 목록 */}
      <div className="space-y-4 mb-6">
        {CHESTS.map(chest => {
          const pity  = pityMap[chest.id] || 0;
          const canPull1  = diamonds >= chest.cost;
          const canPull10 = diamonds >= chest.cost * 10;
          return (
            <div key={chest.id} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              {/* 헤더 */}
              <div className={`px-5 py-4 flex items-center gap-3
                ${chest.id === 'wood' ? 'bg-amber-50 border-b border-amber-100'
                : chest.id === 'stone' ? 'bg-slate-100 border-b border-slate-200'
                : 'bg-gradient-to-r from-cyan-900 to-indigo-900 border-b border-cyan-800'}`}>
                <span className="text-3xl">{chest.icon}</span>
                <div className="flex-1">
                  <div className={`font-extrabold text-base ${chest.id === 'diamond' ? 'text-white' : 'text-slate-800'}`}>
                    {chest.name}
                  </div>
                  <div className={`text-xs ${chest.id === 'diamond' ? 'text-cyan-300' : 'text-slate-500'}`}>
                    전설 {chest.rates.legendary}% · 영웅 {chest.rates.epic}% · 희귀 {chest.rates.rare}%
                  </div>
                </div>
                <div className={`text-sm font-extrabold ${chest.id === 'diamond' ? 'text-cyan-300' : 'text-slate-600'}`}>
                  💎 {chest.cost}
                </div>
              </div>

              {/* 천장 게이지 */}
              <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>천장 ({pity}/10 · 10번에 희귀 이상 확정)</span>
                  <span className={pity >= 8 ? 'text-amber-500 font-bold' : ''}>{pity}/10</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pity >= 8 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                    style={{ width: `${(pity / 10) * 100}%` }} />
                </div>
              </div>

              {/* 버튼 */}
              <div className="px-5 py-4 flex gap-3">
                <button onClick={() => pull(chest, 1)} disabled={!canPull1 || pulling}
                  className={`flex-1 py-3 rounded-2xl font-extrabold text-sm transition-all active:scale-95
                    ${canPull1 && !pulling ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                  1회 뽑기<br/><span className="text-xs font-bold opacity-70">💎 {chest.cost}</span>
                </button>
                <button onClick={() => pull(chest, 10)} disabled={!canPull10 || pulling}
                  className={`flex-1 py-3 rounded-2xl font-extrabold text-sm transition-all active:scale-95
                    ${canPull10 && !pulling ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 text-white shadow-sm' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                  10회 뽑기<br/><span className="text-xs font-bold opacity-70">💎 {chest.cost * 10}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 결과 팝업 */}
      {results && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-3xl w-full max-w-md border border-slate-700 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-700 flex items-center justify-between">
              <h2 className="font-extrabold text-white text-lg">🎉 획득한 장비</h2>
              <button onClick={() => setResults(null)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-4 grid grid-cols-3 sm:grid-cols-5 gap-3 max-h-[60vh] overflow-y-auto">
              {results.map(({ item, isNew }, i) => (
                <ResultCard key={i} item={item} isNew={isNew} />
              ))}
            </div>
            <div className="p-4 border-t border-slate-700">
              <button onClick={() => setResults(null)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-extrabold transition-all">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 뽑기 로딩 */}
      {pulling && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-spin">📦</div>
            <p className="text-white font-extrabold text-xl animate-pulse">상자 열리는 중...</p>
          </div>
        </div>
      )}
    </div>
  );
}
