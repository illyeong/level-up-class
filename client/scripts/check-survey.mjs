import assert from 'node:assert/strict';
import {
  buildSurveyStats,
  normalizeSurveyDraft,
  surveyResponsesToCsv,
  validateSurveyAnswers,
  validateSurveyDraft,
} from '../src/utils/surveys.js';

const survey = normalizeSurveyDraft({
  title: '우리 반 만족도',
  questions: [
    { id: 'q1', type: 'single', text: '좋았나요?', options: ['네', '아니요'] },
    { id: 'q2', type: 'multiple', text: '좋았던 활동', options: ['게임', '발표'] },
    { id: 'q3', type: 'rating', text: '별점' },
    { id: 'q4', type: 'text', text: '의견', required: false },
  ],
});

assert.equal(validateSurveyDraft(survey), '');
assert.match(validateSurveyDraft({ title: '빈 설문', questions: [] }), /문항/);
assert.match(validateSurveyDraft({
  title: '중복 보기',
  questions: [{ type: 'single', text: '선택', options: ['같음', '같음'] }],
}), /중복/);
assert.match(validateSurveyAnswers(survey.questions, {}), /1번/);

const responses = [
  { studentName: '가람', answers: { q1: '네', q2: ['게임', '발표'], q3: 5, q4: '좋아요' } },
  { studentName: '나래', answers: { q1: '아니요', q2: ['게임'], q3: 3 } },
];
const stats = buildSurveyStats(survey, responses);
assert.deepEqual(stats[0].counts, { 네: 1, 아니요: 1 });
assert.deepEqual(stats[1].counts, { 게임: 2, 발표: 1 });
assert.equal(stats[2].average, 4);
assert.equal(stats[3].textAnswers[0].studentName, '가람');
assert.match(surveyResponsesToCsv(survey, responses), /"가람"/);

console.log('Survey checks passed.');
