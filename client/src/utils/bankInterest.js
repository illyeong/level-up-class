const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const koreaDateParts = (date = new Date()) => Object.fromEntries(
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, Number(part.value)]),
);

export const getKoreaWeekKey = (date = new Date()) => {
  const { year, month, day } = koreaDateParts(date);
  const koreaCalendarDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = koreaCalendarDate.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  koreaCalendarDate.setUTCDate(koreaCalendarDate.getUTCDate() - daysSinceMonday);
  return koreaCalendarDate.toISOString().slice(0, 10);
};

export const getWeekKeyFromTimestamp = (value) => {
  const date = toDate(value);
  return date ? getKoreaWeekKey(date) : '';
};

export const getWeeksBetween = (fromWeekKey, toWeekKey) => {
  if (!fromWeekKey || !toWeekKey) return 0;
  const from = new Date(`${fromWeekKey}T00:00:00Z`);
  const to = new Date(`${toWeekKey}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (7 * DAY_MS)));
};

const toWholeCurrency = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
};

const normalizeRate = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
};

const calculateCurrency = ({ balance, rate, lastWeek, depositWeek, legacyLastWeek, currentWeek }) => {
  const principal = toWholeCurrency(balance);
  if (principal <= 0) return { weeks: 0, interest: 0, balance: principal };

  const anchorWeek = lastWeek || legacyLastWeek || depositWeek;
  const weeks = anchorWeek ? getWeeksBetween(anchorWeek, currentWeek) : 1;
  if (weeks <= 0) return { weeks: 0, interest: 0, balance: principal };

  let nextBalance = principal;
  let totalInterest = 0;
  const safeRate = normalizeRate(rate);
  for (let index = 0; index < Math.min(weeks, 52); index += 1) {
    const weeklyInterest = Math.floor(nextBalance * safeRate);
    nextBalance += weeklyInterest;
    totalInterest += weeklyInterest;
  }
  return { weeks: Math.min(weeks, 52), interest: totalInterest, balance: nextBalance };
};

export const calculateStudentInterest = ({
  student,
  diamondRate,
  goldRate,
  currentWeek = getKoreaWeekKey(),
}) => {
  const legacyLastWeek = getWeekKeyFromTimestamp(student?.bankLastInterestAt);
  const diamond = calculateCurrency({
    balance: student?.bankDiamond,
    rate: diamondRate,
    lastWeek: student?.bankDiamondLastInterestWeek,
    depositWeek: student?.bankDiamondDepositWeek,
    legacyLastWeek,
    currentWeek,
  });
  const gold = calculateCurrency({
    balance: student?.bankGold,
    rate: goldRate,
    lastWeek: student?.bankGoldLastInterestWeek,
    depositWeek: student?.bankGoldDepositWeek,
    legacyLastWeek,
    currentWeek,
  });

  const updates = {};
  if (diamond.weeks > 0) {
    updates.bankDiamond = diamond.balance;
    updates.bankDiamondInterest = toWholeCurrency(student?.bankDiamondInterest) + diamond.interest;
    updates.bankDiamondLastInterestWeek = currentWeek;
  }
  if (gold.weeks > 0) {
    updates.bankGold = gold.balance;
    updates.bankGoldInterest = toWholeCurrency(student?.bankGoldInterest) + gold.interest;
    updates.bankGoldLastInterestWeek = currentWeek;
  }

  return {
    currentWeek,
    diamond,
    gold,
    updates,
    hasDueInterest: diamond.weeks > 0 || gold.weeks > 0,
    totalInterest: diamond.interest + gold.interest,
  };
};

