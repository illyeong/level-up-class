import { useEffect, useMemo, useState } from 'react';
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
import { db } from '../../firebase';
import iconDiamond from '../../assets/images/icon-diamond.png';
import iconGold from '../../assets/images/icon-gold.png';
import { WRITING_TOPIC_PRESETS_BY_GRADE } from '../../data/writingTopicPresets';

const DEFAULT_REWARDS = { gold: 100, exp: 50, diamond: 50 };
const GRADE_OPTIONS = [1, 2, 3, 4, 5, 6];
const REWARD_META = {
  gold: { icon: iconGold, label: '골드', valueClass: 'text-amber-700', suffix: 'G' },
  exp: { icon: '/images/Icon_Resources_Star01_Gold.png', label: '경험치', valueClass: 'text-indigo-700', suffix: 'EXP' },
  diamond: { icon: iconDiamond, label: '다이아', valueClass: 'text-sky-700', suffix: '' },
};

const getStudentGrade = (student) => {
  const directGrade = Number(student?.grade ?? student?.classGrade);
  if (GRADE_OPTIONS.includes(directGrade)) return directGrade;

  const codeGrade = String(student?.studentCode || '').match(/-(\d)(?:-|$)/)?.[1];
  const parsedCodeGrade = Number(codeGrade);
  return GRADE_OPTIONS.includes(parsedCodeGrade) ? parsedCodeGrade : 5;
};

function RewardCard({ type, value }) {
  const meta = REWARD_META[type];
  if (!meta) return null;

  return (
    <div className="rounded-xl bg-white/10 px-4 py-2 text-white backdrop-blur">
      <div className="flex items-center justify-center gap-1.5 text-lg font-black">
        <img src={meta.icon} alt={meta.label} className="h-5 w-5 shrink-0 object-contain" />
        <span>{value}{meta.suffix}</span>
      </div>
      <div className="text-[10px] font-bold text-indigo-100">{meta.label}</div>
    </div>
  );
}

function RewardInline({ rewards = DEFAULT_REWARDS }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1">
        <img src={REWARD_META.gold.icon} alt={REWARD_META.gold.label} className="h-4 w-4 object-contain" />
        <span>{rewards.gold ?? DEFAULT_REWARDS.gold}G</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <img src={REWARD_META.exp.icon} alt={REWARD_META.exp.label} className="h-4 w-4 object-contain" />
        <span>{rewards.exp ?? DEFAULT_REWARDS.exp}EXP</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <img src={REWARD_META.diamond.icon} alt={REWARD_META.diamond.label} className="h-4 w-4 object-contain" />
        <span>{rewards.diamond ?? DEFAULT_REWARDS.diamond}</span>
      </span>
    </span>
  );
}

const STATUS_META = {
  submitted: { label: 'AI 채점 대기', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  ai_graded: { label: 'AI 채점 완료', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  reviewed: { label: '교사 확인 완료', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rewarded: { label: '보상 지급 완료', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
};

const toDateText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const date = value?.toDate?.();
  return date ? date.toLocaleDateString('ko-KR') : '';
};

const sortByRecent = (items) => [...items].sort((a, b) => {
  const at = a.submittedAt?.seconds || a.createdAt?.seconds || 0;
  const bt = b.submittedAt?.seconds || b.createdAt?.seconds || 0;
  return bt - at;
});

const getTopicMinLength = (topic) => Math.max(70, Number(topic?.minLength) || 70);

export default function TopicWriting({ studentCode, themeMode = 'dark' }) {
  const [student, setStudent] = useState(null);
  const [teacherTopics, setTeacherTopics] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('5');
  const [viewMode, setViewMode] = useState('write');
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [writingSearch, setWritingSearch] = useState('');
  const [writingStatusFilter, setWritingStatusFilter] = useState('all');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentCode) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const studentSnap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
        if (studentSnap.empty) {
          if (!cancelled) {
            setStudent(null);
            setTeacherTopics([]);
            setSubmissions([]);
            setError('학생 정보를 찾을 수 없습니다.');
          }
          return;
        }

        const studentDoc = studentSnap.docs[0];
        const studentData = { id: studentDoc.id, ...studentDoc.data() };
        const topicQueries = [];
        if (studentData.teacherUid) {
          topicQueries.push(getDocs(query(collection(db, 'writingTopics'), where('teacherUid', '==', studentData.teacherUid))));
        }
        if (studentData.classId) {
          topicQueries.push(getDocs(query(collection(db, 'writingTopics'), where('classId', '==', studentData.classId))));
        }

        const [topicSnaps, submissionSnap] = await Promise.all([
          Promise.all(topicQueries),
          getDocs(query(collection(db, 'writingSubmissions'), where('studentId', '==', studentDoc.id))),
        ]);

        const topicMap = new Map();
        topicSnaps.flatMap(snap => snap.docs).forEach(topicDoc => {
          topicMap.set(topicDoc.id, { id: topicDoc.id, ...topicDoc.data() });
        });

        const topicList = [...topicMap.values()]
          .filter(topic => topic.active !== false)
          .sort((a, b) => {
            if ((a.dueDate || '') !== (b.dueDate || '')) return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          });

        const submissionList = sortByRecent(submissionSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        if (!cancelled) {
          setStudent(studentData);
          setTeacherTopics(topicList);
          setSubmissions(submissionList);
          setSelectedGrade(String(getStudentGrade(studentData)));
        }
      } catch (err) {
        console.error('[TopicWriting] load failed:', err);
        if (!cancelled) setError('주제글쓰기 정보를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [studentCode]);

  const presetTopics = useMemo(() => {
    const grade = Number(selectedGrade) || 5;
    return (WRITING_TOPIC_PRESETS_BY_GRADE[grade] || []).map(topic => ({
      ...topic,
      id: `preset-${topic.id}`,
      source: 'preset',
      active: true,
      teacherUid: student?.teacherUid || null,
      classId: student?.classId || null,
      rewards: DEFAULT_REWARDS,
    }));
  }, [selectedGrade, student?.teacherUid, student?.classId]);

  const topics = useMemo(() => {
    const topicMap = new Map();
    teacherTopics.forEach(topic => topicMap.set(topic.id, { ...topic, source: topic.source || 'teacher' }));
    presetTopics.forEach(topic => topicMap.set(topic.id, topic));
    if (editingSubmission?.topicId && !topicMap.has(editingSubmission.topicId)) {
      topicMap.set(editingSubmission.topicId, {
        id: editingSubmission.topicId,
        title: editingSubmission.topicTitle,
        description: editingSubmission.topicDescription || '',
        grade: editingSubmission.topicGrade || Number(selectedGrade) || null,
        source: editingSubmission.topicSource || 'submitted',
        teacherUid: editingSubmission.teacherUid || student?.teacherUid || null,
        classId: editingSubmission.classId || student?.classId || null,
        rewards: editingSubmission.rewards || DEFAULT_REWARDS,
        minLength: editingSubmission.minLength || 70,
        active: true,
      });
    }
    return [...topicMap.values()];
  }, [teacherTopics, presetTopics, editingSubmission, selectedGrade, student?.teacherUid, student?.classId]);

  const activeTopicId = topics.some(topic => topic.id === selectedTopicId) ? selectedTopicId : topics[0]?.id || '';

  const selectedTopic = useMemo(
    () => topics.find(topic => topic.id === activeTopicId) || null,
    [topics, activeTopicId],
  );

  const submissionByTopic = useMemo(() => {
    const map = new Map();
    submissions.forEach(item => {
      if (!map.has(item.topicId)) map.set(item.topicId, item);
    });
    return map;
  }, [submissions]);

  const selectedSubmission = activeTopicId ? submissionByTopic.get(activeTopicId) : null;
  const isEditingSelectedSubmission = !!editingSubmission && selectedSubmission?.id === editingSubmission.id;
  const minLength = getTopicMinLength(selectedTopic);
  const charCount = content.trim().length;
  const canSubmit = !!student && !!selectedTopic && (!selectedSubmission || isEditingSelectedSubmission) && title.trim().length >= 1 && charCount >= minLength && !submitting;
  const pageDark = themeMode === 'dark';

  const filteredSubmissions = useMemo(() => {
    const keyword = writingSearch.trim().toLowerCase();
    return submissions.filter(item => {
      const matchesKeyword = !keyword || [item.title, item.topicTitle, item.content]
        .some(value => String(value || '').toLowerCase().includes(keyword));
      if (!matchesKeyword) return false;
      if (writingStatusFilter === 'grading') return item.aiStatus === 'grading';
      if (writingStatusFilter === 'feedback') return !!item.aiGrade;
      if (writingStatusFilter === 'teacher') return !!item.teacherComment || item.teacherScore != null;
      if (writingStatusFilter === 'rewarded') return !!item.rewardsPaid;
      return true;
    });
  }, [submissions, writingSearch, writingStatusFilter]);

  const reloadSubmissions = async (studentId) => {
    const snap = await getDocs(query(collection(db, 'writingSubmissions'), where('studentId', '==', studentId)));
    const list = sortByRecent(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setSubmissions(list);
    return list;
  };

  const startEditingSubmission = (item) => {
    if (item.rewardsPaid) return;
    setEditingSubmission(item);
    setSelectedTopicId(item.topicId);
    if (GRADE_OPTIONS.includes(Number(item.topicGrade))) setSelectedGrade(String(item.topicGrade));
    setTitle(item.title || '');
    setContent(item.content || '');
    setDetail(null);
    setError('');
    setViewMode('write');
  };

  const cancelEditing = () => {
    setEditingSubmission(null);
    setTitle('');
    setContent('');
    setError('');
  };

  const submitWriting = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');

    const rewards = selectedTopic.rewards || DEFAULT_REWARDS;
    let submissionRef = null;
    const targetSubmissionId = editingSubmission?.id || null;
    try {
      const payload = {
        topicId: selectedTopic.id,
        topicTitle: selectedTopic.title,
        topicDescription: selectedTopic.description || '',
        topicGrade: selectedTopic.grade || Number(selectedGrade) || null,
        topicSource: selectedTopic.source || 'teacher',
        studentId: student.id,
        studentCode: student.studentCode || studentCode,
        studentName: student.name || student.studentCode || studentCode,
        teacherUid: selectedTopic.teacherUid || student.teacherUid || null,
        classId: selectedTopic.classId || student.classId || null,
        title: title.trim(),
        content: content.trim(),
        charCount,
        status: 'submitted',
        aiStatus: 'grading',
        aiGrade: null,
        teacherScore: null,
        teacherComment: '',
        rewards,
        rewardsPaid: false,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (targetSubmissionId) {
        submissionRef = doc(db, 'writingSubmissions', targetSubmissionId);
        await updateDoc(submissionRef, {
          ...payload,
          aiError: null,
          teacherScore: null,
          teacherComment: '',
          rewardsPaid: false,
          rewrittenAt: serverTimestamp(),
        });
        setSubmissions(prev => sortByRecent(prev.map(item => (
          item.id === targetSubmissionId
            ? { ...item, ...payload, id: targetSubmissionId, aiError: null, submittedAt: { seconds: Date.now() / 1000 } }
            : item
        ))));
      } else {
        submissionRef = await addDoc(collection(db, 'writingSubmissions'), payload);
        setSubmissions(prev => [{ id: submissionRef.id, ...payload, submittedAt: { seconds: Date.now() / 1000 } }, ...prev]);
      }

      try {
        const response = await fetch('/api/grade-writing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: {
              title: selectedTopic.title,
              description: selectedTopic.description || '',
              minLength,
            },
            writing: {
              title: title.trim(),
              content: content.trim(),
              charCount,
            },
            student: {
              name: student.name || student.studentCode || '',
              grade: student.grade || selectedTopic.grade || selectedGrade || '',
            },
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'AI 채점에 실패했습니다.');

        await updateDoc(doc(db, 'writingSubmissions', submissionRef.id), {
          aiGrade: result.aiGrade,
          aiStatus: 'complete',
          status: 'ai_graded',
          aiGradedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (aiError) {
        console.error('[TopicWriting] AI grading failed:', aiError);
        await updateDoc(doc(db, 'writingSubmissions', submissionRef.id), {
          aiStatus: 'failed',
          aiError: aiError.message || 'AI 채점 실패',
          updatedAt: serverTimestamp(),
        });
      }

      const latest = await reloadSubmissions(student.id);
      setDetail(latest.find(item => item.id === submissionRef.id) || null);
      setEditingSubmission(null);
      setTitle('');
      setContent('');
    } catch (err) {
      console.error('[TopicWriting] submit failed:', err);
      setError(err.message || '제출 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">
        주제글쓰기를 불러오는 중...
      </div>
    );
  }

  return (
    <div className={`min-h-full p-4 md:p-6 ${pageDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-2xl bg-gradient-to-br from-fuchsia-600 via-indigo-700 to-slate-900 p-5 shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-fuchsia-200">Writing Mission</p>
              <h1 className="mt-1 text-2xl font-black text-white">주제글쓰기</h1>
              <p className="mt-1 text-sm font-semibold text-indigo-100">주제에 맞게 글을 쓰고 AI 피드백과 교사 확인을 받아요.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <RewardCard type="gold" value={DEFAULT_REWARDS.gold} />
              <RewardCard type="exp" value={DEFAULT_REWARDS.exp} />
              <RewardCard type="diamond" value={DEFAULT_REWARDS.diamond} />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setViewMode('write')}
            className={`rounded-xl px-4 py-2 text-sm font-black transition ${
              viewMode === 'write'
                ? 'bg-indigo-600 text-white shadow-sm'
                : pageDark ? 'bg-slate-900 text-slate-300 hover:bg-slate-800' : 'bg-white text-slate-500 hover:text-indigo-600'
            }`}
          >
            주제 쓰기
          </button>
          <button
            type="button"
            onClick={() => setViewMode('mine')}
            className={`rounded-xl px-4 py-2 text-sm font-black transition ${
              viewMode === 'mine'
                ? 'bg-indigo-600 text-white shadow-sm'
                : pageDark ? 'bg-slate-900 text-slate-300 hover:bg-slate-800' : 'bg-white text-slate-500 hover:text-indigo-600'
            }`}
          >
            내가 쓴 글
            <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[11px]">{submissions.length}</span>
          </button>
        </div>

        {viewMode === 'mine' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm md:p-5">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo-500">My Writing</p>
                <h2 className="mt-1 text-xl font-black">내가 쓴 글</h2>
              </div>
              <p className="text-sm font-bold text-slate-400">AI 피드백과 교사 코멘트를 함께 확인할 수 있어요.</p>
            </div>
            <div className="mb-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={writingSearch}
                onChange={e => setWritingSearch(e.target.value)}
                placeholder="제목, 주제, 내용으로 검색"
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold outline-none focus:border-indigo-400"
              />
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['all', '전체'],
                  ['grading', '채점중'],
                  ['feedback', 'AI완료'],
                  ['teacher', '교사확인'],
                  ['rewarded', '보상완료'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setWritingStatusFilter(value)}
                    className={`rounded-lg border px-3 py-2 text-xs font-black transition ${
                      writingStatusFilter === value
                        ? 'border-indigo-500 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {submissions.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 py-20 text-center text-sm font-bold text-slate-400">
                아직 제출한 글이 없습니다.
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 py-16 text-center text-sm font-bold text-slate-400">
                조건에 맞는 글이 없습니다.
              </div>
            ) : (
              <div className="grid max-h-[68vh] gap-2 overflow-y-auto pr-1">
                {filteredSubmissions.map(item => {
                  const meta = STATUS_META[item.status] || STATUS_META.submitted;
                  return (
                    <article key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-indigo-500">{item.topicTitle}</p>
                          <h3 className="mt-1 text-lg font-black text-slate-900">{item.title}</h3>
                          <p className="mt-1 text-xs font-semibold text-slate-400">{toDateText(item.submittedAt)} · {item.charCount || 0}자</p>
                        </div>
                        <span className={`w-fit shrink-0 rounded-full border px-3 py-1 text-[11px] font-extrabold ${meta.cls}`}>{meta.label}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm font-semibold leading-relaxed text-slate-600">
                        {item.content}
                      </p>
                      {item.aiStatus === 'grading' && (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-700">AI가 채점하는 중입니다.</div>
                      )}
                      {item.aiStatus === 'failed' && (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">AI 채점 실패: {item.aiError || '오류'}</div>
                      )}
                      {item.aiGrade && (
                        <div className="mt-3 rounded-xl border border-indigo-100 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-sm font-black text-indigo-900">AI 피드백</p>
                            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">{item.aiGrade.score}점 · {item.aiGrade.level}</span>
                          </div>
                          {item.aiGrade.studentComment && (
                            <p className="text-sm font-semibold leading-relaxed text-slate-700">{item.aiGrade.studentComment}</p>
                          )}
                        </div>
                      )}
                      {(item.teacherComment || item.teacherScore != null || item.rewardsPaid) && (
                        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                          <p className="text-sm font-black text-emerald-800">교사 확인</p>
                          {item.teacherScore != null && <p className="mt-1 text-sm font-bold text-emerald-700">교사 점수: {item.teacherScore}점</p>}
                          {item.teacherComment && <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-700">{item.teacherComment}</p>}
                          {item.rewardsPaid && <p className="mt-1 text-sm font-black text-sky-700">보상 지급 완료: <RewardInline rewards={item.rewards} /></p>}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDetail(item)}
                          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-indigo-700"
                        >
                          자세히 보기
                        </button>
                        {!item.rewardsPaid && (
                          <button
                            type="button"
                            onClick={() => startEditingSubmission(item)}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                          >
                            고쳐쓰기
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-black">주제 선택</h2>
                <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-extrabold text-indigo-700">{topics.length}개</span>
              </div>
              <div className="mb-3 grid grid-cols-3 gap-1.5">
                {GRADE_OPTIONS.map(grade => (
                  <button
                    key={grade}
                    type="button"
                    onClick={() => setSelectedGrade(String(grade))}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-black transition ${
                      selectedGrade === String(grade)
                        ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    {grade}학년
                  </button>
                ))}
              </div>
              {topics.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-400">아직 열린 주제가 없습니다.</p>
              ) : (
                <div className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1 sm:max-h-[420px] lg:max-h-[520px]">
                  {topics.map(topic => {
                    const done = submissionByTopic.has(topic.id);
                    const active = topic.id === activeTopicId;
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => setSelectedTopicId(topic.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                          done
                            ? 'border-emerald-200 bg-emerald-50'
                            : active ? 'border-indigo-400 bg-indigo-50' : 'border-slate-100 bg-slate-50 hover:border-indigo-200 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-800">{topic.title}</p>
                            <p className="mt-0.5 line-clamp-1 text-xs font-semibold leading-relaxed text-slate-500">{topic.description || '설명 없음'}</p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                              topic.source === 'preset' ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-indigo-100 text-indigo-700'
                            }`}>
                              {topic.source === 'preset' ? `${topic.grade}학년 추천` : '선생님'}
                            </span>
                            {done && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">작성 완료</span>}
                          </div>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] font-bold text-slate-500">
                          <span className="rounded bg-white px-2 py-0.5">최소 {getTopicMinLength(topic)}자</span>
                          {topic.dueDate && <span className="rounded bg-white px-2 py-0.5">마감 {topic.dueDate}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
              <h2 className="mb-3 font-black">내 제출 기록</h2>
              {submissions.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-400">아직 제출한 글이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {submissions.map(item => {
                    const meta = STATUS_META[item.status] || STATUS_META.submitted;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setDetail(item)}
                        className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3 text-left hover:border-indigo-200 hover:bg-white"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-800">{item.title}</p>
                            <p className="truncate text-xs font-semibold text-slate-500">{item.topicTitle}</p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${meta.cls}`}>{meta.label}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-slate-400">
                          <span>{item.charCount || 0}자</span>
                          {item.aiGrade?.score != null && <span>AI {item.aiGrade.score}점</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm md:p-5">
            {selectedTopic ? (
              selectedSubmission && !isEditingSelectedSubmission ? (
                <div className="flex min-h-[520px] flex-col items-center justify-center rounded-2xl bg-emerald-50 p-6 text-center">
                  <div className="text-5xl">✅</div>
                  <h2 className="mt-3 text-xl font-black text-emerald-800">제출 완료</h2>
                  <p className="mt-1 text-sm font-semibold text-emerald-700">이 주제는 작성이 완료되었습니다. AI 피드백과 교사 코멘트를 확인할 수 있어요.</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDetail(selectedSubmission)}
                      className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-700"
                    >
                      제출 글 보기
                    </button>
                    {!selectedSubmission.rewardsPaid && (
                      <button
                        type="button"
                        onClick={() => startEditingSubmission(selectedSubmission)}
                        className="rounded-xl border border-emerald-200 bg-white px-5 py-2.5 text-sm font-extrabold text-emerald-700 hover:border-emerald-400"
                      >
                        고쳐쓰기
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {editingSubmission && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-black text-emerald-600">고쳐쓰기 중</p>
                          <p className="mt-1 text-sm font-bold text-emerald-800">내용을 수정한 뒤 다시 제출하면 AI가 새로 채점합니다.</p>
                        </div>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-emerald-700 hover:bg-emerald-100"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-extrabold text-indigo-500">오늘의 주제</p>
                        <h2 className="mt-1 text-xl font-black text-slate-900">{selectedTopic.title}</h2>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-600">{selectedTopic.description || '주제 설명이 없습니다.'}</p>
                      </div>
                      <div className="shrink-0 rounded-xl bg-white px-4 py-3 text-xs font-bold text-slate-600 shadow-sm">
                        <div>최소 {minLength}자</div>
                        {selectedTopic.dueDate && <div className="mt-1">마감 {selectedTopic.dueDate}</div>}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-extrabold text-slate-500">글 제목</label>
                    <input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="글 제목을 입력하세요"
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-400"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="block text-xs font-extrabold text-slate-500">본문</label>
                      <span className={`text-xs font-black ${charCount >= minLength ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {charCount}/{minLength}자
                      </span>
                    </div>
                    <textarea
                      value={content}
                      onChange={e => setContent(e.target.value)}
                      placeholder="주제에 맞게 내 생각과 이유, 예시를 자세히 써 보세요."
                      rows={16}
                      className="w-full resize-none rounded-xl border-2 border-slate-200 px-4 py-3 text-sm leading-relaxed outline-none focus:border-indigo-400"
                    />
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${charCount >= minLength ? 'bg-emerald-500' : 'bg-indigo-400'}`}
                        style={{ width: `${Math.min(100, (charCount / minLength) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={submitWriting}
                    disabled={!canSubmit}
                    className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 py-4 text-base font-black text-white shadow-lg shadow-indigo-100 transition disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting ? '제출하고 AI 채점 중...' : editingSubmission ? '고쳐쓰기 제출하기' : '제출하기'}
                  </button>
                </div>
              )
            ) : (
              <div className="flex min-h-[520px] items-center justify-center rounded-2xl bg-slate-50 text-center text-sm font-bold text-slate-400">
                교사가 주제를 만들면 이곳에 표시됩니다.
              </div>
            )}
          </section>
        </div>
        )}
      </div>

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && setDetail(null)}
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50 p-4">
              <div>
                <p className="text-xs font-bold text-indigo-500">{detail.topicTitle}</p>
                <h3 className="mt-1 text-lg font-black">{detail.title}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-400">{toDateText(detail.submittedAt)} · {detail.charCount || 0}자</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg px-3 py-1 text-xl font-bold text-slate-400 hover:bg-white">×</button>
            </div>
            <div className="max-h-[calc(90vh-92px)] overflow-y-auto p-5 space-y-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{detail.content}</p>
              </div>

              {detail.aiStatus === 'grading' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">AI가 채점하는 중입니다.</div>
              )}
              {detail.aiStatus === 'failed' && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">AI 채점 실패: {detail.aiError || '오류'}</div>
              )}
              {detail.aiGrade && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-black text-indigo-900">AI 피드백</h4>
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-indigo-700">{detail.aiGrade.score}점 · {detail.aiGrade.level}</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-white p-3">
                      <p className="mb-2 text-xs font-black text-emerald-600">잘한 점</p>
                      <ul className="space-y-1 text-sm font-semibold text-slate-700">
                        {(detail.aiGrade.strengths || []).map((text, idx) => <li key={idx}>· {text}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <p className="mb-2 text-xs font-black text-amber-600">고치면 좋은 점</p>
                      <ul className="space-y-1 text-sm font-semibold text-slate-700">
                        {(detail.aiGrade.improvements || []).map((text, idx) => <li key={idx}>· {text}</li>)}
                      </ul>
                    </div>
                  </div>
                  {detail.aiGrade.studentComment && (
                    <p className="mt-3 rounded-xl bg-white p-3 text-sm font-semibold leading-relaxed text-slate-700">{detail.aiGrade.studentComment}</p>
                  )}
                </div>
              )}

              {(detail.teacherComment || detail.teacherScore != null || detail.rewardsPaid) && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <h4 className="font-black text-emerald-800">교사 확인</h4>
                  {detail.teacherScore != null && <p className="mt-2 text-sm font-bold text-emerald-700">교사 점수: {detail.teacherScore}점</p>}
                  {detail.teacherComment && <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-700">{detail.teacherComment}</p>}
                  {detail.rewardsPaid && (
                    <p className="mt-2 text-sm font-black text-sky-700">
                      보상 지급 완료: <RewardInline rewards={detail.rewards} />
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
