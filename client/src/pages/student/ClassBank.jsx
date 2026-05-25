import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, getDoc, doc, writeBatch,
  setDoc, serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const LOG_TYPE_LABEL = { deposit: '예치', withdraw: '출금', interest: '이자 지급' };
const LOG_TYPE_ICON  = { deposit: '⬇️', withdraw: '⬆️', interest: '💰' };
const LOG_TYPE_COLOR = {
  deposit:  'bg-indigo-50 text-indigo-600',
  withdraw: 'bg-rose-50 text-rose-500',
  interest: 'bg-emerald-50 text-emerald-600',
};

const getScopeFromStudent = (student) => {
  const classId = student?.classId || null;
  const teacherUid = student?.teacherUid || null;
  return { classId, teacherUid, scopeKey: classId || teacherUid || null };
};

const isLogInScope = (log, scope) => {
  if (!scope?.scopeKey) return false;
  if (log.scopeKey) return log.scopeKey === scope.scopeKey;
  if (scope.classId && log.classId) return log.classId === scope.classId;
  if (log.teacherUid) return log.teacherUid === scope.teacherUid;
  return true;
};

function ClassBank({ studentCode }) {
  const [student, setStudent]   = useState(null);
  const [docId, setDocId]       = useState(null);
  const [scope, setScope]       = useState({ classId: null, teacherUid: null, scopeKey: null });
  const [settings, setSettings] = useState({ weeklyDiamondRate: 0.03, weeklyGoldRate: 0.03 });
  const [logs, setLogs]         = useState([]);
  const [tab, setTab]           = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy]     = useState(false);
  const [toast, setToast]       = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 입력 폼
  const [diaDeposit, setDiaDeposit]   = useState('');
  const [diaWithdraw, setDiaWithdraw] = useState('');
  const [goldDeposit, setGoldDeposit] = useState('');
  const [goldWithdraw, setGoldWithdraw] = useState('');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setSettings({ weeklyDiamondRate: 0.03, weeklyGoldRate: 0.03 });
      try {
        if (studentCode) {
          const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const sDoc = snap.docs[0];
            const sData = sDoc.data();
            const nextScope = getScopeFromStudent(sData);
            setDocId(sDoc.id);
            setStudent({ id: sDoc.id, ...sData });
            setScope(nextScope);

            if (nextScope.scopeKey) {
              const settingsDoc = await getDoc(doc(db, 'bankSettings', nextScope.scopeKey));
              if (settingsDoc.exists()) setSettings(settingsDoc.data());
            }

            const logsSnap = await getDocs(
              query(collection(db, 'bankLogs'), where('studentId', '==', sDoc.id))
            );
            const scopedLogs = logsSnap.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(log => isLogInScope(log, nextScope));
            setLogs(
              scopedLogs
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
            );
          }
        }
      } catch (err) {
        console.error('은행 로딩 에러:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [studentCode]);

  const bankDia          = student?.bankDiamond         || 0;
  const bankGold         = student?.bankGold            || 0;
  const diaTotalInterest = student?.bankDiamondInterest || 0;
  const goldTotalInterest= student?.bankGoldInterest    || 0;
  const diaRate          = settings.weeklyDiamondRate   || 0.03;
  const goldRate         = settings.weeklyGoldRate      || 0.03;
  const nextDiaInt       = Math.floor(bankDia  * diaRate);
  const nextGoldInt      = Math.floor(bankGold * goldRate);

  // ── 예치 ──────────────────────────────────────────────────
  const doDeposit = async (currency) => {
    const amount = currency === 'diamond' ? Number(diaDeposit) : Number(goldDeposit);
    if (!amount || amount <= 0) return showToast('금액을 입력해주세요.', 'error');
    const avail = currency === 'diamond' ? (student?.diamonds || 0) : (student?.gold || 0);
    if (amount > avail) return showToast(`보유 ${currency === 'diamond' ? '다이아' : '골드'}가 부족합니다. (보유: ${avail.toLocaleString()})`, 'error');

    setIsBusy(true);
    try {
      const curDep = currency === 'diamond' ? bankDia : bankGold;
      const batch  = writeBatch(db);
      const sRef   = doc(db, 'students', docId);

      if (currency === 'diamond') {
        batch.update(sRef, { diamonds: (student.diamonds || 0) - amount, bankDiamond: curDep + amount });
      } else {
        batch.update(sRef, { gold: (student.gold || 0) - amount, bankGold: curDep + amount });
      }
      batch.set(doc(collection(db, 'bankLogs')), {
        studentId: docId, studentCode: student.studentCode, studentName: student.name || student.studentCode,
        type: 'deposit', currency, amount, newDeposit: curDep + amount, createdAt: serverTimestamp(),
        classId: scope.classId || null,
        teacherUid: scope.teacherUid || null,
        scopeKey: scope.scopeKey || null,
      });
      await batch.commit();

      setStudent(prev => ({
        ...prev,
        diamonds:   currency === 'diamond' ? (prev.diamonds || 0) - amount : prev.diamonds,
        gold:       currency === 'gold'    ? (prev.gold    || 0) - amount : prev.gold,
        bankDiamond: currency === 'diamond' ? curDep + amount : prev.bankDiamond,
        bankGold:    currency === 'gold'    ? curDep + amount : prev.bankGold,
      }));
      setLogs(prev => [{
        id: `t${Date.now()}`, type: 'deposit', currency, amount,
        newDeposit: curDep + amount, createdAt: { seconds: Date.now() / 1000 },
      }, ...prev]);
      if (currency === 'diamond') setDiaDeposit(''); else setGoldDeposit('');
      showToast('예치 완료! 💰');
    } catch (err) {
      console.error(err);
      showToast('예치 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  // ── 출금 ──────────────────────────────────────────────────
  const doWithdraw = async (currency, all = false) => {
    const curDep = currency === 'diamond' ? bankDia : bankGold;
    const amount = all ? curDep : (currency === 'diamond' ? Number(diaWithdraw) : Number(goldWithdraw));
    if (!amount || amount <= 0) return showToast('출금할 금액이 없습니다.', 'error');
    if (amount > curDep) return showToast('예치금보다 많은 금액은 출금할 수 없습니다.', 'error');

    setIsBusy(true);
    try {
      const batch = writeBatch(db);
      const sRef  = doc(db, 'students', docId);

      if (currency === 'diamond') {
        batch.update(sRef, { diamonds: (student.diamonds || 0) + amount, bankDiamond: curDep - amount });
      } else {
        batch.update(sRef, { gold: (student.gold || 0) + amount, bankGold: curDep - amount });
      }
      batch.set(doc(collection(db, 'bankLogs')), {
        studentId: docId, studentCode: student.studentCode, studentName: student.name || student.studentCode,
        type: 'withdraw', currency, amount, newDeposit: curDep - amount, createdAt: serverTimestamp(),
        classId: scope.classId || null,
        teacherUid: scope.teacherUid || null,
        scopeKey: scope.scopeKey || null,
      });
      await batch.commit();

      setStudent(prev => ({
        ...prev,
        diamonds:   currency === 'diamond' ? (prev.diamonds || 0) + amount : prev.diamonds,
        gold:       currency === 'gold'    ? (prev.gold    || 0) + amount : prev.gold,
        bankDiamond: currency === 'diamond' ? curDep - amount : prev.bankDiamond,
        bankGold:    currency === 'gold'    ? curDep - amount : prev.bankGold,
      }));
      setLogs(prev => [{
        id: `t${Date.now()}`, type: 'withdraw', currency, amount,
        newDeposit: curDep - amount, createdAt: { seconds: Date.now() / 1000 },
      }, ...prev]);
      if (currency === 'diamond') setDiaWithdraw(''); else setGoldWithdraw('');
      showToast('출금 완료!');
    } catch (err) {
      console.error(err);
      showToast('출금 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-64 gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <div className="text-slate-400 font-bold text-sm">불러오는 중...</div>
      </div>
    );
  }

  if (!studentCode) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400">
        <div className="text-6xl mb-4">🏦</div>
        <p className="font-bold text-lg text-slate-600">학급 은행</p>
        <p className="text-sm mt-1">교사 페이지에서 테스트 로그인하면 이용할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">🏦 학급 은행</h1>
          {student && <p className="text-sm text-slate-500 mt-0.5">{student.name || student.studentCode}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('overview')}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${tab === 'overview' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
            예금 현황
          </button>
          <button onClick={() => setTab('log')}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${tab === 'log' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
            거래 내역 ({logs.length})
          </button>
        </div>
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          {/* 이율 안내 배너 */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-5 text-white shadow-lg">
            <div className="text-xs font-bold opacity-70 mb-2">학급 은행 주간 이율 (복리)</div>
            <div className="flex gap-8">
              <div>
                <span className="text-4xl font-black">{(diaRate * 100).toFixed(1)}%</span>
                <span className="text-sm ml-2 opacity-80">💎 다이아</span>
              </div>
              <div>
                <span className="text-4xl font-black">{(goldRate * 100).toFixed(1)}%</span>
                <span className="text-sm ml-2 opacity-80">🪙 골드</span>
              </div>
            </div>
            <div className="text-xs opacity-60 mt-2">선생님이 매주 이자를 지급합니다 · 복리 적용</div>
          </div>

          {/* 💎 다이아 계좌 */}
          <CurrencySection
            label="💎 다이아 예금"
            headerBg="bg-indigo-50 border-indigo-100"
            headerText="text-indigo-800"
            deposit={bankDia}
            depositColor="text-indigo-700"
            depositBg="bg-indigo-50"
            interest={diaTotalInterest}
            nextInterest={nextDiaInt}
            nextInterestBg="bg-amber-50"
            nextInterestColor="text-amber-700"
            available={student?.diamonds || 0}
            availLabel="보유 다이아"
            depositInputValue={diaDeposit}
            onDepositChange={e => setDiaDeposit(e.target.value)}
            onDeposit={() => doDeposit('diamond')}
            withdrawInputValue={diaWithdraw}
            onWithdrawChange={e => setDiaWithdraw(e.target.value)}
            onWithdraw={() => doWithdraw('diamond')}
            onWithdrawAll={() => doWithdraw('diamond', true)}
            depositBtnCls="bg-indigo-600 hover:bg-indigo-700"
            isBusy={isBusy}
            hasDeposit={bankDia > 0}
          />

          {/* 🪙 골드 계좌 */}
          <CurrencySection
            label="🪙 골드 예금"
            headerBg="bg-amber-50 border-amber-100"
            headerText="text-amber-800"
            deposit={bankGold}
            depositColor="text-amber-700"
            depositBg="bg-amber-50"
            interest={goldTotalInterest}
            nextInterest={nextGoldInt}
            nextInterestBg="bg-orange-50"
            nextInterestColor="text-orange-700"
            available={student?.gold || 0}
            availLabel="보유 골드"
            depositInputValue={goldDeposit}
            onDepositChange={e => setGoldDeposit(e.target.value)}
            onDeposit={() => doDeposit('gold')}
            withdrawInputValue={goldWithdraw}
            onWithdrawChange={e => setGoldWithdraw(e.target.value)}
            onWithdraw={() => doWithdraw('gold')}
            onWithdrawAll={() => doWithdraw('gold', true)}
            depositBtnCls="bg-amber-500 hover:bg-amber-600"
            isBusy={isBusy}
            hasDeposit={bankGold > 0}
          />
        </div>
      )}

      {tab === 'log' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-700 text-sm">거래 내역</h3>
            <span className="text-xs text-slate-400">{logs.length}건</span>
          </div>
          {logs.length === 0 ? (
            <div className="text-center py-14 text-slate-400">
              <div className="text-4xl mb-2">📋</div>
              <p className="font-bold">거래 내역이 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map(log => (
                <div key={log.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 ${LOG_TYPE_COLOR[log.type] || 'bg-slate-100'}`}>
                    {LOG_TYPE_ICON[log.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-700">
                      {LOG_TYPE_LABEL[log.type]} {log.currency === 'diamond' ? '💎' : '🪙'}
                      {log.type === 'interest' && log.rate && (
                        <span className="text-xs text-slate-400 font-normal ml-1">({(log.rate * 100).toFixed(1)}%)</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{fmtDate(log.createdAt)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-extrabold text-sm
                      ${log.type === 'withdraw' ? 'text-rose-500' : 'text-indigo-600'}`}>
                      {log.type === 'withdraw' ? '-' : '+'}{(log.amount || 0).toLocaleString()}
                      {log.currency === 'diamond' ? ' 💎' : ' 🪙'}
                    </div>
                    <div className="text-xs text-slate-400">잔액 {(log.newDeposit || 0).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ─────────────────────── 재화별 섹션 컴포넌트 ────────────────
function CurrencySection({
  label, headerBg, headerText, deposit, depositColor, depositBg,
  interest, nextInterest, nextInterestBg, nextInterestColor,
  available, availLabel,
  depositInputValue, onDepositChange, onDeposit,
  withdrawInputValue, onWithdrawChange, onWithdraw, onWithdrawAll,
  depositBtnCls, isBusy, hasDeposit,
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`px-5 py-3 border-b flex items-center justify-between ${headerBg}`}>
        <h3 className={`font-bold ${headerText}`}>{label}</h3>
        <span className="text-xs text-slate-400 font-medium">{availLabel}: {available.toLocaleString()}</span>
      </div>
      <div className="p-5">
        {/* 잔액 카드 3개 */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className={`text-center rounded-xl p-3 ${depositBg}`}>
            <div className={`text-2xl font-extrabold ${depositColor}`}>{deposit.toLocaleString()}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5">예치금</div>
          </div>
          <div className="text-center bg-emerald-50 rounded-xl p-3">
            <div className="text-2xl font-extrabold text-emerald-700">+{interest.toLocaleString()}</div>
            <div className="text-[10px] font-bold text-emerald-400 mt-0.5">누적 이자</div>
          </div>
          <div className={`text-center rounded-xl p-3 ${nextInterestBg}`}>
            <div className={`text-2xl font-extrabold ${nextInterestColor}`}>+{nextInterest.toLocaleString()}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5">다음 이자 예상</div>
          </div>
        </div>

        {/* 예치 / 출금 */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* 예치 */}
          <div className="flex gap-2 flex-1">
            <input
              type="number" min="1" value={depositInputValue} onChange={onDepositChange}
              placeholder="예치 금액"
              className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 min-w-0"
            />
            <button onClick={onDeposit} disabled={isBusy || !depositInputValue}
              className={`px-4 py-2.5 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-40 shrink-0 ${depositBtnCls}`}>
              예치
            </button>
          </div>
          {/* 출금 */}
          <div className="flex gap-2">
            <input
              type="number" min="1" max={deposit} value={withdrawInputValue} onChange={onWithdrawChange}
              placeholder="출금 금액"
              className="w-28 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-300"
            />
            <button onClick={onWithdraw} disabled={isBusy || !withdrawInputValue || !hasDeposit}
              className="px-3 py-2.5 bg-slate-100 hover:bg-rose-50 text-rose-600 font-bold text-sm rounded-xl border border-slate-200 transition-colors disabled:opacity-40 shrink-0">
              출금
            </button>
            <button onClick={onWithdrawAll} disabled={isBusy || !hasDeposit}
              className="px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl border border-rose-200 transition-colors disabled:opacity-40 shrink-0">
              전액
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClassBank;
