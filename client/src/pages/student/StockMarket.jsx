import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, writeBatch,
  serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';

// 이번 주 월요일 날짜 문자열
const getMostRecentMonday = () => {
  const now = new Date();
  const diff = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
};

const THEME_COLORS = {
  '기술':     'bg-sky-100 text-sky-700',
  '반도체':   'bg-violet-100 text-violet-700',
  '헬스케어': 'bg-emerald-100 text-emerald-700',
  '2차전지':  'bg-lime-100 text-lime-700',
  '에너지':   'bg-orange-100 text-orange-700',
  '소비재':   'bg-pink-100 text-pink-700',
  '부동산':   'bg-amber-100 text-amber-700',
  '원자재':   'bg-yellow-100 text-yellow-700',
  '배당·금융':'bg-blue-100 text-blue-700',
};

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
};

// ─────────────────────── ETF 카드 ─────────────────────────────
function EtfCard({ etf, myGold, onSelect }) {
  const isUp    = etf.changePercent > 0;
  const isDown  = etf.changePercent < 0;
  const sign    = isUp ? '+' : '';
  const canBuy  = myGold >= etf.currentPrice;

  return (
    <div
      onClick={() => onSelect(etf)}
      className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="font-mono text-xs text-slate-400 font-bold">{etf.symbol}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${THEME_COLORS[etf.theme] || 'bg-slate-100 text-slate-600'}`}>
                {etf.theme}
              </span>
            </div>
            <h3 className="font-extrabold text-slate-800 text-sm leading-tight">{etf.name}</h3>
          </div>
          <div className="text-right shrink-0">
            <div className="font-extrabold text-slate-800 text-base">
              🪙 {(etf.currentPrice || 0).toLocaleString()}
            </div>
            <div className={`text-sm font-bold ${isUp ? 'text-emerald-600' : isDown ? 'text-rose-500' : 'text-slate-400'}`}>
              {sign}{etf.changePercent?.toFixed(2)}%
              {isUp ? ' ▲' : isDown ? ' ▼' : ''}
            </div>
          </div>
        </div>

        {etf.dividendRate > 0 && (
          <div className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full inline-block">
            🏦 주간 배당 {(etf.dividendRate * 100).toFixed(1)}%
          </div>
        )}
      </div>

      <div className={`px-4 py-1.5 text-xs font-bold text-center
        ${canBuy ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
        {canBuy ? '매수 가능' : `골드 ${((etf.currentPrice || 0) - myGold).toLocaleString()} 부족`}
      </div>
    </div>
  );
}

// ─────────────────────── ETF 상세 모달 ───────────────────────
function EtfDetailModal({ etf, myGold, holdings, onBuy, onSell, onClose, isBusy }) {
  const [mode, setMode]       = useState('buy'); // 'buy' | 'sell'
  const [quantity, setQuantity] = useState(1);

  const holding     = holdings[etf.id] || { quantity: 0, avgBuyPrice: 0 };
  const maxBuy      = Math.floor(myGold / (etf.currentPrice || 1));
  const maxSell     = holding.quantity;
  const totalCost   = etf.currentPrice * quantity;
  const totalRevenue= etf.currentPrice * quantity;
  const profitLoss  = (etf.currentPrice - holding.avgBuyPrice) * holding.quantity;
  const plPct       = holding.avgBuyPrice > 0
    ? ((etf.currentPrice - holding.avgBuyPrice) / holding.avgBuyPrice * 100).toFixed(2)
    : '0.00';
  const isUp = etf.changePercent > 0;
  const isDown = etf.changePercent < 0;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className={`p-5 text-white flex justify-between items-start
          ${isUp ? 'bg-emerald-600' : isDown ? 'bg-rose-600' : 'bg-slate-600'}`}>
          <div>
            <div className="text-xs font-bold opacity-80 mb-0.5">{etf.symbol} · {etf.theme}</div>
            <h2 className="font-extrabold text-xl">{etf.name}</h2>
            <div className="text-2xl font-black mt-1">🪙 {(etf.currentPrice || 0).toLocaleString()}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold">
              {isUp ? '+' : ''}{etf.changePercent?.toFixed(2)}%
              {isUp ? ' ▲' : isDown ? ' ▼' : ''}
            </div>
            <button onClick={onClose} className="mt-2 text-white/70 hover:text-white text-xl">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 설명 */}
          <p className="text-sm text-slate-600 leading-relaxed">{etf.description}</p>

          {/* 배당 정보 */}
          {etf.dividendRate > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
              <span className="font-bold text-amber-700">🏦 주간 배당률 {(etf.dividendRate * 100).toFixed(1)}%</span>
              <div className="text-xs text-amber-600 mt-0.5">
                보유 중이면 매주 월요일 자동 지급됩니다
              </div>
            </div>
          )}

          {/* 보유 현황 */}
          {holding.quantity > 0 && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="text-xs font-bold text-slate-500 mb-2">내 보유 현황</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-slate-400 text-xs">보유 수량</div>
                  <div className="font-extrabold text-slate-800">{holding.quantity}주</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">평균 매수가</div>
                  <div className="font-extrabold text-slate-800">🪙 {holding.avgBuyPrice.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">평가금액</div>
                  <div className="font-extrabold text-slate-800">
                    🪙 {(etf.currentPrice * holding.quantity).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">평가손익</div>
                  <div className={`font-extrabold ${profitLoss >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {profitLoss >= 0 ? '+' : ''}{profitLoss.toLocaleString()} ({plPct}%)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 매수/매도 탭 */}
          <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden">
            {[['buy', '매수'], ['sell', '매도']].map(([val, label]) => (
              <button key={val} onClick={() => { setMode(val); setQuantity(1); }}
                className={`flex-1 py-2 font-bold text-sm transition-colors
                  ${mode === val
                    ? val === 'buy' ? 'bg-emerald-600 text-white' : 'bg-rose-500 text-white'
                    : 'text-slate-500 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* 수량 조절 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500">수량 선택</span>
              <span className="text-xs text-slate-400">
                최대 {mode === 'buy' ? maxBuy : maxSell}주
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl transition-colors">−</button>
              <div className="flex-1 text-center text-2xl font-extrabold text-slate-800">{quantity}</div>
              <button
                onClick={() => setQuantity(q => Math.min(mode === 'buy' ? maxBuy : maxSell, q + 1))}
                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl transition-colors">+</button>
            </div>
            {/* 빠른 선택 */}
            <div className="flex gap-2 mt-2">
              {[1, 5, 10].map(n => (
                <button key={n} onClick={() => setQuantity(Math.min(n, mode === 'buy' ? maxBuy : maxSell))}
                  className="flex-1 py-1 text-xs font-bold bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
                  {n}주
                </button>
              ))}
              <button onClick={() => setQuantity(mode === 'buy' ? maxBuy : maxSell)}
                className="flex-1 py-1 text-xs font-bold bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
                최대
              </button>
            </div>
          </div>

          {/* 비용 요약 */}
          <div className={`rounded-xl p-4 border text-sm space-y-1.5
            ${mode === 'buy' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            <div className="flex justify-between text-slate-600">
              <span>단가</span>
              <span className="font-bold">🪙 {(etf.currentPrice || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>수량</span>
              <span className="font-bold">{quantity}주</span>
            </div>
            <div className={`flex justify-between font-extrabold text-base border-t pt-1.5
              ${mode === 'buy' ? 'border-emerald-200 text-emerald-700' : 'border-rose-200 text-rose-600'}`}>
              <span>{mode === 'buy' ? '총 매수금액' : '총 매도금액'}</span>
              <span>🪙 {(mode === 'buy' ? totalCost : totalRevenue).toLocaleString()}</span>
            </div>
            {mode === 'buy' && (
              <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                <span>매수 후 잔액</span>
                <span>🪙 {Math.max(0, myGold - totalCost).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* 실행 버튼 */}
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => mode === 'buy' ? onBuy(etf, quantity) : onSell(etf, quantity)}
            disabled={isBusy || quantity < 1 || (mode === 'buy' && totalCost > myGold) || (mode === 'sell' && quantity > maxSell)}
            className={`w-full py-3.5 rounded-xl font-extrabold text-base transition-all active:scale-95 disabled:opacity-40
              ${mode === 'buy'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-rose-500 hover:bg-rose-600 text-white'}`}>
            {isBusy ? '처리 중...'
              : mode === 'buy'
                ? `${quantity}주 매수하기`
                : `${quantity}주 매도하기`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function StockMarket({ studentCode }) {
  const [etfs, setEtfs]               = useState([]);
  const [student, setStudent]         = useState(null);
  const [studentDocId, setStudentDocId] = useState(null);
  const [holdings, setHoldings]       = useState({});  // { etfId: { quantity, avgBuyPrice } }
  const [selectedEtf, setSelectedEtf] = useState(null);
  const [tab, setTab]                 = useState('market');
  const [themeFilter, setThemeFilter] = useState('전체');
  const [isLoading, setIsLoading]     = useState(true);
  const [isBusy, setIsBusy]           = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [dividendNotif, setDividendNotif] = useState(null); // 배당금 알림

  // ── 데이터 로딩 ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        // 1. Firestore에서 ETF 목록 로드
        const etfsSnap = await getDocs(collection(db, 'etfs'));
        let etfList = etfsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 2. 오늘 업데이트 필요한지 확인
        const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
        const needsUpdate = etfList.length === 0
          || etfList.some(e => e.updatedDate !== today);

        if (needsUpdate) {
          // 3. Vercel API에서 실시간 가격 가져오기
          const res = await fetch('/api/stock-prices');
          const data = await res.json();

          if (data.prices?.length > 0) {
            // 4. Firestore에 저장
            const batch = writeBatch(db);
            data.prices.forEach(price => {
              batch.set(doc(db, 'etfs', price.id), price, { merge: true });
            });
            await batch.commit();
            etfList = data.prices;
            setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
          }
        } else {
          setLastUpdated(etfList[0]?.updatedAt
            ? new Date(etfList[0].updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            : '');
        }

        etfList.sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
        setEtfs(etfList);

        // 5. 학생 데이터 로드
        if (studentCode) {
          const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const sDoc = snap.docs[0];
            const sData = sDoc.data();
            setStudentDocId(sDoc.id);
            setStudent({ id: sDoc.id, ...sData });

            // 6. 보유 주식 로드
            const holdSnap = await getDocs(collection(db, 'portfolios', sDoc.id, 'holdings'));
            const holdMap = {};
            holdSnap.docs.forEach(d => { holdMap[d.id] = d.data(); });
            setHoldings(holdMap);

            // 7. 배당금 자동 지급 체크 (주간)
            const thisMonday = getMostRecentMonday();
            const hasDivEtfs = Object.keys(holdMap).length > 0;
            if (hasDivEtfs && (!sData.lastDividendDate || sData.lastDividendDate < thisMonday)) {
              let totalDiv = 0;
              const batch = writeBatch(db);
              for (const [etfId, holding] of Object.entries(holdMap)) {
                const etf = etfList.find(e => e.id === etfId);
                if (!etf || !etf.dividendRate || holding.quantity <= 0) continue;
                const div = Math.floor(holding.quantity * (etf.currentPrice || 0) * etf.dividendRate);
                if (div <= 0) continue;
                totalDiv += div;
                batch.set(doc(collection(db, 'dividendLogs')), {
                  studentId:    sDoc.id,
                  studentCode:  sData.studentCode,
                  studentName:  sData.name || sData.studentCode,
                  etfId, etfName: etf.name, etfSymbol: etf.symbol,
                  quantity:     holding.quantity,
                  priceAtTime:  etf.currentPrice || 0,
                  dividendRate: etf.dividendRate,
                  dividendAmount: div,
                  weekOf:  thisMonday,
                  paidAt:  serverTimestamp(),
                });
              }
              if (totalDiv > 0) {
                batch.update(doc(db, 'students', sDoc.id), {
                  gold: (sData.gold || 0) + totalDiv,
                  lastDividendDate: thisMonday,
                });
                await batch.commit();
                setStudent(prev => ({ ...prev, gold: (prev.gold || 0) + totalDiv, lastDividendDate: thisMonday }));
                setDividendNotif(totalDiv);
                setTimeout(() => setDividendNotif(null), 6000);
              }
            }
          }
        }
      } catch (err) {
        console.error('주식 로딩 에러:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [studentCode]);

  // ── 매수 ────────────────────────────────────────────────────
  const handleBuy = async (etf, quantity) => {
    if (!studentDocId || !student) return;
    const total = etf.currentPrice * quantity;
    if ((student.gold || 0) < total) return alert('골드가 부족합니다.');

    setIsBusy(true);
    try {
      const batch   = writeBatch(db);
      const holding = holdings[etf.id] || { quantity: 0, avgBuyPrice: 0 };

      // 새 평균 매수가 계산
      const newQty    = holding.quantity + quantity;
      const newAvgPrc = Math.round(
        (holding.quantity * holding.avgBuyPrice + total) / newQty
      );

      batch.update(doc(db, 'students', studentDocId), {
        gold: (student.gold || 0) - total,
      });
      batch.set(doc(db, 'portfolios', studentDocId, 'holdings', etf.id), {
        quantity:     newQty,
        avgBuyPrice:  newAvgPrc,
        etfName:      etf.name,
        etfSymbol:    etf.symbol,
        updatedAt:    serverTimestamp(),
      }, { merge: true });

      await batch.commit();

      setStudent(prev => ({ ...prev, gold: (prev.gold || 0) - total }));
      setHoldings(prev => ({
        ...prev,
        [etf.id]: { quantity: newQty, avgBuyPrice: newAvgPrc, etfName: etf.name, etfSymbol: etf.symbol },
      }));
      setSelectedEtf(null);
      alert(`✅ ${etf.name} ${quantity}주 매수 완료!\n🪙 ${total.toLocaleString()} 골드 차감`);
    } catch (err) {
      console.error('매수 에러:', err);
      alert('매수 중 오류가 발생했습니다.');
    } finally {
      setIsBusy(false);
    }
  };

  // ── 매도 ────────────────────────────────────────────────────
  const handleSell = async (etf, quantity) => {
    if (!studentDocId || !student) return;
    const holding = holdings[etf.id];
    if (!holding || holding.quantity < quantity) return alert('보유 수량이 부족합니다.');

    const revenue  = etf.currentPrice * quantity;
    const profit   = (etf.currentPrice - holding.avgBuyPrice) * quantity;
    const profitSign = profit >= 0 ? '+' : '';

    if (!window.confirm(
      `${etf.name} ${quantity}주 매도하시겠습니까?\n` +
      `예상 수익: ${profitSign}${profit.toLocaleString()} 골드`
    )) return;

    setIsBusy(true);
    try {
      const batch  = writeBatch(db);
      const newQty = holding.quantity - quantity;

      batch.update(doc(db, 'students', studentDocId), {
        gold: (student.gold || 0) + revenue,
      });

      if (newQty <= 0) {
        // 전량 매도 → 보유 기록 삭제
        batch.delete(doc(db, 'portfolios', studentDocId, 'holdings', etf.id));
      } else {
        batch.update(doc(db, 'portfolios', studentDocId, 'holdings', etf.id), {
          quantity: newQty,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      setStudent(prev => ({ ...prev, gold: (prev.gold || 0) + revenue }));
      setHoldings(prev => {
        const updated = { ...prev };
        if (newQty <= 0) delete updated[etf.id];
        else updated[etf.id] = { ...updated[etf.id], quantity: newQty };
        return updated;
      });
      setSelectedEtf(null);
      alert(`✅ ${etf.name} ${quantity}주 매도 완료!\n🪙 ${revenue.toLocaleString()} 골드 수령\n수익: ${profitSign}${profit.toLocaleString()}`);
    } catch (err) {
      console.error('매도 에러:', err);
      alert('매도 중 오류가 발생했습니다.');
    } finally {
      setIsBusy(false);
    }
  };

  // ── 파생 데이터 ──────────────────────────────────────────────
  const themes = ['전체', ...new Set(etfs.map(e => e.theme))];
  const filteredEtfs = themeFilter === '전체'
    ? etfs
    : etfs.filter(e => e.theme === themeFilter);

  const portfolioItems = Object.entries(holdings)
    .filter(([, h]) => h.quantity > 0)
    .map(([etfId, h]) => {
      const etf = etfs.find(e => e.id === etfId);
      if (!etf) return null;
      const currentValue = etf.currentPrice * h.quantity;
      const cost         = h.avgBuyPrice * h.quantity;
      const pnl          = currentValue - cost;
      const pnlPct       = cost > 0 ? (pnl / cost * 100).toFixed(2) : '0.00';
      return { etf, holding: h, currentValue, cost, pnl, pnlPct };
    }).filter(Boolean);

  const totalInvested = portfolioItems.reduce((s, i) => s + i.cost, 0);
  const totalValue    = portfolioItems.reduce((s, i) => s + i.currentValue, 0);
  const totalPnl      = totalValue - totalInvested;
  const totalPnlPct   = totalInvested > 0 ? (totalPnl / totalInvested * 100).toFixed(2) : '0.00';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-64">
        <div className="text-slate-400 font-bold">실시간 시세 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50">
      {/* 헤더 */}
      <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-extrabold text-lg">📈 주식·ETF 거래소</h1>
          {lastUpdated && (
            <div className="text-[10px] text-slate-400 mt-0.5">
              오늘 {lastUpdated} 업데이트 (미국 전일 종가 기준)
            </div>
          )}
        </div>
        {student && (
          <div className="text-right">
            <div className="text-[10px] text-slate-400">보유 골드</div>
            <div className="font-extrabold text-amber-400 text-lg">
              🪙 {(student.gold || 0).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* 배당금 알림 배너 */}
      {dividendNotif && (
        <div className="bg-amber-400 text-amber-900 px-4 py-2.5 flex items-center justify-between animate-pulse">
          <span className="font-extrabold text-sm">
            💰 이번 주 배당금 🪙 {dividendNotif.toLocaleString()} 골드가 입금되었습니다!
          </span>
          <button onClick={() => setDividendNotif(null)} className="text-amber-800 hover:text-amber-900 font-bold">✕</button>
        </div>
      )}

      {/* 탭 */}
      <div className="flex border-b border-slate-200 bg-white">
        {[['market', '📊 시장'], ['portfolio', `💼 내 포트폴리오 (${portfolioItems.length})`]].map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)}
            className={`flex-1 py-3 font-bold text-sm transition-colors
              ${tab === val ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 시장 탭 ── */}
      {tab === 'market' && (
        <div className="p-4">
          {/* 테마 필터 */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
            {themes.map(theme => (
              <button key={theme} onClick={() => setThemeFilter(theme)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors shrink-0
                  ${themeFilter === theme
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200'}`}>
                {theme}
              </button>
            ))}
          </div>

          {!studentCode && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
              💡 교사 페이지에서 테스트 로그인하면 ETF를 매수할 수 있습니다.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredEtfs.map(etf => (
              <EtfCard
                key={etf.id} etf={etf}
                myGold={student?.gold || 0}
                onSelect={studentCode ? setSelectedEtf : () => {}}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 포트폴리오 탭 ── */}
      {tab === 'portfolio' && (
        <div className="p-4">
          {portfolioItems.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-3">💼</div>
              <p className="font-bold text-lg text-slate-600">보유 중인 ETF가 없습니다</p>
              <p className="text-sm mt-1">시장 탭에서 ETF를 매수해보세요!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 총 요약 */}
              <div className="bg-slate-800 text-white rounded-2xl p-5">
                <div className="text-xs text-slate-400 mb-1">총 평가금액</div>
                <div className="text-3xl font-black">🪙 {totalValue.toLocaleString()}</div>
                <div className={`text-sm font-bold mt-1 ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}{totalPnl.toLocaleString()} ({totalPnlPct}%)
                  {totalPnl >= 0 ? ' 📈' : ' 📉'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">투자 원금: 🪙 {totalInvested.toLocaleString()}</div>
              </div>

              {/* 보유 ETF 목록 */}
              {portfolioItems.map(({ etf, holding, currentValue, pnl, pnlPct }) => (
                <div key={etf.id}
                  onClick={() => setSelectedEtf(etf)}
                  className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 cursor-pointer hover:shadow-md transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-extrabold text-slate-800 text-sm">{etf.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{holding.quantity}주 보유 · 평균 🪙{holding.avgBuyPrice.toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-slate-800">🪙 {currentValue.toLocaleString()}</div>
                      <div className={`text-sm font-bold ${pnl >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()} ({pnlPct}%)
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ETF 상세 모달 */}
      {selectedEtf && (
        <EtfDetailModal
          etf={selectedEtf}
          myGold={student?.gold || 0}
          holdings={holdings}
          onBuy={handleBuy}
          onSell={handleSell}
          onClose={() => setSelectedEtf(null)}
          isBusy={isBusy}
        />
      )}
    </div>
  );
}

export default StockMarket;
