import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, writeBatch, updateDoc, setDoc,
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

const getKstNow = () => {
  const now = new Date();
  return new Date(now.getTime() + ((9 * 60) + now.getTimezoneOffset()) * 60000);
};

const getKstDateKey = (date = getKstNow()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const isAfter8AmKst = () => getKstNow().getHours() >= 8;

const getScopeFromStudent = (student) => {
  const classId = student?.classId || null;
  const teacherUid = student?.teacherUid || null;
  return { classId, teacherUid, scopeKey: classId || teacherUid || null };
};

const isInScope = (data, scope) => {
  if (!scope?.scopeKey) return false;
  if (data.scopeKey) return data.scopeKey === scope.scopeKey;
  if (scope.classId && data.classId) return data.classId === scope.classId;
  if (data.teacherUid) return data.teacherUid === scope.teacherUid;
  return true;
};

const isTeacherSoulId = (etfId) => etfId === 'teacher_soul' || etfId?.startsWith('teacher_soul_');

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
  '암호화폐': 'bg-orange-100 text-orange-700',
  '한국주식': 'bg-red-100 text-red-700',
};

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
};

// ─────────────────────── 세로 리스트 행 ──────────────────────
function StockListRow({ etf, myGold, myHolding, onSelect, isLast }) {
  const isUp   = etf.changePercent > 0;
  const isDown = etf.changePercent < 0;
  const qty    = myHolding?.quantity || 0;
  const expectedDiv = qty > 0 && etf.dividendRate > 0
    ? Math.floor(qty * (etf.currentPrice || 0) * etf.dividendRate)
    : 0;

  return (
    <div
      onClick={() => onSelect(etf)}
      className={`flex items-center px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors
        ${isLast ? '' : 'border-b border-slate-100'}`}>

      {/* 등락 컬러 바 */}
      <div className={`w-1 self-stretch rounded-full mr-4 shrink-0
        ${isUp ? 'bg-emerald-400' : isDown ? 'bg-rose-400' : 'bg-slate-200'}`} />

      {/* 종목 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <span className="font-extrabold text-slate-800 text-sm leading-tight">{etf.name}</span>
          <span className="text-[10px] text-slate-400 font-mono font-bold shrink-0">{etf.symbol}</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0
            ${THEME_COLORS[etf.theme] || 'bg-slate-100 text-slate-600'}`}>
            {etf.theme}
          </span>
          {etf.dividendRate > 0 && (
            <span className="text-[9px] text-slate-400 shrink-0">
              배당 {(etf.dividendRate * 100).toFixed(1)}%
            </span>
          )}
          {qty > 0 && (
            <span className="text-[9px] bg-indigo-50 text-indigo-600 font-bold px-1.5 py-0.5 rounded-md shrink-0">
              {qty}주
            </span>
          )}
          {expectedDiv > 0 && (
            <span className="text-[9px] bg-amber-50 text-amber-600 font-bold px-1.5 py-0.5 rounded-md shrink-0">
              💰+{expectedDiv.toLocaleString()}G
            </span>
          )}
        </div>
        {etf.topHoldings && (
          <div className="text-[9px] text-slate-400 truncate mt-0.5">{etf.topHoldings}</div>
        )}
      </div>

      {/* 가격 + 등락률 */}
      <div className="text-right ml-4 shrink-0">
        <div className="font-extrabold text-slate-800 text-sm">
          🪙 {(etf.currentPrice || 0).toLocaleString()}
        </div>
        <div className={`text-sm font-bold ${isUp ? 'text-emerald-600' : isDown ? 'text-rose-500' : 'text-slate-400'}`}>
          {isUp ? '+' : ''}{(etf.changePercent || 0).toFixed(2)}%
          {isUp ? ' ▲' : isDown ? ' ▼' : ''}
        </div>
      </div>

      {/* 화살표 */}
      <svg className="w-4 h-4 text-slate-300 ml-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

// ─────────────────────── ETF 상세 모달 ───────────────────────
function EtfDetailModal({ etf, myGold, holdings, onBuy, onSell, onClose, isBusy }) {
  const [mode, setMode]       = useState('buy'); // 'buy' | 'sell'
  const [quantity, setQuantity] = useState(1);

  const holding      = holdings[etf.id] || { quantity: 0, avgBuyPrice: 0, baseQuantity: 0 };
  const isSoul       = etf.isTeacherControlled === true || isTeacherSoulId(etf.id);
  const baseQty      = isSoul ? (holding.baseQuantity || 50) : 0;
  const maxBuy       = isSoul
    ? Math.min(Math.floor(myGold / (etf.currentPrice || 1)), 100 - holding.quantity)
    : Math.floor(myGold / (etf.currentPrice || 1));
  const maxSell      = Math.max(0, holding.quantity - baseQty);
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
          {/* 선생님의 영혼 특별 안내 */}
          {isSoul && (
            <div className="bg-gradient-to-br from-violet-50 to-pink-50 border border-violet-200 rounded-2xl p-4 space-y-2">
              <div className="font-extrabold text-violet-800 text-sm flex items-center gap-1.5">
                👻 세상에 단 하나뿐인 ETF
              </div>
              <p className="text-xs text-violet-700 leading-relaxed">
                우리 선생님의 소중한 영혼이 담긴 특별 ETF입니다.<br/>
                매일 오전 8시 전일 대비 <strong>1%씩</strong> 자동 상승하며,
                선생님이 특별한 날 가격을 직접 조정하기도 합니다.
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-white/70 rounded-xl p-2 text-center border border-violet-100">
                  <div className="font-extrabold text-violet-700">50주</div>
                  <div className="text-violet-500">기본 무료 지급</div>
                </div>
                <div className="bg-white/70 rounded-xl p-2 text-center border border-violet-100">
                  <div className="font-extrabold text-violet-700">최대 100주</div>
                  <div className="text-violet-500">추가 매수 가능</div>
                </div>
              </div>
              <div className="text-[10px] text-violet-500 bg-violet-100 rounded-lg px-3 py-1.5 font-medium">
                ⚠️ 기본 50주는 매도 불가 · 추가 구매분만 매도 가능
              </div>
              {holding.quantity > 0 && (
                <div className="text-[11px] text-slate-600 border-t border-violet-100 pt-2 grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="font-bold text-slate-700">{holding.quantity}주</div>
                    <div className="text-slate-400">현재 보유</div>
                  </div>
                  <div>
                    <div className="font-bold text-emerald-600">{maxSell}주</div>
                    <div className="text-slate-400">매도 가능</div>
                  </div>
                  <div>
                    <div className="font-bold text-indigo-600">{Math.max(0, 100 - holding.quantity)}주</div>
                    <div className="text-slate-400">추가 매수 가능</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 일반 설명 */}
          {!isSoul && <p className="text-sm text-slate-600 leading-relaxed">{etf.description}</p>}

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
  const [scope, setScope]             = useState({ classId: null, teacherUid: null, scopeKey: null });
  const [selectedEtf, setSelectedEtf] = useState(null);
  const [tab, setTab]                 = useState('market');
  const [themeFilter, setThemeFilter] = useState('전체');
  const [isLoading, setIsLoading]     = useState(true);
  const [isBusy, setIsBusy]               = useState(false);
  const [lastUpdated, setLastUpdated]     = useState('');
  const [dividendNotif, setDividendNotif]         = useState(null);
  const [dividendsReceived, setDividendsReceived] = useState(0);
  const [isReceivingSoul, setIsReceivingSoul]     = useState(false);
  const [toast, setToast]                         = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const soulEtfId = scope.scopeKey ? `teacher_soul_${scope.scopeKey}` : null;

  // ── 데이터 로딩 ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        // 1. Firestore에서 ETF 목록 로드
        const etfsSnap = await getDocs(collection(db, 'etfs'));
        let etfList = etfsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 2. 오늘 업데이트 필요한지 확인
        const today = getKstDateKey();
        const after8Am = isAfter8AmKst();
        // 새로 추가된 ETF가 없으면 강제 새로고침
        const REQUIRED_IDS = ['tech','semiconductor','healthcare','battery','energy','consumer',
          'reits','gold','bank','bitcoin','k_semiconductor','k_battery','k_healthcare','k_kospi200','samsung'];
        etfList = etfList.filter(e => !isTeacherSoulId(e.id) || (soulEtfId && e.id === soulEtfId));
        const existingIds  = etfList.filter(e => !isTeacherSoulId(e.id)).map(e => e.id);
        const hasMissing   = REQUIRED_IDS.some(id => !existingIds.includes(id));
        const regularCount = etfList.filter(e => !isTeacherSoulId(e.id)).length;
        const needsUpdate  = regularCount === 0 || (after8Am && (
          hasMissing || etfList.some(e => !isTeacherSoulId(e.id) && (e.updatedDateKey || e.updatedDate) !== today)
        ));

        if (needsUpdate) {
          // API 새로고침 전에 teacher_soul 보관 (API 목록에 없으므로 사라지면 안 됨)
          const prevSoul = soulEtfId ? etfList.find(e => e.id === soulEtfId) : null;

          // 3. Vercel API에서 실시간 가격 가져오기
          const res = await fetch('/api/stock-prices');
          const data = await res.json();

          if (data.prices?.length > 0) {
            // 4. 실제 데이터일 때만 Firestore에 저장 & etfList 교체
            // API 실패(success:false)면 Firestore 캐시 유지 (0% 덮어쓰기 방지)
            if (data.success !== false) {
              const batch = writeBatch(db);
              const normalizedPrices = data.prices.map(price => ({
                ...price,
                updatedDate: today,
                updatedDateKey: today,
              }));
              normalizedPrices.forEach(price => {
                batch.set(doc(db, 'etfs', price.id), price, { merge: true });
              });
              await batch.commit();
              setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
              etfList = normalizedPrices;
              // teacher_soul은 API에 없으므로 다시 추가
              if (prevSoul) etfList = [...etfList, prevSoul];
            }
            // else: API 실패 → 기존 Firestore etfList 그대로 사용
          }
        } else {
          setLastUpdated(etfList[0]?.updatedAt
            ? new Date(etfList[0].updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            : '');
        }

        // ── 선생님의 영혼: 날짜 바뀌면 무조건 1% 상승 ────────────
        // teacherSetToday는 당일 수동 설정 여부이므로, 날짜가 바뀌면 무시하고 상승 적용
        const soulEtf = soulEtfId ? etfList.find(e => e.id === soulEtfId) : null;
        if (soulEtf && after8Am) {
          const today2 = today;
          const soulUpdated = soulEtf.lastPriceUpdate || soulEtf.updatedDateKey || soulEtf.updatedDate;
          if (soulUpdated !== today2) {
            const growthRate = typeof soulEtf.dailyGrowthRate === 'number' ? soulEtf.dailyGrowthRate : 0.01;
            const prevPrice = soulEtf.currentPrice || 100;
            const newPrice  = Math.max(1, Math.floor(prevPrice * (1 + growthRate)));
            const changePct = parseFloat(((newPrice - prevPrice) / prevPrice * 100).toFixed(2));
            await updateDoc(doc(db, 'etfs', soulEtfId), {
              prevPrice,
              currentPrice:    newPrice,
              changePercent:   changePct,
              lastPriceUpdate: today2,
              updatedDate:     today2,
              updatedDateKey:  today2,
              teacherSetToday: false,
            });
            etfList = etfList.map(e => e.id === soulEtfId
              ? { ...e, prevPrice, currentPrice: newPrice, changePercent: changePct, updatedDate: today2, updatedDateKey: today2 }
              : e
            );
          }
        }

        // 선생님의 영혼 항상 맨 위, 나머지는 등락률 순
        etfList.sort((a, b) => {
          if (soulEtfId && a.id === soulEtfId) return -1;
          if (soulEtfId && b.id === soulEtfId) return 1;
          return (b.changePercent || 0) - (a.changePercent || 0);
        });
        setEtfs(etfList);

        // 5. 학생 데이터 로드
        if (studentCode) {
          const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const sDoc = snap.docs[0];
            const sData = sDoc.data();
            const nextScope = getScopeFromStudent(sData);
            const nextSoulEtfId = nextScope.scopeKey ? `teacher_soul_${nextScope.scopeKey}` : null;
            setStudentDocId(sDoc.id);
            setStudent({ id: sDoc.id, ...sData });
            setScope(nextScope);

            // 6. 보유 주식 로드
            const holdSnap = await getDocs(collection(db, 'portfolios', sDoc.id, 'holdings'));
            const holdMap = {};
            holdSnap.docs.forEach(d => { holdMap[d.id] = d.data(); });
            setHoldings(holdMap);

            // 7. 선생님의 영혼 50주 기본 지급 (미보유 시)
            const soulEtf2 = nextSoulEtfId ? etfList.find(e => e.id === nextSoulEtfId) : null;
            if (soulEtf2 && !holdMap[nextSoulEtfId]) {
              const grantData = {
                quantity:     50,
                baseQuantity: 50,
                avgBuyPrice:  soulEtf2.currentPrice || 100,
                etfName:      '선생님의 영혼',
                etfSymbol:    'SOUL',
                grantedAt:    serverTimestamp(),
              };
              await setDoc(doc(db, 'portfolios', sDoc.id, 'holdings', nextSoulEtfId), grantData);
              holdMap[nextSoulEtfId] = { ...grantData };
              setHoldings({ ...holdMap });
            }

            // 8. 누적 배당금 수령 합계 로드
            const divLogSnap = await getDocs(
              query(collection(db, 'dividendLogs'), where('studentId', '==', sDoc.id))
            );
            const scopedDivLogs = divLogSnap.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(log => isInScope(log, nextScope));
            const received = scopedDivLogs.reduce((sum, log) => sum + (log.dividendAmount || 0), 0);
            setDividendsReceived(received);

            // 8. 배당금 자동 지급 체크 (주간)
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
                  classId: nextScope.classId || null,
                  teacherUid: nextScope.teacherUid || null,
                  scopeKey: nextScope.scopeKey || null,
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
        } else {
          setStudentDocId(null);
          setStudent(null);
          setScope({ classId: null, teacherUid: null, scopeKey: null });
          setHoldings({});
        }
      } catch (err) {
        console.error('주식 로딩 에러:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [studentCode, scope.scopeKey]);

  // ── 선생님의 영혼 배당금 수령 ────────────────────────────────
  const receiveSoulDividend = async () => {
    const amount = student?.pendingSoulDividend || 0;
    if (!studentDocId || amount <= 0) return;
    setIsReceivingSoul(true);
    try {
      await updateDoc(doc(db, 'students', studentDocId), {
        gold:                (student.gold || 0) + amount,
        pendingSoulDividend: 0,
      });
      setStudent(prev => ({ ...prev, gold: (prev.gold || 0) + amount, pendingSoulDividend: 0 }));
      showToast(`🎉 배당금 🪙${amount.toLocaleString()} 골드를 수령했습니다!`);
    } catch (err) {
      console.error(err);
      showToast('수령 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsReceivingSoul(false);
    }
  };

  // ── 매수 ────────────────────────────────────────────────────
  const handleBuy = async (etf, quantity) => {
    if (!studentDocId || !student) return;
    const total = etf.currentPrice * quantity;
    if ((student.gold || 0) < total) return showToast('골드가 부족합니다.', 'error');

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
      showToast(`✅ ${etf.name} ${quantity}주 매수 완료! 🪙 -${total.toLocaleString()}`);
    } catch (err) {
      console.error('매수 에러:', err);
      showToast('매수 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  // ── 매도 ────────────────────────────────────────────────────
  const handleSell = async (etf, quantity) => {
    if (!studentDocId || !student) return;
    const holding = holdings[etf.id];
    if (!holding || holding.quantity < quantity) return showToast('보유 수량이 부족합니다.', 'error');

    const revenue  = etf.currentPrice * quantity;
    const profit   = (etf.currentPrice - holding.avgBuyPrice) * quantity;
    const profitSign = profit >= 0 ? '+' : '';

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
      showToast(`✅ ${etf.name} ${quantity}주 매도 완료! 🪙 +${revenue.toLocaleString()}`);
    } catch (err) {
      console.error('매도 에러:', err);
      showToast('매도 중 오류가 발생했습니다.', 'error');
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
      let etf = etfs.find(e => e.id === etfId);
      // teacher_soul이 아직 etfs 목록에 없을 때 폴백 데이터 사용
      if (!etf && soulEtfId && etfId === soulEtfId) {
        etf = {
          id: soulEtfId, symbol: 'SOUL', name: '선생님의 영혼',
          theme: '특별', currentPrice: h.avgBuyPrice || 100,
          changePercent: 0, dividendRate: 0, isTeacherControlled: true,
        };
      }
      if (!etf) return null;
      const currentValue  = etf.currentPrice * h.quantity;
      const cost          = h.avgBuyPrice * h.quantity;
      const pnl           = currentValue - cost;
      const pnlPct        = cost > 0 ? (pnl / cost * 100).toFixed(2) : '0.00';
      const weeklyDiv     = etf.dividendRate > 0
        ? Math.floor(h.quantity * (etf.currentPrice || 0) * etf.dividendRate) : 0;
      return { etf, holding: h, currentValue, cost, pnl, pnlPct, weeklyDiv };
    }).filter(Boolean);

  // 이번 주 예상 총 배당금
  const totalExpectedDiv = portfolioItems.reduce((s, i) => s + (i.weeklyDiv || 0), 0);

  const totalInvested = portfolioItems.reduce((s, i) => s + i.cost, 0);
  const totalValue    = portfolioItems.reduce((s, i) => s + i.currentValue, 0);
  const totalPnl      = totalValue - totalInvested;
  const totalPnlPct   = totalInvested > 0 ? (totalPnl / totalInvested * 100).toFixed(2) : '0.00';

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-64 gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <div className="text-slate-400 font-bold text-sm">실시간 시세 불러오는 중...</div>
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

      {/* 배당금 수령 요약 (보유 ETF 있을 때) */}
      {(dividendsReceived > 0 || totalExpectedDiv > 0) && (
        <div className="bg-amber-950 text-amber-100 px-4 py-2 flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-1.5">
            <span>🏦 지금까지 받은 배당금</span>
            <span className="font-extrabold text-amber-300 text-sm">🪙 {dividendsReceived.toLocaleString()}</span>
          </div>
          {totalExpectedDiv > 0 && (
            <>
              <span className="text-amber-700">|</span>
              <div className="flex items-center gap-1.5">
                <span>💰 이번 주 예상 배당금</span>
                <span className="font-extrabold text-emerald-300 text-sm">🪙 +{totalExpectedDiv.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* 선생님의 영혼 배당금 수령 대기 배너 */}
      {(student?.pendingSoulDividend || 0) > 0 && (
        <div className="bg-gradient-to-r from-violet-600 to-pink-600 text-white px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold opacity-80">👻 선생님의 영혼 배당금이 도착했습니다!</div>
            <div className="text-xl font-black">🪙 +{(student.pendingSoulDividend || 0).toLocaleString()} G</div>
          </div>
          <button
            onClick={receiveSoulDividend}
            disabled={isReceivingSoul}
            className="shrink-0 bg-white text-violet-700 font-extrabold text-sm px-4 py-2.5 rounded-xl hover:bg-white/90 active:scale-95 transition-all disabled:opacity-60">
            {isReceivingSoul ? '처리 중...' : '보상 수령하기 ✓'}
          </button>
        </div>
      )}

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
          {/* 내 포트폴리오 요약 (보유 ETF 있을 때) */}
          {portfolioItems.length > 0 && (
            <div className="bg-slate-800 text-white rounded-2xl px-5 py-4 mb-4 flex flex-wrap items-center gap-x-6 gap-y-1">
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400 mb-0.5">총 평가금액</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-2xl font-black">🪙 {totalValue.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs font-bold">
                  <span className={totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {totalPnl >= 0 ? '+' : ''}{totalPnl.toLocaleString()} ({totalPnlPct}%)
                    {totalPnl >= 0 ? ' 📈' : ' 📉'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  투자 원금: 🪙 {totalInvested.toLocaleString()}
                </div>
              </div>
              {totalExpectedDiv > 0 && (
                <div className="ml-auto text-right">
                  <div className="text-[10px] text-slate-400 mb-0.5">이번 주 예상 배당</div>
                  <div className="text-base font-extrabold text-amber-300">
                    +{totalExpectedDiv.toLocaleString()} G
                  </div>
                </div>
              )}
            </div>
          )}

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
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
              💡 교사 페이지에서 테스트 로그인하면 ETF를 매수할 수 있습니다.
            </div>
          )}

          {/* 요약 헤더 */}
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs text-slate-500 font-medium">{filteredEtfs.length}개 종목</span>
            <div className="flex gap-2 text-[11px] font-bold">
              <span className="text-emerald-600">
                ▲ {filteredEtfs.filter(e => e.changePercent > 0).length}
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-rose-500">
                ▼ {filteredEtfs.filter(e => e.changePercent < 0).length}
              </span>
            </div>
          </div>

          {/* 2분할 세로 리스트 */}
          {filteredEtfs.length === 0 ? (
            <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
              <div className="text-4xl mb-2">📊</div>
              <p className="font-bold">해당 종목이 없습니다</p>
            </div>
          ) : (() => {
            const mid  = Math.ceil(filteredEtfs.length / 2);
            const cols = [filteredEtfs.slice(0, mid), filteredEtfs.slice(mid)];
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {cols.map((col, ci) => col.length > 0 && (
                  <div key={ci} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    {col.map((etf, idx) => (
                      <StockListRow
                        key={etf.id} etf={etf}
                        myGold={student?.gold || 0}
                        myHolding={holdings[etf.id]}
                        onSelect={studentCode ? setSelectedEtf : () => {}}
                        isLast={idx === col.length - 1}
                      />
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}
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

              {/* ── 선생님의 영혼 특별 카드 (항상 최상단) ── */}
              {portfolioItems.filter(i => i.etf.id === soulEtfId).map(({ etf, holding, currentValue, pnl, pnlPct }) => {
                const baseQty  = holding.baseQuantity || 50;
                const extraQty = Math.max(0, holding.quantity - baseQty);
                return (
                  <div key={etf.id} onClick={() => setSelectedEtf(etf)}
                    className="relative rounded-2xl overflow-hidden cursor-pointer hover:shadow-xl transition-all text-white"
                    style={{ background: 'linear-gradient(135deg, #5b21b6, #be185d)' }}>
                    {/* 배경 이미지 */}
                    <div className="absolute inset-0" style={{
                      backgroundImage: 'url(/images/soul-bond-bg.png)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      opacity: 0.55,
                    }} />
                    {/* 그라데이션 오버레이 (텍스트 가독성) */}
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-900/60 to-pink-900/50" />
                    {/* 컨텐츠 */}
                    <div className="relative z-10 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-[10px] font-bold opacity-70 mb-0.5">👻 특별 채권 · SOUL</div>
                        <h3 className="font-extrabold text-xl">{etf.name}</h3>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-black">🪙 {(etf.currentPrice || 0).toLocaleString()}</div>
                        <div className={`text-sm font-bold mt-0.5
                          ${etf.changePercent > 0 ? 'text-green-200' : etf.changePercent < 0 ? 'text-red-200' : 'text-white/60'}`}>
                          {etf.changePercent > 0 ? '+' : ''}{(etf.changePercent || 0).toFixed(2)}%
                          {etf.changePercent > 0 ? ' ▲' : etf.changePercent < 0 ? ' ▼' : ''}
                        </div>
                      </div>
                    </div>

                    {/* 설명 */}
                    <div className="bg-white/15 rounded-xl px-4 py-2.5 mb-3 text-xs leading-relaxed space-y-0.5">
                      <div>📈 매일 오전 8시 전일가 대비 <strong>1%</strong> 자동 상승</div>
                      <div>🔒 기본 <strong>50주</strong>는 절대 매도 불가 (무료 지급)</div>
                      <div>🛒 추가 매수 가능, 최대 <strong>100주</strong>까지 보유 가능</div>
                      <div>💸 50주 이하로는 매도할 수 없습니다</div>
                    </div>

                    {/* 보유 현황 그리드 */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                      <div className="bg-white/15 rounded-xl p-2">
                        <div className="font-extrabold text-base">{holding.quantity}주</div>
                        <div className="opacity-70">보유 수량</div>
                      </div>
                      <div className="bg-white/15 rounded-xl p-2">
                        <div className="font-extrabold text-base">🪙 {currentValue.toLocaleString()}</div>
                        <div className="opacity-70">평가금액</div>
                      </div>
                      <div className="bg-white/15 rounded-xl p-2">
                        <div className={`font-extrabold text-base ${pnl >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                          {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()}
                        </div>
                        <div className="opacity-70">평가손익</div>
                      </div>
                    </div>

                    {/* 하단 태그 */}
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      <span className="bg-white/20 rounded-lg px-2 py-1">기본 {baseQty}주 (매도 불가)</span>
                      {extraQty > 0 && <span className="bg-white/20 rounded-lg px-2 py-1">추가 {extraQty}주 (매도 가능)</span>}
                      <span className="bg-white/20 rounded-lg px-2 py-1 ml-auto">
                        내일 예상 +{Math.floor((etf.currentPrice || 0) * 0.01).toLocaleString()}G/주
                      </span>
                    </div>
                    </div>
                  </div>
                );
              })}

              {/* ── 일반 ETF 목록 ── */}
              {portfolioItems.filter(i => i.etf.id !== soulEtfId).map(({ etf, holding, currentValue, pnl, pnlPct, weeklyDiv }) => (
                <div key={etf.id}
                  onClick={() => setSelectedEtf(etf)}
                  className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 cursor-pointer hover:shadow-md transition-all">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 mr-2">
                      <div className="font-extrabold text-slate-800 text-sm">{etf.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{holding.quantity}주 보유 · 평균 🪙{holding.avgBuyPrice.toLocaleString()}</div>
                      {weeklyDiv > 0 && (
                        <div className="mt-1.5 text-[10px] bg-amber-50 border border-amber-100 text-amber-600 font-bold px-2 py-0.5 rounded-full inline-block">
                          💰 이번 주 예상 배당 +{weeklyDiv.toLocaleString()}G
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-extrabold text-slate-800">🪙 {currentValue.toLocaleString()}</div>
                      <div className={`text-sm font-bold ${pnl >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()} ({pnlPct}%)
                      </div>
                      <div className={`text-xs font-bold mt-0.5 ${etf.changePercent > 0 ? 'text-emerald-500' : etf.changePercent < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        전일대비 {etf.changePercent > 0 ? '+' : ''}{(etf.changePercent || 0).toFixed(2)}%
                        {etf.changePercent > 0 ? ' ▲' : etf.changePercent < 0 ? ' ▼' : ''}
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

export default StockMarket;
