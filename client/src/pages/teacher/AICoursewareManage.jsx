import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
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
    { id: 'weakness',  label: '🔍 취약 분석',   desc: '오답 기록 리포트' },
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

        {/* ═══════════════ 취약 분석 ═══════════════ */}
        {tab === 'weakness' && (
          <WeaknessTab teacherUid={teacherUid} students={students} />
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

// ── 교과서 내용 등록 탭 (RAG) ─────────────────────────────────
export function TextbookContextTab({ teacherUid, units, loadingUnits, unitGrade, setUnitGrade, unitSem, setUnitSem }) {
  const [selectedUnit,    setSelectedUnit]    = useState(null);
  const [selectedLesson,  setSelectedLesson]  = useState(null);
  const [text,            setText]            = useState('');
  const [existing,        setExisting]        = useState(null); // 기존 등록 내용
  const [saving,          setSaving]          = useState(false);
  const [extracting,      setExtracting]      = useState(false);
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
    showToast('✅ 교과서 내용이 저장됐습니다! 이제 AI가 이 내용으로 문제를 생성합니다.');
  };

  const deleteContext = async () => {
    if (!window.confirm('교과서 내용을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'aiLessonContext', lkey(selectedUnit, selectedLesson)));
    setExisting(null); setText('');
    showToast('삭제됐습니다');
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
                {existing && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                    ✅ 교과서 내용 등록됨
                  </span>
                )}
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
              <button onClick={saveContext} disabled={saving || !text.trim()}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-sm disabled:opacity-50 transition-colors shadow-md">
                {saving ? '저장 중...' : '💾 교과서 내용 저장'}
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
                <li>등록 후 학생이 이 차시에 접속하면 입력한 내용 기반으로 문제가 생성됩니다</li>
                <li>기존 캐시가 있다면 ↻ 버튼으로 재생성해야 적용됩니다</li>
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
function WeaknessTab({ teacherUid, students }) {
  const [wrongData,  setWrongData]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filterUnit, setFilterUnit] = useState('');

  useEffect(() => {
    if (!students.length) return;
    setLoading(true);
    const codes = students.map(s => s.studentCode).filter(Boolean);
    const batches = [];
    for (let i = 0; i < codes.length; i += 10) batches.push(codes.slice(i, i + 10));
    Promise.all(batches.map(b =>
      getDocs(query(collection(db, 'aiWrongAnswers'), where('studentCode', 'in', b)))
    )).then(snaps => {
      const all = snaps.flatMap(s => s.docs.map(d => d.data()));
      setWrongData(all);
    }).finally(() => setLoading(false));
  }, [students]);

  // 차시별 오답 집계
  const lessonMap = {};
  wrongData.forEach(w => {
    const key = w.lessonKey || `${w.unitName}_${w.lessonTitle}`;
    if (!lessonMap[key]) lessonMap[key] = { unitName: w.unitName, lessonTitle: w.lessonTitle, count: 0, questions: {} };
    lessonMap[key].count++;
    const qt = (w.questionText || '').slice(0, 60);
    if (!lessonMap[key].questions[qt]) lessonMap[key].questions[qt] = 0;
    lessonMap[key].questions[qt]++;
  });
  const sorted = Object.values(lessonMap).sort((a, b) => b.count - a.count);
  const unitNames = [...new Set(sorted.map(s => s.unitName))];

  const filtered = filterUnit ? sorted.filter(s => s.unitName === filterUnit) : sorted;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="font-extrabold text-slate-700">🔍 오답 기록 분석</h3>
        <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:border-indigo-400">
          <option value="">전체 단원</option>
          {unitNames.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <span className="text-xs text-slate-400">총 {wrongData.length}건 오답 기록</span>
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
              <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full
                ${item.count >= 10 ? 'bg-rose-100 text-rose-700' : item.count >= 5 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                {item.count}회 오답
              </span>
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
