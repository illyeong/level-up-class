/**
 * Vercel Serverless Function
 * Yahoo Finance에서 ETF 가격을 가져와 반환합니다.
 */

const ETF_LIST = [
  {
    id: 'tech', symbol: 'QQQ', name: '미국 기술주 ETF', theme: '기술',
    topHoldings: 'Apple · NVIDIA · Microsoft · Meta · Google',
    description: 'Apple, Microsoft, NVIDIA, Google 등 미국 대형 기술주 100개를 담은 ETF.',
    dividendRate: 0.005, currency: 'gold', basePrice: 420,
  },
  {
    id: 'semiconductor', symbol: 'SOXX', name: '반도체 ETF', theme: '반도체',
    topHoldings: 'Broadcom · NVIDIA · Qualcomm · Intel · AMD',
    description: 'NVIDIA, Broadcom, Qualcomm 등 미국 주요 반도체 기업들에 투자합니다.',
    dividendRate: 0.003, currency: 'gold', basePrice: 230,
  },
  {
    id: 'healthcare', symbol: 'XLV', name: '헬스케어 ETF', theme: '헬스케어',
    topHoldings: 'UnitedHealth · J&J · Pfizer · AbbVie · Merck',
    description: 'UnitedHealth, J&J, Pfizer 등 의료·제약 기업에 투자합니다.',
    dividendRate: 0.008, currency: 'gold', basePrice: 148,
  },
  {
    id: 'battery', symbol: 'LIT', name: '2차전지·리튬 ETF', theme: '2차전지',
    topHoldings: 'Albemarle · SQM · CATL · Pilbara Minerals',
    description: '전기차 배터리 핵심 소재인 리튬 관련 기업과 배터리 제조사에 투자합니다.',
    dividendRate: 0.003, currency: 'gold', basePrice: 42,
  },
  {
    id: 'energy', symbol: 'XLE', name: '에너지 ETF', theme: '에너지',
    topHoldings: 'ExxonMobil · Chevron · ConocoPhillips · EOG',
    description: 'ExxonMobil, Chevron 등 석유·천연가스 대기업에 투자합니다.',
    dividendRate: 0.010, currency: 'gold', basePrice: 95,
  },
  {
    id: 'consumer', symbol: 'XLY', name: '소비재 ETF', theme: '소비재',
    topHoldings: "Amazon · Tesla · Nike · McDonald's · Home Depot",
    description: "Amazon, Tesla, Nike, McDonald's 등 소비자 브랜드 기업에 투자합니다.",
    dividendRate: 0.005, currency: 'gold', basePrice: 196,
  },
  {
    id: 'reits', symbol: 'VNQ', name: '부동산 리츠 ETF', theme: '부동산',
    topHoldings: 'Prologis · American Tower · Equinix · Crown Castle',
    description: '미국 부동산 투자신탁(REITs) 기업들에 투자합니다. 임대 수익을 배당으로 분배합니다.',
    dividendRate: 0.015, currency: 'gold', basePrice: 87,
  },
  {
    id: 'gold', symbol: 'GLD', name: '금(Gold) ETF', theme: '원자재',
    topHoldings: '금 현물 직접 보유 · 달러 가치 역상관',
    description: '실물 금 가격을 추종하는 ETF입니다. 경제 불확실성이 커질 때 안전자산으로 주목받습니다.',
    dividendRate: 0, currency: 'gold', basePrice: 220,
  },
  {
    id: 'bank', symbol: 'KBE', name: '미국 은행주 ETF', theme: '배당·금융',
    topHoldings: 'JPMorgan · Bank of America · Wells Fargo · Citigroup',
    description: 'JPMorgan, BofA, Wells Fargo 등 미국 주요 은행에 투자합니다.',
    dividendRate: 0.012, currency: 'gold', basePrice: 52,
  },
  {
    id: 'bitcoin', symbol: 'IBIT', name: '비트코인 ETF', theme: '암호화폐',
    topHoldings: '비트코인(BTC) 현물 100% 보유',
    description: 'BlackRock이 운용하는 비트코인 현물 ETF입니다. 높은 변동성과 강력한 상승 잠재력을 가집니다.',
    dividendRate: 0, currency: 'gold', basePrice: 55,
  },
  // ─── 한국 ETF ────────────────────────────────────────────────
  {
    id: 'k_semiconductor', symbol: '091160.KS', name: 'KODEX 반도체', theme: '한국주식',
    topHoldings: '삼성전자 · SK하이닉스 · DB하이텍 · 리노공업',
    description: '삼성전자, SK하이닉스 등 국내 반도체 대표 기업들에 투자합니다.',
    dividendRate: 0.004, currency: 'gold', basePrice: 45,
  },
  {
    id: 'k_battery', symbol: '305720.KS', name: 'KODEX 2차전지', theme: '한국주식',
    topHoldings: 'LG에너지솔루션 · 삼성SDI · SK이노베이션 · 포스코홀딩스',
    description: 'LG에너지솔루션, 삼성SDI 등 전기차 배터리 핵심 기업에 투자합니다.',
    dividendRate: 0.003, currency: 'gold', basePrice: 14,
  },
  {
    id: 'k_healthcare', symbol: '266420.KS', name: 'KODEX 헬스케어', theme: '한국주식',
    topHoldings: '셀트리온 · 삼성바이오로직스 · 한미약품 · 유한양행',
    description: '셀트리온, 삼성바이오로직스 등 바이오·제약 선도 기업에 투자합니다.',
    dividendRate: 0.005, currency: 'gold', basePrice: 18,
  },
  {
    id: 'k_kospi200', symbol: '069500.KS', name: 'KODEX 200', theme: '한국주식',
    topHoldings: '삼성전자 · SK하이닉스 · LG에너지 · 현대차 외 196개',
    description: '코스피 대형주 상위 200개 기업에 분산 투자합니다. 한국 경제를 대표합니다.',
    dividendRate: 0.006, currency: 'gold', basePrice: 32,
  },
  {
    id: 'samsung', symbol: '005930.KS', name: '삼성전자', theme: '한국주식',
    topHoldings: 'HBM 메모리 · 갤럭시 스마트폰 · 파운드리 · 가전',
    description: '반도체, 스마트폰, 가전을 아우르는 글로벌 IT 대기업입니다.',
    dividendRate: 0.007, currency: 'gold', basePrice: 75,
  },
];

// 등락률을 베이스 가격에 적용해 게임 골드 가격 계산
function calcGamePrice(basePrice, changePercent) {
  return Math.max(1, Math.round(basePrice * (1 + changePercent / 100)));
}

export default async function handler(req, res) {
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

    const json   = await response.json();
    const quotes = json?.quoteResponse?.result ?? [];
    const now    = new Date().toISOString();
    const today  = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

    const prices = ETF_LIST.map(etf => {
      const quote = quotes.find(q => q.symbol === etf.symbol);
      if (!quote) {
        return {
          ...etf,
          currentPrice: etf.basePrice, prevPrice: etf.basePrice,
          changePercent: 0, realPrice: null,
          marketClosed: true, updatedAt: now, updatedDate: today,
        };
      }
      const changePercent = parseFloat((quote.regularMarketChangePercent || 0).toFixed(2));
      const gamePrice     = calcGamePrice(etf.basePrice, changePercent);
      return {
        ...etf,
        currentPrice:  gamePrice,
        prevPrice:     Math.round(etf.basePrice),
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
    const fallback = ETF_LIST.map(etf => ({
      ...etf,
      currentPrice: etf.basePrice, prevPrice: etf.basePrice,
      changePercent: 0, marketClosed: true,
      updatedAt: new Date().toISOString(),
    }));
    return res.status(200).json({ success: false, prices: fallback, error: error.message });
  }
}
