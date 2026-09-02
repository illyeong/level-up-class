import assert from 'node:assert/strict';
import { getClassOperationErrorMessage, playOptionalClassOperationEffect } from '../src/utils/classOperationFeedback.js';

assert.match(getClassOperationErrorMessage({ code: 'resource-exhausted', message: 'Quota exceeded.' }), /서버 사용량/);
assert.match(getClassOperationErrorMessage({ code: 'firestore/resource-exhausted' }), /Firebase/);
assert.match(getClassOperationErrorMessage({ name: 'QuotaExceededError' }), /브라우저 저장공간/);
assert.match(getClassOperationErrorMessage({ code: 'unavailable' }), /인터넷 연결/);
assert.equal(getClassOperationErrorMessage(new Error('오늘은 이미 공격했습니다.')), '오늘은 이미 공격했습니다.');
await playOptionalClassOperationEffect(done => { done(); done(); }, 20);
await playOptionalClassOperationEffect(() => { throw new Error('Canvas unavailable'); }, 20);
await playOptionalClassOperationEffect(() => {}, 20); // Suspended RAF never calls onHit.
console.log('대작전 오류 구분·효과 실패/타임아웃 회귀 검사 통과');
