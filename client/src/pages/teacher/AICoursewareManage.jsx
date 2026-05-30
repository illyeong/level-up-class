import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';

// ── 상수 ─────────────────────────────────────────────────────
const MASTERY = {
  excellent: { label: '매우 훌륭', emoji: '🏆', bar: 'bg-amber-400',  text: 'text-amber-600',  light: 'bg-amber-50 border-amber-200' },
  good:      { label: '훌륭',     emoji: '⭐', bar: 'bg-sky-400',    text: 'text-sky-600',    light: 'bg-sky-50 border-sky-200'     },
  normal:    { label: '보통',     emoji: '👍', bar: 'bg-emerald-400', text: 'text-emerald-600', light: 'bg-emerald-50 border-emerald-200' },
  retry:     { label: '재도전',   emoji: '🔄', bar: 'bg-rose-400',   text: 'text-rose-500',   light: 'bg-rose-50 border-rose-200'   },
};
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
    <div className={`${h} ${color} rounded-full transition-all`} style={{ width: `${Math.max(2, pct)}%` }} />
  </div>
);

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export default function AICoursewareManage({ selectedClass }) {
  const teacherUid = selectedClass?.teacherUid;

  const [tab, setTab] = useState('units');

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
  const todayProg = allProgress.filter(p => p.date === today);
  const scores = allProgress.map(p => p.score).filter(s => s != null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const studentStats = students.map(stu => {
    const progs = allProgress.filter(p => p.studentCode === stu.studentCode);
    const sc = progs.map(p => p.score).filter(s => s != null);
    const stuMasteries = Object.values(allMastery).map(lm => lm[stu.studentCode]).filter(m => m?.masteryLevel);
    return {
      ...stu, completions: progs.length,
      avgScore: sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null,
      lastDate: progs.sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0))[0]?.date || null,
      todayCount: progs.filter(p => p.date === today).length,
      masteries: stuMasteries,
    };
  });

  const getUnitStats = (unit) => {
    const countable = (unit.lessons || []).filter(l => l.title !== '단원 도입');
    if (!countable.length) return { completedStudents: 0, totalStudents: students.length, classAvg: null, progressPct: 0, needed: countable.length };
    let totalRated = 0, completedStudents = 0;
    const completedAvgs = [];
    students.forEach(stu => {
      const rated = countable.filter(l => (allMastery[lessonKey(unit, l)] || {})[stu.studentCode]?.masteryAvg != null);
      totalRated += rated.length;
      if (rated.length === countable.length) {
        completedStudents++;
        completedAvgs.push(Math.round(rated.reduce((s, l) => s + (allMastery[lessonKey(unit, l)] || {})[stu.studentCode].masteryAvg, 0) / rated.length));
      }
    });
    return {
      completedStudents, totalStudents: students.length,
      classAvg: completedAvgs.length ? Math.round(completedAvgs.reduce((a, b) => a + b, 0) / completedAvgs.length) : null,
      progressPct: students.length ? Math.round((totalRated / (countable.length * students.length)) * 100) : 0,
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
    { id: 'units',     label: '📚 단원별 현황', desc: '차시별 숙달도 분석' },
    { id: 'students',  label: '👥 학생별 분석', desc: '개인 학습 현황' },
    { id: 'dashboard', label: '📊 종합 현황',   desc: '전체 학습 통계' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-5">
      <div className="max-w-6xl mx-auto">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">🤖 AI 학습관 현황</h1>
            <p className="text-slate-400 text-sm mt-0.5">학생 자율 학습 데이터 분석</p>
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
        <div className="flex gap-1 p-1 bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 w-fit">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all
                ${tab === t.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

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
                  return (
                    <button key={unit.id} onClick={() => { setSelectedUnit(unit); setExpandedLesson(null); }}
                      className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-300 p-5 text-left transition-all group">

                      {/* 헤더 */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-baseline gap-1.5 flex-1 min-w-0 pr-2">
                          <span className="text-xl font-black text-slate-200 shrink-0">{unit.unitNumber}</span>
                          <span className="font-extrabold text-slate-800 text-sm leading-snug line-clamp-2">{unit.unitName}</span>
                        </div>
                        <span className="shrink-0 text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">
                          {(unit.lessons || []).length}차시
                        </span>
                      </div>

                      {/* 진행률 */}
                      <div className="mb-3">
                        <div className="flex justify-between mb-1.5">
                          <span className="text-[11px] text-slate-500 font-bold">{s.progressPct}% 진행</span>
                          <span className="text-[11px] text-slate-400">단원 완료 {s.completedStudents}/{s.totalStudents}명</span>
                        </div>
                        <ProgressBar pct={s.progressPct} color={s.completedStudents > 0 ? 'bg-indigo-400' : 'bg-slate-300'} h="h-2" />
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
                        <div className="text-[11px] text-slate-400 px-1">
                          {s.progressPct > 0 ? `${s.needed}차시 전체 완료 학생 없음` : `${s.needed}개 차시 완료 시 숙달도 표시`}
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
                                      <span className={`font-bold ${done >= 5 ? 'text-indigo-600' : 'text-slate-400'}`}>{m.attemptCount || done}회</span>
                                    </div>
                                    <div className="col-span-4 flex gap-0.5 flex-wrap">
                                      {(m.scores || []).map((s, i) => (
                                        <span key={i} className={`px-1 py-0.5 rounded text-[10px] font-bold bg-white border ${scoreColor(s)} border-current`}>{s}</span>
                                      ))}
                                      {done < 5 && Array.from({ length: 5 - done }, (_, i) => (
                                        <span key={`e${i}`} className="px-1 py-0.5 rounded text-[10px] bg-slate-100 text-slate-300">?</span>
                                      ))}
                                    </div>
                                    <div className="col-span-3 text-center">
                                      {m.masteryLevel
                                        ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${MASTERY[m.masteryLevel]?.light || ''} ${MASTERY[m.masteryLevel]?.text || ''}`}>
                                            {MASTERY[m.masteryLevel]?.emoji} {MASTERY[m.masteryLevel]?.label}
                                          </span>
                                        : <span className="text-slate-400">{done}/5 도전중</span>}
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
                    <div key={stu.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex items-start gap-4">
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
                    </div>
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
    </div>
  );
}
