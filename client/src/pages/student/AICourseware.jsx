import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { renderMath, TableRenderer } from '../../utils/renderMath';
import ShapeRenderer from '../../components/ShapeRenderer';

const MAX_REWARD = { exp: 30, gold: 20, diamonds: 10 }; // 최대 보상 (정답률 100%)
const DAILY_LIMIT = 5;                                   // 하루 최대 횟수
const getMaxExp = (lv) => lv <= 10 ? 100 : lv <= 30 ? 500 : lv <= 40 ? 700 : lv <= 50 ? 900 : lv <= 60 ? 1100 : lv <= 70 ? 1300 : lv <= 80 ? 1500 : lv <= 90 ? 1700 : 1900;

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

// 차시별 캐시 키
const lessonKey = (unit, lesson) =>
  `${unit.grade}_${unit.semester || 0}_${unit.publisher || 'default'}_${unit.id}_${lesson.no}`;

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

  const [dailyCount, setDailyCount] = useState(0); // 오늘 완료 횟수
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // ── 학생 로드 + 학년 즉시 자동 설정 ─────────────────────────
  useEffect(() => {
    if (!studentCode) return;
    // studentCode에서 학년 추출 (예: SINSEOK-5-01 → 5학년)
    const detectedGrade = gradeFromCode(studentCode);
    if (detectedGrade) setFG(detectedGrade);

    const today = new Date().toISOString().slice(0, 10);
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

  // ── 차시 선택 → AI 콘텐츠 로드/생성 후 바로 학습 시작 ──────
  const openLesson = async (unit, lesson) => {
    // 하루 최대 횟수 체크
    if (dailyCount >= DAILY_LIMIT) {
      showToast(`오늘 AI 학습은 최대 ${DAILY_LIMIT}번까지 가능합니다. 내일 다시 도전하세요!`, 'error');
      return;
    }
    setUnit(unit); setLesson(lesson);
    setCardIdx(0); setQIdx(0);
    setAnswers([]); setSelected(null); setShowResult(false); setFR(null);
    setCL(true); setContent(null); setMyProgress(null);
    setStep('loading'); // 로딩 전용 화면으로 먼저 이동
    const key = lessonKey(unit, lesson);

    try {
      // 1. 내 오늘 진행 기록 확인
      const today = new Date().toISOString().slice(0, 10);
      const progressId = `${studentCode}_${key}`;
      const [progDoc, cacheDoc] = await Promise.all([
        getDoc(doc(db, 'aiStudentProgress', progressId)),
        getDoc(doc(db, 'aiLessonContent', key)),
      ]);
      if (progDoc.exists()) setMyProgress(progDoc.data());

      let data;
      if (cacheDoc.exists()) {
        // 2. 캐시 있으면 바로 사용
        data = cacheDoc.data();
      } else {
        // 3. 캐시 없으면 AI 생성
        const res = await fetch('/api/generate-courseware', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grade: unit.grade, semester: unit.semester,
            publisher: unit.publisher || '국정',
            unitName: unit.unitName,
            lessonNo: lesson.no, lessonTitle: lesson.title,
            learningGoal: lesson.learningGoal || '',
            keywords: lesson.keywords || [],
            difficulty: 'normal', questionCount: 5,
          }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || '생성 실패');

        // 4. 캐시 저장
        await setDoc(doc(db, 'aiLessonContent', key), {
          ...data, lessonKey: key,
          grade: unit.grade, semester: unit.semester,
          publisher: unit.publisher, unitId: unit.id, unitName: unit.unitName,
          lessonNo: lesson.no, lessonTitle: lesson.title,
          createdAt: serverTimestamp(),
        });
      }

      setContent(data);
      setStep('concept'); // 바로 개념 카드로!
    } catch (e) {
      showToast('콘텐츠 로드에 실패했습니다. 다시 시도해주세요.', 'error');
      setStep('lessons');
      console.error(e);
    } finally { setCL(false); }
  };

  const startLearning = () => {
    setCardIdx(0); setQIdx(0);
    setAnswers([]); setSelected(null); setShowResult(false); setFR(null);
    setStep('concept');
  };

  // ── 퀴즈 ──────────────────────────────────────────────────────
  const confirmAnswer = () => {
    if (selected === null) return;
    const correct = selected === content.questions[qIdx].answerIndex;
    setAnswers(prev => [...prev, { questionIndex: qIdx, selectedIndex: selected, correct }]);
    setShowResult(true);
  };

  const nextQuestion = () => {
    if (qIdx < content.questions.length - 1) {
      setQIdx(q => q + 1); setSelected(null); setShowResult(false);
    } else { finishQuiz(); }
  };

  // ── 완료 + 차등 보상 ──────────────────────────────────────────
  const finishQuiz = async () => {
    const allAns = [...answers, { questionIndex: qIdx, selectedIndex: selected, correct: selected === content.questions[qIdx].answerIndex }];
    const correctCount = allAns.filter(a => a.correct).length;
    const total        = content.questions.length;
    const score        = Math.round((correctCount / total) * 100);
    const today        = new Date().toISOString().slice(0, 10);
    // 오늘 이미 보상 받은 차시인지 (같은 차시 재도전 시 보상 없음)
    const alreadyRewarded = myProgress?.date === today && myProgress?.rewarded;
    // 하루 한도 초과 시 보상 없음
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

      // 일일 카운트 증가 (새로운 완료만)
      if (!alreadyRewarded) setDailyCount(prev => prev + 1);

      setFR({ correctCount, total, score, reward, rewarded: canReward, alreadyRewarded, overLimit });
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
        {/* 오늘 남은 횟수 */}
        <div className={`shrink-0 px-3 py-2 rounded-2xl text-center border ${dailyCount >= DAILY_LIMIT ? 'bg-rose-500/20 border-rose-500/30' : 'bg-indigo-500/20 border-indigo-500/30'}`}>
          <div className={`text-lg font-extrabold ${dailyCount >= DAILY_LIMIT ? 'text-rose-300' : 'text-indigo-300'}`}>
            {DAILY_LIMIT - dailyCount}/{DAILY_LIMIT}
          </div>
          <div className="text-[10px] text-slate-400">오늘 남은 횟수</div>
        </div>
      </div>

      {/* 필터 — 명시적 배경/글자색 */}
      <div className="flex gap-2 flex-wrap mb-5">
        <select value={filterGrade} onChange={e => { setFG(e.target.value); setFP(''); }}
          className="bg-white text-slate-800 border-2 border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500">
          <option value="">학년 선택</option>
          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}학년</option>)}
        </select>
        <select value={filterSem} onChange={e => setFS(e.target.value)}
          className="bg-white text-slate-800 border-2 border-slate-300 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500">
          <option value="">전체 학기</option>
          <option value="1">1학기</option>
          <option value="2">2학기</option>
        </select>
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
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {units.map(unit => (
            <button key={unit.id}
              onClick={() => { setUnit(unit); setStep('lessons'); setLesson(null); setContent(null); }}
              className="bg-slate-800/60 border-2 border-slate-700 hover:border-indigo-400 hover:bg-indigo-900/40 hover:shadow-lg p-4 text-left transition-all group rounded-2xl">
              <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                {['📐','📏','➗','✖️','📍','🔢','📊','🔷','🔵','🔶','🟰','📉'][((unit.unitNumber || 1) - 1) % 12]}
              </div>
              <div className="text-[10px] font-bold text-indigo-400 mb-0.5">
                {unit.unitNumber ? `${unit.unitNumber}단원` : ''} {unit.semester ? `${unit.semester}학기` : ''}
              </div>
              <div className="font-extrabold text-white text-sm leading-snug">{unit.unitName}</div>
              <div className="text-[10px] text-slate-400 mt-1">{(unit.lessons || []).length}차시</div>
            </button>
          ))}
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
          <button key={lesson.no}
            onClick={() => openLesson(selectedUnit, lesson)}
            className="w-full text-left rounded-xl border-2 border-slate-700 bg-slate-800/50 hover:border-indigo-500 hover:bg-indigo-900/40 px-4 py-3.5 transition-all group">
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
          </button>
        ))}
      </div>

      {toast && <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} text-white`} style={{ whiteSpace: 'nowrap' }}>{toast.msg}</div>}
    </div>
  );

  // ── 로딩 화면 ────────────────────────────────────────────────
  if (step === 'loading') return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 flex items-center justify-center p-6">
      <div className="text-center space-y-5">
        <div className="w-16 h-16 border-4 border-indigo-300/30 border-t-indigo-400 rounded-full animate-spin mx-auto" />
        <div>
          <p className="text-white font-extrabold text-lg">AI가 학습 콘텐츠를 만드는 중...</p>
          <p className="text-indigo-300 text-sm mt-1">{selectedUnit?.unitName} · {selectedLesson?.title}</p>
          <p className="text-indigo-400/60 text-xs mt-2">처음 학습은 10~15초가 걸릴 수 있습니다</p>
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
                  {renderMath(opt)}
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
          <button onClick={confirmAnswer} disabled={selected === null}
            className="w-full py-5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xl rounded-2xl disabled:opacity-40 shadow-lg">
            정답 확인
          </button>
        ) : (
          <button onClick={nextQuestion} disabled={saving}
            className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xl rounded-2xl disabled:opacity-40 shadow-lg">
            {saving ? '저장 중...' : qIdx < content.questions.length - 1 ? '다음 문제 →' : '결과 보기 →'}
          </button>
        )}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // ── 결과 화면 ────────────────────────────────────────────────
  if (step === 'result' && finalResult) return (
    <div className="min-h-screen bg-gradient-to-b from-violet-950 to-slate-900 flex items-center justify-center p-6">
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
          {finalResult.alreadyRewarded && (
            <p className="text-center text-xs text-slate-400">오늘 이미 이 차시 보상을 받았습니다.</p>
          )}
          {finalResult.overLimit && !finalResult.alreadyRewarded && (
            <p className="text-center text-xs text-rose-400">오늘 {DAILY_LIMIT}회 한도를 모두 사용했습니다.</p>
          )}

          <div className="space-y-1.5">
            {content.questions.map((q, i) => {
              const ans = answers[i] || { correct: selected === q.answerIndex };
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
