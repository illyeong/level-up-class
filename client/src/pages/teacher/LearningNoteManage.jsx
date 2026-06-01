import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, updateDoc, doc,
  query, where, serverTimestamp, getDoc, setDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { getMaxExpForLevel } from '../../utils/leveling';

const SUBJECTS = ['국어', '수학', '사회', '과학', '영어', '도덕', '체육', '음악', '미술', '실과', '창체'];

const STATUS_BADGE = {
  pending:  { label: '🕐 대기',   cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  approved: { label: '✅ 승인',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected: { label: '❌ 반려',   cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  partial:  { label: '🔶 일부승인', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
};

// 과목별 상태: subject 객체에 status 없으면 pending으로 간주
const subjectStatus = (s) => s.status || 'pending';

// 노트 전체 상태 계산
const calcOverallStatus = (subjects) => {
  const statuses = subjects.map(subjectStatus);
  if (statuses.every(s => s === 'approved')) return 'approved';
  if (statuses.every(s => s === 'rejected')) return 'rejected';
  if (statuses.every(s => s === 'pending'))  return 'pending';
  return 'partial';
};

const DEFAULT_SETTINGS = { minCoreLength: 10, minThoughtLength: 20, rewardGold: 10, rewardExp: 30, rewardDiamond: 10 };

const getMaxExp = getMaxExpForLevel;

export default function LearningNoteManage({ selectedClass }) {
  const teacherUid = selectedClass?.teacherUid;

  const [tab, setTab]             = useState('queue'); // 'queue' | 'students' | 'settings'
  const [notes, setNotes]         = useState([]);
  const [students, setStudents]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [settings, setSettings]   = useState(DEFAULT_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);
  const [bulkApproving, setBulkApproving]   = useState(false);

  // filters
  const [filterName, setFilterName]       = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterFrom, setFilterFrom]       = useState('');
  const [filterTo, setFilterTo]           = useState('');
  const [filterStatus, setFilterStatus]   = useState('pending');

  // approve/reject modal — subjectIdx: 과목 인덱스 (-1이면 전체 승인)
  const [modal, setModal]       = useState(null); // { type: 'approve'|'reject', note, subjectIdx }
  const [comment, setComment]   = useState('');
  const [processing, setProcessing] = useState(false);

  // student view
  const [expandedStudent, setExpandedStudent] = useState(null);

  // toast
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── load ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!teacherUid) return;
    (async () => {
      setLoading(true);
      try {
        const [noteSnap, settSnap, studentSnap] = await Promise.all([
          getDocs(query(collection(db, 'learningNotes'), where('teacherUid', '==', teacherUid))),
          getDoc(doc(db, 'learningSettings', teacherUid)),
          getDocs(query(collection(db, 'students'), where('teacherUid', '==', teacherUid))),
        ]);
        setNotes(
          noteSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        );
        setStudents(
          studentSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
              const an = parseInt(a.studentCode?.split('-').pop() || '0');
              const bn = parseInt(b.studentCode?.split('-').pop() || '0');
              return an - bn;
            })
        );
        if (settSnap.exists()) setSettings(s => ({ ...s, ...settSnap.data() }));
      } finally { setLoading(false); }
    })();
  }, [teacherUid]);

  // ── filtered list ─────────────────────────────────────────────
  const filtered = notes.filter(n => {
    if (filterStatus && n.status !== filterStatus) return false;
    if (filterName && !n.studentName?.includes(filterName)) return false;
    if (filterSubject && !(n.subjects || []).some(s => s.subject === filterSubject)) return false;
    if (filterFrom && n.date < filterFrom) return false;
    if (filterTo   && n.date > filterTo)   return false;
    return true;
  });

  // ── 과목 1개 보상 지급 ────────────────────────────────────────
  const paySubjectReward = async (note) => {
    const studentRef  = doc(db, 'students', note.studentId);
    const studentSnap = await getDoc(studentRef);
    if (!studentSnap.exists()) return { rewardGold: 0, rewardDia: 0, rewardExp: 0 };
    const sd = studentSnap.data();
    const rewardGold = settings.rewardGold;
    const rewardDia  = settings.rewardDiamond;
    const rewardExp  = settings.rewardExp;
    let newExp = (sd.exp || 0) + rewardExp;
    let newLv  = sd.level || 1;
    while (newExp >= getMaxExp(newLv)) { newExp -= getMaxExp(newLv); newLv++; }
    await updateDoc(studentRef, {
      gold: (sd.gold || 0) + rewardGold, diamonds: (sd.diamonds || 0) + rewardDia,
      exp: newExp, level: newLv,
    });
    return { rewardGold, rewardDia, rewardExp };
  };

  // ── 과목 승인 ─────────────────────────────────────────────────
  const approveSubject = async (note, subjectIdx, teacherComment = '') => {
    const updatedSubjects = (note.subjects || []).map((s, i) =>
      i === subjectIdx && subjectStatus(s) === 'pending'
        ? { ...s, status: 'approved', comment: teacherComment.trim(), rewardPaid: true }
        : s
    );
    const overall = calcOverallStatus(updatedSubjects);
    await updateDoc(doc(db, 'learningNotes', note.id), {
      subjects: updatedSubjects, status: overall,
      studentSeen: false,
      ...(overall === 'approved' ? { approvedAt: serverTimestamp() } : {}),
    });
    return await paySubjectReward(note);
  };

  // ── 과목 반려 ─────────────────────────────────────────────────
  const rejectSubject = async (note, subjectIdx, teacherComment = '') => {
    const updatedSubjects = (note.subjects || []).map((s, i) =>
      i === subjectIdx && subjectStatus(s) === 'pending'
        ? { ...s, status: 'rejected', comment: teacherComment.trim() }
        : s
    );
    const overall = calcOverallStatus(updatedSubjects);
    await updateDoc(doc(db, 'learningNotes', note.id), {
      subjects: updatedSubjects, status: overall, studentSeen: false,
    });
  };

  // ── 모달 확인 (승인) ──────────────────────────────────────────
  const approve = async () => {
    const { note, subjectIdx } = modal;
    setProcessing(true);
    try {
      let reward;
      if (subjectIdx === -1) {
        // 전체 미결 과목 한번에 승인
        let updatedSubjects = note.subjects || [];
        let totalReward = { rewardGold: 0, rewardDia: 0, rewardExp: 0 };
        const pendingIdxs = updatedSubjects.map((s, i) => subjectStatus(s) === 'pending' ? i : -1).filter(i => i >= 0);
        updatedSubjects = updatedSubjects.map(s => subjectStatus(s) === 'pending' ? { ...s, status: 'approved', comment: comment.trim(), rewardPaid: true } : s);
        const overall = calcOverallStatus(updatedSubjects);
        await updateDoc(doc(db, 'learningNotes', note.id), {
          subjects: updatedSubjects, status: overall, studentSeen: false,
          ...(overall === 'approved' ? { approvedAt: serverTimestamp() } : {}),
        });
        for (let i = 0; i < pendingIdxs.length; i++) {
          const r = await paySubjectReward(note);
          totalReward.rewardGold += r.rewardGold;
          totalReward.rewardDia  += r.rewardDia;
          totalReward.rewardExp  += r.rewardExp;
        }
        reward = totalReward;
        setNotes(prev => prev.map(n => n.id === note.id ? { ...n, subjects: updatedSubjects, status: overall } : n));
      } else {
        reward = await approveSubject(note, subjectIdx, comment);
        setNotes(prev => prev.map(n => {
          if (n.id !== note.id) return n;
          const updatedSubjects = (n.subjects || []).map((s, i) =>
            i === subjectIdx ? { ...s, status: 'approved', comment: comment.trim(), rewardPaid: true } : s
          );
          return { ...n, subjects: updatedSubjects, status: calcOverallStatus(updatedSubjects) };
        }));
      }
      showToast(`✅ 승인 · 골드 +${reward.rewardGold}, 다이아 +${reward.rewardDia}, 경험치 +${reward.rewardExp}`);
      setModal(null); setComment('');
    } catch (e) { showToast('오류가 발생했습니다.', 'error'); console.error(e); }
    finally { setProcessing(false); }
  };

  // ── 모달 확인 (반려) ──────────────────────────────────────────
  const reject = async () => {
    const { note, subjectIdx } = modal;
    setProcessing(true);
    try {
      await rejectSubject(note, subjectIdx, comment);
      setNotes(prev => prev.map(n => {
        if (n.id !== note.id) return n;
        const updatedSubjects = (n.subjects || []).map((s, i) =>
          i === subjectIdx ? { ...s, status: 'rejected', comment: comment.trim() } : s
        );
        return { ...n, subjects: updatedSubjects, status: calcOverallStatus(updatedSubjects) };
      }));
      showToast('반려 처리되었습니다.');
      setModal(null); setComment('');
    } catch { showToast('오류가 발생했습니다.', 'error'); }
    finally { setProcessing(false); }
  };

  // ── 일괄 승인 (모든 pending 노트의 모든 pending 과목) ─────────
  const approveAll = async () => {
    const pendingList = filtered.filter(n => ['pending', 'partial'].includes(n.status));
    if (!pendingList.length) return;
    if (!window.confirm(`대기 중인 과목을 모두 승인하시겠습니까?\n보상이 각 학생에게 자동 지급됩니다.`)) return;
    setBulkApproving(true);
    let ok = 0;
    try {
      for (const note of pendingList) {
        try {
          const pendingSubjects = (note.subjects || []).filter(s => subjectStatus(s) === 'pending');
          if (!pendingSubjects.length) continue;
          const updatedSubjects = (note.subjects || []).map(s =>
            subjectStatus(s) === 'pending' ? { ...s, status: 'approved', rewardPaid: true } : s
          );
          const overall = calcOverallStatus(updatedSubjects);
          await updateDoc(doc(db, 'learningNotes', note.id), {
            subjects: updatedSubjects, status: overall, studentSeen: false,
            ...(overall === 'approved' ? { approvedAt: serverTimestamp() } : {}),
          });
          for (let i = 0; i < pendingSubjects.length; i++) await paySubjectReward(note);
          setNotes(prev => prev.map(n => n.id === note.id ? { ...n, subjects: updatedSubjects, status: overall } : n));
          ok++;
        } catch (e) { console.error('bulk approve error:', note.id, e); }
      }
      showToast(`✅ ${ok}건 일괄 승인 완료`);
    } finally { setBulkApproving(false); }
  };

  // ── save settings ─────────────────────────────────────────────
  const saveSettings = async () => {
    if (!teacherUid) return;
    setSavingSettings(true);
    try {
      await setDoc(doc(db, 'learningSettings', teacherUid), settings, { merge: true });
      showToast('설정이 저장되었습니다.');
    } catch { showToast('저장에 실패했습니다.', 'error'); }
    finally { setSavingSettings(false); }
  };

  const pendingCount = notes.filter(n => n.status === 'pending').length;

  // ── NoteCard (과목별 개별 승인/반려) ────────────────────────────
  const renderNoteCard = (note) => {
    const overallStatus = note.status || 'pending';
    const stripCls = overallStatus === 'approved' ? 'bg-emerald-400'
                   : overallStatus === 'rejected'  ? 'bg-rose-400'
                   : overallStatus === 'partial'   ? 'bg-orange-400'
                   : 'bg-amber-400';
    const badge = STATUS_BADGE[overallStatus] || STATUS_BADGE.pending;
    const hasPending = (note.subjects || []).some(s => subjectStatus(s) === 'pending');

    return (
      <div key={note.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className={`h-1.5 ${stripCls}`} />
        <div className="p-3 flex-1 flex flex-col gap-2">
          {/* 헤더 */}
          <div className="flex items-start justify-between gap-1">
            <div>
              <span className="font-extrabold text-slate-800 text-xs leading-tight block truncate">{note.studentName}</span>
              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                <span className="text-[9px] text-slate-400">{note.date}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                <span className="text-[9px] text-slate-400">·{note.subjectCount}과목</span>
              </div>
            </div>
            {/* 미결 과목 전체 승인 버튼 */}
            {hasPending && (
              <button onClick={() => { setModal({ type: 'approve', note, subjectIdx: -1 }); setComment(''); }}
                className="shrink-0 text-[9px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-1.5 py-0.5 rounded-lg transition-colors">
                ✓ 전체승인
              </button>
            )}
          </div>

          {/* 과목별 내용 + 개별 버튼 */}
          <div className="space-y-1.5 flex-1">
            {(note.subjects || []).map((s, i) => {
              const st = subjectStatus(s);
              const subBg = st === 'approved' ? 'bg-emerald-50 border-emerald-200'
                          : st === 'rejected'  ? 'bg-rose-50 border-rose-200'
                          : 'bg-slate-50 border-slate-100';
              return (
                <div key={i} className={`rounded-lg p-2 border ${subBg}`}>
                  {/* 과목 헤더 */}
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-extrabold text-indigo-700">{s.subject}</span>
                    <div className="flex items-center gap-1">
                      {st === 'approved' && <span className="text-[9px] text-emerald-600 font-bold">✅ 승인</span>}
                      {st === 'rejected' && <span className="text-[9px] text-rose-600 font-bold">❌ 반려</span>}
                      {st === 'pending' && (
                        <>
                          <button onClick={() => { setModal({ type: 'approve', note, subjectIdx: i }); setComment(''); }}
                            className="text-[9px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-1.5 py-0.5 rounded transition-colors">
                            ✓
                          </button>
                          <button onClick={() => { setModal({ type: 'reject', note, subjectIdx: i }); setComment(''); }}
                            className="text-[9px] bg-rose-500 hover:bg-rose-600 text-white font-bold px-1.5 py-0.5 rounded transition-colors">
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-700 line-clamp-3 leading-relaxed">{s.coreContent}</p>
                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mt-0.5 italic">{s.myThought}</p>
                  {s.imageBase64 && (
                    <img src={s.imageBase64} alt="" className="w-full rounded mt-1 max-h-16 object-contain bg-white" />
                  )}
                  {/* 과목별 선생님 코멘트 */}
                  {s.comment && (
                    <p className="text-[9px] text-slate-500 italic mt-1">💬 {s.comment}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* 보상 안내 */}
          {hasPending && (
            <p className="text-[9px] text-slate-400">
              대기과목 보상: 🪙{settings.rewardGold}/과목 💎{settings.rewardDiamond}/과목
            </p>
          )}
          {!hasPending && overallStatus === 'approved' && (
            <p className="text-[9px] text-emerald-600 font-bold">✅ 전체 지급완료</p>
          )}
        </div>
      </div>
    );
  };

  // ── stats for student view ────────────────────────────────────
  const submittedIds = new Set(notes.map(n => n.studentId));
  const submittedCount    = students.filter(s => submittedIds.has(s.id)).length;
  const notSubmittedCount = students.length - submittedCount;

  // group notes by student
  const notesByStudent = {};
  notes.forEach(n => {
    if (!notesByStudent[n.studentId]) notesByStudent[n.studentId] = [];
    notesByStudent[n.studentId].push(n);
  });

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-7xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">📚 배움노트 관리</h1>
            <p className="text-slate-500 text-sm mt-0.5">학생들의 학습 포트폴리오를 확인하고 보상을 지급합니다</p>
          </div>
          {pendingCount > 0 && (
            <div className="bg-amber-100 text-amber-700 font-extrabold px-4 py-2 rounded-xl text-sm border border-amber-200">
              🕐 승인 대기 {pendingCount}건
            </div>
          )}
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-5">
          {[
            ['queue',    '📋 승인 관리'],
            ['students', '👥 학생별 현황'],
            ['settings', '⚙️ 설정'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-colors
                ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              {label}
              {id === 'queue' && pendingCount > 0 && (
                <span className="ml-2 bg-amber-400 text-amber-900 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── 승인 관리 탭 ────────────────────────────────────────── */}
        {tab === 'queue' && (
          <>
            {/* 필터 + 전체승인 */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm mb-5 flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">상태</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white">
                  <option value="">전체</option>
                  <option value="pending">승인 대기</option>
                  <option value="approved">승인 완료</option>
                  <option value="rejected">반려</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">학생 이름</label>
                <input value={filterName} onChange={e => setFilterName(e.target.value)}
                  placeholder="이름 검색"
                  className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm w-28 focus:outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">과목</label>
                <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
                  className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white">
                  <option value="">전체</option>
                  {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">시작일</label>
                <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                  className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">종료일</label>
                <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                  className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => { setFilterName(''); setFilterSubject(''); setFilterFrom(''); setFilterTo(''); setFilterStatus('pending'); }}
                  className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 font-bold border border-slate-200 rounded-xl bg-white hover:bg-slate-50">
                  초기화
                </button>
                {filtered.filter(n => n.status === 'pending').length > 0 && (
                  <button onClick={approveAll} disabled={bulkApproving}
                    className="px-4 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                    {bulkApproving
                      ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> 처리 중...</>
                      : <>✅ 전체 승인 ({filtered.filter(n => n.status === 'pending').length}건)</>
                    }
                  </button>
                )}
                <span className="text-sm text-slate-400">{filtered.length}건</span>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 gap-2">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-sm text-slate-400">불러오는 중...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <div className="text-5xl mb-3">📭</div>
                <p className="font-bold">조건에 맞는 배움노트가 없습니다</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {filtered.map(note => renderNoteCard(note))}
              </div>
            )}
          </>
        )}

        {/* ── 학생별 현황 탭 ─────────────────────────────────────── */}
        {tab === 'students' && (
          loading ? (
            <div className="flex items-center justify-center py-20 gap-2">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm text-slate-400">불러오는 중...</span>
            </div>
          ) : (
            <>
              {/* 통계 바 */}
              <div className="bg-white rounded-2xl px-5 py-3 border border-slate-200 shadow-sm mb-4 flex flex-wrap gap-5 text-sm font-bold">
                <span className="text-slate-600">전체 <span className="text-slate-800">{students.length}명</span></span>
                <span className="text-emerald-600">제출 {submittedCount}명</span>
                <span className="text-slate-400">미제출 {notSubmittedCount}명</span>
                <span className="text-amber-600">승인 대기 {pendingCount}건</span>
              </div>

              {students.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <div className="text-5xl mb-3">👥</div>
                  <p className="font-bold">등록된 학생이 없습니다</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {students.map(student => {
                    const studentNotes   = (notesByStudent[student.id] || []).sort((a, b) => b.date.localeCompare(a.date));
                    const hasNotes       = studentNotes.length > 0;
                    const pendingNotes   = studentNotes.filter(n => n.status === 'pending');
                    const approvedNotes  = studentNotes.filter(n => n.status === 'approved');
                    const rejectedNotes  = studentNotes.filter(n => n.status === 'rejected');
                    const isExpanded     = expandedStudent === student.id;

                    return (
                      <div key={student.id} className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${isExpanded ? 'col-span-2' : 'col-span-1'}`}>
                        {/* 학생 헤더 */}
                        <div
                          onClick={() => hasNotes && setExpandedStudent(isExpanded ? null : student.id)}
                          className={`px-4 py-3.5 flex items-center gap-3 transition-colors
                            ${hasNotes ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'}`}
                        >
                          <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200">
                            {student.characterImage
                              ? <img src={student.characterImage} alt="" className="w-full h-full object-contain scale-[2]" style={{ imageRendering: 'pixelated' }} />
                              : <span className="text-lg">🧑‍🎓</span>}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-slate-800 text-sm">{student.name || student.studentCode}</span>
                              <span className="text-xs text-slate-400">{student.studentCode}</span>
                              {!hasNotes && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">미제출</span>
                              )}
                              {pendingNotes.length > 0 && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                  대기 {pendingNotes.length}
                                </span>
                              )}
                              {approvedNotes.length > 0 && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  승인 {approvedNotes.length}
                                </span>
                              )}
                              {rejectedNotes.length > 0 && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200">
                                  반려 {rejectedNotes.length}
                                </span>
                              )}
                            </div>
                            {hasNotes && (
                              <div className="text-xs text-slate-400 mt-0.5">총 {studentNotes.length}건 제출</div>
                            )}
                          </div>

                          {hasNotes && (
                            <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </div>

                        {/* 노트 목록 (펼쳤을 때) */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
                            <div className="grid grid-cols-4 gap-3">
                              {studentNotes.map(note => renderNoteCard(note))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )
        )}

        {/* ── 설정 탭 ─────────────────────────────────────────────── */}
        {tab === 'settings' && (
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6 max-w-lg">
            <h2 className="font-extrabold text-slate-800 text-lg">⚙️ 배움노트 기준 설정</h2>

            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-bold border-b border-slate-100 pb-2">📏 최소 글자 수 기준</p>
              {[
                { key: 'minCoreLength',    label: '핵심 배움 최소 글자 수',   desc: '핵심 배움 칸에 입력해야 하는 최소 글자' },
                { key: 'minThoughtLength', label: '나의 생각 최소 글자 수',    desc: '나의 생각 칸 최소 글자' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-700">{label}</div>
                    <div className="text-xs text-slate-400">{desc}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} max={200} value={settings[key]}
                      onChange={e => setSettings(s => ({ ...s, [key]: Number(e.target.value) }))}
                      className="w-20 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:border-indigo-400" />
                    <span className="text-sm text-slate-500">자</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-bold border-b border-slate-100 pb-2">💰 과목당 보상 (승인 시 과목 수 × 아래 값 지급)</p>
              {[
                { key: 'rewardGold',    label: '골드',   icon: '🪙', color: 'text-amber-600' },
                { key: 'rewardExp',     label: '경험치', icon: '⭐', color: 'text-indigo-600' },
                { key: 'rewardDiamond', label: '다이아', icon: '💎', color: 'text-sky-600' },
              ].map(({ key, label, icon, color }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <div className={`text-sm font-bold ${color}`}>{icon} {label}</div>
                    <div className="text-xs text-slate-400">과목 1개 승인 시 지급량</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={9999} value={settings[key]}
                      onChange={e => setSettings(s => ({ ...s, [key]: Number(e.target.value) }))}
                      className="w-24 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:border-indigo-400" />
                    <span className="text-sm text-slate-500">{label}</span>
                  </div>
                </div>
              ))}
              <div className="bg-indigo-50 rounded-xl p-4 text-xs text-indigo-700 border border-indigo-100 space-y-1">
                <div className="font-extrabold mb-2">예시 (현재 설정 기준)</div>
                {[1, 3, 6].map(n => (
                  <div key={n}>과목 {n}개 → 골드 {settings.rewardGold * n} / 다이아 {settings.rewardDiamond * n} / 경험치 {settings.rewardExp * n}</div>
                ))}
              </div>
            </div>

            <button onClick={saveSettings} disabled={savingSettings}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40 transition-colors">
              {savingSettings ? '저장 중...' : '💾 설정 저장'}
            </button>
          </div>
        )}
      </div>

      {/* 승인/반려 모달 */}
      {modal && (() => {
        const { note, subjectIdx, type } = modal;
        const isAll = subjectIdx === -1;
        const targetSubject = !isAll ? (note.subjects || [])[subjectIdx] : null;
        const pendingCount = isAll ? (note.subjects || []).filter(s => subjectStatus(s) === 'pending').length : 1;
        const totalGold = settings.rewardGold    * (type === 'approve' ? pendingCount : 0);
        const totalDia  = settings.rewardDiamond * (type === 'approve' ? pendingCount : 0);
        const totalExp  = settings.rewardExp     * (type === 'approve' ? pendingCount : 0);
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
              <h3 className="font-extrabold text-slate-800">
                {type === 'approve' ? '✅ 승인하기' : '❌ 반려하기'}
              </h3>
              <div className="bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-700 border border-slate-100">
                <span className="font-bold">{note.studentName}</span> · {note.date}
                <div className="text-xs text-indigo-600 font-bold mt-0.5">
                  {isAll
                    ? `미결 ${pendingCount}과목 전체`
                    : `${targetSubject?.subject} 과목`}
                </div>
              </div>
              {type === 'approve' && (
                <div className="bg-emerald-50 rounded-xl p-3 text-xs text-emerald-700 font-bold">
                  지급: 골드 +{totalGold} / 다이아 +{totalDia} / 경험치 +{totalExp}
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  {type === 'approve' ? '코멘트 (선택)' : '반려 사유 (선택)'}
                </label>
                <textarea value={comment} onChange={e => setComment(e.target.value)}
                  placeholder={type === 'approve' ? '잘했어요! (생략 가능)' : '반려 사유를 적어주세요 (생략 가능)'}
                  rows={3}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-400" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setModal(null); setComment(''); }}
                  className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm">취소</button>
                <button onClick={type === 'approve' ? approve : reject} disabled={processing}
                  className={`flex-1 py-2.5 text-white font-bold rounded-xl text-sm disabled:opacity-40 transition-colors
                    ${type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-500 hover:bg-rose-600'}`}>
                  {processing ? '처리 중...' : type === 'approve' ? '승인' : '반려'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
