export const SURVEY_QUESTION_TYPES = [
  { id: 'single', label: '객관식 (하나 선택)' },
  { id: 'multiple', label: '복수 선택' },
  { id: 'text', label: '단답형' },
  { id: 'rating', label: '5점 척도' },
];

const choiceTypes = new Set(['single', 'multiple']);

export const createSurveyQuestionId = () =>
  `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const createEmptySurveyQuestion = (type = 'single') => ({
  id: createSurveyQuestionId(),
  type,
  text: '',
  required: true,
  ...(choiceTypes.has(type) ? { options: ['', ''] } : {}),
});

export const normalizeSurveyQuestion = (question = {}, index = 0) => {
  const type = SURVEY_QUESTION_TYPES.some((item) => item.id === question.type)
    ? question.type
    : 'single';
  const options = choiceTypes.has(type)
    ? (Array.isArray(question.options) ? question.options : [])
      .map((option) => String(option ?? '').trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 12)
    : undefined;

  return {
    id: String(question.id || `q_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60),
    type,
    text: String(question.text || question.question || '').trim().slice(0, 300),
    required: question.required !== false,
    ...(choiceTypes.has(type) ? { options } : {}),
  };
};

export const normalizeSurveyDraft = (draft = {}) => ({
  title: String(draft.title || '').trim().slice(0, 120),
  description: String(draft.description || '').trim().slice(0, 1000),
  questions: (Array.isArray(draft.questions) ? draft.questions : [])
    .slice(0, 40)
    .map(normalizeSurveyQuestion),
});

export const validateSurveyDraft = (draft = {}) => {
  const normalized = normalizeSurveyDraft(draft);
  if (!normalized.title) return '설문 제목을 입력해 주세요.';
  if (normalized.questions.length === 0) return '문항을 한 개 이상 추가해 주세요.';
  for (let index = 0; index < normalized.questions.length; index += 1) {
    const question = normalized.questions[index];
    if (!question.text) return `${index + 1}번 문항 내용을 입력해 주세요.`;
    if (choiceTypes.has(question.type) && question.options.length < 2) {
      return `${index + 1}번 문항은 선택지가 두 개 이상 필요합니다.`;
    }
    if (choiceTypes.has(question.type) && new Set(question.options).size !== question.options.length) {
      return `${index + 1}번 문항에 같은 선택지가 중복되어 있습니다.`;
    }
  }
  return '';
};

export const isSurveyAnswerFilled = (question, answer) => {
  if (question?.type === 'multiple') return Array.isArray(answer) && answer.length > 0;
  if (question?.type === 'rating') return Number(answer) >= 1 && Number(answer) <= 5;
  return String(answer ?? '').trim().length > 0;
};

export const validateSurveyAnswers = (questions = [], answers = {}) => {
  const missingIndex = questions.findIndex(
    (question) => question.required !== false && !isSurveyAnswerFilled(question, answers[question.id]),
  );
  return missingIndex >= 0 ? `${missingIndex + 1}번 필수 문항에 응답해 주세요.` : '';
};

export const buildSurveyStats = (survey = {}, responses = []) => {
  const questions = (survey.questions || []).map(normalizeSurveyQuestion);
  return questions.map((question) => {
    const filled = responses
      .map((response) => ({ response, answer: response.answers?.[question.id] }))
      .filter(({ answer }) => isSurveyAnswerFilled(question, answer));

    if (choiceTypes.has(question.type)) {
      const counts = Object.fromEntries(question.options.map((option) => [option, 0]));
      filled.forEach(({ answer }) => {
        const selected = Array.isArray(answer) ? answer : [answer];
        selected.forEach((value) => {
          if (Object.hasOwn(counts, value)) counts[value] += 1;
        });
      });
      return { ...question, answeredCount: filled.length, counts };
    }

    if (question.type === 'rating') {
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let total = 0;
      filled.forEach(({ answer }) => {
        const value = Math.min(5, Math.max(1, Number(answer)));
        distribution[value] += 1;
        total += value;
      });
      return {
        ...question,
        answeredCount: filled.length,
        average: filled.length ? Number((total / filled.length).toFixed(1)) : 0,
        distribution,
      };
    }

    return {
      ...question,
      answeredCount: filled.length,
      textAnswers: filled.map(({ response, answer }) => ({
        studentName: response.studentName || response.studentCode || '학생',
        value: String(answer).trim(),
      })),
    };
  });
};

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const surveyResponsesToCsv = (survey = {}, responses = []) => {
  const questions = (survey.questions || []).map(normalizeSurveyQuestion);
  const header = ['학생 이름', '학생 코드', '응답 시각', ...questions.map((q, index) => `${index + 1}. ${q.text}`)];
  const rows = responses.map((response) => [
    response.studentName || '',
    response.studentCode || '',
    response.submittedAt?.toDate?.().toLocaleString('ko-KR') || '',
    ...questions.map((question) => {
      const answer = response.answers?.[question.id];
      return Array.isArray(answer) ? answer.join(', ') : answer ?? '';
    }),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
};
