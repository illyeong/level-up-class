import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { applyExpDelta } from './leveling';

export const DEFAULT_TOPIC_WRITING_REWARDS = { gold: 100, exp: 50, diamond: 50 };

export const isTopicWritingRewardPending = (submission) =>
  !submission?.rewardsPaid && submission?.status !== 'rewarded';

export async function approveTopicWritingSubmissions({
  teacherUid,
  classId = null,
  studentIds = null,
  submissions = null,
  teacherComment = '',
  rewardedBy = null,
}) {
  if (!teacherUid) return { approvedCount: 0, skippedCount: 0 };

  const studentIdSet = studentIds ? new Set(studentIds) : null;
  const submissionItems = submissions ?? (await getDocs(query(
    collection(db, 'writingSubmissions'),
    where('teacherUid', '==', teacherUid),
  ))).docs.map(item => ({ id: item.id, ...item.data() }));

  const targets = submissionItems.filter(item =>
    isTopicWritingRewardPending(item) && (!studentIdSet || studentIdSet.has(item.studentId))
  );

  let batch = writeBatch(db);
  let batchCount = 0;
  let approvedCount = 0;
  let skippedCount = 0;
  const studentCache = new Map();

  const commitIfNeeded = async () => {
    if (batchCount < 450) return;
    await batch.commit();
    batch = writeBatch(db);
    batchCount = 0;
  };

  for (const submission of targets) {
    const studentRef = doc(db, 'students', submission.studentId);
    let student = studentCache.get(submission.studentId);

    if (!student) {
      const studentSnap = await getDoc(studentRef);
      if (!studentSnap.exists()) {
        skippedCount++;
        continue;
      }
      student = { id: studentSnap.id, ...studentSnap.data() };
    }

    const rewards = { ...DEFAULT_TOPIC_WRITING_REWARDS, ...(submission.rewards || {}) };
    const progress = applyExpDelta(student.level ?? 1, student.exp ?? 0, rewards.exp || 0);
    const nextStudent = {
      ...student,
      gold: (student.gold || 0) + (rewards.gold || 0),
      diamonds: (student.diamonds || 0) + (rewards.diamond || 0),
      level: progress.level,
      exp: progress.exp,
      maxExp: progress.maxExp,
    };

    batch.update(studentRef, {
      gold: nextStudent.gold,
      diamonds: nextStudent.diamonds,
      level: nextStudent.level,
      exp: nextStudent.exp,
      maxExp: nextStudent.maxExp,
    });
    batch.update(doc(db, 'writingSubmissions', submission.id), {
      teacherScore: submission.teacherScore ?? submission.aiGrade?.score ?? null,
      teacherComment: submission.teacherComment || teacherComment,
      status: 'rewarded',
      rewardsPaid: true,
      reviewedAt: serverTimestamp(),
      rewardedAt: serverTimestamp(),
      rewardedBy: rewardedBy || teacherUid,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(db, 'writingRewardLogs')), {
      submissionId: submission.id,
      topicId: submission.topicId,
      studentId: submission.studentId,
      studentName: submission.studentName || '',
      teacherUid,
      classId,
      rewards,
      createdAt: serverTimestamp(),
    });

    studentCache.set(submission.studentId, nextStudent);
    approvedCount++;
    batchCount += 3;
    await commitIfNeeded();
  }

  if (batchCount > 0) await batch.commit();
  return { approvedCount, skippedCount };
}
