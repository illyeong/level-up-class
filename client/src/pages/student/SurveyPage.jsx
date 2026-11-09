import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { validateSurveyAnswers } from '../../utils/surveys';

const timestampValue = (value) => value?.seconds || value?.toMillis?.() || 0;

export default function SurveyPage({ studentCode, themeMode = 'light' }) {
  const isDark = themeMode === 'dark';
  const [student, setStudent] = useState(null);
  const [surveys, setSurveys] = useState([]);
  const [responses, setResponses] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const showNotice = (message, type = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 3000);
  };

  const loadPage = useCallback(async () => {
    if (!studentCode) return;
    setLoading(true);
    try {
      const studentSnapshot = await getDocs(query(
        collection(db, 'students'),
        where('studentCode', '==', studentCode),
      ));
      if (studentSnapshot.empty) throw new Error('학생 정보를 찾지 못했습니다.');
      const studentDoc = studentSnapshot.docs[0];
      const studentData = { id: studentDoc.id, ...studentDoc.data() };
      setStudent(studentData);

      const surveyQuery = studentData.classId
        ? query(collection(db, 'surveys'), where('classId', '==', studentData.classId))
        : query(collection(db, 'surveys'), where('teacherUid', '==', studentData.teacherUid));
      const [surveySnapshot, responseSnapshot] = await Promise.all([
        getDocs(surveyQuery),
        getDocs(query(collection(db, 'surveyResponses'), where('studentId', '==', studentDoc.id))),
      ]);
      setSurveys(surveySnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.active !== false && item.deleted !== true)
        .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt)));
      setResponses(Object.fromEntries(responseSnapshot.docs.map((item) => {
        const data = { id: item.id, ...item.data() };
        return [data.surveyId, data];
      })));
    } catch (error) {
      console.error(error);
      showNotice(error.message || '설문을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [studentCode]);

  useEffect(() => {
    // 학생·설문·내 응답을 화면 진입 시 한 번만 불러옵니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPage();
  }, [loadPage]);

  const completedCount = useMemo(
    () => surveys.filter((survey) => responses[survey.id]).length,
    [responses, surveys],
  );

  const openSurvey = (survey) => {
    setSelectedSurvey(survey);
    setAnswers(responses[survey.id]?.answers || {});
  };

  const setAnswer = (questionId, value) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  };

  const toggleMultipleAnswer = (questionId, option) => {
    const current = Array.isArray(answers[questionId]) ? answers[questionId] : [];
    setAnswer(questionId, current.includes(option)
      ? current.filter((value) => value !== option)
      : [...current, option]);
  };

  const submitSurvey = async () => {
    if (!selectedSurvey || !student) return;
    const validationError = validateSurveyAnswers(selectedSurvey.questions || [], answers);
    if (validationError) return showNotice(validationError, 'error');
    setSaving(true);
    try {
      const responseId = `${selectedSurvey.id}_${student.id}`;
      const responseRef = doc(db, 'surveyResponses', responseId);
      const surveyRef = doc(db, 'surveys', selectedSurvey.id);
      const submittedAnswers = Object.fromEntries((selectedSurvey.questions || []).map((question) => [
        question.id,
        question.type === 'multiple'
          ? (Array.isArray(answers[question.id]) ? answers[question.id] : [])
          : answers[question.id] ?? '',
      ]));

      let wasNew = false;
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(responseRef);
        wasNew = !existing.exists();
        transaction.set(responseRef, {
          surveyId: selectedSurvey.id,
          teacherUid: selectedSurvey.teacherUid || student.teacherUid || null,
          classId: selectedSurvey.classId || student.classId || null,
          studentId: student.id,
          studentCode,
          studentName: student.name || student.studentName || studentCode,
          answers: submittedAnswers,
          submittedAt: existing.exists() ? (existing.data().submittedAt || serverTimestamp()) : serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        if (wasNew) transaction.update(surveyRef, { responseCount: increment(1) });
      });

      const localResponse = {
        surveyId: selectedSurvey.id,
        studentId: student.id,
        studentCode,
        studentName: student.name || studentCode,
        answers: submittedAnswers,
      };
      setResponses((current) => ({ ...current, [selectedSurvey.id]: localResponse }));
      setSelectedSurvey(null);
      showNotice(wasNew ? '응답을 제출했습니다. 고마워요!' : '응답을 수정했습니다.');
    } catch (error) {
      console.error(error);
      showNotice('응답을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const panel = isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-white bg-white text-slate-800';

  return (
    <div className={`min-h-full p-4 md:p-7 ${isDark ? 'bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900' : 'bg-gradient-to-br from-indigo-50 via-white to-cyan-50'}`}>
      {notice && <div className={`fixed left-1/2 top-5 z-[80] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-extrabold text-white shadow-xl ${notice.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`}>{notice.message}</div>}
      <div className="mx-auto max-w-4xl">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 p-6 text-white shadow-xl md:p-8">
          <div className="flex items-center justify-between gap-5">
            <div><div className="mb-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-black">우리 반 목소리</div><h1 className="text-2xl font-black md:text-3xl">📝 설문지</h1><p className="mt-2 text-sm font-semibold text-indigo-50">생각을 솔직하게 적고 제출해 주세요.</p></div>
            <div className="rounded-2xl bg-white/15 px-5 py-4 text-center ring-1 ring-white/25"><div className="text-2xl font-black">{completedCount}/{surveys.length}</div><div className="text-[11px] font-bold text-indigo-100">응답 완료</div></div>
          </div>
        </section>

        <div className="mt-5 flex justify-end"><button type="button" onClick={loadPage} className={`rounded-xl border px-3 py-2 text-xs font-black ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`}>새로고침</button></div>
        {loading ? (
          <div className={`mt-5 rounded-[2rem] border py-24 text-center font-bold text-slate-400 ${panel}`}>설문을 불러오는 중...</div>
        ) : surveys.length === 0 ? (
          <div className={`mt-5 rounded-[2rem] border py-24 text-center shadow-sm ${panel}`}><div className="text-5xl">📭</div><p className="mt-4 text-lg font-black">지금 참여할 설문이 없어요</p><p className="mt-1 text-sm font-semibold text-slate-400">선생님이 설문을 열면 이곳에 표시됩니다.</p></div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {surveys.map((survey) => {
              const completed = Boolean(responses[survey.id]);
              return <article key={survey.id} className={`rounded-[1.6rem] border p-5 shadow-md transition hover:-translate-y-0.5 ${panel}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{completed ? '✓ 응답 완료' : '응답 필요'}</span><h2 className="mt-3 text-lg font-black">{survey.title}</h2><p className="mt-1 line-clamp-2 min-h-10 text-sm font-medium text-slate-400">{survey.description || '안내를 읽고 설문에 참여해 주세요.'}</p></div><div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${isDark ? 'bg-indigo-950' : 'bg-indigo-50'}`}>📋</div></div>
                <div className={`mt-4 flex items-center justify-between rounded-xl px-4 py-3 text-xs font-bold ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-50 text-slate-500'}`}><span>문항 {survey.questions?.length || 0}개</span><span>{(survey.questions || []).filter((question) => question.required !== false).length}개 필수</span></div>
                <button type="button" onClick={() => openSurvey(survey)} className={`mt-4 w-full rounded-xl py-3 text-sm font-extrabold text-white shadow-sm ${completed ? 'bg-slate-600 hover:bg-slate-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}>{completed ? '응답 확인·수정' : '설문 시작하기'}</button>
              </article>;
            })}
          </div>
        )}
      </div>

      {selectedSurvey && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm md:p-6">
          <div className={`mx-auto max-w-3xl rounded-[2rem] border shadow-2xl ${panel}`}>
            <div className={`sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-[2rem] border-b px-5 py-4 backdrop-blur md:px-7 ${isDark ? 'border-slate-700 bg-slate-900/95' : 'border-slate-200 bg-white/95'}`}><div><p className="text-xs font-black text-indigo-500">{responses[selectedSurvey.id] ? '제출한 응답을 수정할 수 있어요' : '차근차근 응답해 주세요'}</p><h2 className="mt-1 text-xl font-black">{selectedSurvey.title}</h2>{selectedSurvey.description && <p className="mt-1 text-sm font-medium text-slate-400">{selectedSurvey.description}</p>}</div><button type="button" onClick={() => setSelectedSurvey(null)} className={`h-10 w-10 shrink-0 rounded-full font-black ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>✕</button></div>
            <div className={`space-y-5 p-5 md:p-7 ${isDark ? 'bg-slate-950/40' : 'bg-slate-50'}`}>
              {(selectedSurvey.questions || []).map((question, index) => <section key={question.id} className={`rounded-2xl border p-5 shadow-sm ${panel}`}>
                <h3 className="font-black"><span className="mr-2 text-indigo-500">{index + 1}.</span>{question.text}{question.required !== false && <span className="ml-1 text-rose-500">*</span>}</h3>
                {question.type === 'single' && <div className="mt-4 grid gap-2">{(question.options || []).map((option) => <label key={option} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-bold transition ${answers[question.id] === option ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100' : isDark ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'}`}><input type="radio" name={question.id} checked={answers[question.id] === option} onChange={() => setAnswer(question.id, option)} className="h-4 w-4 accent-indigo-600" />{option}</label>)}</div>}
                {question.type === 'multiple' && <div className="mt-4 grid gap-2">{(question.options || []).map((option) => { const checked = Array.isArray(answers[question.id]) && answers[question.id].includes(option); return <label key={option} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-bold transition ${checked ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100' : isDark ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'}`}><input type="checkbox" checked={checked} onChange={() => toggleMultipleAnswer(question.id, option)} className="h-4 w-4 accent-indigo-600" />{option}</label>; })}</div>}
                {question.type === 'rating' && <div className="mt-4 grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setAnswer(question.id, value)} className={`rounded-xl border py-3 text-sm font-black transition ${Number(answers[question.id]) === value ? 'border-amber-500 bg-amber-400 text-white shadow-md' : isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-white text-slate-500 hover:border-amber-300'}`}><div className="text-lg">{value}</div><div className="text-[10px]">점</div></button>)}</div>}
                {question.type === 'text' && <textarea value={answers[question.id] || ''} onChange={(event) => setAnswer(question.id, event.target.value)} maxLength={1000} rows={4} placeholder="생각을 입력하세요" className={`mt-4 w-full resize-none rounded-xl border px-4 py-3 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${isDark ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-700'}`} />}
              </section>)}
              <button type="button" disabled={saving} onClick={submitSurvey} className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-4 font-black text-white shadow-lg disabled:opacity-50">{saving ? '저장 중...' : responses[selectedSurvey.id] ? '응답 수정하기' : '응답 제출하기'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
