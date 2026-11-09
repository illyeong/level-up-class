import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, getDocs, doc, getDoc, setDoc, updateDoc,
  query, where, serverTimestamp, runTransaction,
} from 'firebase/firestore';
import { db } from '../../firebase';
import useCoursewareAccess from '../../hooks/useCoursewareAccess';
import { allowedCoursewareGrades, filterCoursewareUnits, isCoursewareLessonAllowed } from '../../utils/coursewareAccess';
import { renderMath, TableRenderer, stripOptionPrefix } from '../../utils/renderMath';
import ShapeRenderer from '../../components/ShapeRenderer';
import { getMaxExpForLevel } from '../../utils/leveling';
import {
  getRenderableQuestionShape,
  hasMissingRequiredVisual,
  inferFractionBarShape,
} from '../../utils/inferFractionBarShape';
import { validateDeterministicMathQuestion } from '../../utils/validateCoursewareMathQuestion';
import { normalizeCoursewareChoices } from '../../utils/coursewareOptions';

const MAX_REWARD = { exp: 30, gold: 20, diamonds: 10 }; // 최대 보상 (정답률 100%)
const DAILY_LIMIT   = 5;  // 하루 최대 보상 횟수
const SESSION_Q_NUM = 5;  // 매 세션에 출제할 문제 수 (풀에서 랜덤 선택)
const POOL_TARGET_Q_NUM = 20;
const SHARED_POOL_MAX_Q_NUM = 40;
const SHARED_POOL_GROW_Q_NUM = 5;
const SHARED_POOL_GROW_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const SHARED_POOL_GROW_LOCK_MS = 2 * 60 * 1000;
const MASTERY_ATTEMPTS = 4; // 숙달도 판정에 사용할 최고 점수 개수
const UNIT_CARD_PALETTES = [
  { from: 'from-[#1d4ed8]', to: 'to-[#3730a3]', ring: 'ring-blue-400/25', num: 'text-blue-100', tag: 'bg-blue-300/15 text-blue-100' },
  { from: 'from-[#4338ca]', to: 'to-[#312e81]', ring: 'ring-indigo-400/25', num: 'text-indigo-100', tag: 'bg-indigo-300/15 text-indigo-100' },
  { from: 'from-[#0e7490]', to: 'to-[#155e75]', ring: 'ring-cyan-400/25', num: 'text-cyan-100', tag: 'bg-cyan-300/15 text-cyan-100' },
  { from: 'from-[#0f766e]', to: 'to-[#115e59]', ring: 'ring-teal-400/25', num: 'text-teal-100', tag: 'bg-teal-300/15 text-teal-100' },
  { from: 'from-[#6d28d9]', to: 'to-[#4c1d95]', ring: 'ring-violet-400/25', num: 'text-violet-100', tag: 'bg-violet-300/15 text-violet-100' },
  { from: 'from-[#0369a1]', to: 'to-[#164e63]', ring: 'ring-sky-400/25', num: 'text-sky-100', tag: 'bg-sky-300/15 text-sky-100' },
];
const WRONG_CAUSES = [
  ['concept', '개념을 헷갈렸어요'],
  ['calculation', '계산 실수였어요'],
  ['condition', '문제 조건을 놓쳤어요'],
  ['visual', '단위·그림을 잘못 읽었어요'],
  ['rushed', '너무 빠르게 골랐어요'],
];

const questionFingerprint = (q) =>
  [q?.question, ...(Array.isArray(q?.options) ? q.options : []), q?.skill || '']
    .join('|')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .slice(0, 90);

const isUsablePoolQuestion = (question) => {
  const normalized = normalizeCoursewareChoices(question);
  if (!normalized) return false;
  const inferredShape = inferFractionBarShape(question?.question, question?.shape);
  if (hasMissingRequiredVisual(question?.question, inferredShape)) return false;
  const deterministicResult = validateDeterministicMathQuestion(normalized);
  if (deterministicResult.applicable && !deterministicResult.valid) return false;
  return true;
};

const normalizeVerifiedMathAnswer = (question) => {
  const normalized = normalizeCoursewareChoices(question);
  const result = validateDeterministicMathQuestion(normalized);
  return result.applicable && result.valid
    ? { ...normalized, answerIndex: result.answerIndex }
    : normalized;
};

const lessonAttemptId = (studentCode, key) => `${studentCode}_${key}`;
const wrongAnswerId = (studentCode, questionKey) =>
  `${studentCode}_${questionKey}`.replace(/\//g, '_').slice(0, 1400);

const enrichQuestionPool = (data, key) => ({
  ...data,
  questions: (data?.questions || []).filter(isUsablePoolQuestion).map((q, index) => ({
    ...normalizeVerifiedMathAnswer(q),
    __poolIndex: index,
    __questionKey: `${key}_${questionFingerprint(q)}`,
  })),
});

const uniquePush = (items, limit = 200) => {
  const result = [];
  for (const item of items) {
    if (item && !result.includes(item)) result.push(item);
    if (result.length >= limit) break;
  }
  return result;
};

function readRecentQuestionKeys(key) {
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(`aiCoursewareRecent:${key}`) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentQuestionKeys(key, selectedKeys, max = 20) {
  if (!key) return;
  const merged = [...selectedKeys, ...readRecentQuestionKeys(key)];
  const unique = [];
  for (const item of merged) {
    if (item && !unique.includes(item)) unique.push(item);
    if (unique.length >= max) break;
  }
  try {
    localStorage.setItem(`aiCoursewareRecent:${key}`, JSON.stringify(unique));
  } catch {
    // Recent-question history is optional on storage-restricted school devices.
  }
}

function shouldRefreshLessonContent(data) {
  if (!data) return true;
  const usableCount = Array.isArray(data.questions)
    ? data.questions.filter(isUsablePoolQuestion).length
    : 0;
  return usableCount < SESSION_Q_NUM;
}

// 캐시된 문제 풀에서 최근 풀었던 문항은 뒤로 미뤄 세션마다 다른 조합을 출제
function pickSessionQuestions(data, key, attemptState = null) {
  if (!data?.questions?.length) return data;
  const enriched = enrichQuestionPool(data, key);
  const pool = enriched.questions;
  if (!pool.length) throw new Error('검증을 통과한 문제가 없습니다. 차시를 다시 열어 문제를 새로 생성해주세요.');
  if (pool.length <= SESSION_Q_NUM) return enriched;

  const byKey = new Map(pool.map(q => [q.__questionKey, q]));
  const wrongReviewKeys = Array.isArray(attemptState?.wrongReviewKeys) ? attemptState.wrongReviewKeys : [];
  const reviewQuestions = wrongReviewKeys
    .map(qKey => byKey.get(qKey))
    .filter(Boolean)
    .slice(0, 2);

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const recent = new Set(readRecentQuestionKeys(key));
  const seen = new Set(Array.isArray(attemptState?.seenQuestionKeys) ? attemptState.seenQuestionKeys : []);
  const selectedKeys = new Set(reviewQuestions.map(q => q.__questionKey));
  const available = q => !selectedKeys.has(q.__questionKey);
  const fresh = shuffled.filter(q => available(q) && !seen.has(q.__questionKey) && !recent.has(questionFingerprint(q)));
  const unseenFallback = shuffled.filter(q => available(q) && !seen.has(q.__questionKey) && recent.has(questionFingerprint(q)));
  const seenFallback = shuffled.filter(q => available(q) && seen.has(q.__questionKey));
  const selected = [...reviewQuestions, ...fresh, ...unseenFallback, ...seenFallback].slice(0, SESSION_Q_NUM);
  saveRecentQuestionKeys(key, selected.map(questionFingerprint));
  return {
    ...enriched,
    questions: selected,
    sessionMeta: {
      reviewCount: reviewQuestions.length,
      unseenAvailable: fresh.length + unseenFallback.length,
      poolSize: pool.length,
    },
  };
}

// KST 오전 8시 기준 세션 날짜 (매일 8시 초기화)
const getSessionDate = () => {
  const kst = new Date(Date.now() + 9 * 3_600_000); // UTC+9
  if (kst.getUTCHours() < 8) kst.setUTCDate(kst.getUTCDate() - 1);
  return kst.toISOString().slice(0, 10);
};

const MASTERY = {
  excellent: { label: '매우 훌륭', emoji: '🏆', min: 90, cls: 'bg-amber-100 text-amber-700 border border-amber-300' },
  good:      { label: '훌륭',     emoji: '⭐', min: 75, cls: 'bg-sky-100 text-sky-700 border border-sky-300' },
  normal:    { label: '보통',     emoji: '👍', min: 60, cls: 'bg-emerald-100 text-emerald-700 border border-emerald-300' },
  retry:     { label: '재도전',   emoji: '🔄', min: 0,  cls: 'bg-rose-100 text-rose-600 border border-rose-200' },
};
const getMasteryLevel = (score) =>
  score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'normal' : 'retry';
const getMaxExp = getMaxExpForLevel; // leveling.js 통합 공식 사용

const timestampToMs = (value) => {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value?.seconds)) return value.seconds * 1000;
  return 0;
};

// 단원 카드 원형 진행 그래프
function UnitCircleProgress({ started, done, total, size = 50 }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
        {started > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${circ * started / total} ${circ}`} />
        )}
        {done > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${circ * done / total} ${circ}`} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none gap-0.5">
        <span className="text-white font-extrabold" style={{ fontSize: size * 0.23 }}>{started}</span>
        <span className="text-white/40" style={{ fontSize: size * 0.15 }}>전체 {total}</span>
      </div>
    </div>
  );
}

// 결과 화면 confetti 파티클 효과
function ConfettiCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#f43f5e','#facc15'];
    const particles = Array.from({ length: 90 }, () => ({
      x:    Math.random() * canvas.width,
      y:    -20 - Math.random() * 300,
      w:    7  + Math.random() * 7,
      h:    3  + Math.random() * 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vy:   2.5 + Math.random() * 2.5,
      vx:   (Math.random() - 0.5) * 1.8,
      rot:  Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.15,
      alpha: 1,
    }));
    let raf;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach(p => {
        p.y += p.vy; p.x += p.vx; p.rot += p.rotV;
        if (p.y > canvas.height * 0.75) p.alpha -= 0.018;
        if (p.alpha > 0 && p.y < canvas.height) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      });
      if (alive) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:9999 }} />;
}

// 정답 수에 따른 차등 보상 계산
const calcReward = (correctCount, total) => {
  if (total === 0) return { exp: 0, gold: 0, diamonds: 0 };
  const ratio = Math.min(1, Math.max(0, correctCount / total));
  return {
    exp:      Math.round(MAX_REWARD.exp      * ratio),
    gold:     Math.round(MAX_REWARD.gold     * ratio),
    diamonds: Math.round(MAX_REWARD.diamonds * ratio),
  };
};

// studentCode에서 학년 추출 (예: "SINSEOK-5-01" → "5")
const gradeFromCode = (code) => {
  if (!code) return '';
  const parts = code.split('-');
  if (parts.length >= 2) {
    const g = parseInt(parts[1]);
    if (g >= 1 && g <= 6) return String(g);
  }
  return '';
};

// 차시별 캐시 키 (v2: sonnet 모델로 재생성된 고품질 콘텐츠)
const CACHE_VER = 'v3'; // 대분수 렌더링 수정 후 캐시 버전 업
const lessonKey = (unit, lesson) =>
  `${CACHE_VER}_${unit.grade}_${unit.semester || 0}_${unit.publisher || 'default'}_${unit.id}_${lesson.no}`;

// ── 백그라운드 프리로딩 캐시 ─────────────────────────────────
// 차시 목록 열릴 때 첫 번째 차시를 미리 API 호출 → 클릭 시 즉시 사용
const preloadMap = new Map(); // key → Promise<data>
const expansionMap = new Map(); // key → Promise<data>
const lessonContextMap = new Map(); // key → Promise<string | null>

const fetchLessonContent = async (unit, lesson, {
  fastInitial = true,
  allowPartial = false,
  questionCount = POOL_TARGET_Q_NUM,
  extraLessonContext = '',
} = {}) => {
  // RAG: 교사가 등록한 교과서 내용이 있으면 가져와서 프롬프트에 포함
  const lKey = `v3_${unit.grade}_${unit.semester || 0}_${unit.publisher || 'default'}_${unit.id}_${lesson.no}`;
  if (!lessonContextMap.has(lKey)) {
    lessonContextMap.set(lKey, getDoc(doc(db, 'aiLessonContext', lKey))
      .then(ctxSnap => ctxSnap.exists() ? (ctxSnap.data().text || null) : null)
      .catch(() => null));
  }
  const baseLessonContext = await lessonContextMap.get(lKey);
  const lessonContext = [baseLessonContext, extraLessonContext].filter(Boolean).join('\n\n');

  const res = await fetch('/api/generate-courseware', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grade: unit.grade, semester: unit.semester,
      publisher: unit.publisher || '국정',
      unitName: unit.unitName,
      lessonNo: lesson.no, lessonTitle: lesson.title,
      learningGoal: '', keywords: lesson.keywords || [],
      difficulty: 'normal', questionCount,
      lessonContext, // RAG 교과서 내용
      fastInitial,
      allowPartial,
    }),
  });
  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`AI 콘텐츠 응답을 읽을 수 없습니다. (${res.status})`);
  }
  if (!res.ok) throw new Error(data?.error || `생성 실패 (${res.status})`);
  if (!data) throw new Error(`AI 콘텐츠 응답이 비어 있습니다. (${res.status})`);
  return data;
};

const saveLessonContentCache = (unit, lesson, data) => {
  if (!data?.generatorVersion) return Promise.resolve();
  const key = lessonKey(unit, lesson);
  return setDoc(doc(db, 'aiLessonContent', key), {
    ...data,
    lessonKey: key,
    grade: unit.grade,
    semester: unit.semester,
    publisher: unit.publisher,
    unitId: unit.id,
    unitName: unit.unitName,
    lessonNo: lesson.no,
    lessonTitle: lesson.title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

const mergeLessonContentQuestions = (baseData, addData, maxQuestions = SHARED_POOL_MAX_Q_NUM) => {
  const baseQuestions = Array.isArray(baseData?.questions)
    ? baseData.questions.filter(isUsablePoolQuestion).slice(0, maxQuestions)
    : [];
  const addQuestions = Array.isArray(addData?.questions) ? addData.questions.filter(isUsablePoolQuestion) : [];
  const merged = [...baseQuestions];
  const seen = new Set(baseQuestions.map(questionFingerprint));
  for (const question of addQuestions) {
    const key = questionFingerprint(question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (merged.length >= maxQuestions) break;
    merged.push(question);
  }
  return {
    ...baseData,
    questions: merged.slice(0, maxQuestions),
    poolSize: merged.length,
    isPartialPool: false,
    expandedAt: new Date().toISOString(),
  };
};

const queueLessonPreload = (unit, lesson) => {
  const key = lessonKey(unit, lesson);
  if (preloadMap.has(key)) return preloadMap.get(key);

  const promise = (async () => {
    const cacheDoc = await getDoc(doc(db, 'aiLessonContent', key));
    if (cacheDoc.exists() && !shouldRefreshLessonContent(cacheDoc.data())) return cacheDoc.data();

    const generated = await fetchLessonContent(unit, lesson);
    await saveLessonContentCache(unit, lesson, generated).catch(() => {});
    return generated;
  })().catch(err => {
    preloadMap.delete(key);
    console.warn('[AI Courseware] preload failed:', err);
    return null;
  });

  preloadMap.set(key, promise);
  return promise;
};

// 로딩 순환 메시지 (끝이 없이 반복)
const LOADING_MSGS = [
  '차시 내용을 분석하는 중...',
  'AI 선생님이 개념 카드 작성 중...',
  '핵심 개념을 정리하는 중...',
  '퀴즈 문제를 만드는 중...',
  '오답 보기를 설계하는 중...',
  '해설을 다듬는 중...',
];

export default function AICourseware({ studentCode, isTeacher = false, teacherUid, classGrade, themeMode = 'dark' }) {
  const isDark = themeMode === 'dark';
  const [student, setStudent]   = useState(null);
  const { ready: accessReady, policy: accessPolicy, assertAllowed, error: accessError } = useCoursewareAccess(student, isTeacher);
  const allowedGrades = allowedCoursewareGrades(accessPolicy);
  // 교사 모드: 학생 데이터 없이 단원/차시 브라우징 및 미리보기 가능

  // 브라우징 상태
  const [step, setStep]         = useState('browse'); // 'browse' | 'lessons' | 'concept' | 'quiz' | 'result'
  const [filterGrade, setFG]    = useState('');
  const [filterSem, setFS]      = useState('');
  const [filterPub, setFP]      = useState('');
  const [units, setUnits]       = useState([]);
  const [loadingUnits, setLU]   = useState(false);
  const [selectedUnit, setUnit] = useState(null);

  // 학습 상태
  const [selectedLesson, setLesson] = useState(null);
  const lessonLoadEpoch = useRef(0);
  const finishLockRef = useRef(false);
  const [content, setContent]       = useState(null);   // AI 콘텐츠 (캐시 or 신규)
  const [contentLoading, setCL]     = useState(false);
  const [myProgress, setMyProgress] = useState(null);   // 오늘 이미 완료했는지

  // 퀴즈 진행
  const [cardIdx, setCardIdx]   = useState(0);
  const [qIdx, setQIdx]         = useState(0);
  const [answers, setAnswers]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [wrongCauseByQuestion, setWrongCauseByQuestion] = useState({});
  const answerLockRef = useRef(false);
  const [finalResult, setFR]    = useState(null);
  const [saving, setSaving]     = useState(false);
  const [allMastery, setAllMastery]   = useState({});  // 전체 mastery 캐시 (browse 화면용)
  const [minTimeLeft, setMinTimeLeft] = useState(0);  // 최소 응답 시간 남은 초 (5→0)
  const [loadingElapsed, setLoadingElapsed]  = useState(0);  // 경과 시간(초)
  const [loadingMsgIdx,  setLoadingMsgIdx]   = useState(0);  // 순환 메시지 인덱스

  const [dailyCount, setDailyCount] = useState(0); // 오늘 완료 횟수
  const [toast, setToast] = useState(null);
  const [expandedResult, setExpandedResult] = useState(null);
  const [wrongNotebook, setWrongNotebook] = useState([]);
  const [wrongLoading, setWrongLoading] = useState(false);
  const [wrongSelections, setWrongSelections] = useState({});
  const [wrongFeedback, setWrongFeedback] = useState({});
  const [wrongFilter, setWrongFilter] = useState('active');
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const loadWrongNotebook = useCallback(async () => {
    if (!studentCode) return;
    setWrongLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'aiWrongAnswers'), where('studentCode', '==', studentCode)));
      const rawItems = snap.docs
        .map(item => {
          const data = { id: item.id, ...item.data() };
          const result = validateDeterministicMathQuestion({ ...data, answerIndex: data.correctIdx });
          if (result.applicable && !result.valid) return null;
          return result.applicable ? { ...data, correctIdx: result.answerIndex } : data;
        })
        .filter(Boolean)
        .sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0));
      const byQuestion = new Map();
      rawItems.forEach(item => {
        const key = item.questionKey || item.id;
        const previous = byQuestion.get(key);
        if (!previous) {
          byQuestion.set(key, { ...item, duplicateIds: [item.id] });
          return;
        }
        previous.duplicateIds.push(item.id);
        previous.wrongCount = Math.max(previous.wrongCount || 1, item.wrongCount || 1);
        if (item.resolved || item.status === 'resolved') {
          previous.resolved = true;
          previous.status = 'resolved';
        }
      });
      const items = [...byQuestion.values()];
      setWrongNotebook(items);
      setWrongSelections({});
      setWrongFeedback({});
      setStep('wrongNote');
    } finally {
      setWrongLoading(false);
    }
  }, [studentCode]);

  useEffect(() => {
    if (!studentCode) return;
    const intent = sessionStorage.getItem('aiCoursewareIntent');
    if (intent !== 'wrongNote') return;
    sessionStorage.removeItem('aiCoursewareIntent');
    const timer = window.setTimeout(() => loadWrongNotebook(), 0);
    return () => window.clearTimeout(timer);
  }, [studentCode, loadWrongNotebook]);

  const checkWrongNotebookAnswer = async (item) => {
    const selectedIndex = wrongSelections[item.id];
    if (!Number.isInteger(selectedIndex)) return;
    const correct = selectedIndex === item.correctIdx;
    const nextCorrectCount = correct ? (item.reviewCorrectCount || 0) + 1 : 0;
    const nextStatus = correct ? (nextCorrectCount >= 2 ? 'resolved' : 'reviewing') : 'unresolved';
    const update = {
      status: nextStatus,
      resolved: nextStatus === 'resolved',
      reviewCorrectCount: nextCorrectCount,
      wrongCount: (item.wrongCount || 1) + (correct ? 0 : 1),
      lastReviewedAt: serverTimestamp(),
      ...(nextStatus === 'resolved' ? { resolvedAt: serverTimestamp() } : {}),
    };
    const matchingIds = item.duplicateIds?.length ? item.duplicateIds : [item.id];
    await Promise.all(matchingIds.map(id =>
      setDoc(doc(db, 'aiWrongAnswers', id), update, { merge: true })
    ));

    if (nextStatus === 'resolved' && item.lessonKey && item.questionKey) {
      const attemptRef = doc(db, 'aiQuestionAttempts', lessonAttemptId(studentCode, item.lessonKey));
      const attemptSnap = await getDoc(attemptRef);
      if (attemptSnap.exists()) {
        const attempt = attemptSnap.data();
        const bank = { ...(attempt.wrongQuestionBank || {}) };
        delete bank[item.questionKey];
        await setDoc(attemptRef, {
          wrongQuestionBank: bank,
          wrongReviewKeys: (attempt.wrongReviewKeys || []).filter(key => key !== item.questionKey),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    }

    setWrongFeedback(prev => ({ ...prev, [item.id]: { correct, status: nextStatus } }));
    setWrongNotebook(prev => prev.map(entry =>
      entry.id === item.id ? { ...entry, ...update } : entry
    ));
  };

  // ── 학생 로드 + 학년 즉시 자동 설정 ─────────────────────────
  useEffect(() => {
    if (!studentCode) return;
    // studentCode에서 학년 추출 (예: SINSEOK-5-01 → 5학년)
    const detectedGrade = gradeFromCode(studentCode);
    if (detectedGrade) setFG(detectedGrade);

    const today = getSessionDate();
    Promise.all([
      getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode))),
      getDocs(query(
        collection(db, 'aiStudentProgress'),
        where('studentCode', '==', studentCode),
        where('date', '==', today),
        where('status', '==', 'completed'),
      )),
    ]).then(([stuSnap, progSnap]) => {
      if (!stuSnap.empty) {
        const data = stuSnap.docs[0].data();
        setStudent({ id: stuSnap.docs[0].id, ...data });
        if (data.grade && !detectedGrade) setFG(String(data.grade));
      }
      setDailyCount(progSnap.size);
    });
  }, [studentCode]);

  // ── 교사 모드: 학급 학년 자동 선택 ─────────────────────────
  useEffect(() => {
    if (!isTeacher || studentCode) return;
    if (classGrade) { setFG(String(classGrade)); return; }
    if (!teacherUid) return;
    getDocs(query(collection(db, 'students'), where('teacherUid', '==', teacherUid)))
      .then(snap => {
        const detected = snap.docs
          .map(d => gradeFromCode(d.data().studentCode))
          .find(Boolean);
        if (detected) setFG(detected);
      });
  }, [isTeacher, studentCode, teacherUid, classGrade]);

  useEffect(() => {
    if (!accessReady) return;
    const grades = allowedCoursewareGrades(accessPolicy);
    if (accessPolicy && accessPolicy.mode !== 'all' && !grades.includes(Number(filterGrade))) {
      setFG(String(grades[0] || '')); setFS(''); setFP('');
    }
    if (selectedLesson && !isCoursewareLessonAllowed(accessPolicy, selectedUnit, selectedLesson)) {
      lessonLoadEpoch.current++;
      setStep('browse'); setUnit(null); setLesson(null); setContent(null);
    }
  }, [accessReady, accessPolicy, filterGrade, selectedUnit, selectedLesson]);

  // ── 단원 로드 ──────────────────────────────────────────────────
  useEffect(() => {
    if (!filterGrade || !accessReady) { setUnits([]); return; }
    let cancelled = false;
    setLU(true);
    getDocs(query(
      collection(db, 'curriculumUnits'),
      where('grade', '==', parseInt(filterGrade)),
      where('subject', '==', '수학'),
      where('status', '==', 'approved'),
    )).then(snap => {
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(u => !filterSem || !u.semester || String(u.semester) === String(filterSem))
        .filter(u => !filterPub || u.publisher === filterPub || u.publisher === '공통')
        .sort((a, b) => (a.unitNumber || 99) - (b.unitNumber || 99));
      if (!cancelled) setUnits(filterCoursewareUnits(list, accessPolicy));
    }).catch(() => { if (!cancelled) setUnits([]); })
      .finally(() => { if (!cancelled) setLU(false); });
    return () => { cancelled = true; };
  }, [filterGrade, filterSem, filterPub, accessReady, accessPolicy]);

  // ── 브라우즈 화면용: 학생 전체 mastery 일괄 로드 ──────────────
  useEffect(() => {
    if (!studentCode) return;
    getDocs(query(collection(db, 'aiLessonMastery'), where('studentCode', '==', studentCode)))
      .then(snap => {
        const map = {};
        snap.forEach(d => { map[d.data().lessonKey] = d.data(); });
        setAllMastery(map);
      });
  }, [studentCode]);

  // ── 차시 목록 진입 시 첫 번째 차시 프리로딩 (컴포넌트 내부 처리) ──
  useEffect(() => {
    if (step !== 'lessons' || !selectedUnit) return;
    if (!accessReady) return;
    const lessons = (selectedUnit.lessons || []).filter(lesson => isCoursewareLessonAllowed(accessPolicy, selectedUnit, lesson));
    if (lessons.length === 0) return;

    queueLessonPreload(selectedUnit, lessons[0]);
    let t;
    if (lessons.length > 1) {
      t = setTimeout(() => queueLessonPreload(selectedUnit, lessons[1]), 1200);
    }
    return () => clearTimeout(t);
  }, [step, selectedUnit, accessReady, accessPolicy]);

  // ── 차시 선택 → AI 콘텐츠 로드/생성 후 바로 학습 시작 ──────
  const expandLessonPoolInBackground = (unit, lesson, currentData, attemptState = null, extraLessonContext = '') => {
    const key = lessonKey(unit, lesson);
    const expansionKey = `shared-pool:${key}`;
    if (expansionMap.has(expansionKey)) return;

    const usableQuestions = (currentData?.questions || []).filter(isUsablePoolQuestion);
    const seenKeys = new Set(Array.isArray(attemptState?.seenQuestionKeys) ? attemptState.seenQuestionKeys : []);
    const unseenCount = usableQuestions.filter(question => !seenKeys.has(`${key}_${questionFingerprint(question)}`)).length;
    if (usableQuestions.length >= SHARED_POOL_MAX_Q_NUM || unseenCount >= SESSION_Q_NUM) return;

    const contentRef = doc(db, 'aiLessonContent', key);
    let lockOwner = '';

    const promise = (async () => {
      const now = Date.now();
      lockOwner = `${studentCode || 'student'}:${now}:${Math.random().toString(36).slice(2, 8)}`;
      const lockAcquired = await runTransaction(db, async transaction => {
        const snap = await transaction.get(contentRef);
        const latest = snap.exists() ? snap.data() : currentData;
        const latestQuestions = (latest?.questions || []).filter(isUsablePoolQuestion);
        const latestUnseenCount = latestQuestions.filter(question =>
          !seenKeys.has(`${key}_${questionFingerprint(question)}`)
        ).length;
        const lockUntil = Number(latest?.studentPoolGrowthLockUntilMs || 0);
        const lastGrowthAt = Number(latest?.studentPoolGrowthLastAtMs || 0);

        if (latestQuestions.length >= SHARED_POOL_MAX_Q_NUM || latestUnseenCount >= SESSION_Q_NUM) return false;
        if (lockUntil > now || now - lastGrowthAt < SHARED_POOL_GROW_COOLDOWN_MS) return false;

        transaction.set(contentRef, {
          studentPoolGrowthLockOwner: lockOwner,
          studentPoolGrowthLockUntilMs: now + SHARED_POOL_GROW_LOCK_MS,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        return true;
      });
      if (!lockAcquired) return currentData;

      const existingQuestionGuide = usableQuestions.slice(-12)
        .map((question, index) => `${index + 1}. ${question.question}`)
        .join('\n');
      const generated = await fetchLessonContent(unit, lesson, {
        fastInitial: true,
        allowPartial: true,
        questionCount: SHARED_POOL_GROW_Q_NUM,
        extraLessonContext: [
          extraLessonContext,
          '[공용 문제 풀 추가 생성]',
          '아래 기존 문제와 문장·숫자·상황이 겹치지 않는 새로운 문제만 생성하세요.',
          existingQuestionGuide,
        ].filter(Boolean).join('\n\n'),
      });

      const mergedContent = await runTransaction(db, async transaction => {
        const snap = await transaction.get(contentRef);
        const latest = snap.exists() ? snap.data() : currentData;
        if (latest?.studentPoolGrowthLockOwner !== lockOwner) return latest;

        const merged = mergeLessonContentQuestions(latest, generated, SHARED_POOL_MAX_Q_NUM);
        transaction.set(contentRef, {
          ...merged,
          lessonKey: key,
          grade: unit.grade,
          semester: unit.semester,
          publisher: unit.publisher,
          unitId: unit.id,
          unitName: unit.unitName,
          lessonNo: lesson.no,
          lessonTitle: lesson.title,
          studentPoolGrowthLockOwner: null,
          studentPoolGrowthLockUntilMs: 0,
          studentPoolGrowthLastAtMs: Date.now(),
          studentPoolGrowthAddedCount: Math.max(
            0,
            (merged.questions?.length || 0) - ((latest?.questions || []).filter(isUsablePoolQuestion).length),
          ),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        return merged;
      });

      preloadMap.set(key, Promise.resolve(mergedContent));
      return mergedContent;
    })()
      .catch(async err => {
        console.warn('[AI Courseware] shared pool expansion failed:', err);
        try {
          await runTransaction(db, async transaction => {
            const snap = await transaction.get(contentRef);
            if (snap.exists() && snap.data().studentPoolGrowthLockOwner === lockOwner) {
              transaction.set(contentRef, {
                studentPoolGrowthLockOwner: null,
                studentPoolGrowthLockUntilMs: 0,
                updatedAt: serverTimestamp(),
              }, { merge: true });
            }
          });
        } catch {
          // 잠금 해제 실패 시 짧은 만료 시간 이후 다른 학생이 다시 시도합니다.
        }
        return currentData;
      })
      .finally(() => expansionMap.delete(expansionKey));

    expansionMap.set(expansionKey, promise);
  };

  const openLesson = async (unit, lesson) => {
    try { await assertAllowed(unit, lesson); }
    catch (error) { showToast(error.message, 'error'); return; }
    const epoch = ++lessonLoadEpoch.current;
    setUnit(unit); setLesson(lesson);
    setCardIdx(0); setQIdx(0);
    setAnswers([]); setSelected(null); setShowResult(false); setFR(null); setExpandedResult(null);
    setWrongCauseByQuestion({});
    setMinTimeLeft(0);
    setCL(true); setContent(null); setMyProgress(null);
    setLoadingElapsed(0);
    setLoadingMsgIdx(0);
    setStep('loading');
    const key = lessonKey(unit, lesson);

    // 경과 시간 카운터 (1초마다) + 메시지 순환 (3초마다)
    const elapsedTimer = setInterval(() => setLoadingElapsed(s => s + 1), 1000);
    const msgTimer     = setInterval(() => setLoadingMsgIdx(i => (i + 1) % LOADING_MSGS.length), 3000);
    const stepTimer    = { clear: () => { clearInterval(elapsedTimer); clearInterval(msgTimer); } };

    try {
      const progressId = `${studentCode}_${key}`;
      const attemptId = lessonAttemptId(studentCode, key);

      // 콘텐츠 캐시 확인/생성을 진행 데이터 조회와 동시에 시작합니다.
      const contentPromise = queueLessonPreload(unit, lesson);
      const [progDoc, attemptDoc, data] = await Promise.all([
        getDoc(doc(db, 'aiStudentProgress', progressId)),
        getDoc(doc(db, 'aiQuestionAttempts', attemptId)),
        contentPromise,
      ]);
      if (epoch !== lessonLoadEpoch.current) { stepTimer.clear(); return; }
      if (progDoc.exists()) setMyProgress(progDoc.data());
      if (!data) throw new Error('생성 실패');

      stepTimer.clear();
      setContent(pickSessionQuestions(data, key, attemptDoc.exists() ? attemptDoc.data() : null));
      setStep('concept');
      expandLessonPoolInBackground(unit, lesson, data, attemptDoc.exists() ? attemptDoc.data() : null);
    } catch (e) {
      stepTimer.clear();
      if (epoch !== lessonLoadEpoch.current) return;
      showToast('콘텐츠 로드에 실패했습니다. 다시 시도해주세요.', 'error');
      setStep('lessons');
      console.error(e);
    } finally { setCL(false); }
  };

  const startLearning = async () => {
    try { await assertAllowed(selectedUnit, selectedLesson); }
    catch (error) { showToast(error.message, 'error'); return; }
    const epoch = lessonLoadEpoch.current;
    const key = lessonKey(selectedUnit, selectedLesson);
    try {
      const [cacheSnap, attemptSnap] = await Promise.all([
        getDoc(doc(db, 'aiLessonContent', key)),
        getDoc(doc(db, 'aiQuestionAttempts', lessonAttemptId(studentCode, key))),
      ]);
      let poolData = cacheSnap.exists() ? cacheSnap.data() : content;
      if (shouldRefreshLessonContent(poolData)) {
        preloadMap.delete(key);
        poolData = await queueLessonPreload(selectedUnit, selectedLesson);
        if (!poolData) throw new Error('문제를 새로 생성하지 못했습니다. 잠시 후 다시 시도해주세요.');
      }
      const attemptState = attemptSnap.exists() ? attemptSnap.data() : null;
      if (epoch !== lessonLoadEpoch.current) return;
      setContent(pickSessionQuestions(poolData, key, attemptState));
      expandLessonPoolInBackground(selectedUnit, selectedLesson, poolData, attemptState);
      setCardIdx(0); setQIdx(0);
      setAnswers([]); setSelected(null); setShowResult(false); setFR(null); setExpandedResult(null);
      setWrongCauseByQuestion({});
      setMinTimeLeft(0);
      setStep('concept');
    } catch (error) {
      console.error('AI 학습관 재시작 실패:', error);
      showToast('사용 가능한 문제를 불러오지 못했습니다. 차시를 다시 열어주세요.', 'error');
    }
  };

  // ── 최소 응답 시간: 문제 바뀔 때마다 5초 카운트다운 ─────────
  useEffect(() => {
    answerLockRef.current = false;
    if (step !== 'quiz') return;
    const MIN_SEC = 5;
    setMinTimeLeft(MIN_SEC);
    const t = setInterval(() => {
      setMinTimeLeft(prev => {
        if (prev <= 1) { clearInterval(t); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [step, qIdx]);

  // ── 퀴즈 ──────────────────────────────────────────────────────
  const confirmAnswer = () => {
    if (selected === null || minTimeLeft > 0 || showResult || answerLockRef.current) return;
    answerLockRef.current = true;
    const question = content.questions[qIdx];
    const correct = selected === question.answerIndex;
    setAnswers(prev => {
      const withoutCurrent = prev.filter(a => a.questionIndex !== qIdx);
      return [...withoutCurrent, {
        questionIndex: qIdx,
        selectedIndex: selected,
        correct,
        questionKey: question.__questionKey || `${lessonKey(selectedUnit, selectedLesson)}_${questionFingerprint(question)}`,
        poolIndex: question.__poolIndex ?? qIdx,
        skill: question.skill || '',
      }];
    });
    setShowResult(true);

  };

  const nextQuestion = () => {
    if (qIdx < content.questions.length - 1) {
      setQIdx(q => q + 1); setSelected(null); setShowResult(false);
    } else { finishQuiz(); }
  };

  const appendSimilarQuestionsInBackground = (wrongQuestions, reason = 'wrong-type-repeat') => {
    if (!selectedUnit || !selectedLesson || !wrongQuestions.length) return;

    const isExtension = reason === 'all-correct-extension';
    const focusLines = wrongQuestions.slice(0, 3).map((q, index) =>
      `${index + 1}. 유형: ${q.skill || '기본'} / 참고 문제: ${q.question}`
    ).join('\n');
    const extraLessonContext = [
      isExtension ? '[추가 심화 문제 생성 요청]' : '[오답 유사 문제 추가 생성 요청]',
      isExtension
        ? '학생이 최근 세트를 모두 맞혔습니다. 같은 차시 범위 안에서 새로운 숫자/상황의 추가 문제를 생성하세요.'
        : '아래 유형을 같은 개념, 다른 숫자/상황으로 바꾸어 새로운 문제를 생성하세요.',
      '기존 문항을 그대로 반복하지 말고, 정답과 해설을 반드시 검산하세요.',
      focusLines,
    ].join('\n');
    const key = lessonKey(selectedUnit, selectedLesson);
    getDoc(doc(db, 'aiQuestionAttempts', lessonAttemptId(studentCode, key)))
      .then(attemptSnap => expandLessonPoolInBackground(
        selectedUnit,
        selectedLesson,
        content,
        attemptSnap.exists() ? attemptSnap.data() : null,
        extraLessonContext,
      ))
      .catch(err => console.warn('[AI Courseware] similar wrong-question generation failed:', err));
  };

  const updateQuestionAttemptState = async ({ key, allAns, newAttemptNo }) => {
    if (!studentCode || !content?.questions?.length) return null;
    const attemptRef = doc(db, 'aiQuestionAttempts', lessonAttemptId(studentCode, key));
    const prevSnap = await getDoc(attemptRef);
    const prev = prevSnap.exists() ? prevSnap.data() : {};
    const prevSeen = Array.isArray(prev.seenQuestionKeys) ? prev.seenQuestionKeys : [];
    const prevWrongReview = Array.isArray(prev.wrongReviewKeys) ? prev.wrongReviewKeys : [];
    const prevWrongBank = prev.wrongQuestionBank && typeof prev.wrongQuestionBank === 'object' ? prev.wrongQuestionBank : {};
    const prevSkillCounts = prev.wrongSkillCounts && typeof prev.wrongSkillCounts === 'object' ? prev.wrongSkillCounts : {};

    const answeredKeys = [];
    const correctKeys = [];
    const resolvedKeys = [];
    const wrongKeys = [];
    const wrongBank = { ...prevWrongBank };
    const wrongSkillCounts = { ...prevSkillCounts };
    const repeatedWrongQuestions = [];

    for (const answer of allAns) {
      const question = content.questions[answer.questionIndex];
      if (!question) continue;
      const questionKey = answer.questionKey || question.__questionKey || `${key}_${questionFingerprint(question)}`;
      answeredKeys.push(questionKey);
      if (answer.correct) {
        correctKeys.push(questionKey);
        if (wrongBank[questionKey]) {
          const reviewCorrectCount = (wrongBank[questionKey].reviewCorrectCount || 0) + 1;
          if (reviewCorrectCount >= 2) {
            delete wrongBank[questionKey];
            resolvedKeys.push(questionKey);
          } else {
            wrongBank[questionKey] = {
              ...wrongBank[questionKey],
              status: 'reviewing',
              reviewCorrectCount,
              lastReviewedAt: new Date().toISOString(),
            };
          }
        }
        continue;
      }

      wrongKeys.push(questionKey);
      const skillKey = String(question.skill || '기본').trim() || '기본';
      wrongSkillCounts[skillKey] = (wrongSkillCounts[skillKey] || 0) + 1;
      wrongBank[questionKey] = {
        ...(wrongBank[questionKey] || {}),
        questionKey,
        lessonKey: key,
        unitName: selectedUnit.unitName,
        lessonTitle: selectedLesson.title,
        grade: selectedUnit.grade,
        semester: selectedUnit.semester,
        question: question.question,
        options: question.options || [],
        answerIndex: question.answerIndex,
        explanation: question.explanation || '',
        skill: question.skill || '',
        shape: question.shape || null,
        wrongCause: answer.wrongCause || wrongCauseByQuestion[answer.questionIndex] || '',
        status: 'unresolved',
        wrongCount: (wrongBank[questionKey]?.wrongCount || 0) + 1,
        reviewCorrectCount: 0,
        lastWrongAt: new Date().toISOString(),
      };
      if (newAttemptNo >= 3 && wrongSkillCounts[skillKey] >= 2) {
        repeatedWrongQuestions.push(question);
      }
    }

    const nextWrongReview = uniquePush([
      ...wrongKeys,
      ...prevWrongReview.filter(qKey => !resolvedKeys.includes(qKey)),
    ], 80);
    const nextSeen = uniquePush([...answeredKeys, ...prevSeen], 300);

    const attemptData = {
      studentCode,
      lessonKey: key,
      unitId: selectedUnit.id,
      unitName: selectedUnit.unitName,
      lessonTitle: selectedLesson.title,
      grade: selectedUnit.grade,
      semester: selectedUnit.semester,
      seenQuestionKeys: nextSeen,
      wrongReviewKeys: nextWrongReview,
      wrongQuestionBank: wrongBank,
      wrongSkillCounts,
      lastAttemptNo: newAttemptNo,
      lastAttemptAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(attemptRef, attemptData, { merge: true });
    return { ...attemptData, repeatedWrongQuestions, wrongCount: wrongKeys.length };
  };

  // ── 완료 + 차등 보상 ──────────────────────────────────────────
  const finishQuiz = async () => {
    if (finishLockRef.current) return;
    finishLockRef.current = true;
    try { await assertAllowed(selectedUnit, selectedLesson); }
    catch (error) { finishLockRef.current = false; showToast(error.message, 'error'); return; }
    // answers에 이미 모든 답이 들어있음 (confirmAnswer가 마지막 답도 추가했으므로 중복 추가 X)
    const total = Math.max(1, content.questions.length);
    const answerByQuestion = new Map();
    answers.forEach(a => {
      if (Number.isInteger(a.questionIndex) && a.questionIndex >= 0 && a.questionIndex < total && !answerByQuestion.has(a.questionIndex)) {
        answerByQuestion.set(a.questionIndex, a);
      }
    });
    const allAns = Array.from(answerByQuestion.values()).slice(0, total);
    const correctCount = Math.min(total, allAns.filter(a => a.correct).length);
    const score = Math.min(100, Math.max(0, Math.round((correctCount / total) * 100)));
    const today        = getSessionDate(); // KST 오전 8시 기준
    // 교사 모드: 보상 없음
    const alreadyRewarded = isTeacher || (myProgress?.date === today && myProgress?.rewarded);
    // 오늘 일일 한도 초과 여부
    const overLimit = isTeacher || (dailyCount >= DAILY_LIMIT);
    const canReward = !alreadyRewarded && !overLimit;

    // 정답 수에 따른 차등 보상
    const reward = canReward ? calcReward(correctCount, total) : { exp: 0, gold: 0, diamonds: 0 };

    setSaving(true);
    try {
      // 교사 미리보기 모드: Firebase 저장 없이 결과만 표시
      if (isTeacher) {
        setFR({ score, correctCount, total, reward: { exp: 0, gold: 0, diamonds: 0 }, canReward: false });
        setStep('result');
        setSaving(false);
        return;
      }

      if (canReward && student && (reward.exp > 0 || reward.gold > 0 || reward.diamonds > 0)) {
        let newExp = (student.exp || 0) + reward.exp, newLv = student.level || 1;
        while (newExp >= getMaxExp(newLv)) { newExp -= getMaxExp(newLv); newLv++; }
        await updateDoc(doc(db, 'students', student.id), {
          gold:     (student.gold     || 0) + reward.gold,
          diamonds: (student.diamonds || 0) + reward.diamonds,
          exp: newExp, level: newLv,
        });
        setStudent(prev => ({
          ...prev,
          gold:     (prev.gold     || 0) + reward.gold,
          diamonds: (prev.diamonds || 0) + reward.diamonds,
          exp: newExp, level: newLv,
        }));
      }

      const key = lessonKey(selectedUnit, selectedLesson);
      const progressId = `${studentCode}_${key}`;
      const pData = {
        studentCode, studentId: student?.id,
        lessonKey: key, unitName: selectedUnit.unitName, lessonTitle: selectedLesson.title,
        grade: selectedUnit.grade, semester: selectedUnit.semester,
        correctCount, totalCount: total, score,
        status: 'completed', rewarded: canReward,
        date: today, completedAt: serverTimestamp(), answers: allAns,
      };
      await setDoc(doc(db, 'aiStudentProgress', progressId), pData, { merge: true });
      setMyProgress(pData);

      // ── mastery 업데이트 (rolling best-4 평균) ───────────────
      const masteryId = `${studentCode}_${key}`;
      const prevMDoc  = await getDoc(doc(db, 'aiLessonMastery', masteryId));
      const prevM     = prevMDoc.exists() ? prevMDoc.data() : { scores: [], attemptCount: 0 };

      // 현재 보관 중인 점수 배열 (최대 4개)
      let scores = Array.isArray(prevM.scores)
        ? prevM.scores
            .map(s => Math.min(100, Math.max(0, Math.round(Number(s) || 0))))
            .filter(s => Number.isFinite(s))
        : [];
      while (scores.length > MASTERY_ATTEMPTS) {
        const minScore = Math.min(...scores);
        scores.splice(scores.indexOf(minScore), 1);
      }

      if (scores.length < MASTERY_ATTEMPTS) {
        scores.push(score);
      } else {
        // 4개 꽉 참 → 최저 점수보다 높으면 최저를 교체 (평균 하락 방지)
        const minScore = Math.min(...scores);
        if (score > minScore) {
          scores[scores.indexOf(minScore)] = score;
        }
      }

      const newCount       = (prevM.attemptCount || 0) + 1;
      const hasWindow      = scores.length === MASTERY_ATTEMPTS;
      const masteryAvg     = hasWindow ? Math.round(scores.reduce((a, b) => a + b, 0) / MASTERY_ATTEMPTS) : null;
      const mastLevel      = hasWindow ? getMasteryLevel(masteryAvg) : null;
      const masteryData    = {
        studentCode, lessonKey: key,
        unitId: selectedUnit.id, unitName: selectedUnit.unitName,
        lessonTitle: selectedLesson.title,
        scores, attemptCount: newCount,
        masteryAvg, masteryLevel: mastLevel,
        lastScore: score, lastAttemptAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'aiLessonMastery', masteryId), masteryData, { merge: true });
      setAllMastery(prev => ({ ...prev, [key]: masteryData }));

      const attemptState = await updateQuestionAttemptState({ key, allAns, newAttemptNo: newCount });
      if (attemptState?.repeatedWrongQuestions?.length) {
        appendSimilarQuestionsInBackground(attemptState.repeatedWrongQuestions, 'wrong-type-repeat');
      } else if (attemptState && attemptState.wrongCount === 0) {
        const remainingUnseen = Math.max(0, (content.sessionMeta?.poolSize || 0) - (attemptState.seenQuestionKeys?.length || 0));
        if (remainingUnseen < SESSION_Q_NUM) {
          appendSimilarQuestionsInBackground(content.questions, 'all-correct-extension');
        }
      }

      // ── 대표 펫 행복도 +10 (AI학습 완료 보상) ──────────────────
      try {
        const stuForPet = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
        const petId = stuForPet.empty ? null : stuForPet.docs[0].data().activePetId;
        if (petId) {
          const petSnap = await getDoc(doc(db, 'studentPets', petId));
          if (petSnap.exists()) {
            const pd = petSnap.data();
            const newHap = Math.min(100, (pd.happiness ?? 100) + 10);
            const newAff = (pd.affection ?? 0) + 5;
            await updateDoc(doc(db, 'studentPets', petId), { happiness: newHap, affection: newAff, lastCareAt: serverTimestamp(), lastHappinessDecay: serverTimestamp() });
          }
        }
      } catch {} // 펫 없으면 무시

      // ── 알 부화 카운터 증가 ─────────────────────────────────
      try {
        const eggSnap = await getDocs(query(
          collection(db, 'studentEggs'),
          where('studentCode', '==', studentCode),
          where('isIncubating', '==', true),
          where('hatched', '==', false),
        ));
        if (!eggSnap.empty) {
          const eggDoc = eggSnap.docs[0];
          const eggData = eggDoc.data();
          const REQUIRED = { common: 10, rare: 20, epic: 30, legendary: 40, mythic: 50 };
          const required = REQUIRED[eggData.eggType] || 10;
          const newClears = Math.min((eggData.currentClears || 0) + 1, required);
          await updateDoc(doc(db, 'studentEggs', eggDoc.id), { currentClears: newClears });
        }
      } catch (eggErr) { console.error('알 카운터 오류:', eggErr); }

      // ── 오답 기록 저장 (교사 취약 분석용) ───────────────────────
      await Promise.all(allAns.map(async answer => {
        const question = content.questions[answer.questionIndex] || {};
        const questionKey = answer.questionKey || question.__questionKey || `${key}_${questionFingerprint(question)}`;
        const wrongRef = doc(db, 'aiWrongAnswers', wrongAnswerId(studentCode, questionKey));
        const previousSnap = await getDoc(wrongRef);
        const previous = previousSnap.exists() ? previousSnap.data() : {};

        if (answer.correct) {
          if (!previousSnap.exists() || previous.status === 'resolved' || previous.resolved) return;
          const reviewCorrectCount = (previous.reviewCorrectCount || 0) + 1;
          const resolved = reviewCorrectCount >= 2;
          await setDoc(wrongRef, {
            status: resolved ? 'resolved' : 'reviewing',
            resolved,
            reviewCorrectCount,
            lastReviewedAt: serverTimestamp(),
            ...(resolved ? { resolvedAt: serverTimestamp() } : {}),
          }, { merge: true });
          return;
        }

        await setDoc(wrongRef, {
          studentCode, grade: selectedUnit.grade, semester: selectedUnit.semester,
          unitName: selectedUnit.unitName, lessonTitle: selectedLesson.title,
          lessonKey: key,
          questionKey,
          questionIdx: answer.questionIndex,
          poolIndex: answer.poolIndex ?? question.__poolIndex ?? answer.questionIndex,
          questionText: (question.question || '').slice(0, 120),
          fullQuestion: question.question || '',
          options: question.options || [],
          explanation: question.explanation || '',
          skill: question.skill || '',
          shape: question.shape || null,
          wrongCause: answer.wrongCause || wrongCauseByQuestion[answer.questionIndex] || '',
          selectedIdx: answer.selectedIndex,
          correctIdx: question.answerIndex,
          status: 'unresolved',
          resolved: false,
          wrongCount: (previous.wrongCount || 0) + 1,
          reviewCorrectCount: 0,
          completedAt: serverTimestamp(),
          date: today,
        }, { merge: true });
      }));

      // 일일 카운트 증가 (새로운 완료만)
      if (!alreadyRewarded) setDailyCount(prev => prev + 1);

      setFR({
        correctCount, total, score, reward, rewarded: canReward, alreadyRewarded, overLimit,
        attemptNo: newCount,
        masteryLevel: mastLevel,
        masteryAvg,
        scores,
        rewardLeft: Math.max(0, DAILY_LIMIT - (dailyCount + (!alreadyRewarded ? 1 : 0))),
      });
      setStep('result');
    } catch (e) { console.error(e); showToast('저장 오류', 'error'); }
    finally { setSaving(false); finishLockRef.current = false; }
  };

  const backToBrowse = () => { lessonLoadEpoch.current++; setStep('browse'); setUnit(null); setLesson(null); setContent(null); };
  const backToLessons = () => { lessonLoadEpoch.current++; setStep('lessons'); setCardIdx(0); setQIdx(0); setAnswers([]); setSelected(null); setShowResult(false); };

  const publishers = [...new Set(units.map(u => u.publisher).filter(Boolean))];
  const visibleLearningItems = units.flatMap(unit =>
    (unit.lessons || [])
      .filter(lesson => lesson.title !== '단원 도입')
      .filter(lesson => isCoursewareLessonAllowed(accessPolicy, unit, lesson))
      .map(lesson => ({ unit, lesson, mastery: allMastery[lessonKey(unit, lesson)] }))
  );
  const startedLearningItems = visibleLearningItems.filter(item => item.mastery?.attemptCount > 0);
  const completedLearningItems = visibleLearningItems.filter(item => item.mastery?.masteryAvg != null);
  const resumeTarget = [...startedLearningItems]
    .sort((a, b) => timestampToMs(b.mastery?.lastAttemptAt) - timestampToMs(a.mastery?.lastAttemptAt))[0] || null;
  const rewardRemaining = Math.max(0, DAILY_LIMIT - dailyCount);

  // ══════════════════════════════════════════════════════════════
  // ── 단원 브라우즈 화면 ────────────────────────────────────────
  if (step === 'browse') return (
    <div className={`min-h-full mx-auto max-w-5xl p-4 sm:p-6 ${isDark ? '' : 'text-slate-800'}`}>
      <section className="relative mb-4 overflow-hidden rounded-[28px] bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-600 p-5 text-white shadow-xl shadow-indigo-950/20 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-sm" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-cyan-300/15 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 text-2xl ring-1 ring-white/25">✦</span>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold ring-1 ring-white/20">
                {isTeacher ? '교사 미리보기' : `${filterGrade || student?.grade || '-'}학년 맞춤 학습`}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">AI 학습관</h1>
            <p className="mt-2 text-sm font-medium leading-6 text-indigo-50 sm:text-base">
              개념을 익히고 5문제에 도전해 보세요. 틀린 문제는 오답노트가 기억해 줍니다.
            </p>
          </div>
          {!isTeacher && (
            <div className="min-w-[180px] rounded-2xl bg-slate-950/20 p-4 ring-1 ring-white/20 backdrop-blur-sm">
              <div className="flex items-end justify-between">
                <span className="text-xs font-bold text-indigo-100">오늘 보상 기회</span>
                <strong className="text-2xl font-black">{rewardRemaining}<span className="text-sm text-white/60"> / {DAILY_LIMIT}</span></strong>
              </div>
              <div className="mt-3 flex gap-1" aria-label={`오늘 보상 기회 ${rewardRemaining}회 남음`}>
                {Array.from({ length: DAILY_LIMIT }, (_, index) => (
                  <span key={index} className={`h-2 flex-1 rounded-full ${index < rewardRemaining ? 'bg-amber-300' : 'bg-white/20'}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ['📚', '학습 차시', visibleLearningItems.length],
          ['🚀', '도전 중', startedLearningItems.length],
          ['🏅', '숙달 완료', completedLearningItems.length],
        ].map(([icon, label, value]) => (
          <div key={label} className={`rounded-2xl border px-3 py-3 sm:px-4 ${isDark ? 'border-slate-800 bg-slate-900/75' : 'border-slate-200 bg-white shadow-sm'}`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{icon}</span>
              <span className={`text-[11px] font-bold sm:text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
            </div>
            <p className={`mt-1 text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
          </div>
        ))}
      </div>

      {resumeTarget && (
        <button type="button" onClick={() => openLesson(resumeTarget.unit, resumeTarget.lesson)}
          className={`group mb-4 flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${
            isDark ? 'border-cyan-400/25 bg-gradient-to-r from-cyan-400/10 to-indigo-500/10' : 'border-cyan-200 bg-gradient-to-r from-cyan-50 to-indigo-50'
          }`}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-500 text-xl text-white shadow-lg shadow-cyan-500/20">▶</span>
          <span className="min-w-0 flex-1">
            <span className={`block text-[11px] font-extrabold ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>최근 학습 이어하기</span>
            <span className={`mt-0.5 block truncate text-sm font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{resumeTarget.lesson.title}</span>
            <span className={`mt-0.5 block truncate text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{resumeTarget.unit.unitName} · {resumeTarget.mastery.attemptCount}회 도전</span>
          </span>
          <span className={`text-sm font-black transition-transform group-hover:translate-x-1 ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>계속하기 →</span>
        </button>
      )}

      {!isTeacher && (
        <button type="button" onClick={loadWrongNotebook} disabled={wrongLoading}
          className={`mb-4 flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 ${
            isDark ? 'border-amber-400/20 bg-amber-400/10 hover:bg-amber-400/15' : 'border-amber-200 bg-amber-50 hover:bg-amber-100'
          }`}>
          <div>
            <p className={`font-extrabold ${isDark ? 'text-amber-100' : 'text-amber-900'}`}>📒 나의 오답노트</p>
            <p className={`mt-1 text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              틀린 문제를 다시 풀고 해결한 개념을 확인해보세요.
            </p>
          </div>
          <span className={`shrink-0 rounded-xl px-3 py-2 text-xs font-extrabold ${isDark ? 'bg-amber-300/15 text-amber-100' : 'bg-white text-amber-800'}`}>
            {wrongLoading ? '불러오는 중...' : '오답 다시 풀기 →'}
          </span>
        </button>
      )}

      {!isTeacher && <div role="status" className={`mb-4 flex items-center gap-3 rounded-2xl border p-3.5 text-sm ${
        isDark ? 'border-indigo-400/20 bg-indigo-400/10 text-indigo-100' : 'border-indigo-200 bg-indigo-50 text-indigo-800'
      }`}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-500/15">🎯</span>
        <div>
          <p className="text-xs font-extrabold">우리 반 학습 범위</p>
          <p className={`mt-0.5 text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            {accessError || (!accessReady ? '선생님 설정을 확인하고 있어요.' : accessPolicy?.mode && accessPolicy.mode !== 'all'
              ? '선생님이 지정한 학년·단원·차시만 표시됩니다.' : '현재 전체 콘텐츠를 자유롭게 학습할 수 있어요.')}
          </p>
        </div>
      </div>}
      {/* 필터 */}
      <div className={`mb-5 rounded-2xl border p-3 sm:p-4 ${isDark ? 'border-slate-800 bg-slate-900/75' : 'border-slate-200 bg-white shadow-sm'}`}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>학습 범위 선택</p>
            <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>학년과 학기를 고르면 단원을 빠르게 찾을 수 있어요.</p>
          </div>
          {filterGrade && <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${isDark ? 'bg-cyan-400/10 text-cyan-300' : 'bg-cyan-50 text-cyan-700'}`}>{units.length}개 단원</span>}
        </div>
        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        {/* 학년 select */}
        <label className="grid gap-1">
          <span className={`text-[10px] font-extrabold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>학년</span>
          <select value={filterGrade} onChange={e => { setFG(e.target.value); setFP(''); }}
            disabled={!accessReady}
            aria-label="학년 선택"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-cyan-500 sm:w-auto">
            <option value="">학년 선택</option>
            {allowedGrades.map(n => <option key={n} value={n}>{n}학년</option>)}
          </select>
        </label>

        {/* 학기 — 버튼 3개 */}
        <div>
          <span className={`mb-1 block text-[10px] font-extrabold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>학기</span>
          <div className={`grid grid-cols-3 overflow-hidden rounded-xl border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          {[['','전체학기'],['1','1학기'],['2','2학기']].map(([val, label]) => (
            <button key={val} onClick={() => setFS(val)}
              className={`px-3 py-2.5 text-sm font-bold transition-colors sm:px-4
                ${filterSem === val
                  ? 'bg-cyan-600 text-white'
                  : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>
              {label}
            </button>
          ))}
          </div>
        </div>

        {publishers.length > 1 && (
          <label className="grid gap-1">
            <span className={`text-[10px] font-extrabold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>출판사</span>
            <select value={filterPub} onChange={e => setFP(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500">
              <option value="">전체 출판사</option>
              {publishers.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
        </div>
      </div>

      {!filterGrade ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-3">📚</div>
          <p className="font-bold text-slate-300">학년을 선택해주세요</p>
        </div>
      ) : loadingUnits ? (
        <div className="flex items-center justify-center py-20 gap-2">
          <div className="w-5 h-5 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
          <span className="text-sm text-slate-400">단원 불러오는 중...</span>
        </div>
      ) : units.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-2">📭</div>
          <p className="font-bold text-slate-300">등록된 단원이 없습니다</p>
          <p className="text-xs mt-1 text-slate-500">관리자 페이지에서 수학 데이터를 추가해주세요</p>
        </div>
      ) : filterSem !== '' ? (
        /* 특정 학기 선택 시: 단순 그리드 */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {units.map((unit, idx) => {
            // 단원별 고정 그라디언트 색상
            const p = UNIT_CARD_PALETTES[idx % UNIT_CARD_PALETTES.length];
            const lessons = unit.lessons || [];
            const lessonCount = lessons.length;
            // 단원 도입 제외 카운트 가능한 차시 기준으로 숙달도 계산
            const unitMastery = (() => {
              const countable = lessons.filter(l => l.title !== '단원 도입');
              const rated = countable.map(l => allMastery[lessonKey(unit, l)]).filter(m => m?.masteryAvg != null);
              const done = rated.length, total = countable.length;
              const complete = done === total && total > 0;
              const avg = complete ? Math.round(rated.reduce((s, m) => s + m.masteryAvg, 0) / rated.length) : null;
              const started = countable.filter(l => allMastery[lessonKey(unit, l)]?.attemptCount > 0).length;
              return { done, total, complete, avg, level: avg != null ? getMasteryLevel(avg) : null, started };
            })();
            const mastCfg = unitMastery.complete ? (MASTERY[unitMastery.level] || MASTERY.retry) : null;
            return (
              <button key={unit.id}
                onClick={() => { setUnit(unit); setStep('lessons'); setLesson(null); setContent(null); }}
                className={`relative overflow-hidden rounded-2xl text-left transition-all duration-200
                  bg-gradient-to-br ${p.from} ${p.to}
                  hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0
                  ring-1 ${p.ring} shadow-lg`}>

                {/* 배경 장식 */}
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10" />
                <div className="absolute -right-1 -bottom-3 w-12 h-12 rounded-full bg-white/10" />

                <div className="relative p-5">
                  {/* 단원 번호 + 단원명 + 차시 수 */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-baseline gap-2 flex-1 min-w-0 pr-2">
                      <span className={`text-2xl font-black opacity-90 leading-none shrink-0 ${p.num}`}>
                        {unit.unitNumber || '?'}
                      </span>
                      <span className="text-white font-extrabold text-base leading-snug">
                        {unit.unitName}
                      </span>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${p.tag}`}>
                      {lessonCount}차시
                    </span>
                  </div>

                  {/* 단원 숙달도 / 완료도 */}
                  {mastCfg ? (
                    // 모든 차시 완료 → 숙달도 표시
                    <div className="mt-2">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-white/25 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          {mastCfg.emoji} {mastCfg.label}
                        </span>
                        <span className="text-white/70 text-[10px] font-bold">{unitMastery.avg}점</span>
                      </div>
                      <div className="text-white/40 text-[9px] mt-0.5">{unitMastery.total}개 차시 완료</div>
                    </div>
                  ) : unitMastery.started > 0 ? (
                    // 진행중 → 원그래프
                    <div className="mt-2 flex items-center gap-2.5">
                      <UnitCircleProgress started={unitMastery.started} done={unitMastery.done} total={unitMastery.total} size={50} />
                      <div>
                        <div className="text-white/80 text-[10px] font-bold">진행 {unitMastery.started}개 · 전체 {unitMastery.total}개</div>
                        {unitMastery.done > 0 && (
                          <div className="text-white/50 text-[9px]">{unitMastery.done}개 숙달도 완료</div>
                        )}
                        <div className="text-white/35 text-[9px]">{unitMastery.total - unitMastery.done}개 더 완료 시 수준 표시</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2"><span className="text-white/80 text-[10px] font-semibold">미시작</span></div>
                  )}

                  {/* 하단 정보 */}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-white/85 text-xs font-medium">
                      {unit.grade}학년 {unit.semester ? `${unit.semester}학기` : ''} 수학
                    </span>
                    <span className="text-white/70 text-sm font-bold">→</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* 전체 학기: 좌 1학기 / 우 2학기 */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {['1','2'].map(sem => {
            const semUnits = units.filter(u => !u.semester || String(u.semester) === sem);
            return (
              <div key={sem}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2 h-6 rounded-full ${sem === '1' ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                  <span className={`font-extrabold text-base ${isDark ? 'text-white' : 'text-slate-800'}`}>{sem}학기</span>
                  <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>{semUnits.length}단원</span>
                </div>
                <div className="space-y-2">
                  {semUnits.length === 0 ? (
                    <div className="text-center py-8 text-slate-600 text-sm">단원 없음</div>
                  ) : semUnits.map((unit, idx) => {
                    const p = UNIT_CARD_PALETTES[idx % UNIT_CARD_PALETTES.length];
                    const uLessons = unit.lessons || [];
                    const unitMastery2 = (() => {
                      const countable = uLessons.filter(l => l.title !== '단원 도입');
                      const rated = countable.map(l => allMastery[lessonKey(unit, l)]).filter(m => m?.masteryAvg != null);
                      const done = rated.length, total = countable.length;
                      const complete = done === total && total > 0;
                      const avg = complete ? Math.round(rated.reduce((s, m) => s + m.masteryAvg, 0) / rated.length) : null;
                      const started = countable.filter(l => allMastery[lessonKey(unit, l)]?.attemptCount > 0).length;
                      return { done, total, complete, avg, level: avg != null ? getMasteryLevel(avg) : null, started };
                    })();
                    const mCfg2 = unitMastery2.complete ? (MASTERY[unitMastery2.level] || MASTERY.retry) : null;
                    return (
                      <button key={unit.id}
                        onClick={() => { setUnit(unit); setStep('lessons'); setLesson(null); setContent(null); }}
                        className={`w-full relative overflow-hidden rounded-xl text-left transition-all duration-200
                          bg-gradient-to-br ${p.from} ${p.to}
                          hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0
                          ring-1 ${p.ring} shadow-md`}>
                        <div className="absolute -right-3 -top-3 w-14 h-14 rounded-full bg-white/10" />
                        <div className="relative p-3.5">
                          <div className="flex items-start justify-between mb-1.5">
                            <div className="flex items-baseline gap-1.5 flex-1 min-w-0 pr-1">
                              <span className="text-white/80 font-black text-lg leading-none shrink-0">{unit.unitNumber}</span>
                              <span className="text-white font-extrabold text-sm leading-snug">{unit.unitName}</span>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${p.tag}`}>{uLessons.length}차시</span>
                          </div>
                          {mCfg2 ? (
                            <div className="mt-1">
                              <div className="text-white/90 text-[10px] font-extrabold">{mCfg2.emoji} {mCfg2.label} · {unitMastery2.avg}점</div>
                              <div className="text-white/40 text-[9px]">{unitMastery2.total}개 차시 완료</div>
                            </div>
                          ) : unitMastery2.started > 0 ? (
                            <div className="mt-1 flex items-center gap-1.5">
                              <UnitCircleProgress started={unitMastery2.started} done={unitMastery2.done} total={unitMastery2.total} size={36} />
                              <div>
                                <div className="text-white/70 text-[9px] font-bold">진행 {unitMastery2.started}개 · 전체 {unitMastery2.total}개</div>
                                {unitMastery2.done > 0 && <div className="text-white/40 text-[8px]">{unitMastery2.done}개 완료</div>}
                              </div>
                            </div>
                          ) : (
                            <div className="text-white/80 text-[9px] mt-1 font-semibold">미시작</div>
                          )}
                          <div className="text-white/80 text-[10px] mt-1 flex justify-between font-medium">
                            <span>{filterGrade}학년 {sem}학기</span>
                            <span>→</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} text-white`} style={{ whiteSpace: 'nowrap' }}>{toast.msg}</div>}
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // ── 차시 목록 화면 ────────────────────────────────────────────
  if (step === 'lessons' && selectedUnit) {
    const availableLessons = (selectedUnit.lessons || []).filter(lesson => isCoursewareLessonAllowed(accessPolicy, selectedUnit, lesson));
    const progressLessons = availableLessons.filter(lesson => lesson.title !== '단원 도입');
    const unitStarted = progressLessons.filter(lesson => allMastery[lessonKey(selectedUnit, lesson)]?.attemptCount > 0).length;
    const unitCompleted = progressLessons.filter(lesson => allMastery[lessonKey(selectedUnit, lesson)]?.masteryAvg != null).length;
    const unitProgress = progressLessons.length ? Math.round((unitCompleted / progressLessons.length) * 100) : 0;

    return (
      <div className={`mx-auto min-h-full max-w-3xl p-4 sm:p-6 ${isDark ? '' : 'text-slate-800'}`}>
        <button onClick={backToBrowse} className={`mb-4 flex items-center gap-1.5 text-sm font-bold ${isDark ? 'text-indigo-300 hover:text-white' : 'text-indigo-700 hover:text-indigo-900'}`}>
          ← 단원 목록으로
        </button>
        <section className="relative mb-5 overflow-hidden rounded-[28px] bg-gradient-to-br from-cyan-600 via-blue-600 to-indigo-700 p-5 text-white shadow-xl sm:p-6">
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold text-cyan-100">{selectedUnit.grade}학년 {selectedUnit.semester ? `${selectedUnit.semester}학기 ` : ''}수학</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">{selectedUnit.unitNumber ? `${selectedUnit.unitNumber}. ` : ''}{selectedUnit.unitName}</h2>
                <p className="mt-2 text-sm font-medium text-blue-100">개념 카드로 익힌 뒤 5문제 미니퀴즈에 도전해요.</p>
              </div>
              <div className="rounded-2xl bg-white/15 px-4 py-3 text-right ring-1 ring-white/20">
                <p className="text-[10px] font-bold text-blue-100">숙달 완료</p>
                <p className="text-xl font-black">{unitCompleted}<span className="text-sm text-white/60"> / {progressLessons.length}</span></p>
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-[11px] font-bold text-blue-100">
                <span>{unitStarted ? `${unitStarted}개 차시 도전 중` : '첫 차시를 시작해 보세요'}</span>
                <span>{unitProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-950/20">
                <div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${unitProgress}%` }} />
              </div>
            </div>
          </div>
        </section>

        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3 className={`text-base font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>차시 선택</h3>
            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>원하는 차시를 누르면 바로 학습을 준비합니다.</p>
          </div>
          <span className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{availableLessons.length}개</span>
        </div>

        <div className="space-y-2.5">
          {availableLessons.length === 0 ? (
            <div className={`rounded-3xl border py-12 text-center ${isDark ? 'border-slate-800 bg-slate-900 text-slate-400' : 'border-slate-200 bg-white text-slate-500'}`}>
              <p className="text-3xl">📭</p>
              <p className="mt-2 font-bold">이 단원에 학습 가능한 차시가 없습니다.</p>
            </div>
          ) : availableLessons.map(lesson => {
            const mastery = allMastery[lessonKey(selectedUnit, lesson)];
            const done = mastery?.scores?.length || 0;
            const masteryCfg = mastery?.masteryAvg != null ? (MASTERY[mastery.masteryLevel] || MASTERY.retry) : null;
            return (
              <button key={lesson.no}
                onClick={() => openLesson(selectedUnit, lesson)}
                onPointerEnter={() => queueLessonPreload(selectedUnit, lesson)}
                onFocus={() => queueLessonPreload(selectedUnit, lesson)}
                onTouchStart={() => queueLessonPreload(selectedUnit, lesson)}
                className={`group w-full rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                  isDark ? 'border-slate-700 bg-slate-800/70 hover:border-cyan-400/60' : 'border-slate-200 bg-white shadow-sm hover:border-cyan-400'
                }`}>
                <div className="flex items-center gap-3">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-black ${
                    mastery ? 'bg-cyan-500 text-white' : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}>{lesson.no}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-extrabold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{lesson.title}</span>
                    {(lesson.keywords || []).length > 0 && (
                      <span className={`mt-1 block truncate text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{lesson.keywords.slice(0, 3).join(' · ')}</span>
                    )}
                  </span>
                  <span className={`shrink-0 rounded-xl px-3 py-2 text-[11px] font-extrabold ${
                    mastery ? isDark ? 'bg-cyan-400/10 text-cyan-300' : 'bg-cyan-50 text-cyan-700' : isDark ? 'bg-white/5 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}>{mastery ? '다시 학습' : '학습 시작'} →</span>
                </div>
                <div className="mt-3 flex items-center gap-2 pl-14">
                  {!mastery ? (
                    <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>아직 도전하지 않았어요</span>
                  ) : masteryCfg ? (
                    <>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${masteryCfg.cls}`}>{masteryCfg.emoji} {masteryCfg.label}</span>
                      <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>평균 {mastery.masteryAvg}점 · {mastery.attemptCount}회</span>
                    </>
                  ) : (
                    <>
                      <span className={`text-[10px] font-bold ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>숙달까지 {MASTERY_ATTEMPTS - done}회 남음</span>
                      <div className="flex gap-1">
                        {Array.from({ length: MASTERY_ATTEMPTS }, (_, index) => (
                          <span key={index} className={`h-1.5 w-5 rounded-full ${index < done ? 'bg-cyan-400' : isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {toast && <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} text-white`} style={{ whiteSpace: 'nowrap' }}>{toast.msg}</div>}
      </div>
    );
  }

  // ── 로딩 화면 ────────────────────────────────────────────────
  if (step === 'loading') return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">

        {/* 스피너 */}
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-300/20 border-t-indigo-400 animate-spin" />
          <div className="absolute inset-3 rounded-full bg-indigo-500/20 flex items-center justify-center text-2xl">
            🤖
          </div>
        </div>

        {/* 차시 정보 */}
        <div>
          <p className="text-white font-extrabold text-lg">{selectedUnit?.unitName}</p>
          <p className="text-indigo-300 text-sm mt-1">
            {selectedLesson?.no}차시 · {selectedLesson?.title}
          </p>
        </div>

        {/* 순환 메시지 */}
        <div className="bg-white/5 rounded-2xl px-5 py-4 min-h-[56px] flex items-center justify-center">
          <p className="text-indigo-200 text-sm font-bold">
            {LOADING_MSGS[loadingMsgIdx]}
          </p>
        </div>

        {/* 경과 시간 — 솔직하게 표시 */}
        <div className="flex items-center justify-center gap-2 text-indigo-400/70 text-sm">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          <span>{loadingElapsed}초 경과</span>
          {loadingElapsed < 3 && <span className="text-xs">(첫 생성은 잠시 걸릴 수 있어요)</span>}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-xs leading-5 text-slate-400">
          <span className="font-bold text-indigo-200">알고 있나요?</span> 한 번 만든 학습 내용은 저장되어 다음에는 더 빠르게 열립니다.
        </div>
        <button type="button" onClick={backToLessons} className="text-sm font-bold text-slate-400 underline-offset-4 hover:text-white hover:underline">
          취소하고 차시 목록으로
        </button>

      </div>
    </div>
  );

  if (step === 'wrongNote') {
    const visibleWrong = wrongNotebook.filter(item => {
      const status = item.status || (item.resolved ? 'resolved' : 'unresolved');
      if (wrongFilter === 'all') return true;
      if (wrongFilter === 'resolved') return status === 'resolved';
      return status !== 'resolved';
    });
    const unresolvedCount = wrongNotebook.filter(item => !item.resolved && item.status !== 'resolved').length;
    const resolvedCount = wrongNotebook.filter(item => item.resolved || item.status === 'resolved').length;

    return (
      <div className="fixed inset-0 z-[80] min-h-screen overflow-y-auto bg-slate-950 p-4 md:static md:z-auto md:p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <button type="button" onClick={backToBrowse} className="mb-2 text-sm font-bold text-indigo-300 hover:text-white">← AI 학습관</button>
              <h1 className="text-2xl font-black text-white">📒 나의 오답노트</h1>
              <p className="mt-1 text-sm font-medium text-slate-400">같은 문제를 두 번 다시 맞히면 해결 완료됩니다.</p>
            </div>
            <div className="flex gap-2">
              <span className="rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-extrabold text-rose-300">복습 필요 {unresolvedCount}</span>
              <span className="rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-extrabold text-emerald-300">해결 {resolvedCount}</span>
            </div>
          </div>

          <div className="flex rounded-xl bg-slate-900 p-1">
            {[['active', '복습 필요'], ['resolved', '해결 완료'], ['all', '전체']].map(([value, label]) => (
              <button type="button" key={value} onClick={() => setWrongFilter(value)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-extrabold ${wrongFilter === value ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>

          {visibleWrong.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-12 text-center">
              <p className="text-4xl">✅</p>
              <p className="mt-3 font-extrabold text-white">표시할 오답이 없습니다.</p>
            </div>
          ) : visibleWrong.map((item, index) => {
            const status = item.status || (item.resolved ? 'resolved' : 'unresolved');
            const feedback = wrongFeedback[item.id];
            const locked = status === 'resolved' || !!feedback;
            return (
              <div key={item.id} className="rounded-3xl border border-slate-700 bg-white p-5 shadow-xl">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-extrabold text-indigo-600">{item.unitName} · {item.lessonTitle}</p>
                    <h2 className="mt-2 text-lg font-black leading-7 text-slate-800">Q{index + 1}. {renderMath(item.fullQuestion || item.questionText)}</h2>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${
                    status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : status === 'reviewing' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {status === 'resolved' ? '해결 완료' : status === 'reviewing' ? '한 번 더 확인' : `오답 ${item.wrongCount || 1}회`}
                  </span>
                </div>

                <div className="mt-4 grid gap-2">
                  {(item.options || []).map((option, optionIndex) => (
                    <button type="button" key={optionIndex} disabled={locked}
                      onClick={() => setWrongSelections(prev => ({ ...prev, [item.id]: optionIndex }))}
                      className={`rounded-xl border px-4 py-3 text-left text-sm font-bold ${
                        wrongSelections[item.id] === optionIndex ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      } disabled:cursor-default`}>
                      {optionIndex + 1}. {renderMath(option)}
                    </button>
                  ))}
                </div>

                {feedback && (
                  <div className={`mt-4 rounded-xl border p-4 ${feedback.correct ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                    <p className="font-extrabold">{feedback.correct ? (feedback.status === 'resolved' ? '해결 완료!' : '정답입니다. 다음에 한 번 더 확인해요.') : '아직 다시 살펴볼 필요가 있어요.'}</p>
                    <p className="mt-2 text-sm">정답: {renderMath(item.options?.[item.correctIdx] || '')}</p>
                    {item.explanation && <p className="mt-1 text-sm">{renderMath(item.explanation)}</p>}
                  </div>
                )}

                {status === 'resolved' && !feedback && (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                    <p className="font-extrabold">해결한 문제입니다.</p>
                    <p className="mt-2 text-sm">정답: {renderMath(item.options?.[item.correctIdx] || '')}</p>
                    {item.explanation && <p className="mt-1 text-sm">{renderMath(item.explanation)}</p>}
                  </div>
                )}

                {!locked && (
                  <button type="button" onClick={() => checkWrongNotebookAnswer(item)}
                    disabled={!Number.isInteger(wrongSelections[item.id])}
                    className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-extrabold text-white hover:bg-indigo-700 disabled:opacity-40">
                    정답 확인
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!content || !selectedUnit || !selectedLesson) return null;
  const currentCard = content.conceptCards?.[cardIdx];
  const currentQ    = content.questions?.[qIdx];

  // ══════════════════════════════════════════════════════════════
  // ── 개념 카드 화면 (2배 크기) ─────────────────────────────────
  if (step === 'concept') return (
    <div className="min-h-screen bg-gradient-to-b from-sky-950 to-slate-900 flex flex-col p-4 md:p-8">
      <div className="max-w-3xl w-full mx-auto flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <button onClick={backToLessons} className="text-white/50 hover:text-white text-sm font-bold">← 차시 목록</button>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full bg-sky-400/15 px-2.5 py-1 text-[10px] font-extrabold text-sky-200 ring-1 ring-sky-300/20">개념 학습</span>
              <p className="truncate text-sm font-extrabold text-white">{selectedLesson.title}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white/70">{cardIdx + 1} / {content.conceptCards.length}</span>
        </div>

        {/* 진행 바 */}
        <div className="flex items-center gap-2">
          {content.conceptCards.map((_, i) => (
            <div key={i} className={`flex-1 h-2 rounded-full transition-colors ${i <= cardIdx ? 'bg-sky-400' : 'bg-white/20'}`} />
          ))}
        </div>

        {/* 개념 카드 — 크게 */}
        <div className="bg-white rounded-3xl shadow-2xl p-5 space-y-5 sm:p-8 sm:space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📖</span>
            <h3 className="font-extrabold text-sky-800 text-xl leading-snug sm:text-2xl">{currentCard.title}</h3>
          </div>
          <p className="text-slate-700 text-base leading-8 sm:text-lg">{currentCard.body}</p>
          {currentCard.example && (
            <div className="bg-sky-50 border-2 border-sky-200 rounded-2xl px-6 py-5">
              <div className="text-sm font-bold text-sky-600 mb-2">💡 예시</div>
              <p className="text-base text-slate-700 leading-relaxed">{currentCard.example}</p>
            </div>
          )}
        </div>

        {/* 자주 틀리는 포인트 (마지막 카드) */}
        {cardIdx === content.conceptCards.length - 1 && content.commonMistakes?.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6">
            <div className="font-extrabold text-amber-700 text-base mb-2">⚠️ 자주 틀리는 포인트</div>
            {content.commonMistakes.map((m, i) => (
              <p key={i} className="text-base text-amber-800 mt-1">• {m}</p>
            ))}
          </div>
        )}

        {/* 이전/다음 버튼 */}
        <div className="sticky bottom-3 z-10 flex gap-3 rounded-3xl bg-slate-950/70 p-2 backdrop-blur-md sm:static sm:bg-transparent sm:p-0">
          {cardIdx > 0 && (
            <button onClick={() => setCardIdx(i => i - 1)}
              className="flex-1 py-4 bg-white/20 hover:bg-white/30 text-white font-bold text-base rounded-2xl border border-white/30 sm:py-5 sm:text-lg">
              ← 이전
            </button>
          )}
          <button
            onClick={() => {
              if (cardIdx < content.conceptCards.length - 1) setCardIdx(i => i + 1);
              else { setStep('quiz'); setQIdx(0); setSelected(null); setShowResult(false); }
            }}
            className="flex-1 py-4 bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-lg rounded-2xl shadow-lg sm:py-5 sm:text-xl">
            {cardIdx < content.conceptCards.length - 1 ? '다음 →' : '퀴즈 풀기 →'}
          </button>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // ── 퀴즈 화면 (2배 크기) ─────────────────────────────────────
  if (step === 'quiz') return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 to-slate-900 flex flex-col p-4 md:p-8">
      <div className="mb-3 flex w-full max-w-3xl items-center justify-between gap-3 self-center">
        <button type="button" onClick={backToLessons} className="text-sm font-bold text-white/50 hover:text-white">← 차시 목록</button>
        <div className="min-w-0 text-right">
          <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-extrabold text-emerald-200 ring-1 ring-emerald-300/20">미니퀴즈</span>
          <p className="mt-1 max-w-[210px] truncate text-xs font-bold text-white/70 sm:max-w-sm">{selectedLesson.title}</p>
        </div>
      </div>
      {/* 진행 바 */}
      <div className="flex items-center gap-2 mb-2 max-w-3xl w-full mx-auto">
        {content.questions.map((_, i) => (
          <div key={i} className={`flex-1 h-2 rounded-full transition-colors
            ${i < answers.length ? (answers[i]?.correct ? 'bg-emerald-400' : 'bg-rose-400') : i === qIdx ? 'bg-white/60' : 'bg-white/20'}`} />
        ))}
      </div>
      <div className="text-white/50 text-sm text-center mb-4">{qIdx + 1} / {content.questions.length}문항 · {Math.round(((qIdx + 1) / content.questions.length) * 100)}%</div>

      <div className="max-w-3xl w-full mx-auto flex-1 flex flex-col gap-4">
        {/* 문제 카드 — 크게 */}
        <div className="bg-white rounded-3xl shadow-2xl p-5 space-y-5 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="text-2xl font-extrabold text-emerald-600 shrink-0 mt-0.5">Q{qIdx + 1}.</span>
            <p className="text-slate-800 font-bold text-xl leading-8 sm:text-2xl sm:leading-snug">{renderMath(currentQ.question)}</p>
          </div>
          <TableRenderer table={currentQ.table} />
          <ShapeRenderer shape={getRenderableQuestionShape(currentQ, selectedUnit)} />

          {/* 보기 — 세로 배치, 크게 */}
          <div className="space-y-3">
            {currentQ.options.map((opt, oi) => {
              const isSelected = selected === oi;
              const isCorrect  = oi === currentQ.answerIndex;
              let cls = 'border-2 border-slate-200 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50';
              if (showResult) {
                if (isCorrect) cls = 'border-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-extrabold';
                else if (isSelected) cls = 'border-2 border-rose-400 bg-rose-50 text-rose-700';
                else cls = 'border-2 border-slate-200 bg-white text-slate-400';
              } else if (isSelected) cls = 'border-2 border-indigo-500 bg-indigo-50 text-indigo-800 font-extrabold';
              return (
                <button key={oi} onClick={() => !showResult && setSelected(oi)}
                  className={`w-full min-h-14 text-left px-4 py-3.5 rounded-2xl text-base transition-all sm:px-6 sm:py-4 sm:text-lg ${cls}`}>
                  <span className="text-slate-400 mr-2 font-bold">{['①','②','③','④'][oi]}</span>
                  {renderMath(stripOptionPrefix(opt))}
                </button>
              );
            })}
          </div>

          {/* 해설 */}
          {showResult && (
            <div className={`rounded-2xl px-5 py-4 text-base ${(answers[answers.length-1]?.correct || selected === currentQ.answerIndex) ? 'bg-emerald-50 border-2 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-2 border-rose-200 text-rose-800'}`}>
              <div className="font-extrabold text-lg mb-1">{(answers[answers.length-1]?.correct || selected === currentQ.answerIndex) ? '✅ 정답!' : '❌ 오답'}</div>
              <p className="text-sm leading-relaxed">{renderMath(currentQ.explanation)}</p>
            </div>
          )}

          {showResult && selected !== currentQ.answerIndex && (
            <div className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-4">
              <p className="font-extrabold text-violet-900">이번에는 왜 틀렸다고 생각하나요?</p>
              <p className="mt-1 text-xs font-semibold text-violet-600">선택한 내용은 다음 복습 추천에 활용됩니다.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {WRONG_CAUSES.map(([value, label]) => (
                  <button type="button" key={value}
                    onClick={() => {
                      setWrongCauseByQuestion(prev => ({ ...prev, [qIdx]: value }));
                      setAnswers(prev => prev.map(answer =>
                        answer.questionIndex === qIdx ? { ...answer, wrongCause: value } : answer
                      ));
                    }}
                    className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition-colors ${
                      wrongCauseByQuestion[qIdx] === value
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-violet-200 bg-white text-violet-700 hover:border-violet-400'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 모바일에서도 선택 후 바로 누를 수 있는 고정 액션 영역 */}
        <div className="sticky bottom-3 z-10 rounded-3xl bg-slate-950/75 p-2 backdrop-blur-md sm:static sm:bg-transparent sm:p-0">
          {!showResult ? (
            <>
              {minTimeLeft <= 0 && selected === null && <p className="mb-2 text-center text-xs font-bold text-white/60">답을 하나 선택해 주세요.</p>}
              <button
                onClick={confirmAnswer}
                disabled={selected === null || minTimeLeft > 0}
                className={`w-full py-4 font-extrabold text-lg rounded-2xl shadow-lg transition-all sm:py-5 sm:text-xl
                  ${minTimeLeft > 0
                    ? 'bg-slate-700 text-slate-300 cursor-not-allowed'
                    : selected === null
                      ? 'bg-emerald-500 text-white opacity-40'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white'}`}>
                {minTimeLeft > 0
                  ? `문제를 천천히 읽어보세요 · ${minTimeLeft}초`
                  : selected === null ? '답을 선택해 주세요' : '선택한 답 확인하기'}
              </button>
            </>
          ) : (
            <button onClick={nextQuestion} disabled={saving}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-lg rounded-2xl disabled:opacity-40 shadow-lg sm:py-5 sm:text-xl">
              {saving ? '학습 기록 저장 중...'
                : qIdx < content.questions.length - 1 ? '다음 문제 →' : '학습 결과 보기 →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // ── 결과 화면 ────────────────────────────────────────────────
  if (step === 'result' && finalResult) return (
    <div className="min-h-screen bg-gradient-to-b from-violet-950 to-slate-900 flex items-center justify-center p-6">
      {finalResult.score >= 60 && <ConfettiCanvas />}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className={`px-6 py-8 text-center ${finalResult.score >= 80 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : finalResult.score >= 60 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-slate-600 to-slate-700'}`}>
          <div className="text-5xl mb-2">{finalResult.score >= 80 ? '🏆' : finalResult.score >= 60 ? '👍' : '💪'}</div>
          <div className="text-4xl font-extrabold text-white mb-1">{finalResult.score}점</div>
          <p className="text-white/80 text-sm">{finalResult.correctCount}/{finalResult.total}문항 정답</p>
          <p className="text-white/60 text-xs mt-0.5">{selectedUnit.unitName} · {selectedLesson.title}</p>
        </div>
        <div className="p-6 space-y-4">
          {isTeacher && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 text-center text-xs text-indigo-700 font-bold">
              👨‍🏫 교사 미리보기 모드 — 저장 및 보상이 적용되지 않습니다
            </div>
          )}
          {finalResult.rewarded && finalResult.reward && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
              <div className="font-bold text-amber-700 text-sm mb-2">
                🎁 보상 획득! ({finalResult.correctCount}/{finalResult.total} 정답)
              </div>
              <div className="flex justify-center gap-5">
                {finalResult.reward.exp > 0 && (
                  <div><div className="text-xl">⭐</div><div className="text-xs font-bold text-amber-700">+{finalResult.reward.exp} EXP</div></div>
                )}
                {finalResult.reward.gold > 0 && (
                  <div><div className="text-xl">🪙</div><div className="text-xs font-bold text-amber-700">+{finalResult.reward.gold}G</div></div>
                )}
                {finalResult.reward.diamonds > 0 && (
                  <div><div className="text-xl">💎</div><div className="text-xs font-bold text-amber-700">+{finalResult.reward.diamonds}</div></div>
                )}
              </div>
              <p className="text-[10px] text-amber-500 mt-1.5">
                정답률 {finalResult.score}% → 최대 보상의 {finalResult.score}%
              </p>
            </div>
          )}
          {/* 숙달도 + 도전 기록 */}
          {(() => {
            const done = finalResult.scores?.length || 0;
            if (done < MASTERY_ATTEMPTS) {
              return (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                  <div className="text-xs text-slate-500 mb-2">{finalResult.attemptNo}번째 도전 · 숙달도 평가까지 <span className="font-bold text-indigo-600">{MASTERY_ATTEMPTS - done}회</span> 남음</div>
                  <div className="flex justify-center gap-1.5">
                    {(finalResult.scores || []).map((s, i) => (
                      <div key={i} className="text-center">
                        <div className="w-8 h-8 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">{s}</div>
                        <div className="text-[9px] text-slate-400 mt-0.5">{i + 1}회</div>
                      </div>
                    ))}
                    {Array.from({ length: MASTERY_ATTEMPTS - done }, (_, i) => (
                      <div key={`empty-${i}`} className="text-center">
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-400 text-xs font-bold flex items-center justify-center">?</div>
                        <div className="text-[9px] text-slate-400 mt-0.5">{done + i + 1}회</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            const cfg = MASTERY[finalResult.masteryLevel] || MASTERY.retry;
            return (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                <div className="text-xs text-slate-500 mb-1.5">{finalResult.attemptNo}번째 도전 · {MASTERY_ATTEMPTS}회 점수 평균</div>
                <span className={`inline-flex items-center gap-1 text-sm font-extrabold px-3 py-1 rounded-full ${cfg.cls}`}>
                  {cfg.emoji} {cfg.label}
                </span>
                <div className="text-base font-extrabold text-slate-700 mt-2">{finalResult.masteryAvg}점</div>
                <div className="flex justify-center gap-1 mt-2">
                  {(finalResult.scores || []).map((s, i) => (
                    <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${s === finalResult.score ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{s}</span>
                  ))}
                </div>
                <div className="text-[10px] text-slate-400 mt-1.5">
                  {finalResult.rewardLeft > 0 ? `보상 ${finalResult.rewardLeft}회 남음` : '보상 획득 완료 · 계속 도전 가능!'}
                </div>
              </div>
            );
          })()}
          {finalResult.alreadyRewarded && (
            <p className="text-center text-xs text-slate-400">오늘 이미 이 차시 보상을 받았습니다.</p>
          )}
          {finalResult.overLimit && !finalResult.alreadyRewarded && (
            <p className="text-center text-xs text-slate-400">5회 보상을 모두 받았습니다. 계속 도전은 가능합니다!</p>
          )}

          <div className="space-y-1.5">
            {content.questions.map((q, i) => {
              const ans = answers.find(answer => answer.questionIndex === i) || { correct: false };
              const isOpen = expandedResult === i;
              return (
                <div key={i} className={`rounded-xl text-sm ${ans.correct ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  <button type="button" onClick={() => setExpandedResult(isOpen ? null : i)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left">
                    <span className="font-extrabold shrink-0">{ans.correct ? '✅' : '❌'} Q{i+1}</span>
                    <span className="line-clamp-1 flex-1 text-xs">{q.question}</span>
                    <span className="text-xs font-bold">{isOpen ? '접기' : '해설 보기'}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-current/10 px-4 py-3 text-xs leading-6">
                      <p><strong>내가 고른 답:</strong> {renderMath(q.options?.[ans.selectedIndex] || '-')}</p>
                      <p><strong>정답:</strong> {renderMath(q.options?.[q.answerIndex] || '-')}</p>
                      {q.explanation && <p className="mt-1"><strong>해설:</strong> {renderMath(q.explanation)}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {finalResult.correctCount < finalResult.total && !isTeacher && (
            <button type="button" onClick={loadWrongNotebook} disabled={wrongLoading}
              className="w-full rounded-2xl border border-amber-200 bg-amber-50 py-3 text-sm font-extrabold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
              📒 틀린 문제 오답노트에서 복습하기
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button onClick={backToLessons}
              className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-sm">
              다른 차시 보기
            </button>
            <button onClick={startLearning}
              className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm">
              다시 풀기
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return null;
}
