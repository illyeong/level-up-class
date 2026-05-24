import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, setDoc, deleteDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import AttendanceCheck from '../pages/student/AttendanceCheck';
import HallOfFame from '../pages/student/HallOfFame';
import LevelUpEffect from './LevelUpEffect';

// ── 오늘의 퀘스트 위젯 ────────────────────────────────────────
function TodayQuestWidget({ studentId, teacherUid, onYesterdayLog }) {
  const [quests, setQuests]           = useState([]);
  const [completions, setCompletions] = useState({});
  const [busyId, setBusyId]           = useState(null);
  const [isLoading, setIsLoading]     = useState(true);

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
        await Promise.all(
          list
            .filter(q => q.type === 'daily' && q.repeatDaily && q.active !== false)
            .map(async q => {
              const comp = cMap[q.id];
              if (!comp || comp.rewarded) return; // 보상된 건 유지
              const ts = comp.checkedAt;
              const checkedAt = ts?.toDate?.() ?? (ts?.seconds ? new Date(ts.seconds * 1000) : null);
              if (checkedAt && checkedAt < todayMidnight) {
                if (comp.checked) cleanedQuests.push({ questId: q.id, title: q.title, rewards: q.rewards });
                await deleteDoc(doc(db, 'quests', q.id, 'completions', studentId));
                delete cMap[q.id];
              }
            })
        );
        if (cleanedQuests.length > 0) {
          const todayStr = new Date().toDateString();
          localStorage.setItem(`levelup_yesterday_log_${studentId}`, JSON.stringify({ date: todayStr, quests: cleanedQuests }));
          onYesterdayLog?.(cleanedQuests);
        }

        setCompletions(cMap);
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    })();
  }, [studentId]);

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

const StudentDashboard = ({ studentCode, onChangeView }) => {
  const [studentData, setStudentData]       = useState(null);
  const [isLoading, setIsLoading]           = useState(false);
  const [yesterdayLog, setYesterdayLog]     = useState(null);
  const [showYesterdayPopup, setShowYesterdayPopup] = useState(false);
  const [newApprovedCount, setNewApprovedCount] = useState(0);
  const [levelUpData, setLevelUpData]       = useState(null); // { prevLevel, newLevel }

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

  // 레벨업 감지 — studentData 로드 후 이전 레벨과 비교
  useEffect(() => {
    if (!studentData?.id || !studentData?.level) return;
    const key      = `student_level_${studentData.id}`;
    const stored   = parseInt(localStorage.getItem(key) || '0', 10);
    const current  = studentData.level;
    if (stored > 0 && current > stored) {
      setLevelUpData({ prevLevel: stored, newLevel: current });
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

  const name     = studentData?.name     || studentData?.studentCode || '용감한 용사';
  const getMaxExpForLevel = (lv) =>
    lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;

  const level    = studentData?.level    || 1;
  const exp      = studentData?.exp      || 0;
  const maxExp   = getMaxExpForLevel(level);
  const diamonds = studentData?.diamonds ?? 0;
  const gold     = studentData?.gold     ?? 0;
  const expPct   = Math.min(100, Math.round((exp / maxExp) * 100));

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
      />
    )}
    <div className="p-8">
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <h1 className="text-3xl font-bold text-gray-800">🏰 학생 대시보드</h1>
        <div className="flex items-center gap-3 flex-wrap">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 캐릭터 카드 */}
        <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 text-center">
          <div className="w-full h-52 mx-auto flex items-center justify-center mb-4 relative bg-indigo-50 rounded-2xl overflow-hidden border border-indigo-100">
            {studentData?.characterImage ? (
              <img
                src={studentData.characterImage}
                alt="내 캐릭터"
                className="w-full h-full object-contain scale-[2] drop-shadow-md"
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl">
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
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* 출석 체크 */}
          <AttendanceCheck studentCode={studentCode} />

          {/* 오늘의 퀘스트 */}
          <TodayQuestWidget studentId={studentData?.id} teacherUid={studentData?.teacherUid} onYesterdayLog={handleYesterdayLog} />
        </div>
      </div>

      {/* 명예의 전당 */}
      <div className="mt-8 border-t border-slate-100 pt-6">
        <HallOfFame studentCode={studentCode} teacherUid={studentData?.teacherUid} />
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
              <p className="text-xs text-slate-400 text-center mb-4">보상은 선생님이 별도로 확인 후 지급합니다</p>
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
