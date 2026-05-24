import React, { useState, useEffect } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, where, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';

const BAR_COLORS = ['bg-indigo-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500'];

export default function ClassVoteManage({ selectedClass }) {
  const teacherUid = selectedClass?.teacherUid || auth.currentUser?.uid;

  const [votes, setVotes]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState('active');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle]         = useState('');
  const [options, setOptions]     = useState(['', '']);
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast]         = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!teacherUid) return;
    const q = query(collection(db, 'classVotes'), where('teacherUid', '==', teacherUid));
    const unsub = onSnapshot(q, snap => {
      setVotes(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
      setLoading(false);
    });
    return unsub;
  }, [teacherUid]);

  const createVote = async () => {
    const validOpts = options.filter(o => o.trim());
    if (!title.trim() || validOpts.length < 2) return;
    setIsCreating(true);
    await addDoc(collection(db, 'classVotes'), {
      title:      title.trim(),
      options:    validOpts.map(text => ({ text, voterIds: [] })),
      teacherUid,
      active:     true,
      createdAt:  serverTimestamp(),
    });
    setTitle(''); setOptions(['', '']); setShowCreate(false);
    showToast('투표가 생성되었습니다');
    setIsCreating(false);
    setTab('active');
  };

  const toggleActive = async (vote) => {
    await updateDoc(doc(db, 'classVotes', vote.id), { active: !vote.active });
    showToast(vote.active ? '투표를 종료했습니다' : '투표를 재개했습니다');
  };

  const resetVote = async (vote) => {
    const reset = vote.options.map(o => ({ ...o, voterIds: [] }));
    await updateDoc(doc(db, 'classVotes', vote.id), { options: reset });
    showToast('투표 결과가 초기화되었습니다');
  };

  const deleteVote = async (id) => {
    await deleteDoc(doc(db, 'classVotes', id));
    showToast('삭제되었습니다');
  };

  const getTotal   = (vote) => vote.options?.reduce((s, o) => s + (o.voterIds?.length || 0), 0) || 0;
  const filtered   = votes.filter(v => tab === 'active' ? v.active : !v.active);
  const activeCount = votes.filter(v => v.active).length;
  const endedCount  = votes.filter(v => !v.active).length;

  return (
    <div className="max-w-2xl mx-auto p-6">
      {toast && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-white font-bold shadow-lg z-50 text-sm
          ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-800">📊 학급 투표 관리</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors"
        >+ 투표 만들기</button>
      </div>

      {/* 생성 모달 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-7 w-full max-w-md shadow-2xl space-y-4 mx-4">
            <h2 className="font-extrabold text-xl text-slate-800">새 투표 만들기</h2>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="투표 제목을 입력하세요" maxLength={80}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-sm font-bold text-slate-400 w-5 shrink-0">{i + 1}</span>
                  <input
                    value={opt} onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
                    placeholder={`선택지 ${i + 1}`} maxLength={50}
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  {options.length > 2 && (
                    <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600 font-bold shrink-0">✕</button>
                  )}
                </div>
              ))}
              {options.length < 4 && (
                <button
                  onClick={() => setOptions([...options, ''])}
                  className="text-sm text-indigo-500 hover:text-indigo-700 font-bold pl-7"
                >+ 선택지 추가</button>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowCreate(false); setTitle(''); setOptions(['', '']); }}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
              >취소</button>
              <button
                onClick={createVote}
                disabled={!title.trim() || options.filter(o => o.trim()).length < 2 || isCreating}
                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50 hover:bg-indigo-500 transition-colors"
              >{isCreating ? '생성 중...' : '투표 만들기'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-2 mb-5">
        {[['active', `진행 중 (${activeCount})`], ['ended', `종료됨 (${endedCount})`]].map(([v, l]) => (
          <button
            key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${tab === v ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'}`}
          >{l}</button>
        ))}
      </div>

      {/* 투표 목록 */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <div className="text-4xl mb-3">📭</div>
          <div className="font-bold">{tab === 'active' ? '진행 중인 투표가 없습니다' : '종료된 투표가 없습니다'}</div>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(vote => {
            const total = getTotal(vote);
            return (
              <div key={vote.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <h3 className="font-extrabold text-slate-800">{vote.title}</h3>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => resetVote(vote)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                    >초기화</button>
                    <button
                      onClick={() => toggleActive(vote)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors
                        ${vote.active ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'}`}
                    >{vote.active ? '종료' : '재개'}</button>
                    <button
                      onClick={() => deleteVote(vote.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-500 transition-colors"
                    >삭제</button>
                  </div>
                </div>

                <div className="space-y-2">
                  {vote.options?.map((opt, i) => {
                    const count = opt.voterIds?.length || 0;
                    const pct   = total > 0 ? Math.round(count / total * 100) : 0;
                    return (
                      <div key={i} className="relative overflow-hidden rounded-xl bg-slate-50 px-4 py-2.5">
                        <div
                          className={`absolute inset-y-0 left-0 ${BAR_COLORS[i % BAR_COLORS.length]} opacity-[0.15] transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative flex justify-between items-center">
                          <span className="text-sm font-medium text-slate-700">{opt.text}</span>
                          <span className="text-sm font-extrabold text-slate-600">{pct}% ({count}명)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-xs text-slate-400 text-right">총 {total}명 참여</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
