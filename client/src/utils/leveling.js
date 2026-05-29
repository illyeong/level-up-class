export const getMaxExpForLevel = (lv) => {
  const level = Math.max(1, Number(lv) || 1);
  if (level <= 10) return 100;
  if (level <= 20) return 300;
  if (level <= 30) return 500;
  if (level <= 40) return 700;
  if (level <= 50) return 900;
  if (level <= 60) return 1100;
  if (level <= 70) return 1300;
  if (level <= 80) return 1500;
  if (level <= 90) return 1700;
  return 1900;
};

export const normalizeLevelProgress = (level, exp) => {
  let lv = Math.max(1, Number(level) || 1);
  let ex = Number(exp) || 0;
  let changed = false;

  if (ex < 0) {
    ex = 0;
    changed = true;
  }

  let mx = getMaxExpForLevel(lv);
  while (ex >= mx && lv < 99) {
    ex -= mx;
    lv += 1;
    mx = getMaxExpForLevel(lv);
    changed = true;
  }

  while (ex < 0 && lv > 1) {
    lv -= 1;
    ex += getMaxExpForLevel(lv);
    changed = true;
  }

  if (ex < 0) {
    ex = 0;
    changed = true;
  }

  return { level: lv, exp: ex, maxExp: getMaxExpForLevel(lv), changed };
};

export const applyExpDelta = (level, exp, delta = 0) => {
  const safeDelta = Number(delta) || 0;
  return normalizeLevelProgress(level, (Number(exp) || 0) + safeDelta);
};
