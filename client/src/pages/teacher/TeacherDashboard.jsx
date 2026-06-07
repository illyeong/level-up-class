import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, getDoc, updateDoc, writeBatch, serverTimestamp, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import LevelUpEffect from '../../components/LevelUpEffect';
import { applyClassQuickSetup, QUICK_SETUP_VERSION } from '../../utils/classQuickSetup';
import { applyExpDelta, getMaxExpForLevel } from '../../utils/leveling';
import { getEffectiveCosmeticStyles, getHallOfFameBadgeText } from '../../data/avatarCosmetics';

import iconGold from '../../assets/images/icon-gold.png';
import iconDiamond from '../../assets/images/icon-diamond.png';
import iconQuest from '../../assets/images/icon-quest.png';

const getSeatNum = (code) => parseInt(code?.slice(-2)) || 0;

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
    <div className="mb-6">
      <div className="rounded-2xl border border-violet-800/40 bg-gradient-to-br from-violet-950/80 via-slate-900 to-slate-900 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🤖</span>
            <span className="text-white font-extrabold text-sm">AI 코스웨어 현황</span>
          </div>
          <button onClick={() => onNavigate?.('aiCourseware')}
            className="text-[11px] font-bold text-violet-300 hover:text-white border border-violet-600/50 px-2.5 py-1 rounded-lg hover:bg-violet-500/20 transition-colors">
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
              <div className={`text-lg font-extrabold ${color}`}>{value}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeacherDashboard({ selectedClass, onGoAccountIssue }) {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [questStats, setQuestStats] = useState([]);
  const [toast, setToast] = useState(null);
  const [showLevelUpPreview, setShowLevelUpPreview] = useState(false);
  const [previewLevel, setPreviewLevel] = useState(9);
  const onStudentTestLogin = null;

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
  const [showQrPrintGuide, setShowQrPrintGuide] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [approvingQuests, setApprovingQuests] = useState(false);
  const [approvingNotes,  setApprovingNotes]  = useState(false);

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
      await fetchAiSummary(students, questStats);
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

      for (const noteDoc of notesSnap.docs) {
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
      const todayTs = Timestamp.fromDate(todayStart);

      const [notesSnap, txSnap, quizSnap] = await Promise.all([
        // 배움노트 pending 건수
        getDocs(query(
          collection(db, 'learningNotes'),
          where('teacherUid', '==', teacherUid),
          where('status', '==', 'pending')
        )),
        // 오늘 재화 거래 내역
        getDocs(query(
          collection(db, 'transactions'),
          where('timestamp', '>=', todayTs)
        )),
        // 오늘 퀴즈 결과
        getDocs(query(
          collection(db, 'quizResults'),
          where('completedAt', '>=', todayTs)
        )),
      ]);

      // 오늘 골드 지급/소비 합산
      let goldIssued = 0, goldConsumed = 0;
      txSnap.docs.forEach(d => {
        const t = d.data();
        const g = Number(t.goldAmount || 0);
        if (g > 0) goldIssued += g * (t.targetCount || 1);
        else if (g < 0) goldConsumed += Math.abs(g) * (t.targetCount || 1);
      });

      // 퀴즈던전 참여 & 평균 정답률 (오늘 학급 학생만)
      const studentIds = new Set((currentStudents || []).map(s => s.id));
      const todayQuizResults = quizSnap.docs
        .map(d => d.data())
        .filter(r => studentIds.has(r.studentId));
      const quizCount = todayQuizResults.length;
      const avgAccuracy = quizCount > 0
        ? Math.round(todayQuizResults.reduce((s, r) => s + (Number(r.accuracy) || 0), 0) / quizCount)
        : null;

      // 퀘스트 완료율 계산 (daily 퀘스트 기준)
      const dailyQuests = (currentQuestStats || []).filter(q => q.type === 'daily');
      const totalStu = (currentStudents || []).length || 1;
      const questRate = dailyQuests.length > 0
        ? Math.round(dailyQuests.reduce((s, q) => s + (q.checkedCount || 0), 0) / dailyQuests.length / totalStu * 100)
        : null;

      const pendingNotes = notesSnap.size;

      // 요약 텍스트 규칙 생성
      const summary = generateAiText({ questRate, pendingNotes, goldIssued, goldConsumed, totalStu, quizCount, avgAccuracy, dailyQuests });

      setAiSummary({ questRate, pendingNotes, goldIssued, goldConsumed, quizCount, avgAccuracy, text: summary, refreshedAt: new Date() });
    } catch (e) {
      console.error('AI 요약 fetch 실패:', e);
    } finally {
      setAiLoading(false);
    }
  }, [selectedClass]);

  const generateAiText = ({ questRate, pendingNotes, goldIssued, goldConsumed, totalStu, quizCount, avgAccuracy, dailyQuests }) => {
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

    if (goldIssued > 0 && goldConsumed < goldIssued * 0.25) {
      parts.push(`오늘 골드 지급(${goldIssued.toLocaleString()}G) 대비 소비(${goldConsumed.toLocaleString()}G)가 낮습니다. 소형 상점 아이템 추가를 추천합니다.`);
    } else if (goldIssued > 0 && goldConsumed >= goldIssued * 0.5) {
      parts.push(`오늘 학급 경제는 지급과 소비가 균형 잡혀 있습니다.`);
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

            if (validCheck) checkedCount++;
            if (q.type === 'daily') {
              if (!sqMap[sid]) sqMap[sid] = [];
              sqMap[sid].push({
                title:    q.title,
                checked:  validCheck,
                rewarded: data.rewarded || false,
              });
            }
          });
          return { ...q, checkedCount };
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

  const loadQuickSetupStatus = async () => {
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
      });
    } catch {
      setQuickSetupInfo(null);
    }
  };

  useEffect(() => {
    const load = async () => {
      const studentList = await fetchStudents();
      const questList = await fetchQuestStats(studentList.map(s => s.id));
      await loadQuickSetupStatus();
      await fetchAiSummary(studentList, questList);
    };
    load();
  }, [selectedClass]);

  useEffect(() => {
    const classKey = selectedClass?.id || selectedClass?.teacherUid;
    if (!classKey) return;
    const flagKey = `showQrPrintGuide:${classKey}`;
    if (sessionStorage.getItem(flagKey) === '1') {
      sessionStorage.removeItem(flagKey);
      setShowQrPrintGuide(true);
    }
  }, [selectedClass?.id, selectedClass?.teacherUid]);

  const handleRunQuickSetup = async () => {
    if (!selectedClass?.id || isQuickSetupRunning) return;
    setIsQuickSetupRunning(true);
    try {
      const result = await applyClassQuickSetup(selectedClass);
      await loadQuickSetupStatus();
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
        mode:        modalMode,
        diaAmount:   isAdd ? diaAmt  : -diaAmt,
        goldAmount:  isAdd ? goldAmt : -goldAmt,
        reason:      reason.trim() || (isAdd ? '학생 보상 지급' : '학생 차감 집행'),
        targetCount: selectedIds.length,
        targetIds:   selectedIds,
      });

      await batch.commit();

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

  return (
    <div className="min-h-screen bg-slate-100 p-8 relative">
      
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 flex items-center">
            학급 전체 대시보드
          </h1>
          <p className="text-slate-500 mt-2 text-sm">학생들의 레벨과 재화를 관리합니다.</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {selectedClass?.teacherUid === 'admin_master_001' && (
            <button
              onClick={() => {
                setPreviewLevel(prev => prev + 1);
                setShowLevelUpPreview(true);
              }}
              className="flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500 text-amber-900 px-4 py-2 rounded-lg font-extrabold text-sm shadow-sm transition-all border border-amber-300"
            >
              레벨업 효과 보기
            </button>
          )}
          <button onClick={async () => {
            const list = await fetchStudents();
            await fetchQuestStats(list.map(s => s.id));
          }} className="bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors text-sm">
            새로고침
          </button>
          {onStudentTestLogin && (
            <button
              onClick={() => onStudentTestLogin('SINSEOK-5-15')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors text-sm"
            >
              학생 테스트 (SINSEOK-5-15)
            </button>
          )}
          <a
            href="https://github.com/illyeong/level-up-class/releases/download/v1.0.0/LevelUpTeacherWidgetSetup.exe"
            target="_blank"
            rel="noreferrer"
            className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors text-sm"
            title="교사용 바탕화면 미니 위젯을 설치합니다."
          >
            교사용 위젯 설치하기
          </a>
          <button onClick={fetchLogs} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors text-sm">
            지급/차감 내역 보기
          </button>
          <button onClick={() => openModal('add')}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors">
            지급하기
          </button>
          <button onClick={() => openModal('sub')}
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors">
            차감하기
          </button>
        </div>
      </div>

      {quickSetupInfo && !quickSetupInfo.completed && (
        <div className="mb-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">학급 기본 셋팅</h2>
              <p className="text-sm text-slate-500 mt-1">
                추천 퀘스트와 퀴즈던전 등 학급 운영에 필요한 기본 셋팅을 생성합니다.
              </p>
            </div>
            <div className="flex gap-2">
<button
                onClick={handleRunQuickSetup}
                disabled={isQuickSetupRunning}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-50">
                {isQuickSetupRunning ? '적용 중...' : '기본 셋팅 실행'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI 오늘의 운영 요약 ── */}
      <div className="mb-6">
        <div className="rounded-2xl border border-indigo-800/60 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 shadow-lg overflow-hidden">
          {/* 헤더 */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-500/20 text-lg">✨</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-extrabold text-sm">AI 오늘의 운영 요약</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200">BETA</span>
                </div>
                <p className="text-indigo-300/70 text-[11px] mt-0.5">오늘 학급 운영에서 확인하면 좋은 내용을 정리해드립니다.</p>
              </div>
            </div>
            <button
              onClick={() => fetchAiSummary(students, questStats)}
              disabled={aiLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-colors disabled:opacity-50"
            >
              {aiLoading ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : '↻'}
              새로고침
            </button>
          </div>

          {/* 본문 */}
          <div className="px-5 py-4">
            {aiLoading && !aiSummary ? (
              <div className="flex items-center gap-2 text-indigo-300 text-sm py-2">
                <span className="inline-block w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                분석 중...
              </div>
            ) : aiSummary ? (
              <>
                {/* 요약 텍스트 */}
                <p className="text-slate-100 text-sm leading-relaxed mb-4">{aiSummary.text}</p>

                {/* 지표 칩 + 빠른 승인 버튼 */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {aiSummary.questRate !== null && (
                    <div className="flex items-center gap-1.5">
                      <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
                        ${aiSummary.questRate >= 70 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : aiSummary.questRate >= 40 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                        ⚔️ 퀘스트 완료율 {aiSummary.questRate}%
                      </span>
                      <button
                        onClick={approveAllCheckedQuests}
                        disabled={approvingQuests}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-500/40 transition-colors disabled:opacity-50"
                        title="체크한 학생 전원에게 퀘스트 보상 지급"
                      >
                        {approvingQuests
                          ? <span className="inline-block w-3 h-3 border-2 border-emerald-300/30 border-t-emerald-300 rounded-full animate-spin" />
                          : '✓'}
                        전체 승인
                      </button>
                    </div>
                  )}
                  {aiSummary.pendingNotes > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        📚 승인 대기 {aiSummary.pendingNotes}건
                      </span>
                      <button
                        onClick={approveAllNotes}
                        disabled={approvingNotes}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold bg-amber-500/25 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 transition-colors disabled:opacity-50"
                        title="배움노트 대기 건 전체 승인"
                      >
                        {approvingNotes
                          ? <span className="inline-block w-3 h-3 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin" />
                          : '✓'}
                        모두 승인
                      </button>
                    </div>
                  )}
                  {aiSummary.goldIssued > 0 && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                      🪙 오늘 지급 {aiSummary.goldIssued.toLocaleString()}G
                    </span>
                  )}
                  {aiSummary.goldConsumed > 0 && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30">
                      💸 오늘 소비 {aiSummary.goldConsumed.toLocaleString()}G
                    </span>
                  )}
                  {aiSummary.quizCount > 0 && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      🧩 퀴즈 참여 {aiSummary.quizCount}명
                      {aiSummary.avgAccuracy !== null && ` · 정답률 ${aiSummary.avgAccuracy}%`}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-slate-400 text-sm py-2">데이터를 불러오려면 새로고침을 눌러주세요.</p>
            )}

            {/* 액션 버튼 */}
            <div className="flex flex-wrap gap-2 pt-3 border-t border-white/10">
              {[
                { label: '⚔️ 퀘스트 확인', view: 'questManage' },
                { label: '📚 배움노트 승인', view: 'learningNoteManage' },
                { label: '🛒 상점 관리', view: 'classShopManage' },
                { label: '👥 학생 현황', view: 'accountIssue' },
              ].map(({ label, view }) => (
                <button
                  key={view}
                  onClick={() => {
                    // TeacherLayout의 changeView 호출 — props로 올리거나 CustomEvent 사용
                    window.dispatchEvent(new CustomEvent('teacher-nav', { detail: { view } }));
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/15 text-slate-200 text-xs font-bold transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>

            {aiSummary?.refreshedAt && (
              <p className="text-slate-600 text-[10px] mt-2 text-right">
                {aiSummary.refreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── AI 코스웨어 현황 카드 ── */}
      <AICoursewareCard teacherUid={selectedClass?.teacherUid} onNavigate={(view) => window.dispatchEvent(new CustomEvent('teacher-nav', { detail: { view } }))} />

      {/* 퀘스트 현황 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <img src={iconQuest} alt="퀘스트" className="w-6 h-6 object-contain" />
          <h2 className="font-extrabold text-slate-700 text-base">오늘의 퀘스트 현황</h2>
          <span className="text-xs font-bold text-slate-500">
            학생들이 자체체크를 하면 매일 자정에 퀘스트가 초기화되면서 보상이 자동지급됩니다.
          </span>
        </div>
        {questStats.length === 0 ? (
          <div className="text-slate-400 text-sm py-3 px-4 bg-white rounded-2xl border border-slate-200">
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
                  className={`shrink-0 w-52 rounded-2xl shadow-sm border-2 overflow-hidden
                    ${isDaily
                      ? 'border-sky-200 bg-gradient-to-b from-sky-50 to-white'
                      : 'border-violet-200 bg-gradient-to-b from-violet-50 to-white'}`}>
                  {/* ?곷떒 ?????*/}
                  <div className={`px-3 py-1.5 text-[10px] font-extrabold tracking-wide
                    ${isDaily ? 'bg-sky-500 text-white' : 'bg-violet-500 text-white'}`}>
                    {isDaily ? '일일 퀘스트' : '주간 퀘스트'}
                  </div>
                  <div className="p-3">
                    <div className="font-extrabold text-sm text-slate-800 mb-2 leading-tight truncate">
                      {quest.title}
                    </div>
                    {/* 吏꾪뻾瑜?*/}
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className={isDaily ? 'text-sky-600' : 'text-violet-600'}>
                        {quest.checkedCount}명 / {students.length}명
                      </span>
                      <span className="text-slate-500 font-extrabold">{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
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

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {students.map((student) => {
          const cosmeticStyles = getEffectiveCosmeticStyles(student);
          const hallBadgeText = getHallOfFameBadgeText(student);
          return (
          <div key={student.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow relative">
            {/* ?쇱씪?섏뒪???꾨즺 ?꾪솴 */}
            {(() => {
              const qs = studentQuestMap[student.id] || [];
              if (qs.length === 0) return null;
              const done = qs.filter(q => q.checked).length;
              return (
                <div className={`px-2.5 py-1.5 flex items-center justify-between gap-1
                  ${done === qs.length ? 'bg-emerald-50 border-b border-emerald-100' : 'bg-slate-50 border-b border-slate-100'}`}>
                  <div className="flex gap-1 flex-wrap">
                    {qs.filter(q => q.checked).map((q, i) => (
                      <span key={i} title={q.title}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full truncate max-w-[80px]
                          ${q.rewarded ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {q.title.length > 6 ? `${q.title.slice(0, 6)}...` : q.title}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div
              className="h-36 bg-gradient-to-b from-slate-50 to-white flex items-center justify-center border-b border-slate-100 relative overflow-hidden"
              style={{ ...cosmeticStyles.background.style, ...cosmeticStyles.frame.style }}
            >
              {hallBadgeText && (
                <div className="absolute top-2 right-2 z-20 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 px-2.5 py-1 text-[10px] font-black text-amber-950 shadow-lg ring-2 ring-white/90">
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
              <div className="absolute top-2 left-2 bg-slate-800 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                {getSeatNum(student.studentCode)}번
              </div>
              <div className="absolute bottom-2 right-2 bg-amber-400 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                LV.{student.level || 1}
              </div>
            </div>
            <div className="p-3 text-center">
              <h3 className="text-sm font-bold text-slate-800 mb-1 truncate">
                {student.name || student.studentCode}
              </h3>
              {student.name && (
                <div className="text-[10px] text-slate-400 font-mono truncate mb-1">{student.studentCode}</div>
              )}
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between items-center bg-indigo-50 px-2 py-1.5 rounded-md">
                  <div className="flex items-center gap-1">
                    <img src={iconDiamond} alt="Diamond" className="w-3 h-3" />
                    <span className="text-[10px] text-indigo-400">다이아</span>
                  </div>
                  <span className="font-bold text-indigo-700">{(student.diamonds || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center bg-amber-50 px-2 py-1.5 rounded-md">
                  <div className="flex items-center gap-1">
                    <img src={iconGold} alt="Gold" className="w-3 h-3" />
                    <span className="text-[10px] text-amber-500">골드</span>
                  </div>
                  <span className="font-bold text-amber-600">{(student.gold || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className={`p-5 text-white font-bold text-xl flex justify-between items-center
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
                    <label htmlFor="selectAll" className="font-bold text-slate-700 cursor-pointer text-sm">전체 선택</label>
                  </div>
                  <input type="text" placeholder="이름/코드 검색" className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-32 focus:outline-none focus:border-indigo-500"
                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredStudents.map(student => (
                    <div key={student.id} onClick={() => toggleSelect(student.id)}
                      className={`flex items-center p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedIds.includes(student.id) ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-slate-200 bg-white hover:border-indigo-300'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="font-extrabold text-sm text-slate-800 truncate">
                          {getSeatNum(student.studentCode)}번 {student.name || ''}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 truncate">{student.studentCode}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                          <img src={iconDiamond} alt="다이아" className="w-3 h-3" /> {student.diamonds || 0}
                          <img src={iconGold} alt="골드" className="w-3 h-3 ml-1" /> {student.gold || 0}
                        </div>
                      </div>
                      {selectedIds.includes(student.id) && (
                        <span className="text-indigo-500 text-base ml-1 shrink-0">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full lg:w-80 p-5 bg-white flex flex-col overflow-y-auto gap-4">
                {/* ?좏깮 ?몄썝 */}
                <div className="p-3 bg-slate-50 rounded-xl text-center border border-slate-200">
                  <span className="text-slate-500 text-xs font-medium">선택한 학생</span>
                  <div className="text-3xl font-black text-indigo-600 my-0.5">{selectedIds.length} <span className="text-lg text-slate-700">명</span></div>
                </div>

                {/* ?뭿 ?ㅼ씠??*/}
                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 mb-2">
                    <img src={iconDiamond} className="w-4 h-4" alt="다이아" /> 다이아 금액
                  </label>
                  <input
                    type="number" min="0" value={diaAmount}
                    onChange={e => setDiaAmount(e.target.value)}
                    className="w-full border-2 border-indigo-200 rounded-xl px-4 py-2.5 font-bold text-lg text-slate-800 focus:outline-none focus:border-indigo-500 bg-white mb-2"
                    placeholder="0" />
                  <div className="flex gap-1.5">
                    {[10, 50, 100, 500].map(v => (
                      <button key={v} onClick={() => addQuick('dia', v)}
                        className="flex-1 bg-white hover:bg-indigo-100 text-indigo-600 font-bold py-1.5 rounded-lg text-xs border border-indigo-200 transition-colors">
                        +{v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ?첌 怨⑤뱶 */}
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mb-2">
                    <img src={iconGold} className="w-4 h-4" alt="골드" /> 골드 금액
                  </label>
                  <input
                    type="number" min="0" value={goldAmount}
                    onChange={e => setGoldAmount(e.target.value)}
                    className="w-full border-2 border-amber-200 rounded-xl px-4 py-2.5 font-bold text-lg text-slate-800 focus:outline-none focus:border-amber-500 bg-white mb-2"
                    placeholder="0" />
                  <div className="flex gap-1.5">
                    {[50, 100, 300, 500].map(v => (
                      <button key={v} onClick={() => addQuick('gold', v)}
                        className="flex-1 bg-white hover:bg-amber-100 text-amber-600 font-bold py-1.5 rounded-lg text-xs border border-amber-200 transition-colors">
                        +{v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ?ъ쑀 */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">사유 (선택)</label>
                  <textarea value={reason} onChange={e => setReason(e.target.value)}
                    className="w-full h-16 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                    placeholder="비워두셔도 됩니다." />
                </div>

                <button onClick={submitTransaction}
                  className={`w-full py-4 rounded-xl font-bold text-lg text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]
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
            <div className="p-5 bg-slate-800 text-white font-bold text-xl flex justify-between items-center">
              <h2>최근 지급/차감 내역</h2>
              <button onClick={() => setIsLogOpen(false)} className="text-slate-300 hover:text-white">×</button>
            </div>
            <div className="p-0 overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left border-collapse text-xs">
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
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isAdd ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
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

      {showQrPrintGuide && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[180] p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="bg-indigo-600 px-5 py-4 text-white">
              <h2 className="text-lg font-extrabold">학생 로그인 QR코드 출력</h2>
              <p className="mt-1 text-xs font-bold text-indigo-100">
                기본 셋팅이 완료되었습니다. 학생들이 쉽게 접속할 수 있도록 로그인 QR코드를 출력해두세요.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div className="font-extrabold text-slate-800">학급/학생 관리 페이지에서 출력할 수 있습니다.</div>
                <div className="mt-1 text-slate-500">
                  출력물의 QR코드를 스캔하면 학생코드가 자동 입력되고, 학생은 PIN만 입력하면 로그인됩니다.
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowQrPrintGuide(false)}
                  className="flex-1 rounded-xl border-2 border-slate-200 py-2.5 text-sm font-extrabold text-slate-600 hover:bg-slate-50"
                >
                  닫기
                </button>
                <button
                  onClick={() => {
                    setShowQrPrintGuide(false);
                    onGoAccountIssue?.();
                  }}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-extrabold text-white hover:bg-indigo-700"
                >
                  출력하러 가기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default TeacherDashboard;





