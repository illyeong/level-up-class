import { useState, useEffect } from 'react';
import {
  collection, getDocs, getDoc, doc, runTransaction,
  setDoc, serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { calculateStudentInterest, getKoreaWeekKey, getWeekKeyFromTimestamp } from '../../utils/bankInterest';

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const fmtDate = (ts) => {
  if (!ts) return '없음';
  const d = toDate(ts);
  if (!d) return '없음';
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const toWholeCurrency = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

const DEFAULT_SETTINGS = { weeklyDiamondRate: 3, weeklyGoldRate: 3, autoInterestEnabled: true };

const settleClassInterest = async ({ studentRefs, scopeKey, classId, teacherUid, automatic = true }) => {
  const settingsRef = doc(db, 'bankSettings', scopeKey);
  const currentWeek = getKoreaWeekKey();
  const settingsSnap = await getDoc(settingsRef);
  const bankSettings = settingsSnap.exists() ? settingsSnap.data() : {};
  const lastSettledWeek = bankSettings.lastInterestAppliedWeek
    || getWeekKeyFromTimestamp(bankSettings.lastInterestApplied)
    || (bankSettings.lastInterestAppliedDate ? getKoreaWeekKey(new Date(`${bankSettings.lastInterestAppliedDate}T00:00:00+09:00`)) : '');
  if (lastSettledWeek === currentWeek) {
    return { alreadySettled: true, totalDiaInt: 0, totalGoldInt: 0, affectedStudents: 0 };
  }

  let totalDiaInt = 0;
  let totalGoldInt = 0;
  let affectedStudents = 0;

  // 학급 전체를 한 트랜잭션으로 묶으면 학생 수·보안 규칙에 따라 정산 전체가 실패할 수 있습니다.
  // 학생별 트랜잭션으로 처리해 일부 오류가 나도 기존 예치금 표시와 다른 학생 정산을 보호합니다.
  for (const studentRef of studentRefs) {
    const result = await runTransaction(db, async transaction => {
      const studentSnap = await transaction.get(studentRef);
      const latestSettingsSnap = await transaction.get(settingsRef);
      if (!studentSnap.exists()) return null;

      const latestSettings = latestSettingsSnap.exists() ? latestSettingsSnap.data() : bankSettings;
      if (latestSettings.autoInterestEnabled === false && automatic) return null;
      const diamondRate = Math.max(0, Math.min(1, Number(latestSettings.weeklyDiamondRate ?? 0.03)));
      const goldRate = Math.max(0, Math.min(1, Number(latestSettings.weeklyGoldRate ?? 0.03)));
      const student = { id: studentSnap.id, ...studentSnap.data() };
      const settlement = calculateStudentInterest({ student, diamondRate, goldRate, currentWeek });
      if (!settlement.hasDueInterest) return { settlement };

      const now = serverTimestamp();
      transaction.update(studentRef, { ...settlement.updates, bankLastInterestAt: now });
      const baseLog = {
        studentId: student.id,
        studentCode: student.studentCode,
        studentName: student.name || student.studentCode,
        type: 'interest',
        createdAt: now,
        classId,
        teacherUid,
        scopeKey,
        interestWeek: currentWeek,
        automatic,
      };
      if (settlement.diamond.interest > 0) {
        transaction.set(doc(collection(db, 'bankLogs')), {
          ...baseLog,
          currency: 'diamond',
          amount: settlement.diamond.interest,
          rate: diamondRate,
          weeks: settlement.diamond.weeks,
          newDeposit: settlement.diamond.balance,
        });
      }
      if (settlement.gold.interest > 0) {
        transaction.set(doc(collection(db, 'bankLogs')), {
          ...baseLog,
          currency: 'gold',
          amount: settlement.gold.interest,
          rate: goldRate,
          weeks: settlement.gold.weeks,
          newDeposit: settlement.gold.balance,
        });
      }
      return { settlement };
    });

    if (result?.settlement?.hasDueInterest) {
      affectedStudents += 1;
      totalDiaInt += result.settlement.diamond.interest;
      totalGoldInt += result.settlement.gold.interest;
    }
  }

  await setDoc(settingsRef, {
    lastInterestApplied: serverTimestamp(),
    lastInterestAppliedDate: currentWeek,
    lastInterestAppliedWeek: currentWeek,
    classId,
    teacherUid,
    scopeKey,
  }, { merge: true });

  return { alreadySettled: false, totalDiaInt, totalGoldInt, affectedStudents };
};

function BankManage({ selectedClass }) {
  const [students, setStudents]         = useState([]);
  const [settings, setSettings]         = useState(DEFAULT_SETTINGS);
  const [lastInterest, setLastInterest] = useState(null);
  const [lastInterestWeekKey, setLastInterestWeekKey] = useState('');
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

  const fetchAll = async ({ skipAutoSettlement = false } = {}) => {
    if (!scopeKey || !studentScopeValue) {
      setStudents([]);
      setLastInterest(null);
      setLastInterestWeekKey('');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setSettings(DEFAULT_SETTINGS);
    setLastInterest(null);
    setLastInterestWeekKey('');
    try {
      const settingsDoc = await getDoc(doc(db, 'bankSettings', scopeKey));
      let loadedSettings = DEFAULT_SETTINGS;
      let loadedInterestWeek = '';
      if (settingsDoc.exists()) {
        const d = settingsDoc.data();
        loadedSettings = {
          weeklyDiamondRate: parseFloat(((d.weeklyDiamondRate ?? 0.03) * 100).toFixed(1)),
          weeklyGoldRate:    parseFloat(((d.weeklyGoldRate    ?? 0.03) * 100).toFixed(1)),
          autoInterestEnabled: d.autoInterestEnabled !== false,
        };
        loadedInterestWeek = d.lastInterestAppliedWeek
          || getWeekKeyFromTimestamp(d.lastInterestApplied)
          || (d.lastInterestAppliedDate ? getKoreaWeekKey(new Date(`${d.lastInterestAppliedDate}T00:00:00+09:00`)) : '');
        setSettings(loadedSettings);
        setLastInterest(d.lastInterestApplied || null);
        setLastInterestWeekKey(loadedInterestWeek);
      }

      const snap = await getDocs(
        query(collection(db, 'students'), where(studentScopeField, '==', studentScopeValue))
      );
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => (s.bankDiamond || 0) > 0 || (s.bankGold || 0) > 0)
        .sort((a, b) => (a.studentCode || '').localeCompare(b.studentCode || ''));
      // 정산이 실패해도 기존 예치금 목록이 빈 화면으로 바뀌지 않게 먼저 표시합니다.
      setStudents(list);

      if (!skipAutoSettlement
        && loadedSettings.autoInterestEnabled !== false
        && loadedInterestWeek !== getKoreaWeekKey()) {
        try {
          const result = await settleClassInterest({
            studentRefs: snap.docs.map(studentDoc => studentDoc.ref),
            scopeKey,
            classId,
            teacherUid,
          });
          if (!result.alreadySettled && result.totalDiaInt + result.totalGoldInt > 0) {
            showToast(`주간 이자 자동 지급! 💎+${result.totalDiaInt.toLocaleString()} 🪙+${result.totalGoldInt.toLocaleString()}`);
          }
          await fetchAll({ skipAutoSettlement: true });
          return;
        } catch (interestError) {
          console.error('자동 이자 정산 에러:', interestError);
          showToast('예치금은 정상입니다. 이자 자동 지급만 잠시 지연되고 있습니다.', 'error');
        }
      }
    } catch (err) {
      console.error('은행 관리 로딩 에러:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 학급 범위가 바뀔 때만 새 학급의 정산 상태를 다시 불러옵니다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, [scopeKey, studentScopeField, studentScopeValue]);

  // ── 이율 저장 ──────────────────────────────────────────────
  const saveSettings = async () => {
    if (!scopeKey) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'bankSettings', scopeKey), {
        weeklyDiamondRate: Math.max(0, Math.min(100, Number(settings.weeklyDiamondRate) || 0)) / 100,
        weeklyGoldRate:    Math.max(0, Math.min(100, Number(settings.weeklyGoldRate) || 0)) / 100,
        autoInterestEnabled: settings.autoInterestEnabled !== false,
        classId,
        teacherUid,
        scopeKey,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast('이율 설정이 저장되었습니다!');
      if (settings.autoInterestEnabled !== false && lastInterestWeekKey !== getKoreaWeekKey()) {
        await fetchAll();
      }
    } catch (err) {
      console.error(err);
      showToast('저장 실패', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── 자동 지급이 막혔을 때 사용할 주간 수동 정산 ──────────────
  const applyInterest = () => {
    if (!scopeKey || !studentScopeValue) {
      showToast('학급 정보를 찾지 못했습니다.', 'error');
      return;
    }
    if (lastInterestWeekKey === getKoreaWeekKey()) {
      showToast('이번 주 이자는 이미 정산되었습니다.', 'error');
      return;
    }

    showConfirm(
      `아직 자동 정산되지 않은 학생의 이번 주 이자를 지금 정산할까요?\n💎 ${settings.weeklyDiamondRate}% / 🪙 ${settings.weeklyGoldRate}%`,
      async () => {
        setIsApplying(true);
        try {
          const snap = await getDocs(
            query(collection(db, 'students'), where(studentScopeField, '==', studentScopeValue))
          );
          const result = await settleClassInterest({
            studentRefs: snap.docs.map(studentDoc => studentDoc.ref),
            scopeKey,
            classId,
            teacherUid,
            automatic: false,
          });
          showToast(result.alreadySettled
            ? '이번 주 이자는 이미 정산되었습니다.'
            : `주간 이자 정산 완료! 💎+${result.totalDiaInt.toLocaleString()} 🪙+${result.totalGoldInt.toLocaleString()}`);
          await fetchAll({ skipAutoSettlement: true });
        } catch (err) {
          console.error('이자 지급 에러:', err);
          showToast(err.message || '이자 지급 중 오류가 발생했습니다.', 'error');
        } finally {
          setIsApplying(false);
        }
      }
    );
  };

  const totalDiaDep  = students.reduce((s, stu) => s + toWholeCurrency(stu.bankDiamond), 0);
  const totalGoldDep = students.reduce((s, stu) => s + toWholeCurrency(stu.bankGold), 0);
  const hasSettledThisWeek = lastInterestWeekKey === getKoreaWeekKey();

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
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
              <input
                type="checkbox"
                checked={settings.autoInterestEnabled !== false}
                onChange={e => setSettings(prev => ({ ...prev, autoInterestEnabled: e.target.checked }))}
                className="h-5 w-5 accent-emerald-600"
              />
              <span><span className="block text-sm font-extrabold text-emerald-800">자동 이자</span><span className="block text-[10px] font-bold text-emerald-600">매주 월요일 기준</span></span>
            </label>
            <button onClick={saveSettings} disabled={isSaving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50">
              {isSaving ? '저장 중...' : '설정 저장'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-3">한국시간 월요일을 기준으로 주 1회 복리 적용 · 같은 주에는 중복 지급되지 않습니다.</p>
        </div>

        {/* 자동 이자 상태 및 수동 정산 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-500 p-6 mb-5">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <h2 className="font-bold text-slate-800 text-lg mb-1">💰 주간 자동 이자</h2>
              <p className="text-sm text-slate-500">{settings.autoInterestEnabled !== false ? '자동 지급이 켜져 있습니다. 학생 접속 또는 교사 은행 관리 진입 시 안전하게 정산됩니다.' : '자동 지급이 꺼져 있습니다. 위 설정에서 켤 수 있습니다.'}</p>
              <p className="text-xs text-slate-400 mt-1">마지막 지급: {fmtDate(lastInterest)}</p>
              {hasSettledThisWeek && (
                <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                  이번 주 이자 정산이 완료되었습니다. 다음 주 월요일 이후 다시 자동 정산됩니다.
                </p>
              )}
            </div>
            <button
              onClick={applyInterest}
              disabled={isApplying || isLoading || students.length === 0 || hasSettledThisWeek}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-sm rounded-xl transition-colors disabled:opacity-50 shadow-sm self-start shrink-0">
              {isApplying ? '정산 중...' : hasSettledThisWeek ? '이번 주 정산 완료' : `지금 정산하기 (${students.length}명)`}
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
                    const bankDiamond = toWholeCurrency(s.bankDiamond);
                    const bankGold = toWholeCurrency(s.bankGold);
                    const bankDiamondInterest = toWholeCurrency(s.bankDiamondInterest);
                    const bankGoldInterest = toWholeCurrency(s.bankGoldInterest);
                    const dNext = Math.floor(bankDiamond * (settings.weeklyDiamondRate / 100));
                    const gNext = Math.floor(bankGold * (settings.weeklyGoldRate / 100));
                    return (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-800 text-sm">{s.name || s.studentCode}</div>
                          {s.name && <div className="text-[10px] text-slate-400 font-mono">{s.studentCode}</div>}
                        </td>
                        <td className="px-5 py-3 font-bold text-indigo-600 text-sm">
                          {bankDiamond.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 font-bold text-emerald-600 text-sm">
                          +{bankDiamondInterest.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 font-bold text-amber-600 text-sm">
                          {bankGold.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 font-bold text-emerald-600 text-sm">
                          +{bankGoldInterest.toLocaleString()}
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
