/**
 * 교과서 PDF → 텍스트 추출 API
 * Claude의 PDF 문서 처리 기능 활용
 */
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않는 메서드' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API 키 없음' });

  const { pdfBase64, imageBase64, mediaType, lessonTitle } = req.body || {};
  if (!pdfBase64 && !imageBase64) return res.status(400).json({ error: '파일 데이터가 없습니다' });

  const prompt = `이 교과서 자료에서${lessonTitle ? ` "${lessonTitle}" 차시` : ''} 관련 학습 내용을 추출해주세요.

추출 규칙:
- 수학 개념 설명, 공식, 예제 문제, 풀이 과정을 포함해주세요
- 그림/표 설명은 텍스트로 변환해주세요
- 학습 목표, 핵심 개념, 예시를 모두 포함해주세요
- 불필요한 페이지 번호, 저작권 표시 등은 제외
- 순수 텍스트로만 반환 (JSON 아님)`;

  const contentBlock = pdfBase64
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } }, { type: 'text', text: prompt }]
    : [{ type: 'image',    source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } }, { type: 'text', text: prompt }];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: contentBlock }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || '추출 실패' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return res.status(200).json({ text, chars: text.length });

  } catch (e) {
    console.error('extract-lesson-text 오류:', e);
    return res.status(500).json({ error: e.message || '서버 오류' });
  }
}
