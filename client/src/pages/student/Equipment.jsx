import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, updateDoc, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { GRADE, SLOTS, ENHANCE, PITY_LIMIT, STAT_LABEL } from '../../constants/equipment';

// ── 장비 카드 ─────────────────────────────────────────────────
export function EquipCard({ item, stars = 0, isEquipped, onClick, compact = false }) {
  const g = GRADE[item?.grade] || GRADE.common;
  if (!item) return null;
  return (
    <button onClick={onClick}
      className={`relative flex flex-col items-center rounded-2xl border-2 transition-all active:scale-95
        ${g.border} ${g.bg}
        ${compact ? 'p-2 gap-1' : 'p-3 gap-2'}
        ${isEquipped ? 'ring-2 ring-indigo-500 ring-offset-2 shadow-lg' : 'hover:shadow-md hover:-translate-y-0.5'}
        ${item.grade === 'legendary' ? 'shadow-amber-100 shadow-md' : ''}
        ${item.grade === 'epic'      ? 'shadow-violet-100 shadow-md' : ''}`}>
      {/* 등급 뱃지 */}
      <span className={`absolute top-1 right-1 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full ${g.badge}`}>
        {g.label}
      </span>
      {isEquipped && (
        <span className="absolute top-1 left-1 text-[8px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-bold">착용</span>
      )}
      {/* 이미지 */}
      <div className={`${compact ? 'w-10 h-10' : 'w-14 h-14'} flex items-center justify-center`}>
        {item.image
          ? <img src={item.image} alt={item.name} className="w-full h-full object-contain drop-shadow-sm" />
          : <span className={compact ? 'text-2xl' : 'text-3xl'}>{SLOTS.find(s => s.key === item.type)?.icon || '🗡️'}</span>}
      </div>
      {/* 이름 */}
      <div className={`font-extrabold text-slate-800 truncate w-full text-center leading-tight
        ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
        {item.name}
      </div>
      {/* 별 */}
      <div className="flex gap-px">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`${compact ? 'text-[8px]' : 'text-[10px]'} ${i < stars ? 'text-amber-400' : 'text-slate-200'}`}>★</span>
        ))}
      </div>
    </button>
  );
}

// ── 강화 모달 ─────────────────────────────────────────────────
function EnhanceModal({ invItem, item, stones, onEnhance, onClose }) {
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState(null);
  const stars = invItem?.stars || 0;
  const cfg   = ENHANCE[stars];
  const canEnhance = cfg && stones >= cfg.stones;
  const g = GRADE[item?.grade] || GRADE.common;

  const doEnhance = async () => {
    if (!canEnhance || busy) return;
    setBusy(true); setResult(null);
    await new Promise(r => setTimeout(r, 900));
    const pityKey   = `pity_${invItem.id}`;
    const pityCount = parseInt(localStorage.getItem(pityKey) || '0');
    const guaranteed = stars === 4 && pityCount >= PITY_LIMIT;
    const success    = guaranteed || Math.random() < cfg.rate;
    localStorage.setItem(pityKey, success ? '0' : String(pityCount + 1));
    setResult(success ? 'success' : 'fail');
    setBusy(false);
    onEnhance(success);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-slate-900 rounded-3xl w-full max-w-sm border border-slate-700 shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-slate-800">
          <h2 className="font-extrabold text-white text-lg">⚒️ 장비 강화</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-800 transition-colors">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* 아이템 미리보기 */}
          <div className={`flex items-center gap-4 rounded-2xl p-4 border ${g.border} ${g.bg}`}>
            <div className="w-16 h-16 rounded-xl bg-white/60 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
              {item?.image
                ? <img src={item.image} alt="" className="w-full h-full object-contain" />
                : <span className="text-3xl">{SLOTS.find(s=>s.key===item?.type)?.icon||'🗡️'}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-slate-800 text-sm truncate">{item?.name}</div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${g.badge}`}>{g.label}</span>
              <div className="flex gap-0.5 mt-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={`text-xl ${i < stars ? 'text-amber-400' : 'text-slate-300'}`}>★</span>
                ))}
              </div>
            </div>
          </div>

          {cfg ? (
            <>
              {/* 확률 + 강화석 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800 rounded-2xl p-3.5 text-center border border-slate-700">
                  <div className="text-[10px] text-slate-400 mb-1">성공 확률</div>
                  <div className={`text-3xl font-extrabold
                    ${cfg.rate >= 0.6 ? 'text-emerald-400' : cfg.rate >= 0.3 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {(cfg.rate*100).toFixed(0)}%
                  </div>
                </div>
                <div className="bg-slate-800 rounded-2xl p-3.5 text-center border border-slate-700">
                  <div className="text-[10px] text-slate-400 mb-1">필요 강화석</div>
                  <div className={`text-3xl font-extrabold ${stones >= cfg.stones ? 'text-sky-400' : 'text-rose-400'}`}>
                    {cfg.stones}
                  </div>
                </div>
              </div>

              {/* 보유 강화석 */}
              <div className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm
                ${stones >= cfg.stones ? 'bg-sky-950/50 border border-sky-800' : 'bg-rose-950/50 border border-rose-900'}`}>
                <span className="text-slate-400 font-medium">보유 강화석</span>
                <span className={`font-extrabold text-base ${stones >= cfg.stones ? 'text-sky-400' : 'text-rose-400'}`}>
                  🔮 {stones}개
                </span>
              </div>

              {/* 결과 */}
              {result && (
                <div className={`text-center py-3.5 rounded-2xl font-extrabold text-lg animate-bounce
                  ${result==='success' ? 'bg-emerald-900/60 text-emerald-400 border border-emerald-700' : 'bg-rose-900/60 text-rose-400 border border-rose-800'}`}>
                  {result==='success' ? '✨ 강화 성공!' : '💔 강화 실패...'}
                </div>
              )}

              <button onClick={doEnhance} disabled={!canEnhance || busy}
                className={`w-full py-4 rounded-2xl font-extrabold text-base transition-all active:scale-95
                  ${canEnhance && !busy
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 text-white shadow-lg shadow-amber-900/30'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                {busy ? '강화 중...' : canEnhance ? `⚒️ ★${stars} → ★${stars+1} 강화` : '강화석 부족'}
              </button>
            </>
          ) : (
            <div className="text-center py-8 text-amber-400 font-extrabold text-xl">🌟 최고 강화 달성!</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function Equipment({ studentCode }) {
  const [tab, setTab]           = useState('equip');
  const [allItems, setAllItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [equipped, setEquipped] = useState({});
  const [stones, setStones]     = useState(0);
  const [studentDocId, setStudentDocId] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [enhanceTarget, setEnhanceTarget] = useState(null);
  const [selectedSlot, setSelectedSlot]   = useState(null);
  const [gradeFilter, setGradeFilter]     = useState('all');

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
    const newInv    = inventory.map(i => i.id === enhanceTarget.id ? { ...i, stars: (i.stars||0)+1 } : i);
    const newStones = Math.max(0, stones - (ENHANCE[enhanceTarget.stars||0]?.stones||0));
    setInventory(newInv);
    setStones(newStones);
    setEnhanceTarget(prev => prev ? { ...prev, stars: (prev.stars||0)+1 } : null);
    await updateDoc(doc(db, 'students', studentDocId), { equipInventory: newInv, enhancementStones: newStones });
  };

  // 장비 스탯 보너스 합산
  const equipBonus = Object.entries(STAT_LABEL).reduce((acc, [key]) => {
    acc[key] = Object.values(equipped).reduce((sum, invId) => {
      const inv  = getInvItem(invId);
      const item = inv ? getItem(inv.itemId) : null;
      if (!item?.stats?.[key]) return sum;
      return sum + (item.stats[key]||0) + (inv.stars||0)*5;
    }, 0);
    return acc;
  }, {});

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400 font-bold animate-pulse">불러오는 중...</div>
  );

  const slotItems = selectedSlot ? inventory.filter(inv => getItem(inv.itemId)?.type === selectedSlot) : [];
  const filteredInv = tab === 'inventory'
    ? inventory.filter(inv => {
        const item = getItem(inv.itemId);
        return item && (gradeFilter === 'all' || item.grade === gradeFilter);
      })
    : [];

  return (
    <div className="min-h-full bg-slate-100">
      {/* 상단 헤더 */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-extrabold text-white">⚔️ 장비</h1>
          <div className="flex items-center gap-1.5 bg-sky-900/60 border border-sky-700 text-sky-300 px-3 py-1.5 rounded-xl text-sm font-extrabold">
            🔮 강화석 {stones}개
          </div>
        </div>
        {/* 탭 */}
        <div className="flex gap-2">
          {[['equip','장착 관리'],['inventory','인벤토리']].map(([v,l]) => (
            <button key={v} onClick={() => { setTab(v); setSelectedSlot(null); }}
              className={`flex-1 py-2 rounded-xl font-extrabold text-sm transition-colors
                ${tab===v ? 'bg-white text-slate-800 shadow' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">

        {/* ── 장착 관리 ── */}
        {tab === 'equip' && (
          <div className="space-y-4">

            {/* 장착 슬롯 */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-extrabold text-slate-700 text-sm">장착 슬롯</h3>
                <span className="text-[10px] text-slate-400">슬롯을 눌러 장착/변경</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {SLOTS.map(slot => {
                  const invId   = equipped[slot.key];
                  const invItem = invId ? getInvItem(invId) : null;
                  const item    = invItem ? getItem(invItem.itemId) : null;
                  const g       = item ? (GRADE[item.grade]||GRADE.common) : null;
                  const isSelected = selectedSlot === slot.key;
                  return (
                    <button key={slot.key}
                      onClick={() => setSelectedSlot(prev => prev === slot.key ? null : slot.key)}
                      className={`rounded-2xl border-2 flex flex-col items-center justify-center p-3 transition-all active:scale-95
                        ${isSelected ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100' :
                          item ? `${g.border} ${g.bg} hover:shadow-md` :
                          'border-dashed border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                      {item ? (
                        <>
                          <div className="w-12 h-12 flex items-center justify-center">
                            {item.image
                              ? <img src={item.image} alt="" className="w-full h-full object-contain drop-shadow-sm" />
                              : <span className="text-2xl">{slot.icon}</span>}
                          </div>
                          <div className="text-[9px] font-extrabold text-slate-700 truncate w-full text-center mt-1">{item.name}</div>
                          <div className="flex gap-px mt-0.5">
                            {Array.from({length:5},(_,i)=>(
                              <span key={i} className={`text-[7px] ${i<(invItem?.stars||0)?'text-amber-400':'text-slate-200'}`}>★</span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="text-2xl opacity-25">{slot.icon}</span>
                          <span className="text-[9px] text-slate-400 font-bold mt-1">{slot.label}</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 슬롯 선택 시 - 해당 타입 아이템 목록 */}
            {selectedSlot && (
              <div className="bg-white rounded-3xl shadow-sm border border-indigo-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-extrabold text-indigo-700 text-sm flex items-center gap-1.5">
                    {SLOTS.find(s=>s.key===selectedSlot)?.icon}
                    {SLOTS.find(s=>s.key===selectedSlot)?.label} 선택
                  </h3>
                  <button onClick={()=>setSelectedSlot(null)} className="text-slate-400 hover:text-slate-600 text-sm px-2 py-0.5 rounded-lg hover:bg-slate-100">✕</button>
                </div>
                {slotItems.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-6">보유한 장비가 없습니다</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5">
                    {slotItems.map(inv => {
                      const item = getItem(inv.itemId);
                      if (!item) return null;
                      return (
                        <EquipCard key={inv.id} item={item} stars={inv.stars}
                          isEquipped={Object.values(equipped).includes(inv.id)}
                          onClick={() => toggleEquip(inv)} compact />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 장비 보너스 스탯 */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-4">
              <h3 className="font-extrabold text-slate-700 text-sm mb-3">장비 보너스 스탯</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(STAT_LABEL).map(([key, meta]) => {
                  const val = equipBonus[key] || 0;
                  return (
                    <div key={key} className={`flex items-center justify-between rounded-xl px-3 py-2.5 border
                      ${val > 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
                      <span className="text-xs text-slate-500 flex items-center gap-1.5">
                        <span>{meta.icon}</span>{meta.label}
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

        {/* ── 인벤토리 ── */}
        {tab === 'inventory' && (
          <div>
            {/* 등급 필터 */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
              {['all','legendary','epic','rare','common'].map(g => (
                <button key={g} onClick={() => setGradeFilter(g)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors border
                    ${gradeFilter===g
                      ? g==='all' ? 'bg-slate-700 text-white border-slate-700'
                        : `${(GRADE[g]||GRADE.common).badge} border-transparent`
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                  {g==='all' ? '전체' : (GRADE[g]||GRADE.common).label}
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
                        className="w-full py-1.5 rounded-xl text-[10px] font-extrabold transition-colors border
                          bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200">
                        ⚒️ 강화 ({inv.stars||0}/5)
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 강화 모달 */}
      {enhanceTarget && (
        <EnhanceModal
          invItem={enhanceTarget}
          item={getItem(enhanceTarget.itemId)}
          stones={stones}
          onEnhance={onEnhanceDone}
          onClose={() => setEnhanceTarget(null)}
        />
      )}
    </div>
  );
}
