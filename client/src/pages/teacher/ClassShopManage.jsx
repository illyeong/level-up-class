import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, setDoc, getDoc, serverTimestamp, query, orderBy, limit,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';

const ICONS = [
  '🎁','🎀','🏆','🥇','🥈','🥉','🎖️','🎗️',
  '📚','📖','✏️','🖊️','📝','🎨','🖍️','📐',
  '🍭','🍬','🍫','🧋','🍦','🍕','🍩','🎂',
  '🎮','🎲','🎯','🎳','🎸','🎵','🎶','🎤',
  '⭐','🌟','💫','✨','🌈','🦋','🌸','🌺',
  '🛍️','💝','💖','💗','💓','💞','💕','❤️',
  '🔮','🧸','🎠','🎡','🎢','🎪','🎭','🎬',
  '🃏','🎴','📱','💻','⌚','📷','🎧','🎙️',
  '🏅','🎫','🎟️','🪄','🎩','👑','🦄','🐉',
  '🌙','☀️','🌊','🔥','⚡','🌸','🍀','🌻',
];

const DEFAULT_FORM = {
  name: '', price: '', description: '',
  icon: '🎁', quantity: '', unlimited: false, active: true,
};

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ─────────────────────── 아이콘 피커 ─────────────────────────
function IconPicker({ selected, onSelect }) {
  return (
    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 mt-2">
      <div className="grid grid-cols-10 gap-1">
        {ICONS.map(ic => (
          <button
            key={ic}
            onClick={() => onSelect(ic)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-xl hover:bg-amber-100 transition-colors
              ${selected === ic ? 'bg-amber-200 ring-2 ring-amber-400' : ''}`}>
            {ic}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────── 물품 카드 ────────────────────────────
function ItemCard({ item, onEdit, onDelete, onToggle }) {
  const stockLabel = item.quantity === -1 ? '무제한'
    : item.quantity <= 0 ? '품절'
    : `잔여 ${item.quantity}개`;
  const stockCls = item.quantity === -1 ? 'bg-emerald-100 text-emerald-700'
    : item.quantity <= 0 ? 'bg-rose-100 text-rose-600'
    : item.quantity <= 5 ? 'bg-amber-100 text-amber-700'
    : 'bg-slate-100 text-slate-600';

  return (
    <div className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden transition-all
      ${item.active ? 'border-slate-200 hover:shadow-md' : 'border-slate-100 opacity-55'}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-3xl border border-amber-100 shrink-0">
              {item.icon || '🛍️'}
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-800 text-sm leading-tight truncate">{item.name}</h3>
              {item.description && (
                <p className="text-xs text-slate-400 mt-0.5 truncate">{item.description}</p>
              )}
            </div>
          </div>
          {/* 활성화 토글 */}
          <button
            onClick={onToggle}
            className={`shrink-0 w-10 h-5 rounded-full transition-colors relative
              ${item.active ? 'bg-indigo-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all
              ${item.active ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between mb-2">
          <span className="font-extrabold text-amber-600 text-sm">🪙 {item.price.toLocaleString()} G</span>
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${stockCls}`}>
            {stockLabel}
          </span>
        </div>
        <div className="text-[11px] text-slate-400 mb-4">
          판매 완료: {(item.soldCount || 0).toLocaleString()}개
        </div>
      </div>

      <div className="px-4 pb-4 flex gap-1.5">
        <button onClick={onEdit}
          className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-xs transition-colors">
          수정
        </button>
        <button onClick={onDelete}
          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-lg font-bold text-xs border border-rose-200 transition-colors">
          삭제
        </button>
      </div>
    </div>
  );
}

// ─────────────────────── 물품 폼 모달 ────────────────────────
function ItemFormModal({ form, setForm, isEditing, onSubmit, onClose }) {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-5 bg-indigo-600 text-white font-bold text-lg flex justify-between items-center shrink-0">
          <span>{isEditing ? '✏️ 물품 수정' : '🛍️ 물품 등록'}</span>
          <button onClick={onClose} className="text-indigo-200 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 아이콘 */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">아이콘 (선택)</label>
            <div className="flex items-center gap-3">
              <div
                onClick={() => setIconPickerOpen(p => !p)}
                className="w-14 h-14 bg-amber-50 rounded-xl flex items-center justify-center text-3xl border-2 border-amber-200 cursor-pointer hover:border-amber-400 transition-colors">
                {form.icon}
              </div>
              <button
                onClick={() => setIconPickerOpen(p => !p)}
                className="text-xs text-indigo-600 font-bold hover:text-indigo-800">
                {iconPickerOpen ? '닫기 ✕' : '아이콘 선택 →'}
              </button>
            </div>
            {iconPickerOpen && (
              <IconPicker
                selected={form.icon}
                onSelect={ic => { set('icon', ic); setIconPickerOpen(false); }}
              />
            )}
          </div>

          {/* 이름 */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">물품 이름 *</label>
            <input
              value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="예: 자리 바꾸기 쿠폰, 숙제 면제권 ..."
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* 설명 */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">설명 (선택)</label>
            <textarea
              value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="물품에 대한 설명을 입력해주세요"
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-none h-14"
            />
          </div>

          {/* 가격 */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">가격 (골드) *</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500 font-bold text-base">🪙</span>
              <input
                type="number" min="1" value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="100"
                className="w-full border-2 border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* 수량 */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">수량 *</label>
            <button
              onClick={() => set('unlimited', !form.unlimited)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-xs font-bold transition-colors mb-2
                ${form.unlimited ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-400'}`}>
              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center
                ${form.unlimited ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                {form.unlimited && <span className="w-2 h-2 bg-white rounded-full" />}
              </span>
              무제한 수량
            </button>
            {!form.unlimited && (
              <input
                type="number" min="1" value={form.quantity}
                onChange={e => set('quantity', e.target.value)}
                placeholder="재고 수량 입력"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-indigo-500"
              />
            )}
          </div>

          {/* 활성화 */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <div className="text-sm font-bold text-slate-700">즉시 활성화</div>
              <div className="text-xs text-slate-500">학생에게 바로 공개됩니다</div>
            </div>
            <button
              onClick={() => set('active', !form.active)}
              className={`w-12 h-6 rounded-full transition-colors relative ${form.active ? 'bg-indigo-500' : 'bg-slate-300'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.active ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
            취소
          </button>
          <button onClick={onSubmit}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm">
            {isEditing ? '수정 완료' : '등록하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function ClassShopManage({ selectedClass }) {
  const [items, setItems]         = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [usages, setUsages]       = useState([]);

  // 이용권 가격
  const [ticketPrices, setTicketPrices]   = useState({ dungeon: 200, bossRaid: 200, arena: 200 });
  const [isSavingTicket, setIsSavingTicket] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab]             = useState('items');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [form, setForm]         = useState(DEFAULT_FORM);
  const [toast, setToast]         = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const classId = selectedClass?.id || null;
  const teacherUid = selectedClass?.teacherUid || null;
  const scopeKey = classId || teacherUid || null;
  const isTeacherWideScope = !classId && !!teacherUid;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (message, onConfirm) => setConfirmState({ message, onConfirm });

  const saveTicketPrices = async () => {
    if (!scopeKey) return;
    setIsSavingTicket(true);
    try {
      await setDoc(doc(db, 'ticketShopSettings', scopeKey), {
        ...ticketPrices,
        classId,
        teacherUid,
        scopeKey,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast('이용권 가격이 저장되었습니다.');
    } catch (err) {
      console.error(err);
      showToast('저장 실패', 'error');
    } finally {
      setIsSavingTicket(false);
    }
  };

  const fetchItems = async () => {
    if (!scopeKey) {
      setItems([]);
      return;
    }
    const snap = await getDocs(query(collection(db, 'shopItems'), where('scopeKey', '==', scopeKey)));
    let merged = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (isTeacherWideScope) {
      const teacherSnap = await getDocs(query(collection(db, 'shopItems'), where('teacherUid', '==', teacherUid)));
      const byId = new Map(merged.map((d) => [d.id, d]));
      teacherSnap.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }));
      merged = Array.from(byId.values());
    }
    setItems(
      merged
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    );
  };

  const fetchPurchases = async () => {
    if (!scopeKey) {
      setPurchases([]);
      return;
    }
    if (isTeacherWideScope) {
      const teacherSnap = await getDocs(
        query(collection(db, 'shopPurchases'), where('teacherUid', '==', teacherUid))
      );
      setPurchases(
        teacherSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
      return;
    }
    try {
      const snap = await getDocs(
        query(
          collection(db, 'shopPurchases'),
          where('scopeKey', '==', scopeKey),
          orderBy('createdAt', 'desc'),
          limit(100)
        )
      );
      setPurchases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      const snap = await getDocs(query(collection(db, 'shopPurchases'), where('scopeKey', '==', scopeKey)));
      setPurchases(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    }
  };

  const fetchUsages = async () => {
    if (!scopeKey) {
      setUsages([]);
      return;
    }
    const snap = isTeacherWideScope
      ? await getDocs(query(collection(db, 'shopUsages'), where('teacherUid', '==', teacherUid)))
      : await getDocs(query(collection(db, 'shopUsages'), where('scopeKey', '==', scopeKey)));
    setUsages(
      snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.usedAt?.seconds || 0) - (a.usedAt?.seconds || 0))
    );
  };

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setTicketPrices({ dungeon: 200, bossRaid: 200, arena: 200 });
      if (!scopeKey) {
        setItems([]);
        setPurchases([]);
        setUsages([]);
        setIsLoading(false);
        return;
      }
      // 이용권 가격 로드
      const tSnap = await getDoc(doc(db, 'ticketShopSettings', scopeKey));
      if (tSnap.exists()) {
        setTicketPrices(prev => ({ ...prev, ...tSnap.data() }));
      } else if (isTeacherWideScope) {
        const teacherTicketSnap = await getDocs(
          query(collection(db, 'ticketShopSettings'), where('teacherUid', '==', teacherUid))
        );
        if (!teacherTicketSnap.empty) {
          setTicketPrices(prev => ({ ...prev, ...teacherTicketSnap.docs[0].data() }));
        }
      }
      await Promise.all([fetchItems(), fetchPurchases(), fetchUsages()]);
      setIsLoading(false);
    })();
  }, [scopeKey, isTeacherWideScope, teacherUid]);

  const openCreate = () => { setEditingId(null); setForm(DEFAULT_FORM); setIsFormOpen(true); };
  const openEdit   = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name, price: String(item.price),
      description: item.description || '', icon: item.icon || '🎁',
      quantity: item.quantity === -1 ? '' : String(item.quantity),
      unlimited: item.quantity === -1, active: item.active,
    });
    setIsFormOpen(true);
  };

  const submitForm = async () => {
    if (!form.name.trim())             return showToast('물품 이름을 입력해주세요.', 'error');
    if (!form.price || form.price <= 0) return showToast('가격을 입력해주세요.', 'error');
    if (!form.unlimited && (!form.quantity || Number(form.quantity) <= 0))
      return showToast('수량을 입력하거나 무제한을 선택해주세요.', 'error');

    const data = {
      name:        form.name.trim(),
      price:       Number(form.price),
      description: form.description.trim(),
      icon:        form.icon,
      quantity:    form.unlimited ? -1 : Number(form.quantity),
      active:      form.active,
      classId,
      teacherUid,
      scopeKey,
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'shopItems', editingId), { ...data, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'shopItems'), { ...data, soldCount: 0, createdAt: serverTimestamp() });
      }
      setIsFormOpen(false);
      fetchItems();
    } catch (err) {
      console.error(err);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  };

  const toggleActive = async (item) => {
    await updateDoc(doc(db, 'shopItems', item.id), { active: !item.active });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, active: !i.active } : i));
  };

  const deleteItem = (id) => {
    showConfirm('이 물품을 삭제할까요?', async () => {
      await deleteDoc(doc(db, 'shopItems', id));
      setItems(prev => prev.filter(i => i.id !== id));
    });
  };

  const totalRevenue = purchases.reduce((s, p) => s + (p.totalPrice || 0), 0);

  if (!scopeKey) {
    return (
      <div className="min-h-screen bg-slate-100 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 text-slate-600 text-sm">
            학급을 먼저 선택해 주세요.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">🛒 학급 상점 관리</h1>
            <p className="text-slate-500 text-sm mt-0.5">학생들이 골드로 구매할 수 있는 물품을 등록합니다.</p>
          </div>
          <button onClick={openCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors">
            + 물품 등록
          </button>
        </div>

        {/* 이용권 가격 설정 */}
        <div className="bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-700 mb-6">
          <h2 className="font-extrabold text-white text-sm mb-1">🎫 어드벤처 이용권 가격 설정</h2>
          <p className="text-slate-400 text-xs mb-4">학생이 다이아로 구매하는 이용권 가격입니다 (기본값: 💎200)</p>
          <div className="grid grid-cols-3 gap-4 mb-4">
            {[
              { key: 'dungeon',  icon: '🗡️', label: '던전',    max: 3 },
              { key: 'bossRaid', icon: '👹', label: '퀴즈레이드', max: 3 },
              { key: 'arena',    icon: '🏟️', label: '투기장',   max: 5 },
            ].map(({ key, icon, label, max }) => (
              <div key={key} className="bg-slate-800 rounded-xl p-3">
                <div className="text-white font-bold text-xs mb-2">{icon} {label} (최대 {max}개)</div>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-300 text-sm">💎</span>
                  <input
                    type="number" min="0"
                    value={ticketPrices[key]}
                    onChange={e => setTicketPrices(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white font-bold text-sm text-center focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            ))}
          </div>
          <button onClick={saveTicketPrices} disabled={isSavingTicket}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50">
            {isSavingTicket ? '저장 중...' : '💾 가격 저장'}
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-5">
          <button onClick={() => setTab('items')}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${tab === 'items' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
            물품 목록 ({items.length})
          </button>
          <button onClick={() => setTab('purchases')}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${tab === 'purchases' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
            구매 내역 ({purchases.length})
          </button>
          <button onClick={() => setTab('usages')}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${tab === 'usages' ? 'bg-violet-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
            사용 내역 ({usages.length})
          </button>
        </div>

        {/* 물품 목록 */}
        {tab === 'items' && (
          isLoading ? (
            <div className="flex items-center justify-center gap-2.5 py-16">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm text-slate-400 font-medium">불러오는 중...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-5xl mb-3">🛍️</div>
              <p className="font-bold text-lg text-slate-600">등록된 물품이 없습니다</p>
              <p className="text-sm mt-1">물품을 등록하면 학생들이 골드로 구매할 수 있어요!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map(item => (
                <ItemCard
                  key={item.id} item={item}
                  onEdit={() => openEdit(item)}
                  onDelete={() => deleteItem(item.id)}
                  onToggle={() => toggleActive(item)}
                />
              ))}
            </div>
          )
        )}

        {/* 구매 내역 */}
        {tab === 'purchases' && (
          <div className="space-y-4">
            {/* 합계 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4 shadow-sm">
              <div className="text-center bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
                <div className="text-2xl font-extrabold text-amber-600">{purchases.length}</div>
                <div className="text-xs text-amber-500 font-bold mt-0.5">총 판매 건수</div>
              </div>
              <div className="text-center bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
                <div className="text-2xl font-extrabold text-amber-600">🪙 {totalRevenue.toLocaleString()}</div>
                <div className="text-xs text-amber-500 font-bold mt-0.5">총 수령 골드</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
                <h3 className="font-bold text-slate-700 text-sm">전체 구매 내역</h3>
              </div>
              {purchases.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <div className="text-4xl mb-2">📋</div>
                  <p className="font-bold">구매 내역이 없습니다</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-100">
                        <th className="px-5 py-3 font-semibold">학생</th>
                        <th className="px-5 py-3 font-semibold">물품</th>
                        <th className="px-5 py-3 font-semibold text-center">수량</th>
                        <th className="px-5 py-3 font-semibold">결제 금액</th>
                        <th className="px-5 py-3 font-semibold">일시</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {purchases.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-bold text-slate-800 text-sm">{p.studentName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{p.studentCode}</div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{p.itemIcon || '🛍️'}</span>
                              <span className="font-bold text-sm text-slate-700">{p.itemName}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-center font-bold text-slate-600 text-sm">{p.quantity}개</td>
                          <td className="px-5 py-3 font-extrabold text-amber-600 text-sm">
                            🪙 {(p.totalPrice || 0).toLocaleString()} G
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-400">{fmtDate(p.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 사용 내역 탭 */}
        {tab === 'usages' && (
          <div className="space-y-4">
            {usages.length > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-center gap-4">
                <div className="text-center">
                  <div className="text-xl font-extrabold text-violet-700">{usages.length}건</div>
                  <div className="text-[10px] text-violet-500 font-bold">총 사용</div>
                </div>
              </div>
            )}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
                <h3 className="font-bold text-slate-700 text-sm">전체 사용 내역</h3>
              </div>
              {usages.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <div className="text-4xl mb-2">📋</div>
                  <p className="font-bold">사용 내역이 없습니다</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-100">
                        <th className="px-5 py-3 font-semibold">학생</th>
                        <th className="px-5 py-3 font-semibold">물품</th>
                        <th className="px-5 py-3 font-semibold text-center">수량</th>
                        <th className="px-5 py-3 font-semibold">사용 일시</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {usages.map(u => (
                        <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-bold text-slate-800 text-sm">{u.studentName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{u.studentCode}</div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{u.itemIcon || '🛍️'}</span>
                              <span className="font-bold text-sm text-slate-700">{u.itemName}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-center font-bold text-violet-600 text-sm">{u.quantity}개</td>
                          <td className="px-5 py-3 text-xs text-slate-400">{fmtDate(u.usedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {isFormOpen && (
          <ItemFormModal
            form={form} setForm={setForm}
            isEditing={!!editingId}
            onSubmit={submitForm}
            onClose={() => setIsFormOpen(false)}
          />
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.message}
        </div>
      )}
      {confirmState && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setConfirmState(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <p className="text-slate-700 font-bold text-sm mb-5 leading-relaxed whitespace-pre-line">{confirmState.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmState(null)}
                className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-50">취소</button>
              <button onClick={() => { confirmState.onConfirm(); setConfirmState(null); }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClassShopManage;
