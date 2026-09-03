import { useCallback, useEffect, useState } from 'react';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { coursewareAccessKey, isCoursewareLessonAllowed } from '../utils/coursewareAccess';
const BLOCKED_POLICY = { mode: 'lessons', lessons: [] };

export default function useCoursewareAccess(student, isTeacher) {
  const key = coursewareAccessKey({ classId: student?.classId, teacherUid: student?.teacherUid });
  const [state, setState] = useState({ key: null, ready: false, policy: null, error: '' });
  useEffect(() => {
    if (isTeacher || !key) return;
    return onSnapshot(doc(db, 'aiCoursewareAccess', key), { includeMetadataChanges: true }, snap => {
      if (snap.metadata.fromCache) return; // Never unlock based on an empty/offline cache.
      setState({ key, ready: true, policy: snap.exists() ? snap.data() : null, error: '' });
    }, () => setState({ key, ready: false, policy: null, error: '학습 허용 설정을 불러오지 못했습니다. 연결을 확인하고 학습관을 다시 열어주세요.' }));
  }, [key, isTeacher]);
  const ready = isTeacher || (!!key && state.key === key && state.ready);
  const policy = isTeacher ? null : ready ? state.policy : BLOCKED_POLICY;
  const assertAllowed = useCallback(async (unit, lesson) => {
    if (isTeacher) return;
    if (!key || !ready) throw new Error('학습 허용 설정을 확인한 뒤 다시 시도해주세요.');
    const snap = await getDocFromServer(doc(db, 'aiCoursewareAccess', key));
    const current = snap.exists() ? snap.data() : null;
    if (!isCoursewareLessonAllowed(current, unit, lesson)) throw new Error('선생님이 지정한 학습 콘텐츠가 아닙니다. 목록에서 지정된 차시를 선택해주세요.');
  }, [isTeacher, key, ready]);
  return { ready, policy, assertAllowed, error: state.key === key ? state.error : '' };
}
