import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, updateDoc, doc,
  query, where, serverTimestamp, getDoc, setDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';

const SUBJECTS = ['국어', '수학', '사회', '과학', '영어', '도덕', '체육', '음악', '미술', '실과', '창체'];

const STATUS_BADGE = {
  pending:  { label: '🕐 승인 대기', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  approved: { label: '✅ 승인 완료', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected: { label: '❌ 반려',      cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

const DEFAULT_SETTINGS = { minCoreLength: 10, minThoughtLength: 20, rewardGold: 30, rewardExp: 30, rewardDiamond: 20 };

const getMaxExp = (lv) => lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;

export default function LearningNoteManage({ selectedClass }) {
  const teacherUid = selectedClass?.teacherUid;

  const [tab, setTab]           = useState('queue'); // 'queue' | 'settings'
  const [notes, setNotes]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);

  // filters
  const [filterName, setFilterName]   = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterFrom, setFilterFrom]   = useState('');
  const [filterTo, setFilterTo]       = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');

  // approve/reject modal
  const [modal, setModal]   = useState(null); // { type: 'approve'|'reject', note }
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);

  // detail
  const [detail, setDetail] = useState(null);

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
        const [noteSnap, settSnap] = await Promise.all([
          getDocs(query(collection(db, 'learningNotes'), where('teacherUid', '==', teacherUid))),
          getDoc(doc(db, 'learningSettings', teacherUid)),
        ]);
        setNotes(noteSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        if (settSnap.exists()) setSettings(s => ({ ...s, ...settSnap.data() }));
      } finally { setLoading(false); }
    })();
  }, [teacherUid]);

  // ── filter ────────────────────────────────────────────────────
  const filtered = notes.filter(n => {
    if (filterStatus && n.status !== filterStatus) return false;
    if (filterName && !n.studentName?.includes(filterName)) return false;
    if (filterSubject && !(n.subjects || []).some(s => s.subject === filterSubject)) return false;
    if (filterFrom && n.date < filterFrom) return false;
    if (filterTo   && n.date > filterTo)   return false;
    return true;
  });

  // ── approve ───────────────────────────────────────────────────
  const approve = async () => {
    const note = modal.note;
    setProcessing(true);
    try {
      // 1. update note
      await updateDoc(doc(db, 'learningNotes', note.id), {
        status:         'approved',
        teacherComment: comment.trim(),
        approvedAt:     serverTimestamp(),
        rewardPaid:     true,
        studentSeen:    false,
      });

      // 2. get student data
      const studentRef = doc(db, 'students', note.studentId);
      const studentSnap = await getDoc(studentRef);
      if (!studentSnap.exists()) throw new Error('학생 없음');
      const sd = studentSnap.data();

      const rewardGold = settings.rewardGold * note.subjectCount;
      const rewardDia  = settings.rewardDiamond * note.subjectCount;
      const rewardExp  = settings.rewardExp * note.subjectCount;

      let newGold = (sd.gold || 0) + rewardGold;
      let newDia  = (sd.diamonds || 0) + rewardDia;
      let newExp  = (sd.exp || 0) + rewardExp;
      let newLv   = sd.level || 1;
      while (newExp >= getMaxExp(newLv)) { newExp -= getMaxExp(newLv); newLv++; }

      await updateDoc(studentRef, { gold: newGold, diamonds: newDia, exp: newExp, level: newLv });

      setNotes(prev => prev.map(n => n.id === note.id
        ? { ...n, status: 'approved', teacherComment: comment.trim(), rewardPaid: true }
        : n));
      showToast(`✅ 승인 완료 · 골드 +${rewardGold}, 다이아 +${rewardDia}, 경험치 +${rewardExp}`);
      setModal(null); setComment('');
    } catch (e) { showToast('오류가 발생했습니다.', 'error'); console.error(e); }
    finally { setProcessing(false); }
  };

  // ── reject ────────────────────────────────────────────────────
  const reject = async () => {
    if (!comment.trim()) { showToast('반려 사유를 입력해주세요.', 'error'); return; }
    const note = modal.note;
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'learningNotes', note.id), {
        status: 'rejected', teacherComment: comment.trim(), studentSeen: false,
      });
      setNotes(prev => prev.map(n => n.id === note.id
        ? { ...n, status: 'rejected', teacherComment: comment.trim() }
        : n));
      showToast('반려 처리되었습니다.');
      setModal(null); setComment('');
    } catch { showToast('오류가 발생했습니다.', 'error'); }
    finally { setProcessing(false); }
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

  // ── detail view ───────────────────────────────────────────────
  if (detail) {
    const badge = STATUS_BADGE[detail.status] || STATUS_BADGE.pending;
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetail(null)}
              className="text-slate-500 hover:text-slate-800 font-bold text-sm px-3 py-1.5 bg-white rounded-xl border border-slate-200">← 목록</button>
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${badge.cls}`}>{badge.label}</span>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-extrabold text-slate-800 text-lg">{detail.studentName}</div>
                <div className="text-xs text-slate-400">{detail.date} · {detail.subjectCount}과목</div>
              </div>
              {detail.status === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => { setModal({ type: 'approve', note: detail }); setComment(''); }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl">승인</button>
                  <button onClick={() => { setModal({ type: 'reject', note: detail }); setComment(''); }}
                    className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl">반려</button>
                </div>
              )}
            </div>
            {(detail.subjects || []).map((s, i) => (
              <div key={i} className="border border-slate-100 rounded-xl p-4 space-y-2 bg-slate-50">
                <div className="font-extrabold text-indigo-700 text-sm">{s.subject}</div>
                <div>
                  <div className="text-[11px] font-bold text-slate-500 mb-0.5">핵심 배움</div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{s.coreContent}</p>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-500 mb-0.5">나의 생각</div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{s.myThought}</p>
                </div>
                {s.imageBase64 && (
                  <img src={s.imageBase64} alt="" className="w-full rounded-xl max-h-60 object-contain bg-white border border-slate-200" />
                )}
              </div>
            ))}
          </div>

          {modal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
                <h3 className="font-extrabold text-slate-800">
                  {modal.type === 'approve' ? '✅ 승인하기' : '❌ 반려하기'}
                </h3>
                {modal.type === 'approve' && (
                  <div className="bg-emerald-50 rounded-xl p-3 text-xs text-emerald-700 font-bold">
                    지급 예정: 골드 +{settings.rewardGold * modal.note.subjectCount} /
                    다이아 +{settings.rewardDiamond * modal.note.subjectCount} /
                    경험치 +{settings.rewardExp * modal.note.subjectCount}
                  </div>
                )}
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">
                    {modal.type === 'approve' ? '코멘트 (선택)' : '반려 사유 (필수)'}
                  </label>
                  <textarea value={comment} onChange={e => setComment(e.target.value)}
                    placeholder={modal.type === 'approve' ? '잘했어요! (생략 가능)' : '반려 사유를 입력하세요...'}
                    rows={3}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-400" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setModal(null)} className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm">취소</button>
                  <button onClick={modal.type === 'approve' ? approve : reject} disabled={processing}
                    className={`flex-1 py-2.5 text-white font-bold rounded-xl text-sm disabled:opacity-40 ${modal.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-500 hover:bg-rose-600'}`}>
                    {processing ? '처리 중...' : modal.type === 'approve' ? '승인' : '반려'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
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
          {[['queue', '📋 승인 관리'], ['settings', '⚙️ 설정']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-colors ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              {label}{id === 'queue' && pendingCount > 0 && <span className="ml-2 bg-amber-400 text-amber-900 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
            </button>
          ))}
        </div>

        {/* ── 승인 관리 탭 ── */}
        {tab === 'queue' && (
          <>
            {/* 필터 */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm mb-4 flex flex-wrap gap-3 items-end">
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
                  placeholder="이름 검색" className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm w-28 focus:outline-none focus:border-indigo-400" />
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
              <button onClick={() => { setFilterName(''); setFilterSubject(''); setFilterFrom(''); setFilterTo(''); setFilterStatus('pending'); }}
                className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 font-bold border border-slate-200 rounded-xl bg-white hover:bg-slate-50">
                초기화
              </button>
              <span className="ml-auto text-sm text-slate-400 self-center">{filtered.length}건</span>
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
              <div className="space-y-3">
                {filtered.map(note => {
                  const badge = STATUS_BADGE[note.status] || STATUS_BADGE.pending;
                  return (
                    <div key={note.id} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-extrabold text-slate-800">{note.studentName}</span>
                            <span className="text-xs text-slate-400">{note.date}</span>
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                          </div>
                          <div className="flex gap-2 flex-wrap mb-2">
                            {(note.subjects || []).map((s, i) => (
                              <span key={i} className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-lg border border-indigo-100">
                                {s.subject}
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-slate-400">
                            {note.subjectCount}과목 · 지급 예정: 골드 {settings.rewardGold * note.subjectCount} /
                            다이아 {settings.rewardDiamond * note.subjectCount} /
                            경험치 {settings.rewardExp * note.subjectCount}
                          </p>
                          {note.teacherComment && (
                            <p className="text-xs text-slate-500 mt-1 italic">코멘트: {note.teacherComment}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <button onClick={() => setDetail(note)}
                            className="px-4 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl border border-slate-200">
                            내용 보기
                          </button>
                          {note.status === 'pending' && (
                            <>
                              <button onClick={() => { setModal({ type: 'approve', note }); setComment(''); }}
                                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl">
                                승인 ✓
                              </button>
                              <button onClick={() => { setModal({ type: 'reject', note }); setComment(''); }}
                                className="px-4 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl border border-rose-200">
                                반려
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── 설정 탭 ── */}
        {tab === 'settings' && (
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6 max-w-lg">
            <h2 className="font-extrabold text-slate-800 text-lg">⚙️ 배움노트 기준 설정</h2>

            <div className="space-y-4">
              <p className="text-xs text-slate-500 font-bold border-b border-slate-100 pb-2">📏 최소 글자 수 기준</p>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-700">핵심 배움 최소 글자 수</div>
                  <div className="text-xs text-slate-400">학생이 핵심 배움 칸에 입력해야 하는 최소 글자</div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={200} value={settings.minCoreLength}
                    onChange={e => setSettings(s => ({ ...s, minCoreLength: Number(e.target.value) }))}
                    className="w-20 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:border-indigo-400" />
                  <span className="text-sm text-slate-500">자</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-700">나의 생각 최소 글자 수</div>
                  <div className="text-xs text-slate-400">나의 생각/더 알고 싶은 점 칸 최소 글자</div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={200} value={settings.minThoughtLength}
                    onChange={e => setSettings(s => ({ ...s, minThoughtLength: Number(e.target.value) }))}
                    className="w-20 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:border-indigo-400" />
                  <span className="text-sm text-slate-500">자</span>
                </div>
              </div>
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

              {/* preview */}
              <div className="bg-indigo-50 rounded-xl p-4 text-xs text-indigo-700 border border-indigo-100 space-y-1">
                <div className="font-extrabold mb-2">예시 (현재 설정 기준)</div>
                {[1, 3, 6].map(n => (
                  <div key={n}>과목 {n}개 승인 → 골드 {settings.rewardGold * n} / 다이아 {settings.rewardDiamond * n} / 경험치 {settings.rewardExp * n}</div>
                ))}
              </div>
            </div>

            <button onClick={saveSettings} disabled={savingSettings}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40">
              {savingSettings ? '저장 중...' : '💾 설정 저장'}
            </button>
          </div>
        )}
      </div>

      {/* 승인/반려 모달 (목록 화면용) */}
      {modal && !detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-extrabold text-slate-800">
              {modal.type === 'approve' ? '✅ 승인하기' : '❌ 반려하기'}
            </h3>
            <div className="text-sm text-slate-600">
              <span className="font-bold">{modal.note.studentName}</span> · {modal.note.date} · {modal.note.subjectCount}과목
            </div>
            {modal.type === 'approve' && (
              <div className="bg-emerald-50 rounded-xl p-3 text-xs text-emerald-700 font-bold">
                지급: 골드 +{settings.rewardGold * modal.note.subjectCount} /
                다이아 +{settings.rewardDiamond * modal.note.subjectCount} /
                경험치 +{settings.rewardExp * modal.note.subjectCount}
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                {modal.type === 'approve' ? '코멘트 (선택)' : '반려 사유 (필수)'}
              </label>
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                placeholder={modal.type === 'approve' ? '잘했어요! (생략 가능)' : '반려 사유를 입력하세요...'}
                rows={3}
                className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-400" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setModal(null); setComment(''); }}
                className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm">취소</button>
              <button onClick={modal.type === 'approve' ? approve : reject} disabled={processing}
                className={`flex-1 py-2.5 text-white font-bold rounded-xl text-sm disabled:opacity-40 ${modal.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-500 hover:bg-rose-600'}`}>
                {processing ? '처리 중...' : modal.type === 'approve' ? '승인' : '반려'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>{toast.msg}</div>
      )}
    </div>
  );
}
