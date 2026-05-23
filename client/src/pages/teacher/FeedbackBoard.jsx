import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

/* ─── 상수 ─────────────────────────────────────────────── */
const STATUS_LABEL = {
  new:  { text: '답변 대기', cls: 'bg-amber-100 text-amber-700 border border-amber-200' },
  read: { text: '확인 중',   cls: 'bg-blue-100 text-blue-700 border border-blue-200' },
  done: { text: '답변 완료', cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
};

const CATEGORY = {
  bug:         { label: '버그 신고',  color: 'rose',   dot: 'bg-rose-500',   border: 'border-l-rose-500',   badge: 'bg-rose-100 text-rose-700 border border-rose-200' },
  feature:     { label: '기능 요청',  color: 'violet', dot: 'bg-violet-500', border: 'border-l-violet-500', badge: 'bg-violet-100 text-violet-700 border border-violet-200' },
  improvement: { label: '개선 제안',  color: 'amber',  dot: 'bg-amber-500',  border: 'border-l-amber-500',  badge: 'bg-amber-100 text-amber-700 border border-amber-200' },
  other:       { label: '기타',       color: 'slate',  dot: 'bg-slate-400',  border: 'border-l-slate-400',  badge: 'bg-slate-100 text-slate-600 border border-slate-200' },
};

const FILTER_TABS = [
  { key: 'all',  label: '전체' },
  { key: 'new',  label: '대기중' },
  { key: 'read', label: '확인중' },
  { key: 'done', label: '완료' },
];

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/* ─── 컴포넌트 ─────────────────────────────────────────── */
export default function FeedbackBoard({ selectedClass }) {
  const [feedbacks, setFeedbacks]   = useState([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [showWrite, setShowWrite]   = useState(false);
  const [content, setContent]       = useState('');
  const [category, setCategory]     = useState('bug');
  const [isSaving, setIsSaving]     = useState(false);
  const [filterTab, setFilterTab]   = useState('all');

  const teacherUid = selectedClass?.teacherUid;

  /* ── 불러오기 ── */
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

  /* ── 제출 ── */
  const submit = async () => {
    if (!content.trim() || !teacherUid) return;
    setIsSaving(true);
    try {
      const newFb = {
        teacherUid,
        teacherEmail: selectedClass?.teacherEmail || '',
        message:      content.trim(),
        category,
        status:       'new',
        createdAt:    serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'feedbacks'), newFb);
      setFeedbacks(prev => [{ id: ref.id, ...newFb, createdAt: { toDate: () => new Date() } }, ...prev]);
      setContent('');
      setCategory('bug');
      setShowWrite(false);
    } catch (e) { alert('전송 실패'); }
    finally { setIsSaving(false); }
  };

  /* ── 통계 ── */
  const totalCount = feedbacks.length;
  const waitCount  = feedbacks.filter(f => f.status === 'new').length;
  const doneCount  = feedbacks.filter(f => f.status === 'done').length;

  /* ── 필터 ── */
  const visible = filterTab === 'all' ? feedbacks : feedbacks.filter(f => f.status === filterTab);

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* ── 헤더 ── */}
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-6 shadow-lg text-white">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">💬 건의 및 문의하기</h1>
              <p className="text-indigo-200 text-sm mt-1">버그 신고, 기능 요청, 개선 사항을 남겨주세요. 관리자가 확인합니다.</p>
            </div>
            <button
              onClick={() => setShowWrite(true)}
              className="shrink-0 bg-white/20 hover:bg-white/30 border border-white/30 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-colors backdrop-blur-sm"
            >
              + 새 문의
            </button>
          </div>

          {/* 통계 3칸 */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="bg-white/15 rounded-xl p-3 text-center backdrop-blur-sm">
              <div className="text-2xl font-extrabold">{totalCount}</div>
              <div className="text-xs text-indigo-200 mt-0.5">전체 문의</div>
            </div>
            <div className="bg-white/15 rounded-xl p-3 text-center backdrop-blur-sm">
              <div className="text-2xl font-extrabold text-amber-300">{waitCount}</div>
              <div className="text-xs text-indigo-200 mt-0.5">답변 대기</div>
            </div>
            <div className="bg-white/15 rounded-xl p-3 text-center backdrop-blur-sm">
              <div className="text-2xl font-extrabold text-emerald-300">{doneCount}</div>
              <div className="text-xs text-indigo-200 mt-0.5">답변 완료</div>
            </div>
          </div>
        </div>

        {/* ── 글쓰기 폼 ── */}
        {showWrite && (
          <div className="bg-white rounded-2xl border-2 border-indigo-300 p-5 shadow-sm space-y-4">
            <h3 className="font-extrabold text-slate-800 text-sm">✏️ 새 문의 작성</h3>

            {/* 카테고리 선택 */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORY).map(([key, cat]) => (
                <button
                  key={key}
                  onClick={() => setCategory(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
                    category === key
                      ? cat.badge + ' border-current scale-105 shadow-sm'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${cat.dot}`} />
                  {cat.label}
                </button>
              ))}
            </div>

            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="문의 내용을 자세히 입력해주세요..."
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm resize-none h-32 focus:outline-none focus:border-indigo-400 transition-colors"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowWrite(false); setContent(''); setCategory('bug'); }}
                className="px-4 py-2 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:border-slate-300 transition-colors"
              >
                취소
              </button>
              <button
                onClick={submit}
                disabled={isSaving || !content.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm disabled:opacity-40 transition-colors"
              >
                {isSaving ? '전송 중...' : '전송하기'}
              </button>
            </div>
          </div>
        )}

        {/* ── 필터 탭 ── */}
        {!isLoading && feedbacks.length > 0 && (
          <div className="flex gap-1 bg-white rounded-2xl p-1.5 shadow-sm border border-slate-200">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                  filterTab === tab.key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {tab.label}
                {tab.key !== 'all' && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-mono ${
                    filterTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {feedbacks.filter(f => f.status === tab.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── 목록 ── */}
        {isLoading ? (
          <div className="text-center py-20 text-slate-400 font-bold animate-pulse">불러오는 중...</div>
        ) : feedbacks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center shadow-sm">
            <div className="text-6xl mb-4">💬</div>
            <p className="font-extrabold text-slate-700 text-lg">아직 문의 내역이 없어요</p>
            <p className="text-sm text-slate-400 mt-1 mb-6">버그나 개선 사항을 자유롭게 남겨주세요!</p>
            <button
              onClick={() => setShowWrite(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-sm"
            >
              첫 문의 남기기
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center shadow-sm">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-slate-500 font-bold">해당 상태의 문의가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((f, i) => {
              const st   = STATUS_LABEL[f.status] || STATUS_LABEL.new;
              const cat  = CATEGORY[f.category]   || CATEGORY.other;
              const num  = feedbacks.indexOf(f);
              return (
                <div
                  key={f.id}
                  className={`bg-white rounded-2xl border border-slate-200 border-l-4 ${cat.border} p-5 shadow-sm hover:shadow-md transition-shadow`}
                >
                  {/* 상단 메타 */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-400 text-xs font-mono">#{feedbacks.length - num}</span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cat.badge}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${cat.dot} mr-1`} />
                        {cat.label}
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.cls}`}>{st.text}</span>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{fmtDate(f.createdAt)}</span>
                  </div>

                  {/* 본문 */}
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{f.message}</p>

                  {/* 관리자 답변 */}
                  {f.reply && (
                    <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-blue-500 text-sm">💬</span>
                        <span className="text-xs font-extrabold text-blue-700">관리자 답변</span>
                        {f.repliedAt && (
                          <span className="text-xs text-blue-400 ml-auto">{fmtDate(f.repliedAt)}</span>
                        )}
                      </div>
                      <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-wrap">{f.reply}</p>
                    </div>
                  )}

                  {/* 답변 없는 상태 표시 */}
                  {!f.reply && f.status === 'read' && (
                    <div className="mt-3 pt-3 border-t border-blue-100 flex items-center gap-2">
                      <span className="text-blue-400 text-sm">👀</span>
                      <span className="text-xs text-blue-500 font-bold">관리자가 확인 중입니다.</span>
                    </div>
                  )}
                  {!f.reply && f.status === 'done' && (
                    <div className="mt-3 pt-3 border-t border-emerald-100 flex items-center gap-2">
                      <span className="text-emerald-500 text-sm">✅</span>
                      <span className="text-xs text-emerald-600 font-bold">관리자가 처리 완료했습니다.</span>
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
