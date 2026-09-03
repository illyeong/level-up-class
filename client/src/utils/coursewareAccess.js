export const ALL_COURSEWARE_GRADES = [1, 2, 3, 4, 5, 6];
export const coursewareAccessKey = (scope = {}) => scope?.classId || scope?.id
  ? `class_${scope.classId || scope.id}` : scope?.teacherUid ? `teacher_${scope.teacherUid}` : null;
export const coursewareLessonId = (unit, lesson) => JSON.stringify([String(unit.id), String(lesson.no)]);

export function allowedCoursewareGrades(policy) {
  if (!policy || policy.mode === 'all') return ALL_COURSEWARE_GRADES;
  const grades = policy.mode === 'lessons' ? (policy.lessons || []).map(item => item.grade) : policy.grades || [];
  return ALL_COURSEWARE_GRADES.filter(grade => grades.some(value => Number(value) === grade));
}

export function isCoursewareLessonAllowed(policy, unit, lesson) {
  if (!unit || !lesson) return false;
  if (!policy || policy.mode === 'all') return true;
  if (policy.mode === 'grades') return allowedCoursewareGrades(policy).includes(Number(unit.grade));
  if (policy.mode !== 'lessons') return false;
  return (policy.lessons || []).some(item => String(item.unitId) === String(unit.id)
    && String(item.lessonNo) === String(lesson.no) && Number(item.grade) === Number(unit.grade));
}

export function filterCoursewareUnits(units, policy) {
  return units.map(unit => ({ ...unit,
    lessons: (unit.lessons || []).filter(lesson => isCoursewareLessonAllowed(policy, unit, lesson)),
  })).filter(unit => unit.lessons.length > 0);
}
