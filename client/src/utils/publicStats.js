import { doc, increment, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const PUBLIC_STATS_FALLBACK = Object.freeze({
  classCount: 67,
  studentCount: 1407,
});

export const getPublicStatsRef = () => doc(db, 'publicStats', 'overview');

// 통계 갱신 실패가 학급·학생 생성/삭제 자체를 막아서는 안 됩니다.
export const adjustPublicStats = async ({ classDelta = 0, studentDelta = 0 } = {}) => {
  if (!classDelta && !studentDelta) return true;
  try {
    const updates = { updatedAt: serverTimestamp() };
    if (classDelta) updates.classCount = increment(classDelta);
    if (studentDelta) updates.studentCount = increment(studentDelta);
    await setDoc(getPublicStatsRef(), updates, { merge: true });
    return true;
  } catch (error) {
    console.warn('공개 이용 통계를 갱신하지 못했습니다.', error);
    return false;
  }
};
