import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

// ── 상수 ─────────────────────────────────────────────────────
const MASTERY = {
  excellent: { label: '매우 훌륭', emoji: '🏆', bar: 'bg-amber-400',  text: 'text-amber-600',  light: 'bg-amber-50 border-amber-200' },
  good:      { label: '훌륭',     emoji: '⭐', bar: 'bg-sky-400',    text: 'text-sky-600',    light: 'bg-sky-50 border-sky-200'     },
  normal:    { label: '보통',     emoji: '👍', bar: 'bg-emerald-400', text: 'text-emerald-600', light: 'bg-emerald-50 border-emerald-200' },
  retry:     { label: '재도전',   emoji: '🔄', bar: 'bg-rose-400',   text: 'text-rose-500',   light: 'bg-rose-50 border-rose-200'   },
};
const MASTERY_ATTEMPTS = 4;
const COURSEWARE_PREGENERATE_COUNT = 20;
const COURSEWARE_CHUNK_SIZE = 5;
const COURSEWARE_MAX_CHUNK_CALLS = 6;
const COURSEWARE_MAX_CHUNK_FAILURES = 2;
const COURSEWARE_QUALITY_VERSION = 'quality-v19-grade56-scope-guard';
const isCurrentLessonContent = (data) =>
  data?.generatorVersion === COURSEWARE_QUALITY_VERSION &&
  Array.isArray(data.questions);
const isFreshLessonContent = (data) =>
  isCurrentLessonContent(data) &&
  data.questions.length >= COURSEWARE_PREGENERATE_COUNT &&
  data.questions.every(question => {
    const options = Array.isArray(question?.options) ? question.options : [];
    return options.length === 4
      && Number.isInteger(question?.answerIndex)
      && question.answerIndex >= 0
      && question.answerIndex <= 3
      && new Set(options.map(option => String(option).normalize('NFKC').replace(/\s+/g, '').toLowerCase())).size === 4;
  });
const getMasteryLevel = (avg) =>
  avg >= 90 ? 'excellent' : avg >= 75 ? 'good' : avg >= 60 ? 'normal' : 'retry';

const lessonKey = (unit, lesson) =>
  `v2_${unit.grade}_${unit.semester || 0}_${unit.publisher || 'default'}_${unit.id}_${lesson.no}`;

const scoreColor = (s) =>
  s >= 90 ? 'text-amber-500' : s >= 75 ? 'text-sky-500' : s >= 60 ? 'text-emerald-500' : 'text-rose-500';

const fmtDate = (str) => {
  if (!str) return '-';
  return new Date(str).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

const LEARNING_STATUS = {
  excellent: { label: '우수', tone: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  stable:    { label: '안정', tone: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-400' },
  learning:  { label: '학습 중', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400' },
  support:   { label: '지원 필요', tone: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-400' },
  inactive:  { label: '미학습', tone: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-300' },
};

const getCompletedSeconds = (progress) =>
  progress?.completedAt?.seconds || progress?.completedAt?._seconds || 0;

const isWithinPeriod = (progress, period) => {
  if (period === 'all') return true;
  const days = Number(period);
  const completedSeconds = getCompletedSeconds(progress);
  const completedDate = completedSeconds
    ? new Date(completedSeconds * 1000)
    : progress?.date ? new Date(`${progress.date}T23:59:59`) : null;
  if (!completedDate || Number.isNaN(completedDate.getTime())) return false;
  const threshold = new Date();
  threshold.setHours(0, 0, 0, 0);
  threshold.setDate(threshold.getDate() - (days - 1));
  return completedDate >= threshold;
};

const classifyWeakConcept = (wrong) => {
  const text = `${wrong?.unitName || ''} ${wrong?.lessonTitle || ''} ${wrong?.skill || ''} ${wrong?.fullQuestion || wrong?.questionText || ''}`;
  if (/분수|분모|분자|소수/.test(text)) return '분수·소수';
  if (/약수|배수|공약수|공배수|규칙/.test(text)) return '약수·배수·규칙';
  if (/그래프|표|자료|평균|가능성|확률/.test(text)) return '자료·그래프·가능성';
  if (/대칭|합동|도형|각도|직육면체|정육면체|원뿔|원기둥|꼭짓점|모서리|면/.test(text)) return '도형·대칭·입체';
  if (/길이|넓이|부피|무게|시간|시각|단위/.test(text)) return '측정';
  if (/더하|빼기|덧셈|뺄셈|곱셈|나눗셈|계산/.test(text)) return '수와 연산';
  return '기타 핵심 개념';
};

// ── 미니 컴포넌트 ─────────────────────────────────────────────
const Spinner = ({ label = '불러오는 중...' }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
    <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-400 rounded-full animate-spin" />
    <span className="text-sm">{label}</span>
  </div>
);

const StatCard = ({ icon, label, value, sub, accent = 'indigo' }) => {
  const colors = {
    indigo: 'from-indigo-500 to-indigo-600 shadow-indigo-200',
    emerald: 'from-emerald-500 to-teal-600 shadow-emerald-200',
    amber: 'from-amber-400 to-orange-500 shadow-amber-200',
    sky: 'from-sky-400 to-cyan-500 shadow-sky-200',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[accent]} rounded-2xl p-4 shadow-lg text-white`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-2xl font-extrabold">{value}</div>
      {sub && <div className="text-white/60 text-xs">{sub}</div>}
      <div className="text-white/80 text-xs mt-1 font-semibold">{label}</div>
    </div>
  );
};

const MasteryPill = ({ level }) => {
  if (!level) return null;
  const m = MASTERY[level] || MASTERY.retry;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${m.light} ${m.text}`}>
      {m.emoji} {m.label}
    </span>
  );
};

const ProgressBar = ({ pct, color = 'bg-indigo-400', h = 'h-1.5' }) => (
  <div className={`w-full ${h} bg-slate-100 rounded-full overflow-hidden`}>
    <div className={`${h} ${color} rounded-full transition-all`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </div>
);

const LearningStatusPill = ({ status }) => {
  const item = LEARNING_STATUS[status] || LEARNING_STATUS.inactive;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${item.tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
      {item.label}
    </span>
  );
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export default function AICoursewareManage({ selectedClass, onNavigate }) {
  const teacherUid = selectedClass?.teacherUid;

  const [tab, setTab] = useState('overview');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [analysisPeriod, setAnalysisPeriod] = useState('7');

  const createReviewQuizDraft = useCallback((wrongAnswers, title = 'AI 학습관 취약 개념 복습') => {
    const unique = [];
    const seen = new Set();
    wrongAnswers.forEach(item => {
      const question = item.fullQuestion || item.questionText || '';
      if (!question || seen.has(question)) return;
      seen.add(question);
      unique.push({
        type: 'mc',
        question,
        options: Array.isArray(item.options) ? item.options : [],
        answer: Number.isInteger(item.correctIdx) ? item.correctIdx : 0,
        explanation: item.explanation || '',
      });
    });
    if (!unique.length) return;
    sessionStorage.setItem('aiReviewQuizDraft', JSON.stringify({
      title,
      grade: selectedClass?.grade || '',
      questions: unique.slice(0, 10),
    }));
    onNavigate?.('quizBank');
  }, [onNavigate, selectedClass?.grade]);

  // 공통 데이터
  const [students,    setStudents]    = useState([]);
  const [allProgress, setAllProgress] = useState([]);
  const [allMastery,  setAllMastery]  = useState({});
  const [loadingData, setLoadingData] = useState(false);

  // 단원별 탭
  const classGrade = selectedClass?.grade ? String(selectedClass.grade) : '';
  const [unitGrade, setUnitGrade] = useState(classGrade);
  const [unitSem,   setUnitSem]   = useState('all');
  useEffect(() => { if (classGrade && !unitGrade) setUnitGrade(classGrade); }, [classGrade]);
  const [units,          setUnits]          = useState([]);
  const [loadingUnits,   setLoadingUnits]   = useState(false);
  const [selectedUnit,   setSelectedUnit]   = useState(null);
  const [expandedLesson, setExpandedLesson] = useState(null);

  // ── 데이터 로드 ────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!teacherUid) return;
    setLoadingData(true);
    try {
      const stuSnap = await getDocs(query(collection(db, 'students'), where('teacherUid', '==', teacherUid)));
      const stuList = stuSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => parseInt(a.studentCode?.slice(-2) || 0) - parseInt(b.studentCode?.slice(-2) || 0));
      setStudents(stuList);

      const codes = stuList.map(s => s.studentCode).filter(Boolean);
      if (!codes.length) return;

      const progSnap = await getDocs(collection(db, 'aiStudentProgress'));
      setAllProgress(progSnap.docs.map(d => d.data()).filter(p => codes.includes(p.studentCode) && p.status === 'completed'));

      const batches = [];
      for (let i = 0; i < codes.length; i += 10) batches.push(codes.slice(i, i + 10));
      const snaps = await Promise.all(batches.map(b => getDocs(query(collection(db, 'aiLessonMastery'), where('studentCode', 'in', b)))));
      const mMap = {};
      snaps.forEach(s => s.forEach(d => { const m = d.data(); if (!mMap[m.lessonKey]) mMap[m.lessonKey] = {}; mMap[m.lessonKey][m.studentCode] = m; }));
      setAllMastery(mMap);
    } catch (e) { console.error(e); }
    finally { setLoadingData(false); }
  }, [teacherUid]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!unitGrade) { setUnits([]); setSelectedUnit(null); return; }
    setLoadingUnits(true);
    getDocs(query(collection(db, 'curriculumUnits'), where('grade', '==', parseInt(unitGrade)), where('subject', '==', '수학'), where('status', '==', 'approved')))
      .then(s => setUnits(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.semester || 0) - (b.semester || 0) || (a.unitNumber || 0) - (b.unitNumber || 0))))
      .finally(() => setLoadingUnits(false));
    setSelectedUnit(null); setExpandedLesson(null);
  }, [unitGrade]);

  // ── 파생 데이터 ─────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const analysisProgress = allProgress.filter(progress => isWithinPeriod(progress, analysisPeriod));
  const todayProg = analysisProgress.filter(p => p.date === today);
  const scores = analysisProgress.map(p => p.score).filter(s => s != null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const studentStats = students.map(stu => {
    const progs = analysisProgress.filter(p => p.studentCode === stu.studentCode);
    const allStudentProgress = allProgress
      .filter(p => p.studentCode === stu.studentCode)
      .sort((a, b) => getCompletedSeconds(b) - getCompletedSeconds(a));
    const sc = progs.map(p => p.score).filter(s => s != null);
    const stuMasteries = Object.values(allMastery).map(lm => lm[stu.studentCode]).filter(m => m?.masteryLevel);
    const recentProgress = [...progs].sort((a, b) => getCompletedSeconds(b) - getCompletedSeconds(a));
    const recentScores = recentProgress.slice(0, 4).map(p => p.score).filter(s => s != null);
    const masteryScores = stuMasteries.map(m => m.masteryAvg).filter(s => s != null);
    const masteryAvg = masteryScores.length
      ? Math.round(masteryScores.reduce((sum, score) => sum + score, 0) / masteryScores.length)
      : null;
    const latestScore = recentScores[0] ?? null;
    const previousAvg = recentScores.length > 1
      ? Math.round(recentScores.slice(1).reduce((sum, score) => sum + score, 0) / (recentScores.length - 1))
      : null;
    const trend = latestScore == null || previousAvg == null
      ? 'none'
      : latestScore >= previousAvg + 5 ? 'up' : latestScore <= previousAvg - 5 ? 'down' : 'steady';
    const retryCount = stuMasteries.filter(m => m.masteryLevel === 'retry').length;
    const supportReasons = [];
    const averageScore = sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null;
    const latestActivitySeconds = getCompletedSeconds(allStudentProgress[0]);
    const latestActivityDate = latestActivitySeconds
      ? new Date(latestActivitySeconds * 1000)
      : allStudentProgress[0]?.date ? new Date(`${allStudentProgress[0].date}T23:59:59`) : null;
    const inactiveDays = latestActivityDate && !Number.isNaN(latestActivityDate.getTime())
      ? Math.floor((Date.now() - latestActivityDate.getTime()) / 86400000)
      : null;
    if (retryCount >= 2) supportReasons.push(`재도전 필요 차시 ${retryCount}개`);
    if (masteryAvg != null && masteryAvg < 60) supportReasons.push(`누적 숙달도 ${masteryAvg}%`);
    if (averageScore != null && averageScore < 60) supportReasons.push(`기간 평균 정답률 ${averageScore}%`);
    if (trend === 'down') supportReasons.push('최근 점수 하락');
    if (!allStudentProgress.length) supportReasons.push('AI 학습 미시작');
    else if (inactiveDays >= 7) supportReasons.push(`${inactiveDays}일간 미학습`);
    const status = !allStudentProgress.length
      ? 'inactive'
      : supportReasons.length > 0
        ? 'support'
        : masteryAvg != null && masteryAvg >= 90
          ? 'excellent'
          : masteryAvg != null && masteryAvg >= 75
            ? 'stable'
            : 'learning';
    return {
      ...stu, completions: progs.length,
      avgScore: averageScore,
      lastDate: allStudentProgress[0]?.date || null,
      todayCount: progs.filter(p => p.date === today).length,
      masteries: stuMasteries,
      masteryAvg,
      retryCount,
      status,
      trend,
      recentProgress,
      allRecentProgress: allStudentProgress,
      supportReasons,
    };
  });

  const getUnitStats = (unit) => {
    const countable = (unit.lessons || []).filter(l => l.title !== '단원 도입');
    if (!countable.length) return { completedStudents: 0, participatingStudents: 0, completedPairs: 0, totalStudents: students.length, classAvg: null, progressPct: 0, needed: countable.length };
    let completedStudents = 0;
    const completedAvgs = [];
    const lessonTitles = new Set(countable.map(lesson => lesson.title));
    const matchingProgress = allProgress.filter(progress =>
      progress.unitName === unit.unitName &&
      lessonTitles.has(progress.lessonTitle) &&
      students.some(student => student.studentCode === progress.studentCode)
    );
    const completedPairs = new Set(matchingProgress.map(progress => `${progress.studentCode}_${progress.lessonTitle}`));
    const participatingStudents = new Set(matchingProgress.map(progress => progress.studentCode)).size;
    students.forEach(stu => {
      const rated = countable.filter(l => (allMastery[lessonKey(unit, l)] || {})[stu.studentCode]?.masteryAvg != null);
      if (rated.length === countable.length) {
        completedStudents++;
        completedAvgs.push(Math.round(rated.reduce((s, l) => s + (allMastery[lessonKey(unit, l)] || {})[stu.studentCode].masteryAvg, 0) / rated.length));
      }
    });
    const totalPossible = countable.length * students.length;
    const rawProgress = totalPossible ? (completedPairs.size / totalPossible) * 100 : 0;
    return {
      completedStudents, participatingStudents, completedPairs: completedPairs.size, totalStudents: students.length,
      classAvg: completedAvgs.length ? Math.round(completedAvgs.reduce((a, b) => a + b, 0) / completedAvgs.length) : null,
      progressPct: rawProgress > 0 ? Math.max(1, Math.round(rawProgress)) : 0,
      needed: countable.length,
    };
  };

  const getLessonStats = (lk) => {
    const lm = allMastery[lk] || {};
    const entries = Object.values(lm);
    const rated = entries.filter(m => m.masteryAvg != null);
    const dist = { excellent: 0, good: 0, normal: 0, retry: 0 };
    rated.forEach(m => { if (dist[m.masteryLevel] !== undefined) dist[m.masteryLevel]++; });
    const avgs = rated.map(m => m.masteryAvg);
    return {
      rated: rated.length, total: students.length, dist,
      classAvg: avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null,
    };
  };

  const filteredUnits = units.filter(u => unitSem === 'all' || String(u.semester || '') === unitSem);

  // ── 렌더 ────────────────────────────────────────────────────
  const TABS = [
    { id: 'overview',  label: '학급 학습 현황', desc: '도움이 필요한 학생 확인' },
    { id: 'units',     label: '단원·차시 분석', desc: '차시별 숙달도 분석' },
    { id: 'students',  label: '학생별 분석', desc: '개인 학습 현황' },
    { id: 'weakness',  label: '취약 개념', desc: '오답 기록 리포트' },
    { id: 'dashboard', label: '학습 기록', desc: '최근 학습 활동' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-5">
      <div className="max-w-6xl mx-auto">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">AI 학습 관리</h1>
            <p className="text-slate-500 text-sm mt-1">학생의 현재 실력과 학습 변화를 확인하고 다음 수업을 준비하세요.</p>
          </div>
          <button onClick={loadAll} disabled={loadingData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50">
            {loadingData
              ? <span className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
              : <span>↻</span>}
            새로고침
          </button>
        </div>

        {/* 탭 */}
        <div className="flex max-w-full gap-1 overflow-x-auto p-1 bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 w-fit">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all
                ${tab === t.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══════════════ 학급 학습 현황 ═══════════════ */}
        {tab === 'overview' && (
          <LearningOverviewTab
            loading={loadingData}
            students={studentStats}
            allProgress={analysisProgress}
            allMastery={allMastery}
            onOpenStudent={setSelectedStudent}
            onOpenUnits={() => setTab('units')}
            onOpenWeakness={() => setTab('weakness')}
            analysisPeriod={analysisPeriod}
            onPeriodChange={setAnalysisPeriod}
          />
        )}

        {/* ═══════════════ 단원별 현황 ═══════════════ */}
        {tab === 'units' && (
          <div>
            {/* 필터 바 */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 mb-5 flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">학년</span>
                <div className="flex gap-1">
                  {['1','2','3','4','5','6'].map(g => (
                    <button key={g} onClick={() => { setUnitGrade(g); setSelectedUnit(null); }}
                      className={`w-8 h-8 rounded-lg font-extrabold text-sm transition-all
                        ${unitGrade === g ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              {unitGrade && (
                <>
                  <div className="w-px h-6 bg-slate-200" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">학기</span>
                    <div className="flex gap-1">
                      {[['all','전체'],['1','1학기'],['2','2학기']].map(([v, l]) => (
                        <button key={v} onClick={() => { setUnitSem(v); setSelectedUnit(null); }}
                          className={`px-3 h-8 rounded-lg font-bold text-xs transition-all
                            ${unitSem === v ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {!unitGrade ? (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col items-center justify-center py-24 text-slate-400">
                <div className="text-5xl mb-3">📚</div>
                <p className="font-bold text-slate-600">학년을 선택하세요</p>
                <p className="text-sm mt-1">위에서 학년을 선택하면 단원 현황이 표시됩니다</p>
              </div>
            ) : loadingUnits ? <Spinner /> : !selectedUnit ? (
              /* 단원 카드 그리드 */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredUnits.map(unit => {
                  const s = getUnitStats(unit);
                  const mastCfg = s.classAvg != null ? MASTERY[getMasteryLevel(s.classAvg)] : null;
                  const hasProgress = s.progressPct > 0;
                  const progressBorder = s.progressPct >= 70
                    ? 'border-emerald-300'
                    : s.progressPct >= 30
                      ? 'border-sky-300'
                      : hasProgress
                        ? 'border-indigo-300'
                        : 'border-slate-200';
                  const progressBar = s.progressPct >= 70
                    ? 'bg-emerald-500'
                    : s.progressPct >= 30
                      ? 'bg-sky-500'
                      : hasProgress
                        ? 'bg-indigo-500'
                        : 'bg-slate-300';
                  return (
                    <button key={unit.id} onClick={() => { setSelectedUnit(unit); setExpandedLesson(null); }}
                      className={`relative overflow-hidden bg-white border-2 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 p-5 text-left transition-all group ${progressBorder}`}>
                      <div className={`absolute inset-x-0 top-0 h-1.5 ${progressBar}`} />

                      {/* 헤더 */}
                      <div className="flex items-start justify-between gap-3 mb-4 pt-1">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-base font-black shrink-0 ${
                            hasProgress ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'
                          }`}>{unit.unitNumber}</span>
                          <div className="min-w-0">
                            <span className="block font-extrabold text-slate-900 text-sm leading-snug line-clamp-2">{unit.unitName}</span>
                            <span className="mt-0.5 block text-[10px] font-bold text-slate-500">{unit.semester || '-'}학기 수학</span>
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] bg-slate-100 text-slate-600 font-extrabold px-2 py-1 rounded-full">
                          {(unit.lessons || []).length}차시
                        </span>
                      </div>

                      {/* 진행률 */}
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 mb-3">
                        <div className="flex items-end justify-between mb-2">
                          <div>
                            <span className={`text-2xl font-black ${hasProgress ? 'text-indigo-600' : 'text-slate-400'}`}>{s.progressPct}%</span>
                            <span className="ml-1 text-[11px] font-bold text-slate-500">학급 진행률</span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500">{s.completedPairs}/{s.needed * s.totalStudents} 학습 완료</span>
                        </div>
                        <ProgressBar pct={s.progressPct} color={progressBar} h="h-2.5" />
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                          <div className="text-[10px] font-bold text-sky-600">참여 학생</div>
                          <div className="mt-0.5 text-sm font-black text-sky-800">{s.participatingStudents}<span className="text-[10px] font-bold text-sky-600"> / {s.totalStudents}명</span></div>
                        </div>
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                          <div className="text-[10px] font-bold text-emerald-600">단원 완료</div>
                          <div className="mt-0.5 text-sm font-black text-emerald-800">{s.completedStudents}<span className="text-[10px] font-bold text-emerald-600"> / {s.totalStudents}명</span></div>
                        </div>
                      </div>

                      {/* 숙달도 또는 안내 */}
                      {mastCfg ? (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${mastCfg.light} ${mastCfg.text}`}>
                          <span className="text-base">{mastCfg.emoji}</span>
                          <span>{mastCfg.label}</span>
                          <span className="ml-auto font-extrabold">{s.classAvg}점</span>
                          <span className="text-[10px] opacity-70">{s.completedStudents}명 기준</span>
                        </div>
                      ) : (
                        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold ${
                          hasProgress ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          <span>{hasProgress ? '⏳' : '○'}</span>
                          <span>{hasProgress ? '단원 완료 학생이 생기면 평균 숙달도를 표시합니다.' : '아직 이 단원을 시작한 학생이 없습니다.'}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              /* 단원 상세 뷰 */
              <div>
                {/* 브레드크럼 + 단원 요약 */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-4">
                  <div className="flex items-center gap-2 mb-4">
                    <button onClick={() => { setSelectedUnit(null); setExpandedLesson(null); }}
                      className="flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-colors">
                      ← 단원 목록
                    </button>
                    <span className="text-slate-300">/</span>
                    <span className="font-extrabold text-slate-700 text-sm">
                      {selectedUnit.unitNumber}단원 · {selectedUnit.unitName}
                    </span>
                  </div>

                  {/* 단원 전체 숙달도 분포 */}
                  {(() => {
                    const allAvgs = [];
                    (selectedUnit.lessons || []).forEach(l => {
                      const lk = lessonKey(selectedUnit, l);
                      Object.values(allMastery[lk] || {}).forEach(m => { if (m.masteryAvg != null) allAvgs.push(m.masteryAvg); });
                    });
                    const unitAvg = allAvgs.length ? Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) : null;
                    const dist = { excellent: 0, good: 0, normal: 0, retry: 0 };
                    allAvgs.forEach(a => { const lv = getMasteryLevel(a); if (dist[lv] !== undefined) dist[lv]++; });
                    return (
                      <div className="flex items-center gap-8 flex-wrap">
                        <div className="text-center">
                          <div className={`text-3xl font-extrabold ${unitAvg != null ? scoreColor(unitAvg) : 'text-slate-300'}`}>
                            {unitAvg != null ? `${unitAvg}점` : '-'}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">단원 평균</div>
                        </div>
                        <div className="flex gap-3">
                          {Object.entries(MASTERY).map(([lv, m]) => (
                            <div key={lv} className="text-center">
                              <div className="text-xl">{m.emoji}</div>
                              <div className="text-sm font-extrabold text-slate-700">{dist[lv]}</div>
                              <div className="text-[9px] text-slate-400">명</div>
                            </div>
                          ))}
                        </div>
                        <div className="text-xs text-slate-400 ml-auto">{allAvgs.length}건 숙달도 판정 완료</div>
                      </div>
                    );
                  })()}
                </div>

                {/* 차시 테이블 */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-12 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                    <div className="col-span-1">차시</div>
                    <div className="col-span-4">차시명</div>
                    <div className="col-span-3 text-center">숙달도 분포</div>
                    <div className="col-span-2 text-center">참여</div>
                    <div className="col-span-2 text-right">평균</div>
                  </div>

                  {(selectedUnit.lessons || []).map((lesson, li) => {
                    const lk = lessonKey(selectedUnit, lesson);
                    const { rated, total, dist, classAvg } = getLessonStats(lk);
                    const isUnitTest = lesson.title === '단원평가';
                    const isExpanded = expandedLesson === lk;
                    const stuMastery = Object.entries(allMastery[lk] || {});

                    return (
                      <div key={lk}>
                        <button
                          onClick={() => setExpandedLesson(isExpanded ? null : lk)}
                          className={`w-full grid grid-cols-12 items-center px-5 py-3.5 transition-colors text-sm text-left
                            ${li > 0 ? 'border-t border-slate-100' : ''}
                            ${isExpanded ? 'bg-indigo-50' : 'hover:bg-slate-50'}
                            ${isUnitTest ? 'bg-amber-50/50 hover:bg-amber-50' : ''}`}>
                          <div className={`col-span-1 text-xs font-extrabold ${isUnitTest ? 'text-amber-600' : 'text-slate-400'}`}>
                            {isUnitTest ? '📝' : lesson.no}
                          </div>
                          <div className={`col-span-4 font-bold truncate pr-3 ${isUnitTest ? 'text-amber-700' : 'text-slate-700'}`}>
                            {lesson.title}
                          </div>
                          <div className="col-span-3 flex justify-center gap-1.5">
                            {rated > 0
                              ? Object.entries(MASTERY).map(([lv, m]) =>
                                  dist[lv] > 0 ? (
                                    <span key={lv} className="text-xs font-bold text-slate-500">{m.emoji}{dist[lv]}</span>
                                  ) : null
                                )
                              : <span className="text-xs text-slate-300">-</span>}
                          </div>
                          <div className="col-span-2 text-center">
                            <div className="text-xs font-bold text-slate-600">{rated}/{total}</div>
                            <ProgressBar pct={total > 0 ? (rated / total) * 100 : 0} color="bg-indigo-300" h="h-1" />
                          </div>
                          <div className="col-span-2 text-right flex items-center justify-end gap-1">
                            {classAvg != null ? (
                              <span className={`text-sm font-extrabold ${scoreColor(classAvg)}`}>{classAvg}점</span>
                            ) : <span className="text-slate-300 text-sm">-</span>}
                            <span className={`text-slate-300 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                          </div>
                        </button>

                        {/* 학생 상세 */}
                        {isExpanded && (
                          <div className="bg-slate-50 border-t border-slate-200">
                            <div className="px-5 py-2 grid grid-cols-12 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                              <div className="col-span-2">학생</div>
                              <div className="col-span-1 text-center">도전</div>
                              <div className="col-span-4">점수 기록</div>
                              <div className="col-span-3 text-center">숙달도</div>
                              <div className="col-span-1 text-center">평균</div>
                              <div className="col-span-1 text-center">최근</div>
                            </div>
                            <div className="divide-y divide-slate-200">
                              {students.map(stu => {
                                const m = (allMastery[lk] || {})[stu.studentCode];
                                const done = m?.scores?.length || 0;
                                if (!m) return (
                                  <div key={stu.id} className="px-5 py-2.5 grid grid-cols-12 items-center opacity-40 text-xs">
                                    <div className="col-span-2 font-bold text-slate-600">{stu.name || stu.studentCode?.slice(-5)}</div>
                                    <div className="col-span-10 text-slate-400">미도전</div>
                                  </div>
                                );
                                return (
                                  <div key={stu.id} className="px-5 py-2.5 grid grid-cols-12 items-center text-xs hover:bg-white transition-colors">
                                    <div className="col-span-2 font-extrabold text-slate-700 truncate">{stu.name || stu.studentCode?.slice(-5)}</div>
                                    <div className="col-span-1 text-center">
                                      <span className={`font-bold ${done >= MASTERY_ATTEMPTS ? 'text-indigo-600' : 'text-slate-400'}`}>{m.attemptCount || done}회</span>
                                    </div>
                                    <div className="col-span-4 flex gap-0.5 flex-wrap">
                                      {(m.scores || []).map((s, i) => (
                                        <span key={i} className={`px-1 py-0.5 rounded text-[10px] font-bold bg-white border ${scoreColor(s)} border-current`}>{s}</span>
                                      ))}
                                      {done < MASTERY_ATTEMPTS && Array.from({ length: MASTERY_ATTEMPTS - done }, (_, i) => (
                                        <span key={`e${i}`} className="px-1 py-0.5 rounded text-[10px] bg-slate-100 text-slate-300">?</span>
                                      ))}
                                    </div>
                                    <div className="col-span-3 text-center">
                                      {m.masteryLevel
                                        ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${MASTERY[m.masteryLevel]?.light || ''} ${MASTERY[m.masteryLevel]?.text || ''}`}>
                                            {MASTERY[m.masteryLevel]?.emoji} {MASTERY[m.masteryLevel]?.label}
                                          </span>
                                        : <span className="text-slate-400">{done}/{MASTERY_ATTEMPTS} 도전중</span>}
                                    </div>
                                    <div className={`col-span-1 text-center font-extrabold ${m.masteryAvg != null ? scoreColor(m.masteryAvg) : 'text-slate-300'}`}>
                                      {m.masteryAvg != null ? `${m.masteryAvg}점` : '-'}
                                    </div>
                                    <div className={`col-span-1 text-center font-bold ${m.lastScore != null ? scoreColor(m.lastScore) : 'text-slate-300'}`}>
                                      {m.lastScore != null ? `${m.lastScore}점` : '-'}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ 취약 분석 ═══════════════ */}
        {tab === 'weakness' && (
          <WeaknessTab teacherUid={teacherUid} students={students} onCreateReview={createReviewQuizDraft} />
        )}

        {/* ═══════════════ 학생별 분석 ═══════════════ */}
        {tab === 'students' && (
          loadingData ? <Spinner /> : (
            <div className="space-y-4">
              {/* 요약 칩 */}
              <div className="flex gap-3 flex-wrap">
                {[
                  { label: '전체', val: students.length, color: 'bg-slate-700 text-white' },
                  { label: '활동', val: studentStats.filter(s => s.completions > 0).length, color: 'bg-indigo-600 text-white' },
                  { label: '오늘 활동', val: studentStats.filter(s => s.todayCount > 0).length, color: 'bg-emerald-500 text-white' },
                  { label: '미활동', val: studentStats.filter(s => s.completions === 0).length, color: 'bg-slate-200 text-slate-600' },
                ].map(c => (
                  <div key={c.label} className={`${c.color} px-4 py-2 rounded-xl text-sm font-extrabold shadow-sm`}>
                    {c.val}명 {c.label}
                  </div>
                ))}
              </div>

              {/* 학생 카드 그리드 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {studentStats.sort((a, b) => (b.completions || 0) - (a.completions || 0)).map(stu => {
                  const dist = { excellent: 0, good: 0, normal: 0, retry: 0 };
                  stu.masteries.forEach(m => { if (dist[m.masteryLevel] !== undefined) dist[m.masteryLevel]++; });
                  const totalMast = stu.masteries.length;
                  return (
                    <button type="button" onClick={() => setSelectedStudent(stu)} key={stu.id}
                      className="w-full text-left bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex items-start gap-4 hover:border-indigo-300 hover:shadow-md transition-all">
                      {/* 아바타 */}
                      <div className="w-10 h-10 rounded-full bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center shrink-0 overflow-hidden">
                        {stu.characterImage
                          ? <img src={stu.characterImage} alt="" className="w-full h-full object-contain scale-[2]" />
                          : <span className="text-lg">🧑‍🎓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-extrabold text-slate-800 truncate">{stu.name || stu.studentCode}</div>
                          <div className={`text-sm font-extrabold ${stu.avgScore != null ? scoreColor(stu.avgScore) : 'text-slate-300'}`}>
                            {stu.avgScore != null ? `${stu.avgScore}점` : '-'}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
                          <span>총 {stu.completions}회 완료</span>
                          {stu.todayCount > 0 && <span className="text-emerald-500 font-bold">오늘 {stu.todayCount}회</span>}
                          {stu.lastDate && <span>마지막 {fmtDate(stu.lastDate)}</span>}
                        </div>
                        {totalMast > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {Object.entries(MASTERY).map(([lv, m]) =>
                              dist[lv] > 0 ? (
                                <span key={lv} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${m.light} ${m.text}`}>
                                  {m.emoji} {dist[lv]}
                                </span>
                              ) : null
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )
        )}

        {/* ═══════════════ 종합 현황 ═══════════════ */}
        {tab === 'dashboard' && (
          <div className="space-y-5">
            {/* 스탯 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon="✅" label="총 학습 완료" value={allProgress.length} sub="건" accent="indigo" />
              <StatCard icon="📅" label="오늘 완료" value={todayProg.length} sub="건" accent="sky" />
              <StatCard icon="📈" label="전체 평균" value={avgScore != null ? `${avgScore}점` : '-'} accent={avgScore >= 70 ? 'emerald' : 'amber'} />
              <StatCard icon="👥" label="참여 학생" value={studentStats.filter(s => s.completions > 0).length} sub={`/ ${students.length}명`} accent="amber" />
            </div>

            {/* 오늘 활동 */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-700">📅 오늘 학습 활동</h3>
                <span className="text-sm text-slate-400">{todayProg.length}건</span>
              </div>
              {todayProg.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <div className="text-3xl mb-2">📭</div>
                  <p className="text-sm">오늘 완료된 학습이 없습니다</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {[...todayProg].sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0)).slice(0, 20).map((p, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 text-sm">
                        {students.find(s => s.studentCode === p.studentCode)?.characterImage
                          ? <img src={students.find(s => s.studentCode === p.studentCode).characterImage} className="w-full h-full object-contain scale-[1.5] rounded-full" alt="" />
                          : '🧑'}
                      </div>
                      <div className="font-bold text-slate-700 text-sm w-16 shrink-0 truncate">
                        {students.find(s => s.studentCode === p.studentCode)?.name || p.studentCode?.slice(-5)}
                      </div>
                      <div className="flex-1 text-xs text-slate-400 truncate">{p.unitName} · {p.lessonTitle}</div>
                      <div className={`text-sm font-extrabold shrink-0 ${scoreColor(p.score || 0)}`}>{p.score}점</div>
                      <div className="text-xs text-slate-300 shrink-0">{p.correctCount}/{p.totalCount}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
      {selectedStudent && (
          <StudentLearningDetail
          student={selectedStudent}
          teacherUid={teacherUid}
          classId={selectedClass?.id}
          onCreateReview={createReviewQuizDraft}
          onOpenWeakness={() => setTab('weakness')}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
}

function LearningOverviewTab({
  loading,
  students,
  allProgress,
  allMastery,
  onOpenStudent,
  onOpenUnits,
  onOpenWeakness,
  analysisPeriod,
  onPeriodChange,
}) {
  const [queryText, setQueryText] = useState('');
  const [sortBy, setSortBy] = useState('support');

  const summary = useMemo(() => {
    const active = students.filter(student => student.completions > 0);
    const avgScores = active.map(student => student.avgScore).filter(score => score != null);
    const masteryScores = active.map(student => student.masteryAvg).filter(score => score != null);
    return {
      activeCount: active.length,
      avgScore: avgScores.length ? Math.round(avgScores.reduce((sum, score) => sum + score, 0) / avgScores.length) : null,
      masteryAvg: masteryScores.length ? Math.round(masteryScores.reduce((sum, score) => sum + score, 0) / masteryScores.length) : null,
      supportCount: students.filter(student => student.status === 'support').length,
      inactiveCount: students.filter(student => student.status === 'inactive').length,
      todayCount: students.filter(student => student.todayCount > 0).length,
    };
  }, [students]);

  const weakLessons = useMemo(() => {
    const lessons = Object.values(allMastery).map(lessonStudents => {
      const records = Object.values(lessonStudents).filter(item => item?.masteryAvg != null);
      if (!records.length) return null;
      const supportCount = records.filter(item => item.masteryLevel === 'retry').length;
      const average = Math.round(records.reduce((sum, item) => sum + item.masteryAvg, 0) / records.length);
      const sample = records[0] || {};
      return {
        key: sample.lessonKey || `${sample.unitName}_${sample.lessonTitle}`,
        unitName: sample.unitName || '단원 정보 없음',
        lessonTitle: sample.lessonTitle || '차시 정보 없음',
        average,
        supportCount,
        learnedCount: records.length,
      };
    }).filter(Boolean);
    return lessons.sort((a, b) => b.supportCount - a.supportCount || a.average - b.average).slice(0, 3);
  }, [allMastery]);

  const visibleStudents = useMemo(() => {
    const statusOrder = { support: 0, inactive: 1, learning: 2, stable: 3, excellent: 4 };
    const normalized = queryText.trim().toLowerCase();
    const filtered = students.filter(student => {
      const name = String(student.name || student.studentName || student.studentCode || '').toLowerCase();
      return !normalized || name.includes(normalized);
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === 'score') return (a.avgScore ?? 999) - (b.avgScore ?? 999);
      if (sortBy === 'growth') {
        const rank = { up: 0, steady: 1, down: 2, none: 3 };
        return rank[a.trend] - rank[b.trend];
      }
      if (sortBy === 'recent') return getCompletedSeconds(b.recentProgress?.[0]) - getCompletedSeconds(a.recentProgress?.[0]);
      return statusOrder[a.status] - statusOrder[b.status] || (a.avgScore ?? 999) - (b.avgScore ?? 999);
    });
  }, [students, queryText, sortBy]);

  if (loading) return <Spinner label="학급 학습 현황을 정리하는 중..." />;

  const overviewCards = [
    { label: '학습 참여 학생', value: `${summary.activeCount} / ${students.length}명`, note: `오늘 ${summary.todayCount}명 학습`, accent: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
    { label: '평균 정답률', value: summary.avgScore == null ? '-' : `${summary.avgScore}%`, note: `${allProgress.length}건의 완료 기록`, accent: 'border-sky-200 bg-sky-50 text-sky-700' },
    { label: '평균 숙달도', value: summary.masteryAvg == null ? '-' : `${summary.masteryAvg}%`, note: '최근 4회 학습 기반', accent: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    { label: '지원 필요 학생', value: `${summary.supportCount}명`, note: `미학습 ${summary.inactiveCount}명`, accent: 'border-rose-200 bg-rose-50 text-rose-700' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-sm font-black text-slate-800">분석 기간</p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">활동·정답률·성장 추세에 적용되며 숙달도는 누적 기준입니다.</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {[['1', '오늘'], ['7', '최근 7일'], ['30', '최근 30일'], ['all', '전체']].map(([value, label]) => (
            <button type="button" key={value} onClick={() => onPeriodChange(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors ${
                analysisPeriod === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {overviewCards.map(card => (
          <div key={card.label} className={`rounded-2xl border p-4 ${card.accent}`}>
            <p className="text-xs font-bold opacity-70">{card.label}</p>
            <p className="mt-2 text-2xl font-black">{card.value}</p>
            <p className="mt-1 text-xs font-semibold opacity-65">{card.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold text-indigo-600">오늘의 학습 판단</p>
              <h2 className="mt-1 text-lg font-black text-slate-800">
                {summary.supportCount > 0
                  ? `${summary.supportCount}명의 학생에게 교사 확인이 필요합니다.`
                  : summary.inactiveCount > 0
                    ? `${summary.inactiveCount}명의 학생이 아직 AI 학습을 시작하지 않았습니다.`
                    : '현재 학급은 안정적으로 학습하고 있습니다.'}
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                점수 한 번보다 최근 학습 결과, 반복 재도전, 숙달도 변화를 함께 반영했습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSortBy('support')}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-extrabold text-white hover:bg-slate-700">
                지원 필요 학생 보기
              </button>
              <button type="button" onClick={onOpenWeakness}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-extrabold text-rose-700 hover:bg-rose-100">
                취약 개념 확인
              </button>
              <button type="button" onClick={onOpenUnits}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-extrabold text-indigo-700 hover:bg-indigo-100">
                차시 숙달도 확인
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-800">어려워한 차시</h3>
            <button type="button" onClick={onOpenWeakness} className="text-xs font-extrabold text-indigo-600 hover:text-indigo-800">
              취약 개념 전체 보기
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {weakLessons.length ? weakLessons.map(lesson => (
              <div key={lesson.key} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-extrabold text-slate-700">{lesson.lessonTitle}</p>
                  <span className="shrink-0 text-xs font-black text-rose-600">{lesson.average}%</span>
                </div>
                <p className="mt-1 truncate text-[11px] font-medium text-slate-400">
                  {lesson.unitName} · 지원 필요 {lesson.supportCount}명
                </p>
              </div>
            )) : (
              <p className="py-6 text-center text-xs font-semibold text-slate-400">숙달도 기록이 쌓이면 표시됩니다.</p>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="font-black text-slate-800">학생 학습 현황</h3>
            <p className="mt-1 text-xs font-medium text-slate-400">학생을 누르면 최근 학습과 숙달도를 자세히 확인할 수 있습니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={queryText} onChange={event => setQueryText(event.target.value)}
              placeholder="학생 이름 검색"
              className="w-36 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-400" />
            <select value={sortBy} onChange={event => setSortBy(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 outline-none focus:border-indigo-400">
              <option value="support">지원 필요 순</option>
              <option value="score">정답률 낮은 순</option>
              <option value="growth">성장 추세 순</option>
              <option value="recent">최근 학습 순</option>
            </select>
            <button type="button" onClick={onOpenUnits}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-extrabold text-indigo-700 hover:bg-indigo-100">
              단원·차시 보기
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr] gap-3 bg-slate-50 px-5 py-3 text-[11px] font-extrabold text-slate-400">
              <span>학생</span><span>학습 상태</span><span>평균 정답률</span><span>평균 숙달도</span><span>최근 변화</span><span>최근 학습</span>
            </div>
            <div className="divide-y divide-slate-100">
              {visibleStudents.map(student => (
                <button type="button" key={student.id} onClick={() => onOpenStudent(student)}
                  className={`grid w-full grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr] items-center gap-3 px-5 py-3 text-left hover:bg-indigo-50/50
                    ${student.status === 'support' ? 'bg-rose-50/40' : ''}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold text-slate-800">{student.name || student.studentName || student.studentCode}</span>
                    <span className="block truncate text-[10px] font-medium text-slate-400">{student.studentCode}</span>
                    {student.supportReasons?.length > 0 && (
                      <span className="mt-1 block truncate text-[10px] font-bold text-rose-500">{student.supportReasons[0]}</span>
                    )}
                  </span>
                  <LearningStatusPill status={student.status} />
                  <span className={`text-sm font-black ${student.avgScore == null ? 'text-slate-300' : scoreColor(student.avgScore)}`}>
                    {student.avgScore == null ? '-' : `${student.avgScore}%`}
                  </span>
                  <span className={`text-sm font-black ${student.masteryAvg == null ? 'text-slate-300' : scoreColor(student.masteryAvg)}`}>
                    {student.masteryAvg == null ? '-' : `${student.masteryAvg}%`}
                  </span>
                  <span className={`text-xs font-extrabold ${student.trend === 'up' ? 'text-emerald-600' : student.trend === 'down' ? 'text-rose-600' : 'text-slate-400'}`}>
                    {student.trend === 'up' ? '↑ 상승' : student.trend === 'down' ? '↓ 하락' : student.trend === 'steady' ? '→ 유지' : '-'}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{student.lastDate ? fmtDate(student.lastDate) : '학습 기록 없음'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentLearningDetail({ student, teacherUid, classId, onCreateReview, onOpenWeakness, onClose }) {
  const [memo, setMemo] = useState('');
  const [memoLoading, setMemoLoading] = useState(true);
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoSaved, setMemoSaved] = useState(false);
  const [wrongAnswers, setWrongAnswers] = useState([]);
  const [wrongLoading, setWrongLoading] = useState(true);
  const memoRef = React.useRef(null);
  const masteryDist = student.masteries.reduce((acc, item) => {
    if (acc[item.masteryLevel] !== undefined) acc[item.masteryLevel] += 1;
    return acc;
  }, { excellent: 0, good: 0, normal: 0, retry: 0 });
  const retryLessons = student.masteries.filter(item => item.masteryLevel === 'retry').slice(0, 5);

  useEffect(() => {
    if (!teacherUid || !student.studentCode) return;
    const memoId = `${teacherUid}_${student.studentCode}`;
    setMemoLoading(true);
    getDoc(doc(db, 'aiTeacherMemos', memoId))
      .then(snapshot => setMemo(snapshot.data()?.memo || ''))
      .finally(() => setMemoLoading(false));
  }, [teacherUid, student.studentCode]);

  useEffect(() => {
    if (!student.studentCode) return;
    setWrongLoading(true);
    getDocs(query(collection(db, 'aiWrongAnswers'), where('studentCode', '==', student.studentCode)))
      .then(snapshot => {
        const deduped = new Map();
        snapshot.docs.forEach(document => {
          const item = { id: document.id, ...document.data() };
          const key = item.questionKey || item.id;
          const previous = deduped.get(key);
          if (!previous) {
            deduped.set(key, item);
            return;
          }
          previous.wrongCount = Math.max(previous.wrongCount || 1, item.wrongCount || 1);
          if (item.resolved || item.status === 'resolved') {
            previous.resolved = true;
            previous.status = 'resolved';
          }
        });
        setWrongAnswers([...deduped.values()]);
      })
      .finally(() => setWrongLoading(false));
  }, [student.studentCode]);

  const saveMemo = async () => {
    if (!teacherUid || !student.studentCode) return;
    setMemoSaving(true);
    try {
      await setDoc(doc(db, 'aiTeacherMemos', `${teacherUid}_${student.studentCode}`), {
        teacherUid,
        classId: classId || null,
        studentCode: student.studentCode,
        studentName: student.name || student.studentName || '',
        memo: memo.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMemoSaved(true);
      setTimeout(() => setMemoSaved(false), 1800);
    } finally {
      setMemoSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/55 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-slate-50 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-800">{student.name || student.studentName || student.studentCode}</h2>
              <LearningStatusPill status={student.status} />
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-400">{student.studentCode} · 최근 학습 {student.lastDate ? fmtDate(student.lastDate) : '없음'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="h-9 w-9 rounded-full bg-slate-100 text-lg font-bold text-slate-500 hover:bg-slate-200">×</button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold text-indigo-600">교사 실행 메뉴</p>
                <p className="mt-1 text-sm font-black text-slate-800">분석 결과를 바로 지도 활동으로 연결합니다.</p>
                {!wrongLoading && (
                  <p className="mt-1 text-[11px] font-bold text-slate-500">
                    미해결 오답 {wrongAnswers.filter(item => !item.resolved && item.status !== 'resolved').length}개 ·
                    해결 완료 {wrongAnswers.filter(item => item.resolved || item.status === 'resolved').length}개
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button"
                  disabled={wrongLoading || wrongAnswers.filter(item => !item.resolved && item.status !== 'resolved').length === 0}
                  onClick={() => onCreateReview?.(
                    wrongAnswers.filter(item => !item.resolved && item.status !== 'resolved'),
                    `${student.name || student.studentName || student.studentCode} 맞춤 복습 퀴즈`
                  )}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-40">
                  {wrongLoading ? '오답 확인 중...' : `복습 퀴즈 만들기 (${wrongAnswers.filter(item => !item.resolved && item.status !== 'resolved').length})`}
                </button>
                <button type="button" onClick={() => { onClose(); onOpenWeakness?.(); }}
                  className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-extrabold text-rose-700 hover:bg-rose-50">
                  취약 개념 전체 보기
                </button>
                <button type="button" onClick={() => memoRef.current?.focus()}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50">
                  지도 메모 작성
                </button>
              </div>
            </div>
          </div>

          {student.supportReasons?.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs font-extrabold text-rose-600">지원 필요 사유</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {student.supportReasons.map(reason => (
                  <span key={reason} className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-bold text-rose-700">
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['평균 정답률', student.avgScore == null ? '-' : `${student.avgScore}%`],
              ['평균 숙달도', student.masteryAvg == null ? '-' : `${student.masteryAvg}%`],
              ['완료한 학습', `${student.completions}회`],
              ['재도전 차시', `${student.retryCount}개`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-bold text-slate-400">{label}</p>
                <p className="mt-1 text-xl font-black text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-black text-slate-800">숙달도 분포</h3>
              <div className="mt-4 space-y-3">
                {Object.entries(MASTERY).map(([level, item]) => {
                  const count = masteryDist[level];
                  const total = Math.max(1, student.masteries.length);
                  return (
                    <div key={level}>
                      <div className="mb-1 flex justify-between text-xs font-bold">
                        <span className={item.text}>{item.label}</span>
                        <span className="text-slate-400">{count}개 차시</span>
                      </div>
                      <ProgressBar pct={(count / total) * 100} color={item.bar} />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-black text-slate-800">교사 확인이 필요한 차시</h3>
              <div className="mt-3 space-y-2">
                {retryLessons.length ? retryLessons.map((item, index) => (
                  <div key={`${item.lessonKey}_${index}`} className="rounded-xl bg-rose-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-extrabold text-rose-800">{item.lessonTitle || '차시 정보 없음'}</p>
                      <span className="shrink-0 text-xs font-black text-rose-600">{item.masteryAvg ?? '-'}%</span>
                    </div>
                    <p className="mt-1 truncate text-[11px] font-medium text-rose-400">{item.unitName || '단원 정보 없음'}</p>
                  </div>
                )) : (
                  <p className="py-8 text-center text-xs font-semibold text-slate-400">지원이 필요한 차시가 없습니다.</p>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="font-black text-slate-800">최근 학습 기록</h3>
            </div>
            {student.recentProgress.length ? (
              <div className="divide-y divide-slate-100">
                {student.recentProgress.slice(0, 8).map((progress, index) => (
                  <div key={`${progress.lessonKey}_${index}`} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-slate-700">{progress.lessonTitle || '차시 정보 없음'}</p>
                      <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">{progress.unitName || '단원 정보 없음'} · {fmtDate(progress.date)}</p>
                    </div>
                    <span className={`text-sm font-black ${scoreColor(progress.score || 0)}`}>{progress.score ?? '-'}%</span>
                    <span className="text-xs font-bold text-slate-400">{progress.correctCount ?? '-'}/{progress.totalCount ?? '-'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm font-semibold text-slate-400">아직 완료한 학습이 없습니다.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-800">교사 메모 및 지도 기록</h3>
                <p className="mt-1 text-xs font-medium text-slate-400">학생 지도 시 확인할 내용과 다음 지원 계획을 기록합니다.</p>
              </div>
              {memoSaved && <span className="text-xs font-extrabold text-emerald-600">저장 완료</span>}
            </div>
            <textarea
              ref={memoRef}
              value={memo}
              onChange={event => setMemo(event.target.value)}
              disabled={memoLoading}
              placeholder={memoLoading ? '메모를 불러오는 중입니다.' : '예: 분수 덧셈에서 분모를 더하는 오류가 반복됨. 다음 수업에서 분수 막대로 확인하기.'}
              className="mt-4 min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 outline-none focus:border-indigo-400 focus:bg-white disabled:opacity-60"
            />
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={saveMemo} disabled={memoLoading || memoSaving}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50">
                {memoSaving ? '저장 중...' : '지도 기록 저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 교과서 내용 등록 탭 (RAG) ─────────────────────────────────
const buildAutoLessonContext = (unit, lesson) => {
  const keywords = Array.isArray(lesson?.keywords)
    ? lesson.keywords.filter(Boolean).join(', ')
    : '';
  const unitName = unit?.unitName || '';
  const lessonTitle = lesson?.title || `${lesson?.no || ''}차시`;
  const joined = `${unitName} ${lessonTitle} ${keywords}`;
  const isSameDenomFraction = /분모가\s*같|같은\s*분모|동분모|분모는\s*그대로|분자끼리|분수의\s*덧셈/.test(joined);
  const isFraction = isSameDenomFraction || /분수|분모|분자|진분수|가분수|대분수/.test(joined);
  const isGeometry = /도형|각도|삼각형|사각형|원|둘레|넓이|부피|입체/.test(joined);
  const isGraph = /그래프|표|자료|막대|꺾은선|평균|가능성/.test(joined);
  const isClock = /시각|시간|시계|분/.test(joined);

  const focusGuide = (() => {
    if (isSameDenomFraction) {
      return [
        '- 분모가 같은 분수끼리 더할 때는 분모는 그대로 두고 분자끼리 더한다.',
        '- 색칠한 칸 수는 분자, 전체를 똑같이 나눈 칸 수는 분모로 본다.',
        '- 대표 예: 2/7 + 3/7 = 5/7',
        '- 금지: 2/7 + 3/7 = 5/14처럼 분모까지 더하는 문제를 정답으로 만들지 않는다.',
        '- 금지: "1보다 작은 것"처럼 정답이 여러 개가 될 수 있는 문항을 만들지 않는다.',
        '- 그림은 정답을 직접 써 주지 말고, 풀이에 필요한 정보만 제공한다.',
      ];
    }
    if (isFraction) {
      return [
        '- 분모는 전체를 똑같이 나눈 수, 분자는 선택하거나 색칠한 부분의 수이다.',
        '- 분수 비교는 같은 전체를 기준으로 해야 한다.',
        '- 보기 4개 중 정답은 반드시 1개만 되게 만든다.',
        '- 그림과 보기의 수가 서로 모순되지 않게 검산한다.',
      ];
    }
    if (isGeometry) {
      return [
        '- 도형의 이름, 성질, 길이, 각도, 넓이 등 차시의 핵심 개념을 하나만 묻는다.',
        '- 그림 자료가 있으면 문제 조건과 일치해야 한다.',
        '- 단위를 빠뜨리지 않는다.',
      ];
    }
    if (isGraph) {
      return [
        '- 표나 그래프에서 값을 읽고 비교하는 문제를 만든다.',
        '- 축 이름, 단위, 범례가 문제와 일치해야 한다.',
        '- 계산이 필요한 경우 중간 계산이 초등 수준을 넘지 않게 한다.',
      ];
    }
    if (isClock) {
      return [
        '- 시각 읽기, 시간의 흐름, 분 단위 계산 중 하나를 중심으로 묻는다.',
        '- 오전/오후, 몇 시간 후, 몇 분 전 같은 표현을 명확히 쓴다.',
        '- 시계 그림이 있으면 시침과 분침 위치가 답과 일치해야 한다.',
      ];
    }
    return [
      '- 차시 제목과 키워드에 맞는 핵심 개념을 한 문항에 하나씩만 묻는다.',
      '- 계산 문제와 문장제를 섞되, 초등학생이 읽고 풀 수 있는 짧은 문장으로 만든다.',
      '- 보기 4개 중 정답은 반드시 1개만 되게 만든다.',
      '- 해설은 왜 정답인지 한두 문장으로 설명한다.',
    ];
  })();

  return [
    '[차시 정보]',
    `학년: ${unit?.grade || ''}학년`,
    `학기: ${unit?.semester || ''}학기`,
    `과목: ${unit?.subject || '수학'}`,
    `출판사: ${unit?.publisher || '공통'}`,
    `단원: ${unitName}`,
    `차시: ${lesson?.no || ''}차시 - ${lessonTitle}`,
    keywords ? `핵심 키워드: ${keywords}` : '',
    '',
    '[학습 목표]',
    `학생이 "${lessonTitle}"의 핵심 개념을 이해하고, 그림/식/문장 상황에서 바르게 적용할 수 있다.`,
    '',
    '[핵심 개념]',
    ...focusGuide,
    '',
    '[대표 문제 유형]',
    '- 개념 확인 문제',
    '- 짧은 문장제',
    '- 그림이나 표를 보고 답을 고르는 문제',
    '- 자주 하는 실수를 구별하는 문제',
    '',
    '[오답 유도 주의]',
    '- 학생이 자주 헷갈리는 보기를 넣되, 정답이 여러 개가 되면 안 된다.',
    '- 문제, 보기, 해설, 그림 자료의 숫자가 서로 맞는지 반드시 검산한다.',
    '- 차시 범위를 벗어나는 중학교식 풀이, 지나치게 복잡한 계산은 피한다.',
  ].filter(Boolean).join('\n');
};

const buildAutoLessonContextV2 = (unit, lesson) => {
  const grade = Number(unit?.grade || 0);
  const keywords = Array.isArray(lesson?.keywords)
    ? lesson.keywords.filter(Boolean).join(', ')
    : '';
  const unitName = unit?.unitName || '';
  const lessonTitle = lesson?.title || `${lesson?.no || ''}차시`;
  const joined = `${unitName} ${lessonTitle} ${keywords}`;
  const has = (patterns) => patterns.some(pattern => pattern.test(joined));

  const isLowerGrade = grade <= 2;
  const isUnitReview = has([/단원평가/, /단원\s*종합/, /복습/]);
  const isShapeUnit = has([/여러\s*가지\s*모양/, /모양\s*찾기/, /모양\s*놀이/, /생활\s*속\s*모양/]);
  const isGradeTwoShapeUnit = grade === 2 && /여러\s*가지\s*도형/.test(unitName);
  const isGradeTwoStacking = grade === 2 && has([/쌓은\s*모양/, /모양으로\s*쌓/, /쌓기나무/]);
  const isClassification = has([/분류하기/, /분류는\s*어떻게/, /기준에\s*따라\s*분류/, /분류하고\s*세어/, /분류한\s*결과/]);
  const isSameDenomFraction = has([/분모가\s*같/, /같은\s*분모/, /동분모/, /분모는\s*그대로/, /분자끼리/, /분수의\s*덧셈/]);
  const isFraction = isSameDenomFraction || has([/분수/, /분모/, /분자/, /진분수/, /가분수/, /대분수/]);
  const isClock = has([/시각/, /시계/, /몇\s*시/, /몇\s*분/, /오전/, /오후/, /시간의\s*흐름/]);
  const isGraph = has([/그래프/, /표\s*읽기/, /자료/, /막대그래프/, /꺾은선/, /평균/, /가능성/]);
  const isGeometry = isShapeUnit || has([/도형/, /각도/, /삼각형/, /사각형/, /원\b/, /둘레/, /넓이/, /부피/, /입체/]);

  const focusGuide = (() => {
    if (isGradeTwoStacking) {
      return [
        '- 쌓기나무의 개수, 위치, 쌓은 순서와 모양을 관찰한다.',
        '- 앞, 옆, 위에서 보이는 모양과 쌓기나무 개수를 차시 범위에 맞게 묻는다.',
        '- 금지: 직육면체, 정육면체, 모서리 같은 고학년 입체도형 용어는 사용하지 않는다.',
      ];
    }
    if (isGradeTwoShapeUnit) {
      return [
        '- 삼각형, 사각형, 원을 찾아보고 모양의 특징에 따라 구별한다.',
        '- 삼각형은 변과 꼭짓점이 각각 3개, 사각형은 각각 4개임을 차시에 맞게 다룬다.',
        '- 칠교판 활동은 도형을 합치거나 나누어 새로운 모양을 만드는 활동으로 구성한다.',
        '- 금지: 각도, 둘레, 넓이, 직육면체, 정육면체 같은 상위 학년 개념은 사용하지 않는다.',
      ];
    }
    if (isClassification) {
      return [
        '- 하나의 분명한 기준을 정해 자료를 빠짐없이 분류한다.',
        '- 분류한 항목별 개수를 세고 가장 많은 것, 가장 적은 것, 개수 차이를 말한다.',
        '- 분류 기준과 결과가 서로 맞는지 확인하는 문제를 만든다.',
        '- 금지: 분류와 무관한 도형 성질, 시계, 곱셈 문제로 바꾸지 않는다.',
      ];
    }
    if (isShapeUnit && isLowerGrade) {
      return [
        '- 동그라미 모양, 세모 모양, 네모 모양처럼 생활 속 물건에서 비슷한 모양을 찾는다.',
        '- 공 모양, 상자 모양, 둥근 모양, 평평한 모양처럼 눈에 보이는 특징으로 분류한다.',
        '- 같은 모양끼리 모으거나, 다른 모양을 찾는 놀이 중심 문제를 만든다.',
        '- 금지: 각도, 둘레, 넓이, 길이 계산, 도형의 성질 같은 고학년 개념은 사용하지 않는다.',
        '- 금지: 시계, 시각, 시간 계산 문제로 바꾸지 않는다.',
      ];
    }
    if (isSameDenomFraction) {
      return [
        '- 분모가 같은 분수끼리 더할 때는 분모는 그대로 두고 분자끼리 더한다.',
        '- 색칠한 칸 수는 분자, 전체를 똑같이 나눈 칸 수는 분모로 본다.',
        '- 대표 예: 2/7 + 3/7 = 5/7',
        '- 금지: 2/7 + 3/7 = 5/14처럼 분모까지 더하는 문제를 정답으로 만들지 않는다.',
        '- 금지: "1보다 작은 것"처럼 정답이 여러 개가 될 수 있는 문항을 만들지 않는다.',
        '- 그림은 정답을 직접 써 주지 말고, 풀이에 필요한 정보만 제공한다.',
      ];
    }
    if (isFraction) {
      return [
        '- 분모는 전체를 똑같이 나눈 수, 분자는 선택하거나 색칠한 부분의 수이다.',
        '- 분수 비교는 같은 전체를 기준으로 해야 한다.',
        '- 보기 4개 중 정답은 반드시 1개만 되게 만든다.',
        '- 그림과 보기의 수가 서로 모순되지 않게 검산한다.',
      ];
    }
    if (isClock) {
      return [
        '- 시각 읽기, 시간의 흐름, 몇 시/몇 분 표현 중 차시에 맞는 내용만 묻는다.',
        '- 오전/오후, 몇 시간 후, 몇 분 전 같은 표현은 문제 조건에 명확히 쓴다.',
        '- 시계 그림이 있으면 시침과 분침 위치가 답과 일치해야 한다.',
      ];
    }
    if (isGraph) {
      return [
        '- 표나 그래프에서 값을 읽고 비교하는 문제를 만든다.',
        '- 축 이름, 단위, 범례가 문제와 일치해야 한다.',
        '- 계산이 필요한 경우 중간 계산이 초등 수준을 넘지 않게 한다.',
      ];
    }
    if (isGeometry) {
      if (isLowerGrade) {
        return [
          '- 생활 속 물건을 모양에 따라 찾아보고 같은 모양끼리 분류한다.',
          '- 굴러가는 모양, 쌓기 좋은 모양, 평평한 면이 있는 모양처럼 관찰 가능한 특징만 다룬다.',
          '- 금지: 각도, 둘레, 넓이, 길이 계산 같은 고학년 개념은 사용하지 않는다.',
        ];
      }
      return [
        '- 도형의 이름, 성질, 길이, 각도, 둘레, 넓이 등 차시의 핵심 개념을 하나만 묻는다.',
        '- 그림 자료가 있으면 문제 조건과 일치해야 한다.',
        '- 단위를 빠뜨리지 않는다.',
      ];
    }
    return [
      '- 차시 제목과 키워드에 맞는 핵심 개념을 한 문항에 하나씩만 묻는다.',
      '- 계산 문제와 문장제를 섞되, 초등학생이 읽고 풀 수 있는 짧은 문장으로 만든다.',
      '- 보기 4개 중 정답은 반드시 1개만 되게 만든다.',
      '- 해설은 왜 정답인지 한두 문장으로 설명한다.',
    ];
  })();

  const reviewNote = isUnitReview
    ? ['- 단원평가는 단원 전체에서 배운 내용을 골고루 확인하되, 위 핵심 개념 범위를 넘지 않는다.']
    : [];

  return [
    '[차시 정보]',
    `학년: ${grade || ''}학년`,
    `학기: ${unit?.semester || ''}학기`,
    `과목: ${unit?.subject || '수학'}`,
    `출판사: ${unit?.publisher || '공통'}`,
    `단원: ${unitName}`,
    `차시: ${lesson?.no || ''}차시 - ${lessonTitle}`,
    keywords ? `핵심 키워드: ${keywords}` : '',
    '',
    '[학습 목표]',
    `학생이 "${lessonTitle}" 활동을 통해 ${unitName} 단원의 핵심 내용을 이해하고 문제 상황에 맞게 적용할 수 있다.`,
    '',
    '[핵심 개념]',
    ...focusGuide,
    ...reviewNote,
    '',
    '[대표 문제 유형]',
    '- 그림을 보고 같은 것 또는 다른 것 고르기',
    '- 생활 속 상황에서 알맞은 답 고르기',
    '- 조건에 맞게 분류하거나 비교하기',
    '- 자주 하는 실수를 구별하는 문제',
    '',
    '[오답 유도 주의]',
    '- 학생이 자주 헷갈리는 보기를 넣되, 정답이 여러 개가 되면 안 된다.',
    '- 문제, 보기, 해설, 그림 자료의 숫자와 조건이 서로 맞는지 반드시 검산한다.',
    '- 차시 범위를 벗어나는 개념이나 지나치게 복잡한 계산은 피한다.',
  ].filter(Boolean).join('\n');
};

export function TextbookContextTab({ teacherUid, units, loadingUnits, unitGrade, setUnitGrade, unitSem, setUnitSem }) {
  const [selectedUnit,    setSelectedUnit]    = useState(null);
  const [selectedLesson,  setSelectedLesson]  = useState(null);
  const [text,            setText]            = useState('');
  const [existing,        setExisting]        = useState(null); // 기존 등록 내용
  const [saving,          setSaving]          = useState(false);
  const [preGenerating,   setPreGenerating]   = useState(false);
  const [extracting,      setExtracting]      = useState(false);
  const [bulkGenerating,  setBulkGenerating]  = useState(false);
  const [bulkContentGenerating, setBulkContentGenerating] = useState(false);
  const [bulkContentStatus, setBulkContentStatus] = useState({
    total: 0,
    done: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    current: '',
  });
  const [toast,           setToast]           = useState(null);
  const fileRef = React.useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadContext = async (unit, lesson) => {
    const key = lkey(unit, lesson);
    const snap = await getDoc(doc(db, 'aiLessonContext', key));
    if (snap.exists()) { setExisting(snap.data()); setText(snap.data().text || ''); }
    else { setExisting(null); setText(''); }
  };

  const questionFingerprint = (q) =>
    [q?.question, ...(Array.isArray(q?.options) ? q.options : []), q?.skill || '']
      .join('|')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/g, '')
      .slice(0, 90);

  const isUsablePoolQuestion = (question) => {
    const options = Array.isArray(question?.options) ? question.options : [];
    if (options.length !== 4) return false;
    if (!Number.isInteger(question?.answerIndex) || question.answerIndex < 0 || question.answerIndex > 3) return false;
    return new Set(options.map(option => String(option).normalize('NFKC').replace(/\s+/g, '').toLowerCase())).size === 4;
  };

  const QUESTION_TYPE_TARGETS = {
    concept: 2,
    core: 12,
    word: 4,
    applied: 2,
  };

  const questionTypeBucket = (question) => {
    const text = `${question?.skill || ''} ${question?.question || ''}`;
    if (/개념\s*확인|개념/.test(text)) return 'concept';
    if (/생활\s*문장|문장제|생활\s*속|실생활/.test(text)) return 'word';
    if (/응용|오류|잘못|틀린|바르지\s*않/.test(text)) return 'applied';
    return 'core';
  };

  const questionTypeCounts = (questions = []) =>
    questions.reduce((counts, question) => {
      const bucket = questionTypeBucket(question);
      counts[bucket] += 1;
      return counts;
    }, { concept: 0, core: 0, word: 0, applied: 0 });

  const mergeQuestionContent = (baseData, addData) => {
    const baseQuestions = Array.isArray(baseData?.questions) ? baseData.questions.filter(isUsablePoolQuestion) : [];
    const addQuestions = Array.isArray(addData?.questions) ? addData.questions.filter(isUsablePoolQuestion) : [];
    const merged = [...baseQuestions];
    const seen = new Set(baseQuestions.map(questionFingerprint));
    const typeCounts = questionTypeCounts(baseQuestions);
    for (const question of addQuestions) {
      const key = questionFingerprint(question);
      const bucket = questionTypeBucket(question);
      if (!key || seen.has(key) || typeCounts[bucket] >= QUESTION_TYPE_TARGETS[bucket]) continue;
      seen.add(key);
      merged.push(question);
      typeCounts[bucket] += 1;
      if (merged.length >= COURSEWARE_PREGENERATE_COUNT) break;
    }
    return {
      ...baseData,
      ...addData,
      questions: merged,
      poolSize: merged.length,
      isPartialPool: merged.length < COURSEWARE_PREGENERATE_COUNT,
    };
  };

  const preGenerateLessonContent = async (unit, lesson, lessonContext) => {
    const key = lkey(unit, lesson);
    const ref = doc(db, 'aiLessonContent', key);
    const existingSnap = await getDoc(ref);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;
    // 현재 버전의 미완성 풀만 이어서 채우고, 구버전 풀은 섞지 않고 새로 생성합니다.
    let mergedData = isCurrentLessonContent(existingData) ? existingData : null;

    if (isFreshLessonContent(mergedData)) {
      return { added: 0, total: mergedData.questions.length, complete: true };
    }

    const existingQuestions = (mergedData?.questions || [])
      .slice(-8)
      .map((q, index) => `${index + 1}. [${q.skill || '유형 미분류'}] ${q.question}`)
      .join('\n');
    const existingSkillSummary = Object.entries(
      (mergedData?.questions || []).reduce((acc, q) => {
        const key = q.skill || '유형 미분류';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    )
      .map(([skill, count]) => `${skill}: ${count}문항`)
      .join(', ');
    const currentTypeCounts = questionTypeCounts(mergedData?.questions || []);
    const typeDeficits = Object.entries(QUESTION_TYPE_TARGETS)
      .map(([type, target]) => `${type}: ${currentTypeCounts[type]}/${target}`)
      .join(', ');
    const chunkContext = [
      lessonContext,
      `[최종 20문항 유형 목표]\n개념 확인 2, 핵심 기능 연습 12, 생활 문장제 4, 응용·오류 찾기 2\n현재 분포: ${typeDeficits}\n목표보다 부족한 유형을 우선 생성하세요.`,
      existingSkillSummary
        ? `[이미 생성된 문제 유형 분포]\n${existingSkillSummary}\n많이 나온 유형은 피하고 부족한 유형을 우선 생성하세요.`
        : '',
      existingQuestions
        ? `[이미 생성된 문항 일부]\n${existingQuestions}\n위 문항과 같은 문제를 반복하지 말고 같은 차시 범위에서 새로운 숫자/상황으로 5문항을 생성하세요.`
        : '',
    ].filter(Boolean).join('\n\n');

    const response = await fetch('/api/generate-courseware', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grade: unit.grade,
        semester: unit.semester,
        publisher: unit.publisher || '국정',
        unitName: unit.unitName,
        lessonNo: lesson.no,
        lessonTitle: lesson.title,
        learningGoal: '',
        keywords: lesson.keywords || [],
        difficulty: 'normal',
        questionCount: COURSEWARE_CHUNK_SIZE,
        lessonContext: chunkContext,
        fastInitial: true,
        allowPartial: true,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      throw new Error(data?.error || `문제 사전 생성 실패 (${response.status})`);
    }

    const beforeCount = mergedData?.questions?.length || 0;
    mergedData = mergeQuestionContent(mergedData, data);
    const afterCount = mergedData?.questions?.length || 0;
    if (afterCount <= beforeCount) {
      throw new Error('중복이 아닌 새 문항을 충분히 생성하지 못했습니다.');
    }

    await setDoc(ref, {
      ...mergedData,
      lessonKey: key,
      grade: unit.grade,
      semester: unit.semester,
      publisher: unit.publisher,
      unitId: unit.id,
      unitName: unit.unitName,
      lessonNo: lesson.no,
      lessonTitle: lesson.title,
      createdAt: existingSnap.exists() ? existingSnap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return {
      added: afterCount - beforeCount,
      total: afterCount,
      complete: afterCount >= COURSEWARE_PREGENERATE_COUNT,
    };
  };

  const fillLessonContentToTarget = async (unit, lesson, lessonContext, onChunkSaved) => {
    let added = 0;
    let total = 0;
    let calls = 0;
    let consecutiveFailures = 0;
    let lastError = null;

    while (total < COURSEWARE_PREGENERATE_COUNT && calls < COURSEWARE_MAX_CHUNK_CALLS) {
      calls += 1;
      try {
        const generated = await preGenerateLessonContent(unit, lesson, lessonContext);
        added += generated.added;
        total = generated.total;
        consecutiveFailures = 0;
        onChunkSaved?.(generated);
        if (generated.complete) {
          return { added, total, complete: true, calls };
        }
      } catch (err) {
        lastError = err;
        consecutiveFailures += 1;
        if (consecutiveFailures >= COURSEWARE_MAX_CHUNK_FAILURES) throw err;
      }
    }

    if (total < COURSEWARE_PREGENERATE_COUNT) {
      throw lastError || new Error(`20문항 중 ${total}문항까지 저장되었습니다. 부족한 문항만 다시 생성해 주세요.`);
    }
    return { added, total, complete: true, calls };
  };

  const saveContext = async () => {
    if (!selectedUnit || !selectedLesson) return;
    if (!text.trim()) { showToast('내용을 입력해주세요', 'error'); return; }
    setSaving(true);
    const key = lkey(selectedUnit, selectedLesson);
    const data = {
      text: text.trim(), lessonKey: key,
      grade: selectedUnit.grade, semester: selectedUnit.semester,
      unitName: selectedUnit.unitName, lessonTitle: selectedLesson.title,
      teacherUid, uploadedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'aiLessonContext', key), data);
    setExisting(data);
    setSaving(false);
    showToast('교과서 내용이 저장됐습니다. 문제를 미리 생성합니다.');

    setPreGenerating(true);
    fillLessonContentToTarget(selectedUnit, selectedLesson, data.text)
      .then(() => showToast('문제 사전 생성 완료! 학생은 바로 학습을 시작할 수 있습니다.'))
      .catch(err => showToast(`문제 사전 생성 실패: ${err.message}`, 'error'))
      .finally(() => setPreGenerating(false));
  };

  const deleteContext = async () => {
    if (!window.confirm('교과서 내용을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'aiLessonContext', lkey(selectedUnit, selectedLesson)));
    setExisting(null); setText('');
    showToast('삭제됐습니다');
  };

  const generateSelectedContext = () => {
    if (!selectedUnit || !selectedLesson) return;
    setText(buildAutoLessonContextV2(selectedUnit, selectedLesson).slice(0, 3000));
    showToast('선택한 차시의 AI 출제용 자료를 작성했습니다.');
  };

  const autoCreateMissingContexts = async () => {
    const targetUnits = units.filter(u => unitSem === 'all' || String(u.semester || '') === unitSem);
    const lessons = targetUnits.flatMap(unit => (unit.lessons || []).map(lesson => ({ unit, lesson })));
    if (!lessons.length) {
      showToast('생성할 차시가 없습니다.', 'error');
      return;
    }
    if (!window.confirm(`현재 선택한 ${unitGrade}학년 ${unitSem === 'all' ? '전체 학기' : `${unitSem}학기`}의 비어 있는 차시 자료를 자동 생성할까요?`)) return;

    setBulkGenerating(true);
    let created = 0;
    let skipped = 0;
    try {
      for (const { unit, lesson } of lessons) {
        const key = lkey(unit, lesson);
        const ref = doc(db, 'aiLessonContext', key);
        const snap = await getDoc(ref);
        const existingData = snap.exists() ? snap.data() : null;
        if (existingData?.source !== 'auto-generated' && String(existingData?.text || '').trim()) {
          skipped += 1;
          continue;
        }

        await setDoc(ref, {
          text: buildAutoLessonContextV2(unit, lesson).slice(0, 3000),
          lessonKey: key,
          grade: unit.grade,
          semester: unit.semester,
          unitName: unit.unitName,
          lessonTitle: lesson.title,
          lessonNo: lesson.no || null,
          teacherUid,
          source: 'auto-generated',
          generatedFrom: 'curriculumUnits',
          uploadedAt: serverTimestamp(),
        });
        created += 1;
      }
      if (selectedUnit && selectedLesson) await loadContext(selectedUnit, selectedLesson);
      showToast(`차시 자료 ${created}개 생성, ${skipped}개 건너뜀`);
    } catch (err) {
      showToast('자동 생성 중 오류가 발생했습니다: ' + err.message, 'error');
    } finally {
      setBulkGenerating(false);
    }
  };

  const getLessonContextForPreGenerate = async (unit, lesson) => {
    const key = lkey(unit, lesson);
    const snap = await getDoc(doc(db, 'aiLessonContext', key));
    const savedData = snap.exists() ? snap.data() : null;
    const savedText = String(savedData?.text || '').trim();
    if (savedData?.source === 'auto-generated') {
      return buildAutoLessonContextV2(unit, lesson).slice(0, 3000);
    }
    if (savedText) return savedText.slice(0, 3000);
    return buildAutoLessonContextV2(unit, lesson).slice(0, 3000);
  };

  const collectPreGenerateLessons = (targetUnits) => targetUnits.flatMap(unit =>
    (unit.lessons || []).map(lesson => ({ unit, lesson }))
  );

  const loadGradeUnitsForPreGenerate = async (grades = ['1', '2', '3', '4', '5', '6']) => {
    const snaps = await Promise.all(grades.map(grade =>
      getDocs(query(
        collection(db, 'curriculumUnits'),
        where('grade', '==', parseInt(grade)),
        where('subject', '==', '수학'),
        where('status', '==', 'approved'),
      ))
    ));
    return snaps.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
      .filter(unit => unitSem === 'all' || String(unit.semester || '') === unitSem)
      .sort((a, b) =>
        (a.grade || 0) - (b.grade || 0) ||
        (a.semester || 0) - (b.semester || 0) ||
        (a.unitNumber || 0) - (b.unitNumber || 0)
      );
  };

  const bulkPreGenerateLessonContent = async ({ allGrades = false, targetGrade = null } = {}) => {
    const targetUnits = allGrades || targetGrade
      ? await loadGradeUnitsForPreGenerate(targetGrade ? [String(targetGrade)] : undefined)
      : units.filter(u => unitSem === 'all' || String(u.semester || '') === unitSem);
    const lessons = collectPreGenerateLessons(targetUnits);

    if (!lessons.length) {
      showToast('미리 생성할 차시가 없습니다.', 'error');
      return;
    }

    const gradeLabel = allGrades ? '1~6학년' : `${targetGrade || unitGrade}학년`;
    const semLabel = unitSem === 'all' ? '전체 학기' : `${unitSem}학기`;
    if (!window.confirm(`${gradeLabel} ${semLabel}에서 20문항 미만 또는 구버전인 차시만 생성할까요?\n현재 버전 20문항이 준비된 차시는 자동으로 건너뜁니다.`)) return;

    setBulkContentGenerating(true);
    setBulkContentStatus({
      total: lessons.length,
      done: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      current: '',
    });

    let created = 0;
    let skipped = 0;
    let failed = 0;

    try {
      for (const { unit, lesson } of lessons) {
        const current = `${unit.unitName} - ${lesson.title}`;
        setBulkContentStatus(prev => ({ ...prev, current }));

        try {
          const key = lkey(unit, lesson);
          const contentSnap = await getDoc(doc(db, 'aiLessonContent', key));
          if (contentSnap.exists() && isFreshLessonContent(contentSnap.data())) {
            skipped += 1;
            setBulkContentStatus(prev => ({
              ...prev,
              done: prev.done + 1,
              skipped,
              current,
            }));
            continue;
          }

          const lessonContext = await getLessonContextForPreGenerate(unit, lesson);
          await fillLessonContentToTarget(unit, lesson, lessonContext, generated => {
            created += generated.added;
            setBulkContentStatus(prev => ({
              ...prev,
              created,
              current: `${current} (${generated.total}/${COURSEWARE_PREGENERATE_COUNT})`,
            }));
          });
          setBulkContentStatus(prev => ({
            ...prev,
            done: prev.done + 1,
            created,
            current,
          }));
        } catch (err) {
          console.error('[AI courseware pre-generate failed]', current, err);
          failed += 1;
          setBulkContentStatus(prev => ({
            ...prev,
            done: prev.done + 1,
            failed,
            current,
          }));
        }
      }

      showToast(`문제 미리 생성 완료: 새 문항 ${created}개, 완료 차시 건너뜀 ${skipped}개, 실패 차시 ${failed}개`);
    } finally {
      setBulkContentGenerating(false);
    }
  };

  const extractFromFile = async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    setExtracting(true);
    const reader = new FileReader();

    // PPTX: JSZip 텍스트 추출
    if (ext === 'pptx' || ext === 'ppt') {
      try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        const slideFiles = Object.keys(zip.files)
          .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
          .sort((a, b) => parseInt(a.match(/\d+/)?.[0]||0) - parseInt(b.match(/\d+/)?.[0]||0));
        const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
        const parts = [];
        for (let i = 0; i < slideFiles.length; i++) {
          const xml = await zip.files[slideFiles[i]].async('text');
          let t = '';
          try {
            const d = new DOMParser().parseFromString(xml, 'text/xml');
            if (!d.querySelector('parsererror'))
              t = Array.from(d.getElementsByTagNameNS(NS_A, 't')).map(n => n.textContent?.trim()).filter(Boolean).join(' ');
          } catch (_) {}
          if (!t) t = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map(m=>m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim()).filter(Boolean).join(' ');
          if (t) parts.push(`[슬라이드 ${i+1}]\n${t}`);
        }
        const result = parts.join('\n\n').slice(0, 3000);
        setText(result);
        showToast(`📊 PPT 추출 완료 (${result.length}자)`);
      } catch (err) { showToast('PPT 추출 실패: ' + err.message, 'error'); }
      finally { setExtracting(false); if (fileRef.current) fileRef.current.value = ''; }
      return;
    }

    // PDF / 이미지: Claude API로 전송
    reader.onload = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        const body = ext === 'pdf'
          ? { pdfBase64: base64, lessonTitle: selectedLesson?.title }
          : { imageBase64: base64, mediaType: file.type, lessonTitle: selectedLesson?.title };
        const res = await fetch('/api/extract-lesson-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.text) { setText(data.text); showToast(`✅ 추출 완료 (${data.chars}자)`); }
        else showToast('추출 실패: ' + (data.error || '알 수 없는 오류'), 'error');
      } catch (err) { showToast('추출 실패: ' + err.message, 'error'); }
      finally { setExtracting(false); if (fileRef.current) fileRef.current.value = ''; }
    };
    reader.readAsDataURL(file);
  };

  const filteredUnits = units.filter(u => unitSem === 'all' || String(u.semester || '') === unitSem);

  return (
    <div className="flex gap-4">
      {/* 왼쪽: 차시 트리 */}
      <div className="w-56 shrink-0 space-y-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
          <p className="text-xs font-bold text-slate-500 mb-2">학년</p>
          <div className="flex flex-wrap gap-1">
            {['1','2','3','4','5','6'].map(g => (
              <button key={g} onClick={() => { setUnitGrade(g); setSelectedUnit(null); setSelectedLesson(null); setExisting(null); setText(''); }}
                className={`w-8 h-8 rounded-lg text-sm font-extrabold transition-all
                  ${unitGrade === g ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-indigo-50'}`}>{g}</button>
            ))}
          </div>
          <div className="flex gap-1 mt-2">
            {['all','1','2'].map(s => (
              <button key={s} onClick={() => setUnitSem(s)}
                className={`px-2 h-7 rounded-lg text-xs font-bold transition-all
                  ${unitSem === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {s === 'all' ? '전체' : `${s}학기`}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
          <button
            onClick={autoCreateMissingContexts}
            disabled={bulkGenerating || loadingUnits}
            className="w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold disabled:opacity-50 transition-colors"
          >
            {bulkGenerating ? '생성 중...' : '빈 차시 자료 자동 생성'}
          </button>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            등록된 단원/차시/키워드를 바탕으로 AI 출제용 맥락 자료를 만듭니다. 이미 입력된 차시는 건너뜁니다.
          </p>
        </div>

        <div className="bg-white border border-indigo-200 rounded-2xl p-3 shadow-sm">
          <button
            onClick={bulkPreGenerateLessonContent}
            disabled={bulkContentGenerating || loadingUnits || !filteredUnits.length}
            className="w-full px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold disabled:opacity-50 transition-colors"
          >
            {bulkContentGenerating ? '문제 생성 중...' : '미완성·구버전 차시 문제 생성'}
          </button>
          <div className="grid grid-cols-3 gap-1.5 mt-2">
            {['1', '2', '3', '4', '5', '6'].map(grade => (
              <button
                key={grade}
                onClick={() => bulkPreGenerateLessonContent({ targetGrade: grade })}
                disabled={bulkContentGenerating || loadingUnits}
                className="px-2 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-extrabold disabled:opacity-50 transition-colors"
              >
                {grade}학년
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            현재 버전 문제 20문항 미만이거나 구버전인 차시만 생성합니다. 구버전 문제는 섞지 않고 새 문제로 교체하며, 실행할 때마다 차시별 최대 5문항씩 20문항까지 채웁니다.
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-indigo-600">
            유형 목표: 개념 확인 2 · 핵심 기능 12 · 생활 문장제 4 · 응용·오류 2
          </p>
          {bulkContentGenerating && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                <span>{bulkContentStatus.done}/{bulkContentStatus.total}</span>
                <span>새 문항 {bulkContentStatus.created} · 완료 차시 {bulkContentStatus.skipped} · 실패 차시 {bulkContentStatus.failed}</span>
              </div>
              <ProgressBar
                pct={bulkContentStatus.total ? (bulkContentStatus.done / bulkContentStatus.total) * 100 : 0}
                color="bg-indigo-500"
                h="h-2"
              />
              <p className="text-[10px] leading-relaxed text-indigo-600 line-clamp-2">
                {bulkContentStatus.current || '준비 중...'}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden max-h-[500px] overflow-y-auto">
          {loadingUnits ? <div className="p-4 text-slate-400 text-xs text-center">로딩중...</div>
            : filteredUnits.map(unit => (
            <div key={unit.id}>
              <button onClick={() => { setSelectedUnit(u => u?.id === unit.id ? null : unit); setExisting(null); setText(''); }}
                className={`w-full text-left px-3 py-2 text-xs font-bold border-b border-slate-100 transition-colors
                  ${selectedUnit?.id === unit.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}>
                {unit.unitNumber}. {unit.unitName}
              </button>
              {selectedUnit?.id === unit.id && (unit.lessons || []).map(lesson => (
                <button key={lesson.no}
                  onClick={() => { setSelectedLesson(lesson); loadContext(unit, lesson); }}
                  className={`w-full text-left pl-5 pr-3 py-1.5 text-[11px] border-t border-slate-100 transition-colors
                    ${selectedLesson?.no === lesson.no ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {lesson.no}차시 {lesson.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 오른쪽: 에디터 */}
      <div className="flex-1 min-w-0">
        {!selectedLesson ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
            <div className="text-4xl mb-3">📖</div>
            <p className="font-bold text-slate-600">차시를 선택하세요</p>
            <p className="text-sm mt-1">교과서 내용을 등록하면 AI가 이를 기반으로<br/>더 정확한 문제를 생성합니다</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 헤더 */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-extrabold text-slate-800">{selectedLesson.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedUnit.unitName} · {selectedUnit.grade}학년</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={generateSelectedContext}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-colors"
                  >
                    차시 자료 자동 작성
                  </button>
                {existing && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                    ✅ 교과서 내용 등록됨
                  </span>
                )}
                </div>
              </div>
              {existing?.uploadedAt?.seconds && (
                <p className="text-[10px] text-slate-400 mt-1">
                  등록일: {new Date(existing.uploadedAt.seconds * 1000).toLocaleDateString('ko-KR')}
                </p>
              )}
            </div>

            {/* 파일 업로드 (PDF / 이미지 / PPT) */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-sm font-bold text-blue-800 mb-1">📄 파일에서 자동 추출</p>
              <p className="text-xs text-blue-600 mb-3">PDF·이미지는 Claude AI가, PPT/PPTX는 직접 텍스트를 추출합니다</p>
              <div className="flex items-center gap-3 mb-3">
                <input ref={fileRef} type="file" accept=".pdf,.ppt,.pptx,image/*"
                  onChange={e => { if (e.target.files[0]) extractFromFile(e.target.files[0]); }}
                  className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={extracting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors">
                  {extracting ? '⏳ 추출 중...' : '📁 파일 업로드'}
                </button>
                <span className="text-[10px] text-blue-500">PDF · PPT/PPTX · 이미지 지원</span>
                {extracting && <p className="text-xs text-blue-600 animate-pulse">추출 중...</p>}
              </div>
              {/* 저작권 안내 */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[10px] text-amber-800">
                <p className="font-extrabold mb-0.5">⚠️ 저작권 안내</p>
                <p>타 사이트·출판사의 PDF/PPT 등 저작권 자료를 직접 등록하면 저작권법에 위반될 수 있습니다. 본인이 직접 작성한 학습자료나 저작권이 소멸된 공개 자료만 사용하세요.</p>
              </div>
            </div>

            {/* 텍스트 에디터 */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-700">교과서 내용 입력</p>
                <p className="text-xs text-slate-400">{text.length}자 / 최대 3,000자</p>
              </div>
              <textarea
                value={text}
                onChange={e => setText(e.target.value.slice(0, 3000))}
                placeholder={`이 차시의 교과서 내용을 입력하거나 PDF를 업로드하세요.\n\n예시:\n분모가 같은 분수의 덧셈을 알아볼까요?\n\n3/5와 1/5를 더하면?\n→ 분모는 그대로 두고 분자끼리만 더합니다\n→ 3/5 + 1/5 = (3+1)/5 = 4/5\n\n핵심: 분모가 같으면 분자끼리 더하고, 분모는 변하지 않습니다.`}
                className="w-full h-64 px-4 py-3 text-sm text-slate-700 resize-none focus:outline-none"
              />
            </div>

            {/* 저장/삭제 버튼 */}
            <div className="flex gap-3">
              <button onClick={saveContext} disabled={saving || preGenerating || !text.trim()}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-sm disabled:opacity-50 transition-colors shadow-md">
                {saving ? '저장 중...' : preGenerating ? '문제 미리 생성 중...' : '💾 교과서 내용 저장'}
              </button>
              {existing && (
                <button onClick={deleteContext}
                  className="px-5 py-3 border border-rose-300 text-rose-500 hover:bg-rose-50 font-bold rounded-xl text-sm transition-colors">
                  삭제
                </button>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800">
              <p className="font-bold mb-1">💡 활용 방법</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>교과서 핵심 개념, 예제 문제, 공식을 입력하세요</li>
                <li>저장하면 입력한 내용을 기반으로 문제를 미리 생성합니다</li>
                <li>사전 생성이 완료된 차시는 학생이 기다리지 않고 바로 시작할 수 있습니다</li>
                <li>최대 3,000자까지 입력 가능합니다</li>
                <li className="font-bold text-amber-900">📣 전체 적용: 등록된 교과서 내용은 같은 학년·단원·차시의 모든 AI 학습관 문제 생성에 반영됩니다 (반 구분 없이)</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl
          ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} text-white`}
          style={{ whiteSpace: 'nowrap' }}>{toast.msg}</div>
      )}
    </div>
  );
}

// ── 문제 검토 탭 ─────────────────────────────────────────────
export const CACHE_VER = 'v3';
export const lkey = (unit, lesson) =>
  `${CACHE_VER}_${unit.grade}_${unit.semester || 0}_${unit.publisher || 'default'}_${unit.id}_${lesson.no}`;

export function QuestionReviewTab({ teacherUid, students, unitGrade, setUnitGrade, unitSem, setUnitSem, units, loadingUnits }) {
  const [selectedUnit,   setSelectedUnit]   = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [content,        setContent]        = useState(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [editingIdx,     setEditingIdx]     = useState(null);
  const [editData,       setEditData]       = useState({});
  const [saving,         setSaving]         = useState(false);

  const loadContent = async (unit, lesson) => {
    setLoadingContent(true); setContent(null); setEditingIdx(null);
    const key = lkey(unit, lesson);
    const snap = await getDoc(doc(db, 'aiLessonContent', key));
    setContent(snap.exists() ? snap.data() : null);
    setLoadingContent(false);
  };

  const startEdit = (idx, q) => {
    setEditingIdx(idx);
    setEditData({ question: q.question, options: [...(q.options || [])], answerIndex: q.answerIndex, explanation: q.explanation || '' });
  };

  const saveEdit = async () => {
    if (!selectedUnit || !selectedLesson || editingIdx === null) return;
    setSaving(true);
    const key = lkey(selectedUnit, selectedLesson);
    const newQs = [...(content.questions || [])];
    newQs[editingIdx] = { ...newQs[editingIdx], ...editData };
    const newContent = { ...content, questions: newQs };
    await setDoc(doc(db, 'aiLessonContent', key), newContent, { merge: true });
    setContent(newContent); setEditingIdx(null); setSaving(false);
  };

  const deleteQ = async (idx) => {
    if (!window.confirm('이 문제를 삭제하시겠습니까?')) return;
    const key = lkey(selectedUnit, selectedLesson);
    const newQs = (content.questions || []).filter((_, i) => i !== idx);
    const newContent = { ...content, questions: newQs };
    await setDoc(doc(db, 'aiLessonContent', key), newContent, { merge: true });
    setContent(newContent);
  };

  const filteredUnits = units.filter(u => unitSem === 'all' || String(u.semester || '') === unitSem);

  return (
    <div className="flex gap-4">
      {/* 왼쪽: 단원/차시 선택 */}
      <div className="w-56 shrink-0 space-y-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
          <p className="text-xs font-bold text-slate-500 mb-2">학년</p>
          <div className="flex flex-wrap gap-1">
            {['1','2','3','4','5','6'].map(g => (
              <button key={g} onClick={() => { setUnitGrade(g); setSelectedUnit(null); setContent(null); }}
                className={`w-8 h-8 rounded-lg text-sm font-extrabold transition-all
                  ${unitGrade === g ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-indigo-50'}`}>{g}</button>
            ))}
          </div>
        </div>
        {unitGrade && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {loadingUnits ? <div className="p-4 text-slate-400 text-xs text-center">로딩중...</div>
              : filteredUnits.map(unit => (
              <div key={unit.id}>
                <button onClick={() => { setSelectedUnit(unit === selectedUnit ? null : unit); setContent(null); }}
                  className={`w-full text-left px-3 py-2 text-xs font-bold transition-colors
                    ${selectedUnit?.id === unit.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}>
                  {unit.unitNumber}. {unit.unitName}
                </button>
                {selectedUnit?.id === unit.id && (unit.lessons || []).map(lesson => (
                  <button key={lesson.no}
                    onClick={() => { setSelectedLesson(lesson); loadContent(unit, lesson); }}
                    className={`w-full text-left pl-5 pr-3 py-1.5 text-[11px] transition-colors border-t border-slate-100
                      ${selectedLesson?.no === lesson.no ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>
                    {lesson.no}차시 {lesson.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 오른쪽: 문제 목록 */}
      <div className="flex-1 min-w-0">
        {!selectedLesson ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
            <div className="text-3xl mb-2">📝</div>
            <p className="font-bold">왼쪽에서 차시를 선택하세요</p>
          </div>
        ) : loadingContent ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 animate-pulse">로딩중...</div>
        ) : !content ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
            <p className="font-bold">캐시된 문제가 없습니다</p>
            <p className="text-xs mt-1">학생이 이 차시에 접속하면 문제가 생성됩니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 검증 이슈 */}
            {content.validationIssues?.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
                <p className="font-bold text-rose-700 text-sm mb-2">⚠️ 자동 검증 이슈</p>
                {content.validationIssues.map((issue, i) => (
                  <p key={i} className="text-rose-600 text-xs">• {issue}</p>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-700">{selectedLesson.title} — 문제 {(content.questions || []).length}개</p>
              <p className="text-xs text-slate-400">생성: {content.validatedAt ? new Date(content.validatedAt).toLocaleDateString('ko-KR') : '-'}</p>
            </div>
            {(content.questions || []).map((q, idx) => (
              <div key={idx} className={`bg-white border rounded-2xl p-4 shadow-sm transition-all
                ${editingIdx === idx ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="text-xs font-bold text-slate-400 shrink-0">Q{idx+1}</span>
                  <div className="flex gap-1.5 shrink-0">
                    {editingIdx === idx ? (
                      <>
                        <button onClick={saveEdit} disabled={saving}
                          className="text-xs font-bold px-3 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">저장</button>
                        <button onClick={() => setEditingIdx(null)}
                          className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-200 text-slate-600">취소</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(idx, q)}
                          className="text-xs font-bold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-300">✏️ 수정</button>
                        <button onClick={() => deleteQ(idx)}
                          className="text-xs font-bold px-2.5 py-1 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50">🗑</button>
                      </>
                    )}
                  </div>
                </div>

                {editingIdx === idx ? (
                  <div className="space-y-2">
                    <textarea value={editData.question} onChange={e => setEditData(p => ({ ...p, question: e.target.value }))}
                      className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400" rows={3} />
                    {(editData.options || []).map((opt, oi) => (
                      <div key={oi} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border
                        ${editData.answerIndex === oi ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                        <button onClick={() => setEditData(p => ({ ...p, answerIndex: oi }))}
                          className={`w-5 h-5 rounded-full border-2 shrink-0 ${editData.answerIndex === oi ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`} />
                        <input value={opt} onChange={e => {
                          const newOpts = [...editData.options]; newOpts[oi] = e.target.value;
                          setEditData(p => ({ ...p, options: newOpts }));
                        }} className="flex-1 text-sm bg-transparent outline-none" />
                        <span className="text-[10px] text-slate-400">①②③④"[oi]"</span>
                      </div>
                    ))}
                    <input value={editData.explanation} onChange={e => setEditData(p => ({ ...p, explanation: e.target.value }))}
                      placeholder="해설..." className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400" />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-bold text-slate-800 mb-2">{q.question}</p>
                    <div className="space-y-1">
                      {(q.options || []).map((opt, oi) => (
                        <div key={oi} className={`text-xs px-3 py-1.5 rounded-xl
                          ${oi === q.answerIndex ? 'bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold' : 'bg-slate-50 text-slate-600'}`}>
                          {oi === q.answerIndex ? '✅ ' : `${['①','②','③','④'][oi]} `}{opt}
                        </div>
                      ))}
                    </div>
                    {q.explanation && <p className="text-xs text-slate-500 mt-2 italic">💡 {q.explanation}</p>}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 취약 분석 탭 ─────────────────────────────────────────────
function WeaknessTab({ teacherUid, students, onCreateReview }) {
  const [wrongData,  setWrongData]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filterUnit, setFilterUnit] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');

  useEffect(() => {
    if (!students.length) return;
    setLoading(true);
    const codes = students.map(s => s.studentCode).filter(Boolean);
    const batches = [];
    for (let i = 0; i < codes.length; i += 10) batches.push(codes.slice(i, i + 10));
    Promise.all(batches.map(b =>
      getDocs(query(collection(db, 'aiWrongAnswers'), where('studentCode', 'in', b)))
    )).then(snaps => {
      const all = snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
      const deduped = new Map();
      all.forEach(item => {
        const key = `${item.studentCode}_${item.questionKey || item.id}`;
        const previous = deduped.get(key);
        if (!previous) {
          deduped.set(key, item);
          return;
        }
        previous.wrongCount = Math.max(previous.wrongCount || 1, item.wrongCount || 1);
        if (item.resolved || item.status === 'resolved') {
          previous.resolved = true;
          previous.status = 'resolved';
        }
      });
      setWrongData([...deduped.values()]);
    }).finally(() => setLoading(false));
  }, [students]);

  const statusFilteredData = wrongData.filter(item => {
    const status = item.status || (item.resolved ? 'resolved' : 'unresolved');
    if (filterStatus === 'all') return true;
    if (filterStatus === 'resolved') return status === 'resolved';
    return status !== 'resolved';
  });

  // 차시별 오답 집계
  const lessonMap = {};
  statusFilteredData.forEach(w => {
    const key = w.lessonKey || `${w.unitName}_${w.lessonTitle}`;
    if (!lessonMap[key]) lessonMap[key] = { unitName: w.unitName, lessonTitle: w.lessonTitle, count: 0, questions: {}, wrongAnswers: [] };
    lessonMap[key].count++;
    lessonMap[key].wrongAnswers.push(w);
    const qt = (w.questionText || '').slice(0, 60);
    if (!lessonMap[key].questions[qt]) lessonMap[key].questions[qt] = 0;
    lessonMap[key].questions[qt]++;
  });
  const sorted = Object.values(lessonMap).sort((a, b) => b.count - a.count);
  const unitNames = [...new Set(sorted.map(s => s.unitName))];

  const filtered = filterUnit ? sorted.filter(s => s.unitName === filterUnit) : sorted;
  const conceptSummary = Object.values(statusFilteredData.reduce((acc, wrong) => {
    const concept = classifyWeakConcept(wrong);
    if (!acc[concept]) acc[concept] = { concept, count: 0, students: new Set(), wrongAnswers: [] };
    acc[concept].count += 1;
    acc[concept].students.add(wrong.studentCode);
    acc[concept].wrongAnswers.push(wrong);
    return acc;
  }, {}))
    .map(item => ({ ...item, studentCount: item.students.size }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-4">
      {!!conceptSummary.length && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold text-indigo-600">AI 학습 요약</p>
              <h3 className="mt-1 font-black text-slate-800">
                가장 먼저 지도할 개념은 {conceptSummary[0].concept}입니다.
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                오답 {conceptSummary[0].count}건, 관련 학생 {conceptSummary[0].studentCount}명으로 분류되었습니다.
              </p>
            </div>
            <button type="button"
              onClick={() => onCreateReview?.(
                conceptSummary[0].wrongAnswers.filter(item => !item.resolved && item.status !== 'resolved'),
                `${conceptSummary[0].concept} 복습 퀴즈`
              )}
              disabled={!conceptSummary[0].wrongAnswers.some(item => !item.resolved && item.status !== 'resolved')}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
              복습 퀴즈 바로 만들기
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {conceptSummary.slice(0, 8).map(item => (
              <button type="button" key={item.concept}
                onClick={() => onCreateReview?.(
                  item.wrongAnswers.filter(wrong => !wrong.resolved && wrong.status !== 'resolved'),
                  `${item.concept} 복습 퀴즈`
                )}
                disabled={!item.wrongAnswers.some(wrong => !wrong.resolved && wrong.status !== 'resolved')}
                className="rounded-xl border border-indigo-100 bg-white px-3 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40">
                <p className="text-xs font-black text-slate-700">{item.concept}</p>
                <p className="mt-1 text-[11px] font-bold text-slate-400">오답 {item.count}건 · 학생 {item.studentCount}명</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="font-extrabold text-slate-700">🔍 오답 기록 분석</h3>
        <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:border-indigo-400">
          <option value="">전체 단원</option>
          {unitNames.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {[['active', '미해결'], ['resolved', '해결'], ['all', '전체']].map(([value, label]) => (
            <button type="button" key={value} onClick={() => setFilterStatus(value)}
              className={`rounded-lg px-3 py-1 text-xs font-extrabold ${filterStatus === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">표시 {statusFilteredData.length}건 · 전체 {wrongData.length}건</span>
      </div>

      {loading ? <div className="text-center py-10 text-slate-400 animate-pulse">불러오는 중...</div>
        : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
            <div className="text-3xl mb-2">📭</div>
            <p className="font-bold">오답 기록이 없습니다</p>
            <p className="text-xs mt-1">학생들이 AI 학습을 완료하면 기록이 쌓입니다</p>
          </div>
        ) : filtered.map((item, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
              <div>
                <span className="font-extrabold text-slate-800 text-sm">{item.lessonTitle}</span>
                <span className="text-xs text-slate-500 ml-2">{item.unitName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full
                  ${item.count >= 10 ? 'bg-rose-100 text-rose-700' : item.count >= 5 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                  {item.count}회 오답
                </span>
                <button type="button"
                  onClick={() => onCreateReview?.(
                    item.wrongAnswers.filter(wrong => !wrong.resolved && wrong.status !== 'resolved'),
                    `${item.unitName || ''} ${item.lessonTitle || ''} 복습 퀴즈`.trim()
                  )}
                  disabled={!item.wrongAnswers.some(wrong => !wrong.resolved && wrong.status !== 'resolved')}
                  className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-extrabold text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40">
                  복습 퀴즈
                </button>
              </div>
            </div>
            <div className="px-5 py-3 space-y-1.5">
              {Object.entries(item.questions)
                .sort(([,a],[,b]) => b - a)
                .slice(0, 5)
                .map(([qt, cnt], qi) => (
                  <div key={qi} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-400 rounded-full"
                          style={{ width: `${Math.min(100, (cnt / item.count) * 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-rose-600 shrink-0 w-10 text-right">{cnt}회</span>
                    <p className="text-xs text-slate-600 truncate" style={{ maxWidth: 240 }}>{qt || '(문제 내용 없음)'}</p>
                  </div>
                ))
              }
            </div>
          </div>
        ))}
    </div>
  );
}
