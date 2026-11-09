import assert from 'node:assert/strict';
import {
  calculateStudentInterest,
  getKoreaWeekKey,
  getWeeksBetween,
} from '../src/utils/bankInterest.js';

assert.equal(getKoreaWeekKey(new Date('2026-09-06T14:59:59Z')), '2026-08-31');
assert.equal(getKoreaWeekKey(new Date('2026-09-06T15:00:00Z')), '2026-09-07');
assert.equal(getWeeksBetween('2026-08-24', '2026-09-07'), 2);

const freshDeposit = calculateStudentInterest({
  student: { bankGold: 1000, bankGoldDepositWeek: '2026-09-07' },
  diamondRate: 0.03,
  goldRate: 0.03,
  currentWeek: '2026-09-07',
});
assert.equal(freshDeposit.gold.weeks, 0, '예치한 주에는 즉시 이자를 지급하지 않아야 합니다.');

const oneWeek = calculateStudentInterest({
  student: {
    bankDiamond: 1000,
    bankGold: 1000,
    bankDiamondDepositWeek: '2026-08-31',
    bankGoldDepositWeek: '2026-08-31',
  },
  diamondRate: 0.03,
  goldRate: 0.05,
  currentWeek: '2026-09-07',
});
assert.equal(oneWeek.diamond.interest, 30);
assert.equal(oneWeek.gold.interest, 50);
assert.equal(oneWeek.updates.bankDiamond, 1030);
assert.equal(oneWeek.updates.bankGold, 1050);

const missedWeeks = calculateStudentInterest({
  student: {
    bankGold: 1000,
    bankGoldInterest: 10,
    bankGoldLastInterestWeek: '2026-08-24',
  },
  diamondRate: 0.03,
  goldRate: 0.1,
  currentWeek: '2026-09-07',
});
assert.equal(missedWeeks.gold.weeks, 2);
assert.equal(missedWeeks.gold.interest, 210, '누락 주차는 매주 정수 복리로 따라잡아야 합니다.');
assert.equal(missedWeeks.updates.bankGoldInterest, 220);

const duplicate = calculateStudentInterest({
  student: { bankGold: 1210, bankGoldLastInterestWeek: '2026-09-07' },
  diamondRate: 0.03,
  goldRate: 0.1,
  currentWeek: '2026-09-07',
});
assert.equal(duplicate.hasDueInterest, false, '같은 주차의 중복 지급을 차단해야 합니다.');

const legacy = calculateStudentInterest({
  student: { bankGold: 1000 },
  diamondRate: 0.03,
  goldRate: 0.03,
  currentWeek: '2026-09-07',
});
assert.equal(legacy.gold.weeks, 1, '기존 예치금은 최초 자동 정산 때 한 주분만 지급해야 합니다.');

console.log('학급은행 주간 자동이자·중복방지·누락주차 복리 회귀검사 통과');

