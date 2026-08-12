import assert from 'node:assert/strict';
import { validateDeterministicMathQuestion } from '../src/utils/validateCoursewareMathQuestion.js';

const check = (question, expected) => {
  const result = validateDeterministicMathQuestion(question);
  assert.equal(result.applicable, expected.applicable, question.question);
  assert.equal(result.valid, expected.valid, question.question);
  if (expected.answerIndex != null) assert.equal(result.answerIndex, expected.answerIndex, question.question);
};

check({
  question: '8000원 초과 12000원 이하인 물건이 아닌 것은?',
  options: ['8000원 필통', '9000원 공책', '12000원 가방', '12500원 필통'],
  answerIndex: 0,
}, { applicable: true, valid: false });

check({
  question: '8000원 이상 12000원 이하인 물건은?',
  options: ['7500원 필통', '8000원 공책', '12500원 가방', '13000원 연필'],
  answerIndex: 3,
}, { applicable: true, valid: true, answerIndex: 1 });

check({
  question: '14650을 백의 자리에서 반올림한 수는?',
  options: ['14000', '14600', '15000', '16000'],
  answerIndex: 0,
}, { applicable: true, valid: true, answerIndex: 2 });

check({
  question: '14650을 백의 자리에서 반올림한 수는?',
  options: ['14000', '15000', '15,000', '16000'],
  answerIndex: 1,
}, { applicable: true, valid: false });

check({
  question: '12.46을 소수 첫째 자리까지 나타내도록 반올림한 수는?',
  options: ['12', '12.4', '12.5', '13'],
  answerIndex: 0,
}, { applicable: true, valid: true, answerIndex: 2 });

check({
  question: '3724를 백의 자리에서 버림한 수는?',
  options: ['3000', '3700', '3720', '4000'],
  answerIndex: 1,
}, { applicable: true, valid: true, answerIndex: 0 });

check({
  question: '1. 3724의 백의 자리 미만을 올림한 수는?',
  options: ['3700', '3720', '3800', '4000'],
  answerIndex: 0,
}, { applicable: true, valid: true, answerIndex: 2 });

check({
  question: '연필 47자루를 10자루씩 담습니다. 47을 십의 자리에서 올림하면 최소 몇 상자가 필요합니까?',
  options: ['4상자', '5상자', '40상자', '50상자'],
  answerIndex: 1,
}, { applicable: false, valid: true });

check({
  question: '월요일 18도, 화요일 20도, 수요일 22도입니다. 20도 이상 23도 이하인 날은 몇 일인가요?',
  options: ['1일', '2일', '3일', '4일'],
  answerIndex: 1,
}, { applicable: false, valid: true });

check({
  question: '어떤 수를 십의 자리까지 반올림하면 50이 됩니다. 이 수가 될 수 있는 것은?',
  options: ['34', '44', '47', '56'],
  answerIndex: 0,
}, { applicable: true, valid: true, answerIndex: 2 });

check({
  question: '어떤 수를 십의 자리까지 반올림하면 50이 됩니다. 이 수가 될 수 있는 것은?',
  options: ['44', '47', '52', '56'],
  answerIndex: 1,
}, { applicable: true, valid: false });

console.log('AI \ud559\uc2b5\uad00 \ubc94\uc704\u00b7\uc5b4\ub9bc \ubb38\ud56d \uac80\uc99d \ud1b5\uacfc');
