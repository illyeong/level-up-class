import { useEffect, useState } from 'react';
import { collection, doc, getDocFromServer, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ALL_COURSEWARE_GRADES, coursewareAccessKey, coursewareLessonId } from '../utils/coursewareAccess';

const defaultPolicy = grade => ({ mode: 'all', grades: [Number(grade) || 1], lessons: [] });

export default function CoursewareAccessSettings({ selectedClass }) {
  const scopeKey = coursewareAccessKey(selectedClass);
  const [policy, setPolicy] = useState(() => defaultPolicy(selectedClass?.grade));
  const [grade, setGrade] = useState(String(selectedClass?.grade || 1));
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!scopeKey) return;
    getDocFromServer(doc(db, 'aiCoursewareAccess', scopeKey)).then(snap => {
      if (!cancelled) { setPolicy(snap.exists() ? snap.data() : defaultPolicy(selectedClass?.grade)); setLoading(false); setLoadingUnits(true); }
    }).catch(() => { if (!cancelled) setError('설정을 불러오지 못했습니다. 다시 열어주세요. 기존 설정은 변경되지 않았습니다.'); });
    return () => { cancelled = true; };
  }, [scopeKey, selectedClass?.grade]);

  useEffect(() => {
    if (policy.mode !== 'lessons') return;
    let cancelled = false;
    getDocs(query(collection(db, 'curriculumUnits'), where('grade', '==', Number(grade)),
      where('subject', '==', '수학'), where('status', '==', 'approved'))).then(snap => {
      if (!cancelled) setUnits(snap.docs.map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (a.semester || 0) - (b.semester || 0) || (a.unitNumber || 0) - (b.unitNumber || 0)));
    }).catch(() => { if (!cancelled) setMessage('차시 목록을 불러오지 못했습니다. 잠시 후 학년을 다시 선택해주세요.'); })
      .finally(() => { if (!cancelled) setLoadingUnits(false); });
    return () => { cancelled = true; };
  }, [grade, policy.mode]);

  const isSelected = (unit, lesson) => (policy.lessons || []).some(item => item.key === coursewareLessonId(unit, lesson));
  const toggleLessons = (unit, lessons, checked) => setPolicy(prev => {
    const keys = new Set(lessons.map(lesson => coursewareLessonId(unit, lesson)));
    const kept = (prev.lessons || []).filter(item => !keys.has(item.key));
    return { ...prev, lessons: checked ? [...kept, ...lessons.map(lesson => ({
      key: coursewareLessonId(unit, lesson), unitId: unit.id, lessonNo: String(lesson.no), grade: Number(unit.grade),
      semester: unit.semester || 0, publisher: unit.publisher || '', unitName: unit.unitName || '', lessonTitle: lesson.title || '',
    }))] : kept };
  });
  const save = async () => {
    if (!scopeKey || loading || saving || !selectedClass?.teacherUid) return;
    if (policy.mode === 'grades' && !policy.grades?.length) return setMessage('허용할 학년을 하나 이상 선택해주세요.');
    if (policy.mode === 'lessons' && !policy.lessons?.length) return setMessage('지정할 차시를 하나 이상 선택해주세요.');
    setSaving(true); setMessage('');
    try {
      await setDoc(doc(db, 'aiCoursewareAccess', scopeKey), {
        mode: policy.mode, grades: policy.grades || [], lessons: policy.lessons || [],
        teacherUid: selectedClass.teacherUid, classId: selectedClass.id || selectedClass.classId || null,
        updatedAt: serverTimestamp(),
      });
      setMessage('저장했습니다. 이 학급의 학생 AI 학습관에 적용됩니다.');
    } catch { setMessage('저장하지 못했습니다. 서버 연결과 사용량 한도를 확인해주세요.'); }
    finally { setSaving(false); }
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-800">
    <h2 className="text-xl font-black">학생 학습 콘텐츠 지정</h2>
    <p className="mt-2 text-sm text-slate-600">현재 학급에 적용됩니다. 지정하지 않은 콘텐츠는 학생 목록에서 숨겨집니다. 기존 학습 기록과 교사 미리보기는 유지됩니다.</p>
    {(error || !scopeKey) && <p role="alert" className="mt-3 text-rose-700">{error || '학급을 먼저 선택해주세요.'}</p>}
    {message && <p role="status" className="my-3 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-800">{message}</p>}
    {loading ? <p className="py-6">{error ? '설정을 안전하게 불러올 때까지 저장할 수 없습니다.' : '설정 불러오는 중...'}</p> : <>
      <fieldset disabled={saving} className="mt-5 space-y-3">
        <legend className="font-bold">학생이 학습할 수 있는 범위</legend>
        {[['all', '전체 콘텐츠 허용'], ['grades', '선택한 학년만 허용'], ['lessons', '지정한 단원·차시만 허용']].map(([value, label]) =>
          <label key={value} className="mr-5 inline-flex items-center gap-2 text-sm font-bold">
            <input type="radio" name="courseware-access-mode" value={value} checked={policy.mode === value}
              onChange={() => { setPolicy(prev => ({ ...prev, mode: value })); setMessage(''); setLoadingUnits(true); }} />{label}
          </label>)}
        {policy.mode === 'grades' && <div className="flex flex-wrap gap-4 rounded-xl bg-slate-50 p-4">
          {ALL_COURSEWARE_GRADES.map(value => <label key={value} className="flex items-center gap-2">
            <input type="checkbox" checked={(policy.grades || []).includes(value)} onChange={event => setPolicy(prev => ({ ...prev,
              grades: event.target.checked ? [...(prev.grades || []), value] : prev.grades.filter(item => item !== value),
            }))} />{value}학년</label>)}
        </div>}
        {policy.mode === 'lessons' && <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm font-bold">차시 찾기
            <select aria-label="지정할 콘텐츠 학년" value={grade} onChange={event => { setGrade(event.target.value); setLoadingUnits(true); setUnits([]); }} className="rounded-lg border p-2">
              {ALL_COURSEWARE_GRADES.map(value => <option key={value} value={value}>{value}학년</option>)}
            </select>
          </label>
          <p className="text-sm">총 {(policy.lessons || []).length}차시 선택 · 학년을 바꾸어도 선택은 유지됩니다.</p>
          <div className="max-h-[500px] space-y-3 overflow-y-auto">
            {loadingUnits ? <p>차시 불러오는 중...</p> : !units.length ? <p>등록된 차시가 없습니다.</p> : units.map(unit => <div key={unit.id} className="rounded-xl border p-4">
              <label className="flex items-center gap-2 font-bold"><input type="checkbox"
                checked={!!unit.lessons?.length && unit.lessons.every(lesson => isSelected(unit, lesson))}
                onChange={event => toggleLessons(unit, unit.lessons || [], event.target.checked)} />
                {unit.semester || ''}학기 · {unit.unitName} · {unit.publisher || '공통'} (단원 전체)</label>
              <div className="mt-3 grid gap-2 pl-5 sm:grid-cols-2">{(unit.lessons || []).map(lesson => <label key={lesson.no} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={isSelected(unit, lesson)} onChange={event => toggleLessons(unit, [lesson], event.target.checked)} />
                {lesson.no}차시 · {lesson.title}</label>)}</div>
            </div>)}
          </div>
          {!!policy.lessons?.length && <details className="rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-bold">선택한 전체 차시 확인·해제 ({policy.lessons.length})</summary>
            {policy.lessons.map(item => <div key={item.key} className="mt-2 flex items-center justify-between gap-2">
              <span>{item.grade}학년 · {item.unitName} · {item.lessonTitle}</span>
              <button type="button" className="shrink-0 text-rose-700 underline" onClick={() => setPolicy(prev => ({ ...prev, lessons: prev.lessons.filter(row => row.key !== item.key) }))}>해제</button>
            </div>)}
          </details>}
        </div>}
      </fieldset>
      <button onClick={save} disabled={saving} className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? '저장 중...' : '학급에 적용'}</button>
    </>}
  </section>;
}
