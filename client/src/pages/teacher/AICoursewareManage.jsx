import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  collection as col, getDocs as gDocs, where as wh,
} from 'firebase/firestore';

// UnitSelector 재사용 (QuizBank에서 동일 컴포넌트 사용 중이지만 여기선 인라인)
const SUBJECTS = ['수학'];
const DIFF_OPTIONS = [
  { value: 'easy', label: '🟢 쉬움' },
  { value: 'normal', label: '🟡 보통' },
  { value: 'hard', label: '🔴 어려움' },
];

const STATUS_MAP = {
  draft:     { label: '초안',   cls: 'bg-slate-100 text-slate-600' },
  published: { label: '발행됨', cls: 'bg-emerald-100 text-emerald-700' },
  closed:    { label: '종료됨', cls: 'bg-rose-100 text-rose-600' },
};

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

export default function AICoursewareManage({ selectedClass }) {
  const teacherUid = selectedClass?.teacherUid;
  const classId    = selectedClass?.id || null;

  const [tab, setTab] = useState('create'); // 'create' | 'list' | 'progress' | 'analysis'
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // ── 생성 탭 상태 ──────────────────────────────────────────────
  const [grade, setGrade]         = useState('');
  const [semester, setSemester]   = useState('');
  const [publisher, setPublisher] = useState('');
  const [units, setUnits]         = useState([]);
  const [unitId, setUnitId]       = useState('');
  const [lessons, setLessons]     = useState([]);
  const [lessonNo, setLessonNo]   = useState('');
  const [difficulty, setDiff]     = useState('normal');
  const [qCount, setQCount]       = useState(4);
  const [reward, setReward]       = useState({ exp: 50, gold: 30, diamonds: 0 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError]   = useState('');

  // 생성 결과
  const [draft, setDraft]         = useState(null); // { title, conceptCards, commonMistakes, questions, ... }
  const [isSaving, setIsSaving]   = useState(false);

  // ── 목록 탭 ──────────────────────────────────────────────────
  const [sets, setSets]           = useState([]);
  const [loadingSets, setLoadingSets] = useState(false);
  const [expandedSet, setExpandedSet] = useState(null);
  const [setContents, setSetContents] = useState({});

  // ── 현황 탭 ──────────────────────────────────────────────────
  const [progressData, setProgressData] = useState([]);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [progressSetId, setProgressSetId] = useState('');

  // ── 분석 탭 ──────────────────────────────────────────────────
  const [analysisData, setAnalysisData] = useState([]); // [{ setId, title, unitName, lessonTitle, avgScore, count, weakStudents }]
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // ── 단원 로드 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!grade) { setUnits([]); setUnitId(''); setLessons([]); return; }
    getDocs(query(
      collection(db, 'curriculumUnits'),
      where('grade', '==', parseInt(grade)),
      where('subject', '==', '수학'),
      where('status', '==', 'approved'),
    )).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(u => !semester || !u.semester || String(u.semester) === String(semester))
        .filter(u => !publisher || u.publisher === publisher || u.publisher === '공통')
        .sort((a, b) => (a.unitNumber || 99) - (b.unitNumber || 99));
      setUnits(list);
    }).catch(() => setUnits([]));
  }, [grade, semester, publisher]);

  // 단원 선택 시 차시 설정
  useEffect(() => {
    const u = units.find(u => u.id === unitId);
    setLessons(u?.lessons || []);
    setLessonNo('');
  }, [unitId, units]);

  // ── 학습 세트 로드 ────────────────────────────────────────────
  const loadSets = async () => {
    if (!teacherUid) return;
    setLoadingSets(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'aiCourseSets'),
        where('teacherUid', '==', teacherUid),
        orderBy('createdAt', 'desc'),
      ));
      setSets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoadingSets(false); }
  };

  useEffect(() => {
    if (tab === 'list' || tab === 'progress') loadSets();
    if (tab === 'analysis') loadAnalysis();
  }, [tab, teacherUid]);

  // ── 취약 단원 분석 로드 ───────────────────────────────────────
  const loadAnalysis = async () => {
    if (!teacherUid) return;
    setLoadingAnalysis(true);
    try {
      // 모든 학습 세트 + 진행 기록 병렬 조회
      const [setsSnap, progressSnap] = await Promise.all([
        getDocs(query(collection(db, 'aiCourseSets'), where('teacherUid', '==', teacherUid))),
        getDocs(query(collection(db, 'aiCourseProgress'), where('courseSetId', '!=', ''))),
      ]);
      const allSets = setsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const allProgress = progressSnap.docs.map(d => d.data()).filter(p => {
        // 내 학급 학습 세트의 기록만
        return allSets.some(s => s.id === p.courseSetId);
      });

      // 세트별 통계 계산
      const stats = allSets.filter(s => s.status !== 'draft').map(s => {
        const progs = allProgress.filter(p => p.courseSetId === s.id && p.status === 'completed');
        const scores = progs.map(p => p.score || 0);
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        const weakStudents = progs.filter(p => (p.score || 0) < 70).length;
        return {
          setId: s.id, title: s.title,
          unitName: s.unitName, lessonTitle: s.lessonTitle,
          grade: s.grade, semester: s.semester,
          avgScore, count: progs.length, weakStudents,
          status: s.status,
        };
      }).filter(s => s.count > 0).sort((a, b) => (a.avgScore || 100) - (b.avgScore || 100));

      setAnalysisData(stats);
    } catch (e) { console.error(e); }
    finally { setLoadingAnalysis(false); }
  };

  // ── AI 생성 ──────────────────────────────────────────────────
  const generate = async () => {
    const unit = units.find(u => u.id === unitId);
    const lesson = lessons.find(l => String(l.no) === lessonNo);
    if (!grade || !unit) { showToast('학년과 단원을 선택해주세요.', 'error'); return; }
    setIsGenerating(true); setGenError(''); setDraft(null);
    try {
      const res = await fetch('/api/generate-courseware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: parseInt(grade),
          semester: semester ? parseInt(semester) : null,
          publisher: publisher || '국정',
          unitName: unit.unitName,
          lessonNo: lesson?.no || null,
          lessonTitle: lesson?.title || unit.unitName,
          learningGoal: lesson?.learningGoal || '',
          keywords: lesson?.keywords || [],
          difficulty,
          questionCount: qCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error || '생성 실패'); return; }
      setDraft({
        ...data,
        grade: parseInt(grade), semester: semester ? parseInt(semester) : null,
        publisher: publisher || '국정',
        unitId, unitName: unit.unitName,
        lessonId: lesson ? `${unitId}_lesson_${lessonNo}` : null,
        lessonNo: lesson?.no || null, lessonTitle: lesson?.title || unit.unitName,
      });
    } catch (e) { setGenError('네트워크 오류가 발생했습니다.'); }
    finally { setIsGenerating(false); }
  };

  // ── 저장 (초안) ──────────────────────────────────────────────
  const saveDraft = async (publish = false) => {
    if (!draft || !teacherUid) return;
    setIsSaving(true);
    try {
      const setRef = await addDoc(collection(db, 'aiCourseSets'), {
        teacherUid, classId,
        grade: draft.grade, semester: draft.semester,
        subject: '수학', publisher: draft.publisher,
        unitId: draft.unitId, unitName: draft.unitName,
        lessonId: draft.lessonId, lessonNo: draft.lessonNo,
        lessonTitle: draft.lessonTitle,
        title: draft.title,
        status: publish ? 'published' : 'draft',
        reward,
        createdAt: serverTimestamp(),
        publishedAt: publish ? serverTimestamp() : null,
      });
      await addDoc(collection(db, 'aiCourseContents'), {
        courseSetId: setRef.id,
        conceptCards: draft.conceptCards,
        commonMistakes: draft.commonMistakes || [],
        questions: draft.questions,
        generatedBy: 'ai',
        reviewed: publish,
        createdAt: serverTimestamp(),
      });
      showToast(publish ? '✅ 발행 완료! 학생이 AI 학습관에서 볼 수 있습니다.' : '초안으로 저장했습니다.');
      setDraft(null);
      setTab('list');
    } catch (e) { showToast('저장 중 오류가 발생했습니다.', 'error'); console.error(e); }
    finally { setIsSaving(false); }
  };

  // ── 세트 상태 변경 ────────────────────────────────────────────
  const updateSetStatus = async (setId, status) => {
    await updateDoc(doc(db, 'aiCourseSets', setId), {
      status,
      ...(status === 'published' ? { publishedAt: serverTimestamp() } : {}),
    });
    setSets(prev => prev.map(s => s.id === setId ? { ...s, status } : s));
    showToast(status === 'published' ? '발행되었습니다.' : status === 'closed' ? '종료되었습니다.' : '초안으로 변경되었습니다.');
  };

  // ── 세트 삭제 ─────────────────────────────────────────────────
  const deleteSet = async (set) => {
    if (!window.confirm(`"${set.title}"을 삭제할까요?`)) return;
    await deleteDoc(doc(db, 'aiCourseSets', set.id));
    setSets(prev => prev.filter(s => s.id !== set.id));
    showToast('삭제되었습니다.');
  };

  // ── 세트 콘텐츠 로드 ──────────────────────────────────────────
  const loadContents = async (setId) => {
    if (setContents[setId]) { setExpandedSet(expandedSet === setId ? null : setId); return; }
    try {
      const snap = await getDocs(query(collection(db, 'aiCourseContents'), where('courseSetId', '==', setId)));
      if (!snap.empty) setSetContents(prev => ({ ...prev, [setId]: { id: snap.docs[0].id, ...snap.docs[0].data() } }));
    } catch (e) { console.error(e); }
    setExpandedSet(expandedSet === setId ? null : setId);
  };

  // ── 현황 로드 ─────────────────────────────────────────────────
  const loadProgress = async (setId) => {
    setProgressSetId(setId);
    setLoadingProgress(true);
    try {
      const snap = await getDocs(query(collection(db, 'aiCourseProgress'), where('courseSetId', '==', setId)));
      setProgressData(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.score || 0) - (a.score || 0)));
    } catch (e) { console.error(e); }
    finally { setLoadingProgress(false); }
  };

  const selectedUnit   = units.find(u => u.id === unitId);
  const selectedLesson = lessons.find(l => String(l.no) === lessonNo);

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">🤖 AI 코스웨어 관리</h1>
            <p className="text-slate-500 text-sm mt-0.5">차시 기반 AI 학습 세트를 생성하고 학생에게 발행합니다.</p>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-5">
          {[['create','✨ 새 학습 만들기'],['list','📋 학습 목록'],['progress','📊 학생 현황'],['analysis','🔍 취약 분석']].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-colors
                ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── 생성 탭 ─────────────────────────────────────────── */}
        {tab === 'create' && (
          <div className="space-y-5">
            {/* 교육과정 선택 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
              <h2 className="font-bold text-slate-700 text-sm">📌 교육과정 선택</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">학년 *</label>
                  <select value={grade} onChange={e => { setGrade(e.target.value); setUnitId(''); }}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">선택</option>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}학년</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">학기</label>
                  <select value={semester} onChange={e => setSemester(e.target.value)}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">전체</option>
                    <option value="1">1학기</option>
                    <option value="2">2학기</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">출판사</label>
                  <select value={publisher} onChange={e => setPublisher(e.target.value)}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">전체</option>
                    {['국정','아이스크림','천재교과서','동아출판','미래엔','비상','지학사','YBM'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">단원 *</label>
                  <select value={unitId} onChange={e => setUnitId(e.target.value)} disabled={!grade}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50">
                    <option value="">선택</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.unitNumber ? `${u.unitNumber}단원 ` : ''}{u.unitName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 차시 선택 */}
              {lessons.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">차시 (선택 시 해당 차시 기준 생성)</label>
                  <select value={lessonNo} onChange={e => setLessonNo(e.target.value)}
                    className="w-full border-2 border-indigo-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 bg-indigo-50/30">
                    <option value="">단원 전체 기준</option>
                    {lessons.map(l => (
                      <option key={l.no} value={String(l.no)}>{l.no}차시 — {l.title}</option>
                    ))}
                  </select>
                  {selectedLesson?.keywords?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {selectedLesson.keywords.map(k => (
                        <span key={k} className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full font-bold">{k}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 설정 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">⚙️ 학습 설정</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-2">난이도</label>
                  <div className="flex flex-col gap-1.5">
                    {DIFF_OPTIONS.map(d => (
                      <button key={d.value} onClick={() => setDiff(d.value)}
                        className={`py-2 rounded-xl text-xs font-bold border-2 transition-colors
                          ${difficulty === d.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-2">문항 수</label>
                  <div className="flex gap-2 flex-wrap">
                    {[3,4,5].map(n => (
                      <button key={n} onClick={() => setQCount(n)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors
                          ${qCount === n ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
                        {n}개
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-2">완료 보상</label>
                  <div className="space-y-2">
                    {[['exp','⭐ EXP'], ['gold','🪙 골드'], ['diamonds','💎 다이아']].map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-14">{label}</span>
                        <input type="number" min={0} max={9999} value={reward[key]}
                          onChange={e => setReward(r => ({ ...r, [key]: Number(e.target.value) }))}
                          className="flex-1 border-2 border-slate-200 rounded-lg px-2 py-1 text-xs text-center font-bold focus:outline-none focus:border-indigo-400" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {genError && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700">⚠️ {genError}</div>
            )}

            <button onClick={generate}
              disabled={isGenerating || !grade || !unitId}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all disabled:opacity-40">
              {isGenerating ? '🤖 AI가 학습 콘텐츠를 만드는 중...' : '🤖 AI 학습 세트 생성하기'}
            </button>

            {/* 생성 결과 미리보기 */}
            {draft && (
              <div className="space-y-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center gap-3">
                  <span className="text-2xl">✨</span>
                  <div>
                    <div className="font-extrabold text-indigo-800">{draft.title}</div>
                    <div className="text-xs text-indigo-600">{draft.context}</div>
                  </div>
                </div>

                {/* 개념 카드 */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3">
                  <h3 className="font-bold text-slate-700 text-sm">📖 개념 카드 ({draft.conceptCards.length}개)</h3>
                  {draft.conceptCards.map((c, i) => (
                    <div key={i} className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                      <div className="font-extrabold text-sky-800 text-sm mb-1">{c.title}</div>
                      <p className="text-sm text-slate-700 leading-relaxed mb-2">{c.body}</p>
                      {c.example && <p className="text-xs text-slate-500 bg-white rounded-lg px-3 py-2 border border-slate-200">💡 예시: {c.example}</p>}
                    </div>
                  ))}
                  {draft.commonMistakes?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <div className="font-bold text-amber-700 text-xs mb-1.5">⚠️ 자주 틀리는 포인트</div>
                      {draft.commonMistakes.map((m, i) => (
                        <p key={i} className="text-xs text-amber-800">• {m}</p>
                      ))}
                    </div>
                  )}
                </div>

                {/* 미니퀴즈 */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3">
                  <h3 className="font-bold text-slate-700 text-sm">📝 미니퀴즈 ({draft.questions.length}문항)</h3>
                  {draft.questions.map((q, i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <p className="text-sm font-bold text-slate-800 mb-2">Q{i+1}. {q.question}</p>
                      <div className="grid grid-cols-2 gap-1.5 mb-2">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className={`px-3 py-1.5 rounded-lg text-xs border ${q.answerIndex === oi ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-bold' : 'border-slate-200 text-slate-600'}`}>
                            {opt}
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500 bg-white rounded-lg px-2.5 py-1.5 border border-slate-200">💡 {q.explanation}</p>
                    </div>
                  ))}
                </div>

                {/* 저장 버튼 */}
                <div className="flex gap-3">
                  <button onClick={() => saveDraft(false)} disabled={isSaving}
                    className="flex-1 py-3.5 bg-slate-600 hover:bg-slate-700 text-white font-extrabold text-base rounded-2xl disabled:opacity-40">
                    {isSaving ? '저장 중...' : '💾 초안으로 저장'}
                  </button>
                  <button onClick={() => saveDraft(true)} disabled={isSaving}
                    className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base rounded-2xl disabled:opacity-40">
                    {isSaving ? '저장 중...' : '🚀 검토 후 바로 발행'}
                  </button>
                </div>
                <p className="text-center text-xs text-slate-400">초안으로 저장 후 목록에서 검토하고 발행할 수 있습니다.</p>
              </div>
            )}
          </div>
        )}

        {/* ── 목록 탭 ─────────────────────────────────────────── */}
        {tab === 'list' && (
          <div className="space-y-3">
            {loadingSets ? (
              <div className="flex items-center justify-center py-20 gap-2">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-sm text-slate-400">불러오는 중...</span>
              </div>
            ) : sets.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <div className="text-5xl mb-3">🤖</div>
                <p className="font-bold text-slate-600">생성된 학습 세트가 없습니다</p>
                <button onClick={() => setTab('create')}
                  className="mt-4 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700">
                  ✨ 첫 학습 세트 만들기
                </button>
              </div>
            ) : sets.map(set => (
              <div key={set.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-extrabold text-slate-800">{set.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_MAP[set.status]?.cls}`}>
                        {STATUS_MAP[set.status]?.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                      <span>{set.grade}학년 {set.semester ? `${set.semester}학기 ` : ''}수학</span>
                      <span>·</span>
                      <span>{set.unitName}</span>
                      {set.lessonTitle && <><span>·</span><span>{set.lessonTitle}</span></>}
                      <span>·</span>
                      <span>⭐{set.reward?.exp} 🪙{set.reward?.gold}</span>
                      <span>·</span>
                      <span>{fmtDate(set.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                    <button onClick={() => loadContents(set.id)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50">
                      {expandedSet === set.id ? '▲ 닫기' : '👁 미리보기'}
                    </button>
                    {set.status === 'draft' && (
                      <button onClick={() => updateSetStatus(set.id, 'published')}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                        🚀 발행
                      </button>
                    )}
                    {set.status === 'published' && (
                      <>
                        <button onClick={() => loadProgress(set.id)}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                          onClick={() => { loadProgress(set.id); setTab('progress'); }}>
                          📊 현황
                        </button>
                        <button onClick={() => updateSetStatus(set.id, 'closed')}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-500 hover:bg-slate-50">
                          종료
                        </button>
                      </>
                    )}
                    {set.status === 'closed' && (
                      <button onClick={() => updateSetStatus(set.id, 'published')}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-500 hover:bg-slate-50">
                        재발행
                      </button>
                    )}
                    <button onClick={() => deleteSet(set)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-rose-200 text-rose-500 hover:bg-rose-50">
                      삭제
                    </button>
                  </div>
                </div>

                {/* 콘텐츠 미리보기 */}
                {expandedSet === set.id && setContents[set.id] && (() => {
                  const c = setContents[set.id];
                  return (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {c.conceptCards?.map((card, i) => (
                          <div key={i} className="bg-sky-50 border border-sky-200 rounded-xl p-3">
                            <div className="font-bold text-sky-800 text-xs mb-1">{card.title}</div>
                            <p className="text-xs text-slate-700 line-clamp-3">{card.body}</p>
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-slate-500 font-bold">미니퀴즈 {c.questions?.length}문항</div>
                      {c.questions?.slice(0,2).map((q, i) => (
                        <div key={i} className="bg-white rounded-lg p-3 border border-slate-200 text-xs">
                          <p className="font-bold text-slate-700 mb-1">Q{i+1}. {q.question}</p>
                          <p className="text-emerald-600 font-bold">정답: {q.options?.[q.answerIndex]}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}

        {/* ── 현황 탭 ─────────────────────────────────────────── */}
        {tab === 'progress' && (
          <div className="space-y-4">
            {/* 세트 선택 */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <label className="text-xs font-bold text-slate-500 block mb-1.5">학습 세트 선택</label>
              <select value={progressSetId}
                onChange={e => { setProgressSetId(e.target.value); if (e.target.value) loadProgress(e.target.value); }}
                className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                <option value="">세트를 선택하세요</option>
                {sets.filter(s => s.status !== 'draft').map(s => (
                  <option key={s.id} value={s.id}>{s.title} ({STATUS_MAP[s.status]?.label})</option>
                ))}
              </select>
            </div>

            {progressSetId && (
              loadingProgress ? (
                <div className="flex items-center justify-center py-12 gap-2">
                  <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                  <span className="text-sm text-slate-400">불러오는 중...</span>
                </div>
              ) : progressData.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <div className="text-5xl mb-2">📭</div>
                  <p className="font-bold">아직 학습한 학생이 없습니다</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  {/* 요약 */}
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-5 text-sm font-bold">
                    <span className="text-slate-600">완료 <span className="text-indigo-600">{progressData.filter(p => p.status === 'completed').length}명</span></span>
                    <span className="text-slate-600">평균 정답률 <span className="text-emerald-600">{Math.round(progressData.filter(p => p.score).reduce((s, p) => s + p.score, 0) / progressData.filter(p => p.score).length || 0)}%</span></span>
                    <span className="text-slate-600">총 참여 <span className="text-slate-800">{progressData.length}명</span></span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">학생</th>
                        <th className="px-4 py-3 text-center font-semibold">상태</th>
                        <th className="px-4 py-3 text-center font-semibold">점수</th>
                        <th className="px-4 py-3 text-center font-semibold">정답</th>
                        <th className="px-4 py-3 text-center font-semibold">보상</th>
                        <th className="px-4 py-3 text-center font-semibold">완료일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {progressData.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-bold text-slate-800">{p.studentCode}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              p.status === 'inProgress' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {p.status === 'completed' ? '완료' : p.status === 'inProgress' ? '진행중' : '미시작'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-extrabold ${(p.score || 0) >= 80 ? 'text-emerald-600' : (p.score || 0) >= 60 ? 'text-amber-600' : 'text-rose-500'}`}>
                              {p.score ?? '-'}점
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600">
                            {p.correctCount ?? '-'}/{p.totalCount ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {p.rewarded ? <span className="text-emerald-600 font-bold text-xs">✅ 지급</span> : <span className="text-slate-400 text-xs">-</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-400 text-xs">
                            {p.completedAt ? fmtDate(p.completedAt) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        )}
        {/* ── 취약 분석 탭 ───────────────────────────────────── */}
        {tab === 'analysis' && (
          <div className="space-y-4">
            {loadingAnalysis ? (
              <div className="flex items-center justify-center py-20 gap-2">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-sm text-slate-400">분석 중...</span>
              </div>
            ) : analysisData.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <div className="text-5xl mb-3">📊</div>
                <p className="font-bold text-slate-600">분석할 학습 데이터가 없습니다</p>
                <p className="text-sm mt-1">학생들이 AI 학습을 완료하면 취약 단원 분석이 표시됩니다.</p>
              </div>
            ) : (
              <>
                {/* 요약 통계 */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm text-center">
                    <div className="text-2xl font-extrabold text-slate-800">{analysisData.length}</div>
                    <div className="text-xs text-slate-500 mt-0.5">분석된 학습 세트</div>
                  </div>
                  <div className="bg-rose-50 rounded-2xl p-4 border border-rose-200 shadow-sm text-center">
                    <div className="text-2xl font-extrabold text-rose-600">
                      {analysisData.filter(d => (d.avgScore || 0) < 60).length}
                    </div>
                    <div className="text-xs text-rose-500 mt-0.5">취약 세트 (60점 미만)</div>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 shadow-sm text-center">
                    <div className="text-2xl font-extrabold text-amber-600">
                      {analysisData.reduce((s, d) => s + d.weakStudents, 0)}
                    </div>
                    <div className="text-xs text-amber-500 mt-0.5">70점 미만 학생 수</div>
                  </div>
                </div>

                {/* 세트별 정답률 바 차트 */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-700 text-sm mb-4">📉 학습 세트별 평균 정답률 (낮은 순)</h3>
                  <div className="space-y-3">
                    {analysisData.map((d, i) => {
                      const score = d.avgScore || 0;
                      const barColor = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500';
                      return (
                        <div key={d.setId}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${score >= 80 ? 'bg-emerald-100 text-emerald-700' : score >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-600'}`}>
                                {i + 1}위
                              </span>
                              <span className="text-sm font-bold text-slate-700 truncate">{d.title}</span>
                              <span className="text-[10px] text-slate-400 shrink-0">{d.unitName}{d.lessonTitle ? ` · ${d.lessonTitle}` : ''}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-2">
                              <span className="text-xs text-slate-500">{d.count}명 참여</span>
                              {d.weakStudents > 0 && (
                                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-200">
                                  ⚠️ {d.weakStudents}명 취약
                                </span>
                              )}
                              <span className={`text-sm font-extrabold ${score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                                {score}점
                              </span>
                            </div>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${barColor}`}
                              style={{ width: `${Math.max(2, score)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 취약 세트 → 보충 학습 빠른 생성 */}
                {analysisData.filter(d => (d.avgScore || 0) < 70).length > 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5">
                    <h3 className="font-bold text-rose-700 text-sm mb-3">🎯 취약 단원 보충 학습 추천</h3>
                    <div className="space-y-2">
                      {analysisData.filter(d => (d.avgScore || 0) < 70).slice(0, 3).map(d => (
                        <div key={d.setId} className="bg-white rounded-xl p-3 border border-rose-100 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-700 truncate">{d.title}</p>
                            <p className="text-xs text-slate-400">{d.unitName} · 평균 {d.avgScore}점 · {d.weakStudents}명 취약</p>
                          </div>
                          <button
                            onClick={() => {
                              setTab('create');
                              showToast(`"${d.title}" 보충 학습 세트를 만들어보세요!`);
                            }}
                            className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors">
                            보충 만들기
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
