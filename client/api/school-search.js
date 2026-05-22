/**
 * Vercel Serverless Function
 * NEIS(교육부) 학교 정보 API 프록시
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q || q.length < 2) return res.status(200).json({ schools: [] });

  try {
    const key = process.env.NEIS_API_KEY || '';
    const keyParam = key ? `&KEY=${key}` : '';
    const url = `https://open.neis.go.kr/hub/schoolInfo?Type=json&pSize=15&SCHUL_NM=${encodeURIComponent(q)}${keyParam}`;

    const r    = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await r.json();

    const rows = data?.schoolInfo?.[1]?.row ?? [];
    const schools = rows.map(s => ({
      name:     s.SCHUL_NM,
      type:     s.SCHUL_KND_SC_NM,   // 초등학교 / 중학교 / 고등학교
      location: s.LCTN_SC_NM,         // 시도 이름
      address:  s.ORG_RDNMA,
    }));

    return res.status(200).json({ schools });
  } catch (err) {
    console.error('학교 검색 에러:', err);
    return res.status(200).json({ schools: [] });
  }
}
