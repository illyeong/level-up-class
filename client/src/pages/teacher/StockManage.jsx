import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, getDoc, doc, writeBatch,
  updateDoc, serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  loadClassEtfs,
  seedClassEtfsFromApi,
  openDailyMarket,
  mergeUpdatedEtfs,
} from '../../utils/stockMarketEngine';

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

const isTeacherSoulId = (etfId) => etfId === 'teacher_soul' || etfId?.startsWith('teacher_soul_');

const MARKET_MODE_META = {
  safe: { label: '안정형', multiplier: 0.75 },
  balanced: { label: '균형형', multiplier: 1.0 },
  aggressive: { label: '공격형', multiplier: 1.35 },
};

const ETF_BUCKET = {
  stable: new Set(['bank', 'gold', 'reits', 'k_kospi200']),
  growth: new Set(['tech', 'consumer', 'healthcare', 'energy', 'samsung']),
  highRisk: new Set(['bitcoin', 'semiconductor', 'battery', 'k_semiconductor', 'k_battery']),
};

const MARKET_BAND = {
  stable: { min: -0.024, max: 0.032 },
  growth: { min: -0.05, max: 0.065 },
  highRisk: { min: -0.095, max: 0.125 },
};

const MARKET_NEWS = {
  up: [
    '위험자산 선호 심리가 강해졌습니다.',
    '성장 섹터 중심으로 매수세가 유입됐습니다.',
    '기관 수급이 강하게 들어왔습니다.',
  ],
  down: [
    '차익 실현 매물이 나오며 조정이 발생했습니다.',
    '변동성 확대 구간으로 방어적 매매가 늘었습니다.',
    '단기 리스크 회피 심리가 확대됐습니다.',
  ],
};

const hashSeed = (input) => {
  let h = 2166136261;
  const text = String(input || '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const seededRandom = (seedStr) => {
  const seed = hashSeed(seedStr);
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const resolveBand = (etfId) => {
  if (ETF_BUCKET.highRisk.has(etfId)) return MARKET_BAND.highRisk;
  if (ETF_BUCKET.growth.has(etfId)) return MARKET_BAND.growth;
  return MARKET_BAND.stable;
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
function StockManage({ selectedClass }) {
  const [etfs, setEtfs]             = useState([]);
  const [students, setStudents]     = useState([]);
  const [portfolioMap, setPortfolioMap] = useState({});
  const [dividendLogs, setDividendLogs] = useState([]);
  const [tab, setTab]               = useState('etfs');
  const [isLoading, setIsLoading]   = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarketOpening, setIsMarketOpening] = useState(false);
  const [isPaying, setIsPaying]     = useState(false);
  const [editingEtf, setEditingEtf] = useState(null);
  const [marketMode, setMarketMode] = useState('balanced');
  const [marketHeadline, setMarketHeadline] = useState('');
  const [marketLastOpenDate, setMarketLastOpenDate] = useState('');
  const [marketLastOpenAt, setMarketLastOpenAt] = useState('');
  const [toast, setToast]           = useState(null);
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
      setEtfs([]);
      setStudents([]);
      setDividendLogs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [etfsSnap, studentsSnap, logSnap, classSnap, marketSnap] = await Promise.all([
        loadClassEtfs(db, { scopeKey, soulEtfId: null }),
        getDocs(query(collection(db, 'students'), where(studentScopeField, '==', studentScopeValue))),
        getDocs(query(collection(db, 'dividendLogs'), where('scopeKey', '==', scopeKey))),
        classId ? getDoc(doc(db, 'classes', classId)) : Promise.resolve(null),
        getDoc(doc(db, 'stockMarkets', scopeKey)),
      ]);

      let etfList = etfsSnap;
      if (etfList.filter(e => !isTeacherSoulId(e.id)).length === 0) {
        etfList = await seedClassEtfsFromApi(db, { scopeKey, classId, teacherUid });
      }

      const sList = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.studentCode || '').localeCompare(b.studentCode || ''));
      setStudents(sList);

      setDividendLogs(logSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.paidAt?.seconds || 0) - (a.paidAt?.seconds || 0)));

      let market = classSnap?.exists?.()
        ? (classSnap.data().stockMarket || {})
        : (marketSnap?.exists?.() ? (marketSnap.data() || {}) : {});
      const autoOpen = await openDailyMarket(db, {
        classId,
        teacherUid,
        scopeKey,
        etfs: etfList,
        mode: market.mode || 'balanced',
        lastOpenDate: market.lastOpenDate || '',
      });
      if (autoOpen.opened) {
        etfList = mergeUpdatedEtfs(etfList, autoOpen.updatedRows);
        market = autoOpen.marketInfo;
      }
      setEtfs(etfList.filter(e => !isTeacherSoulId(e.id)).sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0)));
      setMarketMode(market.mode || 'balanced');
      setMarketHeadline(market.headline || '');
      setMarketLastOpenDate(market.lastOpenDate || '');
      setMarketLastOpenAt(market.lastOpenAt || '');
    } catch (err) {
      console.error('주식 관리 로딩 에러:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [scopeKey, studentScopeField, studentScopeValue]);

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
    if (!scopeKey) return;
    setIsRefreshing(true);
    try {
      const rows = await seedClassEtfsFromApi(db, { scopeKey, classId, teacherUid });
      const data = { prices: rows };
      if (rows.length > 0) {
        setEtfs(rows.filter(e => !isTeacherSoulId(e.id)).sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0)));
        showToast(`${data.prices.length}개 ETF 가격 업데이트 완료! (미국 전일 종가 기준)`);
      }
    } catch (err) {
      console.error(err);
      showToast('가격 업데이트 실패. 인터넷 연결을 확인해주세요.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const runDailyMarketOpen = async ({ force = false } = {}) => {
    if (!classId || !scopeKey) return;
    const today = getKstDateKey();
    if (!force && marketLastOpenDate === today) {
      showToast('오늘 시장 오픈이 이미 반영되었습니다. 강제 오픈으로 다시 계산할 수 있습니다.', 'error');
      return;
    }

    const modeMeta = MARKET_MODE_META[marketMode] || MARKET_MODE_META.balanced;
    const marketTargets = etfs.filter(e => !isTeacherSoulId(e.id) && e.active !== false);
    if (marketTargets.length === 0) {
      showToast('시장 오픈 대상 ETF가 없습니다.', 'error');
      return;
    }

    setIsMarketOpening(true);
    try {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();
      const updatedRows = marketTargets.map((etf, idx) => {
        const prevPrice = Math.max(1, Math.round(etf.currentPrice || etf.basePrice || 100));
        const band = resolveBand(etf.id);
        const seedKey = `${scopeKey}:${today}:${etf.id}:${idx}`;
        const r = seededRandom(seedKey);
        const rawRate = band.min + (band.max - band.min) * r;
        const rate = Math.max(-0.18, Math.min(0.2, rawRate * modeMeta.multiplier));
        const nextPrice = Math.max(1, Math.round(prevPrice * (1 + rate)));
        const changePercent = parseFloat((((nextPrice - prevPrice) / prevPrice) * 100).toFixed(2));
        const newsPool = changePercent >= 0 ? MARKET_NEWS.up : MARKET_NEWS.down;
        const news = newsPool[Math.floor(seededRandom(`${seedKey}:news`) * newsPool.length)] || '';
        return {
          ...etf,
          prevPrice,
          currentPrice: nextPrice,
          changePercent,
          updatedAt: nowIso,
          updatedDate: today,
          updatedDateKey: today,
          marketComment: news,
        };
      });

      const updatedMap = new Map(updatedRows.map(row => [row.id, row]));
      updatedRows.forEach(row => {
        batch.set(doc(db, 'etfs', row.id), {
          prevPrice: row.prevPrice,
          currentPrice: row.currentPrice,
          changePercent: row.changePercent,
          updatedAt: row.updatedAt,
          updatedDate: row.updatedDate,
          updatedDateKey: row.updatedDateKey,
          marketComment: row.marketComment,
        }, { merge: true });
      });

      const sortedByAbs = [...updatedRows].sort((a, b) => Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0));
      const topMover = sortedByAbs[0];
      const upCount = updatedRows.filter(row => (row.changePercent || 0) > 0).length;
      const downCount = updatedRows.filter(row => (row.changePercent || 0) < 0).length;
      const flatCount = updatedRows.length - upCount - downCount;
      const headline = `오늘 시장 오픈 완료: 상승 ${upCount} / 하락 ${downCount} / 보합 ${flatCount}`;

      batch.set(doc(db, 'classes', classId), {
        stockMarket: {
          mode: marketMode,
          lastOpenDate: today,
          lastOpenAt: nowIso,
          headline,
          topMoverId: topMover?.id || '',
          topMoverName: topMover?.name || '',
          topMoverChange: topMover?.changePercent || 0,
        },
      }, { merge: true });

      await batch.commit();
      setEtfs(prev => prev.map(etf => updatedMap.get(etf.id) || etf));
      setMarketHeadline(headline);
      setMarketLastOpenDate(today);
      setMarketLastOpenAt(nowIso);
      showToast('오늘 시장 변동이 반영되었습니다.');
    } catch (err) {
      console.error('market open error:', err);
      showToast('시장 오픈 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsMarketOpening(false);
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
  const payDividends = () => {
    const thisMonday = getMostRecentMonday();
    showConfirm(
      `이번 주(${thisMonday}) 배당금을 모든 학생에게 지급하시겠습니까?\n배당 ETF 보유 학생에게만 지급됩니다.`,
      async () => {
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
          if (isTeacherSoulId(etfId)) continue;
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
            classId,
            teacherUid,
            scopeKey,
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
      showToast(`배당 지급 완료! ${studentsCount}명 · 🪙${totalGoldPaid.toLocaleString()} 골드`);
      fetchAll();
    } catch (err) {
      console.error('배당 지급 에러:', err);
      showToast('배당 지급 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsPaying(false);
    }
      }
    );
  };

  // ── 파생 데이터 ──────────────────────────────────────────────
  const managedDividendLogs = dividendLogs.filter(log => !isTeacherSoulId(log.etfId));
  const totalDivPaid = managedDividendLogs.reduce((s, l) => s + (l.dividendAmount || 0), 0);
  const lastDivDate  = managedDividendLogs[0]?.weekOf || '-';
  const getManagedHoldingEntries = (holdings = {}) =>
    Object.entries(holdings).filter(([etfId]) => !isTeacherSoulId(etfId) && etfs.some(e => e.id === etfId));
  const portfolioStudents = students.filter(s => getManagedHoldingEntries(portfolioMap[s.id]).length > 0);

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
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">📈 주식·ETF 거래소 관리</h1>
            <p className="text-slate-500 text-sm mt-0.5">ETF 가격 업데이트 및 배당금을 관리합니다.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={payDividends} disabled={isPaying}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50 shadow-sm">
              {isPaying ? '지급 중...' : '💰 배당금 지급하기'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 mb-6">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-lg font-extrabold text-slate-800">시장 운영센터</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                실제 주식 가격을 그대로 반영하는 기능이 아니라, 학급별로 운영되는 교실용 가상 ETF 시장입니다.
                매일 오전 8시 이후 첫 접속 시 자동으로 시장이 열리고, ETF 성향과 운영 모드에 따라 가격이 상승하거나 하락합니다.
                같은 학급의 학생들은 동일한 가격을 보며, 다른 학급 시장과는 분리되어 운영됩니다.
              </p>
              <div className="text-xs text-slate-500">
                마지막 오픈: {marketLastOpenDate || '-'} {marketLastOpenAt ? `(${new Date(marketLastOpenAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})` : ''}
              </div>
              {marketHeadline && (
                <div className="inline-flex items-center rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                  {marketHeadline}
                </div>
              )}
            </div>

            <div className="xl:min-w-[320px] space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(MARKET_MODE_META).map(([key, meta]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMarketMode(key)}
                    className={`px-3 py-2 rounded-xl text-xs font-extrabold border transition-colors ${
                      marketMode === key
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                    }`}
                  >
                    {meta.label}
                  </button>
                ))}
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs leading-relaxed text-slate-600">
                <div><b>안정형</b>: 변동폭을 낮춰 손실 위험을 줄입니다.</div>
                <div><b>균형형</b>: 상승과 하락의 균형을 맞춘 기본 모드입니다.</div>
                <div><b>공격형</b>: 변동폭이 커서 수익과 손실이 모두 큽니다.</div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                매일 오전 8시 이후 첫 접속자가 자동으로 시장을 오픈합니다.
              </div>
            </div>
          </div>
        </div>

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
            ['logs',      `배당 내역 (${managedDividendLogs.length})`],
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
            <div className="flex items-center justify-center gap-2.5 py-16">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm text-slate-400 font-medium">불러오는 중...</span>
            </div>
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
                  <p className="text-sm mt-1">잠시 후 다시 접속하면 학급 ETF 시장 데이터가 자동으로 준비됩니다.</p>
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
            {portfolioStudents.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <div className="text-4xl mb-2">💼</div>
                <p className="font-bold">포트폴리오 보유 학생이 없습니다</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {portfolioStudents.map(student => {
                  const holdings = portfolioMap[student.id] || {};
                  const managedHoldings = getManagedHoldingEntries(holdings);
                  const totalValue = managedHoldings.reduce((sum, [etfId, h]) => {
                    const etf = etfs.find(e => e.id === etfId);
                    return sum + (etf ? (etf.currentPrice || 0) * h.quantity : 0);
                  }, 0);
                  const totalCost = managedHoldings.reduce((sum, [, h]) => sum + h.avgBuyPrice * h.quantity, 0);
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
                        {managedHoldings.map(([etfId, h]) => {
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
              <span className="text-xs text-slate-400">{managedDividendLogs.length}건 · 누적 🪙{totalDivPaid.toLocaleString()}</span>
            </div>
            {managedDividendLogs.length === 0 ? (
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
                    {managedDividendLogs.map(log => (
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

export default StockManage;
