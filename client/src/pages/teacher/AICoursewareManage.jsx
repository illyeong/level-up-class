import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';

const fmtDateShort = (str) => {
  if (!str) return '-';
  const d = new Date(str);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

export default function AICoursewareManage({ selectedClass }) {
  const teacherUid = selectedClass?.teacherUid;

  const [tab, setTab] = useState('dashboard');

  // ── 데이터 ───────────────────────────────────────────────────
  const [students, setStudents]     = useState([]);
  const [allProgress, setAllProgress] = useState([]);
  const [lessonContentMap, setLessonContentMap] = useState({}); // lessonKey → title
  const [loadingData, setLoadingData] = useState(false);

  const loadAll = useCallback(async () => {
    if (!teacherUid) return;
    setLoadingData(true);
    try {
      const stuSnap = await getDocs(query(
        collection(db, 'students'), where('teacherUid', '==', teacherUid)
      ));
      const stuList = stuSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => parseInt(a.studentCode?.slice(-2) || 0) - parseInt(b.studentCode?.slice(-2) || 0));
      setStudents(stuList);

      // 진행 기록 전체 로드 (이 학급 학생들만)
      const codes = new Set(stuList.map(s => s.studentCode));
      if (codes.size === 0) { setAllProgress([]); return; }

      const progSnap = await getDocs(collection(db, 'aiStudentProgress'));
      const progs = progSnap.docs
        .map(d => d.data())
        .filter(p => codes.has(p.studentCode) && p.status === 'completed');
      setAllProgress(progs);

      // lessonKey → title 매핑 (캐시된 AI 콘텐츠에서)
      const keys = [...new Set(progs.map(p => p.lessonKey).filter(Boolean))];
      if (keys.length > 0) {
        const cacheSnap = await getDocs(collection(db, 'aiLessonContent'));
        const map = {};
        cacheSnap.docs.forEach(d => {
          const data = d.data();
          if (data.lessonKey) map[data.lessonKey] = data.lessonTitle || data.unitName || data.lessonKey;
        });
        setLessonContentMap(map);
      }
    } catch (e) { console.error(e); }
    finally { setLoadingData(false); }
  }, [teacherUid]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── 파생 통계 ─────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const todayProgress = allProgress.filter(p => p.date === today);
  const scores        = allProgress.map(p => p.score).filter(s => s != null);
  const avgScore      = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  // 학생별 통계
  const studentStats = students.map(stu => {
    const progs = allProgress.filter(p => p.studentCode === stu.studentCode);
    const sc    = progs.map(p => p.score).filter(s => s != null);
    return {
      ...stu,
      completions: progs.length,
      avgScore: sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null,
      lastDate: progs.sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0))[0]?.date || null,
      todayCount: allProgress.filter(p => p.studentCode === stu.studentCode && p.date === today).length,
    };
  }).sort((a, b) => (b.completions || 0) - (a.completions || 0));

  // 차시별 통계 (취약 분석)
  const lessonStats = (() => {
    const map = {};
    allProgress.forEach(p => {
      const key = p.lessonKey || `${p.unitName}_${p.lessonTitle}`;
      if (!map[key]) {
        map[key] = {
          key,
          label: p.lessonTitle || lessonContentMap[p.lessonKey] || p.unitName || key,
          unitName: p.unitName || '',
          scores: [], weakCount: 0, count: 0,
        };
      }
      map[key].count++;
      if (p.score != null) map[key].scores.push(p.score);
      if ((p.score || 0) < 70) map[key].weakCount++;
    });
    return Object.values(map)
      .map(s => ({ ...s, avgScore: s.scores.length ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : null }))
      .filter(s => s.count >= 2) // 2명 이상 참여한 차시만
      .sort((a, b) => (a.avgScore || 100) - (b.avgScore || 100));
  })();

  // 오늘의 활동 (최근 15건)
  const recentActivity = allProgress
    .filter(p => p.date === today)
    .sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0))
    .slice(0, 15);

  const TABS = [
    { id: 'dashboard', label: '📊 종합 현황' },
    { id: 'students',  label: '👥 학생별 분석' },
    { id: 'analysis',  label: '🔍 취약 분석' },
  ];

  const Loading = () => (
    <div className="flex justify-center py-20 gap-2">
      <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
      <span className="text-sm text-slate-400">불러오는 중...</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 mb-5">
          <h1 className="text-2xl font-extrabold text-slate-800">🤖 AI 학습관 현황</h1>
          <p className="text-slate-500 text-sm mt-0.5">학생들의 AI 자율 학습 데이터를 분석합니다</p>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-colors
                ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── 종합 현황 ──────────────────────────────────────── */}
        {tab === 'dashboard' && (
          <div className="space-y-5">
            {/* 지표 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: '총 학습 완료', value: allProgress.length, unit: '건', icon: '✅', color: 'emerald' },
                { label: '오늘 완료', value: todayProgress.length, unit: '건', icon: '📅', color: 'sky' },
                { label: '전체 평균 점수', value: avgScore !== null ? `${avgScore}점` : '-', unit: '', icon: '📈', color: avgScore >= 70 ? 'emerald' : avgScore !== null ? 'amber' : 'slate' },
                { label: '참여 학생', value: studentStats.filter(s => s.completions > 0).length, unit: `/${students.length}명`, icon: '👥', color: 'indigo' },
              ].map(({ label, value, unit, icon, color }) => (
                <div key={label} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <div className="text-xl mb-1">{icon}</div>
                  <div className={`text-2xl font-extrabold text-${color}-600`}>{value}<span className="text-base font-bold text-slate-400">{unit}</span></div>
                  <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* 오늘 학습 활동 */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
              <h3 className="font-extrabold text-slate-700 text-sm mb-3">📅 오늘 학습 활동</h3>
              {recentActivity.length === 0 ? (
                <p className="text-slate-400 text-sm py-6 text-center">오늘 완료된 학습이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {recentActivity.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl">
                      <span className="text-sm font-bold text-slate-700 w-20 shrink-0">
                        {students.find(s => s.studentCode === p.studentCode)?.name || p.studentCode?.slice(-5)}
                      </span>
                      <span className="flex-1 text-xs text-slate-500 truncate">
                        {p.unitName} · {p.lessonTitle}
                      </span>
                      <span className={`text-sm font-extrabold shrink-0 ${(p.score || 0) >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {p.score}점
                      </span>
                      <span className="text-xs text-slate-400 shrink-0">{p.correctCount}/{p.totalCount}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 인기 차시 TOP 5 */}
            {lessonStats.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                <h3 className="font-extrabold text-slate-700 text-sm mb-3">🔥 학습 참여 TOP 5 차시</h3>
                <div className="space-y-2">
                  {[...lessonStats].sort((a, b) => b.count - a.count).slice(0, 5).map((s, i) => (
                    <div key={s.key} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-xl">
                      <span className="text-xs font-extrabold text-slate-400 w-5">{i + 1}</span>
                      <span className="flex-1 text-sm font-bold text-slate-700 truncate">{s.label}</span>
                      <span className="text-xs text-slate-400">{s.count}명</span>
                      <span className={`text-sm font-extrabold ${(s.avgScore || 0) >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {s.avgScore !== null ? `${s.avgScore}점` : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 학생별 분석 ──────────────────────────────────────── */}
        {tab === 'students' && (
          loadingData ? <Loading /> : (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-wrap gap-4 text-sm font-bold">
                <span className="text-slate-600">전체 <span className="text-slate-800">{students.length}명</span></span>
                <span className="text-emerald-600">활동 {studentStats.filter(s => s.completions > 0).length}명</span>
                <span className="text-slate-400">미활동 {studentStats.filter(s => s.completions === 0).length}명</span>
                <span className="text-sky-600">오늘 {studentStats.filter(s => s.todayCount > 0).length}명 활동</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">학생</th>
                      <th className="px-4 py-3 text-center font-semibold">총 완료</th>
                      <th className="px-4 py-3 text-center font-semibold">평균 점수</th>
                      <th className="px-4 py-3 text-center font-semibold">오늘</th>
                      <th className="px-4 py-3 text-center font-semibold">마지막 활동</th>
                      <th className="px-4 py-3 text-center font-semibold">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentStats.map(stu => (
                      <tr key={stu.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-800">{stu.name || stu.studentCode}</div>
                          <div className="text-[10px] text-slate-400">{stu.studentCode}</div>
                        </td>
                        <td className="px-4 py-3 text-center font-extrabold text-indigo-600">{stu.completions}</td>
                        <td className="px-4 py-3 text-center">
                          {stu.avgScore !== null
                            ? <span className={`font-extrabold ${stu.avgScore >= 80 ? 'text-emerald-600' : stu.avgScore >= 60 ? 'text-amber-600' : 'text-rose-500'}`}>{stu.avgScore}점</span>
                            : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {stu.todayCount > 0
                            ? <span className="text-[10px] font-bold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{stu.todayCount}회</span>
                            : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500 text-xs">{fmtDateShort(stu.lastDate)}</td>
                        <td className="px-4 py-3 text-center">
                          {stu.completions === 0
                            ? <span className="text-[10px] bg-slate-100 text-slate-400 font-bold px-2 py-0.5 rounded-full">미활동</span>
                            : stu.avgScore >= 70
                              ? <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">양호</span>
                              : <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">복습 필요</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 최근 기록 20건 */}
              {allProgress.length > 0 && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-700 text-sm mb-3">📋 최근 학습 기록 (20건)</h3>
                  <div className="space-y-1.5">
                    {[...allProgress]
                      .sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0))
                      .slice(0, 20)
                      .map((p, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-xl text-xs">
                          <span className="font-bold text-slate-600 w-20 shrink-0">
                            {students.find(s => s.studentCode === p.studentCode)?.name || p.studentCode?.slice(-5)}
                          </span>
                          <span className="flex-1 text-slate-500 truncate">{p.unitName} · {p.lessonTitle}</span>
                          <span className={`font-extrabold ${(p.score || 0) >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>{p.score}점</span>
                          <span className="text-slate-400">{p.correctCount}/{p.totalCount}</span>
                          <span className="text-slate-400 shrink-0">{fmtDateShort(p.date)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* ── 취약 분석 ──────────────────────────────────────── */}
        {tab === 'analysis' && (
          loadingData ? <Loading /> : lessonStats.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-3">📊</div>
              <p className="font-bold text-slate-600">분석할 데이터가 부족합니다</p>
              <p className="text-sm mt-1">차시당 2명 이상 학습하면 분석이 표시됩니다.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '분석된 차시', value: lessonStats.length, color: 'indigo' },
                  { label: '취약 차시 (60점↓)', value: lessonStats.filter(d => (d.avgScore || 0) < 60).length, color: 'rose' },
                  { label: '70점 미만 건수', value: lessonStats.reduce((s, d) => s + d.weakCount, 0), color: 'amber' },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`bg-${color}-50 rounded-2xl p-4 border border-${color}-200 text-center`}>
                    <div className={`text-2xl font-extrabold text-${color}-600`}>{value}</div>
                    <div className={`text-xs text-${color}-500 mt-0.5`}>{label}</div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 text-sm mb-4">📉 차시별 평균 점수 (낮은 순)</h3>
                <div className="space-y-3">
                  {lessonStats.map((d, i) => {
                    const score = d.avgScore || 0;
                    const bar = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500';
                    return (
                      <div key={d.key}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${score >= 80 ? 'bg-emerald-100 text-emerald-700' : score >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-600'}`}>
                              {i + 1}위
                            </span>
                            <span className="text-sm font-bold text-slate-700 truncate">{d.label}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-xs text-slate-400">{d.count}명</span>
                            {d.weakCount > 0 && (
                              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-200">⚠️ {d.weakCount}명</span>
                            )}
                            <span className={`text-sm font-extrabold ${score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>{score}점</span>
                          </div>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(2, score)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )
        )}

      </div>
    </div>
  );
}
