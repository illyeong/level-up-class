/* global process */

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '15mb' } },
};

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_QUESTION_TYPES = new Set(['single', 'multiple', 'text', 'rating']);

const cleanQuestions = (questions) => (Array.isArray(questions) ? questions : [])
  .slice(0, 40)
  .map((question, index) => {
    const type = ALLOWED_QUESTION_TYPES.has(question?.type) ? question.type : 'single';
    const cleaned = {
      id: `q_${index + 1}`,
      type,
      text: String(question?.text || question?.question || '').trim().slice(0, 300),
      required: question?.required !== false,
    };
    if (type === 'single' || type === 'multiple') {
      cleaned.options = (Array.isArray(question?.options) ? question.options : [])
        .map((option) => String(option ?? '').trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 12);
    }
    return cleaned;
  })
  .filter((question) => question.text && (
    (question.type !== 'single' && question.type !== 'multiple') || question.options.length >= 2
  ));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있습니다.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI 문항 인식 설정이 필요합니다.' });

  try {
    const { imageBase64, mediaType = 'image/jpeg' } = req.body || {};
    const normalizedType = String(mediaType).toLowerCase();
    const imageData = String(imageBase64 || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
    if (!ALLOWED_IMAGE_TYPES.has(normalizedType)) {
      return res.status(400).json({ error: 'JPG, PNG, WEBP, GIF 이미지만 사용할 수 있습니다.' });
    }
    if (!imageData) return res.status(400).json({ error: '설문지 사진을 선택해 주세요.' });
    if (imageData.length > 14_000_000) {
      return res.status(413).json({ error: '사진이 너무 큽니다. 10MB 이하 사진을 사용해 주세요.' });
    }

    const prompt = `첨부된 설문지 사진을 읽고, 교사가 온라인 설문으로 옮길 수 있도록 구조화해 주세요.

규칙:
- 사진에 실제로 보이는 제목, 설명, 문항, 선택지를 정확히 옮깁니다. 보이지 않는 내용은 지어내지 않습니다.
- 단일 선택은 single, 복수 선택은 multiple, 자유 서술은 text, 1~5 만족도/척도는 rating으로 분류합니다.
- 번호나 체크박스 기호는 문항/선택지 텍스트에서 제거합니다.
- 필수 여부를 알 수 없으면 required는 true로 둡니다.
- 표 형태의 5점 척도는 질문별 rating 문항으로 나눕니다.
- 판독하기 어려운 부분은 가장 그럴듯한 문장으로 조용히 보정하되, 문항을 새로 만들지는 않습니다.

다음 JSON 객체만 반환하세요. 마크다운이나 설명은 쓰지 마세요.
{
  "title": "설문 제목",
  "description": "안내 문구 또는 빈 문자열",
  "questions": [
    { "type": "single", "text": "문항", "required": true, "options": ["선택지 1", "선택지 2"] },
    { "type": "multiple", "text": "문항", "required": true, "options": ["선택지 1", "선택지 2"] },
    { "type": "text", "text": "문항", "required": false },
    { "type": "rating", "text": "문항", "required": true }
  ]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(50000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_SURVEY_MODEL
          || process.env.ANTHROPIC_QUIZ_MODEL
          || 'claude-haiku-4-5-20251001',
        max_tokens: 6000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: normalizedType, data: imageData } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error?.message || `AI 요청 실패 (${response.status})`);
    }

    const data = await response.json();
    const rawText = data.content?.find((item) => item.type === 'text')?.text || '';
    const stripped = rawText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('사진에서 설문 구조를 읽지 못했습니다.');

    const parsed = JSON.parse(stripped.slice(start, end + 1));
    const questions = cleanQuestions(parsed.questions);
    if (questions.length === 0) {
      return res.status(422).json({ error: '사진에서 사용할 수 있는 문항을 찾지 못했습니다. 더 선명하게 촬영해 주세요.' });
    }

    return res.status(200).json({
      title: String(parsed.title || '사진에서 가져온 설문').trim().slice(0, 120),
      description: String(parsed.description || '').trim().slice(0, 1000),
      questions,
    });
  } catch (error) {
    console.error('generate-survey error:', error);
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return res.status(504).json({ error: '사진 분석 시간이 초과되었습니다. 사진 크기를 줄여 다시 시도해 주세요.' });
    }
    return res.status(500).json({ error: error.message || '설문지 사진을 분석하지 못했습니다.' });
  }
}
