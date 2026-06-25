import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import iconDiamond from '../../assets/images/icon-diamond.png';
import iconGold from '../../assets/images/icon-gold.png';
import { applyExpDelta } from '../../utils/leveling';

const DEFAULT_REWARDS = { gold: 100, exp: 50, diamond: 50 };
const REWARD_META = {
  gold: { icon: iconGold, label: 'Gold', valueClass: 'text-amber-700', suffix: 'G' },
  exp: { icon: '/images/Icon_Resources_Star01_Gold.png', label: 'EXP', valueClass: 'text-indigo-700', suffix: 'EXP' },
  diamond: { icon: iconDiamond, label: 'Diamond', valueClass: 'text-sky-700', suffix: '' },
};

function RewardPill({ type, value, compact = false }) {
  const meta = REWARD_META[type];
  if (!meta) return null;

  return (
    <div className={`flex items-center justify-center gap-1.5 rounded-lg bg-white ${compact ? 'px-2 py-2' : 'px-3 py-2'}`}>
      <img src={meta.icon} alt={meta.label} className="h-4 w-4 shrink-0 object-contain" />
      <span className={`text-sm font-black ${meta.valueClass}`}>{value}{meta.suffix}</span>
    </div>
  );
}

function RewardInline({ rewards = DEFAULT_REWARDS }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1">
        <img src={REWARD_META.gold.icon} alt={REWARD_META.gold.label} className="h-3.5 w-3.5 object-contain" />
        <span>{rewards.gold ?? DEFAULT_REWARDS.gold}G</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <img src={REWARD_META.exp.icon} alt={REWARD_META.exp.label} className="h-3.5 w-3.5 object-contain" />
        <span>{rewards.exp ?? DEFAULT_REWARDS.exp}EXP</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <img src={REWARD_META.diamond.icon} alt={REWARD_META.diamond.label} className="h-3.5 w-3.5 object-contain" />
        <span>{rewards.diamond ?? DEFAULT_REWARDS.diamond}</span>
      </span>
    </span>
  );
}

const DEFAULT_TOPIC = {
  title: '',
  description: '',
  minLength: 200,
  dueDate: '',
  active: true,
  rewards: DEFAULT_REWARDS,
};

const STATUS_META = {
  submitted: { label: 'AI 대기', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  ai_graded: { label: 'AI 완료', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  reviewed: { label: '확인 완료', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rewarded: { label: '보상 지급', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
};

const toDateText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const date = value?.toDate?.();
  return date ? date.toLocaleString('ko-KR') : '';
};

const sortRecent = (items) => [...items].sort((a, b) => {
  const at = a.submittedAt?.seconds || a.createdAt?.seconds || 0;
  const bt = b.submittedAt?.seconds || b.createdAt?.seconds || 0;
  return bt - at;
});

export default function TopicWritingManage({ selectedClass }) {
  const teacherUid = selectedClass?.teacherUid || null;
  const classId = selectedClass?.id || null;

  const [tab, setTab] = useState('submissions');
  const [topics, setTopics] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(DEFAULT_TOPIC);
  const [savingTopic, setSavingTopic] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [teacherScore, setTeacherScore] = useState('');
  const [teacherComment, setTeacherComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('needsReview');
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2600);
  };

  const loadData = useCallback(async () => {
    if (!teacherUid) return;
    setLoading(true);
    try {
      const [topicSnap, submissionSnap, studentSnap] = await Promise.all([
        getDocs(query(collection(db, 'writingTopics'), where('teacherUid', '==', teacherUid))),
        getDocs(query(collection(db, 'writingSubmissions'), where('teacherUid', '==', teacherUid))),
        getDocs(query(collection(db, 'students'), where('teacherUid', '==', teacherUid))),
      ]);
      setTopics(topicSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setSubmissions(sortRecent(submissionSnap.docs.map(d => ({ id: d.id, ...d.data() }))));
      setStudents(studentSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('[TopicWritingManage] load failed:', err);
      showToast('데이터를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [teacherUid]);

  useEffect(() => {
    if (!teacherUid) return undefined;
    const timer = setTimeout(() => { loadData(); }, 0);
    return () => clearTimeout(timer);
  }, [teacherUid, loadData]);

  const stats = useMemo(() => {
    const submittedStudentIds = new Set(submissions.map(item => item.studentId));
    return {
      topicCount: topics.filter(topic => topic.active !== false).length,
      submissionCount: submissions.length,
      pendingCount: submissions.filter(item => !item.rewardsPaid && item.status !== 'rewarded').length,
      submittedStudents: students.filter(student => submittedStudentIds.has(student.id)).length,
    };
  }, [topics, submissions, students]);

  const filteredSubmissions = submissions.filter(item => {
    if (statusFilter === 'needsReview') return !item.rewardsPaid && item.status !== 'rewarded';
    if (statusFilter === 'rewarded') return item.rewardsPaid || item.status === 'rewarded';
    if (statusFilter === 'aiFailed') return item.aiStatus === 'failed';
    return true;
  });

  const openSubmission = (item) => {
    setSelectedSubmission(item);
    setTeacherScore(item.teacherScore ?? item.aiGrade?.score ?? '');
    setTeacherComment(item.teacherComment || '');
  };

  const createTopic = async () => {
    if (!teacherUid) return showToast('교사 정보가 없습니다.', 'error');
    if (!form.title.trim()) return showToast('주제 제목을 입력해주세요.', 'error');
    setSavingTopic(true);
    try {
      await addDoc(collection(db, 'writingTopics'), {
        title: form.title.trim(),
        description: form.description.trim(),
        minLength: Math.max(1, Number(form.minLength) || 100),
        dueDate: form.dueDate || '',
        active: form.active !== false,
        rewards: DEFAULT_REWARDS,
        teacherUid,
        classId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm(DEFAULT_TOPIC);
      showToast('주제가 생성되었습니다.');
      await loadData();
    } catch (err) {
      console.error('[TopicWritingManage] create topic failed:', err);
      showToast('주제 생성에 실패했습니다.', 'error');
    } finally {
      setSavingTopic(false);
    }
  };

  const toggleTopicActive = async (topic) => {
    try {
      await updateDoc(doc(db, 'writingTopics', topic.id), {
        active: topic.active === false,
        updatedAt: serverTimestamp(),
      });
      setTopics(prev => prev.map(item => item.id === topic.id ? { ...item, active: topic.active === false } : item));
    } catch {
      showToast('상태 변경에 실패했습니다.', 'error');
    }
  };

  const saveReview = async () => {
    if (!selectedSubmission) return;
    setProcessing(true);
    try {
      const score = teacherScore === '' ? null : Math.max(0, Math.min(100, Number(teacherScore) || 0));
      const updates = {
        teacherScore: score,
        teacherComment: teacherComment.trim(),
        status: selectedSubmission.rewardsPaid ? 'rewarded' : 'reviewed',
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'writingSubmissions', selectedSubmission.id), updates);
      setSubmissions(prev => prev.map(item => item.id === selectedSubmission.id ? { ...item, ...updates } : item));
      setSelectedSubmission(prev => prev ? { ...prev, ...updates } : prev);
      showToast('교사 확인 내용을 저장했습니다.');
    } catch (err) {
      console.error('[TopicWritingManage] save review failed:', err);
      showToast('저장에 실패했습니다.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const payReward = async () => {
    if (!selectedSubmission || selectedSubmission.rewardsPaid) return;
    setProcessing(true);
    try {
      const studentRef = doc(db, 'students', selectedSubmission.studentId);
      const studentSnap = await getDoc(studentRef);
      if (!studentSnap.exists()) throw new Error('학생 문서를 찾을 수 없습니다.');

      const student = studentSnap.data();
      const rewards = selectedSubmission.rewards || DEFAULT_REWARDS;
      const progress = applyExpDelta(student.level ?? 1, student.exp ?? 0, rewards.exp || 0);
      const score = teacherScore === '' ? selectedSubmission.aiGrade?.score ?? null : Math.max(0, Math.min(100, Number(teacherScore) || 0));
      const batch = writeBatch(db);

      batch.update(studentRef, {
        gold: (student.gold || 0) + (rewards.gold || 0),
        diamonds: (student.diamonds || 0) + (rewards.diamond || 0),
        level: progress.level,
        exp: progress.exp,
        maxExp: progress.maxExp,
      });
      batch.update(doc(db, 'writingSubmissions', selectedSubmission.id), {
        teacherScore: score,
        teacherComment: teacherComment.trim(),
        status: 'rewarded',
        rewardsPaid: true,
        reviewedAt: serverTimestamp(),
        rewardedAt: serverTimestamp(),
        rewardedBy: teacherUid,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, 'writingRewardLogs')), {
        submissionId: selectedSubmission.id,
        topicId: selectedSubmission.topicId,
        studentId: selectedSubmission.studentId,
        studentName: selectedSubmission.studentName || '',
        teacherUid,
        classId,
        rewards,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      showToast(`보상 지급 완료: ${rewards.gold}G / ${rewards.exp}EXP / ${rewards.diamond}Dia`);
      setSelectedSubmission(null);
      await loadData();
    } catch (err) {
      console.error('[TopicWritingManage] pay reward failed:', err);
      showToast(err.message || '보상 지급에 실패했습니다.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-indigo-500">Writing Admin</p>
              <h1 className="mt-1 text-2xl font-black text-slate-800">주제글쓰기 관리</h1>
              <p className="mt-1 text-sm font-semibold text-slate-500">주제를 만들고 AI 채점 결과, 교사 코멘트, 보상 지급을 관리합니다.</p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-indigo-50 px-4 py-2">
                <div className="text-lg font-black text-indigo-700">{stats.topicCount}</div>
                <div className="text-[10px] font-bold text-indigo-400">열린 주제</div>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-2">
                <div className="text-lg font-black text-slate-700">{stats.submissionCount}</div>
                <div className="text-[10px] font-bold text-slate-400">제출</div>
              </div>
              <div className="rounded-xl bg-amber-50 px-4 py-2">
                <div className="text-lg font-black text-amber-700">{stats.pendingCount}</div>
                <div className="text-[10px] font-bold text-amber-500">확인 대기</div>
              </div>
              <div className="rounded-xl bg-emerald-50 px-4 py-2">
                <div className="text-lg font-black text-emerald-700">{stats.submittedStudents}/{students.length}</div>
                <div className="text-[10px] font-bold text-emerald-500">참여 학생</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ['submissions', '제출물 확인'],
            ['topics', '주제 만들기'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-xl px-5 py-2.5 text-sm font-extrabold ${
                tab === id ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'topics' && (
          <div className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-black text-slate-800">새 주제 생성</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-extrabold text-slate-500">주제 제목</label>
                  <input
                    value={form.title}
                    onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="예: 내가 가장 아끼는 물건"
                    className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-extrabold text-slate-500">주제 설명</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="학생이 어떤 내용을 쓰면 좋을지 안내하세요."
                    rows={5}
                    className="w-full resize-none rounded-xl border-2 border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-extrabold text-slate-500">최소 글자 수</label>
                    <input
                      type="number"
                      min={1}
                      value={form.minLength}
                      onChange={e => setForm(prev => ({ ...prev, minLength: Number(e.target.value) || 1 }))}
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-extrabold text-slate-500">마감일</label>
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={e => setForm(prev => ({ ...prev, dueDate: e.target.value }))}
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <p className="mb-2 text-xs font-black text-amber-700">기본 보상</p>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm font-black">
                    <RewardPill type="gold" value={DEFAULT_REWARDS.gold} />
                    <RewardPill type="exp" value={DEFAULT_REWARDS.exp} />
                    <RewardPill type="diamond" value={DEFAULT_REWARDS.diamond} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={createTopic}
                  disabled={savingTopic}
                  className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  {savingTopic ? '생성 중...' : '주제 만들기'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-black text-slate-800">주제 목록</h2>
              {topics.length === 0 ? (
                <div className="rounded-xl bg-slate-50 py-16 text-center text-sm font-bold text-slate-400">아직 만든 주제가 없습니다.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {topics.map(topic => (
                    <div key={topic.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-black text-slate-800">{topic.title}</h3>
                          <p className="mt-1 line-clamp-2 text-sm font-semibold leading-relaxed text-slate-500">{topic.description || '설명 없음'}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${topic.active === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>
                          {topic.active === false ? '종료' : '진행'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                        <span className="rounded bg-slate-50 px-2 py-1">최소 {topic.minLength || 100}자</span>
                        {topic.dueDate && <span className="rounded bg-slate-50 px-2 py-1">마감 {topic.dueDate}</span>}
                        <span className="rounded bg-amber-50 px-2 py-1 text-amber-700"><RewardInline rewards={topic.rewards} /></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleTopicActive(topic)}
                        className={`mt-3 w-full rounded-xl py-2 text-xs font-black ${
                          topic.active === false ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-700 text-white hover:bg-slate-800'
                        }`}
                      >
                        {topic.active === false ? '다시 열기' : '종료하기'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'submissions' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-black text-slate-800">제출물 확인</h2>
              <div className="flex flex-wrap gap-2">
                {[
                  ['needsReview', '확인 대기'],
                  ['all', '전체'],
                  ['rewarded', '보상 완료'],
                  ['aiFailed', 'AI 실패'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStatusFilter(id)}
                    className={`rounded-xl px-3 py-2 text-xs font-black ${
                      statusFilter === id ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="py-20 text-center text-sm font-bold text-slate-400">불러오는 중...</div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="rounded-xl bg-slate-50 py-16 text-center text-sm font-bold text-slate-400">조건에 맞는 제출물이 없습니다.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredSubmissions.map(item => {
                  const meta = STATUS_META[item.status] || STATUS_META.submitted;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openSubmission(item)}
                      className="rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">{item.studentName || item.studentCode}</p>
                          <p className="truncate text-xs font-bold text-slate-400">{item.topicTitle}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${meta.cls}`}>{meta.label}</span>
                      </div>
                      <h3 className="truncate text-sm font-black text-slate-700">{item.title}</h3>
                      <p className="mt-1 line-clamp-3 text-xs font-semibold leading-relaxed text-slate-500">{item.content}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-slate-400">
                        <span>{item.charCount || 0}자</span>
                        {item.aiGrade?.score != null && <span>AI {item.aiGrade.score}점</span>}
                        {item.aiStatus === 'failed' && <span className="text-rose-500">AI 실패</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedSubmission && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && setSelectedSubmission(null)}
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50 p-4">
              <div>
                <p className="text-xs font-bold text-indigo-500">{selectedSubmission.topicTitle}</p>
                <h3 className="mt-1 text-xl font-black text-slate-800">{selectedSubmission.title}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {selectedSubmission.studentName || selectedSubmission.studentCode} · {toDateText(selectedSubmission.submittedAt)}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedSubmission(null)} className="rounded-lg px-3 py-1 text-xl font-bold text-slate-400 hover:bg-white">×</button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4 p-5">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selectedSubmission.content}</p>
                </div>

                {selectedSubmission.aiStatus === 'failed' && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                    AI 채점 실패: {selectedSubmission.aiError || '오류'}
                  </div>
                )}

                {selectedSubmission.aiGrade && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="font-black text-indigo-900">AI 자동채점 결과</h4>
                      <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-indigo-700">
                        {selectedSubmission.aiGrade.score}점 · {selectedSubmission.aiGrade.level}
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl bg-white p-3">
                        <p className="mb-2 text-xs font-black text-emerald-600">잘한 점</p>
                        <ul className="space-y-1 text-sm font-semibold text-slate-700">
                          {(selectedSubmission.aiGrade.strengths || []).map((text, idx) => <li key={idx}>· {text}</li>)}
                        </ul>
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <p className="mb-2 text-xs font-black text-amber-600">고치면 좋은 점</p>
                        <ul className="space-y-1 text-sm font-semibold text-slate-700">
                          {(selectedSubmission.aiGrade.improvements || []).map((text, idx) => <li key={idx}>· {text}</li>)}
                        </ul>
                      </div>
                    </div>
                    {selectedSubmission.aiGrade.studentComment && (
                      <div className="mt-3 rounded-xl bg-white p-3">
                        <p className="text-xs font-black text-slate-400">학생에게 보이는 AI 코멘트</p>
                        <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">{selectedSubmission.aiGrade.studentComment}</p>
                      </div>
                    )}
                    {selectedSubmission.aiGrade.teacherViewComment && (
                      <div className="mt-3 rounded-xl bg-white p-3">
                        <p className="text-xs font-black text-fuchsia-500">교사용 AI 관찰 코멘트</p>
                        <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">{selectedSubmission.aiGrade.teacherViewComment}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <aside className="border-t border-slate-100 bg-white p-5 lg:border-l lg:border-t-0">
                <div className="sticky top-0 space-y-4">
                  <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                    <p className="mb-2 text-xs font-black text-amber-700">지급 보상</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm font-black">
                      <RewardPill type="gold" value={selectedSubmission.rewards?.gold ?? DEFAULT_REWARDS.gold} compact />
                      <RewardPill type="exp" value={selectedSubmission.rewards?.exp ?? DEFAULT_REWARDS.exp} compact />
                      <RewardPill type="diamond" value={selectedSubmission.rewards?.diamond ?? DEFAULT_REWARDS.diamond} compact />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-extrabold text-slate-500">교사 점수</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={teacherScore}
                      onChange={e => setTeacherScore(e.target.value)}
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-extrabold text-slate-500">교사 코멘트</label>
                    <textarea
                      value={teacherComment}
                      onChange={e => setTeacherComment(e.target.value)}
                      placeholder="학생에게 남길 코멘트를 입력하세요."
                      rows={7}
                      className="w-full resize-none rounded-xl border-2 border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400"
                    />
                  </div>

                  {selectedSubmission.rewardsPaid ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-700">
                      이미 보상이 지급되었습니다.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={saveReview}
                        disabled={processing}
                        className="rounded-xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        확인만 저장
                      </button>
                      <button
                        type="button"
                        onClick={payReward}
                        disabled={processing}
                        className="rounded-xl bg-emerald-600 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-40"
                      >
                        보상 지급
                      </button>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-black text-white shadow-2xl ${
          toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
