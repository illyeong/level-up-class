import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { auth, db } from '../firebase';

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '쉬움', desc: '기본 개념 확인' },
  { value: 'normal', label: '보통', desc: '이해와 적용' },
  { value: 'hard', label: '어려움', desc: '심화 사고' },
];

const normalizeQuizQuestions = (questions = []) => questions.map((q) => {
  const type = q.type === 'sa' ? 'sa' : 'mc';
  if (type === 'sa') {
    return {
      type: 'sa',
      question: String(q.question || '').trim(),
      table: q.table || null,
      shape: q.shape || null,
      answer: String(q.answer || '').trim(),
      explanation: String(q.explanation || '').trim(),
    };
  }

  const answer = Number.isInteger(q.answer) ? q.answer : Number(q.answerIndex ?? 0);
  return {
    type: 'mc',
    question: String(q.question || '').trim(),
    table: q.table || null,
    shape: q.shape || null,
    options: Array.isArray(q.options) ? q.options.map(v => String(v || '').trim()).slice(0, 4) : [],
    answer: Math.min(3, Math.max(0, Number.isFinite(answer) ? answer : 0)),
    explanation: String(q.explanation || '').trim(),
  };
});

const buildLessonKey = (unit, lesson) =>
  `v2_${unit.grade}_${unit.semester || 0}_${unit.publisher || 'default'}_${unit.id}_${lesson.no}`;

function uniqueValues(items, key) {
  return Array.from(new Set(items.map(item => item[key]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'ko'));
}

export default function AILessonQuizSetBuilder({
  selectedClass,
  accent = 'indigo',
  title = 'AI학습관 차시로 퀴즈 만들기',
  description = 'AI학습관에 등록된 단원/차시를 선택하면 새 퀴즈가 생성되고 자동 선택됩니다.',
  defaultQuestionCount = 6,
  defaultDifficulty = 'normal',
  onCreated,
  showToast,
}) {
  const [units, setUnits] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [filters, setFilters] = useState({
    grade: selectedClass?.grade ? String(selectedClass.grade) : '',
    semester: '',
    publisher: '',
    unitId: '',
    lessonNo: '',
  });
  const [difficulty, setDifficulty] = useState(defaultDifficulty);
  const [questionCount, setQuestionCount] = useState(defaultQuestionCount);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, 'curriculumUnits'),
          where('subject', '==', '수학'),
          where('status', '==', 'approved'),
        ));
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) =>
            (a.grade || 0) - (b.grade || 0)
            || (a.semester || 0) - (b.semester || 0)
            || (a.unitNumber || 0) - (b.unitNumber || 0)
            || String(a.publisher || '').localeCompare(String(b.publisher || ''), 'ko')
          );
        if (mounted) setUnits(list);
      } catch (err) {
        console.error('AI학습관 차시 로딩 오류:', err);
        showToast?.('AI학습관 차시를 불러오지 못했습니다.', 'error');
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const grades = useMemo(() => uniqueValues(units, 'grade'), [units]);
  const semesters = useMemo(
    () => uniqueValues(units.filter(u => !filters.grade || String(u.grade) === filters.grade), 'semester'),
    [filters.grade, units],
  );
  const publishers = useMemo(
    () => uniqueValues(units.filter(u =>
      (!filters.grade || String(u.grade) === filters.grade)
      && (!filters.semester || String(u.semester) === filters.semester)
    ), 'publisher'),
    [filters.grade, filters.semester, units],
  );
  const unitOptions = useMemo(
    () => units.filter(u =>
      (!filters.grade || String(u.grade) === filters.grade)
      && (!filters.semester || String(u.semester) === filters.semester)
      && (!filters.publisher || u.publisher === filters.publisher)
    ),
    [filters, units],
  );
  const selectedUnit = unitOptions.find(u => u.id === filters.unitId) || null;
  const lessonOptions = selectedUnit?.lessons || [];
  const selectedLesson = lessonOptions.find(l => String(l.no) === String(filters.lessonNo)) || null;
  const accentClasses = accent === 'rose'
    ? {
      border: 'focus:border-rose-500',
      button: 'bg-rose-600 hover:bg-rose-700',
      selected: 'border-rose-500 bg-rose-50 text-rose-700',
      darkSelected: 'dark:bg-rose-950/30 dark:text-rose-200',
      chip: 'bg-rose-50 text-rose-700 border-rose-200',
    }
    : {
      border: 'focus:border-indigo-500',
      button: 'bg-indigo-600 hover:bg-indigo-700',
      selected: 'border-indigo-500 bg-indigo-50 text-indigo-700',
      darkSelected: 'dark:bg-indigo-950/30 dark:text-indigo-200',
      chip: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    };

  const updateFilter = (key, value) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'grade') {
        next.semester = '';
        next.publisher = '';
        next.unitId = '';
        next.lessonNo = '';
      }
      if (key === 'semester') {
        next.publisher = '';
        next.unitId = '';
        next.lessonNo = '';
      }
      if (key === 'publisher') {
        next.unitId = '';
        next.lessonNo = '';
      }
      if (key === 'unitId') next.lessonNo = '';
      return next;
    });
  };

  const createQuizSet = async () => {
    if (!selectedUnit || !selectedLesson) {
      showToast?.('단원과 차시를 선택해주세요.', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: Number(selectedUnit.grade),
          semester: Number(selectedUnit.semester) || null,
          subject: selectedUnit.subject || '수학',
          publisher: selectedUnit.publisher || '',
          unit: selectedUnit.unitName || '',
          lessonNo: selectedLesson.no || undefined,
          lessonTitle: selectedLesson.title || undefined,
          lessonKeywords: selectedLesson.keywords?.length ? selectedLesson.keywords : undefined,
          count: Number(questionCount) || defaultQuestionCount,
          difficulty,
          saCount: 0,
        }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        if (res.status === 504) {
          throw new Error('AI 응답 시간이 초과되었습니다. 문항 수를 줄여 다시 시도해주세요.');
        }
        throw new Error(`서버 오류 (${res.status}): 올바르지 않은 응답을 받았습니다.`);
      }
      if (!res.ok) throw new Error(data.error || '문제 생성 중 오류가 발생했습니다.');

      const questions = normalizeQuizQuestions(data.questions || []);
      if (questions.length === 0 || questions.some(q => !q.question || !Array.isArray(q.options) || q.options.length < 4)) {
        throw new Error('생성된 문제 형식이 올바르지 않습니다.');
      }

      const finalTitle = `${selectedUnit.grade}학년 ${selectedUnit.semester || ''}학기 ${selectedUnit.unitName} ${selectedLesson.no}차시`;
      const ownerId = auth.currentUser?.uid || selectedClass?.teacherUid || 'admin_master_001';
      const quizSet = {
        title: finalTitle,
        grade: Number(selectedUnit.grade) || null,
        semester: Number(selectedUnit.semester) || null,
        subject: selectedUnit.subject || '수학',
        publisher: selectedUnit.publisher || null,
        part: null,
        unit: selectedUnit.unitName || null,
        unitId: selectedUnit.id,
        lessonNo: selectedLesson.no || null,
        lessonTitle: selectedLesson.title || null,
        lessonKey: buildLessonKey(selectedUnit, selectedLesson),
        difficulty,
        questions,
        questionCount: questions.length,
        ownerId,
        ownerName: auth.currentUser?.email || '선생님',
        classId: selectedClass?.id || null,
        isShared: false,
        sourceType: 'aiCoursewareLesson',
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'quizSets'), quizSet);
      onCreated?.({ id: ref.id, ...quizSet, createdAt: new Date() });
      showToast?.('AI학습관 차시 퀴즈가 생성되고 선택되었습니다.');
    } catch (err) {
      console.error(err);
      showToast?.(err.message || '퀴즈 생성 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 dark:border-slate-700 dark:from-slate-950 dark:to-slate-900">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">{description}</p>
        </div>
        {selectedLesson && (
          <div className={`text-[11px] font-extrabold px-3 py-1.5 rounded-xl border ${accentClasses.chip}`}>
            {selectedUnit?.unitName} · {selectedLesson.no}차시
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
          <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          AI학습관 차시 불러오는 중...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <select value={filters.grade} onChange={e => updateFilter('grade', e.target.value)}
              className={`border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold bg-white text-slate-800 focus:outline-none dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 ${accentClasses.border}`}>
              <option value="">학년</option>
              {grades.map(v => <option key={v} value={v}>{v}학년</option>)}
            </select>
            <select value={filters.semester} onChange={e => updateFilter('semester', e.target.value)}
              className={`border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold bg-white text-slate-800 focus:outline-none dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 ${accentClasses.border}`}>
              <option value="">학기</option>
              {semesters.map(v => <option key={v} value={v}>{v}학기</option>)}
            </select>
            <select value={filters.publisher} onChange={e => updateFilter('publisher', e.target.value)}
              className={`border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold bg-white text-slate-800 focus:outline-none dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 ${accentClasses.border}`}>
              <option value="">출판사</option>
              {publishers.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filters.unitId} onChange={e => updateFilter('unitId', e.target.value)}
              className={`border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold bg-white text-slate-800 focus:outline-none dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 ${accentClasses.border}`}>
              <option value="">단원</option>
              {unitOptions.map(u => <option key={u.id} value={u.id}>{u.unitNumber ? `${u.unitNumber}. ` : ''}{u.unitName}</option>)}
            </select>
            <select value={filters.lessonNo} onChange={e => updateFilter('lessonNo', e.target.value)}
              disabled={!selectedUnit}
              className={`border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold bg-white text-slate-800 focus:outline-none disabled:bg-slate-100 disabled:text-slate-300 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 dark:disabled:bg-slate-900 dark:disabled:text-slate-600 ${accentClasses.border}`}>
              <option value="">차시</option>
              {lessonOptions.map(l => <option key={l.no} value={l.no}>{l.no}차시 - {l.title}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div>
              <label className="block text-[11px] text-slate-500 font-bold mb-1 dark:text-slate-300">난이도</label>
              <div className="flex gap-2">
                {DIFFICULTY_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setDifficulty(opt.value)}
                    className={`flex-1 rounded-xl border-2 px-3 py-2 text-left transition-colors ${difficulty === opt.value ? `${accentClasses.selected} ${accentClasses.darkSelected}` : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900'}`}>
                    <div className="text-xs font-extrabold">{opt.label}</div>
                    <div className="text-[10px] opacity-70">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 font-bold mb-1 dark:text-slate-300">문항 수</label>
              <input type="number" min="3" max="12" value={questionCount}
                onChange={e => setQuestionCount(Math.max(3, Math.min(12, Number(e.target.value) || defaultQuestionCount)))}
                className={`w-24 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-center text-slate-800 focus:outline-none dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 ${accentClasses.border}`} />
            </div>
            <button onClick={createQuizSet} disabled={isGenerating || !selectedLesson}
              className={`h-11 px-5 rounded-xl text-white text-sm font-extrabold transition-colors disabled:opacity-40 ${accentClasses.button}`}>
              {isGenerating ? '생성 중...' : '차시 퀴즈 생성'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
