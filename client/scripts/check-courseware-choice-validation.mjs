import assert from 'node:assert/strict';
import { normalizeCoursewareChoices } from '../src/utils/coursewareOptions.js';
import { evaluateCoursewareExpression } from '../src/utils/coursewareArithmetic.js';
import { validateDeterministicMathQuestion } from '../src/utils/validateCoursewareMathQuestion.js';
import handler from '../api/generate-courseware.js';

const question = (text, options, answerIndex = 0) => ({ question: text, options, answerIndex, explanation: '계산 과정과 정답을 확인합니다.' });
const fixtures = [
  [question('2 + 3을 계산하세요.', ['1', '2', '3', '4']), false],
  [question('2 + 3을 계산하세요.', ['4', '5', '6', '7']), true, 1],
  [question('2 + 3을 계산하세요.', ['① 5', '② 5', '③ 6', '④ 7']), false],
  [question('2 + 3을 계산하세요.', ['5', '５', '6', '7']), false],
  [question('2 + 3을 계산하세요.', ['5', '5\u200b', '6', '7']), false],
  [question('2 + 3을 계산하세요.', ['5', '', '6', '7']), false],
  [question('2 + 3을 계산하세요.', ['5', '6', '7', '8', '9']), false],
  [question('2 + 3을 계산하세요.', ['5', '6', '7', '8'], null), false],
  [question('2 + 3을 계산하세요.', ['5', '6', '7', '8'], 4), false],
  [question('2 + 3을 계산하세요.', ['1. 4', '2. 5', '3. 6', '4. 7'], '1'), true, 1],
  [question('3/4 + 1/2의 계산 결과는?', ['1', '5/4', '3/2', '2']), true, 1],
  [question('3/4 + 1/2의 계산 결과는?', ['1', '5/4', '1.25', '2']), false],
  [question('1/4 + 1/4의 계산 결과는?', ['1/2', '½', '3/4', '1']), false],
  [question('2과 1/3 + 1/3을 계산하세요.', ['2/3', '8/3', '3', '4']), true, 1],
  [question('2 + 3 × 4를 계산하세요.', ['20', '14', '24', '9']), true, 1],
  [question('(2 + 3) × 4를 계산하세요.', ['20', '14', '24', '9']), true, 0],
  [question('1.5 + 2.25의 값은 얼마인가요?', ['3', '3.25', '3.75', '4']), true, 2],
  [question('서로 같은 분수끼리 짝지어진 것은?', ['1/2, 2/4', '1/3, 2/5', '2/3, 3/4', '3/5, 4/5']), true, 0],
  [question('서로 같은 분수끼리 짝지어진 것은?', ['1/2, 2/4', '1/3, 2/6', '2/3, 3/4', '3/5, 4/5']), false],
  [question('서로 같은 분수끼리 짝지어진 것이 아닌 것은?', ['1/2, 2/4', '1/3, 2/6', '2/3, 3/4', '3/5, 6/10']), true, 2],
];

for (const [raw, expectedValid, answerIndex] of fixtures) {
  const normalized = normalizeCoursewareChoices(raw);
  const result = normalized && validateDeterministicMathQuestion(normalized);
  assert.equal(Boolean(result?.valid), expectedValid, JSON.stringify(raw));
  if (expectedValid) assert.equal(result.answerIndex, answerIndex, raw.question);

  // Exercise the real API's cached-content QA path, without credentials/network.
  let response;
  await handler({ method: 'POST', body: { action: 'qa-batch', items: [{
    content: { conceptCards: [{ title: '개념', body: '수학 개념을 익혀요.' }], questions: [raw] },
  }] } }, {
    setHeader() {}, status() { return this; }, json(value) { response = value; },
  });
  assert.equal(response.results[0].validCount, expectedValid ? 1 : 0, `API: ${JSON.stringify(raw)}`);
}

for (const expression of ['alert(1)', '1/0', '2 +', '(2+3', '1.2.3', '5 apples']) {
  assert.equal(evaluateCoursewareExpression(expression), null, expression);
}
assert.equal(evaluateCoursewareExpression('1,000,000 + 2'), 1000002);
assert.equal(validateDeterministicMathQuestion(question('2 + □ = 5에서 빈칸은?', ['1', '2', '3', '4'], 2)).applicable, false);
assert.equal(validateDeterministicMathQuestion(question('사과 2개와 배 3개의 가격 차이는?', ['1', '2', '3', '4'])).applicable, false);
console.log(`AI 학습관 선택지·정답·기존 캐시 QA 회귀 검사 ${fixtures.length}건 통과`);
