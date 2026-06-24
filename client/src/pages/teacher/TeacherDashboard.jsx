import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, getDoc, updateDoc, writeBatch, serverTimestamp, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import LevelUpEffect from '../../components/LevelUpEffect';
import { applyClassQuickSetup, QUICK_SETUP_VERSION } from '../../utils/classQuickSetup';
import { applyExpDelta, getMaxExpForLevel } from '../../utils/leveling';
import { getEffectiveCosmeticStyles, getHallOfFameBadgeText } from '../../data/avatarCosmetics';
import { OPERATION_MODE_PRESETS } from '../../utils/operationModePresets';

import iconGold from '../../assets/images/icon-gold.png';
import iconDiamond from '../../assets/images/icon-diamond.png';
import iconQuest from '../../assets/images/icon-quest.png';

const getSeatNum = (code) => parseInt(code?.slice(-2)) || 0;
const getKstDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};
const isKstMonday = () => new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  weekday: 'short',
}).format(new Date()) === 'Mon';
const toDate = value => value?.toDate?.() ?? (value?.seconds ? new Date(value.seconds * 1000) : null);
const formatLastAccess = student => {
  const activeAt = toDate(student.lastActiveAt || student.lastLoginAt);
  if (activeAt) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(activeAt);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.month}월 ${map.day}일 ${map.hour}시 ${map.minute}분`;
  }
  if (student.lastActiveDateKey) {
    const [, month, day] = String(student.lastActiveDateKey).split('-');
    if (month && day) return `${month}월 ${day}일 (시간 기록 없음)`;
  }
  return '접속 기록 없음';
};
const isStudentActiveToday = student => {
  if (student.lastActiveDateKey === getKstDateKey()) return true;
  const activeAt = toDate(student.lastActiveAt || student.lastLoginAt);
  if (!activeAt) return false;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(activeAt);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}` === getKstDateKey();
};
const AI_ACTION_TONES = {
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
};

// ── AI 코스웨어 현황 미니 카드 ────────────────────────────────
function AICoursewareCard({ teacherUid, onNavigate }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!teacherUid) return;
    (async () => {
      try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const [setsSnap, progressSnap] = await Promise.all([
          getDocs(query(collection(db, 'aiCourseSets'), where('teacherUid', '==', teacherUid))),
          getDocs(query(collection(db, 'aiCourseProgress'), where('completedAt', '>=', Timestamp.fromDate(today)))),
        ]);
        const allSets = setsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const publishedIds = new Set(allSets.filter(s => s.status === 'published').map(s => s.id));
        const draftCount   = allSets.filter(s => s.status === 'draft').length;
        const publishedCount = publishedIds.size;

        const todayProgress = progressSnap.docs.map(d => d.data()).filter(p => publishedIds.has(p.courseSetId));
        const todayDone     = todayProgress.filter(p => p.status === 'completed').length;
        const scores        = todayProgress.filter(p => p.score != null).map(p => p.score);
        const avgScore      = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

        setStats({ publishedCount, draftCount, todayDone, avgScore });
      } catch (e) { console.error(e); }
    })();
  }, [teacherUid]);

  if (!stats && stats !== null) return null;
  if (!stats) return null;
  if (stats.publishedCount === 0 && stats.draftCount === 0) return null;

  return (
    <div className="mb-4">
      <div className="rounded-2xl border border-violet-800/40 bg-gradient-to-br from-violet-950/80 via-slate-900 to-slate-900 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🤖</span>
            <span className="text-white font-extrabold text-base">AI 코스웨어 현황</span>
          </div>
          <button onClick={() => onNavigate?.('aiCourseware')}
            className="text-xs font-bold text-violet-300 hover:text-white border border-violet-600/50 px-2.5 py-1 rounded-lg hover:bg-violet-500/20 transition-colors">
            관리하기 →
          </button>
        </div>
        <div className="px-5 pb-4 grid grid-cols-4 gap-3">
          {[
            { label: '발행 중',       value: stats.publishedCount, color: 'text-emerald-300' },
            { label: '오늘 완료',      value: `${stats.todayDone}명`, color: 'text-sky-300' },
            { label: '평균 정답률',    value: stats.avgScore !== null ? `${stats.avgScore}%` : '-', color: stats.avgScore >= 70 ? 'text-emerald-300' : stats.avgScore !== null ? 'text-amber-300' : 'text-slate-400' },
            { label: '검토 필요',      value: stats.draftCount, color: stats.draftCount > 0 ? 'text-amber-300' : 'text-slate-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/5 rounded-xl px-3 py-2.5 text-center">
              <div className={`text-xl font-extrabold ${color}`}>{value}</div>
              <div className="text-[12px] text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeacherDashboard({
  selectedClass,
  onGoAccountIssue,
  onStudentTestLogin,
  onOpenBossRaidDemo,
  isDark = false,
  operationMode = 'custom',
  onApplyOperationMode,
}) {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [questStats, setQuestStats] = useState([]);
  const [toast, setToast] = useState(null);
  const [showLevelUpPreview, setShowLevelUpPreview] = useState(false);
  const [previewLevel, setPreviewLevel] = useState(9);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'sub'
  const [selectedIds, setSelectedIds] = useState([]);
  const [diaAmount, setDiaAmount] = useState('');
  const [goldAmount, setGoldAmount] = useState('');
  const [reason, setReason] = useState('');
  const [searchQuery, setSearchQuery] = useState(''); 

  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [studentQuestMap, setStudentQuestMap] = useState({}); // { studentId: [{title, checked}] }
  const [quickSetupInfo, setQuickSetupInfo] = useState(null);
  const [isQuickSetupRunning, setIsQuickSetupRunning] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [approvingQuests, setApprovingQuests] = useState(false);
  const [approvingNotes,  setApprovingNotes]  = useState(false);
  const [isAccessStatusOpen, setIsAccessStatusOpen] = useState(false);
  const [extensionBannerHidden, setExtensionBannerHidden] = useState(
    () => localStorage.getItem('extensionBannerNeverShow') === '1'
  );
  const [aiSummaryExpanded, setAiSummaryExpanded] = useState(
    () => localStorage.getItem('aiSummaryCollapsed') !== '1'
  );

  // ── 퀘스트 체크 학생 일괄 승인 ──────────────────────────────
  const approveAllCheckedQuests = async () => {
    const teacherUid = selectedClass?.teacherUid;
    if (!teacherUid || approvingQuests) return;
    if (!window.confirm('오늘 퀘스트를 체크한 학생 전원에게 보상을 지급합니다.\n이미 보상을 받은 학생은 건너뜁니다.')) return;
    setApprovingQuests(true);
    let totalRewarded = 0;
    try {
      // teacherUid로만 쿼리 후 클라이언트 필터 (inequality 인덱스 불필요)
      const questsSnap = await getDocs(query(
        collection(db, 'quests'),
        where('teacherUid', '==', teacherUid),
      ));
      const activeQuests = questsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(q => q.active !== false); // active 없는 문서도 활성으로 처리
      const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);

      // 학생 목록
      const stuSnap = await getDocs(query(collection(db, 'students'), where('teacherUid', '==', teacherUid)));
      const studentMap = {};
      stuSnap.docs.forEach(d => { studentMap[d.id] = { id: d.id, ...d.data() }; });

      let batch = writeBatch(db); // const → let (commit 후 새 batch 생성)
      let batchCount = 0;

      for (const quest of activeQuests) {
        const compSnap = await getDocs(collection(db, 'quests', quest.id, 'completions'));
        const compMap = {};
        compSnap.docs.forEach(d => { compMap[d.id] = d.data(); });

        for (const [sid, comp] of Object.entries(compMap)) {
          if (!comp.checked || comp.rewarded) continue;
          // 일일퀘스트는 오늘 체크한 것만
          if (quest.type === 'daily' || quest.repeatDaily) {
            const ts = comp.checkedAt;
            const checkedAt = ts?.toDate?.() ?? (ts?.seconds ? new Date(ts.seconds * 1000) : null);
            if (!checkedAt || checkedAt < todayMidnight) continue;
          }
          const student = studentMap[sid];
          if (!student) continue;
          const nextProgress = applyExpDelta(student.level ?? 1, student.exp ?? 0, quest.rewards?.exp || 0);
          batch.update(doc(db, 'students', sid), {
            gold:     (student.gold     || 0) + (quest.rewards?.gold    || 0),
            diamonds: (student.diamonds || 0) + (quest.rewards?.diamond || 0),
            level: nextProgress.level, exp: nextProgress.exp, maxExp: nextProgress.maxExp,
          });
          batch.update(doc(db, 'quests', quest.id, 'completions', sid), {
            rewarded: true, rewardedAt: serverTimestamp(), rewardedBy: 'teacher_ai_bulk',
          });
          // 학생 데이터 갱신 (다음 퀘스트에서 누적 계산용)
          studentMap[sid] = { ...student, gold: (student.gold||0)+(quest.rewards?.gold||0), diamonds: (student.diamonds||0)+(quest.rewards?.diamond||0), level: nextProgress.level, exp: nextProgress.exp };
          totalRewarded++;
          batchCount += 2; // student + completion 각 1건
          if (batchCount >= 480) {
            await batch.commit();
            batch = writeBatch(db); // 새 batch 생성
            batchCount = 0;
          }
        }
      }
      if (batchCount > 0) await batch.commit();
      showToast(totalRewarded > 0 ? `✅ ${totalRewarded}건 퀘스트 보상 지급 완료!` : '승인할 퀘스트가 없습니다.');
      const refreshedQuestStats = await fetchQuestStats(students.map(student => student.id));
      await fetchAiSummary(students, refreshedQuestStats);
    } catch (e) {
      console.error(e);
      showToast('퀘스트 일괄 승인 중 오류가 발생했습니다.', 'error');
    } finally { setApprovingQuests(false); }
  };

  // ── 배움노트 일괄 승인 ────────────────────────────────────────
  const approveAllNotes = async () => {
    const teacherUid = selectedClass?.teacherUid;
    if (!teacherUid || approvingNotes) return;
    const pending = aiSummary?.pendingNotes || 0;
    if (pending === 0) { showToast('승인 대기 중인 배움노트가 없습니다.'); return; }
    if (!window.confirm(`배움노트 승인 대기 ${pending}건을 모두 승인합니다.\n보상이 각 학생에게 자동 지급됩니다.`)) return;
    setApprovingNotes(true);
    let ok = 0;
    try {
      const notesSnap = await getDocs(query(
        collection(db, 'learningNotes'),
        where('teacherUid', '==', teacherUid),
        where('status', '==', 'pending'),
      ));
      const settSnap = await getDoc(doc(db, 'learningSettings', teacherUid));
      const settings = settSnap.exists() ? { rewardGold: 10, rewardDiamond: 10, rewardExp: 30, ...settSnap.data() } : { rewardGold: 10, rewardDiamond: 10, rewardExp: 30 };
      const getMaxExp = getMaxExpForLevel;
      const classStudentIds = new Set(students.map(student => student.id));

      for (const noteDoc of notesSnap.docs.filter(note => classStudentIds.has(note.data().studentId))) {
        const note = { id: noteDoc.id, ...noteDoc.data() };
        try {
          // 과목별 status 모두 approved로 업데이트
          const updatedSubjects = (note.subjects || []).map(s => ({ ...s, status: 'approved', rewardPaid: true }));
          await updateDoc(doc(db, 'learningNotes', note.id), {
            subjects: updatedSubjects, status: 'approved',
            approvedAt: serverTimestamp(), studentSeen: false, rewardPaid: true,
          });
          // 보상 지급
          const stuRef = doc(db, 'students', note.studentId);
          const stuSnap = await getDoc(stuRef);
          if (stuSnap.exists()) {
            const sd = stuSnap.data();
            const subjectCount = (note.subjects || []).length || note.subjectCount || 1;
            const rewardGold = settings.rewardGold    * subjectCount;
            const rewardDia  = settings.rewardDiamond * subjectCount;
            const rewardExp  = settings.rewardExp     * subjectCount;
            let newExp = (sd.exp || 0) + rewardExp;
            let newLv  = sd.level || 1;
            while (newExp >= getMaxExp(newLv)) { newExp -= getMaxExp(newLv); newLv++; }
            await updateDoc(stuRef, { gold: (sd.gold||0)+rewardGold, diamonds: (sd.diamonds||0)+rewardDia, exp: newExp, level: newLv });
          }
          ok++;
        } catch (e) { console.error(e); }
      }
      showToast(`✅ 배움노트 ${ok}건 승인 완료!`);
      await fetchAiSummary(students, questStats);
    } catch (e) {
      console.error(e);
      showToast('배움노트 일괄 승인 중 오류가 발생했습니다.', 'error');
    } finally { setApprovingNotes(false); }
  };

  // ── AI 요약 데이터 수집 ──────────────────────────────────────
  const fetchAiSummary = useCallback(async (currentStudents, currentQuestStats) => {
    const teacherUid = selectedClass?.teacherUid;
    if (!teacherUid) return;
    setAiLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);
      const weekTs = Timestamp.fromDate(weekStart);

      const [notesSnap, quizSnap] = await Promise.all([
        // 배움노트 pending 건수
        getDocs(query(
          collection(db, 'learningNotes'),
          where('teacherUid', '==', teacherUid),
          where('status', '==', 'pending')
        )),
        // 최근 7일 퀴즈 결과
        getDocs(query(
          collection(db, 'quizResults'),
          where('completedAt', '>=', weekTs)
        )),
      ]);

      const studentIds = new Set((currentStudents || []).map(s => s.id));

      // 퀴즈던전 참여 & 평균 정답률 (오늘 학급 학생만)
      const todayQuizResults = quizSnap.docs
        .map(d => d.data())
        .filter(r => studentIds.has(r.studentId) && toDate(r.completedAt) >= todayStart);
      const quizCount = todayQuizResults.length;
      const avgAccuracy = quizCount > 0
        ? Math.round(todayQuizResults.reduce((s, r) => s + (Number(r.accuracy) || 0), 0) / quizCount)
        : null;
      const weeklyQuizResults = quizSnap.docs
        .map(d => d.data())
        .filter(r => studentIds.has(r.studentId));
      const weeklyQuizStudentCount = new Set(weeklyQuizResults.map(result => result.studentId)).size;
      const weeklyAvgAccuracy = weeklyQuizResults.length > 0
        ? Math.round(weeklyQuizResults.reduce((sum, result) => sum + (Number(result.accuracy) || 0), 0) / weeklyQuizResults.length)
        : null;
      const weeklyActiveStudentCount = (currentStudents || []).filter(student => {
        const activeAt = toDate(student.lastActiveAt || student.lastLoginAt);
        return activeAt != null && activeAt >= weekStart;
      }).length;

      // 퀘스트 완료율 계산 (daily 퀘스트 기준)
      const dailyQuests = (currentQuestStats || []).filter(q => q.type === 'daily');
      const totalStu = (currentStudents || []).length || 1;
      const questRate = dailyQuests.length > 0
        ? Math.round(dailyQuests.reduce((s, q) => s + (q.checkedCount || 0), 0) / dailyQuests.length / totalStu * 100)
        : null;

      const pendingNotes = notesSnap.docs.filter(note => studentIds.has(note.data().studentId)).length;
      const pendingQuestRewards = (currentQuestStats || [])
        .reduce((sum, quest) => sum + (quest.pendingRewardCount || 0), 0);
      const todayDateKey = getKstDateKey();
      const inactiveStudentCount = (currentStudents || [])
        .filter(student => student.lastActiveDateKey !== todayDateKey && !isStudentActiveToday(student))
        .length;
      const activeQuestCount = (currentQuestStats || []).length;

      // 요약 텍스트 규칙 생성
      const summary = generateAiText({
        questRate,
        pendingNotes,
        pendingQuestRewards,
        inactiveStudentCount,
        totalStu,
        quizCount,
        avgAccuracy,
        dailyQuests,
      });

      setAiSummary({
        questRate,
        pendingNotes,
        pendingQuestRewards,
        inactiveStudentCount,
        activeQuestCount,
        quizCount,
        avgAccuracy,
        weeklyActiveStudentCount,
        weeklyQuizStudentCount,
        weeklyAvgAccuracy,
        showWeeklyReport: isKstMonday(),
        text: summary,
        refreshedAt: new Date(),
      });
    } catch (e) {
      console.error('AI 요약 fetch 실패:', e);
    } finally {
      setAiLoading(false);
    }
  }, [selectedClass]);

  const generateAiText = ({ questRate, pendingNotes, pendingQuestRewards, inactiveStudentCount, totalStu, quizCount, avgAccuracy, dailyQuests }) => {
    const parts = [];

    if (dailyQuests.length === 0) {
      parts.push('활성 퀘스트가 없습니다. 퀘스트 관리소에서 퀘스트를 만들어보세요.');
    } else if (questRate === null) {
      parts.push('퀘스트 현황을 불러오는 중입니다.');
    } else if (questRate >= 80) {
      parts.push(`오늘 퀘스트 참여율이 ${questRate}%로 높습니다. 활발한 하루입니다! 🎉`);
    } else if (questRate >= 50) {
      parts.push(`퀘스트 참여율은 ${questRate}%입니다. 아직 미완료 학생이 있으니 확인해보세요.`);
    } else if (questRate > 0) {
      parts.push(`퀘스트 참여율이 ${questRate}%로 낮습니다. 짧은 독려 공지나 보상 퀘스트를 활용해보세요.`);
    } else {
      parts.push('아직 퀘스트 체크인이 없습니다. 학생들에게 안내해보세요.');
    }

    if (pendingNotes > 0) {
      parts.push(`배움노트 승인 대기 ${pendingNotes}건이 있습니다. 확인 후 보상을 지급해주세요.`);
    }

    if (pendingQuestRewards > 0) {
      parts.push(`보상 지급을 기다리는 퀘스트 완료 기록이 ${pendingQuestRewards}건 있습니다.`);
    }

    if (inactiveStudentCount > 0 && inactiveStudentCount < totalStu) {
      parts.push(`오늘 아직 접속하지 않은 학생은 ${inactiveStudentCount}명입니다.`);
    }

    if (quizCount > 0 && avgAccuracy !== null) {
      if (avgAccuracy < 60) {
        parts.push(`퀴즈던전 평균 정답률이 ${avgAccuracy}%로 낮습니다. 오답 내용 복습을 권장합니다.`);
      } else {
        parts.push(`오늘 퀴즈던전에 ${quizCount}명이 참여했으며 평균 정답률은 ${avgAccuracy}%입니다.`);
      }
    }

    if (parts.length === 1 && questRate >= 80 && pendingNotes === 0) {
      return parts[0] + ' 보상 대기 항목도 없어 오늘 운영이 안정적입니다.';
    }

    return parts.join(' ');
  };

  const fetchStudents = async () => {
    setIsLoading(true);
    if (!selectedClass?.id && !selectedClass?.teacherUid) { setStudents([]); setIsLoading(false); return []; }
    try {
      const q = selectedClass.id
        ? query(collection(db, 'students'), where('classId',    '==', selectedClass.id))
        : query(collection(db, 'students'), where('teacherUid', '==', selectedClass.teacherUid));
      const querySnapshot = await getDocs(q);
      const studentList = [];
      querySnapshot.forEach((doc) => {
        studentList.push({ id: doc.id, ...doc.data() });
      });
      studentList.sort((a, b) => getSeatNum(a.studentCode) - getSeatNum(b.studentCode));
      setStudents(studentList);
      return studentList;
    } catch (error) {
      console.error("?숈깮 紐⑸줉 ?먮윭:", error);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQuestStats = async (classStudentIds = []) => {
    const teacherUid = selectedClass?.teacherUid;
    if (!teacherUid) return;
    try {
      // QuestManage? ?숈씪??諛⑹떇: ?꾩껜 議고쉶 ??硫붾え由??꾪꽣 (where ?몃뜳??臾몄젣 ?뚰뵾)
      const questsSnap = await getDocs(collection(db, 'quests'));
      const allQuests = questsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log('[Quest Debug] teacherUid:', teacherUid, '/ ?꾩껜 ?섏뒪????', allQuests.length);
      console.log('[Quest Debug] ?섑뵆:', allQuests.slice(0,3).map(q => ({ id: q.id, teacherUid: q.teacherUid, active: q.active, title: q.title })));
      const activeQuests = allQuests
        .filter(q =>
          (q.teacherUid === teacherUid || (!q.teacherUid && teacherUid === 'admin_master_001'))
          && q.active !== false
        )
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'daily' ? -1 : 1;
          return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        });

      const sqMap = {};
      const studentIdSet = new Set(classStudentIds);

      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);

      const stats = await Promise.all(
        activeQuests.map(async q => {
          const snap = await getDocs(collection(db, 'quests', q.id, 'completions'));
          let checkedCount = 0;
          let pendingRewardCount = 0;
          snap.docs.forEach(d => {
            const sid = d.id;
            if (!studentIdSet.has(sid)) return;
            const data = d.data();

            // ?쇱씪 諛섎났 ?섏뒪?몃뒗 ?ㅻ뒛 泥댄겕??寃껊쭔 移댁슫??(QuestManage? ?숈씪)
            let validCheck = data.checked === true;
            if (validCheck && q.repeatDaily) {
              const ts = data.checkedAt;
              const checkedAt = ts?.toDate?.() ?? (ts?.seconds ? new Date(ts.seconds * 1000) : null);
              validCheck = checkedAt != null && checkedAt >= todayMidnight;
            }

            if (validCheck) {
              checkedCount++;
              if (!data.rewarded) pendingRewardCount++;
            }
            if (q.type === 'daily') {
              if (!sqMap[sid]) sqMap[sid] = [];
              sqMap[sid].push({
                title:    q.title,
                checked:  validCheck,
                rewarded: data.rewarded || false,
              });
            }
          });
          return { ...q, checkedCount, pendingRewardCount };
        })
      );

      console.log('[Quest Debug] ?쒖꽦 ?섏뒪??', activeQuests.length, activeQuests.map(q => q.title));
      setQuestStats(stats);
      setStudentQuestMap(sqMap);
      return stats;
    } catch (err) {
      console.error('퀘스트 데이터 오류:', err);
      return [];
    }
  };

  const loadQuickSetupStatus = async (currentStudents = students) => {
    if (!selectedClass?.id) {
      setQuickSetupInfo(null);
      return;
    }
    try {
      const classSnap = await getDoc(doc(db, 'classes', selectedClass.id));
      if (!classSnap.exists()) {
        setQuickSetupInfo(null);
        return;
      }
      const data = classSnap.data() || {};
      setQuickSetupInfo({
        completed: data.quickSetupCompleted === true,
        version: Number(data.quickSetupVersion || 0),
        summary: data.quickSetupSummary || null,
        onboardingDismissed: data.onboardingChecklistDismissed === true,
        studentLoginDone: data.onboardingStudentAccountsViewed === true || (currentStudents || []).some(student =>
          student.lastActiveAt || student.lastLoginAt || student.lastActiveDateKey
        ),
        questViewed: data.onboardingQuestViewed === true,
        rewardGiven: data.onboardingRewardGiven === true,
      });
    } catch {
      setQuickSetupInfo(null);
    }
  };

  useEffect(() => {
    const load = async () => {
      const studentList = await fetchStudents();
      const questList = await fetchQuestStats(studentList.map(s => s.id));
      await loadQuickSetupStatus(studentList);
      await fetchAiSummary(studentList, questList);
    };
    load();
  }, [selectedClass]);

  const handleRunQuickSetup = async () => {
    if (!selectedClass?.id || isQuickSetupRunning) return;
    setIsQuickSetupRunning(true);
    try {
      const result = await applyClassQuickSetup(selectedClass);
      await loadQuickSetupStatus(students);
      if (result?.alreadyCompleted) {
        showToast('이미 기본 셋팅이 완료된 학급입니다.');
      } else {
        showToast('학급 기본 셋팅이 완료되었습니다.');
      }
    } catch (error) {
      showToast(error?.message || '기본 셋팅 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsQuickSetupRunning(false);
    }
  };

  const updateOnboardingStep = async (field, value = true) => {
    if (!selectedClass?.id) return;
    try {
      await updateDoc(doc(db, 'classes', selectedClass.id), { [field]: value });
      setQuickSetupInfo(prev => {
        if (!prev) return prev;
        if (field === 'onboardingQuestViewed') return { ...prev, questViewed: value };
        if (field === 'onboardingRewardGiven') return { ...prev, rewardGiven: value };
        if (field === 'onboardingStudentAccountsViewed') return { ...prev, studentLoginDone: value };
        if (field === 'onboardingChecklistDismissed') return { ...prev, onboardingDismissed: value };
        return prev;
      });
    } catch (error) {
      console.error('시작 체크리스트 저장 오류:', error);
    }
  };

  const openQuestFromOnboarding = async () => {
    await updateOnboardingStep('onboardingQuestViewed');
    window.dispatchEvent(new CustomEvent('teacher-nav', { detail: { view: 'questManage' } }));
  };

  const openModal = (mode) => {
    setModalMode(mode);
    setSelectedIds([]);
    setDiaAmount('');
    setGoldAmount('');
    setReason('');
    setSearchQuery('');
    setIsModalOpen(true);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(studentId => studentId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (filteredStudents) => {
    if (selectedIds.length === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedIds([]); 
    } else {
      setSelectedIds(filteredStudents.map(s => s.id)); 
    }
  };

  const addQuick = (field, val) => {
    if (field === 'dia')  setDiaAmount  (prev => (Number(prev  || 0) + val).toString());
    if (field === 'gold') setGoldAmount (prev => (Number(prev || 0) + val).toString());
  };

  const submitTransaction = async () => {
    if (selectedIds.length === 0) return showToast("학생을 최소 1명 이상 선택해주세요.", 'error');
    const diaAmt  = Number(diaAmount)  || 0;
    const goldAmt = Number(goldAmount) || 0;
    if (diaAmt === 0 && goldAmt === 0) return showToast("다이아 또는 골드 금액을 입력해주세요.", 'error');

    const isAdd = modalMode === 'add';
    setIsLoading(true);
    try {
      const batch = writeBatch(db);

      selectedIds.forEach(id => {
        const s = students.find(st => st.id === id);
        if (!s) return;
        const updates = {};
        if (diaAmt  > 0) updates.diamonds = Math.max(0, (s.diamonds || 0) + (isAdd ? diaAmt  : -diaAmt));
        if (goldAmt > 0) updates.gold     = Math.max(0, (s.gold     || 0) + (isAdd ? goldAmt : -goldAmt));
        batch.update(doc(db, "students", id), updates);
      });

      const logRef = doc(collection(db, "transactions"));
      batch.set(logRef, {
        timestamp:   serverTimestamp(),
        classId:     selectedClass?.id || null,
        teacherUid:  selectedClass?.teacherUid || null,
        mode:        modalMode,
        diaAmount:   isAdd ? diaAmt  : -diaAmt,
        goldAmount:  isAdd ? goldAmt : -goldAmt,
        reason:      reason.trim() || (isAdd ? '학생 보상 지급' : '학생 차감 집행'),
        targetCount: selectedIds.length,
        targetIds:   selectedIds,
      });

      await batch.commit();
      if (selectedClass?.id && isAdd) {
        await updateOnboardingStep('onboardingRewardGiven');
      }

      const parts = [];
      if (diaAmt  > 0) parts.push(`다이아 ${diaAmt.toLocaleString()}`);
      if (goldAmt > 0) parts.push(`골드 ${goldAmt.toLocaleString()}`);
      showToast(`${parts.join(', ')} ${isAdd ? '지급' : '차감'} 완료!`);
      setIsModalOpen(false);
      fetchStudents();
    } catch (error) {
      console.error("?몃옖??뀡 ?먮윭:", error);
      showToast("처리 중 오류가 발생했습니다.", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const q = query(collection(db, "transactions"), orderBy("timestamp", "desc"), limit(20));
      const querySnapshot = await getDocs(q);
      const logData = [];
      querySnapshot.forEach((doc) => {
        logData.push({ id: doc.id, ...doc.data() });
      });
      setLogs(logData);
      setIsLogOpen(true);
    } catch (error) {
      console.error("濡쒓렇 ?먮윭:", error);
    }
  };

  const filteredStudents = students.filter(s => s.studentCode.includes(searchQuery));
  const aiActionItems = aiSummary ? [
    aiSummary.pendingQuestRewards > 0 && {
      id: 'questRewards',
      tone: 'emerald',
      icon: '⚔️',
      title: `퀘스트 보상 ${aiSummary.pendingQuestRewards}건 지급 대기`,
      description: '완료 체크된 퀘스트 보상을 한 번에 지급할 수 있습니다.',
      label: '전체 승인',
      action: 'approveQuests',
    },
    aiSummary.pendingNotes > 0 && {
      id: 'pendingNotes',
      tone: 'amber',
      icon: '📚',
      title: `배움노트 ${aiSummary.pendingNotes}건 승인 대기`,
      description: '검토가 끝났다면 보상을 포함해 한 번에 승인할 수 있습니다.',
      label: '모두 승인',
      action: 'approveNotes',
    },
    aiSummary.activeQuestCount === 0 && {
      id: 'noQuests',
      tone: 'rose',
      icon: '📋',
      title: '현재 운영 중인 퀘스트가 없습니다',
      description: '추천 퀘스트를 추가하면 학생들이 바로 참여할 수 있습니다.',
      label: '퀘스트 만들기',
      view: 'questManage',
    },
    aiSummary.activeQuestCount > 0 && aiSummary.questRate !== null && aiSummary.questRate < 50 && {
      id: 'lowQuestRate',
      tone: 'rose',
      icon: '📣',
      title: `오늘 퀘스트 참여율 ${aiSummary.questRate}%`,
      description: '미완료 학생을 확인하거나 짧은 보상 퀘스트를 추가해보세요.',
      label: '퀘스트 확인',
      view: 'questManage',
    },
    aiSummary.inactiveStudentCount > 0 && students.length > 0 && {
      id: 'inactiveStudents',
      tone: 'sky',
      icon: '👥',
      title: `오늘 미접속 학생 ${aiSummary.inactiveStudentCount}명`,
      description: '학생별 최종 접속 시각을 바로 확인할 수 있습니다.',
      label: '접속 현황',
      action: 'showAccessStatus',
    },
  ].filter(Boolean).slice(0, 3) : [];

  const runAiAction = (item) => {
    if (item.action === 'approveQuests') {
      approveAllCheckedQuests();
      return;
    }
    if (item.action === 'approveNotes') {
      approveAllNotes();
      return;
    }
    if (item.action === 'showAccessStatus') {
      setIsAccessStatusOpen(true);
      return;
    }
    if (item.view) {
      window.dispatchEvent(new CustomEvent('teacher-nav', { detail: { view: item.view } }));
    }
  };
  const onboardingSteps = quickSetupInfo?.completed ? [
    {
      id: 'studentLogin',
      icon: '👥',
      title: '학생 접속 준비하기',
      description: quickSetupInfo.studentLoginDone
        ? '학생이 접속한 기록이 확인되었습니다.'
        : '학생 계정과 로그인 안내를 확인해 주세요.',
      done: quickSetupInfo.studentLoginDone,
      label: '학생 계정 보기',
      onClick: async () => {
        await updateOnboardingStep('onboardingStudentAccountsViewed');
        onGoAccountIssue?.();
      },
    },
    {
      id: 'questViewed',
      icon: '⚔️',
      title: '첫 퀘스트 확인하기',
      description: quickSetupInfo.questViewed
        ? '첫 퀘스트 운영 준비를 확인했습니다.'
        : '자동 생성된 추천 퀘스트를 확인해 주세요.',
      done: quickSetupInfo.questViewed,
      label: '퀘스트 확인',
      onClick: openQuestFromOnboarding,
    },
    {
      id: 'rewardGiven',
      icon: '🎁',
      title: '첫 보상 지급해 보기',
      description: quickSetupInfo.rewardGiven
        ? '학생 보상 지급을 완료했습니다.'
        : '학생을 선택해 첫 보상을 지급해 보세요.',
      done: quickSetupInfo.rewardGiven,
      label: '보상 지급',
      onClick: () => openModal('add'),
    },
  ] : [];
  const onboardingDoneCount = onboardingSteps.filter(step => step.done).length;
  const dashboardBg = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const mainSurface = 'dashboard-light-surface border-slate-200 bg-white text-slate-900 shadow-xl shadow-black/10';
  const mutedText = 'text-slate-600';

  return (
    <div className={`teacher-dashboard-page min-h-screen px-4 md:px-8 pt-5 pb-8 relative ${dashboardBg}`}>
      <div className={`mb-5 overflow-hidden rounded-2xl border p-6 shadow-xl ${
        isDark
          ? 'border-indigo-300/25 bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 text-white shadow-indigo-950/30'
          : 'border-indigo-100 bg-gradient-to-br from-white via-indigo-50 to-sky-50 text-slate-900'
      }`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
        <div>
          <div className={`mb-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${
            isDark ? 'bg-white/15 text-indigo-50' : 'bg-indigo-100 text-indigo-700'
          }`}>
            교사용 운영 홈
          </div>
          <h1 className={`text-4xl font-extrabold flex items-center ${isDark ? 'text-white' : 'text-slate-900'}`}>
            학급 전체 대시보드
          </h1>
          <p className={`mt-2 text-base font-semibold ${isDark ? 'text-indigo-50/90' : 'text-slate-600'}`}>
            새 학급은 아래 3단계만 끝내면 바로 운영을 시작할 수 있습니다.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {selectedClass?.teacherUid === 'admin_master_001' && (
            <button
              onClick={() => {
                setPreviewLevel(prev => prev + 1);
                setShowLevelUpPreview(true);
              }}
              className="flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500 text-amber-900 px-4 py-2 rounded-lg font-extrabold text-base shadow-sm transition-all border border-amber-300"
            >
              레벨업 효과 보기
            </button>
          )}
          <button onClick={async () => {
            const list = await fetchStudents();
            await fetchQuestStats(list.map(s => s.id));
          }} className="bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors text-base border border-white/20">
            새로고침
          </button>
          {onStudentTestLogin && (
            <button
              onClick={() => onStudentTestLogin('SINSEOK-5-15')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors text-base"
            >
              학생 테스트 (SINSEOK-5-15)
            </button>
          )}
          <button
            type="button"
            onClick={onOpenBossRaidDemo}
            className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors text-base"
          >
            보스레이드 발표 테스트
          </button>
          <a
            href="https://github.com/illyeong/level-up-class/releases/download/v1.0.0/LevelUpTeacherWidgetSetup.exe"
            target="_blank"
            rel="noreferrer"
            className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors text-base"
            title="교사용 바탕화면 미니 위젯을 설치합니다."
          >
            교사용 위젯 설치하기
          </a>
          <button onClick={fetchLogs} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors text-base">
            지급/차감 내역 보기
          </button>
          <button onClick={() => openModal('add')}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-base shadow-sm transition-colors">
            지급하기
          </button>
          <button onClick={() => openModal('sub')}
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg font-bold text-base shadow-sm transition-colors">
            차감하기
          </button>
        </div>
        </div>
      </div>

      {quickSetupInfo && !quickSetupInfo.completed && (
        <div className={`mb-5 rounded-2xl border p-5 ${mainSurface}`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">학급 기본 셋팅</h2>
              <p className={`text-base mt-1 ${mutedText}`}>
                추천 퀘스트와 퀴즈던전 등 학급 운영에 필요한 기본 셋팅을 생성합니다.
              </p>
            </div>
            <div className="flex gap-2">
<button
                onClick={handleRunQuickSetup}
                disabled={isQuickSetupRunning}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base disabled:opacity-50">
                {isQuickSetupRunning ? '적용 중...' : '기본 셋팅 실행'}
              </button>
            </div>
          </div>
        </div>
      )}

      {quickSetupInfo?.completed && !quickSetupInfo.onboardingDismissed && onboardingDoneCount < onboardingSteps.length && (
        <div className={`mb-5 overflow-hidden rounded-2xl border shadow-xl ${
          isDark
            ? 'border-slate-700 bg-slate-900 text-slate-100 shadow-black/30'
            : 'dashboard-light-surface border-indigo-200 bg-white text-slate-900 shadow-black/10'
        }`}>
          <div className={`flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
            isDark
              ? 'border-slate-700 bg-slate-800/80'
              : 'border-indigo-100 bg-gradient-to-r from-indigo-50 to-sky-50'
          }`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🚀</span>
                <h2 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>이번 주 시작하기</h2>
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[12px] font-extrabold text-white">
                  {onboardingDoneCount} / {onboardingSteps.length}
                </span>
              </div>
              <p className={`mt-1 text-sm font-semibold ${isDark ? 'text-slate-300' : mutedText}`}>
                아래 세 가지만 완료하면 기본 학급 운영 준비가 끝납니다.
              </p>
            </div>
            <div className="flex items-center gap-1 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('teacher-nav', { detail: { view: 'systemSettings' } }))}
                className={`rounded-xl border px-3.5 py-2 text-sm font-extrabold shadow-sm transition-colors ${
                  isDark
                    ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-100 hover:border-indigo-300 hover:bg-indigo-500/25'
                    : 'border-indigo-200 bg-white text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100'
                }`}
              >
                더 많은 기능 둘러보기 →
              </button>
              <button
                type="button"
                onClick={() => updateOnboardingStep('onboardingChecklistDismissed')}
                className={`rounded-lg px-2.5 py-1.5 text-sm font-bold transition-colors ${
                  isDark
                    ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-100'
                    : 'text-slate-400 hover:bg-white hover:text-slate-600'
                }`}
              >
                숨기기
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-3">
            {onboardingSteps.map(step => (
              <div
                key={step.id}
                className={`rounded-xl border p-4 transition-colors ${
                  step.done
                    ? isDark
                      ? 'border-emerald-400/35 bg-emerald-500/10'
                      : 'border-emerald-200 bg-emerald-50'
                    : isDark
                      ? 'border-slate-700 bg-slate-950/60'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${
                    step.done
                      ? 'bg-emerald-500 text-white'
                      : isDark ? 'bg-indigo-500/20 text-indigo-100' : 'bg-indigo-50'
                  }`}>
                    {step.done ? '✓' : step.icon}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-base font-extrabold ${
                      step.done
                        ? isDark ? 'text-emerald-200' : 'text-emerald-800'
                        : isDark ? 'text-slate-100' : 'text-slate-800'
                    }`}>
                      {step.title}
                    </div>
                    <p className={`mt-1 text-sm leading-relaxed ${isDark ? 'text-slate-300' : mutedText}`}>{step.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={step.onClick}
                  className={`mt-3 w-full rounded-lg border px-3 py-2 text-sm font-extrabold transition-colors ${
                    step.done
                      ? isDark
                        ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25'
                        : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100'
                      : isDark
                        ? 'border-indigo-400/40 bg-indigo-600 text-white hover:bg-indigo-500'
                        : 'border-indigo-200 bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {step.done ? '다시 보기' : step.label} →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!extensionBannerHidden && (
        <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-violet-300 bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-700 p-5 text-white shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-violet-200">LEVELUP CLASS 확장 기능</div>
              <h2 className="mt-1 text-xl font-extrabold">운영 모드를 선택해 필요한 기능만 켜두세요.</h2>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-violet-100/90">
                처음에는 퀘스트·보상만, 익숙해지면 어드벤처·경제·AI 학습 기능을 단계적으로 확장할 수 있습니다.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={() => setExtensionBannerHidden(true)}
                className="text-xs font-bold text-violet-200 hover:text-white transition-colors"
              >
                숨기기
              </button>
              <button
                type="button"
                onClick={() => { localStorage.setItem('extensionBannerNeverShow', '1'); setExtensionBannerHidden(true); }}
                className="text-xs font-bold text-violet-300/70 hover:text-violet-100 transition-colors"
              >
                다시 보지 않기
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {Object.entries(OPERATION_MODE_PRESETS).map(([mode, preset]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onApplyOperationMode?.(mode)}
                className={`rounded-xl border p-3 text-left transition ${
                  operationMode === mode
                    ? 'border-white bg-white/25 ring-2 ring-white/40 shadow-sm'
                    : 'border-white/25 bg-white/10 hover:bg-white/20'
                }`}
              >
                <div className="text-base font-extrabold text-white">{preset.title}</div>
                <div className="mt-0.5 text-[12px] font-semibold leading-relaxed text-violet-100/80">{preset.description}</div>
                {operationMode === mode && (
                  <div className="mt-1.5 text-[12px] font-extrabold text-white/80">✓ 현재 모드</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── AI 오늘의 운영 요약 ── */}
      <div className="mb-4">
        <div className="dashboard-light-surface rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl shadow-black/10 overflow-hidden">
          {/* 헤더 */}
          <div className={`px-5 py-4 flex items-center justify-between border-b ${
            isDark
              ? 'border-slate-700 bg-slate-800 text-slate-100'
              : 'border-slate-200 bg-gradient-to-r from-indigo-50 to-sky-50'
          }`}>
            <div className="flex items-center gap-2.5">
              <span className={`flex items-center justify-center w-8 h-8 rounded-xl text-xl ${
                isDark ? 'bg-indigo-500/20 ring-1 ring-indigo-300/25' : 'bg-indigo-100'
              }`}>✨</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`font-extrabold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>AI 오늘의 운영 요약</span>
                  <span className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">BETA</span>
                </div>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>오늘 학급 운영에서 확인하면 좋은 내용을 정리해드립니다.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchAiSummary(students, questStats)}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
              >
                {aiLoading ? (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : '↻'}
                새로고침
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiSummaryExpanded(prev => {
                    const next = !prev;
                    localStorage.setItem('aiSummaryCollapsed', next ? '0' : '1');
                    return next;
                  });
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                  isDark
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-100'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {aiSummaryExpanded ? '접기 ▲' : '펼치기 ▼'}
              </button>
            </div>
          </div>

          {/* 본문 */}
          {aiSummaryExpanded && (
          <div className="px-5 py-4">
            {aiLoading && !aiSummary ? (
              <div className="flex items-center gap-2 text-indigo-700 text-base py-2">
                <span className="inline-block w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                분석 중...
              </div>
            ) : aiSummary ? (
              <>
                {/* 요약 텍스트 */}
                <p className="text-slate-800 text-base font-semibold leading-relaxed mb-4">{aiSummary.text}</p>

                {/* 지금 처리하면 좋은 항목 */}
                {aiActionItems.length > 0 ? (
                  <div className="mb-4">
                    <div className="text-xs font-extrabold text-indigo-700 mb-2">지금 처리하면 좋은 항목</div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                      {aiActionItems.map(item => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2 text-slate-800"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-xl leading-none">{item.icon}</span>
                            <div className="min-w-0">
                              <div className="text-sm font-extrabold leading-snug">{item.title}</div>
                              <p className="text-[12px] leading-relaxed opacity-75 mt-1">{item.description}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => runAiAction(item)}
                            disabled={(item.action === 'approveQuests' && approvingQuests) || (item.action === 'approveNotes' && approvingNotes)}
                            className="mt-auto w-full rounded-lg border border-indigo-200 bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-extrabold text-white transition-colors disabled:opacity-50"
                          >
                            {item.label} →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2 text-emerald-800">
                    <span className="text-lg">✓</span>
                    <div>
                      <div className="text-sm font-extrabold">지금 바로 처리할 항목이 없습니다.</div>
                      <p className="text-[12px] text-emerald-700 mt-0.5">오늘 학급 운영 상태가 안정적입니다.</p>
                    </div>
                  </div>
                )}

                {aiSummary.showWeeklyReport && (
                  <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📊</span>
                          <div className="text-sm font-extrabold text-violet-800">지난 7일 운영 리포트</div>
                        </div>
                        <p className="mt-1 text-[12px] font-semibold text-violet-700">월요일마다 지난주 핵심 활동을 간단히 정리합니다.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsAccessStatusOpen(true)}
                        className="self-start rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-[12px] font-extrabold text-violet-700 shadow-sm hover:bg-violet-100"
                      >
                        접속 현황 보기 →
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                      {[
                        { label: '접속 학생', value: `${aiSummary.weeklyActiveStudentCount} / ${students.length}명` },
                        { label: '퀴즈 참여 학생', value: `${aiSummary.weeklyQuizStudentCount}명` },
                        { label: '퀴즈 평균 정답률', value: aiSummary.weeklyAvgAccuracy !== null ? `${aiSummary.weeklyAvgAccuracy}%` : '-' },
                        { label: '현재 승인 대기', value: `${aiSummary.pendingNotes + aiSummary.pendingQuestRewards}건` },
                      ].map(item => (
                        <div key={item.label} className="rounded-lg border border-violet-100 bg-white px-3 py-2.5 shadow-sm">
                          <div className="text-base font-extrabold text-slate-900">{item.value}</div>
                          <div className="mt-0.5 text-[12px] font-semibold text-violet-700">{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 지표 칩 + 빠른 승인 버튼 */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {aiSummary.questRate !== null && (
                    <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold
                      ${aiSummary.questRate >= 70 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : aiSummary.questRate >= 40 ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                      ⚔️ 퀘스트 완료율 {aiSummary.questRate}%
                    </span>
                  )}
                  {aiSummary.pendingNotes > 0 && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-sm font-bold text-amber-700">
                      📚 승인 대기 {aiSummary.pendingNotes}건
                    </span>
                  )}
                  {aiSummary.pendingQuestRewards > 0 && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700">
                      🎁 퀘스트 보상 대기 {aiSummary.pendingQuestRewards}건
                    </span>
                  )}
                  {aiSummary.inactiveStudentCount > 0 && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-sky-200 bg-sky-50 text-sm font-bold text-sky-700">
                      👥 오늘 미접속 {aiSummary.inactiveStudentCount}명
                    </span>
                  )}
                  {aiSummary.quizCount > 0 && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-700">
                      🧩 퀴즈 참여 {aiSummary.quizCount}명
                      {aiSummary.avgAccuracy !== null && ` · 정답률 ${aiSummary.avgAccuracy}%`}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-slate-500 text-base py-2">데이터를 불러오려면 새로고침을 눌러주세요.</p>
            )}

            {/* 액션 버튼 */}
            <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-200">
              {[
                { label: '⚔️ 퀘스트 확인', view: 'questManage' },
                { label: '📚 배움노트 승인', view: 'learningNoteManage' },
                { label: '🛒 상점 관리', view: 'classShopManage' },
                { label: '👥 접속 현황', action: 'showAccessStatus' },
              ].map(({ label, view, action }) => (
                <button
                  key={view || action}
                  onClick={() => {
                    if (action === 'showAccessStatus') {
                      setIsAccessStatusOpen(true);
                      return;
                    }
                    window.dispatchEvent(new CustomEvent('teacher-nav', { detail: { view } }));
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-sm font-bold transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>

            {aiSummary?.refreshedAt && (
              <p className="text-slate-400 text-[12px] mt-2 text-right">
                {aiSummary.refreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준
              </p>
            )}
          </div>
          )}
        </div>
      </div>

      {/* ── AI 코스웨어 현황 카드 ── */}
      <AICoursewareCard teacherUid={selectedClass?.teacherUid} onNavigate={(view) => window.dispatchEvent(new CustomEvent('teacher-nav', { detail: { view } }))} />

      {/* 퀘스트 현황 */}
      <div className="dashboard-light-surface mb-5 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl shadow-black/10">
        <div className="flex items-center gap-2 mb-3">
          <img src={iconQuest} alt="퀘스트" className="w-6 h-6 object-contain" />
          <h2 className="font-extrabold text-slate-900 text-lg">오늘의 퀘스트 현황</h2>
          <span className={`text-sm font-bold ${mutedText}`}>
            학생들이 자체체크를 하면 매일 자정에 퀘스트가 초기화되면서 보상이 자동지급됩니다.
          </span>
        </div>
        {questStats.length === 0 ? (
          <div className="text-base py-4 px-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 font-bold text-slate-500">
            활성 퀘스트가 없습니다. 퀘스트 관리소에서 퀘스트를 만들어보세요!
          </div>
        ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {questStats.map(quest => {
              const total = students.length || 1;
              const pct = Math.round((quest.checkedCount / total) * 100);
              const isDaily = quest.type === 'daily';
              return (
                <div key={quest.id}
                  className={`shrink-0 w-52 rounded-2xl shadow-sm border-2 overflow-hidden ${
                    isDark
                      ? isDaily
                        ? 'border-sky-500/45 bg-slate-900'
                        : 'border-violet-500/45 bg-slate-900'
                      : isDaily
                        ? 'border-sky-200 bg-gradient-to-b from-sky-50 to-white'
                        : 'border-violet-200 bg-gradient-to-b from-violet-50 to-white'
                  }`}>
                  {/* ?곷떒 ?????*/}
                  <div className={`px-3 py-1.5 text-[12px] font-extrabold tracking-wide
                    ${isDaily ? 'bg-sky-500 text-white' : 'bg-violet-500 text-white'}`}>
                    {isDaily ? '일일 퀘스트' : '주간 퀘스트'}
                  </div>
                  <div className="p-3">
                    <div className={`font-extrabold text-base mb-2 leading-tight truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                      {quest.title}
                    </div>
                    {/* 吏꾪뻾瑜?*/}
                    <div className="flex justify-between text-sm font-bold mb-1">
                      <span className={isDaily ? 'text-sky-400' : 'text-violet-400'}>
                        {quest.checkedCount}명 / {students.length}명
                      </span>
                      <span className={`font-extrabold ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>{pct}%</span>
                    </div>
                    <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                      <div
                        className={`h-full rounded-full transition-all
                          ${isDaily
                            ? 'bg-gradient-to-r from-sky-400 to-sky-600'
                            : 'bg-gradient-to-r from-violet-400 to-violet-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white">학생 현황</h2>
          <p className="mt-1 text-sm font-semibold text-slate-400">캐릭터, 레벨, 학급 재화를 한눈에 확인합니다.</p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-slate-200">{students.length}명</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {students.map((student) => {
          const cosmeticStyles = getEffectiveCosmeticStyles(student);
          const hallBadgeText = getHallOfFameBadgeText(student);
          return (
          <div
            key={student.id}
            className={`rounded-xl overflow-hidden transition-shadow relative ${
              isDark
                ? 'border border-slate-700 bg-slate-900 shadow-lg shadow-black/20 hover:border-indigo-400/60'
                : 'border border-slate-200 bg-white shadow-sm hover:shadow-md'
            }`}
          >
            {/* ?쇱씪?섏뒪???꾨즺 ?꾪솴 */}
            {(() => {
              const qs = studentQuestMap[student.id] || [];
              if (qs.length === 0) return null;
              const done = qs.filter(q => q.checked).length;
              return (
                <div className={`px-2.5 py-1.5 flex items-center justify-between gap-1 border-b
                  ${isDark
                    ? done === qs.length
                      ? 'border-emerald-400/30 bg-emerald-950/70'
                      : 'border-slate-600 bg-slate-800/95'
                    : done === qs.length
                      ? 'bg-emerald-50 border-emerald-100'
                      : 'bg-slate-50 border-slate-100'}`}>
                  <div className="flex gap-1 flex-wrap">
                    {qs.filter(q => q.checked).map((q, i) => (
                      <span key={i} title={q.title}
                        className={`text-[12px] font-bold px-1.5 py-0.5 rounded-full truncate max-w-[80px]
                          ${isDark
                            ? q.rewarded
                              ? 'bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/35'
                              : 'bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/35'
                            : q.rewarded
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'}`}>
                        {q.title.length > 6 ? `${q.title.slice(0, 6)}...` : q.title}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div
              className={`h-36 flex items-center justify-center border-b relative overflow-hidden ${
                isDark
                  ? 'border-slate-700 bg-gradient-to-b from-sky-50 via-white to-indigo-50'
                  : 'border-slate-100 bg-gradient-to-b from-slate-50 to-white'
              }`}
              style={{ ...cosmeticStyles.background.style, ...cosmeticStyles.frame.style }}
            >
              {hallBadgeText && (
                <div className="absolute top-2 right-2 z-20 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 px-2.5 py-1 text-[12px] font-black text-amber-950 shadow-lg ring-2 ring-white/90">
                  {hallBadgeText}
                </div>
              )}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-indigo-300/25 blur-2xl" />
              </div>
              {cosmeticStyles.background.floorStyle && (
                <div
                  className="pointer-events-none absolute left-1/2 bottom-6 -translate-x-1/2 w-28 h-6 rounded-full"
                  style={cosmeticStyles.background.floorStyle}
                />
              )}
              {student.characterImage ? (
                <img
                  src={student.characterImage}
                  alt="캐릭터"
                  className="relative z-10 h-full w-full object-contain scale-[2.5] drop-shadow-sm"
                  onError={e => { e.target.style.display = 'none'; }}
                />
              ) : student.parts ? (
                <span className="relative z-10 text-6xl drop-shadow-sm">👤</span>
              ) : (
                <span className="relative z-10 text-6xl drop-shadow-sm opacity-30">?쭕</span>
              )}
              <div className="absolute top-2 left-2 bg-slate-800 text-white text-[12px] font-bold px-2 py-0.5 rounded shadow-sm">
                {getSeatNum(student.studentCode)}번
              </div>
              <div className="absolute bottom-2 right-2 bg-amber-400 text-amber-900 text-[12px] font-black px-2 py-0.5 rounded-full shadow-sm">
                LV.{student.level || 1}
              </div>
            </div>
            <div className="p-3 text-center">
              <h3 className={`text-base font-bold mb-1 truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                {student.name || student.studentCode}
              </h3>
              {student.name && (
                <div className={`text-[12px] font-mono truncate mb-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{student.studentCode}</div>
              )}
              <div className="flex flex-col gap-1 text-sm">
                <div className={`flex justify-between items-center px-2 py-1.5 rounded-md ${
                  isDark ? 'bg-indigo-500/15' : 'bg-indigo-50'
                }`}>
                  <div className="flex items-center gap-1">
                    <img src={iconDiamond} alt="Diamond" className="w-3 h-3" />
                    <span className="text-[12px] text-indigo-400">다이아</span>
                  </div>
                  <span className={`font-bold ${isDark ? 'text-indigo-200' : 'text-indigo-700'}`}>{(student.diamonds || 0).toLocaleString()}</span>
                </div>
                <div className={`flex justify-between items-center px-2 py-1.5 rounded-md ${
                  isDark ? 'bg-amber-500/15' : 'bg-amber-50'
                }`}>
                  <div className="flex items-center gap-1">
                    <img src={iconGold} alt="Gold" className="w-3 h-3" />
                    <span className="text-[12px] text-amber-500">골드</span>
                  </div>
                  <span className={`font-bold ${isDark ? 'text-amber-200' : 'text-amber-600'}`}>{(student.gold || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {isAccessStatusOpen && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">학생 접속 현황</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">오늘 접속 여부와 학생별 최종 접속 시각입니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAccessStatusOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-2xl font-bold text-slate-500 hover:bg-slate-200"
                aria-label="접속 현황 닫기"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
              <div className="rounded-xl bg-emerald-50 px-4 py-3">
                <div className="text-xl font-extrabold text-emerald-700">
                  {students.filter(isStudentActiveToday).length}명
                </div>
                <div className="text-xs font-bold text-emerald-600">오늘 접속</div>
              </div>
              <div className="rounded-xl bg-sky-50 px-4 py-3">
                <div className="text-xl font-extrabold text-sky-700">
                  {students.filter(student => !isStudentActiveToday(student)).length}명
                </div>
                <div className="text-xs font-bold text-sky-600">오늘 미접속</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {[...students].sort((a, b) => getSeatNum(a.studentCode) - getSeatNum(b.studentCode)).map(student => {
                const accessedToday = isStudentActiveToday(student);
                return (
                  <div key={student.id} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-slate-50">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accessedToday ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-extrabold text-slate-800">
                        {getSeatNum(student.studentCode)}번 {student.name || student.studentCode}
                      </div>
                      <div className="truncate text-[12px] font-semibold text-slate-400">{student.studentCode}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`text-xs font-extrabold ${accessedToday ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {accessedToday ? '오늘 접속' : '미접속'}
                      </div>
                      <div className="mt-0.5 text-[12px] font-semibold text-slate-400">최종 접속 {formatLastAccess(student)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className={`p-5 text-white font-bold text-2xl flex justify-between items-center
              ${modalMode === 'add' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              <h2 className="flex items-center gap-2">
                {modalMode === 'add' ? '일괄 지급' : '일괄 차감'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-white hover:text-white/70">×</button>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
              <div className="flex-1 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col bg-slate-50">
                <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="selectAll" className="w-5 h-5 rounded text-indigo-600 cursor-pointer"
                      checked={selectedIds.length === filteredStudents.length && filteredStudents.length > 0}
                      onChange={() => toggleSelectAll(filteredStudents)} />
                    <label htmlFor="selectAll" className="font-bold text-slate-700 cursor-pointer text-base">전체 선택</label>
                  </div>
                  <input type="text" placeholder="이름/코드 검색" className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:border-indigo-500"
                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredStudents.map(student => (
                    <div key={student.id} onClick={() => toggleSelect(student.id)}
                      className={`flex items-center p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedIds.includes(student.id) ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-slate-200 bg-white hover:border-indigo-300'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="font-extrabold text-base text-slate-800 truncate">
                          {getSeatNum(student.studentCode)}번 {student.name || ''}
                        </div>
                        <div className="font-mono text-[12px] text-slate-400 truncate">{student.studentCode}</div>
                        <div className="text-[12px] text-slate-500 flex items-center gap-1 mt-1">
                          <img src={iconDiamond} alt="다이아" className="w-3 h-3" /> {student.diamonds || 0}
                          <img src={iconGold} alt="골드" className="w-3 h-3 ml-1" /> {student.gold || 0}
                        </div>
                      </div>
                      {selectedIds.includes(student.id) && (
                        <span className="text-indigo-500 text-lg ml-1 shrink-0">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full lg:w-80 p-5 bg-white flex flex-col overflow-y-auto gap-4">
                {/* ?좏깮 ?몄썝 */}
                <div className="p-3 bg-slate-50 rounded-xl text-center border border-slate-200">
                  <span className="text-slate-500 text-sm font-medium">선택한 학생</span>
                  <div className="text-4xl font-black text-indigo-600 my-0.5">{selectedIds.length} <span className="text-xl text-slate-700">명</span></div>
                </div>

                {/* ?뭿 ?ㅼ씠??*/}
                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <label className="flex items-center gap-1.5 text-sm font-bold text-indigo-700 mb-2">
                    <img src={iconDiamond} className="w-4 h-4" alt="다이아" /> 다이아 금액
                  </label>
                  <input
                    type="number" min="0" value={diaAmount}
                    onChange={e => setDiaAmount(e.target.value)}
                    className="w-full border-2 border-indigo-200 rounded-xl px-4 py-2.5 font-bold text-xl text-slate-800 focus:outline-none focus:border-indigo-500 bg-white mb-2"
                    placeholder="0" />
                  <div className="flex gap-1.5">
                    {[10, 50, 100, 500].map(v => (
                      <button key={v} onClick={() => addQuick('dia', v)}
                        className="flex-1 bg-white hover:bg-indigo-100 text-indigo-600 font-bold py-1.5 rounded-lg text-sm border border-indigo-200 transition-colors">
                        +{v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ?첌 怨⑤뱶 */}
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                  <label className="flex items-center gap-1.5 text-sm font-bold text-amber-700 mb-2">
                    <img src={iconGold} className="w-4 h-4" alt="골드" /> 골드 금액
                  </label>
                  <input
                    type="number" min="0" value={goldAmount}
                    onChange={e => setGoldAmount(e.target.value)}
                    className="w-full border-2 border-amber-200 rounded-xl px-4 py-2.5 font-bold text-xl text-slate-800 focus:outline-none focus:border-amber-500 bg-white mb-2"
                    placeholder="0" />
                  <div className="flex gap-1.5">
                    {[50, 100, 300, 500].map(v => (
                      <button key={v} onClick={() => addQuick('gold', v)}
                        className="flex-1 bg-white hover:bg-amber-100 text-amber-600 font-bold py-1.5 rounded-lg text-sm border border-amber-200 transition-colors">
                        +{v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ?ъ쑀 */}
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">사유 (선택)</label>
                  <textarea value={reason} onChange={e => setReason(e.target.value)}
                    className="w-full h-16 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                    placeholder="비워두셔도 됩니다." />
                </div>

                <button onClick={submitTransaction}
                  className={`w-full py-4 rounded-xl font-bold text-xl text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]
                    ${modalMode === 'add' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                  {modalMode === 'add' ? '지급 실행하기' : '차감 실행하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLogOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden">
            <div className="p-5 bg-slate-800 text-white font-bold text-2xl flex justify-between items-center">
              <h2>최근 지급/차감 내역</h2>
              <button onClick={() => setIsLogOpen(false)} className="text-slate-300 hover:text-white">×</button>
            </div>
            <div className="p-0 overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="p-4 font-semibold">일시</th>
                    <th className="p-4 font-semibold">구분</th>
                    <th className="p-4 font-semibold">내용</th>
                    <th className="p-4 font-semibold">사유</th>
                    <th className="p-4 font-semibold">대상</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    // ?좉퇋 ?щ㎎ (diaAmount/goldAmount) & 援ы삎 ?щ㎎ (currency/amount) 紐⑤몢 吏??
                    const isAdd = log.mode === 'add' || (log.amount > 0);
                    const parts = [];
                    if (log.diaAmount  !== undefined && log.diaAmount  !== 0)
                      parts.push(`다이아 ${log.diaAmount  > 0 ? '+' : ''}${log.diaAmount.toLocaleString()}`);
                    if (log.goldAmount !== undefined && log.goldAmount !== 0)
                      parts.push(`골드 ${log.goldAmount > 0 ? '+' : ''}${log.goldAmount.toLocaleString()}`);
                    // 援ы삎 ?щ㎎ fallback
                    if (parts.length === 0 && log.currency) {
                      const sign = log.amount > 0 ? '+' : '';
                      parts.push(`${log.currency === 'diamond' || log.currency === '다이아' ? '다이아' : '골드'} ${sign}${(log.amount || 0).toLocaleString()}`);
                    }
                    return (
                      <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-4 text-slate-500 whitespace-nowrap">
                          {log.timestamp ? new Date(log.timestamp.toDate()).toLocaleString('ko-KR') : '방금 전'}
                        </td>
                        <td className="p-4">
                          <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${isAdd ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                            {isAdd ? '지급' : '차감'}
                          </span>
                        </td>
                        <td className={`p-4 font-bold ${isAdd ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {parts.join('  ')}
                        </td>
                        <td className="p-4 text-slate-700">{log.reason}</td>
                        <td className="p-4 font-medium text-slate-600">{log.targetCount}명</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showLevelUpPreview && (
        <LevelUpEffect
          prevLevel={previewLevel - 1}
          newLevel={previewLevel}
          characterImage={null}
          onClose={() => setShowLevelUpPreview(false)}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-base shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default TeacherDashboard;





