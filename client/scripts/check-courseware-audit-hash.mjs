import assert from 'node:assert/strict';
import { questionContentHash } from './lib/courseware-audit-hash.mjs';

const question = { question: '두 점을 고르세요.', options: ['A','B','C','D'], answerIndex: 1,
  shape: { type: 'polygon', dimensions: { sides: 3, vertices: [{x:1,y:2},{x:3,y:4},{x:5,y:6}] } } };
const reordered = { shape: { dimensions: { vertices: [{y:2,x:1},{y:4,x:3},{y:6,x:5}], sides: 3 }, type: 'polygon' },
  answerIndex: 1, options: ['A','B','C','D'], question: '두 점을 고르세요.' };
assert.equal(questionContentHash(question), questionContentHash(reordered));
assert.notEqual(questionContentHash(question), questionContentHash({...question, answerIndex:0}));
assert.notEqual(questionContentHash(question), questionContentHash({...question, options:['B','A','C','D']}));
assert.notEqual(questionContentHash(question), questionContentHash({...question, explanation:'추가 해설'}));
assert.equal(questionContentHash({...question, unused:undefined}), questionContentHash(question));
console.log('문항 반영 해시: 객체 키 순서 무관, 보기 순서/정답/본문 변경 감지 통과');
