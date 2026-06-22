export const DEFAULT_CLASS_OPERATION_GOAL = '우리반이 함께 정하는 특별 보상';
export const DEFAULT_CLASS_OPERATION_BOSS_ID = 'redDragon';
export const DEFAULT_CLASS_OPERATION_DAYS = 30;

export const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getClassOperationAttack = (student = {}, equipmentItems = []) => {
  const level = Math.max(1, Number(student.level) || 1);
  const baseAttack = 10 + Math.floor(level * 2);
  const upgradeBonus = Math.max(0, (Number(student.attackPower) || 10) - 10);
  const baseCriticalChance = 5 + Math.floor(level * 0.5);
  const criticalUpgradeBonus = Math.max(0, (Number(student.critChance) || 20) - 20);
  const equipped = student.equipped || {};
  const inventory = Array.isArray(student.equipInventory) ? student.equipInventory : [];

  const equipmentBonuses = Object.values(equipped).reduce((bonuses, inventoryId) => {
    const inventoryItem = inventory.find(item => String(item.id) === String(inventoryId));
    const equipment = inventoryItem
      ? equipmentItems.find(item => String(item.id) === String(inventoryItem.itemId))
      : null;
    const attack = Number(equipment?.stats?.attack) || 0;
    const critical = Number(equipment?.stats?.crit) || 0;
    const starBonus = (Number(inventoryItem?.stars) || 0) * 5;
    bonuses.attack += attack + (attack > 0 ? starBonus : 0);
    bonuses.critical += critical + (critical > 0 ? starBonus : 0);
    return bonuses;
  }, { attack: 0, critical: 0 });

  const totalAttack = baseAttack + upgradeBonus + equipmentBonuses.attack;
  const criticalChance = Math.min(75, Math.max(0, baseCriticalChance + criticalUpgradeBonus + equipmentBonuses.critical));
  const damage = Math.max(100, 100 + totalAttack * 5);
  const criticalMultiplier = 1.5;
  return {
    level,
    baseAttack,
    upgradeBonus,
    equipmentBonus: equipmentBonuses.attack,
    totalAttack,
    baseCriticalChance,
    criticalUpgradeBonus,
    equipmentCriticalBonus: equipmentBonuses.critical,
    criticalChance,
    criticalMultiplier,
    damage,
    expectedDamage: Math.round(damage * (1 + (criticalChance / 100) * (criticalMultiplier - 1))),
  };
};

export const calculateClassOperationMaxHP = (students = [], equipmentItems = [], days = DEFAULT_CLASS_OPERATION_DAYS) => {
  const duration = Math.max(1, Number(days) || DEFAULT_CLASS_OPERATION_DAYS);
  const dailyDamage = students.reduce(
    (sum, student) => sum + getClassOperationAttack(student, equipmentItems).expectedDamage,
    0,
  );
  const fallbackDailyDamage = Math.max(1, students.length) * 160;
  return {
    expectedDailyDamage: dailyDamage || fallbackDailyDamage,
    maxHP: Math.max(1000, (dailyDamage || fallbackDailyDamage) * duration),
  };
};

export const getRemainingDays = (endDate) => {
  const end = endDate?.toDate ? endDate.toDate() : new Date(endDate);
  if (Number.isNaN(end.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86400000));
};
