import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, doc,
  query, where, serverTimestamp, getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';

const getMaxExp = (lv) => lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;

export default function AICourseware({ studentCode }) {
  const [student, setStudent]       = useState(null);
  const [sets, setSets]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeSet, setActiveSet]   = useState(null);  // 현재 학습 중인 세트
  const [contents, setContents]     = useState(null);  // aiCourseContents
  const [progress, setProgress]     = useState(null);  // 기존 진행 기록

  // 학습 진행 상태
  const [step, setStep]     = useState('list'); // 'list' | 'intro' | 'concept' | 'quiz' | 'result'
  const [cardIdx, setCardIdx]   = useState(0);
  const [qIdx, setQIdx]         = useState(0);
  const [answers, setAnswers]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [finalResult, setFinalResult] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState(null);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // ── 학생 데이터 로드 ──────────────────────────────────────────
  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
        if (!snap.empty) setStudent({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch (e) { console.error(e); }
    })();
  }, [studentCode]);

  // ── 발행된 학습 세트 로드 ──────────────────────────────────────
  useEffect(() => {
    if (!student) return;
    (async () => {
      try {
        const setsSnap = await getDocs(query(
          collection(db, 'aiCourseSets'),
          where('teacherUid', '==', student.teacherUid),
          where('status', '==', 'published'),
        ));
        const allSets = setsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 내 진행 기록 조회
        const progressSnap = await getDocs(query(
          collection(db, 'aiCourseProgress'),
          where('studentCode', '==', studentCode),
        ));
        const myProgress = {};
        progressSnap.docs.forEach(d => { myProgress[d.data().courseSetId] = { id: d.id, ...d.data() }; });

        setSets(allSets.map(s => ({ ...s, myProgress: myProgress[s.id] || null })));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [student]);

  // ── 학습 시작 ─────────────────────────────────────────────────
  const startLearning = async (set) => {
    try {
      const contSnap = await getDocs(query(collection(db, 'aiCourseContents'), where('courseSetId', '==', set.id)));
      if (contSnap.empty) { showToast('학습 콘텐츠를 불러올 수 없습니다.', 'error'); return; }
      const cont = { id: contSnap.docs[0].id, ...contSnap.docs[0].data() };
      setContents(cont);
      setActiveSet(set);
      setProgress(set.myProgress);
      setCardIdx(0); setQIdx(0);
      setAnswers([]); setSelected(null); setShowResult(false); setFinalResult(null);
      setStep('intro');
    } catch (e) { showToast('오류가 발생했습니다.', 'error'); console.error(e); }
  };

  // ── 퀴즈 답 선택 ─────────────────────────────────────────────
  const selectAnswer = (optIdx) => {
    if (showResult) return;
    setSelected(optIdx);
  };

  const confirmAnswer = () => {
    if (selected === null) return;
    const correct = selected === contents.questions[qIdx].answerIndex;
    setAnswers(prev => [...prev, { questionIndex: qIdx, selectedIndex: selected, correct }]);
    setShowResult(true);
  };

  const nextQuestion = () => {
    if (qIdx < contents.questions.length - 1) {
      setQIdx(q => q + 1);
      setSelected(null);
      setShowResult(false);
    } else {
      finishQuiz();
    }
  };

  // ── 퀴즈 완료 + 보상 ─────────────────────────────────────────
  const finishQuiz = async () => {
    const allAnswers = [...answers, { questionIndex: qIdx, selectedIndex: selected, correct: selected === contents.questions[qIdx].answerIndex }];
    const correctCount = allAnswers.filter(a => a.correct).length;
    const totalCount   = contents.questions.length;
    const score        = Math.round((correctCount / totalCount) * 100);
    const reward       = activeSet.reward || { exp: 30, gold: 20, diamonds: 0 };
    const bonusGold    = score >= 80 ? 10 : 0;
    const bonusExp     = score >= 80 ? 20 : 0;

    setSaving(true);
    try {
      // 이미 보상 받은 경우 보상 미지급
      const alreadyRewarded = progress?.rewarded;

      if (!alreadyRewarded && student) {
        let newExp = (student.exp || 0) + reward.exp + bonusExp;
        let newLv  = student.level || 1;
        while (newExp >= getMaxExp(newLv)) { newExp -= getMaxExp(newLv); newLv++; }
        await updateDoc(doc(db, 'students', student.id), {
          gold:     (student.gold     || 0) + reward.gold + bonusGold,
          diamonds: (student.diamonds || 0) + (reward.diamonds || 0),
          exp: newExp, level: newLv,
        });
        setStudent(prev => ({ ...prev, gold: (prev.gold||0)+reward.gold+bonusGold, diamonds: (prev.diamonds||0)+(reward.diamonds||0), exp: newExp, level: newLv }));
      }

      // 진행 기록 저장/업데이트
      const progressData = {
        courseSetId: activeSet.id, studentCode,
        studentId: student?.id, status: 'completed',
        correctCount, totalCount, score,
        rewarded: !alreadyRewarded,
        completedAt: serverTimestamp(),
        answers: allAnswers,
      };

      if (progress?.id) {
        await updateDoc(doc(db, 'aiCourseProgress', progress.id), { ...progressData, rewarded: !alreadyRewarded });
      } else {
        await addDoc(collection(db, 'aiCourseProgress'), progressData);
      }

      setFinalResult({ correctCount, totalCount, score, rewarded: !alreadyRewarded, reward, bonusGold, bonusExp });
      setStep('result');

      // 목록 업데이트
      setSets(prev => prev.map(s => s.id === activeSet.id
        ? { ...s, myProgress: { ...progressData, rewarded: !alreadyRewarded } } : s
      ));
    } catch (e) { console.error(e); showToast('저장 중 오류가 발생했습니다.', 'error'); }
    finally { setSaving(false); }
  };

  const backToList = () => { setStep('list'); setActiveSet(null); setContents(null); };

  // ── 목록 화면 ─────────────────────────────────────────────────
  if (step === 'list') return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🤖</span>
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">AI 학습관</h1>
          <p className="text-sm text-slate-500">AI가 만든 맞춤 학습 세트로 개념을 익히고 퀴즈를 풀어보세요!</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-sm text-slate-400">불러오는 중...</span>
        </div>
      ) : sets.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <div className="text-5xl mb-3">📭</div>
          <p className="font-bold text-slate-600">아직 발행된 AI 학습이 없습니다</p>
          <p className="text-sm mt-1">선생님이 AI 학습 세트를 발행하면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sets.map(set => {
            const done = set.myProgress?.status === 'completed';
            const score = set.myProgress?.score;
            return (
              <div key={set.id} className={`rounded-2xl border-2 p-4 shadow-sm transition-all
                ${done ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0
                    ${done ? 'bg-emerald-100' : 'bg-indigo-100'}`}>
                    {done ? '✅' : '🤖'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-extrabold text-slate-800">{set.title}</span>
                      {done && score !== undefined && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                          ${score >= 80 ? 'bg-emerald-100 text-emerald-700' : score >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-600'}`}>
                          {score}점
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{set.grade}학년 {set.semester ? `${set.semester}학기 ` : ''}수학 · {set.unitName}</p>
                    {set.lessonTitle && <p className="text-xs text-indigo-500 font-bold mt-0.5">{set.lessonTitle}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      <span>⭐ {set.reward?.exp} EXP</span>
                      <span>🪙 {set.reward?.gold}G</span>
                      {set.reward?.diamonds > 0 && <span>💎 {set.reward?.diamonds}</span>}
                      {done && <span className="text-slate-400">· 재도전 가능 (보상 1회)</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => startLearning(set)}
                    className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-colors
                      ${done ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
                    {done ? '다시 풀기' : '학습 시작'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>{toast.msg}</div>
      )}
    </div>
  );

  if (!activeSet || !contents) return null;

  const currentCard = contents.conceptCards?.[cardIdx];
  const currentQ    = contents.questions?.[qIdx];

  // ── 인트로 화면 ──────────────────────────────────────────────
  if (step === 'intro') return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-8 text-center">
          <div className="text-5xl mb-3">🤖</div>
          <h2 className="text-xl font-extrabold text-white mb-1">{activeSet.title}</h2>
          <p className="text-indigo-200 text-sm">{activeSet.grade}학년 {activeSet.semester ? `${activeSet.semester}학기 ` : ''}수학</p>
          <p className="text-indigo-100 text-sm mt-0.5">{activeSet.unitName} {activeSet.lessonTitle ? `· ${activeSet.lessonTitle}` : ''}</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4 text-center">
            <div className="flex-1 bg-sky-50 rounded-2xl p-4 border border-sky-200">
              <div className="text-2xl mb-1">📖</div>
              <div className="text-xs font-bold text-sky-700">개념 카드</div>
              <div className="text-lg font-extrabold text-sky-800">{contents.conceptCards?.length}장</div>
            </div>
            <div className="flex-1 bg-emerald-50 rounded-2xl p-4 border border-emerald-200">
              <div className="text-2xl mb-1">📝</div>
              <div className="text-xs font-bold text-emerald-700">미니퀴즈</div>
              <div className="text-lg font-extrabold text-emerald-800">{contents.questions?.length}문항</div>
            </div>
            <div className="flex-1 bg-amber-50 rounded-2xl p-4 border border-amber-200">
              <div className="text-2xl mb-1">⭐</div>
              <div className="text-xs font-bold text-amber-700">보상</div>
              <div className="text-sm font-extrabold text-amber-800">{activeSet.reward?.exp}EXP</div>
            </div>
          </div>
          <p className="text-xs text-slate-400 text-center">80점 이상 시 추가 보상 +20EXP / +10G</p>
          <button onClick={() => setStep('concept')}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-lg rounded-2xl">
            개념 카드 보기 →
          </button>
          <button onClick={backToList} className="w-full py-2 text-slate-400 hover:text-slate-600 text-sm font-bold">← 목록으로</button>
        </div>
      </div>
    </div>
  );

  // ── 개념 카드 화면 ────────────────────────────────────────────
  if (step === 'concept') return (
    <div className="min-h-screen bg-gradient-to-b from-sky-950 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        {/* 진행 표시 */}
        <div className="flex items-center gap-2 mb-2">
          {contents.conceptCards.map((_, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${i <= cardIdx ? 'bg-sky-400' : 'bg-white/20'}`} />
          ))}
        </div>
        <div className="text-white/60 text-xs text-center">{cardIdx + 1} / {contents.conceptCards.length}</div>

        {/* 카드 */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📖</span>
            <h3 className="font-extrabold text-sky-800 text-lg">{currentCard.title}</h3>
          </div>
          <p className="text-slate-700 text-sm leading-relaxed">{currentCard.body}</p>
          {currentCard.example && (
            <div className="bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3">
              <div className="text-xs font-bold text-sky-600 mb-1">💡 예시</div>
              <p className="text-sm text-slate-700">{currentCard.example}</p>
            </div>
          )}
        </div>

        {/* 자주 틀리는 포인트 (마지막 카드) */}
        {cardIdx === contents.conceptCards.length - 1 && contents.commonMistakes?.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
            <div className="font-bold text-amber-700 text-sm mb-2">⚠️ 자주 틀리는 포인트</div>
            {contents.commonMistakes.map((m, i) => (
              <p key={i} className="text-sm text-amber-800">• {m}</p>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          {cardIdx > 0 && (
            <button onClick={() => setCardIdx(i => i - 1)}
              className="flex-1 py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-2xl border border-white/30">
              ← 이전
            </button>
          )}
          <button
            onClick={() => {
              if (cardIdx < contents.conceptCards.length - 1) setCardIdx(i => i + 1);
              else { setStep('quiz'); setQIdx(0); setSelected(null); setShowResult(false); }
            }}
            className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 text-white font-extrabold rounded-2xl">
            {cardIdx < contents.conceptCards.length - 1 ? '다음 →' : '퀴즈 풀기 →'}
          </button>
        </div>
        <button onClick={backToList} className="w-full text-white/40 hover:text-white/70 text-xs font-bold py-1">← 목록으로</button>
      </div>
    </div>
  );

  // ── 퀴즈 화면 ────────────────────────────────────────────────
  if (step === 'quiz') return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        {/* 진행 표시 */}
        <div className="flex items-center gap-2">
          {contents.questions.map((_, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors
              ${i < answers.length ? (answers[i]?.correct ? 'bg-emerald-400' : 'bg-rose-400') : i === qIdx ? 'bg-white/60' : 'bg-white/20'}`} />
          ))}
        </div>
        <div className="text-white/60 text-xs text-center">{qIdx + 1} / {contents.questions.length}문항</div>

        {/* 문제 */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 space-y-4">
          <div className="flex items-start gap-2">
            <span className="text-lg font-extrabold text-emerald-600 shrink-0">Q{qIdx + 1}.</span>
            <p className="text-slate-800 font-bold text-base leading-snug">{currentQ.question}</p>
          </div>

          <div className="space-y-2">
            {currentQ.options.map((opt, oi) => {
              const isSelected = selected === oi;
              const isCorrect  = oi === currentQ.answerIndex;
              let cls = 'border-2 border-slate-200 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50';
              if (showResult) {
                if (isCorrect) cls = 'border-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-extrabold';
                else if (isSelected && !isCorrect) cls = 'border-2 border-rose-400 bg-rose-50 text-rose-700';
                else cls = 'border-2 border-slate-200 bg-white text-slate-400';
              } else if (isSelected) {
                cls = 'border-2 border-indigo-500 bg-indigo-50 text-indigo-800 font-extrabold';
              }
              return (
                <button key={oi} onClick={() => selectAnswer(oi)} disabled={showResult}
                  className={`w-full text-left px-4 py-3 rounded-2xl text-sm transition-all ${cls}`}>
                  {opt}
                </button>
              );
            })}
          </div>

          {/* 해설 */}
          {showResult && (
            <div className={`rounded-2xl px-4 py-3 text-sm ${answers[answers.length - 1]?.correct || selected === currentQ.answerIndex ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'}`}>
              <div className="font-bold mb-1">{(answers[answers.length - 1]?.correct || selected === currentQ.answerIndex) ? '✅ 정답!' : '❌ 오답'}</div>
              <p className="text-xs leading-relaxed">{currentQ.explanation}</p>
            </div>
          )}
        </div>

        {!showResult ? (
          <button onClick={confirmAnswer} disabled={selected === null}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-lg rounded-2xl disabled:opacity-40">
            정답 확인
          </button>
        ) : (
          <button onClick={nextQuestion} disabled={saving}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-lg rounded-2xl disabled:opacity-40">
            {saving ? '저장 중...' : qIdx < contents.questions.length - 1 ? '다음 문제 →' : '결과 보기 →'}
          </button>
        )}
      </div>
    </div>
  );

  // ── 결과 화면 ────────────────────────────────────────────────
  if (step === 'result' && finalResult) return (
    <div className="min-h-screen bg-gradient-to-b from-violet-950 to-slate-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className={`px-6 py-8 text-center ${finalResult.score >= 80 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : finalResult.score >= 60 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-slate-600 to-slate-700'}`}>
          <div className="text-5xl mb-2">{finalResult.score >= 80 ? '🏆' : finalResult.score >= 60 ? '👍' : '💪'}</div>
          <div className="text-4xl font-extrabold text-white mb-1">{finalResult.score}점</div>
          <p className="text-white/80 text-sm">{finalResult.correctCount}/{finalResult.totalCount}문항 정답</p>
        </div>
        <div className="p-6 space-y-4">
          {finalResult.rewarded && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="font-bold text-amber-700 text-sm mb-2 text-center">🎁 보상 획득!</div>
              <div className="flex justify-center gap-5 text-center">
                <div><div className="text-xl">⭐</div><div className="text-xs font-bold text-amber-700">+{finalResult.reward.exp + finalResult.bonusExp} EXP</div></div>
                <div><div className="text-xl">🪙</div><div className="text-xs font-bold text-amber-700">+{finalResult.reward.gold + finalResult.bonusGold}G</div></div>
                {finalResult.reward.diamonds > 0 && (
                  <div><div className="text-xl">💎</div><div className="text-xs font-bold text-amber-700">+{finalResult.reward.diamonds}</div></div>
                )}
              </div>
              {finalResult.bonusGold > 0 && (
                <p className="text-center text-xs text-amber-600 mt-1 font-bold">🌟 80점 이상 추가 보상!</p>
              )}
            </div>
          )}
          {!finalResult.rewarded && (
            <p className="text-center text-xs text-slate-400">이미 보상을 받은 학습입니다. (재도전 시 보상 미지급)</p>
          )}

          {/* 문항별 결과 */}
          <div className="space-y-1.5">
            {contents.questions.map((q, i) => {
              const ans = answers[i] || { correct: selected === q.answerIndex };
              return (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${ans.correct ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                  <span className="font-extrabold shrink-0">{ans.correct ? '✅' : '❌'} Q{i+1}</span>
                  <span className="line-clamp-1 text-xs">{q.question}</span>
                </div>
              );
            })}
          </div>

          <button onClick={backToList}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl">
            AI 학습관으로 →
          </button>
        </div>
      </div>
    </div>
  );

  return null;
}
