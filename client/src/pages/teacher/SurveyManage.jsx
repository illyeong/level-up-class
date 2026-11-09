import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import {
  SURVEY_QUESTION_TYPES,
  buildSurveyStats,
  createEmptySurveyQuestion,
  normalizeSurveyDraft,
  surveyResponsesToCsv,
  validateSurveyDraft,
} from '../../utils/surveys';

const CARD_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];

const emptyDraft = () => ({
  title: '',
  description: '',
  questions: [createEmptySurveyQuestion()],
});

const timestampValue = (value) => value?.seconds || value?.toMillis?.() || 0;

const compressSurveyImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('지원하지 않는 사진 형식입니다.'));
    image.onload = () => {
      const maxSide = 1800;
      const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.86).split(',')[1]);
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

export default function SurveyManage({ selectedClass }) {
  const teacherUid = selectedClass?.teacherUid || auth.currentUser?.uid || null;
  const classId = selectedClass?.id || null;
  const fileInputRef = useRef(null);
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');
  const [showEditor, setShowEditor] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [responses, setResponses] = useState([]);
  const [roster, setRoster] = useState([]);
  const [statsError, setStatsError] = useState('');
  const statsRequest = useRef(0);
  const [statsLoading, setStatsLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const showNotice = (message, type = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 3200);
  };

  const loadSurveys = useCallback(async () => {
    if (!teacherUid) return;
    setLoading(true);
    try {
      const surveyQuery = classId
        ? query(collection(db, 'surveys'), where('classId', '==', classId))
        : query(collection(db, 'surveys'), where('teacherUid', '==', teacherUid));
      const snapshot = await getDocs(surveyQuery);
      setSurveys(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.deleted !== true)
        .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt)));
    } catch (error) {
      console.error(error);
      showNotice('설문 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [classId, teacherUid]);

  useEffect(() => {
    // Firestore 목록을 화면 진입 시 한 번만 불러옵니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSurveys();
  }, [loadSurveys]);

  const filteredSurveys = useMemo(
    () => surveys.filter((survey) => filter === 'active' ? survey.active !== false : survey.active === false),
    [filter, surveys],
  );
  const activeCount = surveys.filter((survey) => survey.active !== false).length;
  const endedCount = surveys.length - activeCount;
  const stats = useMemo(
    () => selectedSurvey ? buildSurveyStats(selectedSurvey, responses) : [],
    [responses, selectedSurvey],
  );
  const participation = useMemo(() => {
    const ids = new Set(responses.map(item => item.studentId).filter(Boolean));
    const codes = new Set(responses.filter(item => !item.studentId).map(item => item.studentCode).filter(Boolean));
    const completed = [];
    const pending = [];
    roster.forEach(student => {
      (ids.has(student.id) || codes.has(student.studentCode) ? completed : pending).push(student);
    });
    return { completed, pending };
  }, [roster, responses]);
  const expectedStudents = roster.length;
  const responseRate = expectedStudents > 0 ? Math.round((participation.completed.length / expectedStudents) * 100) : 0;

  const openManualEditor = () => {
    setDraft(emptyDraft());
    setShowEditor(true);
  };

  const updateQuestion = (index, patch) => {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) => (
        questionIndex === index ? { ...question, ...patch } : question
      )),
    }));
  };

  const changeQuestionType = (index, type) => {
    const current = draft.questions[index];
    updateQuestion(index, {
      type,
      ...(type === 'single' || type === 'multiple'
        ? { options: current.options?.length >= 2 ? current.options : ['', ''] }
        : { options: undefined }),
    });
  };

  const moveQuestion = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= draft.questions.length) return;
    setDraft((current) => {
      const questions = [...current.questions];
      [questions[index], questions[target]] = [questions[target], questions[index]];
      return { ...current, questions };
    });
  };

  const saveSurvey = async () => {
    const error = validateSurveyDraft(draft);
    if (error) return showNotice(error, 'error');
    setSaving(true);
    try {
      const normalized = normalizeSurveyDraft(draft);
      await addDoc(collection(db, 'surveys'), {
        ...normalized,
        teacherUid,
        classId,
        active: true,
        responseCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowEditor(false);
      setDraft(emptyDraft());
      setFilter('active');
      await loadSurveys();
      showNotice('설문을 발행했습니다. 학생 메뉴에 바로 표시됩니다.');
    } catch (saveError) {
      console.error(saveError);
      showNotice('설문을 저장하지 못했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const recognizeImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return showNotice('사진 파일을 선택해 주세요.', 'error');
    if (file.size > 20 * 1024 * 1024) return showNotice('20MB 이하 사진을 사용해 주세요.', 'error');
    setRecognizing(true);
    try {
      const imageBase64 = await compressSurveyImage(file);
      const response = await fetch('/api/generate-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mediaType: 'image/jpeg' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '사진에서 문항을 읽지 못했습니다.');
      const normalized = normalizeSurveyDraft(result);
      setDraft({
        ...normalized,
        questions: normalized.questions.map((question) => ({
          ...question,
          id: createEmptySurveyQuestion(question.type).id,
        })),
      });
      setShowEditor(true);
      showNotice(`${normalized.questions.length}개 문항을 가져왔습니다. 발행 전 내용을 확인해 주세요.`);
    } catch (error) {
      console.error(error);
      showNotice(error.message || '사진 분석에 실패했습니다.', 'error');
    } finally {
      setRecognizing(false);
    }
  };

  const toggleSurvey = async (survey) => {
    try {
      await updateDoc(doc(db, 'surveys', survey.id), {
        active: survey.active === false,
        updatedAt: serverTimestamp(),
      });
      setSurveys((current) => current.map((item) => (
        item.id === survey.id ? { ...item, active: survey.active === false } : item
      )));
      showNotice(survey.active === false ? '설문을 다시 열었습니다.' : '설문을 종료했습니다. 통계는 계속 볼 수 있습니다.');
    } catch (error) {
      console.error(error);
      showNotice('설문 상태를 변경하지 못했습니다.', 'error');
    }
  };

  const openStats = async (survey) => {
    const request = ++statsRequest.current;
    setSelectedSurvey(survey);
    setResponses([]);
    setRoster([]);
    setStatsError('');
    setStatsLoading(true);
    try {
      const [snapshot, studentSnapshot] = await Promise.all([getDocs(query(
        collection(db, 'surveyResponses'),
        where('surveyId', '==', survey.id),
      )), getDocs(query(collection(db, 'students'),
        survey.classId
          ? where('classId', '==', survey.classId)
          : where('teacherUid', '==', survey.teacherUid || teacherUid),
      ))]);
      if (request !== statsRequest.current) return;
      setRoster(studentSnapshot.docs.map(item => ({ ...item.data(), id: item.id }))
        .sort((a, b) => String(a.studentCode || a.name || '').localeCompare(String(b.studentCode || b.name || ''), 'ko', { numeric: true })));
      const loadedResponses = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => timestampValue(b.submittedAt) - timestampValue(a.submittedAt));
      setResponses(loadedResponses);
      setSurveys((current) => current.map((item) => (
        item.id === survey.id ? { ...item, responseCount: loadedResponses.length } : item
      )));
    } catch (error) {
      if (request !== statsRequest.current) return;
      console.error(error);
      setStatsError('참여 현황을 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.');
      showNotice('응답 통계를 불러오지 못했습니다.', 'error');
    } finally {
      if (request === statsRequest.current) setStatsLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!selectedSurvey) return;
    const csv = surveyResponsesToCsv(selectedSurvey, responses);
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedSurvey.title.replace(/[\\/:*?"<>|]/g, '_')}_응답.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-indigo-50/40 to-cyan-50 p-4 text-slate-800 md:p-7">
      {notice && (
        <div className={`fixed left-1/2 top-5 z-[260] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-extrabold text-white shadow-xl ${notice.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`}>
          {notice.message}
        </div>
      )}

      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-indigo-700 via-violet-600 to-cyan-500 p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              <div className="mb-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-black ring-1 ring-white/25">학급 의견을 한눈에</div>
              <h1 className="text-2xl font-black md:text-3xl">📝 설문지 관리</h1>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-indigo-50">직접 문항을 만들거나 종이 설문지를 촬영해 가져오세요. 응답률과 문항별 결과가 자동으로 정리됩니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={recognizeImage} className="hidden" />
              <button type="button" disabled={recognizing} onClick={() => fileInputRef.current?.click()} className="rounded-2xl bg-white/15 px-4 py-3 text-sm font-extrabold ring-1 ring-white/30 transition hover:bg-white/25 disabled:opacity-60">
                {recognizing ? '✨ 사진 분석 중...' : '📷 사진에서 문항 가져오기'}
              </button>
              <button type="button" onClick={openManualEditor} className="rounded-2xl bg-white px-4 py-3 text-sm font-extrabold text-indigo-700 shadow-lg transition hover:-translate-y-0.5">+ 직접 만들기</button>
            </div>
          </div>
        </section>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
            <button type="button" onClick={() => setFilter('active')} className={`rounded-xl px-4 py-2 text-sm font-extrabold ${filter === 'active' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}>진행 중 {activeCount}</button>
            <button type="button" onClick={() => setFilter('ended')} className={`rounded-xl px-4 py-2 text-sm font-extrabold ${filter === 'ended' ? 'bg-slate-700 text-white shadow' : 'text-slate-500'}`}>종료됨 {endedCount}</button>
          </div>
          <button type="button" onClick={loadSurveys} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 hover:border-indigo-300">새로고침</button>
        </div>

        {loading ? (
          <div className="py-24 text-center font-bold text-slate-400">설문을 불러오는 중...</div>
        ) : filteredSurveys.length === 0 ? (
          <div className="mt-5 rounded-[2rem] border border-dashed border-indigo-200 bg-white/80 py-20 text-center shadow-sm">
            <div className="text-5xl">🗂️</div>
            <p className="mt-4 text-lg font-black text-slate-700">{filter === 'active' ? '진행 중인 설문이 없습니다' : '종료된 설문이 없습니다'}</p>
            {filter === 'active' && <p className="mt-1 text-sm font-semibold text-slate-400">직접 만들거나 종이 설문지 사진을 올려 시작해 보세요.</p>}
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {filteredSurveys.map((survey) => (
              <article key={survey.id} className="rounded-[1.6rem] border border-white bg-white p-5 shadow-md shadow-indigo-100/60 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${survey.active === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>{survey.active === false ? '종료' : '응답 받는 중'}</span>
                    <h2 className="mt-3 truncate text-lg font-black text-slate-800"><button type="button" onClick={() => openStats(survey)} className="text-left hover:text-indigo-600 hover:underline">{survey.title}</button></h2>
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm font-medium text-slate-500">{survey.description || '설문 안내가 없습니다.'}</p>
                  </div>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-2xl">📋</div>
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
                  <span>문항 {survey.questions?.length || 0}개</span>
                  <span className="h-3 w-px bg-slate-300" />
                  <span>응답 {Number(survey.responseCount) || 0}명</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => openStats(survey)} className="rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-extrabold text-white hover:bg-indigo-500">📊 참여 현황 · 통계</button>
                  <button type="button" onClick={() => toggleSurvey(survey)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-extrabold text-slate-600 hover:bg-slate-50">{survey.active === false ? '다시 열기' : '설문 종료'}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showEditor && createPortal(
        <div className="fixed inset-0 z-[220] overflow-y-auto bg-slate-950/75 p-3 text-slate-900 backdrop-blur-sm md:p-6">
          <div className="mx-auto max-w-3xl rounded-[2rem] bg-slate-50 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-[2rem] border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur md:px-7">
              <div><h2 className="text-xl font-black text-slate-800">새 설문 만들기</h2><p className="text-xs font-bold text-slate-400">발행 전 문항과 선택지를 확인해 주세요.</p></div>
              <button type="button" onClick={() => setShowEditor(false)} className="h-10 w-10 rounded-full bg-slate-100 font-black text-slate-500 hover:bg-slate-200">✕</button>
            </div>
            <div className="space-y-5 p-5 md:p-7">
              <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <label className="text-xs font-black text-indigo-600">설문 제목 *</label>
                <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={120} placeholder="예: 현장체험학습 만족도 조사" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base font-bold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                <label className="mt-4 block text-xs font-black text-slate-500">안내 문구</label>
                <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={1000} rows={3} placeholder="학생에게 보여줄 안내를 입력하세요." className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              </section>

              {draft.questions.map((question, index) => (
                <section key={question.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-xs font-black text-indigo-700">{index + 1}</span><span className="text-sm font-black text-slate-700">문항</span></div>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="위로 이동" onClick={() => moveQuestion(index, -1)} disabled={index === 0} className="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 disabled:opacity-30">↑</button>
                      <button type="button" aria-label="아래로 이동" onClick={() => moveQuestion(index, 1)} disabled={index === draft.questions.length - 1} className="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => setDraft((current) => ({ ...current, questions: current.questions.filter((_, i) => i !== index) }))} disabled={draft.questions.length === 1} className="ml-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-black text-rose-500 disabled:opacity-30">삭제</button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_190px]">
                    <input value={question.text} onChange={(event) => updateQuestion(index, { text: event.target.value })} maxLength={300} placeholder="질문을 입력하세요" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500" />
                    <select value={question.type} onChange={(event) => changeQuestionType(index, event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-indigo-500">
                      {SURVEY_QUESTION_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                    </select>
                  </div>
                  {(question.type === 'single' || question.type === 'multiple') && (
                    <div className="mt-4 space-y-2 pl-2 md:pl-8">
                      {(question.options || []).map((option, optionIndex) => (
                        <div key={`${question.id}_${optionIndex}`} className="flex items-center gap-2">
                          <span className="text-slate-300">{question.type === 'single' ? '○' : '□'}</span>
                          <input value={option} onChange={(event) => updateQuestion(index, { options: question.options.map((value, i) => i === optionIndex ? event.target.value : value) })} maxLength={120} placeholder={`선택지 ${optionIndex + 1}`} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" />
                          <button type="button" disabled={question.options.length <= 2} onClick={() => updateQuestion(index, { options: question.options.filter((_, i) => i !== optionIndex) })} className="h-8 w-8 shrink-0 rounded-lg text-rose-400 hover:bg-rose-50 disabled:opacity-20">✕</button>
                        </div>
                      ))}
                      {question.options.length < 12 && <button type="button" onClick={() => updateQuestion(index, { options: [...question.options, ''] })} className="text-xs font-black text-indigo-600 hover:text-indigo-800">+ 선택지 추가</button>}
                    </div>
                  )}
                  {question.type === 'rating' && <div className="mt-4 flex justify-center gap-2 rounded-xl bg-amber-50 p-3 text-xl">{[1, 2, 3, 4, 5].map((value) => <span key={value} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-black text-amber-600 shadow-sm">{value}</span>)}</div>}
                  <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-500"><input type="checkbox" checked={question.required !== false} onChange={(event) => updateQuestion(index, { required: event.target.checked })} className="h-4 w-4 accent-indigo-600" />필수 응답</label>
                </section>
              ))}

              <button type="button" onClick={() => setDraft((current) => ({ ...current, questions: [...current.questions, createEmptySurveyQuestion()] }))} className="w-full rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/60 py-4 text-sm font-black text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50">+ 문항 추가</button>
              <div className="flex gap-3 pb-2">
                <button type="button" onClick={() => setShowEditor(false)} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3.5 font-extrabold text-slate-500">취소</button>
                <button type="button" disabled={saving} onClick={saveSurvey} className="flex-[2] rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3.5 font-extrabold text-white shadow-lg disabled:opacity-50">{saving ? '발행 중...' : `학생에게 발행하기 · ${draft.questions.length}문항`}</button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {selectedSurvey && createPortal(
        <div className="fixed inset-0 z-[220] overflow-y-auto bg-slate-950/75 p-3 text-slate-900 backdrop-blur-sm md:p-6">
          <div className="mx-auto max-w-5xl rounded-[2rem] bg-slate-50 shadow-2xl">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-[2rem] border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur md:px-7">
              <div><p className="text-xs font-black text-indigo-600">참여 현황 · 응답 통계</p><h2 className="text-xl font-black text-slate-800">{selectedSurvey.title}</h2></div>
              <button type="button" disabled={statsLoading} onClick={() => openStats(selectedSurvey)} className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 disabled:opacity-40">참여 현황 새로고침</button>
              <div className="flex gap-2"><button type="button" disabled={!responses.length} onClick={downloadCsv} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-40">⬇ 엑셀용 CSV</button><button type="button" onClick={() => setSelectedSurvey(null)} className="h-10 w-10 rounded-full bg-slate-100 font-black text-slate-500">✕</button></div>
            </div>
            <div className="space-y-5 p-5 md:p-7">
              {statsError && <p role="alert" className="rounded-xl bg-rose-50 p-4 font-bold text-rose-700">{statsError}</p>}
              {!statsLoading && !statsError && (
                <section>
                  <h3 className="mb-3 font-black text-slate-800">학생별 참여 현황</h3>
                  <p className="mb-3 text-xs text-slate-500">현재 학급 명단 기준입니다. 새 응답은 새로고침하면 반영됩니다.</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      { title: '미참여', students: participation.pending, tone: 'bg-amber-50 text-amber-800 border-amber-200', empty: roster.length ? '모든 학생이 참여했습니다.' : '등록된 학생이 없습니다.' },
                      { title: '참여 완료', students: participation.completed, tone: 'bg-emerald-50 text-emerald-800 border-emerald-200', empty: '아직 참여한 학생이 없습니다.' },
                    ].map(group => (
                      <div key={group.title} className={`rounded-2xl border p-4 ${group.tone}`}>
                        <h4 className="font-black">{group.title} <span className="ml-1">{group.students.length}명</span></h4>
                        <ul className="mt-3 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
                          {group.students.map(student => <li key={student.id} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"><span className="mr-2 text-xs opacity-60">{student.studentCode?.split('-').at(-1) || '—'}번</span><span className="font-bold">{student.name || student.studentName || student.studentCode || '이름 미등록'}</span></li>)}
                        </ul>
                        {!group.students.length && <p className="mt-3 text-sm">{group.empty}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-indigo-600 p-5 text-white shadow-lg"><p className="text-xs font-bold text-indigo-100">제출 완료</p><p className="mt-1 text-3xl font-black">{responses.length}<span className="ml-1 text-sm">명</span></p></div>
                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-bold text-slate-400">예상 학생 수</p><p className="mt-1 text-3xl font-black text-slate-800">{expectedStudents || '-'}<span className="ml-1 text-sm text-slate-400">명</span></p></div>
                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-bold text-slate-400">응답률</p><p className="mt-1 text-3xl font-black text-emerald-600">{responseRate}%</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, responseRate)}%` }} /></div></div>
              </div>

              {statsLoading ? <div className="py-20 text-center font-bold text-slate-400">응답을 집계하는 중...</div> : responses.length === 0 ? <div className="rounded-2xl bg-white py-16 text-center font-bold text-slate-400 ring-1 ring-slate-200">아직 제출된 응답이 없습니다.</div> : stats.map((question, questionIndex) => (
                <section key={question.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">
                  <div className="flex items-start justify-between gap-3"><h3 className="font-black text-slate-800"><span className="mr-2 text-indigo-500">{questionIndex + 1}.</span>{question.text}</h3><span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">응답 {question.answeredCount}명</span></div>
                  {(question.type === 'single' || question.type === 'multiple') && <div className="mt-5 space-y-3">{question.options.map((option, optionIndex) => { const count = question.counts[option] || 0; const pct = question.answeredCount ? Math.round((count / question.answeredCount) * 100) : 0; return <div key={option}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="font-bold text-slate-600">{option}</span><span className="font-black text-slate-700">{count}명 · {pct}%</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${CARD_COLORS[optionIndex % CARD_COLORS.length]}`} style={{ width: `${pct}%` }} /></div></div>; })}{question.type === 'multiple' && <p className="text-[11px] font-bold text-slate-400">복수 선택 문항은 합계가 100%를 넘을 수 있습니다.</p>}</div>}
                  {question.type === 'rating' && <div className="mt-5"><div className="mb-4 flex items-end gap-2"><span className="text-4xl font-black text-amber-500">{question.average}</span><span className="pb-1 text-sm font-bold text-slate-400">/ 5점</span></div><div className="grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map((value) => { const count = question.distribution[value] || 0; return <div key={value} className="rounded-xl bg-amber-50 p-2 text-center"><div className="text-xs font-black text-amber-600">{value}점</div><div className="mt-1 text-lg font-black text-slate-700">{count}</div></div>; })}</div></div>}
                  {question.type === 'text' && <div className="mt-5 max-h-72 space-y-2 overflow-y-auto">{question.textAnswers.map((answer, index) => <div key={`${answer.studentName}_${index}`} className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-[11px] font-black text-indigo-500">{answer.studentName}</div><div className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-700">{answer.value}</div></div>)}</div>}
                </section>
              ))}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
