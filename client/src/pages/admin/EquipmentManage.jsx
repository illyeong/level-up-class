import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { GRADE, SLOTS, STAT_LABEL } from '../../constants/equipment';
import { HELMET_SEED } from '../../data/helmetSeed';

const GRADE_KEYS = ['common','rare','epic','legendary'];

const compressImg = (file) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const MAX = 200;
    let w = img.width, h = img.height;
    if (w > MAX || h > MAX) {
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else        { w = Math.round(w * MAX / h); h = MAX; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    resolve(canvas.toDataURL('image/png'));
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
});

const EMPTY_FORM = {
  name: '', type: 'weapon', grade: 'common', active: true,
  image: '',
  stats: { attack: 0, defense: 0, hp: 0, crit: 0, attackSpeed: 0 },
};

// ── 아이템 카드 ────────────────────────────────────────────────
function ItemCard({ item, onEdit, onDelete, onToggle }) {
  const g = GRADE[item.grade] || GRADE.common;
  return (
    <div className={`rounded-2xl border-2 ${g.border} ${g.bg} overflow-hidden shadow-sm
      ${!item.active ? 'opacity-50' : ''}`}>
      {/* 이미지 */}
      <div className="aspect-square flex items-center justify-center p-3 border-b border-black/5">
        {item.image
          ? <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
          : <span className="text-4xl opacity-30">{SLOTS.find(s => s.key === item.type)?.icon || '🗡️'}</span>}
      </div>
      {/* 정보 */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="font-extrabold text-slate-800 text-xs truncate">{item.name}</div>
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${g.badge}`}>{g.label}</span>
        </div>
        <div className="text-[9px] text-slate-400 mb-2">
          {SLOTS.find(s => s.key === item.type)?.icon} {SLOTS.find(s => s.key === item.type)?.label}
        </div>
        {/* 스탯 */}
        <div className="grid grid-cols-2 gap-0.5 mb-2">
          {Object.entries(item.stats || {}).filter(([,v]) => v > 0).map(([k, v]) => (
            <div key={k} className="text-[9px] text-slate-500 flex justify-between">
              <span>{STAT_LABEL[k]?.icon}</span><span className="font-bold text-slate-700">+{v}</span>
            </div>
          ))}
        </div>
        {/* 버튼 */}
        <div className="flex gap-1">
          <button onClick={() => onToggle(item)}
            className={`flex-1 py-1 rounded-lg text-[9px] font-bold border transition-colors
              ${item.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
            {item.active ? '활성' : '비활성'}
          </button>
          <button onClick={() => onEdit(item)} className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[9px] font-bold border border-indigo-200">수정</button>
          <button onClick={() => onDelete(item.id)} className="px-2 py-1 rounded-lg bg-rose-50 text-rose-500 text-[9px] font-bold border border-rose-200">삭제</button>
        </div>
      </div>
    </div>
  );
}

// ── 폼 모달 ───────────────────────────────────────────────────
function ItemFormModal({ form, setForm, isEditing, onSave, onClose }) {
  const fileRef = useRef(null);
  const [compressing, setCompressing] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setStat = (k, v) => setForm(p => ({ ...p, stats: { ...p.stats, [k]: Number(v) || 0 } }));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-4 bg-indigo-600 text-white font-bold flex justify-between shrink-0">
          <span>{isEditing ? '✏️ 장비 수정' : '➕ 장비 추가'}</span>
          <button onClick={onClose} className="text-indigo-200 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 이미지 */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">이미지</label>
            <div className="flex items-center gap-3">
              <div className={`w-20 h-20 rounded-xl border-2 flex items-center justify-center overflow-hidden
                ${(GRADE[form.grade]||GRADE.common).border} ${(GRADE[form.grade]||GRADE.common).bg}`}>
                {form.image
                  ? <img src={form.image} alt="" className="w-full h-full object-contain" />
                  : <span className="text-3xl opacity-30">{SLOTS.find(s => s.key === form.type)?.icon || '🗡️'}</span>}
              </div>
              <div className="flex-1 space-y-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setCompressing(true);
                    const b64 = await compressImg(file);
                    set('image', b64);
                    setCompressing(false);
                    e.target.value = '';
                  }} />
                <button onClick={() => fileRef.current?.click()} disabled={compressing}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 hover:border-indigo-400 transition-colors text-slate-600 hover:text-indigo-600">
                  {compressing ? '⏳ 처리 중...' : '🖼️ 이미지 업로드'}
                </button>
                {form.image && (
                  <button onClick={() => set('image', '')} className="w-full text-xs text-rose-400 hover:text-rose-600">
                    이미지 제거
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 이름 */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">이름 *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              placeholder="예: 불꽃의 검" autoFocus />
          </div>

          {/* 타입 / 등급 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">타입 *</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                {SLOTS.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">등급 *</label>
              <select value={form.grade} onChange={e => set('grade', e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                {GRADE_KEYS.map(g => <option key={g} value={g}>{GRADE[g].label}</option>)}
              </select>
            </div>
          </div>

          {/* 등급 미리보기 */}
          <div className={`flex items-center gap-2 rounded-xl p-3 border ${(GRADE[form.grade]||GRADE.common).border} ${(GRADE[form.grade]||GRADE.common).bg}`}>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${(GRADE[form.grade]||GRADE.common).badge}`}>
              {(GRADE[form.grade]||GRADE.common).label}
            </span>
            <span className="text-xs text-slate-500">카드 색상 미리보기</span>
          </div>

          {/* 스탯 */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-2">기본 스탯</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STAT_LABEL).map(([k, meta]) => (
                <div key={k}>
                  <label className="text-[10px] text-slate-400">{meta.icon} {meta.label}</label>
                  <input type="number" min="0" value={form.stats[k] || 0}
                    onChange={e => setStat(k, e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-indigo-400 mt-0.5" />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">* ★1강화마다 모든 스탯 +5 추가</p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">취소</button>
          <button onClick={onSave} disabled={!form.name}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40">
            {isEditing ? '저장' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function EquipmentManage() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');  // all | grade | type
  const [gradeFilter, setGradeFilter] = useState('all');
  const [typeFilter, setTypeFilter]   = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);

  const fetchItems = async () => {
    const snap = await getDocs(collection(db, 'equipmentItems'));
    setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => {
        const order = { legendary: 0, epic: 1, rare: 2, common: 3 };
        return (order[a.grade]||3) - (order[b.grade]||3);
      }));
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const openCreate = () => { setEditItem(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit   = (item) => { setEditItem(item); setForm({ ...EMPTY_FORM, ...item, stats: { ...EMPTY_FORM.stats, ...(item.stats||{}) } }); setShowForm(true); };

  const save = async () => {
    if (!form.name.trim()) return;
    if (editItem) {
      await updateDoc(doc(db, 'equipmentItems', editItem.id), { ...form, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, 'equipmentItems'), { ...form, createdAt: serverTimestamp() });
    }
    setShowForm(false);
    fetchItems();
  };

  const deleteItem = async (id) => {
    if (!window.confirm('삭제할까요?')) return;
    await deleteDoc(doc(db, 'equipmentItems', id));
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const toggleActive = async (item) => {
    await updateDoc(doc(db, 'equipmentItems', item.id), { active: !item.active });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, active: !i.active } : i));
  };

  const filtered = items.filter(i => {
    if (gradeFilter !== 'all' && i.grade !== gradeFilter) return false;
    if (typeFilter  !== 'all' && i.type  !== typeFilter)  return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-5">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">⚔️ 장비 관리</h1>
            <p className="text-slate-400 text-sm mt-0.5">장비 추가 · 수정 · 삭제 및 활성화 관리</p>
          </div>
          <div className="flex gap-2">
            <button onClick={async () => {
              if (!window.confirm(`투구 장비 이미지 경로를 모두 재설정할까요?\n(기존 투구 삭제 후 재등록)`)) return;
              // 기존 투구 삭제
              const helmetItems = items.filter(i => i.type === 'helmet');
              for (const item of helmetItems) {
                await deleteDoc(doc(db, 'equipmentItems', item.id));
              }
              // 재등록
              for (const item of HELMET_SEED) {
                await addDoc(collection(db, 'equipmentItems'), { ...item, createdAt: serverTimestamp() });
              }
              alert(`✅ 투구 ${HELMET_SEED.length}개 재등록 완료!`);
              fetchItems();
            }}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors">
              🪖 투구 재등록
            </button>
            <button onClick={openCreate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors">
              ➕ 장비 추가
            </button>
          </div>
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap gap-2 mb-5">
          <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white text-xs">
            {['all',...GRADE_KEYS].map(g => (
              <button key={g} onClick={() => setGradeFilter(g)}
                className={`px-3 py-2 font-bold transition-colors
                  ${gradeFilter === g ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {g === 'all' ? '전체' : GRADE[g].label}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white text-xs">
            <button onClick={() => setTypeFilter('all')}
              className={`px-3 py-2 font-bold ${typeFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              전체
            </button>
            {SLOTS.map(s => (
              <button key={s.key} onClick={() => setTypeFilter(s.key)}
                className={`px-3 py-2 font-bold ${typeFilter === s.key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {s.icon}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400 self-center ml-1">{filtered.length}개</span>
        </div>

        {/* 아이템 그리드 */}
        {loading ? (
          <div className="text-center py-20 text-slate-400 animate-pulse">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <div className="text-5xl mb-3">⚔️</div>
            <p className="font-bold">등록된 장비가 없습니다</p>
            <p className="text-sm mt-1">위 버튼으로 장비를 추가하세요!</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {filtered.map(item => (
              <ItemCard key={item.id} item={item}
                onEdit={openEdit} onDelete={deleteItem} onToggle={toggleActive} />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <ItemFormModal form={form} setForm={setForm} isEditing={!!editItem}
          onSave={save} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}
