import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, getDoc, doc, writeBatch,
  setDoc, serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';

const fmtDate = (ts) => {
  if (!ts) return '없음';
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function BankManage({ selectedClass }) {
  const [students, setStudents]         = useState([]);
  const [settings, setSettings]         = useState({ weeklyDiamondRate: 3, weeklyGoldRate: 3 });
  const [lastInterest, setLastInterest] = useState(null);
  const [isLoading, setIsLoading]       = useState(true);
  const [isSaving, setIsSaving]         = useState(false);
  const [isApplying, setIsApplying]     = useState(false);
  const [toast, setToast]               = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (message, onConfirm) => setConfirmState({ message, onConfirm });
  const classId = selectedClass?.id || null;
  const teacherUid = selectedClass?.teacherUid || null;
  const scopeKey = classId || teacherUid || null;
  const studentScopeField = classId ? 'classId' : 'teacherUid';
  const studentScopeValue = classId || teacherUid || null;

  const fetchAll = async () => {
    if (!scopeKey || !studentScopeValue) {
      setStudents([]);
      setLastInterest(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setSettings({ weeklyDiamondRate: 3, weeklyGoldRate: 3 });
    setLastInterest(null);
    try {
      const settingsDoc = await getDoc(doc(db, 'bankSettings', scopeKey));
      if (settingsDoc.exists()) {
        const d = settingsDoc.data();
        setSettings({
          weeklyDiamondRate: parseFloat(((d.weeklyDiamondRate || 0.03) * 100).toFixed(1)),
          weeklyGoldRate:    parseFloat(((d.weeklyGoldRate    || 0.03) * 100).toFixed(1)),
        });
        setLastInterest(d.lastInterestApplied || null);
      }

      const snap = await getDocs(
        query(collection(db, 'students'), where(studentScopeField, '==', studentScopeValue))
      );
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => (s.bankDiamond || 0) > 0 || (s.bankGold || 0) > 0)
        .sort((a, b) => (a.studentCode || '').localeCompare(b.studentCode || ''));
      setStudents(list);
    } catch (err) {
      console.error('은행 관리 로딩 에러:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [scopeKey, studentScopeField, studentScopeValue]);

  // ── 이율 저장 ──────────────────────────────────────────────
  const saveSettings = async () => {
    if (!scopeKey) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'bankSettings', scopeKey), {
        weeklyDiamondRate: settings.weeklyDiamondRate / 100,
        weeklyGoldRate:    settings.weeklyGoldRate    / 100,
        classId,
        teacherUid,
        scopeKey,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast('이율 설정이 저장되었습니다!');
    } catch (err) {
      console.error(err);
      showToast('저장 실패', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── 이자 일괄 지급 (복리) ──────────────────────────────────
  const applyInterest = () => {
    if (!scopeKey || !studentScopeValue) {
      showToast('학급 정보를 찾지 못했습니다.', 'error');
      return;
    }

    showConfirm(
      `현재 이율로 모든 학생에게 이자를 지급하시겠습니까?\n💎 ${settings.weeklyDiamondRate}% / 🪙 ${settings.weeklyGoldRate}%`,
      async () => {
        setIsApplying(true);
        try {
          const snap = await getDocs(
            query(collection(db, 'students'), where(studentScopeField, '==', studentScopeValue))
          );
          const depositors = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(s => (s.bankDiamond || 0) > 0 || (s.bankGold || 0) > 0);

          if (depositors.length === 0) {
            showToast('예치금이 있는 학생이 없습니다.', 'error');
            return;
          }

          const diaRate  = settings.weeklyDiamondRate / 100;
          const goldRate = settings.weeklyGoldRate    / 100;
          const now      = serverTimestamp();

          const batch = writeBatch(db);
          let totalDiaInt = 0, totalGoldInt = 0;

          for (const s of depositors) {
            const dDep   = s.bankDiamond || 0;
            const gDep   = s.bankGold    || 0;
            const dInt   = Math.floor(dDep * diaRate);
            const gInt   = Math.floor(gDep * goldRate);

            const updates = { bankLastInterestAt: now };
            if (dInt > 0) {
              updates.bankDiamond        = dDep + dInt;
              updates.bankDiamondInterest = (s.bankDiamondInterest || 0) + dInt;
              totalDiaInt += dInt;
            }
            if (gInt > 0) {
              updates.bankGold        = gDep + gInt;
              updates.bankGoldInterest = (s.bankGoldInterest || 0) + gInt;
              totalGoldInt += gInt;
            }

            batch.update(doc(db, 'students', s.id), updates);

            if (dInt > 0) {
              batch.set(doc(collection(db, 'bankLogs')), {
                studentId: s.id, studentCode: s.studentCode, studentName: s.name || s.studentCode,
                type: 'interest', currency: 'diamond',
                amount: dInt, rate: diaRate, newDeposit: dDep + dInt, createdAt: now,
                classId, teacherUid, scopeKey,
              });
            }
            if (gInt > 0) {
              batch.set(doc(collection(db, 'bankLogs')), {
                studentId: s.id, studentCode: s.studentCode, studentName: s.name || s.studentCode,
                type: 'interest', currency: 'gold',
                amount: gInt, rate: goldRate, newDeposit: gDep + gInt, createdAt: now,
                classId, teacherUid, scopeKey,
              });
            }
          }

          batch.set(doc(db, 'bankSettings', scopeKey), {
            lastInterestApplied: now,
            classId,
            teacherUid,
            scopeKey,
          }, { merge: true });
          await batch.commit();

          showToast(`이자 지급 완료! 💎+${totalDiaInt.toLocaleString()} 🪙+${totalGoldInt.toLocaleString()}`);
          fetchAll();
        } catch (err) {
          console.error('이자 지급 에러:', err);
          showToast('이자 지급 중 오류가 발생했습니다.', 'error');
        } finally {
          setIsApplying(false);
        }
      }
    );
  };

  const totalDiaDep  = students.reduce((s, stu) => s + (stu.bankDiamond || 0), 0);
  const totalGoldDep = students.reduce((s, stu) => s + (stu.bankGold    || 0), 0);

  if (!scopeKey) {
    return (
      <div className="min-h-screen bg-slate-100 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 text-slate-600 text-sm">
            학급을 먼저 선택해 주세요.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-5xl mx-auto">

        <h1 className="text-2xl font-extrabold text-slate-800 mb-6 flex items-center gap-2">
          🏦 학급 은행 관리
        </h1>

        {/* 이율 설정 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-5">
          <h2 className="font-bold text-slate-800 text-lg mb-4">⚙️ 주간 이율 설정</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">💎 다이아 이율 (%)</label>
              <input
                type="number" min="0" max="100" step="0.1"
                value={settings.weeklyDiamondRate}
                onChange={e => setSettings(prev => ({ ...prev, weeklyDiamondRate: parseFloat(e.target.value) || 0 }))}
                className="border-2 border-slate-200 rounded-xl px-4 py-2.5 w-28 font-bold text-center focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">🪙 골드 이율 (%)</label>
              <input
                type="number" min="0" max="100" step="0.1"
                value={settings.weeklyGoldRate}
                onChange={e => setSettings(prev => ({ ...prev, weeklyGoldRate: parseFloat(e.target.value) || 0 }))}
                className="border-2 border-slate-200 rounded-xl px-4 py-2.5 w-28 font-bold text-center focus:outline-none focus:border-amber-500"
              />
            </div>
            <button onClick={saveSettings} disabled={isSaving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50">
              {isSaving ? '저장 중...' : '이율 저장'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-3">복리 적용 · 기본 이율 3% · 매주 교사가 수동 지급</p>
        </div>

        {/* 이자 수동 지급 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-amber-400 p-6 mb-5">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <h2 className="font-bold text-slate-800 text-lg mb-1">💰 이자 수동 지급</h2>
              <p className="text-sm text-slate-500">예치금이 있는 모든 학생에게 현재 이율로 이자를 지급합니다. (복리)</p>
              <p className="text-xs text-slate-400 mt-1">마지막 지급: {fmtDate(lastInterest)}</p>
            </div>
            <button
              onClick={applyInterest}
              disabled={isApplying || isLoading || students.length === 0}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-sm rounded-xl transition-colors disabled:opacity-50 shadow-sm self-start shrink-0">
              {isApplying ? '지급 중...' : `이자 지급하기 (${students.length}명)`}
            </button>
          </div>
        </div>

        {/* 학생 예치금 현황 테이블 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">📋 학생 예치금 현황 ({students.length}명)</h2>
            <div className="flex gap-4 text-sm font-bold">
              <span className="text-indigo-600">합계 💎 {totalDiaDep.toLocaleString()}</span>
              <span className="text-amber-600">합계 🪙 {totalGoldDep.toLocaleString()}</span>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2.5 py-10">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm text-slate-400 font-medium">불러오는 중...</span>
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-14 text-slate-400">
              <div className="text-4xl mb-2">🏦</div>
              <p className="font-bold">예치금이 있는 학생이 없습니다</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-100">
                    <th className="px-5 py-3 font-semibold">학생</th>
                    <th className="px-5 py-3 font-semibold">💎 예치금</th>
                    <th className="px-5 py-3 font-semibold text-emerald-600">💎 누적 이자</th>
                    <th className="px-5 py-3 font-semibold">🪙 예치금</th>
                    <th className="px-5 py-3 font-semibold text-emerald-600">🪙 누적 이자</th>
                    <th className="px-5 py-3 font-semibold text-amber-600">다음 이자 예상</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {students.map(s => {
                    const dNext = Math.floor((s.bankDiamond || 0) * (settings.weeklyDiamondRate / 100));
                    const gNext = Math.floor((s.bankGold    || 0) * (settings.weeklyGoldRate    / 100));
                    return (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-800 text-sm">{s.name || s.studentCode}</div>
                          {s.name && <div className="text-[10px] text-slate-400 font-mono">{s.studentCode}</div>}
                        </td>
                        <td className="px-5 py-3 font-bold text-indigo-600 text-sm">
                          {(s.bankDiamond || 0).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 font-bold text-emerald-600 text-sm">
                          +{(s.bankDiamondInterest || 0).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 font-bold text-amber-600 text-sm">
                          {(s.bankGold || 0).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 font-bold text-emerald-600 text-sm">
                          +{(s.bankGoldInterest || 0).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-sm text-slate-500 font-medium">
                          {dNext > 0 && <span className="mr-2">💎+{dNext.toLocaleString()}</span>}
                          {gNext > 0 && <span>🪙+{gNext.toLocaleString()}</span>}
                          {dNext === 0 && gNext === 0 && <span className="text-slate-300">-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>

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
    </>
  );
}

export default BankManage;
