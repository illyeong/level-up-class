import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, writeBatch,
  serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ─────────────────────── 물품 카드 ────────────────────────────
function ShopItemCard({ item, myGold, onBuy }) {
  const outOfStock = item.quantity !== -1 && item.quantity <= 0;
  const canAfford  = myGold >= item.price;
  const disabled   = outOfStock || !canAfford;

  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all
      ${outOfStock ? 'opacity-50 border-slate-100' : 'border-slate-200 hover:shadow-md hover:-translate-y-0.5'}`}>
      <div className="p-5 flex flex-col items-center text-center">
        {/* 아이콘 */}
        <div className="w-20 h-20 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl flex items-center justify-center text-5xl border border-amber-100 mb-4 shadow-sm">
          {item.icon || '🛍️'}
        </div>

        <h3 className="font-extrabold text-slate-800 text-base mb-1 leading-tight">{item.name}</h3>

        {item.description && (
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">{item.description}</p>
        )}

        {/* 재고 & 가격 */}
        <div className="flex items-center gap-2 mb-4">
          <span className="font-extrabold text-amber-600 text-base">🪙 {item.price.toLocaleString()} G</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
            ${outOfStock ? 'bg-rose-100 text-rose-500'
              : item.quantity === -1 ? 'bg-emerald-100 text-emerald-700'
              : item.quantity <= 5 ? 'bg-amber-100 text-amber-700'
              : 'bg-slate-100 text-slate-500'}`}>
            {outOfStock ? '품절' : item.quantity === -1 ? '무제한' : `잔여 ${item.quantity}개`}
          </span>
        </div>

        <button
          onClick={() => !disabled && onBuy(item)}
          disabled={disabled}
          className={`w-full py-2.5 font-extrabold text-sm rounded-xl transition-all active:scale-95 shadow-sm
            ${outOfStock ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : !canAfford ? 'bg-rose-50 text-rose-400 border border-rose-200 cursor-not-allowed'
              : 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200 cursor-pointer'}`}>
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
          {/* 아이콘 */}
          <div className="w-24 h-24 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl flex items-center justify-center text-6xl border border-amber-100 mx-auto mb-4 shadow-sm">
            {item.icon || '🛍️'}
          </div>
          <h3 className="font-extrabold text-slate-800 text-xl mb-1">{item.name}</h3>
          {item.description && (
            <p className="text-sm text-slate-500 mb-4">{item.description}</p>
          )}

          {/* 수량 조절 */}
          <div className="flex items-center justify-center gap-4 mb-5">
            <button
              onClick={() => onQtyChange(Math.max(1, qty - 1))}
              className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl transition-colors">
              −
            </button>
            <div className="text-3xl font-extrabold text-slate-800 min-w-[3rem] text-center">{qty}</div>
            <button
              onClick={() => onQtyChange(Math.min(maxQty, qty + 1))}
              className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl transition-colors">
              +
            </button>
          </div>

          {/* 가격 요약 */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>단가</span>
              <span className="font-bold">🪙 {item.price.toLocaleString()} G</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>수량</span>
              <span className="font-bold">{qty}개</span>
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
              className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors">
              취소
            </button>
            <button
              onClick={onConfirm}
              disabled={isBusy || afterGold < 0}
              className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-sm transition-all active:scale-95 disabled:opacity-50 shadow-sm shadow-amber-200">
              {isBusy ? '처리 중...' : '구매 확정 ✓'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function ClassShop({ studentCode }) {
  const [items, setItems]         = useState([]);
  const [student, setStudent]     = useState(null);
  const [studentDocId, setStudentDocId] = useState(null);
  const [myPurchases, setMyPurchases]   = useState([]);
  const [tab, setTab]             = useState('shop');
  const [isLoading, setIsLoading] = useState(true);
  const [buyTarget, setBuyTarget] = useState(null); // { item }
  const [buyQty, setBuyQty]       = useState(1);
  const [isBuying, setIsBuying]   = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const itemsSnap = await getDocs(collection(db, 'shopItems'));
        const active = itemsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(i => i.active)
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setItems(active);

        if (studentCode) {
          const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const sDoc = snap.docs[0];
            setStudentDocId(sDoc.id);
            setStudent({ id: sDoc.id, ...sDoc.data() });

            const pSnap = await getDocs(
              query(collection(db, 'shopPurchases'), where('studentId', '==', sDoc.id))
            );
            setMyPurchases(
              pSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
            );
          }
        }
      } catch (err) {
        console.error('상점 로딩 에러:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [studentCode]);

  const openBuy = (item) => {
    if (!studentCode || !studentDocId) return alert('로그인이 필요합니다.');
    setBuyTarget(item);
    setBuyQty(1);
  };

  const confirmBuy = async () => {
    if (!buyTarget) return;
    const total = buyTarget.price * buyQty;
    const curGold = student?.gold || 0;

    if (total > curGold) return alert(`골드가 부족합니다!\n필요: 🪙${total.toLocaleString()} / 보유: 🪙${curGold.toLocaleString()}`);
    if (buyTarget.quantity !== -1 && buyQty > buyTarget.quantity)
      return alert(`재고가 부족합니다! (잔여: ${buyTarget.quantity}개)`);

    setIsBuying(true);
    try {
      const batch   = writeBatch(db);
      const itemRef = doc(db, 'shopItems', buyTarget.id);
      const sRef    = doc(db, 'students', studentDocId);

      // 골드 차감
      batch.update(sRef, { gold: curGold - total });

      // 재고 감소 + 판매 수 증가
      if (buyTarget.quantity !== -1) {
        batch.update(itemRef, {
          quantity:  buyTarget.quantity - buyQty,
          soldCount: (buyTarget.soldCount || 0) + buyQty,
        });
      } else {
        batch.update(itemRef, { soldCount: (buyTarget.soldCount || 0) + buyQty });
      }

      // 구매 기록
      const pRef = doc(collection(db, 'shopPurchases'));
      batch.set(pRef, {
        studentId:   studentDocId,
        studentCode: student.studentCode,
        studentName: student.name || student.studentCode,
        itemId:   buyTarget.id,
        itemName: buyTarget.name,
        itemIcon: buyTarget.icon || '🛍️',
        price:      buyTarget.price,
        quantity:   buyQty,
        totalPrice: total,
        createdAt:  serverTimestamp(),
      });

      await batch.commit();

      // 로컬 상태 업데이트
      setStudent(prev => ({ ...prev, gold: (prev.gold || 0) - total }));
      setItems(prev => prev.map(i => {
        if (i.id !== buyTarget.id) return i;
        const newQty = i.quantity === -1 ? -1 : i.quantity - buyQty;
        return { ...i, quantity: newQty, soldCount: (i.soldCount || 0) + buyQty };
      }));
      setMyPurchases(prev => [{
        id: `t${Date.now()}`, itemName: buyTarget.name, itemIcon: buyTarget.icon || '🛍️',
        quantity: buyQty, totalPrice: total, createdAt: { seconds: Date.now() / 1000 },
      }, ...prev]);

      setBuyTarget(null);
      alert(`🎉 구매 완료!\n${buyTarget.name} ${buyQty}개 구매\n🪙 ${total.toLocaleString()} G 차감`);
    } catch (err) {
      console.error('구매 에러:', err);
      alert('구매 중 오류가 발생했습니다.');
    } finally {
      setIsBuying(false);
    }
  };

  const totalSpent = myPurchases.reduce((s, p) => s + (p.totalPrice || 0), 0);
  const shopItems  = items.filter(i => i.quantity === -1 || i.quantity > 0);
  const soldOutItems = items.filter(i => i.quantity !== -1 && i.quantity <= 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-64">
        <div className="text-slate-400 font-bold">불러오는 중...</div>
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
      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab('shop')}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
            ${tab === 'shop' ? 'bg-amber-500 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
          상점
        </button>
        <button onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
            ${tab === 'history' ? 'bg-amber-500 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
          구매 내역 ({myPurchases.length})
        </button>
      </div>

      {/* ── 상점 탭 ── */}
      {tab === 'shop' && (
        !studentCode ? (
          <div className="text-center py-20 text-slate-400">
            <div className="text-6xl mb-4">🛒</div>
            <p className="font-bold text-lg text-slate-600">로그인이 필요합니다</p>
            <p className="text-sm mt-1">교사 페이지에서 테스트 로그인하세요.</p>
          </div>
        ) : shopItems.length === 0 && soldOutItems.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <div className="text-6xl mb-4">🏪</div>
            <p className="font-bold text-lg text-slate-600">등록된 물품이 없습니다</p>
            <p className="text-sm mt-1">선생님이 물품을 등록하면 여기에 표시됩니다.</p>
          </div>
        ) : (
          <div>
            {shopItems.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 mb-6">
                {shopItems.map(item => (
                  <ShopItemCard
                    key={item.id} item={item}
                    myGold={student?.gold || 0}
                    onBuy={openBuy}
                  />
                ))}
              </div>
            )}

            {soldOutItems.length > 0 && (
              <>
                <div className="text-sm font-bold text-slate-400 mb-3">품절된 물품</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                  {soldOutItems.map(item => (
                    <ShopItemCard
                      key={item.id} item={item}
                      myGold={student?.gold || 0}
                      onBuy={openBuy}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )
      )}

      {/* ── 구매 내역 탭 ── */}
      {tab === 'history' && (
        <div className="space-y-4">
          {myPurchases.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
              <div className="text-center">
                <div className="text-xl font-extrabold text-amber-700">{myPurchases.length}건</div>
                <div className="text-[10px] text-amber-500 font-bold">총 구매</div>
              </div>
              <div className="w-px h-10 bg-amber-200" />
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
            {myPurchases.length === 0 ? (
              <div className="text-center py-14 text-slate-400">
                <div className="text-5xl mb-3">🛍️</div>
                <p className="font-bold">구매 내역이 없습니다</p>
                <p className="text-sm mt-1">마음에 드는 물품을 골드로 구매해보세요!</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {myPurchases.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{p.itemIcon || '🛍️'}</span>
                      <div>
                        <div className="font-bold text-slate-800 text-sm">{p.itemName}</div>
                        <div className="text-xs text-slate-400">{fmtDate(p.createdAt)} · {p.quantity}개</div>
                      </div>
                    </div>
                    <div className="font-extrabold text-amber-600 text-sm">
                      🪙 -{(p.totalPrice || 0).toLocaleString()} G
                    </div>
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
          item={buyTarget}
          qty={buyQty}
          onQtyChange={setBuyQty}
          myGold={student?.gold || 0}
          onConfirm={confirmBuy}
          onCancel={() => setBuyTarget(null)}
          isBusy={isBuying}
        />
      )}
    </div>
  );
}

export default ClassShop;
