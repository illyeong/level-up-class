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
  const equipped = student.equipped || {};
  const inventory = Array.isArray(student.equipInventory) ? student.equipInventory : [];

  const equipmentBonus = Object.values(equipped).reduce((sum, inventoryId) => {
    const inventoryItem = inventory.find(item => String(item.id) === String(inventoryId));
    const equipment = inventoryItem
      ? equipmentItems.find(item => String(item.id) === String(inventoryItem.itemId))
      : null;
    const attack = Number(equipment?.stats?.attack) || 0;
    const starBonus = attack > 0 ? (Number(inventoryItem?.stars) || 0) * 5 : 0;
    return sum + attack + starBonus;
  }, 0);

  const totalAttack = baseAttack + upgradeBonus + equipmentBonus;
  return {
    level,
    baseAttack,
    upgradeBonus,
    equipmentBonus,
    totalAttack,
    damage: Math.max(100, 100 + totalAttack * 5),
  };
};

export const calculateClassOperationMaxHP = (students = [], equipmentItems = [], days = DEFAULT_CLASS_OPERATION_DAYS) => {
  const duration = Math.max(1, Number(days) || DEFAULT_CLASS_OPERATION_DAYS);
  const dailyDamage = students.reduce(
    (sum, student) => sum + getClassOperationAttack(student, equipmentItems).damage,
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
