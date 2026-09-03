export function questPeriodStart(quest, now = new Date()) {
  const weekly = quest.type === 'weekly' && quest.repeatWeekly;
  if (!weekly && !(quest.type === 'daily' && quest.repeatDaily)) return null;
  const kst = new Date(now.getTime() + 9 * 3600000);
  kst.setUTCHours(0, 0, 0, 0);
  if (weekly) kst.setUTCDate(kst.getUTCDate() - (kst.getUTCDay() + 6) % 7);
  return new Date(kst.getTime() - 9 * 3600000);
}

export function currentQuestCompletion(quest, completion, now = new Date()) {
  if (!completion) return null;
  const boundary = questPeriodStart(quest, now);
  const ts = completion.checkedAt || completion.rewardedAt;
  const at = ts?.toDate?.() ?? (ts?.seconds != null ? new Date(ts.seconds * 1000) : null);
  return boundary && at && at < boundary ? null : completion;
}
