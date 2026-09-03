export const isTopicWritingRewardPending = submission => !!submission
  && !submission.deleted && !submission.rewardsPaid
  && !['rewarded', 'reviewed'].includes(submission.status)
  && submission.rewardDecision !== 'withheld';

export function topicWritingReviewPatch(submission, { teacherScore, teacherComment = '' }) {
  const paid = submission.rewardsPaid || submission.status === 'rewarded';
  return {
    teacherScore: teacherScore === '' || teacherScore == null ? null : Math.max(0, Math.min(100, Number(teacherScore) || 0)),
    teacherComment: teacherComment.trim(),
    status: paid ? 'rewarded' : 'reviewed',
    rewardDecision: paid ? 'paid' : 'withheld',
  };
}
