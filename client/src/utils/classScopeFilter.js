// Legacy rows without classId still belong to their teacher; never include another class.
export const isInClassScope = (row, scope = {}) => {
  scope = scope || {};
  const classId = scope.classId || scope.id;
  if (!classId && !scope.teacherUid) return false;
  if (scope.teacherUid && row.teacherUid !== scope.teacherUid) return false;
  return !classId || !row.classId || row.classId === classId;
};
