import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';

export const MARKET_MODE_META = {
  safe: {
    label: '안정형',
    multiplier: 0.75,
    description: '변동폭을 낮춰 손실 위험을 줄입니다. 처음 투자하는 학급에 적합합니다.',
  },
  balanced: {
    label: '균형형',
    multiplier: 1,
    description: '상승과 하락의 균형을 맞춘 기본 모드입니다. 일반적인 학급 운영에 적합합니다.',
  },
  aggressive: {
    label: '공격형',
    multiplier: 1.35,
    description: '변동폭이 커서 수익과 손실이 모두 큽니다. 투자 게임성을 강하게 느낄 수 있습니다.',
  },
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
    '관련 산업 기대감이 커지며 매수세가 들어왔습니다.',
    '좋은 뉴스가 나오며 학생 투자자들의 관심이 높아졌습니다.',
    '시장 분위기가 좋아지며 가격이 상승했습니다.',
  ],
  down: [
    '차익 실현 매물이 나오며 가격이 조정되었습니다.',
    '시장 변동성이 커지며 가격이 하락했습니다.',
    '단기 불안 심리로 매도세가 늘었습니다.',
  ],
};

export const isTeacherSoulId = (etfId) => etfId === 'teacher_soul' || etfId?.startsWith('teacher_soul_');

export const getKstNow = () => {
  const now = new Date();
  return new Date(now.getTime() + ((9 * 60) + now.getTimezoneOffset()) * 60000);
};

export const getKstDateKey = (date = getKstNow()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const isAfterMarketOpenTime = () => getKstNow().getHours() >= 8;

export const getScopedEtfDocId = (scopeKey, etfId) =>
  `${String(scopeKey || '').replace(/[^\w-]/g, '_')}__${etfId}`;

const hashSeed = (input) => {
  let h = 2166136261;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
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

const normalizeScopedEtf = (docSnap) => {
  const data = docSnap.data();
  return {
    ...data,
    id: data.baseId || data.id || docSnap.id,
    docId: docSnap.id,
  };
};

const normalizeGlobalEtf = (docSnap) => {
  const data = docSnap.data();
  return {
    ...data,
    id: data.id || docSnap.id,
    baseId: data.id || docSnap.id,
  };
};

export async function loadClassEtfs(db, { scopeKey, soulEtfId }) {
  if (!scopeKey) return [];

  const [scopedSnap, globalSnap, soulSnap] = await Promise.all([
    getDocs(query(collection(db, 'classEtfs'), where('scopeKey', '==', scopeKey))),
    getDocs(collection(db, 'etfs')),
    soulEtfId ? getDoc(doc(db, 'etfs', soulEtfId)) : Promise.resolve(null),
  ]);

  const scopedEtfs = scopedSnap.docs
    .map(normalizeScopedEtf)
    .filter((etf) => !isTeacherSoulId(etf.id));

  const globalEtfs = globalSnap.docs
    .map(normalizeGlobalEtf)
    .filter((etf) => !isTeacherSoulId(etf.id));

  const soulEtf = soulSnap?.exists?.() ? { id: soulEtfId, ...soulSnap.data() } : null;
  const regularEtfs = scopedEtfs.length > 0 ? scopedEtfs : globalEtfs;

  return [...regularEtfs, ...(soulEtf ? [soulEtf] : [])]
    .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
}

export async function seedClassEtfsFromApi(db, { scopeKey, classId, teacherUid, soulEtf }) {
  if (!scopeKey) return [];

  const res = await fetch('/api/stock-prices');
  const data = await res.json();
  if (!data.prices?.length) return [];

  const nowIso = new Date().toISOString();
  const today = getKstDateKey();
  const batch = writeBatch(db);
  const rows = data.prices.map((price) => ({
    ...price,
    id: price.id,
    baseId: price.id,
    scopeKey,
    classId: classId || null,
    teacherUid: teacherUid || null,
    updatedAt: price.updatedAt || nowIso,
    updatedDate: today,
    updatedDateKey: today,
  }));

  rows.forEach((row) => {
    batch.set(doc(db, 'classEtfs', getScopedEtfDocId(scopeKey, row.id)), row, { merge: true });
  });

  await batch.commit();
  return [...rows, ...(soulEtf ? [soulEtf] : [])];
}

export async function openDailyMarket(db, {
  classId,
  teacherUid,
  scopeKey,
  etfs,
  mode = 'balanced',
  lastOpenDate = '',
  force = false,
}) {
  if (!classId || !scopeKey) return { opened: false, reason: 'missing-class' };
  if (!force && !isAfterMarketOpenTime()) return { opened: false, reason: 'before-8' };

  const today = getKstDateKey();
  if (!force && lastOpenDate === today) return { opened: false, reason: 'already-opened' };

  const modeMeta = MARKET_MODE_META[mode] || MARKET_MODE_META.balanced;
  const marketTargets = (etfs || []).filter((etf) => !isTeacherSoulId(etf.id) && etf.active !== false);
  if (marketTargets.length === 0) return { opened: false, reason: 'no-etfs' };

  const nowIso = new Date().toISOString();
  const updatedRows = marketTargets.map((etf, idx) => {
    const prevPrice = Math.max(1, Math.round(etf.currentPrice || etf.basePrice || 100));
    const band = resolveBand(etf.id);
    const seedKey = `${scopeKey}:${today}:${etf.id}:${idx}`;
    const rawRate = band.min + (band.max - band.min) * seededRandom(seedKey);
    const rate = Math.max(-0.18, Math.min(0.2, rawRate * modeMeta.multiplier));
    const nextPrice = Math.max(1, Math.round(prevPrice * (1 + rate)));
    const changePercent = parseFloat((((nextPrice - prevPrice) / prevPrice) * 100).toFixed(2));
    const newsPool = changePercent >= 0 ? MARKET_NEWS.up : MARKET_NEWS.down;
    const marketComment = newsPool[Math.floor(seededRandom(`${seedKey}:news`) * newsPool.length)] || '';

    return {
      ...etf,
      id: etf.id,
      baseId: etf.baseId || etf.id,
      scopeKey,
      classId: classId || null,
      teacherUid: teacherUid || null,
      prevPrice,
      currentPrice: nextPrice,
      changePercent,
      updatedAt: nowIso,
      updatedDate: today,
      updatedDateKey: today,
      marketComment,
    };
  });

  const sortedByAbs = [...updatedRows].sort((a, b) => Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0));
  const topMover = sortedByAbs[0];
  const upCount = updatedRows.filter((row) => (row.changePercent || 0) > 0).length;
  const downCount = updatedRows.filter((row) => (row.changePercent || 0) < 0).length;
  const flatCount = updatedRows.length - upCount - downCount;
  const headline = `오늘 시장 자동 오픈: 상승 ${upCount} / 하락 ${downCount} / 보합 ${flatCount}`;

  const batch = writeBatch(db);
  updatedRows.forEach((row) => {
    batch.set(doc(db, 'classEtfs', getScopedEtfDocId(scopeKey, row.id)), row, { merge: true });
  });
  batch.set(doc(db, 'classes', classId), {
    stockMarket: {
      mode,
      lastOpenDate: today,
      lastOpenAt: nowIso,
      headline,
      topMoverId: topMover?.id || '',
      topMoverName: topMover?.name || '',
      topMoverChange: topMover?.changePercent || 0,
    },
  }, { merge: true });

  await batch.commit();
  return {
    opened: true,
    today,
    lastOpenAt: nowIso,
    headline,
    updatedRows,
    marketInfo: {
      mode,
      lastOpenDate: today,
      lastOpenAt: nowIso,
      headline,
      topMoverId: topMover?.id || '',
      topMoverName: topMover?.name || '',
      topMoverChange: topMover?.changePercent || 0,
    },
  };
}

export const mergeUpdatedEtfs = (etfs, updatedRows) => {
  const updatedMap = new Map((updatedRows || []).map((row) => [row.id, row]));
  return (etfs || []).map((etf) => updatedMap.get(etf.id) || etf);
};
