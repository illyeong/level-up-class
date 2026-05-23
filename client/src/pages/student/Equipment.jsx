import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, getDoc, updateDoc, setDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { GRADE, SLOTS, ENHANCE, PITY_LIMIT, STAT_LABEL } from '../../constants/equipment';

// ── 장비 카드 ─────────────────────────────────────────────────
function EquipCard({ item, stars = 0, isEquipped, onClick, size = 'md' }) {
  const g = GRADE[item.grade] || GRADE.common;
  const sizeMap = { sm: 'p-2', md: 'p-3', lg: 'p-4' };
  return (
    <button onClick={onClick}
      className={`relative rounded-2xl border-2 ${g.border} ${g.bg} ${sizeMap[size]}
        hover:scale-105 active:scale-95 transition-all shadow-sm ${g.glow ? `shadow-md ${g.glow}` : ''}
        ${isEquipped ? 'ring-2 ring-indigo-500 ring-offset-1' : ''} text-left w-full`}>
      {/* 등급 뱃지 */}
      <span className={`absolute top-1 right-1 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full ${g.badge}`}>
        {g.label}
      </span>
      {isEquipped && (
        <span className="absolute top-1 left-1 text-[8px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-bold">
          착용
        </span>
      )}
      {/* 이미지 */}
      <div className="aspect-square flex items-center justify-center mb-1.5">
        {item.image
          ? <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
          : <span className="text-3xl">{SLOTS.find(s => s.key === item.type)?.icon || '🗡️'}</span>}
      </div>
      {/* 이름 */}
      <div className={`font-extrabold truncate ${size === 'sm' ? 'text-[10px]' : 'text-xs'} text-slate-800`}>
        {item.name}
      </div>
      {/* 별 */}
      <div className="flex gap-0.5 mt-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`${size === 'sm' ? 'text-[8px]' : 'text-[10px]'} ${i < stars ? 'text-amber-400' : 'text-slate-200'}`}>★</span>
        ))}
      </div>
    </button>
  );
}

// ── 슬롯 칸 ──────────────────────────────────────────────────
function SlotBox({ slot, invItem, item, onClick }) {
  const g = item ? (GRADE[item.grade] || GRADE.common) : null;
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-2xl border-2 aspect-square transition-all
        ${item
          ? `${g.border} ${g.bg} hover:scale-105 shadow-sm`
          : 'border-dashed border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50'}`}>
      {item ? (
        <>
          {item.image
            ? <img src={item.image} alt={item.name} className="w-10 h-10 object-contain" />
            : <span className="text-2xl">{slot.icon}</span>}
          <div className="text-[9px] font-extrabold text-slate-700 truncate w-full text-center px-1 mt-0.5">
            {item.name}
          </div>
          <div className="flex gap-px">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={`text-[7px] ${i < (invItem?.stars || 0) ? 'text-amber-400' : 'text-slate-200'}`}>★</span>
            ))}
          </div>
        </>
      ) : (
        <>
          <span className="text-2xl opacity-30">{slot.icon}</span>
          <span className="text-[9px] text-slate-400 font-bold mt-0.5">{slot.label}</span>
        </>
      )}
    </button>
  );
}

// ── 강화 화면 ─────────────────────────────────────────────────
function EnhancePanel({ invItem, item, stones, onEnhance, onClose }) {
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState(null); // 'success'|'fail'
  const stars = invItem.stars || 0;
  const cfg   = ENHANCE[stars];
  const canEnhance = cfg && stones >= cfg.stones;

  const doEnhance = async () => {
    if (!canEnhance || busy) return;
    setBusy(true);
    setResult(null);
    await new Promise(r => setTimeout(r, 800));
    // 연패 카운트
    const pityKey = `pity_${invItem.id}`;
    const pityCount = parseInt(localStorage.getItem(pityKey) || '0');
    const isGuaranteed = stars === 4 && pityCount >= PITY_LIMIT;
    const isSuccess = isGuaranteed || Math.random() < cfg.rate;

    if (isSuccess) {
      localStorage.setItem(pityKey, '0');
      setResult('success');
    } else {
      localStorage.setItem(pityKey, String(pityCount + 1));
      setResult('fail');
    }
    setBusy(false);
    onEnhance(isSuccess);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden border border-slate-700 shadow-2xl">
        {/* 헤더 */}
        <div className="p-5 border-b border-slate-700 flex items-center justify-between">
          <h2 className="font-extrabold text-white text-lg">⚒️ 장비 강화</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* 아이템 미리보기 */}
          <div className="flex items-center gap-4 bg-slate-800 rounded-2xl p-4">
            <div className="w-16 h-16 rounded-xl bg-slate-700 flex items-center justify-center overflow-hidden">
              {item?.image
                ? <img src={item.image} alt="" className="w-full h-full object-contain" />
                : <span className="text-3xl">{SLOTS.find(s => s.key === item?.type)?.icon || '🗡️'}</span>}
            </div>
            <div>
              <div className="font-extrabold text-white text-sm">{item?.name}</div>
              <div className={`text-xs font-bold mt-0.5 ${(GRADE[item?.grade]||GRADE.common).badge.includes('amber') ? 'text-amber-400' : 'text-slate-400'}`}>
                {(GRADE[item?.grade]||GRADE.common).label}
              </div>
              <div className="flex gap-0.5 mt-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={`text-base ${i < stars ? 'text-amber-400' : 'text-slate-600'}`}>★</span>
                ))}
              </div>
            </div>
          </div>

          {/* 강화 정보 */}
          {cfg ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800 rounded-2xl p-3 text-center border border-slate-700">
                  <div className="text-xs text-slate-400 mb-1">성공 확률</div>
                  <div className={`text-2xl font-extrabold ${cfg.rate >= 0.6 ? 'text-emerald-400' : cfg.rate >= 0.3 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {(cfg.rate * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="bg-slate-800 rounded-2xl p-3 text-center border border-slate-700">
                  <div className="text-xs text-slate-400 mb-1">필요 강화석</div>
                  <div className={`text-2xl font-extrabold ${stones >= cfg.stones ? 'text-sky-400' : 'text-rose-400'}`}>
                    {cfg.stones}개
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-2.5 text-sm">
                <span className="text-slate-400">보유 강화석</span>
                <span className={`font-extrabold ${stones >= cfg.stones ? 'text-sky-400' : 'text-rose-400'}`}>
                  🔮 {stones}개
                </span>
              </div>

              {/* 결과 메시지 */}
              {result && (
                <div className={`text-center py-3 rounded-2xl font-extrabold text-lg
                  ${result === 'success' ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700' : 'bg-rose-900/50 text-rose-400 border border-rose-800'}`}>
                  {result === 'success' ? '✨ 강화 성공!' : '💔 강화 실패...'}
                </div>
              )}

              <button onClick={doEnhance} disabled={!canEnhance || busy}
                className={`w-full py-4 rounded-2xl font-extrabold text-lg transition-all active:scale-95
                  ${canEnhance && !busy
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
                {busy ? '강화 중...' : canEnhance ? `⚒️ ★${stars} → ★${stars + 1} 강화` : '강화석 부족'}
              </button>
            </>
          ) : (
            <div className="text-center py-6 text-amber-400 font-extrabold text-lg">
              ★5 최고 강화 달성! 🎉
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function Equipment({ studentCode }) {
  const [tab, setTab]           = useState('equip');  // equip | inventory
  const [allItems, setAllItems] = useState([]);
  const [inventory, setInventory] = useState([]);     // [{ id, itemId, stars, slot }]
  const [equipped, setEquipped] = useState({});       // { weapon: invId, ... }
  const [stones, setStones]     = useState(0);
  const [studentDocId, setStudentDocId] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [enhanceTarget, setEnhanceTarget] = useState(null); // invItem
  const [selectedSlot, setSelectedSlot] = useState(null);   // 슬롯 선택 시 인벤에서 선택

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

  const getItem   = (itemId) => allItems.find(i => i.id === itemId);
  const getInvItem = (invId)  => inventory.find(i => i.id === invId);

  // 장착 / 해제
  const toggleEquip = async (invItem) => {
    if (!studentDocId) return;
    const item = getItem(invItem.itemId);
    if (!item) return;
    const slotKey = item.type;
    const isEquipped = Object.values(equipped).includes(invItem.id);
    const newEquipped = { ...equipped };
    if (isEquipped) {
      Object.keys(newEquipped).forEach(k => { if (newEquipped[k] === invItem.id) delete newEquipped[k]; });
    } else {
      newEquipped[slotKey] = invItem.id;
    }
    setEquipped(newEquipped);
    await updateDoc(doc(db, 'students', studentDocId), { equipped: newEquipped });
    setSelectedSlot(null);
  };

  // 강화 완료
  const onEnhanceDone = async (success) => {
    if (!success || !enhanceTarget || !studentDocId) return;
    const newInv = inventory.map(i =>
      i.id === enhanceTarget.id ? { ...i, stars: (i.stars || 0) + 1 } : i
    );
    setInventory(newInv);
    const newStones = stones - (ENHANCE[enhanceTarget.stars || 0]?.stones || 0);
    setStones(Math.max(0, newStones));
    await updateDoc(doc(db, 'students', studentDocId), {
      equipInventory: newInv,
      enhancementStones: Math.max(0, newStones),
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400 font-bold animate-pulse">불러오는 중...</div>
  );

  // 슬롯 선택 시 해당 슬롯 타입의 인벤토리 아이템 표시
  const slotItems = selectedSlot
    ? inventory.filter(inv => getItem(inv.itemId)?.type === selectedSlot)
    : [];

  return (
    <div className="min-h-full bg-slate-50 p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-extrabold text-slate-800">⚔️ 장비</h1>
        <div className="flex items-center gap-2 bg-slate-800 text-sky-400 px-3 py-1.5 rounded-xl text-sm font-bold">
          🔮 강화석 {stones}개
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-5">
        {[['equip','장착 관리'],['inventory','인벤토리']].map(([v,l]) => (
          <button key={v} onClick={() => { setTab(v); setSelectedSlot(null); }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors
              ${tab === v ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── 장착 관리 탭 ── */}
      {tab === 'equip' && (
        <div className="space-y-4">
          {/* 장착 슬롯 그리드 */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5">
            <h3 className="font-extrabold text-slate-700 text-sm mb-3">장착 중인 장비</h3>
            <div className="grid grid-cols-3 gap-3">
              {SLOTS.map(slot => {
                const invId   = equipped[slot.key];
                const invItem = invId ? getInvItem(invId) : null;
                const item    = invItem ? getItem(invItem.itemId) : null;
                return (
                  <SlotBox key={slot.key} slot={slot} invItem={invItem} item={item}
                    onClick={() => setSelectedSlot(prev => prev === slot.key ? null : slot.key)} />
                );
              })}
            </div>
          </div>

          {/* 슬롯 선택 시 해당 타입 인벤 */}
          {selectedSlot && (
            <div className="bg-white rounded-3xl shadow-sm border border-indigo-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-extrabold text-indigo-700 text-sm">
                  {SLOTS.find(s => s.key === selectedSlot)?.icon} {SLOTS.find(s => s.key === selectedSlot)?.label} 선택
                </h3>
                <button onClick={() => setSelectedSlot(null)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
              </div>
              {slotItems.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">보유한 장비가 없습니다</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {slotItems.map(inv => {
                    const item = getItem(inv.itemId);
                    if (!item) return null;
                    return (
                      <EquipCard key={inv.id} item={item} stars={inv.stars}
                        isEquipped={Object.values(equipped).includes(inv.id)}
                        onClick={() => toggleEquip(inv)} size="sm" />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 장착 스탯 합산 */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5">
            <h3 className="font-extrabold text-slate-700 text-sm mb-3">장비 보너스 스탯</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STAT_LABEL).map(([key, meta]) => {
                const bonus = Object.values(equipped).reduce((sum, invId) => {
                  const inv  = getInvItem(invId);
                  const item = inv ? getItem(inv.itemId) : null;
                  if (!item?.stats?.[key]) return sum;
                  const base = item.stats[key] || 0;
                  return sum + base + (inv.stars || 0) * 5;
                }, 0);
                return (
                  <div key={key} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                    <span className="text-xs text-slate-500 flex items-center gap-1">{meta.icon} {meta.label}</span>
                    <span className={`text-sm font-extrabold ${bonus > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                      +{bonus}
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
          {inventory.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-3">📦</div>
              <p className="font-bold">보유한 장비가 없습니다</p>
              <p className="text-sm mt-1">상자를 뽑아서 장비를 얻어보세요!</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {inventory.map(inv => {
                const item = getItem(inv.itemId);
                if (!item) return null;
                return (
                  <div key={inv.id} className="space-y-1.5">
                    <EquipCard item={item} stars={inv.stars}
                      isEquipped={Object.values(equipped).includes(inv.id)}
                      onClick={() => toggleEquip(inv)} />
                    <button
                      onClick={() => setEnhanceTarget(inv)}
                      className="w-full py-1.5 rounded-xl text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors">
                      ⚒️ 강화 ({inv.stars || 0}/5)
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 강화 패널 */}
      {enhanceTarget && (() => {
        const item = getItem(enhanceTarget.itemId);
        return (
          <EnhancePanel
            invItem={enhanceTarget}
            item={item}
            stones={stones}
            onEnhance={onEnhanceDone}
            onClose={() => setEnhanceTarget(null)}
          />
        );
      })()}
    </div>
  );
}
