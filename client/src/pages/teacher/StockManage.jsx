import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, getDoc, doc, writeBatch,
  updateDoc, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';

const getMostRecentMonday = () => {
  const now = new Date();
  const diff = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
};

const fmtTs = (ts) => {
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ─────────────────────── ETF 편집 모달 ───────────────────────
function EtfEditModal({ etf, onSave, onClose }) {
  const [dividendRate, setDividendRate] = useState(
    parseFloat(((etf.dividendRate || 0) * 100).toFixed(2))
  );
  const [active, setActive] = useState(etf.active !== false);

  const handleSave = () => {
    onSave(etf.id, {
      dividendRate: dividendRate / 100,
      active,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-5 bg-indigo-600 text-white font-bold text-lg flex justify-between">
          <span>✏️ ETF 설정 수정</span>
          <button onClick={onClose} className="text-indigo-200 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <div className="text-sm font-bold text-slate-700 mb-1">{etf.name}</div>
            <div className="text-xs text-slate-400 font-mono">{etf.symbol}</div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">
              주간 배당률 (%)
            </label>
            <input
              type="number" min="0" max="10" step="0.1"
              value={dividendRate}
              onChange={e => setDividendRate(parseFloat(e.target.value) || 0)}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-lg font-bold text-center focus:outline-none focus:border-indigo-500"
            />
            <p className="text-xs text-slate-400 mt-1 text-center">
              0% = 배당 없음 (금 ETF 등)
            </p>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <div className="text-sm font-bold text-slate-700">ETF 활성화</div>
              <div className="text-xs text-slate-400">학생에게 표시됩니다</div>
            </div>
            <button onClick={() => setActive(a => !a)}
              className={`w-12 h-6 rounded-full transition-colors relative ${active ? 'bg-indigo-500' : 'bg-slate-300'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${active ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
            취소
          </button>
          <button onClick={handleSave}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function StockManage() {
  const [etfs, setEtfs]             = useState([]);
  const [students, setStudents]     = useState([]);
  const [soulPrice, setSoulPrice]       = useState('');
  const [isSoulSaving, setIsSoulSaving] = useState(false);
  const [isSoulToggling, setIsSoulToggling] = useState(false);
  const [portfolioMap, setPortfolioMap] = useState({}); // { studentId: holdings{} }
  const [dividendLogs, setDividendLogs] = useState([]);
  const [tab, setTab]               = useState('etfs');
  const [isLoading, setIsLoading]   = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaying, setIsPaying]     = useState(false);
  const [editingEtf, setEditingEtf] = useState(null);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [etfsSnap, studentsSnap, logSnap] = await Promise.all([
        getDocs(collection(db, 'etfs')),
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'dividendLogs')),
      ]);

      const etfList = etfsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
      setEtfs(etfList);

      const sList = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.studentCode || '').localeCompare(b.studentCode || ''));
      setStudents(sList);

      setDividendLogs(logSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.paidAt?.seconds || 0) - (a.paidAt?.seconds || 0)));
    } catch (err) {
      console.error('주식 관리 로딩 에러:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // ── 포트폴리오 로드 (탭 전환 시) ──────────────────────────
  useEffect(() => {
    if (tab !== 'portfolio' || students.length === 0) return;
    const loadPortfolios = async () => {
      const map = {};
      await Promise.all(
        students.map(async s => {
          const snap = await getDocs(collection(db, 'portfolios', s.id, 'holdings'));
          if (!snap.empty) {
            map[s.id] = {};
            snap.docs.forEach(d => { map[s.id][d.id] = d.data(); });
          }
        })
      );
      setPortfolioMap(map);
    };
    loadPortfolios();
  }, [tab, students]);

  // ── 가격 새로고침 ────────────────────────────────────────────
  const refreshPrices = async () => {
    setIsRefreshing(true);
    try {
      const res  = await fetch('/api/stock-prices');
      const data = await res.json();
      if (data.prices?.length > 0) {
        const batch = writeBatch(db);
        data.prices.forEach(p => batch.set(doc(db, 'etfs', p.id), p, { merge: true }));
        await batch.commit();
        setEtfs(data.prices.sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0)));
        alert(`✅ ${data.prices.length}개 ETF 가격 업데이트 완료!\n기준: 미국 전일 종가`);
      }
    } catch (err) {
      console.error(err);
      alert('가격 업데이트 실패. 인터넷 연결을 확인해주세요.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // ── 학급 특별 채권 초기 생성 ─────────────────────────────────
  const initSoulEtf = async () => {
    const soulRef = doc(db, 'etfs', 'teacher_soul');
    const snap    = await getDoc(soulRef);
    if (snap.exists()) { alert('이미 생성되어 있습니다!'); return; }

    await setDoc(soulRef, {
      id: 'teacher_soul', symbol: 'SOUL', name: '학급 특별 채권',
      theme: '특별',
      description: '우리 선생님의 소중한 영혼이 담긴 특별 ETF입니다. 매일 0.8%씩 자동 상승합니다.',
      currentPrice: 100, prevPrice: 100, changePercent: 0,
      basePrice: 100, baseShares: 50, maxShares: 100,
      dailyGrowthRate: 0.008, dividendRate: 0,
      isTeacherControlled: true, teacherSetToday: false,
      lastPriceUpdate: '', active: true,
      currency: 'gold',
      updatedAt: new Date().toISOString(),
      updatedDate: '',
    });
    alert('✅ 학급 특별 채권 ETF가 생성되었습니다!\n학생들이 주식 페이지에 접속하면 자동으로 50주가 지급됩니다.');
    fetchAll();
  };

  // ── 학급 특별 채권 배당 지급 (가격 초기화 + 학생 수령 대기) ─────
  const paySoulDividend = async () => {
    const soul = etfs.find(e => e.id === 'teacher_soul');
    if (!soul) return alert('학급 특별 채권 ETF가 없습니다.');

    const dividendPerShare = Math.floor(soul.currentPrice - 100);
    if (dividendPerShare <= 0) {
      return alert('현재 가격이 100골드 이하입니다.\n1일 이상 지나야 배당금이 발생합니다.');
    }

    if (!window.confirm(
      `학급 특별 채권 배당금을 지급하시겠습니까?\n\n` +
      `현재 가격: 🪙${soul.currentPrice}\n` +
      `주당 배당금: 🪙${dividendPerShare}\n` +
      `가격 100G로 초기화됩니다.\n\n` +
      `학생들은 "보상 수령하기" 버튼을 눌러 수령합니다.`
    )) return;

    setIsSoulSaving(true);
    try {
      // 모든 학생 보유 현황 로드
      const snap = await getDocs(collection(db, 'students'));
      const allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const batch = writeBatch(db);
      let count = 0, totalPaid = 0;

      await Promise.all(
        allStudents.map(async stu => {
          const holdSnap = await getDocs(collection(db, 'portfolios', stu.id, 'holdings'));
          const soulDoc  = holdSnap.docs.find(d => d.id === 'teacher_soul');
          if (!soulDoc) return;
          const qty = soulDoc.data().quantity || 0;
          if (qty <= 0) return;

          const amount = dividendPerShare * qty;
          batch.update(doc(db, 'students', stu.id), {
            pendingSoulDividend: (stu.pendingSoulDividend || 0) + amount,
          });
          totalPaid += amount;
          count++;
        })
      );

      // 가격 100G으로 초기화
      const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
      batch.update(doc(db, 'etfs', 'teacher_soul'), {
        prevPrice:       soul.currentPrice,
        currentPrice:    100,
        changePercent:   parseFloat(((100 - soul.currentPrice) / soul.currentPrice * 100).toFixed(2)),
        lastPriceUpdate: today,
        teacherSetToday: true,
        updatedDate:     today,
      });

      await batch.commit();

      setEtfs(prev => prev.map(e => e.id === 'teacher_soul'
        ? { ...e, prevPrice: e.currentPrice, currentPrice: 100 }
        : e
      ));

      alert(`✅ 배당금 지급 완료!\n${count}명에게 총 🪙${totalPaid.toLocaleString()} 골드 지급 대기\n가격 100G로 초기화됨\n\n학생들이 "보상 수령하기"를 누르면 수령됩니다.`);
    } catch (err) {
      console.error('영혼 배당 에러:', err);
      alert('배당 지급 중 오류가 발생했습니다.');
    } finally {
      setIsSoulSaving(false);
    }
  };

  // ── 학급 특별 채권 활성화/비활성화 ──────────────────────────
  const toggleSoulActive = async () => {
    const soul = etfs.find(e => e.id === 'teacher_soul');
    if (!soul) return;
    const newActive = soul.active === false;
    if (!window.confirm(newActive
      ? '학급 특별 채권 ETF를 활성화하시겠습니까?\n학생 시장 탭에 다시 표시됩니다.'
      : '학급 특별 채권 ETF를 비활성화하시겠습니까?\n학생 시장 탭에서 숨겨집니다. (보유 주식은 유지됩니다)'
    )) return;
    setIsSoulToggling(true);
    try {
      await updateDoc(doc(db, 'etfs', 'teacher_soul'), { active: newActive });
      setEtfs(prev => prev.map(e => e.id === 'teacher_soul' ? { ...e, active: newActive } : e));
      alert(newActive ? '✅ 활성화되었습니다.' : '🔴 비활성화되었습니다.');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSoulToggling(false);
    }
  };

  // ── 학급 특별 채권 가격 수동 설정 ───────────────────────────
  const setSoulPriceManual = async () => {
    const price = parseFloat(soulPrice);
    if (!price || price <= 0) return alert('올바른 가격을 입력해주세요.');
    const soulEtf = etfs.find(e => e.id === 'teacher_soul');
    if (!soulEtf) return alert('먼저 ETF를 초기 생성해주세요.');

    const prevPrice   = soulEtf.currentPrice || 100;
    const changePct   = parseFloat(((price - prevPrice) / prevPrice * 100).toFixed(2));
    const today       = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

    setIsSoulSaving(true);
    try {
      await updateDoc(doc(db, 'etfs', 'teacher_soul'), {
        prevPrice, currentPrice: price,
        changePercent: changePct,
        lastPriceUpdate: today,
        teacherSetToday: true,   // 오늘은 자동 0.8% 적용 안 함
        updatedAt: new Date().toISOString(),
        updatedDate: today,
      });
      setEtfs(prev => prev.map(e => e.id === 'teacher_soul'
        ? { ...e, prevPrice, currentPrice: price, changePercent: changePct }
        : e
      ));
      setSoulPrice('');
      alert(`✅ 학급 특별 채권 가격이 🪙${price.toLocaleString()}으로 설정되었습니다!\n(오늘 자동 0.8% 상승은 적용되지 않습니다)`);
    } catch (err) {
      console.error(err);
      alert('가격 설정 실패');
    } finally {
      setIsSoulSaving(false);
    }
  };

  // ── ETF 설정 저장 ────────────────────────────────────────────
  const saveEtfEdit = async (etfId, updates) => {
    try {
      await updateDoc(doc(db, 'etfs', etfId), updates);
      setEtfs(prev => prev.map(e => e.id === etfId ? { ...e, ...updates } : e));
    } catch (err) {
      console.error('ETF 저장 에러:', err);
    }
  };

  // ── 배당금 일괄 지급 ─────────────────────────────────────────
  const payDividends = async () => {
    const thisMonday = getMostRecentMonday();
    if (!window.confirm(
      `이번 주(${thisMonday}) 배당금을 모든 학생에게 지급하시겠습니까?\n` +
      `배당 ETF 보유 학생에게만 지급됩니다.`
    )) return;

    setIsPaying(true);
    try {
      // 모든 학생 포트폴리오 로드
      const allHoldings = {};
      await Promise.all(
        students.map(async student => {
          const snap = await getDocs(collection(db, 'portfolios', student.id, 'holdings'));
          if (!snap.empty) {
            allHoldings[student.id] = { student, holdings: {} };
            snap.docs.forEach(d => { allHoldings[student.id].holdings[d.id] = d.data(); });
          }
        })
      );

      // 배당 계산 및 배치 처리
      const batch = writeBatch(db);
      let totalGoldPaid = 0;
      let studentsCount = 0;

      for (const [studentId, { student, holdings }] of Object.entries(allHoldings)) {
        let studentDividend = 0;

        for (const [etfId, holding] of Object.entries(holdings)) {
          const etf = etfs.find(e => e.id === etfId);
          if (!etf || !etf.dividendRate || holding.quantity <= 0) continue;
          const div = Math.floor(holding.quantity * (etf.currentPrice || 0) * etf.dividendRate);
          if (div <= 0) continue;

          studentDividend += div;
          batch.set(doc(collection(db, 'dividendLogs')), {
            studentId, studentCode: student.studentCode,
            studentName: student.name || student.studentCode,
            etfId, etfName: etf.name, etfSymbol: etf.symbol,
            quantity: holding.quantity,
            priceAtTime: etf.currentPrice || 0,
            dividendRate: etf.dividendRate,
            dividendAmount: div,
            weekOf: thisMonday,
            paidAt: serverTimestamp(),
          });
        }

        if (studentDividend > 0) {
          batch.update(doc(db, 'students', studentId), {
            gold: (student.gold || 0) + studentDividend,
            lastDividendDate: thisMonday,
          });
          totalGoldPaid += studentDividend;
          studentsCount++;
        }
      }

      await batch.commit();
      alert(`✅ 배당 지급 완료!\n${studentsCount}명 · 총 🪙${totalGoldPaid.toLocaleString()} 골드 지급`);
      fetchAll();
    } catch (err) {
      console.error('배당 지급 에러:', err);
      alert('배당 지급 중 오류가 발생했습니다.');
    } finally {
      setIsPaying(false);
    }
  };

  // ── 파생 데이터 ──────────────────────────────────────────────
  const totalDivPaid = dividendLogs.reduce((s, l) => s + (l.dividendAmount || 0), 0);
  const lastDivDate  = dividendLogs[0]?.weekOf || '-';

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">📈 주식·ETF 거래소 관리</h1>
            <p className="text-slate-500 text-sm mt-0.5">ETF 가격 업데이트 및 배당금을 관리합니다.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={refreshPrices} disabled={isRefreshing}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50 shadow-sm">
              {isRefreshing ? '업데이트 중...' : '🔄 가격 새로고침'}
            </button>
            <button onClick={payDividends} disabled={isPaying}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50 shadow-sm">
              {isPaying ? '지급 중...' : '💰 배당금 지급하기'}
            </button>
          </div>
        </div>

        {/* 학급 특별 채권 ETF 관리 카드 */}
        {(() => {
          const soul = etfs.find(e => e.id === 'teacher_soul');
          return (
            <div className="bg-gradient-to-r from-violet-600 to-pink-600 rounded-2xl p-5 shadow-md mb-6 text-white">
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                  <div className="text-xs font-bold opacity-70 mb-1">👻 특별 ETF 관리</div>
                  <h2 className="font-extrabold text-xl mb-1">학급 특별 채권</h2>
                  {soul ? (
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-black">🪙 {(soul.currentPrice || 100).toLocaleString()}</span>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded-full
                        ${soul.changePercent > 0 ? 'bg-white/20' : soul.changePercent < 0 ? 'bg-red-900/30' : 'bg-white/10'}`}>
                        {soul.changePercent > 0 ? '+' : ''}{(soul.changePercent || 0).toFixed(2)}%
                        {soul.changePercent > 0 ? ' ▲' : soul.changePercent < 0 ? ' ▼' : ''}
                      </span>
                      {soul.teacherSetToday && (
                        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">오늘 수동 설정됨</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-white/70 text-sm">아직 생성되지 않았습니다</div>
                  )}
                  <div className="text-xs opacity-60 mt-1">매일 0.8% 자동 상승 · 기본 50주 지급 · 최대 100주</div>
                  <div className="text-xs bg-white/15 rounded-lg px-3 py-2 mt-2 leading-relaxed space-y-0.5">
                    <div>💡 매일 1%씩 자동 상승 (학급 특별 채권 형태)</div>
                    <div>💰 배당 지급 시 (현재가 - 100G) × 보유주수를 학생에게 지급 후 100G 초기화</div>
                    <div>🎓 교실 상황에 따라 가격을 선생님이 직접 조정 가능</div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 min-w-[220px]">
                  {soul ? (
                    <>
                      <div className="flex gap-2">
                        <input
                          type="number" min="1" value={soulPrice}
                          onChange={e => setSoulPrice(e.target.value)}
                          placeholder={`현재: ${soul.currentPrice || 100}`}
                          className="flex-1 bg-white/20 border border-white/30 rounded-xl px-3 py-2 text-white placeholder-white/50 font-bold text-sm focus:outline-none focus:border-white"
                        />
                        <button onClick={setSoulPriceManual} disabled={isSoulSaving || !soulPrice}
                          className="px-4 py-2 bg-white text-violet-700 font-extrabold text-sm rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50">
                          {isSoulSaving ? '...' : '설정'}
                        </button>
                      </div>
                      {/* 배당 지급: 현재가 > 100 일 때만 활성화 */}
                      <button
                        onClick={paySoulDividend}
                        disabled={isSoulSaving || (soul.currentPrice || 100) <= 100}
                        className="w-full py-2 rounded-xl font-extrabold text-sm bg-amber-400 hover:bg-amber-300 text-amber-900 transition-colors disabled:opacity-40">
                        💰 배당금 지급 ({Math.floor((soul.currentPrice || 100) - 100)}G/주) + 가격 100G 초기화
                      </button>
                      <button
                        onClick={toggleSoulActive}
                        disabled={isSoulToggling}
                        className={`w-full py-2 rounded-xl font-bold text-sm transition-colors disabled:opacity-50
                          ${soul.active !== false
                            ? 'bg-white/20 hover:bg-red-500/40 text-white border border-white/30'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-white'}`}>
                        {isSoulToggling ? '처리 중...'
                          : soul.active !== false ? '🔴 비활성화 (학생 시장에서 숨김)' : '🟢 활성화하기'}
                      </button>
                      <div className="text-[10px] text-white/60 text-center">
                        수동 설정 시 오늘 자동 0.8% 적용 안 됨
                      </div>
                    </>
                  ) : (
                    <button onClick={initSoulEtf}
                      className="px-5 py-2.5 bg-white text-violet-700 font-extrabold text-sm rounded-xl hover:bg-white/90 transition-colors">
                      👻 ETF 초기 생성하기
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* 배당 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <div className="text-xs text-slate-400 font-medium">ETF 수</div>
            <div className="text-2xl font-extrabold text-slate-800 mt-1">{etfs.length}개</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <div className="text-xs text-slate-400 font-medium">누적 배당 지급</div>
            <div className="text-2xl font-extrabold text-amber-600 mt-1">🪙 {totalDivPaid.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <div className="text-xs text-slate-400 font-medium">마지막 배당일</div>
            <div className="text-lg font-extrabold text-slate-800 mt-1">{lastDivDate}</div>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-5">
          {[
            ['etfs',      `ETF 목록 (${etfs.length})`],
            ['portfolio', '학생 포트폴리오'],
            ['logs',      `배당 내역 (${dividendLogs.length})`],
          ].map(([val, label]) => (
            <button key={val} onClick={() => setTab(val)}
              className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
                ${tab === val ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── ETF 목록 탭 ── */}
        {tab === 'etfs' && (
          isLoading ? (
            <div className="text-center py-16 text-slate-400 font-bold">불러오는 중...</div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-100">
                    <th className="px-5 py-3 font-semibold">ETF</th>
                    <th className="px-5 py-3 font-semibold text-right">현재가 (골드)</th>
                    <th className="px-5 py-3 font-semibold text-right">등락률</th>
                    <th className="px-5 py-3 font-semibold text-right">배당률/주</th>
                    <th className="px-5 py-3 font-semibold text-center">상태</th>
                    <th className="px-5 py-3 font-semibold text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {etfs.map(etf => {
                    const isUp   = etf.changePercent > 0;
                    const isDown = etf.changePercent < 0;
                    return (
                      <tr key={etf.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-800 text-sm">{etf.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{etf.symbol}</div>
                        </td>
                        <td className="px-5 py-3 text-right font-extrabold text-slate-800 text-sm">
                          🪙 {(etf.currentPrice || 0).toLocaleString()}
                        </td>
                        <td className={`px-5 py-3 text-right font-bold text-sm
                          ${isUp ? 'text-emerald-600' : isDown ? 'text-rose-500' : 'text-slate-400'}`}>
                          {isUp ? '+' : ''}{(etf.changePercent || 0).toFixed(2)}%
                          {isUp ? ' ▲' : isDown ? ' ▼' : ''}
                        </td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-amber-600">
                          {etf.dividendRate > 0 ? `${(etf.dividendRate * 100).toFixed(1)}%` : '-'}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                            ${etf.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {etf.active !== false ? '활성' : '비활성'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <button onClick={() => setEditingEtf(etf)}
                            className="text-xs bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600 font-bold px-3 py-1.5 rounded-lg transition-colors">
                            수정
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {etfs.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <p className="font-bold">등록된 ETF가 없습니다</p>
                  <p className="text-sm mt-1">"가격 새로고침"을 눌러 ETF 데이터를 불러오세요</p>
                </div>
              )}
            </div>
          )
        )}

        {/* ── 학생 포트폴리오 탭 ── */}
        {tab === 'portfolio' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
              <h3 className="font-bold text-slate-700 text-sm">학생별 보유 ETF 현황</h3>
            </div>
            {Object.keys(portfolioMap).length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <div className="text-4xl mb-2">💼</div>
                <p className="font-bold">포트폴리오 보유 학생이 없습니다</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {students.filter(s => portfolioMap[s.id]).map(student => {
                  const holdings = portfolioMap[student.id] || {};
                  const totalValue = Object.entries(holdings).reduce((sum, [etfId, h]) => {
                    const etf = etfs.find(e => e.id === etfId);
                    return sum + (etf ? (etf.currentPrice || 0) * h.quantity : 0);
                  }, 0);
                  const totalCost = Object.values(holdings).reduce((sum, h) => sum + h.avgBuyPrice * h.quantity, 0);
                  const pnl = totalValue - totalCost;

                  return (
                    <div key={student.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="font-bold text-slate-800 text-sm">{student.name || student.studentCode}</span>
                          {student.name && <span className="text-xs text-slate-400 font-mono ml-2">{student.studentCode}</span>}
                        </div>
                        <div className="text-right">
                          <div className="font-extrabold text-slate-800 text-sm">🪙 {totalValue.toLocaleString()}</div>
                          <div className={`text-xs font-bold ${pnl >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()} ({totalCost > 0 ? (pnl/totalCost*100).toFixed(1) : '0'}%)
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(holdings).map(([etfId, h]) => {
                          const etf = etfs.find(e => e.id === etfId);
                          return (
                            <span key={etfId} className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded-full border border-indigo-100">
                              {etf?.symbol || etfId} ×{h.quantity}주
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── 배당 내역 탭 ── */}
        {tab === 'logs' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-700 text-sm">배당 지급 내역</h3>
              <span className="text-xs text-slate-400">{dividendLogs.length}건 · 누적 🪙{totalDivPaid.toLocaleString()}</span>
            </div>
            {dividendLogs.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <div className="text-4xl mb-2">💰</div>
                <p className="font-bold">배당 내역이 없습니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-100">
                      <th className="px-5 py-3 font-semibold">학생</th>
                      <th className="px-5 py-3 font-semibold">ETF</th>
                      <th className="px-5 py-3 font-semibold text-center">수량</th>
                      <th className="px-5 py-3 font-semibold text-right">배당률</th>
                      <th className="px-5 py-3 font-semibold text-right">배당금</th>
                      <th className="px-5 py-3 font-semibold">주간</th>
                      <th className="px-5 py-3 font-semibold">지급일시</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {dividendLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-800 text-sm">{log.studentName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{log.studentCode}</div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-700 text-sm">{log.etfName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{log.etfSymbol}</div>
                        </td>
                        <td className="px-5 py-3 text-center text-sm font-bold text-slate-600">{log.quantity}주</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-amber-600">
                          {((log.dividendRate || 0) * 100).toFixed(1)}%
                        </td>
                        <td className="px-5 py-3 text-right font-extrabold text-emerald-600 text-sm">
                          🪙 +{(log.dividendAmount || 0).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500 font-mono">{log.weekOf}</td>
                        <td className="px-5 py-3 text-xs text-slate-400">{fmtTs(log.paidAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ETF 편집 모달 */}
      {editingEtf && (
        <EtfEditModal
          etf={editingEtf}
          onSave={saveEtfEdit}
          onClose={() => setEditingEtf(null)}
        />
      )}
    </div>
  );
}

export default StockManage;
