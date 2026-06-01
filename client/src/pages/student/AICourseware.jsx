import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { renderMath, TableRenderer, stripOptionPrefix } from '../../utils/renderMath';
import ShapeRenderer from '../../components/ShapeRenderer';
import { getMaxExpForLevel } from '../../utils/leveling';

const MAX_REWARD = { exp: 30, gold: 20, diamonds: 10 }; // 최대 보상 (정답률 100%)
const DAILY_LIMIT   = 5;  // 하루 최대 보상 횟수
const SESSION_Q_NUM = 5;  // 매 세션에 출제할 문제 수 (풀에서 랜덤 선택)
const COURSEWARE_QUALITY_VERSION = 'quality-v6-shape-fix';

const questionFingerprint = (q) =>
  String(q?.question || '')
    .replace(/\s+/g, '')
    .replace(/[①②③④0-9().,!?~]/g, '')
    .slice(0, 90);

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
  localStorage.setItem(`aiCoursewareRecent:${key}`, JSON.stringify(unique));
}

function shouldRefreshLessonContent(data) {
  if (!data) return true;
  if (data.generatorVersion !== COURSEWARE_QUALITY_VERSION) return true;
  if (!Array.isArray(data.questions) || data.questions.length < 8) return true;
  return false;
}

// 캐시된 문제 풀에서 최근 풀었던 문항은 뒤로 미뤄 세션마다 다른 조합을 출제
function pickSessionQuestions(data, key) {
  if (!data?.questions?.length) return data;
  const pool = data.questions;
  if (pool.length <= SESSION_Q_NUM) return data;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const recent = new Set(readRecentQuestionKeys(key));
  const fresh = shuffled.filter(q => !recent.has(questionFingerprint(q)));
  const fallback = shuffled.filter(q => recent.has(questionFingerprint(q)));
  const selected = [...fresh, ...fallback].slice(0, SESSION_Q_NUM);
  saveRecentQuestionKeys(key, selected.map(questionFingerprint));
  return { ...data, questions: selected };
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
        <span className="text-white/40" style={{ fontSize: size * 0.15 }}>/{total}</span>
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
  const ratio = correctCount / total;
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

const fetchLessonContent = async (unit, lesson) => {
  // RAG: 교사가 등록한 교과서 내용이 있으면 가져와서 프롬프트에 포함
  const lKey = `v3_${unit.grade}_${unit.semester || 0}_${unit.publisher || 'default'}_${unit.id}_${lesson.no}`;
  let lessonContext = null;
  try {
    const ctxSnap = await getDoc(doc(db, 'aiLessonContext', lKey));
    if (ctxSnap.exists()) lessonContext = ctxSnap.data().text || null;
  } catch {}

  const res = await fetch('/api/generate-courseware', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grade: unit.grade, semester: unit.semester,
      publisher: unit.publisher || '국정',
      unitName: unit.unitName,
      lessonNo: lesson.no, lessonTitle: lesson.title,
      learningGoal: '', keywords: lesson.keywords || [],
      difficulty: 'normal', questionCount: SESSION_Q_NUM,
      lessonContext, // RAG 교과서 내용
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '생성 실패');
  return data;
};

// preloadLesson은 컴포넌트 외부에 있어 db/getDoc/doc을 직접 사용 불가
// → openLesson 내부에서 호출하는 방식으로 변경 (아래 useEffect에서 처리)

// 로딩 순환 메시지 (끝이 없이 반복)
const LOADING_MSGS = [
  '차시 내용을 분석하는 중...',
  'AI 선생님이 개념 카드 작성 중...',
  '핵심 개념을 정리하는 중...',
  '퀴즈 문제를 만드는 중...',
  '오답 보기를 설계하는 중...',
  '해설을 다듬는 중...',
];

export default function AICourseware({ studentCode }) {
  const [student, setStudent]   = useState(null);

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
  const [content, setContent]       = useState(null);   // AI 콘텐츠 (캐시 or 신규)
  const [contentLoading, setCL]     = useState(false);
  const [myProgress, setMyProgress] = useState(null);   // 오늘 이미 완료했는지

  // 퀴즈 진행
  const [cardIdx, setCardIdx]   = useState(0);
  const [qIdx, setQIdx]         = useState(0);
  const [answers, setAnswers]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [finalResult, setFR]    = useState(null);
  const [saving, setSaving]     = useState(false);
  const [masteryMap, setMasteryMap]   = useState({});  // lessonKey → mastery 데이터
  const [allMastery, setAllMastery]   = useState({});  // 전체 mastery 캐시 (browse 화면용)
  const [minTimeLeft, setMinTimeLeft] = useState(0);  // 최소 응답 시간 남은 초 (5→0)
  const [consecWrong, setConsecWrong] = useState(0); // 연속 오답 횟수
  const [loadingElapsed, setLoadingElapsed]  = useState(0);  // 경과 시간(초)
  const [loadingMsgIdx,  setLoadingMsgIdx]   = useState(0);  // 순환 메시지 인덱스

  const [dailyCount, setDailyCount] = useState(0); // 오늘 완료 횟수
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

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

  // ── 단원 로드 ──────────────────────────────────────────────────
  useEffect(() => {
    if (!filterGrade) { setUnits([]); return; }
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
      setUnits(list);
    }).finally(() => setLU(false));
  }, [filterGrade, filterSem, filterPub]);

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

  // ── 차시 목록 진입 시 mastery 데이터 로드 ────────────────────
  useEffect(() => {
    if (step !== 'lessons' || !selectedUnit || !studentCode) return;
    const lessons = selectedUnit.lessons || [];
    if (!lessons.length) return;
    Promise.all(
      lessons.map(l => getDoc(doc(db, 'aiLessonMastery', `${studentCode}_${lessonKey(selectedUnit, l)}`)))
    ).then(docs => {
      const map = {};
      docs.forEach((d, i) => { if (d.exists()) map[lessonKey(selectedUnit, lessons[i])] = d.data(); });
      setMasteryMap(map);
    });
  }, [step, selectedUnit, studentCode]);

  // ── 차시 목록 진입 시 첫 번째 차시 프리로딩 (컴포넌트 내부 처리) ──
  useEffect(() => {
    if (step !== 'lessons' || !selectedUnit) return;
    const lessons = selectedUnit.lessons || [];
    if (lessons.length === 0) return;

    const runPreload = async (unit, lesson) => {
      const key = lessonKey(unit, lesson);
      if (preloadMap.has(key)) return;
      const promise = (async () => {
        try {
          const cacheDoc = await getDoc(doc(db, 'aiLessonContent', key));
          if (cacheDoc.exists() && !shouldRefreshLessonContent(cacheDoc.data())) return cacheDoc.data();
          return await fetchLessonContent(unit, lesson);
        } catch { return null; }
      })();
      preloadMap.set(key, promise);
    };

    runPreload(selectedUnit, lessons[0]);
    let t;
    if (lessons.length > 1) {
      t = setTimeout(() => runPreload(selectedUnit, lessons[1]), 1200);
    }
    return () => clearTimeout(t);
  }, [step, selectedUnit]);

  // ── 차시 선택 → AI 콘텐츠 로드/생성 후 바로 학습 시작 ──────
  const openLesson = async (unit, lesson) => {
    setUnit(unit); setLesson(lesson);
    setCardIdx(0); setQIdx(0);
    setAnswers([]); setSelected(null); setShowResult(false); setFR(null);
    setConsecWrong(0); setMinTimeLeft(0);
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
      const today = new Date().toISOString().slice(0, 10);
      const progressId = `${studentCode}_${key}`;

      // 1. 프리로드된 데이터 있으면 즉시 사용
      const preloaded = preloadMap.get(key);
      const [progDoc, preloadResult] = await Promise.all([
        getDoc(doc(db, 'aiStudentProgress', progressId)),
        preloaded || Promise.resolve(null),
      ]);
      if (progDoc.exists()) setMyProgress(progDoc.data());

      let data;
      if (preloadResult) {
        // 프리로드 성공 — 즉시 사용
        data = preloadResult;
        // Firestore에 없으면 저장
        if (data?.generatorVersion === COURSEWARE_QUALITY_VERSION) {
          setDoc(doc(db, 'aiLessonContent', key), {
            ...data, lessonKey: key,
            grade: unit.grade, semester: unit.semester,
            publisher: unit.publisher, unitId: unit.id, unitName: unit.unitName,
            lessonNo: lesson.no, lessonTitle: lesson.title,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true }).catch(() => {});
        }
      } else {
        // 2. Firestore 캐시 확인
        const cacheDoc = await getDoc(doc(db, 'aiLessonContent', key));
        if (cacheDoc.exists() && !shouldRefreshLessonContent(cacheDoc.data())) {
          data = cacheDoc.data();
        } else {
          // 3. 캐시 없으면 API 생성
          data = await fetchLessonContent(unit, lesson);
          if (!data) throw new Error('생성 실패');
          // 캐시 저장
          setDoc(doc(db, 'aiLessonContent', key), {
            ...data, lessonKey: key,
            grade: unit.grade, semester: unit.semester,
            publisher: unit.publisher, unitId: unit.id, unitName: unit.unitName,
            lessonNo: lesson.no, lessonTitle: lesson.title,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true }).catch(() => {});
        }
      }

      stepTimer.clear();
      setContent(pickSessionQuestions(data, key)); // 최근 문항을 피해서 선택
      setStep('concept');
    } catch (e) {
      stepTimer.clear();
      showToast('콘텐츠 로드에 실패했습니다. 다시 시도해주세요.', 'error');
      setStep('lessons');
      console.error(e);
    } finally { setCL(false); }
  };

  const startLearning = () => {
    setContent(prev => prev ? pickSessionQuestions(prev, prev.lessonKey || lessonKey(selectedUnit, selectedLesson)) : prev); // 재도전 시 새 문제 조합
    setCardIdx(0); setQIdx(0);
    setAnswers([]); setSelected(null); setShowResult(false); setFR(null);
    setConsecWrong(0); setMinTimeLeft(0);
    setStep('concept');
  };

  // ── 최소 응답 시간: 문제 바뀔 때마다 5초 카운트다운 ─────────
  useEffect(() => {
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
    if (selected === null || minTimeLeft > 0) return;
    const correct = selected === content.questions[qIdx].answerIndex;
    setAnswers(prev => [...prev, { questionIndex: qIdx, selectedIndex: selected, correct }]);
    setShowResult(true);

    // 연속 오답 카운터 업데이트
    if (!correct) {
      setConsecWrong(prev => prev + 1);
    } else {
      setConsecWrong(0); // 정답이면 리셋
    }
  };

  const nextQuestion = () => {
    const lastAnswer = answers[answers.length - 1];

    // 연속 2번 오답 → 개념 카드로 강제 복귀
    if (!lastAnswer?.correct && consecWrong >= 2) {
      setConsecWrong(0);
      setCardIdx(0);
      setStep('concept');
      return;
    }

    if (qIdx < content.questions.length - 1) {
      setQIdx(q => q + 1); setSelected(null); setShowResult(false);
    } else { finishQuiz(); }
  };

  // ── 완료 + 차등 보상 ──────────────────────────────────────────
  const finishQuiz = async () => {
    // answers에 이미 모든 답이 들어있음 (confirmAnswer가 마지막 답도 추가했으므로 중복 추가 X)
    const allAns = answers;
    const correctCount = allAns.filter(a => a.correct).length;
    const total        = content.questions.length;
    const score        = Math.round((correctCount / total) * 100);
    const today        = getSessionDate(); // KST 오전 8시 기준
    // 오늘 이미 보상 받은 차시인지 (같은 차시 재도전 시 보상 없음)
    const alreadyRewarded = myProgress?.date === today && myProgress?.rewarded;
    // 오늘 일일 한도 초과 여부
    const overLimit = dailyCount >= DAILY_LIMIT;
    const canReward = !alreadyRewarded && !overLimit;

    // 정답 수에 따른 차등 보상
    const reward = canReward ? calcReward(correctCount, total) : { exp: 0, gold: 0, diamonds: 0 };

    setSaving(true);
    try {
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

      // ── mastery 업데이트 (rolling best-5 평균) ───────────────
      const masteryId = `${studentCode}_${key}`;
      const prevMDoc  = await getDoc(doc(db, 'aiLessonMastery', masteryId));
      const prevM     = prevMDoc.exists() ? prevMDoc.data() : { scores: [], attemptCount: 0 };

      // 현재 보관 중인 점수 배열 (최대 5개)
      let scores = Array.isArray(prevM.scores) ? [...prevM.scores] : [];
      if (scores.length < 5) {
        scores.push(score);
      } else {
        // 5개 꽉 참 → 최저 점수보다 높으면 최저를 교체 (평균 하락 방지)
        const minScore = Math.min(...scores);
        if (score > minScore) {
          scores[scores.indexOf(minScore)] = score;
        }
      }

      const newCount       = (prevM.attemptCount || 0) + 1;
      const hasWindow      = scores.length === 5;
      const masteryAvg     = hasWindow ? Math.round(scores.reduce((a, b) => a + b, 0) / 5) : null;
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
      setMasteryMap(prev => ({ ...prev, [key]: masteryData }));
      setAllMastery(prev => ({ ...prev, [key]: masteryData }));

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
            await updateDoc(doc(db, 'studentPets', petId), { happiness: newHap, affection: newAff, lastCareAt: serverTimestamp() });
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
      const wrongAnswers = allAns
        .filter(a => !a.correct)
        .map(a => ({
          studentCode, grade: selectedUnit.grade, semester: selectedUnit.semester,
          unitName: selectedUnit.unitName, lessonTitle: selectedLesson.title,
          lessonKey: key,
          questionIdx: a.questionIndex,
          questionText: (content.questions[a.questionIndex]?.question || '').slice(0, 120),
          selectedIdx: a.selectedIndex,
          correctIdx: content.questions[a.questionIndex]?.answerIndex,
          completedAt: serverTimestamp(),
          date: today,
        }));
      if (wrongAnswers.length > 0) {
        wrongAnswers.forEach(wa => addDoc(collection(db, 'aiWrongAnswers'), wa).catch(() => {}));
      }

      // 일일 카운트 증가 (새로운 완료만)
      if (!alreadyRewarded) setDailyCount(prev => prev + 1);

      setFR({
        correctCount, total, score, reward, rewarded: canReward, alreadyRewarded, overLimit,
        attemptNo: newCount,
        masteryLevel: mastLevel,
        masteryAvg,
        scores,
        rewardLeft: Math.max(0, DAILY_LIMIT - newCount),
      });
      setStep('result');
    } catch (e) { console.error(e); showToast('저장 오류', 'error'); }
    finally { setSaving(false); }
  };

  const backToBrowse = () => { setStep('browse'); setUnit(null); setLesson(null); setContent(null); };
  const backToLessons = () => { setStep('lessons'); setCardIdx(0); setQIdx(0); setAnswers([]); setSelected(null); setShowResult(false); };

  const publishers = [...new Set(units.map(u => u.publisher).filter(Boolean))];

  // ══════════════════════════════════════════════════════════════
  // ── 단원 브라우즈 화면 ────────────────────────────────────────
  if (step === 'browse') return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🤖</span>
          <div>
            <h1 className="text-xl font-extrabold text-slate-100">AI 학습관</h1>
            <p className="text-sm text-slate-400">단원을 선택하면 AI가 개념 카드와 미니퀴즈를 바로 만들어줍니다.</p>
          </div>
        </div>
        {/* 오늘 남은 보상횟수 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`px-3 py-2 rounded-2xl text-center border ${dailyCount >= DAILY_LIMIT ? 'bg-rose-500/20 border-rose-500/30' : 'bg-indigo-500/20 border-indigo-500/30'}`}>
            <div className={`text-lg font-extrabold ${dailyCount >= DAILY_LIMIT ? 'text-rose-300' : 'text-indigo-300'}`}>
              {DAILY_LIMIT - dailyCount}/{DAILY_LIMIT}
            </div>
            <div className="text-[10px] text-slate-400">오늘 남은 보상횟수</div>
          </div>
          {dailyCount > 0 && (
            <button
              onClick={() => { if (window.confirm('오늘 보상 횟수를 초기화할까요?')) setDailyCount(0); }}
              title="보상 횟수 초기화"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-600 hover:text-white text-xs">
              ↺
            </button>
          )}
        </div>
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
        {/* 학년 select */}
        <select value={filterGrade} onChange={e => { setFG(e.target.value); setFP(''); }}
          className="bg-white text-slate-800 border-2 border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500">
          <option value="">학년 선택</option>
          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}학년</option>)}
        </select>

        {/* 학기 — 버튼 3개 */}
        <div className="flex rounded-xl overflow-hidden border-2 border-slate-700">
          {[['','전체학기'],['1','1학기'],['2','2학기']].map(([val, label]) => (
            <button key={val} onClick={() => setFS(val)}
              className={`px-4 py-2 text-sm font-bold transition-colors
                ${filterSem === val
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {publishers.length > 1 && (
          <select value={filterPub} onChange={e => setFP(e.target.value)}
            className="bg-white text-slate-800 border-2 border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500">
            <option value="">전체 출판사</option>
            {publishers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
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
            const palettes = [
              { from: 'from-blue-600',   to: 'to-indigo-700',  ring: 'ring-blue-500/30',   num: 'text-blue-200',   tag: 'bg-blue-500/30 text-blue-200' },
              { from: 'from-violet-600', to: 'to-purple-700',  ring: 'ring-violet-500/30', num: 'text-violet-200', tag: 'bg-violet-500/30 text-violet-200' },
              { from: 'from-emerald-600',to: 'to-teal-700',    ring: 'ring-emerald-500/30',num: 'text-emerald-200',tag: 'bg-emerald-500/30 text-emerald-200' },
              { from: 'from-rose-600',   to: 'to-pink-700',    ring: 'ring-rose-500/30',   num: 'text-rose-200',   tag: 'bg-rose-500/30 text-rose-200' },
              { from: 'from-amber-500',  to: 'to-orange-600',  ring: 'ring-amber-500/30',  num: 'text-amber-100',  tag: 'bg-amber-500/30 text-amber-100' },
              { from: 'from-sky-600',    to: 'to-cyan-700',    ring: 'ring-sky-500/30',    num: 'text-sky-200',    tag: 'bg-sky-500/30 text-sky-200' },
            ];
            const p = palettes[idx % palettes.length];
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
                  hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]
                  ring-2 ${p.ring} shadow-lg`}>

                {/* 배경 장식 */}
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10" />
                <div className="absolute -right-1 -bottom-3 w-12 h-12 rounded-full bg-white/10" />

                <div className="relative p-5">
                  {/* 단원 번호 + 단원명 + 차시 수 */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-baseline gap-2 flex-1 min-w-0 pr-2">
                      <span className={`text-2xl font-black opacity-50 leading-none shrink-0 ${p.num}`}>
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
                        <div className="text-white/80 text-[10px] font-bold">{unitMastery.started}/{unitMastery.total}차시 진행중</div>
                        {unitMastery.done > 0 && (
                          <div className="text-white/50 text-[9px]">{unitMastery.done}개 숙달도 완료</div>
                        )}
                        <div className="text-white/35 text-[9px]">{unitMastery.total - unitMastery.done}개 더 완료 시 수준 표시</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2"><span className="text-white/30 text-[10px]">미시작</span></div>
                  )}

                  {/* 하단 정보 */}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-white/50 text-xs font-medium">
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
        <div className="grid grid-cols-2 gap-4">
          {['1','2'].map(sem => {
            const semUnits = units.filter(u => !u.semester || String(u.semester) === sem);
            return (
              <div key={sem}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2 h-6 rounded-full ${sem === '1' ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                  <span className="font-extrabold text-white text-base">{sem}학기</span>
                  <span className="text-slate-500 text-xs">{semUnits.length}단원</span>
                </div>
                <div className="space-y-2">
                  {semUnits.length === 0 ? (
                    <div className="text-center py-8 text-slate-600 text-sm">단원 없음</div>
                  ) : semUnits.map((unit, idx) => {
                    const palettes = [
                      { from: 'from-blue-600',    to: 'to-indigo-700',   ring: 'ring-blue-500/30',    tag: 'bg-blue-500/30 text-blue-200' },
                      { from: 'from-violet-600',  to: 'to-purple-700',   ring: 'ring-violet-500/30',  tag: 'bg-violet-500/30 text-violet-200' },
                      { from: 'from-emerald-600', to: 'to-teal-700',     ring: 'ring-emerald-500/30', tag: 'bg-emerald-500/30 text-emerald-200' },
                      { from: 'from-rose-600',    to: 'to-pink-700',     ring: 'ring-rose-500/30',    tag: 'bg-rose-500/30 text-rose-200' },
                      { from: 'from-amber-500',   to: 'to-orange-600',   ring: 'ring-amber-500/30',   tag: 'bg-amber-500/30 text-amber-100' },
                      { from: 'from-sky-600',     to: 'to-cyan-700',     ring: 'ring-sky-500/30',     tag: 'bg-sky-500/30 text-sky-200' },
                    ];
                    const p = palettes[idx % palettes.length];
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
                          hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]
                          ring-2 ${p.ring} shadow-md`}>
                        <div className="absolute -right-3 -top-3 w-14 h-14 rounded-full bg-white/10" />
                        <div className="relative p-3.5">
                          <div className="flex items-start justify-between mb-1.5">
                            <div className="flex items-baseline gap-1.5 flex-1 min-w-0 pr-1">
                              <span className="text-white/40 font-black text-lg leading-none shrink-0">{unit.unitNumber}</span>
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
                                <div className="text-white/70 text-[9px] font-bold">{unitMastery2.started}/{unitMastery2.total} 진행중</div>
                                {unitMastery2.done > 0 && <div className="text-white/40 text-[8px]">{unitMastery2.done}개 완료</div>}
                              </div>
                            </div>
                          ) : (
                            <div className="text-white/30 text-[9px] mt-1">미시작</div>
                          )}
                          <div className="text-white/50 text-[10px] mt-1 flex justify-between">
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
  if (step === 'lessons' && selectedUnit) return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={backToBrowse} className="flex items-center gap-1.5 text-sm font-bold text-indigo-400 hover:text-indigo-200 mb-5">
        ← {filterGrade}학년 수학 단원 목록
      </button>
      <div className="bg-indigo-900/40 border border-indigo-700 rounded-2xl px-5 py-4 mb-5">
        <div className="text-xs font-bold text-indigo-400 mb-0.5">{selectedUnit.grade}학년 {selectedUnit.semester ? `${selectedUnit.semester}학기 ` : ''}수학</div>
        <h2 className="text-xl font-extrabold text-white">{selectedUnit.unitNumber ? `${selectedUnit.unitNumber}단원 ` : ''}{selectedUnit.unitName}</h2>
        <p className="text-xs text-indigo-300 mt-0.5">{(selectedUnit.lessons || []).length}개 차시 · 차시를 눌러 AI 학습을 시작하세요</p>
      </div>

      {/* 차시 목록 — 클릭 즉시 학습 시작 */}
      <div className="space-y-2">
        {(selectedUnit.lessons || []).length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <p className="font-bold">이 단원에 등록된 차시가 없습니다</p>
          </div>
        ) : (selectedUnit.lessons || []).map(lesson => (
          <div key={lesson.no} className="relative group/row">
            <button
              onClick={() => openLesson(selectedUnit, lesson)}
              className="w-full text-left rounded-xl border-2 border-slate-700 bg-slate-800/50 hover:border-indigo-500 hover:bg-indigo-900/40 px-4 py-3.5 transition-all group pr-12">
              <div className="flex items-center gap-3">
                <span className="text-xs font-extrabold w-14 shrink-0 text-indigo-400 group-hover:text-indigo-300">
                  {lesson.no}차시
                </span>
                <span className="text-sm font-bold flex-1 text-slate-200 group-hover:text-white">
                  {lesson.title}
                </span>
                <span className="text-indigo-500 group-hover:text-indigo-300 text-sm font-bold shrink-0">▶</span>
              </div>
              {(lesson.keywords || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5 pl-[68px]">
                  {lesson.keywords.slice(0, 3).map(k => (
                    <span key={k} className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full">{k}</span>
                  ))}
                </div>
              )}
              {/* mastery 배지 */}
              {(() => {
                const m = masteryMap[lessonKey(selectedUnit, lesson)];
                if (!m) return <div className="mt-1 pl-[68px]"><span className="text-[10px] text-slate-600">미도전</span></div>;
                const done = (m.scores?.length || 0);
                if (done < 5) {
                  return (
                    <div className="flex items-center gap-2 mt-1 pl-[68px] flex-wrap">
                      <span className="text-[10px] text-slate-500 shrink-0">{done}/5 도전 중</span>
                      <div className="flex gap-1 items-center">
                        {(m.scores || []).map((s, i) => (
                          <span key={i} className={`text-[10px] font-bold px-1.5 py-0.5 rounded
                            ${s >= 90 ? 'bg-amber-100 text-amber-700' : s >= 75 ? 'bg-sky-100 text-sky-700' : s >= 60 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                            {s}
                          </span>
                        ))}
                        {Array.from({ length: 5 - done }, (_, i) => (
                          <span key={`e${i}`} className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-700">?</span>
                        ))}
                      </div>
                    </div>
                  );
                }
                const cfg = MASTERY[m.masteryLevel] || MASTERY.retry;
                return (
                  <div className="flex items-center gap-2 mt-1 pl-[68px]">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.emoji} {cfg.label}</span>
                    <span className="text-[10px] text-slate-400">평균 {m.masteryAvg}점</span>
                    <span className="text-[10px] text-slate-500">{m.attemptCount}회</span>
                  </div>
                );
              })()}
            </button>
            {/* 캐시 삭제 후 재생성 버튼 */}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const key = lessonKey(selectedUnit, lesson);
                try { await deleteDoc(doc(db, 'aiLessonContent', key)); } catch {}
                preloadMap.delete(key);
                openLesson(selectedUnit, lesson);
              }}
              title="콘텐츠 다시 생성"
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 transition-opacity w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-amber-600 text-slate-300 hover:text-white text-base"
            >↻</button>
          </div>
        ))}
      </div>

      {toast && <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} text-white`} style={{ whiteSpace: 'nowrap' }}>{toast.msg}</div>}
    </div>
  );

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

      </div>
    </div>
  );

  if (!content || !selectedUnit || !selectedLesson) return null;
  const currentCard = content.conceptCards?.[cardIdx];
  const currentQ    = content.questions?.[qIdx];

  // ══════════════════════════════════════════════════════════════
  // ── 개념 카드 화면 (2배 크기) ─────────────────────────────────
  if (step === 'concept') return (
    <div className="min-h-screen bg-gradient-to-b from-sky-950 to-slate-900 flex flex-col p-4 md:p-8">
      <div className="max-w-3xl w-full mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button onClick={backToLessons} className="text-white/50 hover:text-white text-sm font-bold">← {selectedLesson.no}차시 목록</button>
          <span className="text-white/40 text-sm">{cardIdx + 1} / {content.conceptCards.length}</span>
        </div>

        {/* 연속 오답으로 복귀한 경우 안내 배너 */}
        {answers.length > 0 && consecWrong === 0 && (
          <div className="bg-amber-500/20 border border-amber-400/40 rounded-2xl px-4 py-3 flex items-center gap-2">
            <span className="text-xl">📖</span>
            <div>
              <p className="text-amber-200 text-sm font-bold">개념을 다시 확인해봐요!</p>
              <p className="text-amber-300/60 text-xs">2문제 연속 오답으로 돌아왔어요. 개념 카드를 잘 읽고 다시 도전!</p>
            </div>
          </div>
        )}

        {/* 진행 바 */}
        <div className="flex items-center gap-2">
          {content.conceptCards.map((_, i) => (
            <div key={i} className={`flex-1 h-2 rounded-full transition-colors ${i <= cardIdx ? 'bg-sky-400' : 'bg-white/20'}`} />
          ))}
        </div>

        {/* 개념 카드 — 크게 */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📖</span>
            <h3 className="font-extrabold text-sky-800 text-2xl leading-snug">{currentCard.title}</h3>
          </div>
          <p className="text-slate-700 text-lg leading-relaxed">{currentCard.body}</p>
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
        <div className="flex gap-3">
          {cardIdx > 0 && (
            <button onClick={() => setCardIdx(i => i - 1)}
              className="flex-1 py-5 bg-white/20 hover:bg-white/30 text-white font-bold text-lg rounded-2xl border border-white/30">
              ← 이전
            </button>
          )}
          <button
            onClick={() => {
              if (cardIdx < content.conceptCards.length - 1) setCardIdx(i => i + 1);
              else { setStep('quiz'); setQIdx(0); setSelected(null); setShowResult(false); }
            }}
            className="flex-1 py-5 bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-xl rounded-2xl shadow-lg">
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
      {/* 진행 바 */}
      <div className="flex items-center gap-2 mb-2 max-w-3xl w-full mx-auto">
        {content.questions.map((_, i) => (
          <div key={i} className={`flex-1 h-2 rounded-full transition-colors
            ${i < answers.length ? (answers[i]?.correct ? 'bg-emerald-400' : 'bg-rose-400') : i === qIdx ? 'bg-white/60' : 'bg-white/20'}`} />
        ))}
      </div>
      <div className="text-white/50 text-sm text-center mb-4">{qIdx + 1} / {content.questions.length}문항</div>

      <div className="max-w-3xl w-full mx-auto flex-1 flex flex-col gap-4">
        {/* 문제 카드 — 크게 */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl font-extrabold text-emerald-600 shrink-0 mt-0.5">Q{qIdx + 1}.</span>
            <p className="text-slate-800 font-bold text-2xl leading-snug">{renderMath(currentQ.question)}</p>
          </div>
          <TableRenderer table={currentQ.table} />
          <ShapeRenderer shape={currentQ.shape} />

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
                  className={`w-full text-left px-6 py-4 rounded-2xl text-lg transition-all ${cls}`}>
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
        </div>

        {/* 확인/다음 버튼 */}
        {!showResult ? (
          <button
            onClick={confirmAnswer}
            disabled={selected === null || minTimeLeft > 0}
            className={`w-full py-5 font-extrabold text-xl rounded-2xl shadow-lg transition-all
              ${minTimeLeft > 0
                ? 'bg-slate-600 text-slate-300 cursor-not-allowed'
                : selected === null
                  ? 'bg-emerald-500 text-white opacity-40'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white'}`}>
            {minTimeLeft > 0
              ? `문제를 읽어보세요 (${minTimeLeft}초)`
              : '정답 확인'}
          </button>
        ) : (
          <>
            {/* 연속 2번 오답 경고 */}
            {!answers[answers.length-1]?.correct && consecWrong >= 2 && (
              <div className="bg-rose-900/40 border border-rose-500/50 rounded-2xl px-4 py-3 text-center">
                <p className="text-rose-300 text-sm font-bold">⚠️ 연속 2번 틀렸어요</p>
                <p className="text-rose-400/70 text-xs mt-0.5">개념 카드를 다시 읽어볼게요</p>
              </div>
            )}
            <button onClick={nextQuestion} disabled={saving}
              className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xl rounded-2xl disabled:opacity-40 shadow-lg">
              {saving ? '저장 중...'
                : !answers[answers.length-1]?.correct && consecWrong >= 2
                  ? '📖 개념 카드 다시 보기'
                  : qIdx < content.questions.length - 1 ? '다음 문제 →' : '결과 보기 →'}
            </button>
          </>
        )}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // ── 결과 화면 ────────────────────────────────────────────────
  if (step === 'result' && finalResult) return (
    <div className="min-h-screen bg-gradient-to-b from-violet-950 to-slate-900 flex items-center justify-center p-6">
      {finalResult.score >= 60 && <ConfettiCanvas />}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className={`px-6 py-8 text-center ${finalResult.score >= 80 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : finalResult.score >= 60 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-slate-600 to-slate-700'}`}>
          <div className="text-5xl mb-2">{finalResult.score >= 80 ? '🏆' : finalResult.score >= 60 ? '👍' : '💪'}</div>
          <div className="text-4xl font-extrabold text-white mb-1">{finalResult.score}점</div>
          <p className="text-white/80 text-sm">{finalResult.correctCount}/{finalResult.total}문항 정답</p>
          <p className="text-white/60 text-xs mt-0.5">{selectedUnit.unitName} · {selectedLesson.title}</p>
        </div>
        <div className="p-6 space-y-4">
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
            if (done < 5) {
              return (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                  <div className="text-xs text-slate-500 mb-2">{finalResult.attemptNo}번째 도전 · 숙달도 평가까지 <span className="font-bold text-indigo-600">{5 - done}회</span> 남음</div>
                  <div className="flex justify-center gap-1.5">
                    {(finalResult.scores || []).map((s, i) => (
                      <div key={i} className="text-center">
                        <div className="w-8 h-8 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">{s}</div>
                        <div className="text-[9px] text-slate-400 mt-0.5">{i + 1}회</div>
                      </div>
                    ))}
                    {Array.from({ length: 5 - done }, (_, i) => (
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
                <div className="text-xs text-slate-500 mb-1.5">{finalResult.attemptNo}번째 도전 · 5회 점수 평균</div>
                <span className={`inline-flex items-center gap-1 text-sm font-extrabold px-3 py-1 rounded-full ${cfg.cls}`}>
                  {cfg.emoji} {cfg.label}
                </span>
                <div className="text-base font-extrabold text-slate-700 mt-2">{finalResult.masteryAvg}점</div>
                <div className="flex justify-center gap-1 mt-2">
                  {(finalResult.scores || []).map((s, i) => (
                    <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${s === score ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{s}</span>
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
              const ans = answers[i] || { correct: false };
              return (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${ans.correct ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                  <span className="font-extrabold shrink-0">{ans.correct ? '✅' : '❌'} Q{i+1}</span>
                  <span className="line-clamp-1 text-xs">{q.question}</span>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3">
            <button onClick={backToLessons}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-sm">
              다른 차시 보기
            </button>
            <button onClick={startLearning}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-sm">
              다시 풀기
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return null;
}
