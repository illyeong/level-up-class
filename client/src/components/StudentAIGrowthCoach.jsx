import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const toDate = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isToday = (value) => {
  const date = toDate(value);
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
};

export default function StudentAIGrowthCoach({ studentCode, onChangeView, themeMode = 'dark' }) {
  const [data, setData] = useState({ loading: true, progress: [], mastery: [], wrong: [] });
  const [weekAgo] = useState(() => Date.now() - (7 * 24 * 60 * 60 * 1000));

  useEffect(() => {
    if (!studentCode) return;
    let active = true;
    Promise.all([
      getDocs(query(collection(db, 'aiStudentProgress'), where('studentCode', '==', studentCode))),
      getDocs(query(collection(db, 'aiLessonMastery'), where('studentCode', '==', studentCode))),
      getDocs(query(collection(db, 'aiWrongAnswers'), where('studentCode', '==', studentCode))),
    ]).then(([progressSnap, masterySnap, wrongSnap]) => {
      if (!active) return;
      setData({
        loading: false,
        progress: progressSnap.docs.map(doc => doc.data()),
        mastery: masterySnap.docs.map(doc => doc.data()),
        wrong: wrongSnap.docs.map(doc => doc.data()),
      });
    }).catch(() => {
      if (active) setData(prev => ({ ...prev, loading: false }));
    });
    return () => { active = false; };
  }, [studentCode]);

  const summary = useMemo(() => {
    const unresolvedByQuestion = new Map();
    data.wrong.filter(item => !item.resolved && item.status !== 'resolved').forEach(item => {
      const key = item.questionKey || item.id || `${item.lessonKey}_${item.questionIdx}`;
      if (!unresolvedByQuestion.has(key)) unresolvedByQuestion.set(key, item);
    });
    const unresolved = [...unresolvedByQuestion.values()];
    const causeLabels = {
      concept: '개념 이해',
      calculation: '계산 실수',
      condition: '문제 조건 확인',
      visual: '단위·그림 읽기',
      rushed: '천천히 읽기',
    };
    const causeCounts = unresolved.reduce((counts, item) => {
      if (item.wrongCause) counts[item.wrongCause] = (counts[item.wrongCause] || 0) + 1;
      return counts;
    }, {});
    const topCause = Object.entries(causeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const retryLessons = data.mastery
      .filter(item => item.masteryLevel === 'retry' || (Number.isFinite(item.masteryAvg) && item.masteryAvg < 60))
      .sort((a, b) => (a.masteryAvg ?? 0) - (b.masteryAvg ?? 0));
    const todayLearning = data.progress.filter(item => isToday(item.completedAt) || isToday(item.updatedAt) || isToday(item.date));
    const recentProgress = [...data.progress].sort((a, b) =>
      (toDate(b.completedAt)?.getTime() || 0) - (toDate(a.completedAt)?.getTime() || 0)
    )[0];

    if (unresolved.length > 0) {
      return {
        headline: `복습하면 해결할 수 있는 오답이 ${unresolved.length}개 있어요.`,
        detail: topCause
          ? `최근에는 '${causeLabels[topCause] || topCause}' 부분을 가장 많이 선택했어요. ${unresolved[0]?.lessonTitle || '오답노트'}부터 확인해 보세요.`
          : unresolved[0]?.lessonTitle
            ? `${unresolved[0].lessonTitle}부터 차근차근 다시 확인해 보세요.`
            : '틀린 문제를 다시 풀며 헷갈린 개념을 확인해 보세요.',
        primary: { label: '오답 복습하기', view: 'aiCourseware', intent: 'wrongNote' },
      };
    }
    if (retryLessons.length > 0) {
      return {
        headline: `${retryLessons[0].lessonTitle || '최근 학습 차시'}를 한 번 더 연습해 보세요.`,
        detail: `현재 숙달도 ${retryLessons[0].masteryAvg ?? '평가 중'}점이에요. 한 번 더 풀면 성장 기록이 달라집니다.`,
        primary: { label: '이어서 학습하기', view: 'aiCourseware' },
      };
    }
    if (todayLearning.length === 0) {
      return {
        headline: '오늘의 짧은 학습을 시작해 볼까요?',
        detail: recentProgress?.lessonTitle
          ? `최근에는 ${recentProgress.lessonTitle}을 학습했어요. 오늘도 한 차시만 도전해 보세요.`
          : 'AI 학습관에서 원하는 차시를 골라 첫 학습을 시작해 보세요.',
        primary: { label: '오늘 학습 시작하기', view: 'aiCourseware' },
      };
    }
    return {
      headline: `오늘 ${todayLearning.length}개 차시를 학습했어요.`,
      detail: '학습 내용을 배움노트에 정리하면 오늘의 성장을 더 오래 기억할 수 있어요.',
      primary: { label: '배움노트 작성하기', view: 'learningNote' },
    };
  }, [data]);

  const weekStats = useMemo(() => {
    const learned = data.progress.filter(item => {
      const date = toDate(item.completedAt || item.updatedAt);
      return date && date.getTime() >= weekAgo;
    });
    const resolved = data.wrong.filter(item => {
      const date = toDate(item.resolvedAt || item.lastReviewedAt);
      return (item.resolved || item.status === 'resolved') && date && date.getTime() >= weekAgo;
    });
    const scores = learned.map(item => Number(item.score)).filter(Number.isFinite);
    return {
      learned: learned.length,
      resolved: resolved.length,
      average: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    };
  }, [data, weekAgo]);

  const move = (action) => {
    if (action.intent) sessionStorage.setItem('aiCoursewareIntent', action.intent);
    onChangeView?.(action.view);
  };

  const dark = themeMode === 'dark';
  return (
    <section className={`rounded-3xl border p-5 shadow-sm ${
      dark ? 'border-indigo-400/20 bg-slate-900/80 text-white' : 'border-indigo-100 bg-white text-slate-800'
    }`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-600 text-lg">🤖</span>
            <div>
              <h2 className="text-base font-black">AI 오늘의 성장 코치</h2>
              <p className={`text-[11px] font-semibold ${dark ? 'text-slate-400' : 'text-slate-500'}`}>학습 기록을 바탕으로 다음 행동을 추천해요</p>
            </div>
          </div>
          {data.loading ? (
            <p className={`text-sm font-bold ${dark ? 'text-slate-400' : 'text-slate-500'}`}>오늘의 추천을 준비하는 중...</p>
          ) : (
            <>
              <p className="text-lg font-black leading-snug">{summary.headline}</p>
              <p className={`mt-1 text-sm font-semibold leading-relaxed ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{summary.detail}</p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" disabled={data.loading} onClick={() => move(summary.primary)}
            className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white shadow-md hover:bg-indigo-700 disabled:opacity-40">
            {summary.primary.label}
          </button>
          <button type="button" onClick={() => onChangeView?.('quest')}
            className={`rounded-2xl border px-4 py-3 text-sm font-extrabold ${
              dark ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}>
            오늘의 퀘스트
          </button>
        </div>
      </div>
      {!data.loading && (
        <div className={`mt-4 grid grid-cols-3 gap-2 border-t pt-4 ${dark ? 'border-slate-700' : 'border-slate-100'}`}>
          {[
            ['이번 주 학습', `${weekStats.learned}차시`],
            ['해결한 오답', `${weekStats.resolved}개`],
            ['최근 평균', weekStats.average === null ? '첫 도전 전' : `${weekStats.average}점`],
          ].map(([label, value]) => (
            <div key={label} className={`rounded-2xl px-3 py-2 text-center ${dark ? 'bg-slate-800' : 'bg-slate-50'}`}>
              <p className={`text-[10px] font-bold ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
              <p className="mt-0.5 text-sm font-black">{value}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
