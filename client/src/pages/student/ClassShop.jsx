import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, writeBatch, getDoc,
  serverTimestamp, query, where, increment,
} from 'firebase/firestore';
import { db } from '../../firebase';

// ── 이용권 설정 ───────────────────────────────────────────────
const TICKET_META = {
  dungeon:  { label: '던전 이용권',    icon: '🗡️', max: 3, color: 'sky'    },
  bossRaid: { label: '보스레이드 이용권', icon: '👹', max: 3, color: 'rose'   },
  arena:    { label: '투기장 이용권',  icon: '🏟️', max: 5, color: 'violet' },
};

// ── 이용권 카드 ───────────────────────────────────────────────
function TicketCard({ ticketKey, price, myDiamonds, currentCount, onBuy, isBuying }) {
  const meta    = TICKET_META[ticketKey];
  const isFull  = currentCount >= meta.max;
  const canBuy  = !isFull && myDiamonds >= price;

  return (
    <div className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 border-2 transition-all
      ${isFull ? 'border-slate-700 opacity-60' : 'border-indigo-500/50 hover:border-indigo-400 hover:shadow-lg hover:shadow-indigo-900/30'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="text-3xl">{meta.icon}</div>
        <div>
          <div className="font-extrabold text-white text-sm">{meta.label}</div>
          <div className="text-xs text-slate-400">{currentCount}/{meta.max} 보유 중</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mb-3">
        {Array.from({ length: meta.max }, (_, i) => (
          <div key={i} className={`h-2 flex-1 rounded-full
            ${i < currentCount
              ? meta.color === 'sky' ? 'bg-sky-400' : meta.color === 'rose' ? 'bg-rose-400' : 'bg-violet-400'
              : 'bg-slate-600'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-cyan-300 font-extrabold text-sm">💎 {price}</span>
        <button
          onClick={() => !isBuying && canBuy && onBuy(ticketKey, price)}
          disabled={!canBuy || isBuying}
          className={`px-4 py-1.5 rounded-xl font-extrabold text-xs transition-all active:scale-95
            ${isFull ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
            : !canBuy ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'}`}>
          {isFull ? '최대 보유' : !canBuy ? '다이아 부족' : '구매'}
        </button>
      </div>
    </div>
  );
}

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getScopeFromStudent = (student) => {
  const classId = student?.classId || null;
  const teacherUid = student?.teacherUid || null;
  return { classId, teacherUid, scopeKey: classId || teacherUid || null };
};

const isInScope = (data, scope) => {
  if (!scope?.scopeKey) return false;
  if (data.scopeKey) return data.scopeKey === scope.scopeKey;
  if (scope.classId && data.classId) return data.classId === scope.classId;
  if (data.teacherUid) return data.teacherUid === scope.teacherUid;
  return true;
};

// ─────────────────────── 상점 아이템 카드 ────────────────────
function ShopItemCard({ item, myGold, onBuy }) {
  const outOfStock = item.quantity !== -1 && item.quantity <= 0;
  const canAfford  = myGold >= item.price;
  const disabled   = outOfStock || !canAfford;

  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all
      ${outOfStock ? 'opacity-50 border-slate-100' : 'border-slate-200 hover:shadow-md hover:-translate-y-0.5'}`}>
      <div className="p-5 flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl flex items-center justify-center text-5xl border border-amber-100 mb-4 shadow-sm">
          {item.icon || '🛍️'}
        </div>
        <h3 className="font-extrabold text-slate-800 text-base mb-1 leading-tight">{item.name}</h3>
        {item.description && (
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">{item.description}</p>
        )}
        <div className="flex items-center gap-2 mb-4">
          <span className="font-extrabold text-amber-600">🪙 {item.price.toLocaleString()} G</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
            ${outOfStock ? 'bg-rose-100 text-rose-500'
              : item.quantity === -1 ? 'bg-emerald-100 text-emerald-700'
              : item.quantity <= 5 ? 'bg-amber-100 text-amber-700'
              : 'bg-slate-100 text-slate-500'}`}>
            {outOfStock ? '품절' : item.quantity === -1 ? '무제한' : `잔여 ${item.quantity}개`}
          </span>
        </div>
        <button onClick={() => !disabled && onBuy(item)} disabled={disabled}
          className={`w-full py-2.5 font-extrabold text-sm rounded-xl transition-all active:scale-95 shadow-sm
            ${outOfStock ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : !canAfford ? 'bg-rose-50 text-rose-400 border border-rose-200 cursor-not-allowed'
              : 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200'}`}>
          {outOfStock ? '품절' : !canAfford ? '골드 부족' : '구매하기 🛒'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────── 구매 확인 모달 ──────────────────────
function BuyModal({ item, qty, onQtyChange, myGold, onConfirm, onCancel, isBusy }) {
  const maxQty    = item.quantity === -1 ? 99 : item.quantity;
  const total     = item.price * qty;
  const afterGold = myGold - total;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl flex items-center justify-center text-6xl border border-amber-100 mx-auto mb-4">
            {item.icon || '🛍️'}
          </div>
          <h3 className="font-extrabold text-slate-800 text-xl mb-1">{item.name}</h3>
          {item.description && <p className="text-sm text-slate-500 mb-4">{item.description}</p>}

          <div className="flex items-center justify-center gap-4 mb-5">
            <button onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl transition-colors">−</button>
            <div className="text-3xl font-extrabold text-slate-800 min-w-[3rem] text-center">{qty}</div>
            <button onClick={() => onQtyChange(Math.min(maxQty, qty + 1))}
              className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl transition-colors">+</button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>단가</span><span className="font-bold">🪙 {item.price.toLocaleString()} G</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>수량</span><span className="font-bold">{qty}개</span>
            </div>
            <div className="border-t border-amber-200 pt-2 flex justify-between">
              <span className="font-bold text-slate-700">합계</span>
              <span className="font-extrabold text-amber-600 text-base">🪙 {total.toLocaleString()} G</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">구매 후 잔액</span>
              <span className={`font-bold ${afterGold < 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                🪙 {afterGold.toLocaleString()} G
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={onCancel}
              className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
              취소
            </button>
            <button onClick={onConfirm} disabled={isBusy || afterGold < 0}
              className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-sm disabled:opacity-50 active:scale-95">
              {isBusy ? '처리 중...' : '구매 확정 ✓'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── 즉시 사용 팝업 ──────────────────────
function ImmediateUseModal({ item, purchasedQty, onUseNow, onLater }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-3">
            ✅
          </div>
          <h3 className="font-extrabold text-slate-800 text-lg mb-1">구매 완료!</h3>
          <p className="text-slate-500 text-sm mb-1">
            <span className="font-bold text-amber-600">{item.icon || '🛍️'} {item.name}</span> {purchasedQty}개를 구매했습니다.
          </p>
          <p className="text-slate-600 font-bold text-base mt-4 mb-6">
            바로 사용하시겠습니까?
          </p>
          <div className="flex gap-3">
            <button onClick={onLater}
              className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
              나중에 사용
            </button>
            <button onClick={onUseNow}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm active:scale-95">
              지금 사용! ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── 아이템 사용 모달 ────────────────────
function UseModal({ inv, qty, onQtyChange, onConfirm, onCancel, isUsing }) {
  const remaining = inv.totalQuantity - inv.usedQuantity;
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl flex items-center justify-center text-5xl border border-indigo-100 mx-auto mb-4">
            {inv.itemIcon || '🛍️'}
          </div>
          <h3 className="font-extrabold text-slate-800 text-xl mb-1">{inv.itemName}</h3>
          <p className="text-sm text-slate-500 mb-4">보유: <span className="font-bold text-indigo-600">{remaining}개</span></p>

          <p className="text-sm font-bold text-slate-600 mb-3">몇 개를 사용하시겠습니까?</p>
          <div className="flex items-center justify-center gap-4 mb-5">
            <button onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl transition-colors">−</button>
            <div className="text-3xl font-extrabold text-indigo-700 min-w-[3rem] text-center">{qty}</div>
            <button onClick={() => onQtyChange(Math.min(remaining, qty + 1))}
              className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl transition-colors">+</button>
          </div>

          <div className="flex gap-3">
            <button onClick={onCancel}
              className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
              취소
            </button>
            <button onClick={onConfirm} disabled={isUsing}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm disabled:opacity-50 active:scale-95">
              {isUsing ? '처리 중...' : `${qty}개 사용하기`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function ClassShop({ studentCode }) {
  const [items, setItems]             = useState([]);
  const [student, setStudent]         = useState(null);
  const [studentDocId, setStudentDocId] = useState(null);
  const [inventory, setInventory]     = useState([]);
  const [purchases, setPurchases]     = useState([]);
  const [usages, setUsages]           = useState([]);
  const [tab, setTab]                 = useState('shop');
  const [isLoading, setIsLoading]     = useState(true);
  const [ticketPrices, setTicketPrices] = useState({ dungeon: 200, bossRaid: 200, arena: 200 });
  const [scope, setScope] = useState({ classId: null, teacherUid: null, scopeKey: null });
  const [isBuyingTicket, setIsBuyingTicket] = useState(false);
  const [toast, setToast]       = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 구매 관련
  const [buyTarget, setBuyTarget]     = useState(null);
  const [buyQty, setBuyQty]           = useState(1);
  const [isBuying, setIsBuying]       = useState(false);
  const [immediateUsePrompt, setImmediateUsePrompt] = useState(null); // { item, invId, qty }

  // 사용 관련
  const [useTarget, setUseTarget]     = useState(null); // inventory item
  const [useQty, setUseQty]           = useState(1);
  const [isUsing, setIsUsing]         = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setTicketPrices({ dungeon: 200, bossRaid: 200, arena: 200 });
      try {
        if (studentCode) {
          const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const sDoc = snap.docs[0];
            const sData = sDoc.data();
            const nextScope = getScopeFromStudent(sData);
            setStudentDocId(sDoc.id);
            setStudent({ id: sDoc.id, ...sData });
            setScope(nextScope);

            if (nextScope.scopeKey) {
              const tSnap = await getDoc(doc(db, 'ticketShopSettings', nextScope.scopeKey));
              if (tSnap.exists()) setTicketPrices(prev => ({ ...prev, ...tSnap.data() }));

              const itemsSnap = await getDocs(
                query(collection(db, 'shopItems'), where('scopeKey', '==', nextScope.scopeKey))
              );
              setItems(
                itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                  .filter(i => i.active)
                  .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
              );
            } else {
              setItems([]);
            }

            const [invSnap, pSnap, uSnap] = await Promise.all([
              getDocs(query(collection(db, 'shopInventory'), where('studentId', '==', sDoc.id))),
              getDocs(query(collection(db, 'shopPurchases'), where('studentId', '==', sDoc.id))),
              getDocs(query(collection(db, 'shopUsages'),   where('studentId', '==', sDoc.id))),
            ]);
            setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() }))
              .filter(data => isInScope(data, nextScope))
              .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)));
            setPurchases(pSnap.docs.map(d => ({ id: d.id, ...d.data() }))
              .filter(data => isInScope(data, nextScope))
              .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
            setUsages(uSnap.docs.map(d => ({ id: d.id, ...d.data() }))
              .filter(data => isInScope(data, nextScope))
              .sort((a, b) => (b.usedAt?.seconds || 0) - (a.usedAt?.seconds || 0)));
          } else {
            setItems([]);
          }
        } else {
          setItems([]);
        }
      } catch (err) {
        console.error('상점 로딩 에러:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [studentCode]);

  // ── 이용권 구매 ──────────────────────────────────────────────
  const buyTicket = async (ticketKey, price) => {
    if (!student || !studentDocId) return;
    const meta    = TICKET_META[ticketKey];
    const curDia  = student.diamonds || 0;
    const curCnt  = student.tickets?.[ticketKey] ?? 0;
    if (curDia < price)        return showToast(`다이아 부족! (필요: 💎${price} / 보유: 💎${curDia})`, 'error');
    if (curCnt >= meta.max)    return showToast(`이미 최대 보유 수(${meta.max}개)입니다.`, 'error');

    setIsBuyingTicket(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'students', studentDocId), {
        diamonds: curDia - price,
        [`tickets.${ticketKey}`]: Math.min(meta.max, curCnt + 1),
      });
      await batch.commit();
      setStudent(prev => ({
        ...prev,
        diamonds: curDia - price,
        tickets: { ...prev.tickets, [ticketKey]: Math.min(meta.max, curCnt + 1) },
      }));
      showToast(`✅ ${meta.label} 1개 구매 완료!`);
    } catch (err) {
      console.error('이용권 구매 에러:', err);
      showToast('구매 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsBuyingTicket(false);
    }
  };

  // ── 구매 확정 ────────────────────────────────────────────────
  const confirmBuy = async () => {
    if (!buyTarget) return;
    const total   = buyTarget.price * buyQty;
    const curGold = student?.gold || 0;
    if (total > curGold) return showToast(`골드 부족! (필요: 🪙${total.toLocaleString()} / 보유: 🪙${curGold.toLocaleString()})`, 'error');
    if (buyTarget.quantity !== -1 && buyQty > buyTarget.quantity)
      return showToast('재고 부족!', 'error');

    setIsBuying(true);
    try {
      const batch  = writeBatch(db);
      const invId  = `${scope.scopeKey || 'global'}_${studentDocId}_${buyTarget.id}`;

      batch.update(doc(db, 'students', studentDocId), { gold: curGold - total });

      if (buyTarget.quantity !== -1) {
        batch.update(doc(db, 'shopItems', buyTarget.id), {
          quantity:  buyTarget.quantity - buyQty,
          soldCount: (buyTarget.soldCount || 0) + buyQty,
        });
      } else {
        batch.update(doc(db, 'shopItems', buyTarget.id), {
          soldCount: (buyTarget.soldCount || 0) + buyQty,
        });
      }

      batch.set(doc(collection(db, 'shopPurchases')), {
        studentId:   studentDocId,
        studentCode: student.studentCode,
        studentName: student.name || student.studentCode,
        itemId:   buyTarget.id, itemName: buyTarget.name, itemIcon: buyTarget.icon || '🛍️',
        price: buyTarget.price, quantity: buyQty, totalPrice: total,
        classId: scope.classId || null,
        teacherUid: scope.teacherUid || null,
        scopeKey: scope.scopeKey || null,
        createdAt: serverTimestamp(),
      });

      // 인벤토리 생성/갱신 (increment로 안전하게 누적)
      batch.set(doc(db, 'shopInventory', invId), {
        studentId:    studentDocId,
        studentCode:  student.studentCode,
        studentName:  student.name || student.studentCode,
        itemId:    buyTarget.id, itemName: buyTarget.name,
        itemIcon:  buyTarget.icon || '🛍️', itemPrice: buyTarget.price,
        totalQuantity: increment(buyQty),
        usedQuantity:  increment(0),
        classId: scope.classId || null,
        teacherUid: scope.teacherUid || null,
        scopeKey: scope.scopeKey || null,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await batch.commit();

      // 로컬 상태 업데이트
      setStudent(prev => ({ ...prev, gold: curGold - total }));
      setItems(prev => prev.map(i => {
        if (i.id !== buyTarget.id) return i;
        return {
          ...i,
          quantity:  i.quantity === -1 ? -1 : i.quantity - buyQty,
          soldCount: (i.soldCount || 0) + buyQty,
        };
      }));
      setPurchases(prev => [{
        id: `t${Date.now()}`, itemName: buyTarget.name, itemIcon: buyTarget.icon || '🛍️',
        quantity: buyQty, totalPrice: total, createdAt: { seconds: Date.now() / 1000 },
        classId: scope.classId || null,
        teacherUid: scope.teacherUid || null,
        scopeKey: scope.scopeKey || null,
      }, ...prev]);
      setInventory(prev => {
        const existing = prev.find(i => i.id === invId);
        if (existing) {
          return prev.map(i => i.id === invId ? { ...i, totalQuantity: i.totalQuantity + buyQty } : i);
        }
        return [...prev, {
          id: invId, studentId: studentDocId,
          itemId: buyTarget.id, itemName: buyTarget.name, itemIcon: buyTarget.icon || '🛍️',
          itemPrice: buyTarget.price, totalQuantity: buyQty, usedQuantity: 0,
          classId: scope.classId || null,
          teacherUid: scope.teacherUid || null,
          scopeKey: scope.scopeKey || null,
        }];
      });

      setBuyTarget(null);
      // 즉시 사용 여부 팝업
      setImmediateUsePrompt({ item: buyTarget, invId, qty: buyQty });
    } catch (err) {
      console.error('구매 에러:', err);
      showToast('구매 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsBuying(false);
    }
  };

  // ── 아이템 사용 (공통) ──────────────────────────────────────
  const doUseItem = async (invId, itemData, qty) => {
    setIsUsing(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'shopInventory', invId), {
        usedQuantity: increment(qty),
        updatedAt:    serverTimestamp(),
      });
      batch.set(doc(collection(db, 'shopUsages')), {
        studentId:   studentDocId,
        studentCode: student.studentCode,
        studentName: student.name || student.studentCode,
        itemId:    itemData.id    || itemData.itemId,
        itemName:  itemData.name  || itemData.itemName,
        itemIcon:  itemData.icon  || itemData.itemIcon || '🛍️',
        itemPrice: itemData.price || itemData.itemPrice,
        quantity:  qty,
        classId: scope.classId || null,
        teacherUid: scope.teacherUid || null,
        scopeKey: scope.scopeKey || null,
        usedAt:    serverTimestamp(),
      });
      await batch.commit();

      setInventory(prev =>
        prev.map(i => i.id === invId ? { ...i, usedQuantity: i.usedQuantity + qty } : i)
      );
      setUsages(prev => [{
        id: `u${Date.now()}`,
        itemName: itemData.name || itemData.itemName,
        itemIcon: itemData.icon || itemData.itemIcon || '🛍️',
        quantity: qty,
        classId: scope.classId || null,
        teacherUid: scope.teacherUid || null,
        scopeKey: scope.scopeKey || null,
        usedAt: { seconds: Date.now() / 1000 },
      }, ...prev]);
      return true;
    } catch (err) {
      console.error('사용 에러:', err);
      showToast('사용 중 오류가 발생했습니다.', 'error');
      return false;
    } finally {
      setIsUsing(false);
    }
  };

  // 즉시 사용 처리
  const handleImmediateUse = async () => {
    const { item, invId, qty } = immediateUsePrompt;
    setImmediateUsePrompt(null);
    const ok = await doUseItem(invId, item, qty);
    if (ok) showToast(`✅ ${item.name} ${qty}개를 사용했습니다!`);
  };

  // 인벤토리에서 사용
  const confirmUse = async () => {
    if (!useTarget) return;
    const ok = await doUseItem(useTarget.id, useTarget, useQty);
    setUseTarget(null);
    if (ok) showToast(`✅ ${useTarget.itemName} ${useQty}개를 사용했습니다!`);
  };

  // ── 파생 데이터 ──────────────────────────────────────────────
  const ownedItems  = inventory.filter(i => (i.totalQuantity - i.usedQuantity) > 0);
  const shopItems   = items.filter(i => i.quantity === -1 || i.quantity > 0);
  const soldOutItems= items.filter(i => i.quantity !== -1 && i.quantity <= 0);
  const totalSpent  = purchases.reduce((s, p) => s + (p.totalPrice || 0), 0);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-64 gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <div className="text-slate-400 font-bold text-sm">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">🛒 학급 상점</h1>
          {student && <p className="text-sm text-slate-500 mt-0.5">{student.name || student.studentCode}</p>}
        </div>
        {student && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2 text-right">
            <div className="text-[10px] text-amber-500 font-bold">보유 골드</div>
            <div className="text-xl font-extrabold text-amber-600">🪙 {(student.gold || 0).toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          ['shop',     '상점',                                    'bg-amber-500'],
          ['items',    `내 아이템 (${ownedItems.length})`,         'bg-indigo-600'],
          ['usages',   `사용 내역 (${usages.length})`,            'bg-violet-600'],
          ['purchases',`구매 내역 (${purchases.length})`,          'bg-slate-600'],
        ].map(([val, label, activeCls]) => (
          <button key={val} onClick={() => setTab(val)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${tab === val ? `${activeCls} text-white shadow` : 'bg-white text-slate-600 border border-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 상점 탭 ── */}
      {tab === 'shop' && (
        !studentCode ? (
          <div className="text-center py-20 text-slate-400">
            <div className="text-6xl mb-4">🛒</div>
            <p className="font-bold text-lg text-slate-600">로그인이 필요합니다</p>
          </div>
        ) : (
          <div>
            {/* 이용권 상점 (상단 고정) */}
            <div className="bg-slate-900 rounded-2xl p-4 mb-6 border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-extrabold text-white text-sm">🎫 어드벤처 이용권</h2>
                  <p className="text-xs text-slate-400 mt-0.5">다이아로 구매 · 즉시 지급</p>
                </div>
                {student && (
                  <span className="text-cyan-300 font-extrabold text-sm">💎 {(student.diamonds || 0).toLocaleString()}</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {Object.keys(TICKET_META).map(key => (
                  <TicketCard
                    key={key}
                    ticketKey={key}
                    price={ticketPrices[key] ?? 200}
                    myDiamonds={student?.diamonds || 0}
                    currentCount={student?.tickets?.[key] ?? 0}
                    onBuy={buyTicket}
                    isBuying={isBuyingTicket}
                  />
                ))}
              </div>
            </div>

            {/* 일반 상점 아이템 */}
            {items.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <div className="text-5xl mb-3">🏪</div>
                <p className="font-bold text-slate-600">등록된 물품이 없습니다</p>
              </div>
            ) : (
              <div>
                {shopItems.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 mb-6">
                    {shopItems.map(item => (
                      <ShopItemCard key={item.id} item={item} myGold={student?.gold || 0} onBuy={i => { setBuyTarget(i); setBuyQty(1); }} />
                    ))}
                  </div>
                )}
                {soldOutItems.length > 0 && (
                  <>
                    <div className="text-sm font-bold text-slate-400 mb-3">품절된 물품</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                      {soldOutItems.map(item => (
                        <ShopItemCard key={item.id} item={item} myGold={student?.gold || 0} onBuy={() => {}} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      )}

      {/* ── 내 아이템 탭 ── */}
      {tab === 'items' && (
        ownedItems.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <div className="text-6xl mb-4">🎒</div>
            <p className="font-bold text-lg text-slate-600">보유한 아이템이 없습니다</p>
            <p className="text-sm mt-1">상점에서 물품을 구매해보세요!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {ownedItems.map(inv => {
              const remaining = inv.totalQuantity - inv.usedQuantity;
              const itemData  = items.find(i => i.id === inv.itemId);
              return (
                <div key={inv.id}
                  className="bg-gradient-to-b from-indigo-600 to-indigo-900 rounded-2xl shadow-lg overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all border border-indigo-500/40">
                  <div className="p-4 flex flex-col items-center text-center">
                    {/* 장비 이미지 */}
                    <div className="relative mb-3">
                      <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-4xl border border-white/20 shadow-inner">
                        {inv.itemIcon || '🛍️'}
                      </div>
                      <div className="absolute -top-1 -right-1 bg-amber-400 text-amber-900 text-[10px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center shadow">
                        {remaining}
                      </div>
                    </div>

                    {/* 스탯창 */}
                    <div className="w-full bg-black/25 rounded-xl p-2.5 mb-3 border border-white/10">
                      {itemData?.description && (
                        <p className="text-[10px] text-indigo-200 leading-relaxed mb-2 text-center">
                          {itemData.description}
                        </p>
                      )}
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div>
                          <div className="text-[8px] text-indigo-400 font-bold mb-0.5">단가</div>
                          <div className="text-[10px] text-amber-300 font-extrabold leading-none">
                            🪙{(inv.itemPrice || 0).toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-[8px] text-indigo-400 font-bold mb-0.5">보유</div>
                          <div className="text-[10px] text-emerald-300 font-extrabold leading-none">
                            {remaining}개
                          </div>
                        </div>
                        <div>
                          <div className="text-[8px] text-indigo-400 font-bold mb-0.5">사용</div>
                          <div className="text-[10px] text-slate-300 font-extrabold leading-none">
                            {inv.usedQuantity}개
                          </div>
                        </div>
                      </div>
                    </div>

                    <h3 className="font-extrabold text-white text-sm mb-3 leading-tight">{inv.itemName}</h3>
                    <button
                      onClick={() => { setUseTarget(inv); setUseQty(1); }}
                      className="w-full py-2 bg-white/20 hover:bg-white/30 text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 border border-white/20">
                      사용하기 ✓
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── 사용 내역 탭 ── */}
      {tab === 'usages' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
            <h3 className="font-bold text-slate-700 text-sm">내 사용 내역</h3>
          </div>
          {usages.length === 0 ? (
            <div className="text-center py-14 text-slate-400">
              <div className="text-5xl mb-3">📋</div>
              <p className="font-bold">사용 내역이 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {usages.map(u => (
                <div key={u.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-2xl border border-indigo-100">
                      {u.itemIcon || '🛍️'}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{u.itemName}</div>
                      <div className="text-xs text-slate-400">{fmtDate(u.usedAt)}</div>
                    </div>
                  </div>
                  <div className="text-sm font-extrabold text-indigo-600">{u.quantity}개 사용</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 구매 내역 탭 ── */}
      {tab === 'purchases' && (
        <div className="space-y-4">
          {purchases.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
              <div className="text-center">
                <div className="text-xl font-extrabold text-amber-700">{purchases.length}건</div>
                <div className="text-[10px] text-amber-500 font-bold">총 구매</div>
              </div>
              <div className="w-px h-8 bg-amber-200" />
              <div className="text-center">
                <div className="text-xl font-extrabold text-amber-700">🪙 {totalSpent.toLocaleString()} G</div>
                <div className="text-[10px] text-amber-500 font-bold">총 지출</div>
              </div>
            </div>
          )}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
              <h3 className="font-bold text-slate-700 text-sm">내 구매 내역</h3>
            </div>
            {purchases.length === 0 ? (
              <div className="text-center py-14 text-slate-400">
                <div className="text-5xl mb-3">🛍️</div>
                <p className="font-bold">구매 내역이 없습니다</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {purchases.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{p.itemIcon || '🛍️'}</span>
                      <div>
                        <div className="font-bold text-slate-800 text-sm">{p.itemName}</div>
                        <div className="text-xs text-slate-400">{fmtDate(p.createdAt)} · {p.quantity}개</div>
                      </div>
                    </div>
                    <div className="font-extrabold text-amber-600 text-sm">🪙 -{(p.totalPrice || 0).toLocaleString()} G</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 구매 확인 모달 */}
      {buyTarget && (
        <BuyModal
          item={buyTarget} qty={buyQty} onQtyChange={setBuyQty}
          myGold={student?.gold || 0}
          onConfirm={confirmBuy} onCancel={() => setBuyTarget(null)} isBusy={isBuying}
        />
      )}

      {/* 즉시 사용 여부 팝업 */}
      {immediateUsePrompt && (
        <ImmediateUseModal
          item={immediateUsePrompt.item}
          purchasedQty={immediateUsePrompt.qty}
          onUseNow={handleImmediateUse}
          onLater={() => setImmediateUsePrompt(null)}
        />
      )}

      {/* 아이템 사용 모달 (인벤토리에서) */}
      {useTarget && (
        <UseModal
          inv={useTarget} qty={useQty} onQtyChange={setUseQty}
          onConfirm={confirmUse} onCancel={() => setUseTarget(null)} isUsing={isUsing}
        />
      )}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default ClassShop;
