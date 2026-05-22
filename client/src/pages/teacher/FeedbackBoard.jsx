import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

const STATUS_LABEL = {
  new:  { text: '답변 대기 중', cls: 'bg-amber-100 text-amber-700' },
  read: { text: '확인 중',     cls: 'bg-blue-100 text-blue-700' },
  done: { text: '처리 완료',   cls: 'bg-emerald-100 text-emerald-700' },
};

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date();
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function FeedbackBoard({ selectedClass }) {
  const [feedbacks, setFeedbacks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWrite, setShowWrite] = useState(false);
  const [content, setContent]     = useState('');
  const [isSaving, setIsSaving]   = useState(false);

  const teacherUid = selectedClass?.teacherUid;

  const fetchFeedbacks = async () => {
    if (!teacherUid) { setIsLoading(false); return; }
    try {
      const snap = await getDocs(
        query(collection(db, 'feedbacks'), where('teacherUid', '==', teacherUid), orderBy('createdAt', 'desc'))
      );
      setFeedbacks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchFeedbacks(); }, [teacherUid]);

  const submit = async () => {
    if (!content.trim() || !teacherUid) return;
    setIsSaving(true);
    try {
      const newFb = {
        teacherUid,
        teacherEmail: selectedClass?.teacherEmail || '',
        message:      content.trim(),
        status:       'new',
        createdAt:    serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'feedbacks'), newFb);
      setFeedbacks(prev => [{ id: ref.id, ...newFb, createdAt: { toDate: () => new Date() } }, ...prev]);
      setContent('');
      setShowWrite(false);
    } catch (e) { alert('전송 실패'); }
    finally { setIsSaving(false); }
  };

  const newCount = feedbacks.filter(f => f.status === 'new').length;
  const doneCount = feedbacks.filter(f => f.status === 'done').length;

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-3xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">💬 건의 및 문의하기</h1>
            <p className="text-slate-500 text-sm mt-0.5">버그 신고, 기능 요청, 개선 사항을 남겨주세요. 관리자가 확인합니다.</p>
          </div>
          <button onClick={() => setShowWrite(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors">
            + 새 문의
          </button>
        </div>

        {/* 통계 */}
        {feedbacks.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center">
              <div className="text-2xl font-extrabold text-slate-700">{feedbacks.length}</div>
              <div className="text-xs text-slate-400 mt-0.5">전체 문의</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center">
              <div className="text-2xl font-extrabold text-amber-600">{newCount}</div>
              <div className="text-xs text-slate-400 mt-0.5">답변 대기</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center">
              <div className="text-2xl font-extrabold text-emerald-600">{doneCount}</div>
              <div className="text-xs text-slate-400 mt-0.5">처리 완료</div>
            </div>
          </div>
        )}

        {/* 글쓰기 폼 */}
        {showWrite && (
          <div className="bg-white rounded-2xl border-2 border-indigo-200 p-5 mb-5 space-y-3">
            <h3 className="font-extrabold text-slate-800 text-sm">✏️ 새 문의 작성</h3>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder="문의 내용을 자세히 입력해주세요..."
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm resize-none h-32 focus:outline-none focus:border-indigo-500" autoFocus />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowWrite(false); setContent(''); }}
                className="px-4 py-2 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">취소</button>
              <button onClick={submit} disabled={isSaving || !content.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm disabled:opacity-40">
                {isSaving ? '전송 중...' : '전송하기'}
              </button>
            </div>
          </div>
        )}

        {/* 목록 */}
        {isLoading ? (
          <div className="text-center py-20 text-slate-400 font-bold animate-pulse">불러오는 중...</div>
        ) : feedbacks.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <div className="text-5xl mb-4">💬</div>
            <p className="font-bold text-slate-600">아직 문의 내역이 없습니다</p>
            <p className="text-sm mt-1">버그나 개선 사항을 자유롭게 남겨주세요!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feedbacks.map((f, i) => {
              const st = STATUS_LABEL[f.status] || STATUS_LABEL.new;
              return (
                <div key={f.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-xs font-mono">#{feedbacks.length - i}</span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.cls}`}>{st.text}</span>
                    </div>
                    <span className="text-xs text-slate-400">{fmtDate(f.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{f.message}</p>
                  {f.status === 'done' && (
                    <div className="mt-3 pt-3 border-t border-emerald-100 flex items-center gap-2">
                      <span className="text-emerald-500 text-sm">✅</span>
                      <span className="text-xs text-emerald-600 font-bold">관리자가 처리 완료했습니다.</span>
                    </div>
                  )}
                  {f.status === 'read' && (
                    <div className="mt-3 pt-3 border-t border-blue-100 flex items-center gap-2">
                      <span className="text-blue-400 text-sm">👀</span>
                      <span className="text-xs text-blue-500 font-bold">관리자가 확인 중입니다.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
