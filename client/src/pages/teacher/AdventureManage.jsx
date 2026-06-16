import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, writeBatch, updateDoc, increment, query, where, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const TICKET_CONFIG = {
  dungeon:  { label: '던전 이용권',   icon: '🗡️', color: 'sky',    max: 3 },
  arena:    { label: '투기장 이용권', icon: '🏟️', color: 'violet', max: 5 },
};

const COLOR_MAP = {
  sky:    { bg: 'bg-sky-50',    border: 'border-sky-200',    text: 'text-sky-700',    btn: 'bg-sky-500 hover:bg-sky-600',    badge: 'bg-sky-100 text-sky-700' },
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-700',   btn: 'bg-rose-500 hover:bg-rose-600',   badge: 'bg-rose-100 text-rose-700' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', btn: 'bg-violet-500 hover:bg-violet-600', badge: 'bg-violet-100 text-violet-700' },
};

const getSeatNum = (code) => parseInt(code?.split('-').pop()) || 0;

function AdventureManage({ selectedClass }) {
  const [students, setStudents]     = useState([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [isBusy, setIsBusy]         = useState(false);
  const [selected, setSelected]     = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [grantModal, setGrantModal] = useState(null);
  const [toast, setToast]           = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  // 교사 레벨
  const [teacherLevel, setTeacherLevel]       = useState(50);
  const [teacherLevelInput, setTeacherLevelInput] = useState('50');
  const [isSavingLevel, setIsSavingLevel]     = useState(false);

  // 부여 입력값
  const [grantAmounts, setGrantAmounts] = useState({ dungeon: 0, arena: 0 });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (message, onConfirm) => setConfirmState({ message, onConfirm });

  // 교사 레벨 로드
  useEffect(() => {
    const uid = selectedClass?.teacherUid;
    if (!uid) return;
    getDoc(doc(db, 'teacherProfiles', uid)).then(snap => {
      const lv = snap.exists() ? (snap.data().level ?? 50) : 50;
      setTeacherLevel(lv);
      setTeacherLevelInput(String(lv));
    }).catch(() => {});
  }, [selectedClass?.teacherUid]);

  const saveTeacherLevel = async () => {
    const uid = selectedClass?.teacherUid;
    if (!uid) return showToast('학급을 먼저 선택해주세요.', 'error');
    const lv = Math.max(1, Math.min(99, parseInt(teacherLevelInput) || 50));
    setIsSavingLevel(true);
    try {
      await setDoc(doc(db, 'teacherProfiles', uid), { level: lv }, { merge: true });
      setTeacherLevel(lv);
      setTeacherLevelInput(String(lv));
      showToast('교사 레벨이 저장되었습니다!');
    } catch { showToast('저장 중 오류가 발생했습니다.', 'error'); }
    finally { setIsSavingLevel(false); }
  };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const tid = selectedClass?.id;
        const tuid = selectedClass?.teacherUid;
        const q = tid
          ? query(collection(db, 'students'), where('classId', '==', tid))
          : tuid
          ? query(collection(db, 'students'), where('teacherUid', '==', tuid))
          : collection(db, 'students');
        const snap = await getDocs(q);
        setStudents(
          snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => getSeatNum(a.studentCode) - getSeatNum(b.studentCode))
        );
      } catch (err) { console.error(err); }
      finally { setIsLoading(false); }
    };
    load();
  }, []);

  const filteredStudents = students.filter(s =>
    (s.name || s.studentCode || '').includes(searchQuery) ||
    s.studentCode?.includes(searchQuery)
  );

  const toggleSelect = (id) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () =>
    setSelected(prev => prev.length === filteredStudents.length ? [] : filteredStudents.map(s => s.id));

  // ── 이용권 부여 ───────────────────────────────────────────────
  const doGrant = () => {
    const totalGrant = Object.values(grantAmounts).reduce((s, v) => s + v, 0);
    if (totalGrant === 0) return showToast('부여할 이용권 수량을 입력해주세요.', 'error');

    const targetIds = grantModal === 'all'
      ? students.map(s => s.id)
      : grantModal === 'selected'
        ? selected
        : [grantModal.studentId];

    if (targetIds.length === 0) return showToast('대상 학생이 없습니다.', 'error');

    const targetNames = grantModal === 'all' ? `전체 ${targetIds.length}명`
      : grantModal === 'selected' ? `선택 ${targetIds.length}명`
      : grantModal.studentName;

    showConfirm(
      `${targetNames}에게 이용권을 부여할까요?\n` +
        Object.entries(grantAmounts)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${TICKET_CONFIG[k].icon} ${TICKET_CONFIG[k].label} +${v}`)
          .join(', '),
      async () => {
        setIsBusy(true);
        try {
          const batch = writeBatch(db);

          for (const id of targetIds) {
            const student = students.find(s => s.id === id);
            if (!student) continue;
            const curTickets = student.tickets || {};
            const updates = {};

            for (const [key, amount] of Object.entries(grantAmounts)) {
              if (amount <= 0) continue;
              const cur = curTickets[key] || 0;
              const max = TICKET_CONFIG[key].max;
              updates[`tickets.${key}`] = Math.min(max, cur + amount);
            }
            if (Object.keys(updates).length > 0) {
              batch.update(doc(db, 'students', id), updates);
            }
          }

          await batch.commit();

          setStudents(prev => prev.map(s => {
            if (!targetIds.includes(s.id)) return s;
            const cur = s.tickets || {};
            const newTickets = { ...cur };
            for (const [key, amount] of Object.entries(grantAmounts)) {
              if (amount <= 0) continue;
              newTickets[key] = Math.min(TICKET_CONFIG[key].max, (cur[key] || 0) + amount);
            }
            return { ...s, tickets: newTickets };
          }));

          showToast('이용권 부여 완료!');
          setGrantModal(null);
          setGrantAmounts({ dungeon: 0, arena: 0 });
          setSelected([]);
        } catch (err) {
          console.error(err);
          showToast('오류가 발생했습니다.', 'error');
        } finally {
          setIsBusy(false);
        }
      }
    );
  };

  // ── 빠른 1개 부여 (개별) ────────────────────────────────────
  const quickGrant = async (studentId, ticketKey, amount) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const cur = (student.tickets || {})[ticketKey] || 0;
    const max = TICKET_CONFIG[ticketKey].max;
    const newVal = Math.min(max, cur + amount);
    if (newVal === cur) return; // 이미 최대

    setIsBusy(true);
    try {
      await updateDoc(doc(db, 'students', studentId), {
        [`tickets.${ticketKey}`]: newVal,
      });
      setStudents(prev => prev.map(s =>
        s.id !== studentId ? s : { ...s, tickets: { ...(s.tickets || {}), [ticketKey]: newVal } }
      ));
    } catch (err) { console.error(err); }
    finally { setIsBusy(false); }
  };

  // ── 전체 초기화 (최대치로 리셋) ────────────────────────────
  const resetAll = () => {
    showConfirm('전체 학생 이용권을 최대치로 초기화하시겠습니까?', async () => {
      setIsBusy(true);
      try {
        const batch = writeBatch(db);
        students.forEach(s => {
          batch.update(doc(db, 'students', s.id), {
            'tickets.dungeon':  TICKET_CONFIG.dungeon.max,
            'tickets.arena':    TICKET_CONFIG.arena.max,
            lastTicketRefreshDate: new Date().toISOString().split('T')[0],
          });
        });
        await batch.commit();
        setStudents(prev => prev.map(s => ({
          ...s,
          tickets: {
            ...(s.tickets || {}),
            dungeon:  TICKET_CONFIG.dungeon.max,
            arena:    TICKET_CONFIG.arena.max,
          },
        })));
        showToast('전체 이용권이 최대치로 초기화되었습니다!');
      } catch (err) { console.error(err); }
      finally { setIsBusy(false); }
    });
  };

  // ── 이용권 통계 ─────────────────────────────────────────────
  const stats = Object.keys(TICKET_CONFIG).reduce((acc, key) => {
    const total = students.reduce((s, st) => s + ((st.tickets || {})[key] || 0), 0);
    acc[key] = total;
    return acc;
  }, {});

  return (
    <div className="adventure-manage-page min-h-screen bg-slate-100 px-4 py-6 md:p-8">
      <div className="max-w-6xl mx-auto">

        {/* 헤더 */}
        <div className="adventure-manage-header bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-slate-200 mb-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800">⚔️ 어드벤처 관리</h1>
              <p className="text-slate-500 text-sm mt-1">교사 레벨과 학생별 이용권을 한 화면에서 관리합니다.</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { setGrantAmounts({ dungeon: 0, arena: 0 }); setGrantModal('all'); }}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm">
                🎁 전체 학생 부여
              </button>
              {selected.length > 0 && (
                <button
                  onClick={() => { setGrantAmounts({ dungeon: 0, arena: 0 }); setGrantModal('selected'); }}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm">
                  ✅ 선택 {selected.length}명 부여
                </button>
              )}
              <button
                onClick={resetAll} disabled={isBusy}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm rounded-xl transition-colors border border-slate-200 disabled:opacity-50">
                🔄 전체 최대치 초기화
              </button>
            </div>
          </div>
        </div>

        <div className="adventure-auto-guide mb-5 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3.5 text-sky-800">
          <span className="mt-0.5 text-lg">⏱️</span>
          <div>
            <p className="text-sm font-extrabold">이용권은 매일 자동 충전됩니다.</p>
            <p className="mt-0.5 text-xs font-medium leading-relaxed text-sky-700">
              탐험던전 매일 1장(최대 3장), 투기장 매일 2장(최대 5장) · 월요일에는 탐험 +1장, 투기장 +2장 보너스
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr] mb-6">
          {/* 교사 레벨 설정 */}
          <div className="adventure-level-panel bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold text-indigo-500">교사 플레이 설정</p>
                <h2 className="mt-1 text-lg font-extrabold text-slate-800">🎓 교사 레벨</h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">교사가 퀴즈던전·탐험던전을 플레이할 때 적용됩니다.</p>
              </div>
              <div className="flex items-baseline gap-1 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2">
                <span className="text-xs font-bold text-indigo-500">현재</span>
                <span className="text-2xl font-extrabold text-indigo-700">Lv.{teacherLevel}</span>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 shrink-0">레벨 변경</label>
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="number" min="1" max="99"
                  value={teacherLevelInput}
                  onChange={e => setTeacherLevelInput(e.target.value)}
                  className="min-w-0 flex-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-center focus:outline-none focus:border-indigo-400"
                  placeholder="1~99"
                />
                <button
                  onClick={saveTeacherLevel} disabled={isSavingLevel}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50 shadow-sm">
                  {isSavingLevel ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>

          {/* 이용권 현황 요약 */}
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(TICKET_CONFIG).map(([key, cfg]) => {
              const c = COLOR_MAP[cfg.color];
              const maxTotal = students.length * cfg.max;
              const fillRate = maxTotal > 0 ? Math.round((stats[key] / maxTotal) * 100) : 0;
              return (
                <div key={key} className={`adventure-ticket-summary bg-white rounded-2xl p-4 shadow-sm border-2 ${c.border}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xl">{cfg.icon}</span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${c.badge}`}>{fillRate}% 보유</span>
                  </div>
                  <p className={`mt-3 text-xs font-bold ${c.text}`}>{cfg.label}</p>
                  <div className="mt-1 flex items-end gap-1">
                    <span className="text-2xl font-extrabold text-slate-800">{stats[key]}</span>
                    <span className="pb-1 text-xs font-bold text-slate-400">/ {maxTotal}장</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${cfg.color === 'sky' ? 'bg-sky-500' : 'bg-violet-500'}`} style={{ width: `${fillRate}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 학생 목록 */}
        <div className="adventure-student-table bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* 검색 + 전체선택 */}
          <div className="adventure-student-toolbar px-5 py-4 bg-slate-50 border-b border-slate-200">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-800">학생별 이용권 현황</h2>
                <p className="mt-0.5 text-xs text-slate-400">수량을 바로 조정하거나 학생을 선택해 일괄 부여할 수 있습니다.</p>
              </div>
              <span className="rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs text-slate-500 font-bold shrink-0">
                총 {filteredStudents.length}명
              </span>
            </div>
            <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selected.length === filteredStudents.length && filteredStudents.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded"
              title="전체 학생 선택"
            />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="학생 이름 또는 코드 검색..."
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
            />
            </div>
          </div>

          <div className="overflow-x-auto">
          <div className="min-w-[720px]">
          {/* 컬럼 헤더 */}
          <div className="adventure-table-head grid grid-cols-[auto_1fr_repeat(2,_auto)_auto] gap-0 px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
            <div className="w-6 mr-3" />
            <div>학생</div>
            {Object.values(TICKET_CONFIG).map(cfg => (
              <div key={cfg.label} className="text-center w-28">{cfg.icon} {cfg.label}</div>
            ))}
            <div className="w-20 text-center">부여</div>
          </div>

          {/* 학생 행 */}
          {isLoading ? (
            <div className="flex items-center justify-center gap-2.5 py-12">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm text-slate-400 font-medium">불러오는 중...</span>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-12 text-slate-400">학생이 없습니다</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filteredStudents.map(student => {
                const tickets = student.tickets || {};
                const seatNum = getSeatNum(student.studentCode);
                const isSelected = selected.includes(student.id);

                return (
                  <div
                    key={student.id}
                    className={`adventure-student-row grid grid-cols-[auto_1fr_repeat(2,_auto)_auto] gap-0 px-5 py-3.5 items-center hover:bg-slate-50 transition-colors
                      ${isSelected ? 'bg-indigo-50' : ''}`}>

                    {/* 체크박스 */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(student.id)}
                      className="w-4 h-4 rounded mr-3"
                    />

                    {/* 이름 */}
                    <div>
                      <div className="font-bold text-slate-800 text-sm">
                        {student.name || student.studentCode}
                      </div>
                      {student.name && (
                        <div className="text-[10px] text-slate-400 font-mono">{seatNum}번</div>
                      )}
                    </div>

                    {/* 이용권 수량 */}
                    {Object.entries(TICKET_CONFIG).map(([key, cfg]) => {
                      const cur = tickets[key] || 0;
                      const max = cfg.max;
                      const c   = COLOR_MAP[cfg.color];
                      return (
                        <div key={key} className="w-28 flex items-center justify-center gap-1">
                          {/* -1 버튼 */}
                          <button
                            onClick={() => quickGrant(student.id, key, -1)}
                            disabled={isBusy || cur <= 0}
                            className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 font-bold text-sm transition-colors disabled:opacity-30">
                            −
                          </button>
                          {/* 수량 뱃지 */}
                          <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full min-w-[3rem] text-center ${c.badge}`}>
                            {cur} / {max}
                          </span>
                          {/* +1 버튼 */}
                          <button
                            onClick={() => quickGrant(student.id, key, 1)}
                            disabled={isBusy || cur >= max}
                            className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-600 font-bold text-sm transition-colors disabled:opacity-30">
                            +
                          </button>
                        </div>
                      );
                    })}

                    {/* 개별 부여 버튼 */}
                    <div className="w-20 text-center">
                      <button
                        onClick={() => {
                          setGrantAmounts({ dungeon: 0, arena: 0 });
                          setGrantModal({ studentId: student.id, studentName: student.name || student.studentCode });
                        }}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold text-xs rounded-xl transition-colors border border-indigo-200">
                        부여
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
          </div>
        </div>
      </div>

      {/* 부여 모달 */}
      {grantModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-5 bg-indigo-600 text-white font-bold text-lg flex justify-between items-center">
              <span>
                🎁 이용권 부여 —{' '}
                {grantModal === 'all' ? `전체 ${students.length}명`
                  : grantModal === 'selected' ? `선택 ${selected.length}명`
                  : grantModal.studentName}
              </span>
              <button onClick={() => setGrantModal(null)} className="text-indigo-200 hover:text-white text-xl">✕</button>
            </div>

            <div className="p-6 space-y-4">
              {Object.entries(TICKET_CONFIG).map(([key, cfg]) => {
                const c = COLOR_MAP[cfg.color];
                return (
                  <div key={key}>
                    <label className={`block text-sm font-bold mb-2 ${c.text}`}>
                      {cfg.icon} {cfg.label} (최대 {cfg.max}개)
                    </label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3].map(n => (
                        <button key={n}
                          onClick={() => setGrantAmounts(prev => ({ ...prev, [key]: n }))}
                          className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-colors
                            ${grantAmounts[key] === n
                              ? `${c.badge} border-current`
                              : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-400'}`}>
                          +{n}
                        </button>
                      ))}
                      <input
                        type="number" min="0" max={cfg.max}
                        value={grantAmounts[key]}
                        onChange={e => setGrantAmounts(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                        className={`w-16 text-center border-2 rounded-xl py-2 text-sm font-bold focus:outline-none ${c.border}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setGrantModal(null)}
                className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
                취소
              </button>
              <button onClick={doGrant} disabled={isBusy}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-50">
                {isBusy ? '처리 중...' : '부여하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.message}
        </div>
      )}
      {confirmState && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setConfirmState(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <p className="text-slate-700 font-bold text-sm mb-5 leading-relaxed whitespace-pre-line">{confirmState.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmState(null)}
                className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-50">취소</button>
              <button onClick={() => { confirmState.onConfirm(); setConfirmState(null); }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdventureManage;
