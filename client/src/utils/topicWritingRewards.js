import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { applyExpDelta } from './leveling';
import { getClassScopedDocs } from './scopedFirestore';
import { isInClassScope } from './classScopeFilter';
import { isTopicWritingRewardPending, topicWritingReviewPatch } from './topicWritingState';
export { isTopicWritingRewardPending } from './topicWritingState';

export const DEFAULT_TOPIC_WRITING_REWARDS = { gold: 100, exp: 50, diamond: 50 };

export async function reviewTopicWritingSubmission({ id, teacherUid, classId, teacherScore, teacherComment }) {
  return runTransaction(db, async tx => {
    const ref = doc(db, 'writingSubmissions', id);
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().deleted || !isInClassScope(snap.data(), { teacherUid, classId })) {
      throw new Error('확인할 제출물을 찾을 수 없습니다. 새로고침해주세요.');
    }
    const updates = { ...topicWritingReviewPatch(snap.data(), { teacherScore, teacherComment }),
      reviewedAt: serverTimestamp(), reviewedBy: teacherUid, updatedAt: serverTimestamp() };
    tx.update(ref, updates);
    return updates;
  });
}

// Recoverable removal. Reward logs and already-paid balances are never changed.
export async function setTopicWritingSubmissionDeleted({ id, teacherUid, classId, deleted }) {
  return runTransaction(db, async tx => {
    const ref = doc(db, 'writingSubmissions', id);
    const snap = await tx.get(ref);
    if (!snap.exists() || !isInClassScope(snap.data(), { teacherUid, classId })) throw new Error('제출물을 찾을 수 없습니다.');
    const updates = { deleted, deletedAt: deleted ? serverTimestamp() : null,
      deletedBy: deleted ? teacherUid : null, updatedAt: serverTimestamp() };
    tx.update(ref, updates);
    return updates;
  });
}

export async function payTopicWritingSubmission({ id, teacherUid, classId = null, allowReviewed = false,
  teacherScore, teacherComment, rewardedBy = teacherUid }) {
  return runTransaction(db, async tx => {
    const ref = doc(db, 'writingSubmissions', id);
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const submission = snap.data();
    if (!isInClassScope(submission, { teacherUid, classId }) || submission.deleted
      || submission.rewardsPaid || submission.status === 'rewarded'
      || (!allowReviewed && !isTopicWritingRewardPending(submission))) return false;
    const studentRef = doc(db, 'students', submission.studentId);
    const studentSnap = await tx.get(studentRef);
    if (!studentSnap.exists() || !isInClassScope(studentSnap.data(), { teacherUid, classId })) return false;
    const student = studentSnap.data();
    const rewards = Object.fromEntries(Object.entries(DEFAULT_TOPIC_WRITING_REWARDS).map(([key, fallback]) => {
      const value = Number(submission.rewards?.[key] ?? fallback);
      return [key, Number.isFinite(value) ? Math.max(0, Math.min(99999, Math.floor(value))) : 0];
    }));
    const progress = applyExpDelta(student.level ?? 1, student.exp ?? 0, rewards.exp);
    tx.update(studentRef, { gold: (student.gold || 0) + rewards.gold,
      diamonds: (student.diamonds || 0) + rewards.diamond,
      level: progress.level, exp: progress.exp, maxExp: progress.maxExp });
    tx.update(ref, {
      ...topicWritingReviewPatch(submission, {
        teacherScore: teacherScore ?? submission.teacherScore ?? submission.aiGrade?.score ?? null,
        teacherComment: teacherComment ?? submission.teacherComment ?? '',
      }),
      status: 'rewarded', rewardDecision: 'paid', rewardsPaid: true,
      reviewedAt: serverTimestamp(), rewardedAt: serverTimestamp(), rewardedBy, updatedAt: serverTimestamp(),
    });
    tx.set(doc(db, 'writingRewardLogs', id), { submissionId: id, topicId: submission.topicId || null,
      studentId: submission.studentId, studentName: submission.studentName || '', teacherUid,
      classId: submission.classId || classId, rewards, createdAt: serverTimestamp() });
    return true;
  });
}

export async function approveTopicWritingSubmissions({ teacherUid, classId = null, studentIds = null,
  submissions = null, teacherComment, rewardedBy = teacherUid }) {
  if (!teacherUid) return { approvedCount: 0, skippedCount: 0 };
  const studentIdSet = studentIds ? new Set(studentIds) : null;
  const items = submissions ?? (await getClassScopedDocs(db, 'writingSubmissions', { teacherUid, classId }))
    .docs.map(item => ({ id: item.id, ...item.data() }));
  let approvedCount = 0;
  let skippedCount = 0;
  for (const item of items.filter(item => isTopicWritingRewardPending(item)
    && (!studentIdSet || studentIdSet.has(item.studentId)))) {
    // Re-read inside the transaction: stale bulk lists cannot reward a removed/reviewed entry.
    const paid = await payTopicWritingSubmission({ id: item.id, teacherUid, classId, teacherComment, rewardedBy });
    if (paid) approvedCount++; else skippedCount++;
  }
  return { approvedCount, skippedCount };
}
