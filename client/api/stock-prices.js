/**
 * Vercel Serverless Function
 * Yahoo Finance에서 ETF 가격을 가져와 반환합니다.
 * CORS 우회용 프록시 역할을 합니다.
 */

const ETF_LIST = [
  {
    id: 'tech',
    symbol: 'QQQ',
    name: '미국 기술주 ETF',
    theme: '기술',
    description: 'Apple, Microsoft, NVIDIA, Google 등 미국 대형 기술주 100개를 담은 ETF. 기술 혁신을 선도하는 기업들에 분산 투자합니다.',
    dividendRate: 0.005,  // 주간 0.5%
    currency: 'gold',
    basePrice: 420,
  },
  {
    id: 'semiconductor',
    symbol: 'SOXX',
    name: '반도체 ETF',
    theme: '반도체',
    description: 'NVIDIA, Broadcom, Qualcomm, Intel 등 미국 주요 반도체 기업들에 투자합니다. AI 붐으로 주목받는 핵심 섹터입니다.',
    dividendRate: 0.003,
    currency: 'gold',
    basePrice: 230,
  },
  {
    id: 'healthcare',
    symbol: 'XLV',
    name: '헬스케어 ETF',
    theme: '헬스케어',
    description: 'UnitedHealth, Johnson & Johnson, Pfizer 등 의료·제약 기업에 투자합니다. 고령화 사회에서 꾸준히 성장하는 방어적 섹터입니다.',
    dividendRate: 0.008,
    currency: 'gold',
    basePrice: 148,
  },
  {
    id: 'battery',
    symbol: 'LIT',
    name: '2차전지·리튬 ETF',
    theme: '2차전지',
    description: '전기차 배터리 핵심 소재인 리튬 관련 기업과 배터리 제조사에 투자합니다. 전기차 시대의 핵심 자원을 담당합니다.',
    dividendRate: 0.003,
    currency: 'gold',
    basePrice: 42,
  },
  {
    id: 'energy',
    symbol: 'XLE',
    name: '에너지 ETF',
    theme: '에너지',
    description: 'ExxonMobil, Chevron 등 석유·천연가스 대기업에 투자합니다. 에너지 가격에 따라 수익이 크게 달라지는 섹터입니다.',
    dividendRate: 0.010,
    currency: 'gold',
    basePrice: 95,
  },
  {
    id: 'consumer',
    symbol: 'XLY',
    name: '소비재 ETF',
    theme: '소비재',
    description: 'Amazon, Tesla, Nike, McDonald\'s 등 소비자들이 즐겨 쓰는 브랜드 기업에 투자합니다. 경기 회복기에 강세를 보입니다.',
    dividendRate: 0.005,
    currency: 'gold',
    basePrice: 196,
  },
  {
    id: 'reits',
    symbol: 'VNQ',
    name: '부동산 리츠 ETF',
    theme: '부동산',
    description: '미국 부동산 투자신탁(REITs) 기업들에 투자합니다. 임대 수익을 배당으로 분배해 꾸준한 수입을 기대할 수 있습니다.',
    dividendRate: 0.015,  // 주간 1.5% (배당주)
    currency: 'gold',
    basePrice: 87,
  },
  {
    id: 'gold',
    symbol: 'GLD',
    name: '금(Gold) ETF',
    theme: '원자재',
    description: '실물 금 가격을 추종하는 ETF입니다. 경제 불확실성이 커질 때 안전자산으로 주목받습니다.',
    dividendRate: 0,  // 금은 배당 없음
    currency: 'gold',
    basePrice: 220,
  },
  {
    id: 'bank',
    symbol: 'KBE',
    name: '미국 은행주 ETF',
    theme: '배당·금융',
    description: 'JPMorgan, Bank of America, Wells Fargo 등 미국 주요 은행에 투자합니다. 금리 상승기에 수익성이 높아지며 안정적인 배당을 제공합니다.',
    dividendRate: 0.012,  // 주간 1.2% (배당주)
    currency: 'gold',
    basePrice: 52,
  },
];

// 등락률을 베이스 가격에 적용해 게임 골드 가격 계산
function calcGamePrice(basePrice, changePercent) {
  return Math.max(1, Math.round(basePrice * (1 + changePercent / 100)));
}

export default async function handler(req, res) {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const symbols = ETF_LIST.map(e => e.symbol).join(',');

    const response = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketPreviousClose,regularMarketTime`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) throw new Error(`Yahoo Finance 응답 오류: ${response.status}`);

    const json = await response.json();
    const quotes = json?.quoteResponse?.result ?? [];

    const now = new Date().toISOString();
    const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

    const prices = ETF_LIST.map(etf => {
      const quote = quotes.find(q => q.symbol === etf.symbol);

      if (!quote) {
        // Yahoo Finance에서 데이터 못 받으면 기본값 반환
        return {
          ...etf,
          currentPrice:  etf.basePrice,
          prevPrice:     etf.basePrice,
          changePercent: 0,
          realPrice:     null,
          marketClosed:  true,
          updatedAt:     now,
          updatedDate:   today,
        };
      }

      const changePercent = parseFloat((quote.regularMarketChangePercent || 0).toFixed(2));
      const gamePrice     = calcGamePrice(etf.basePrice, changePercent);
      const prevGamePrice = Math.round(etf.basePrice); // 전날 베이스 가격

      return {
        ...etf,
        currentPrice:  gamePrice,
        prevPrice:     prevGamePrice,
        changePercent,
        realPrice:     parseFloat((quote.regularMarketPrice || etf.basePrice).toFixed(2)),
        marketClosed:  false,
        updatedAt:     now,
        updatedDate:   today,
      };
    });

    return res.status(200).json({ success: true, prices, updatedAt: now });

  } catch (error) {
    console.error('주가 API 에러:', error);

    // 에러 시 ETF 목록만 반환 (가격 변동 없음)
    const fallback = ETF_LIST.map(etf => ({
      ...etf,
      currentPrice:  etf.basePrice,
      prevPrice:     etf.basePrice,
      changePercent: 0,
      marketClosed:  true,
      updatedAt:     new Date().toISOString(),
    }));

    return res.status(200).json({ success: false, prices: fallback, error: error.message });
  }
}
