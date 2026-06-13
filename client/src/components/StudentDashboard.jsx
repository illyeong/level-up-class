import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, setDoc, deleteDoc, runTransaction,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { applyExpDelta, getMaxExpForLevel } from '../utils/leveling';
import AttendanceCheck from '../pages/student/AttendanceCheck';
import HallOfFame from '../pages/student/HallOfFame';
import LevelUpEffect from './LevelUpEffect';
import StudentAIGrowthCoach from './StudentAIGrowthCoach';
import iconDashboard from '../assets/images/icon-dashboard.png';
import { getEffectiveCosmeticStyles, getHallOfFameBadgeText } from '../data/avatarCosmetics';

// ── 오늘의 퀘스트 위젯 ────────────────────────────────────────
function TodayQuestWidget({ studentId, teacherUid, onYesterdayLog, onStudentRewarded }) {
  const [quests, setQuests]           = useState([]);
  const [completions, setCompletions] = useState({});
  const [busyId, setBusyId]           = useState(null);
  const [isLoading, setIsLoading]     = useState(true);
  const [dayKey, setDayKey]           = useState(() => new Date().toDateString());

  useEffect(() => {
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 1, 0);
    const timer = window.setTimeout(() => setDayKey(new Date().toDateString()), nextMidnight.getTime() - Date.now());
    return () => window.clearTimeout(timer);
  }, [dayKey]);

  useEffect(() => {
    if (!studentId) { setIsLoading(false); return; }
    (async () => {
      try {
        let list = [];
        const isTestAccount = teacherUid === 'admin_master_001';
        if (teacherUid) {
          const snap = await getDocs(
            query(collection(db, 'quests'), where('active', '==', true), where('teacherUid', '==', teacherUid))
          );
          list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          // fallback은 테스트 계정에만 적용
          if (list.length === 0 && isTestAccount) {
            const snap2 = await getDocs(query(collection(db, 'quests'), where('active', '==', true)));
            list = snap2.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => !q.teacherUid);
          }
        } else {
          const snap = await getDocs(query(collection(db, 'quests'), where('active', '==', true)));
          list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        const listSorted = list
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'daily' ? -1 : 1;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          });
        setQuests(listSorted);

        const cMap = {};
        await Promise.all(list.map(async q => {
          const cSnap = await getDocs(collection(db, 'quests', q.id, 'completions'));
          const mine  = cSnap.docs.find(d => d.id === studentId);
          if (mine) cMap[q.id] = mine.data();
        }));

        // 매일반복 퀘스트: 어제 미보상 completion 삭제 (대시보드 자정 초기화)
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const cleanedQuests = [];
        const dailyRepeatQuests = list.filter(q => q.type === 'daily' && q.repeatDaily && q.active !== false);
        for (const quest of dailyRepeatQuests) {
          const cachedComp = cMap[quest.id];
          if (!cachedComp) continue;

          const relevantTs = cachedComp.checkedAt || cachedComp.rewardedAt;
          const relevantDate = relevantTs?.toDate?.()
            ?? (relevantTs?.seconds ? new Date(relevantTs.seconds * 1000) : null);
          if (!relevantDate || relevantDate >= todayMidnight) continue;

          const result = await runTransaction(db, async transaction => {
            const completionRef = doc(db, 'quests', quest.id, 'completions', studentId);
            const completionSnap = await transaction.get(completionRef);
            if (!completionSnap.exists()) return null;

            const completion = completionSnap.data();
            const timestamp = completion.checkedAt || completion.rewardedAt;
            const completionDate = timestamp?.toDate?.()
              ?? (timestamp?.seconds ? new Date(timestamp.seconds * 1000) : null);
            if (!completionDate || completionDate >= todayMidnight) return null;

            let updatedStudent = null;
            const shouldReward = quest.selfCheck && completion.checked && !completion.rewarded;
            if (shouldReward) {
              const studentRef = doc(db, 'students', studentId);
              const studentSnap = await transaction.get(studentRef);
              if (studentSnap.exists()) {
                const student = studentSnap.data();
                const progress = applyExpDelta(student.level ?? 1, student.exp ?? 0, quest.rewards?.exp || 0);
                updatedStudent = {
                  gold: (student.gold || 0) + (quest.rewards?.gold || 0),
                  diamonds: (student.diamonds || 0) + (quest.rewards?.diamond || 0),
                  level: progress.level,
                  exp: progress.exp,
                  maxExp: progress.maxExp,
                };
                transaction.update(studentRef, updatedStudent);
              }
            }

            transaction.delete(completionRef);
            return { rewarded: shouldReward, updatedStudent };
          });

          delete cMap[quest.id];
          if (result?.rewarded) {
            cleanedQuests.push({ questId: quest.id, title: quest.title, rewards: quest.rewards });
            if (result.updatedStudent) onStudentRewarded?.(result.updatedStudent);
          }
        }
        if (cleanedQuests.length > 0) {
          const todayStr = new Date().toDateString();
          localStorage.setItem(`levelup_yesterday_log_${studentId}`, JSON.stringify({ date: todayStr, quests: cleanedQuests }));
          onYesterdayLog?.(cleanedQuests);
        }

        setCompletions(cMap);
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    })();
  }, [studentId, teacherUid, dayKey]);

  const toggleCheck = async (quest) => {
    if (!studentId || busyId) return;
    const cur = completions[quest.id];
    if (cur?.rewarded) return;
    setBusyId(quest.id);
    try {
      const ref = doc(db, 'quests', quest.id, 'completions', studentId);
      if (cur?.checked) {
        await deleteDoc(ref);
        setCompletions(prev => { const n = { ...prev }; delete n[quest.id]; return n; });
      } else {
        await setDoc(ref, { checked: true, checkedAt: serverTimestamp(), rewarded: false, rewardedBy: null });
        setCompletions(prev => ({ ...prev, [quest.id]: { checked: true, rewarded: false } }));
      }
    } catch (e) { console.error(e); }
    finally { setBusyId(null); }
  };

  const visible = quests.filter(q => !completions[q.id]?.rewarded || !completions[q.id]?.acknowledgedAt);

  if (isLoading) return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex-1 flex flex-col">
      <h3 className="text-xl font-bold mb-3 text-slate-800">📜 오늘의 퀘스트</h3>
      <div className="flex items-center gap-2.5 py-4">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin shrink-0" />
        <span className="text-sm text-slate-400">불러오는 중...</span>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 flex-1 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-extrabold text-slate-800">📜 오늘의 퀘스트</h3>
        <span className="text-xs text-slate-400 font-medium">{visible.length}개 진행 중</span>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
          <span className="text-3xl mb-2">🎉</span>
          <p className="font-bold text-sm">모든 퀘스트 완료!</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {visible.map(quest => {
            const comp      = completions[quest.id];
            const isChecked = comp?.checked === true;
            const isRewarded = comp?.rewarded === true;
            const isDaily   = quest.type === 'daily';

            return (
              <div key={quest.id}
                className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 transition-all
                  ${isRewarded   ? 'border-amber-200 bg-amber-50'
                  : isChecked   ? 'border-teal-200 bg-teal-50'
                  : 'border-slate-200 bg-white hover:border-indigo-200'}`}>

                {/* 타입 도트 */}
                <div className={`w-2 h-2 rounded-full shrink-0
                  ${isDaily ? 'bg-sky-400' : 'bg-violet-400'}`} />

                {/* 제목 */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate
                    ${isRewarded ? 'text-amber-700' : isChecked ? 'text-teal-700' : 'text-slate-800'}`}>
                    {quest.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full
                      ${isDaily ? 'bg-sky-100 text-sky-600' : 'bg-violet-100 text-violet-600'}`}>
                      {isDaily ? '일일' : '주간'}
                    </span>
                    {quest.rewards?.exp > 0 && (
                      <span className="text-[9px] text-yellow-600 font-bold">⭐+{quest.rewards.exp}</span>
                    )}
                    {quest.rewards?.gold > 0 && (
                      <span className="text-[9px] text-amber-600 font-bold">🪙+{quest.rewards.gold}</span>
                    )}
                    {quest.rewards?.diamond > 0 && (
                      <span className="text-[9px] text-indigo-600 font-bold">💎+{quest.rewards.diamond}</span>
                    )}
                  </div>
                </div>

                {/* 체크 버튼 or 상태 */}
                {isRewarded ? (
                  <span className="text-xs text-amber-600 font-bold shrink-0">🏆 완료</span>
                ) : isChecked ? (
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="text-[10px] text-teal-600 font-bold">✅ 체크됨</span>
                    {quest.selfCheck && (
                      <button onClick={() => toggleCheck(quest)} disabled={!!busyId}
                        className="text-[9px] text-slate-400 hover:text-rose-400 transition-colors">
                        취소
                      </button>
                    )}
                  </div>
                ) : quest.selfCheck ? (
                  <button
                    onClick={() => toggleCheck(quest)}
                    disabled={!!busyId}
                    className={`shrink-0 text-xs font-extrabold px-3 py-1.5 rounded-xl transition-all active:scale-95 disabled:opacity-50
                      ${isDaily
                        ? 'bg-sky-500 hover:bg-sky-600 text-white'
                        : 'bg-violet-500 hover:bg-violet-600 text-white'}`}>
                    {busyId === quest.id ? '...' : '완료 ✓'}
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 shrink-0">교사확인</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const toMillis = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  return 0;
};

const fmtLogDate = (ts) => {
  const ms = toMillis(ts);
  if (!ms) return '-';
  const d = new Date(ms);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
};

function RewardLogWidget({ studentId }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!studentId) { setLogs([]); setIsLoading(false); return; }
    let mounted = true;
    (async () => {
      setIsLoading(true);
      try {
        const [quizSnap, arenaSnap, txSnap, bossSnap] = await Promise.all([
          getDocs(query(collection(db, 'quizResults'), where('studentId', '==', studentId))),
          getDocs(query(collection(db, 'arenaLogs'), where('studentId', '==', studentId))),
          getDocs(query(collection(db, 'transactions'), where('targetIds', 'array-contains', studentId))),
          getDocs(query(collection(db, 'worldBossRaids'), where('status', '==', 'cleared'))),
        ]);

        const merged = [];

        quizSnap.docs.forEach((d) => {
          const r = d.data();
          const gold = r.goldEarned || 0;
          const exp = r.expEarned || 0;
          const diamond = r.diamondEarned || 0;
          if (gold + exp + diamond <= 0) return;
          merged.push({
            id: `quiz-${d.id}`,
            source: '퀴즈던전',
            title: r.dungeonTitle || '퀴즈던전',
            gold, exp, diamond,
            at: r.completedAt || r.createdAt || null,
          });
        });

        arenaSnap.docs.forEach((d) => {
          const r = d.data();
          const reward = r.reward || {};
          const gold = reward.gold || 0;
          const exp = reward.exp || 0;
          const diamond = reward.diamond || 0;
          if (gold + exp + diamond <= 0) return;
          merged.push({
            id: `arena-${d.id}`,
            source: '투기장',
            title: r.isWin ? '투기장 승리 보상' : '투기장 참여 보상',
            gold, exp, diamond,
            at: r.createdAt || null,
          });
        });

        txSnap.docs.forEach((d) => {
          const r = d.data();
          const gold = Math.max(0, r.goldAmount || 0);
          const diamond = Math.max(0, r.diaAmount || 0);
          if (gold + diamond <= 0) return;
          merged.push({
            id: `tx-${d.id}`,
            source: '교사 지급',
            title: r.reason || '선생님 보상 지급',
            gold, exp: 0, diamond,
            at: r.timestamp || null,
          });
        });

        bossSnap.docs.forEach((d) => {
          const r = d.data();
          if (!r.rewardsPaid) return;
          if (!r.participants?.[studentId]) return;
          const gold = r.rewards?.gold || 0;
          const exp = r.rewards?.exp || 0;
          const diamond = r.rewards?.diamond || 0;
          if (gold + exp + diamond <= 0) return;
          merged.push({
            id: `boss-${d.id}`,
            source: '보스레이드',
            title: r.bossName ? `${r.bossName} 클리어` : '보스레이드 클리어',
            gold, exp, diamond,
            at: r.rewardsPaidAt || r.clearedAt || r.createdAt || null,
          });
        });

        merged.sort((a, b) => toMillis(b.at) - toMillis(a.at));
        if (mounted) setLogs(merged.slice(0, 20));
      } catch (e) {
        console.error('보상 로그 로드 에러:', e);
        if (mounted) setLogs([]);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [studentId]);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-extrabold text-slate-800">🎁 받은 보상 로그</h3>
        <span className="text-xs text-slate-400 font-medium">{logs.length}건</span>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2.5 py-3">
          <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin shrink-0" />
          <span className="text-sm text-slate-400">불러오는 중...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="py-6 text-center text-slate-400 text-sm font-bold">아직 받은 보상이 없습니다</div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {logs.map((log) => (
            <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-500">{log.source}</span>
                <span className="text-[10px] text-slate-400">{fmtLogDate(log.at)}</span>
              </div>
              <div className="text-sm font-bold text-slate-800 truncate mt-0.5">{log.title}</div>
              <div className="flex items-center gap-2 mt-1.5 text-[11px] font-extrabold">
                {log.gold > 0 && <span className="text-amber-600">🪙 +{log.gold.toLocaleString()}</span>}
                {log.exp > 0 && <span className="text-indigo-600">⭐ +{log.exp.toLocaleString()}</span>}
                {log.diamond > 0 && <span className="text-cyan-600">💎 +{log.diamond.toLocaleString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RewardLogModalWidget({ studentId }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!studentId) { setLogs([]); setIsLoading(false); return; }
    let mounted = true;
    (async () => {
      setIsLoading(true);
      try {
        const [quizSnap, arenaSnap, txSnap, bossSnap] = await Promise.all([
          getDocs(query(collection(db, 'quizResults'), where('studentId', '==', studentId))),
          getDocs(query(collection(db, 'arenaLogs'), where('studentId', '==', studentId))),
          getDocs(query(collection(db, 'transactions'), where('targetIds', 'array-contains', studentId))),
          getDocs(query(collection(db, 'worldBossRaids'), where('status', '==', 'cleared'))),
        ]);

        const merged = [];

        quizSnap.docs.forEach((d) => {
          const r = d.data();
          const gold = r.goldEarned || 0;
          const exp = r.expEarned || 0;
          const diamond = r.diamondEarned || 0;
          if (gold + exp + diamond <= 0) return;
          merged.push({
            id: `quiz-${d.id}`,
            source: '퀴즈던전',
            title: r.dungeonTitle || '퀴즈던전',
            gold, exp, diamond,
            at: r.completedAt || r.createdAt || null,
          });
        });

        arenaSnap.docs.forEach((d) => {
          const r = d.data();
          const reward = r.reward || {};
          const gold = reward.gold || 0;
          const exp = reward.exp || 0;
          const diamond = reward.diamond || 0;
          if (gold + exp + diamond <= 0) return;
          merged.push({
            id: `arena-${d.id}`,
            source: '투기장',
            title: r.isWin ? '투기장 승리 보상' : '투기장 참여 보상',
            gold, exp, diamond,
            at: r.createdAt || null,
          });
        });

        txSnap.docs.forEach((d) => {
          const r = d.data();
          const gold = Math.max(0, r.goldAmount || 0);
          const diamond = Math.max(0, r.diaAmount || 0);
          if (gold + diamond <= 0) return;
          merged.push({
            id: `tx-${d.id}`,
            source: '교사 지급',
            title: r.reason || '선생님 보상 지급',
            gold, exp: 0, diamond,
            at: r.timestamp || null,
          });
        });

        bossSnap.docs.forEach((d) => {
          const r = d.data();
          if (!r.rewardsPaid) return;
          if (!r.participants?.[studentId]) return;
          const gold = r.rewards?.gold || 0;
          const exp = r.rewards?.exp || 0;
          const diamond = r.rewards?.diamond || 0;
          if (gold + exp + diamond <= 0) return;
          merged.push({
            id: `boss-${d.id}`,
            source: '보스레이드',
            title: r.bossName ? `${r.bossName} 클리어` : '보스레이드 클리어',
            gold, exp, diamond,
            at: r.rewardsPaidAt || r.clearedAt || r.createdAt || null,
          });
        });

        merged.sort((a, b) => toMillis(b.at) - toMillis(a.at));
        if (mounted) setLogs(merged.slice(0, 20));
      } catch (e) {
        console.error('보상 로그 로드 에러:', e);
        if (mounted) setLogs([]);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [studentId]);

  return (
    <>
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-800">🎁 받은 보상 로그</h3>
            <p className="text-xs text-slate-400 font-medium mt-1">
              {isLoading ? '불러오는 중...' : `총 ${logs.length}건`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-extrabold transition-colors"
          >
            로그 보기
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[220] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-extrabold text-slate-800">🎁 받은 보상 로그</h3>
                <p className="text-xs text-slate-400 mt-0.5">{isLoading ? '불러오는 중...' : `${logs.length}건`}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors"
              >
                닫기
              </button>
            </div>

            <div className="p-5 max-h-[65vh] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center gap-2.5 py-3">
                  <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin shrink-0" />
                  <span className="text-sm text-slate-400">불러오는 중...</span>
                </div>
              ) : logs.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm font-bold">아직 받은 보상 로그가 없습니다.</div>
              ) : (
                <div className="space-y-2 pr-1">
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-500">{log.source}</span>
                        <span className="text-[10px] text-slate-400">{fmtLogDate(log.at)}</span>
                      </div>
                      <div className="text-sm font-bold text-slate-800 truncate mt-0.5">{log.title}</div>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] font-extrabold">
                        {log.gold > 0 && <span className="text-amber-600">🪙 +{log.gold.toLocaleString()}</span>}
                        {log.exp > 0 && <span className="text-indigo-600">⭐ +{log.exp.toLocaleString()}</span>}
                        {log.diamond > 0 && <span className="text-cyan-600">💎 +{log.diamond.toLocaleString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const StudentDashboard = ({ studentCode, onChangeView, themeMode = 'dark' }) => {
  const [studentData, setStudentData]       = useState(null);
  const [isLoading, setIsLoading]           = useState(false);
  const [yesterdayLog, setYesterdayLog]     = useState(null);
  const [showYesterdayPopup, setShowYesterdayPopup] = useState(false);
  const [newApprovedCount, setNewApprovedCount] = useState(0);
  const [levelUpData, setLevelUpData]       = useState(null); // { prevLevel, newLevel }
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [installGuide, setInstallGuide] = useState(null);

  useEffect(() => {
    if (!studentCode) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setStudentData({ id: snap.docs[0].id, ...snap.docs[0].data() });
        }
      } catch (err) {
        console.error('학생 데이터 로딩 에러:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [studentCode]);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // 레벨업 감지 — studentData 로드 후 이전 레벨과 비교
  useEffect(() => {
    if (!studentData?.id || !studentData?.level) return;
    const key      = `student_level_${studentData.id}`;
    const stored   = parseInt(localStorage.getItem(key) || '0', 10);
    const current  = studentData.level;
    if (stored > 0 && current > stored) {
      const prevMaxExp = getMaxExpForLevel(stored);
      setLevelUpData({ prevLevel: stored, newLevel: current, expGained: prevMaxExp, maxExp: prevMaxExp });
    }
    localStorage.setItem(key, String(current));
  }, [studentData?.id, studentData?.level]);

  // 배움노트 신규 승인 뱃지
  useEffect(() => {
    if (!studentData?.id) return;
    getDocs(query(collection(db, 'learningNotes'),
      where('studentId', '==', studentData.id),
      where('status', '==', 'approved'),
      where('studentSeen', '==', false)
    )).then(snap => setNewApprovedCount(snap.size)).catch(() => {});
  }, [studentData?.id]);

  // localStorage에서 어제 완료한 퀘스트 로그 확인 (새로고침 시에도 표시)
  useEffect(() => {
    if (!studentData?.id) return;
    const key     = `levelup_yesterday_log_${studentData.id}`;
    const shownKey = `levelup_yesterday_shown_${studentData.id}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const { date, quests } = JSON.parse(raw);
      const todayStr  = new Date().toDateString();
      const shownDate = localStorage.getItem(shownKey);
      if (date === todayStr && shownDate !== todayStr && quests?.length > 0) {
        setYesterdayLog(quests);
        setShowYesterdayPopup(true);
      }
    } catch {}
  }, [studentData?.id]);

  const handleYesterdayLog = (quests) => {
    setYesterdayLog(quests);
    setShowYesterdayPopup(true);
  };

  const handleCloseYesterday = () => {
    setShowYesterdayPopup(false);
    if (studentData?.id) {
      localStorage.setItem(`levelup_yesterday_shown_${studentData.id}`, new Date().toDateString());
    }
  };

  const openHomeShortcutGuide = () => {
    setInstallGuide({
      title: '홈화면/바탕화면에 추가하기',
      description: isIOS
        ? 'iPhone/iPad에서는 Safari 하단 공유 버튼을 누른 뒤 "홈 화면에 추가"를 선택해 주세요.'
        : '브라우저 주소창 오른쪽 또는 메뉴에서 "홈 화면에 추가", "바로가기 만들기", "앱 설치"를 선택해 주세요.',
      steps: isIOS
        ? ['Safari로 접속하기', '하단 공유 버튼 누르기', '"홈 화면에 추가" 선택']
        : ['Chrome 또는 Edge로 접속하기', '주소창 오른쪽 설치 아이콘 또는 메뉴 열기', '"홈 화면에 추가" 또는 "바로가기 만들기" 선택'],
    });
  };

  const handleAppInstallClick = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }
    setInstallGuide({
      title: '앱 설치 안내',
      description: isIOS
        ? 'iOS Safari는 앱 설치 팝업을 직접 띄울 수 없습니다. 공유 버튼에서 홈 화면에 추가해 주세요.'
        : '현재 브라우저가 설치 팝업을 제공하지 않는 상태입니다. 주소창의 설치 아이콘 또는 브라우저 메뉴를 확인해 주세요.',
      steps: isIOS
        ? ['Safari로 접속하기', '공유 버튼 누르기', '"홈 화면에 추가" 선택']
        : ['Chrome 또는 Edge로 접속하기', '주소창 설치 아이콘 확인', '메뉴에서 "앱 설치" 또는 "홈 화면에 추가" 선택'],
    });
  };

  const name     = studentData?.name     || studentData?.studentCode || '용감한 용사';

  const level    = studentData?.level    || 1;
  const exp      = studentData?.exp      || 0;
  const maxExp   = getMaxExpForLevel(level);
  const diamonds = studentData?.diamonds ?? 0;
  const gold     = studentData?.gold     ?? 0;
  const expPct   = Math.min(100, Math.round((exp / maxExp) * 100));
  const cosmeticStyles = getEffectiveCosmeticStyles(studentData);
  const hallBadgeText = getHallOfFameBadgeText(studentData);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-64 gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <div className="text-slate-400 font-bold text-sm">불러오는 중...</div>
      </div>
    );
  }

  return (
    <>
    {levelUpData && (
      <LevelUpEffect
        prevLevel={levelUpData.prevLevel}
        newLevel={levelUpData.newLevel}
        characterImage={studentData?.characterImage || null}
        onClose={() => setLevelUpData(null)}
        expGained={levelUpData.expGained}
        maxExp={levelUpData.maxExp}
      />
    )}
    {installGuide && (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 px-4" onClick={() => setInstallGuide(null)}>
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">{installGuide.title}</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">{installGuide.description}</p>
            </div>
            <button
              onClick={() => setInstallGuide(null)}
              className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-extrabold text-slate-600 hover:bg-slate-200"
            >
              닫기
            </button>
          </div>
          <div className="space-y-2">
            {installGuide.steps.map((step, idx) => (
              <div key={step} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-extrabold text-white">{idx + 1}</span>
                <span className="text-sm font-bold text-slate-700">{step}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setInstallGuide(null)}
            className="mt-5 w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-indigo-700"
          >
            확인
          </button>
        </div>
      </div>
    )}
    <div className={`min-h-screen p-6 md:p-8 ${themeMode === 'dark' ? '' : 'bg-slate-50'}`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between mb-8 gap-4 flex-wrap">
        <h1 className={`text-3xl font-bold flex items-center gap-2 ${themeMode === 'dark' ? 'text-white' : 'text-slate-800'}`}>
          <img src={iconDashboard} alt="대시보드" className="w-8 h-8 object-contain" />
          학생 대시보드
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          {installPrompt && (
            <button
              onClick={openHomeShortcutGuide}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 border border-slate-800 text-white font-extrabold text-sm px-4 py-2 rounded-2xl transition-colors shadow-sm"
            >
              홈화면/바탕화면 추가
            </button>
          )}
          {!installPrompt && (
            <button
              onClick={openHomeShortcutGuide}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 border border-slate-800 text-white font-extrabold text-sm px-4 py-2 rounded-2xl transition-colors shadow-sm"
            >
              홈화면/바탕화면 추가
            </button>
          )}
          <button
            onClick={handleAppInstallClick}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 border border-indigo-700 text-white font-extrabold text-sm px-4 py-2 rounded-2xl transition-colors shadow-sm"
          >
            앱 설치하기
          </button>
          {!installPrompt && isIOS && (
            <div className="text-xs text-slate-500 font-semibold">
              iOS는 Safari 공유 버튼에서 홈 화면에 추가를 눌러 주세요.
            </div>
          )}
          {yesterdayLog?.length > 0 && (
            <button onClick={() => setShowYesterdayPopup(true)}
              className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-extrabold text-sm px-4 py-2 rounded-2xl transition-colors shadow-sm">
              📋 어제 완료한 퀘스트 목록 보기 <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full">{yesterdayLog.length}</span>
            </button>
          )}
          {newApprovedCount > 0 && (
            <button onClick={() => onChangeView?.('learningNote')}
              className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-extrabold text-sm px-4 py-2 rounded-2xl transition-colors shadow-sm animate-pulse">
              📚 배움노트 {newApprovedCount}개 승인됨! <span className="bg-emerald-600 text-white text-xs px-2 py-0.5 rounded-full">{newApprovedCount}</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] items-start gap-6">
        {/* 캐릭터 카드 */}
        <div className="bg-white p-5 rounded-3xl shadow-lg border border-gray-100 text-center self-start">
          <div
            className="w-full h-44 md:h-48 mx-auto flex items-center justify-center mb-4 relative bg-indigo-50 rounded-2xl overflow-hidden border border-indigo-100"
            style={{ ...cosmeticStyles.background.style, ...cosmeticStyles.frame.style }}
          >
            {hallBadgeText && (
              <div className="absolute top-2 right-2 z-20 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 px-3 py-1 text-[11px] font-black text-amber-950 shadow-lg ring-2 ring-white/90">
                {hallBadgeText}
              </div>
            )}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-indigo-300/35 blur-3xl" />
              <div className="absolute left-1/2 bottom-6 -translate-x-1/2 w-36 h-6 rounded-[999px] bg-slate-700/20 blur-md" />
            </div>
            {cosmeticStyles.background.floorStyle && (
              <div
                className="pointer-events-none absolute left-1/2 bottom-8 -translate-x-1/2 w-40 h-8 rounded-full"
                style={cosmeticStyles.background.floorStyle}
              />
            )}
            {studentData?.characterImage ? (
              <img
                src={studentData.characterImage}
                alt="내 캐릭터"
                className="relative z-10 w-full h-full object-contain scale-[2] drop-shadow-md"
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="relative z-10 w-full h-full flex items-center justify-center text-6xl">
                {studentData?.parts ? '🦸‍♂️' : '🧑‍🎓'}
              </div>
            )}
            {/* 레벨 뱃지 */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-3 py-0.5 rounded-full font-bold text-xs shadow-md border-2 border-white whitespace-nowrap">
              Lv. {level}
            </div>
          </div>

          <h2 className="text-xl font-bold mt-3 text-slate-800">{name}</h2>

          {/* EXP 바 */}
          <div className="mt-4 mb-5">
            <div className="flex justify-between text-xs text-slate-400 font-medium mb-1">
              <span>EXP</span>
              <span>{exp} / {maxExp}</span>
            </div>
            <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-3 rounded-full transition-all" style={{ width: `${expPct}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100">
              <p className="text-xs text-blue-500 font-bold mb-0.5">다이아</p>
              <p className="font-extrabold text-lg text-blue-700">💎 {diamonds.toLocaleString()}</p>
            </div>
            <div className="bg-yellow-50 p-3 rounded-2xl border border-yellow-100">
              <p className="text-xs text-yellow-600 font-bold mb-0.5">골드</p>
              <p className="font-extrabold text-lg text-amber-600">🪙 {gold.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* 우측: 출석 체크 + 퀘스트 안내 */}
        <div className="flex flex-col gap-4">
          <StudentAIGrowthCoach
            studentCode={studentCode}
            onChangeView={onChangeView}
            themeMode={themeMode}
          />

          {/* 출석 체크 */}
          <AttendanceCheck studentCode={studentCode} />

          {/* 오늘의 퀘스트 */}
          <TodayQuestWidget
            studentId={studentData?.id}
            teacherUid={studentData?.teacherUid}
            onYesterdayLog={handleYesterdayLog}
            onStudentRewarded={(rewardedData) => setStudentData(prev => prev ? { ...prev, ...rewardedData } : prev)}
          />
          <RewardLogModalWidget studentId={studentData?.id} />
        </div>
      </div>

      {/* 명예의 전당 */}
      <div className="max-w-7xl mx-auto mt-8 border-t border-slate-700/70 pt-6">
        <HallOfFame
          studentCode={studentCode}
          teacherUid={studentData?.teacherUid}
          onHallFrameChange={(hallOfFameFrame) => {
            setStudentData(prev => prev ? { ...prev, hallOfFameFrame } : prev);
          }}
        />
      </div>

      {/* 어제 완료한 퀘스트 팝업 */}
      {showYesterdayPopup && yesterdayLog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-white">
              <div className="text-3xl mb-1">🌙</div>
              <h2 className="text-xl font-extrabold">어제 완료한 퀘스트</h2>
              <p className="text-indigo-200 text-sm mt-0.5">자체체크로 완료한 퀘스트 내역입니다</p>
            </div>
            <div className="p-5 space-y-2 max-h-64 overflow-y-auto">
              {yesterdayLog.map((q, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 border border-slate-200">
                  <span className="font-bold text-slate-800 text-sm flex-1 mr-3">{q.title}</span>
                  <div className="flex gap-2 text-xs font-extrabold shrink-0">
                    {(q.rewards?.exp     || 0) > 0 && <span className="text-amber-600">⭐+{q.rewards.exp}</span>}
                    {(q.rewards?.gold    || 0) > 0 && <span className="text-amber-500">🪙+{q.rewards.gold}</span>}
                    {(q.rewards?.diamond || 0) > 0 && <span className="text-indigo-600">💎+{q.rewards.diamond}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5">
              <button onClick={handleCloseYesterday}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl transition-colors">
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default StudentDashboard;
