import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';

// ── 숙달도 설정 (학생 페이지와 동일) ────────────────────────────
const MASTERY = {
  excellent: { label: '매우 훌륭', emoji: '🏆', bg: 'bg-amber-100 text-amber-700 border border-amber-200' },
  good:      { label: '훌륭',     emoji: '⭐', bg: 'bg-sky-100 text-sky-700 border border-sky-200' },
  normal:    { label: '보통',     emoji: '👍', bg: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  retry:     { label: '재도전',   emoji: '🔄', bg: 'bg-rose-100 text-rose-600 border border-rose-200' },
};
const getMasteryLevel = (avg) =>
  avg >= 90 ? 'excellent' : avg >= 75 ? 'good' : avg >= 60 ? 'normal' : 'retry';

const lessonKey = (unit, lesson) =>
  `v2_${unit.grade}_${unit.semester || 0}_${unit.publisher || 'default'}_${unit.id}_${lesson.no}`;

const fmtDate = (str) => {
  if (!str) return '-';
  return new Date(str).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

// 숙달도 분포 뱃지
function MasteryBadge({ level, size = 'sm' }) {
  if (!level) return null;
  const cfg = MASTERY[level] || MASTERY.retry;
  return (
    <span className={`inline-flex items-center gap-0.5 font-bold rounded-full border
      ${size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'}
      ${cfg.bg}`}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

// 점수 → 색상 클래스
const scoreColor = (s) => s >= 90 ? 'text-amber-600' : s >= 75 ? 'text-sky-600' : s >= 60 ? 'text-emerald-600' : 'text-rose-600';

// 로딩
const Spinner = () => (
  <div className="flex justify-center items-center py-16 gap-2 text-slate-400 text-sm">
    <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
    불러오는 중...
  </div>
);

export default function AICoursewareManage({ selectedClass }) {
  const teacherUid = selectedClass?.teacherUid;

  const [tab, setTab] = useState('units'); // 'units' | 'students' | 'dashboard' | 'analysis'

  // ── 공통 데이터 ────────────────────────────────────────────────
  const [students,    setStudents]    = useState([]);
  const [allProgress, setAllProgress] = useState([]);
  const [allMastery,  setAllMastery]  = useState({}); // lessonKey → {studentCode → masteryData}
  const [loadingData, setLoadingData] = useState(false);

  // ── 단원별 현황 상태 ──────────────────────────────────────────
  const [unitGrade,   setUnitGrade]   = useState('');
  const [unitSem,     setUnitSem]     = useState('all');
  const [units,       setUnits]       = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [expandedLesson, setExpandedLesson] = useState(null); // lessonKey

  // ── 데이터 로드 ───────────────────────────────────────────────
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

      const codes = stuList.map(s => s.studentCode).filter(Boolean);
      if (!codes.length) return;

      // aiStudentProgress 로드
      const progSnap = await getDocs(collection(db, 'aiStudentProgress'));
      const progs = progSnap.docs.map(d => d.data())
        .filter(p => codes.includes(p.studentCode) && p.status === 'completed');
      setAllProgress(progs);

      // aiLessonMastery 로드 (in 쿼리, 10개씩 배치)
      const batches = [];
      for (let i = 0; i < codes.length; i += 10) batches.push(codes.slice(i, i + 10));
      const snapshots = await Promise.all(
        batches.map(batch => getDocs(query(
          collection(db, 'aiLessonMastery'), where('studentCode', 'in', batch)
        )))
      );
      const masteryMap = {};
      snapshots.forEach(snap => {
        snap.forEach(d => {
          const m = d.data();
          if (!masteryMap[m.lessonKey]) masteryMap[m.lessonKey] = {};
          masteryMap[m.lessonKey][m.studentCode] = m;
        });
      });
      setAllMastery(masteryMap);

    } catch (e) { console.error(e); }
    finally { setLoadingData(false); }
  }, [teacherUid]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // 단원 로드
  useEffect(() => {
    if (!unitGrade) { setUnits([]); setSelectedUnit(null); return; }
    setLoadingUnits(true);
    const q = query(
      collection(db, 'curriculumUnits'),
      where('grade', '==', parseInt(unitGrade)),
      where('subject', '==', '수학'),
      where('status', '==', 'approved'),
    );
    getDocs(q).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.semester || 0) - (b.semester || 0) || (a.unitNumber || 0) - (b.unitNumber || 0));
      setUnits(list);
    }).finally(() => setLoadingUnits(false));
    setSelectedUnit(null);
    setExpandedLesson(null);
  }, [unitGrade]);

  // ── 파생 통계 (대시보드) ──────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const todayProg = allProgress.filter(p => p.date === today);
  const scores = allProgress.map(p => p.score).filter(s => s != null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const studentStats = students.map(stu => {
    const progs = allProgress.filter(p => p.studentCode === stu.studentCode);
    const sc = progs.map(p => p.score).filter(s => s != null);
    return {
      ...stu,
      completions: progs.length,
      avgScore: sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null,
      lastDate: progs.sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0))[0]?.date || null,
      todayCount: progs.filter(p => p.date === today).length,
      masteryCount: Object.values(allMastery).filter(m => m[stu.studentCode]?.masteryLevel).length,
    };
  });

  const TABS = [
    { id: 'units',     label: '📚 단원별 현황' },
    { id: 'students',  label: '👥 학생별 분석' },
    { id: 'dashboard', label: '📊 종합 현황' },
  ];

  // ── 단원별 현황 렌더 ──────────────────────────────────────────
  const filteredUnits = units.filter(u => unitSem === 'all' || String(u.semester || '') === unitSem);

  // 단원 학급 통계: 모든 차시(도입 제외) 완료한 학생 기준으로만 숙달도 표시
  const getUnitClassStats = (unit) => {
    const countable = (unit.lessons || []).filter(l => l.title !== '단원 도입');
    if (!countable.length) return { completedStudents: 0, totalStudents: students.length, classAvg: null, progressPct: 0, needed: 0 };

    // 학생별 완료 차시 수 집계
    let completedStudents = 0;
    const completedAvgs = [];
    let totalRated = 0;

    students.forEach(stu => {
      const rated = countable.filter(l => (allMastery[lessonKey(unit, l)] || {})[stu.studentCode]?.masteryAvg != null);
      totalRated += rated.length;
      if (rated.length === countable.length) {
        // 이 학생은 단원 전 차시 완료
        completedStudents++;
        const avg = Math.round(rated.reduce((s, l) => {
          const m = (allMastery[lessonKey(unit, l)] || {})[stu.studentCode];
          return s + m.masteryAvg;
        }, 0) / rated.length);
        completedAvgs.push(avg);
      }
    });

    const classAvg = completedAvgs.length ? Math.round(completedAvgs.reduce((a, b) => a + b, 0) / completedAvgs.length) : null;
    const progressPct = students.length ? Math.round((totalRated / (countable.length * students.length)) * 100) : 0;

    return {
      completedStudents, totalStudents: students.length,
      classAvg, progressPct,
      needed: countable.length,
    };
  };

  // 차시 숙달도 분포
  const getLessonStats = (lk) => {
    const lm = allMastery[lk] || {};
    const entries = Object.values(lm);
    const rated = entries.filter(m => m.masteryAvg != null);
    const dist = { excellent: 0, good: 0, normal: 0, retry: 0 };
    rated.forEach(m => { if (dist[m.masteryLevel] !== undefined) dist[m.masteryLevel]++; });
    const avgs = rated.map(m => m.masteryAvg);
    const classAvg = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;
    return { rated: rated.length, total: students.length, dist, classAvg };
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-slate-200 mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">🤖 AI 학습관 현황</h1>
            <p className="text-slate-400 text-xs mt-0.5">단원별 차시별 숙달도 · 학생 학습 데이터 분석</p>
          </div>
          <button onClick={loadAll} disabled={loadingData}
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl">
            {loadingData ? <span className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin inline-block" /> : '↻'} 새로고침
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-colors
                ${tab === t.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════
            탭 1: 단원별 현황
        ══════════════════════════════════════════ */}
        {tab === 'units' && (
          <div>
            {/* 학년 선택 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-bold text-slate-600">학년 선택</span>
                <div className="flex gap-1.5 flex-wrap">
                  {['1','2','3','4','5','6'].map(g => (
                    <button key={g} onClick={() => { setUnitGrade(g); setSelectedUnit(null); }}
                      className={`w-9 h-9 rounded-xl font-extrabold text-sm transition-colors
                        ${unitGrade === g ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50'}`}>
                      {g}
                    </button>
                  ))}
                </div>
                {unitGrade && (
                  <>
                    <div className="w-px h-5 bg-slate-200" />
                    <div className="flex gap-1.5">
                      {['all','1','2'].map(s => (
                        <button key={s} onClick={() => { setUnitSem(s); setSelectedUnit(null); }}
                          className={`px-3 h-8 rounded-xl font-bold text-xs transition-colors
                            ${unitSem === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-indigo-50'}`}>
                          {s === 'all' ? '전체' : `${s}학기`}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {!unitGrade ? (
              <div className="text-center py-20 text-slate-400">
                <div className="text-4xl mb-3">📚</div>
                <p className="font-bold">학년을 선택하세요</p>
              </div>
            ) : loadingUnits ? <Spinner /> : (

              /* 단원 선택 안 됐을 때: 단원 카드 목록 */
              !selectedUnit ? (
                filteredUnits.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-sm">해당 학년/학기 단원이 없습니다</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredUnits.map(unit => {
                      const stats = getUnitClassStats(unit);
                      const mastCfg = stats.classAvg != null ? (MASTERY[getMasteryLevel(stats.classAvg)] || MASTERY.retry) : null;
                      return (
                        <button key={unit.id}
                          onClick={() => { setSelectedUnit(unit); setExpandedLesson(null); }}
                          className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md text-left transition-all">
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-2xl font-black text-slate-200">{unit.unitNumber}</span>
                            <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">
                              {unit.semester}학기 · {(unit.lessons || []).length}차시
                            </span>
                          </div>
                          <div className="font-extrabold text-slate-800 text-sm mb-2 leading-snug">{unit.unitName}</div>

                          {/* 진행률 바 */}
                          <div className="mb-2">
                            <div className="flex justify-between mb-1">
                              <span className="text-[10px] text-slate-500">{stats.progressPct}% 진행</span>
                              <span className="text-[10px] text-slate-400">완료 {stats.completedStudents}/{stats.totalStudents}명</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${stats.completedStudents > 0 ? 'bg-indigo-500' : 'bg-slate-300'}`}
                                style={{ width: `${stats.progressPct}%` }} />
                            </div>
                          </div>

                          {mastCfg ? (
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${mastCfg.bg}`}>
                                {mastCfg.emoji} {mastCfg.label}
                              </span>
                              <span className="text-[10px] text-slate-500 font-bold">{stats.classAvg}점</span>
                              <span className="text-[10px] text-slate-400">완료 {stats.completedStudents}명 기준</span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400">
                              {stats.progressPct > 0
                                ? `${stats.needed}개 차시 모두 완료한 학생 없음`
                                : `${stats.needed}개 차시 완료 시 숙달도 표시`}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                /* 단원 선택됨: 차시별 상세 */
                <div>
                  {/* 브레드크럼 */}
                  <div className="flex items-center gap-2 mb-4">
                    <button onClick={() => { setSelectedUnit(null); setExpandedLesson(null); }}
                      className="flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-800">
                      ← 단원 목록
                    </button>
                    <span className="text-slate-300">/</span>
                    <span className="text-sm font-extrabold text-slate-700">
                      {selectedUnit.unitNumber}단원 · {selectedUnit.unitName}
                    </span>
                  </div>

                  {/* 단원 요약 카드 */}
                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm mb-4">
                    {(() => {
                      const allAvgs = [];
                      (selectedUnit.lessons || []).forEach(l => {
                        const lk = lessonKey(selectedUnit, l);
                        Object.values(allMastery[lk] || {}).forEach(m => {
                          if (m.masteryAvg != null) allAvgs.push(m.masteryAvg);
                        });
                      });
                      const unitAvg = allAvgs.length ? Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) : null;
                      const dist = { excellent: 0, good: 0, normal: 0, retry: 0 };
                      allAvgs.forEach(a => { const lv = getMasteryLevel(a); if (dist[lv] !== undefined) dist[lv]++; });
                      return (
                        <div className="flex items-center gap-6 flex-wrap">
                          <div>
                            <div className="text-xs text-slate-400 mb-0.5">단원 평균</div>
                            <div className={`text-2xl font-extrabold ${unitAvg != null ? scoreColor(unitAvg) : 'text-slate-300'}`}>
                              {unitAvg != null ? `${unitAvg}점` : '-'}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {Object.entries(MASTERY).map(([lv, cfg]) => (
                              <div key={lv} className="text-center">
                                <div className="text-lg">{cfg.emoji}</div>
                                <div className="text-sm font-extrabold text-slate-700">{dist[lv]}</div>
                                <div className="text-[9px] text-slate-400">명</div>
                              </div>
                            ))}
                          </div>
                          <div className="text-xs text-slate-400">
                            {allAvgs.length}건 숙달도 판정 완료
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 차시별 테이블 */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {(selectedUnit.lessons || []).map((lesson, li) => {
                      const lk = lessonKey(selectedUnit, lesson);
                      const { rated, total, dist, classAvg } = getLessonStats(lk);
                      const isUnitTest = lesson.title === '단원평가';
                      const isExpanded = expandedLesson === lk;
                      const stuMastery = Object.entries(allMastery[lk] || {});

                      return (
                        <div key={lk}>
                          {/* 차시 행 */}
                          <button
                            onClick={() => setExpandedLesson(isExpanded ? null : lk)}
                            className={`w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors
                              ${li > 0 ? 'border-t border-slate-100' : ''}
                              ${isExpanded ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : ''}
                              ${isUnitTest ? 'bg-amber-50/50' : ''}`}>
                            {/* 차시 번호 */}
                            <span className={`text-xs font-extrabold w-12 shrink-0
                              ${isUnitTest ? 'text-amber-600' : 'text-slate-400'}`}>
                              {isUnitTest ? '📝 평가' : `${lesson.no}차시`}
                            </span>
                            {/* 차시명 */}
                            <span className={`flex-1 text-sm font-bold truncate
                              ${isUnitTest ? 'text-amber-700' : 'text-slate-700'}`}>
                              {lesson.title}
                            </span>
                            {/* 숙달도 분포 미니 */}
                            {rated > 0 && (
                              <div className="flex items-center gap-1 shrink-0">
                                {Object.entries(MASTERY).map(([lv, cfg]) =>
                                  dist[lv] > 0 ? (
                                    <span key={lv} className="text-xs text-slate-600 font-bold">
                                      {cfg.emoji}{dist[lv]}
                                    </span>
                                  ) : null
                                )}
                              </div>
                            )}
                            {/* 참여 수 */}
                            <span className="text-xs text-slate-400 shrink-0 w-14 text-right">
                              {rated}/{total}명
                            </span>
                            {/* 평균 점수 */}
                            <span className={`text-sm font-extrabold shrink-0 w-14 text-right
                              ${classAvg != null ? scoreColor(classAvg) : 'text-slate-300'}`}>
                              {classAvg != null ? `${classAvg}점` : '-'}
                            </span>
                            <span className={`text-xs shrink-0 text-slate-400 ${isExpanded ? 'rotate-180' : ''} transition-transform`}>▼</span>
                          </button>

                          {/* 학생 상세 (아코디언) */}
                          {isExpanded && (
                            <div className="bg-slate-50 border-t border-slate-200 px-4 py-3">
                              <div className="text-xs font-bold text-slate-500 mb-2">
                                학생별 숙달도 현황 ({students.length}명)
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-400">
                                      <th className="text-left py-1.5 pr-3 font-semibold">이름</th>
                                      <th className="text-center py-1.5 px-2 font-semibold">도전</th>
                                      <th className="text-center py-1.5 px-2 font-semibold">점수 기록</th>
                                      <th className="text-center py-1.5 px-2 font-semibold">숙달도</th>
                                      <th className="text-center py-1.5 px-2 font-semibold">평균</th>
                                      <th className="text-center py-1.5 px-2 font-semibold">마지막 점수</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200">
                                    {students.map(stu => {
                                      const m = (allMastery[lk] || {})[stu.studentCode];
                                      if (!m) return (
                                        <tr key={stu.id} className="opacity-40">
                                          <td className="py-1.5 pr-3 font-bold text-slate-600">{stu.name || stu.studentCode}</td>
                                          <td className="text-center px-2 text-slate-300">-</td>
                                          <td className="text-center px-2 text-slate-300">미도전</td>
                                          <td className="text-center px-2 text-slate-300">-</td>
                                          <td className="text-center px-2 text-slate-300">-</td>
                                          <td className="text-center px-2 text-slate-300">-</td>
                                        </tr>
                                      );
                                      const done = (m.scores || []).length;
                                      return (
                                        <tr key={stu.id} className="hover:bg-white">
                                          <td className="py-2 pr-3 font-extrabold text-slate-700">{stu.name || stu.studentCode}</td>
                                          <td className="text-center px-2">
                                            <span className={`font-bold ${done >= 5 ? 'text-indigo-600' : 'text-slate-500'}`}>
                                              {m.attemptCount || done}회
                                            </span>
                                          </td>
                                          <td className="text-center px-2">
                                            <div className="flex justify-center gap-0.5 flex-wrap">
                                              {(m.scores || []).map((s, i) => (
                                                <span key={i} className={`inline-block px-1 py-0.5 rounded font-bold ${scoreColor(s)} bg-white border border-slate-200`}>
                                                  {s}
                                                </span>
                                              ))}
                                              {done < 5 && Array.from({ length: 5 - done }, (_, i) => (
                                                <span key={`e${i}`} className="inline-block px-1 py-0.5 rounded bg-slate-100 text-slate-300">?</span>
                                              ))}
                                            </div>
                                          </td>
                                          <td className="text-center px-2">
                                            {m.masteryLevel ? (
                                              <MasteryBadge level={m.masteryLevel} size="xs" />
                                            ) : (
                                              <span className="text-slate-400">{done}/5 도전중</span>
                                            )}
                                          </td>
                                          <td className={`text-center px-2 font-extrabold ${m.masteryAvg != null ? scoreColor(m.masteryAvg) : 'text-slate-300'}`}>
                                            {m.masteryAvg != null ? `${m.masteryAvg}점` : '-'}
                                          </td>
                                          <td className={`text-center px-2 font-bold ${m.lastScore != null ? scoreColor(m.lastScore) : 'text-slate-300'}`}>
                                            {m.lastScore != null ? `${m.lastScore}점` : '-'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            탭 2: 학생별 분석
        ══════════════════════════════════════════ */}
        {tab === 'students' && (
          loadingData ? <Spinner /> : (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-wrap gap-4 text-sm font-bold">
                <span className="text-slate-600">전체 <span className="text-slate-800">{students.length}명</span></span>
                <span className="text-emerald-600">활동 {studentStats.filter(s => s.completions > 0).length}명</span>
                <span className="text-slate-400">미활동 {studentStats.filter(s => s.completions === 0).length}명</span>
                <span className="text-sky-600">오늘 {studentStats.filter(s => s.todayCount > 0).length}명</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">학생</th>
                      <th className="px-4 py-3 text-center font-semibold">총 완료</th>
                      <th className="px-4 py-3 text-center font-semibold">평균 점수</th>
                      <th className="px-4 py-3 text-center font-semibold">숙달도 판정</th>
                      <th className="px-4 py-3 text-center font-semibold">오늘</th>
                      <th className="px-4 py-3 text-center font-semibold">마지막 활동</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentStats.sort((a, b) => (b.masteryCount || 0) - (a.masteryCount || 0)).map(stu => {
                      // 이 학생의 숙달도 판정 현황
                      const stuMasteries = Object.values(allMastery)
                        .map(lm => lm[stu.studentCode])
                        .filter(m => m?.masteryLevel);
                      const dist = { excellent: 0, good: 0, normal: 0, retry: 0 };
                      stuMasteries.forEach(m => { if (dist[m.masteryLevel] !== undefined) dist[m.masteryLevel]++; });

                      return (
                        <tr key={stu.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-800">{stu.name || stu.studentCode}</div>
                            <div className="text-[10px] text-slate-400">{stu.studentCode}</div>
                          </td>
                          <td className="px-4 py-3 text-center font-extrabold text-indigo-600">{stu.completions}</td>
                          <td className="px-4 py-3 text-center">
                            {stu.avgScore != null
                              ? <span className={`font-extrabold ${scoreColor(stu.avgScore)}`}>{stu.avgScore}점</span>
                              : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center gap-1 flex-wrap">
                              {stuMasteries.length === 0
                                ? <span className="text-slate-300 text-xs">-</span>
                                : Object.entries(MASTERY).map(([lv, cfg]) =>
                                    dist[lv] > 0 ? (
                                      <span key={lv} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.bg}`}>
                                        {cfg.emoji}{dist[lv]}
                                      </span>
                                    ) : null
                                  )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {stu.todayCount > 0
                              ? <span className="text-[10px] font-bold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{stu.todayCount}회</span>
                              : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-500 text-xs">{fmtDate(stu.lastDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* ══════════════════════════════════════════
            탭 3: 종합 현황
        ══════════════════════════════════════════ */}
        {tab === 'dashboard' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: '총 학습 완료', value: allProgress.length, unit: '건', icon: '✅', color: 'emerald' },
                { label: '오늘 완료',   value: todayProg.length,   unit: '건', icon: '📅', color: 'sky' },
                { label: '전체 평균',   value: avgScore != null ? `${avgScore}점` : '-', unit: '', icon: '📈', color: avgScore >= 70 ? 'emerald' : avgScore != null ? 'amber' : 'slate' },
                { label: '참여 학생',   value: studentStats.filter(s => s.completions > 0).length, unit: `/${students.length}명`, icon: '👥', color: 'indigo' },
              ].map(({ label, value, unit, icon, color }) => (
                <div key={label} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <div className="text-xl mb-1">{icon}</div>
                  <div className={`text-2xl font-extrabold text-${color}-600`}>{value}<span className="text-sm font-bold text-slate-400">{unit}</span></div>
                  <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
              <h3 className="font-extrabold text-slate-700 text-sm mb-3">📅 오늘 학습 활동</h3>
              {todayProg.length === 0 ? (
                <p className="text-slate-400 text-sm py-6 text-center">오늘 완료된 학습이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {[...todayProg]
                    .sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0))
                    .slice(0, 20)
                    .map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl text-sm">
                      <span className="font-bold text-slate-700 w-20 shrink-0">
                        {students.find(s => s.studentCode === p.studentCode)?.name || p.studentCode?.slice(-5)}
                      </span>
                      <span className="flex-1 text-xs text-slate-500 truncate">{p.unitName} · {p.lessonTitle}</span>
                      <span className={`font-extrabold shrink-0 ${scoreColor(p.score || 0)}`}>{p.score}점</span>
                      <span className="text-xs text-slate-400 shrink-0">{p.correctCount}/{p.totalCount}</span>
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
