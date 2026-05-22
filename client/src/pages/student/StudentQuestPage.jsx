import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc,
  serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import iconQuest from '../../assets/images/icon-quest.png';

const SKILL_COLORS = {
  '인성':   'bg-purple-100 text-purple-700',
  '의사소통': 'bg-blue-100 text-blue-700',
  '성실성':  'bg-green-100 text-green-700',
  '창의성':  'bg-amber-100 text-amber-700',
  '협동심':  'bg-indigo-100 text-indigo-700',
  '자기관리': 'bg-slate-100 text-slate-600',
};

const DIFF = {
  easy:   { label: '쉬움',   cls: 'bg-emerald-100 text-emerald-700' },
  medium: { label: '보통',   cls: 'bg-amber-100 text-amber-700' },
  hard:   { label: '어려움', cls: 'bg-rose-100 text-rose-700' },
};

const formatDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
};

const getDeadlineText = (quest) => {
  if (quest.type === 'daily') return '오늘 자정까지';
  const now = new Date();
  const sunday = new Date(now);
  const daysUntilSun = now.getDay() === 0 ? 0 : 7 - now.getDay();
  sunday.setDate(sunday.getDate() + daysUntilSun);
  return `일요일까지 (${sunday.getMonth() + 1}/${sunday.getDate()})`;
};

// ─────────────────────── 진행 중 카드 ──────────────────────
function ActiveQuestCard({ quest, completion, onToggleCheck, onAcknowledge, isBusy }) {
  const isChecked      = completion?.checked      === true;
  const isRewarded     = completion?.rewarded     === true;
  const isAcknowledged = !!completion?.acknowledgedAt;
  const isDaily        = quest.type === 'daily';
  const diff           = DIFF[quest.difficulty] || DIFF.easy;

  if (isRewarded && isAcknowledged) return null;

  return (
    <div className={`bg-white rounded-2xl overflow-hidden shadow-sm transition-all
      ${isRewarded
        ? 'border-2 border-amber-300 shadow-md shadow-amber-100'
        : isChecked ? 'border-2 border-teal-300' : 'border-2 border-slate-200 hover:border-indigo-200 hover:shadow-md'}`}>

      {/* 상단 띠: 타입 + 기한 */}
      <div className={`px-4 py-2 flex items-center justify-between gap-2
        ${isRewarded ? 'bg-amber-50 border-b border-amber-200' : isDaily ? 'bg-sky-500' : 'bg-violet-500'}`}>
        <span className={`text-xs font-extrabold shrink-0
          ${isRewarded ? 'text-amber-700' : 'text-white'}`}>
          {isRewarded ? '🏆 보상 지급 완료!' : isDaily ? '📅 일일퀘스트' : '📆 주간퀘스트'}
        </span>
        <div className="flex items-center gap-1.5 min-w-0">
          {!isRewarded && (
            <span className="text-[10px] text-white/80 font-medium truncate">
              ⏰ {getDeadlineText(quest)}
            </span>
          )}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0
            ${isRewarded ? 'bg-amber-100 text-amber-600' : 'bg-white/25 text-white'}`}>
            {diff.label}
          </span>
          {quest.selfCheck && !isRewarded && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/25 text-white shrink-0">
              자체체크
            </span>
          )}
        </div>
      </div>

      <div className="p-5">
        <h3 className={`text-lg font-extrabold mb-1 leading-snug
          ${isRewarded ? 'text-amber-800' : 'text-slate-800'}`}>
          {quest.title}
        </h3>
        {quest.description && (
          <p className="text-sm text-slate-500 mb-4 leading-relaxed">{quest.description}</p>
        )}

        {/* 보상 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {quest.rewards?.exp     > 0 && (
            <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-xl">
              <span>⭐</span>
              <span className="text-sm font-extrabold text-yellow-700">+{quest.rewards.exp} EXP</span>
            </div>
          )}
          {quest.rewards?.gold    > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
              <span>🪙</span>
              <span className="text-sm font-extrabold text-amber-700">+{quest.rewards.gold} G</span>
            </div>
          )}
          {quest.rewards?.diamond > 0 && (
            <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl">
              <span>💎</span>
              <span className="text-sm font-extrabold text-indigo-700">+{quest.rewards.diamond}</span>
            </div>
          )}
        </div>

        {/* 능력치 */}
        {quest.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {quest.skills.map(skill => (
              <span key={skill}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full
                  ${SKILL_COLORS[skill] || 'bg-slate-100 text-slate-600'}`}>
                {skill} +1
              </span>
            ))}
          </div>
        )}

        {/* 액션 */}
        {isRewarded ? (
          <div>
            <div className="py-2.5 bg-amber-50 text-amber-700 font-bold text-sm rounded-xl text-center border border-amber-200 mb-2">
              🎉 보상을 받았어요!&nbsp;
              <span className="text-amber-500 font-medium text-xs">
                ({[
                  quest.rewards?.exp     > 0 ? `⭐${quest.rewards.exp} EXP` : '',
                  quest.rewards?.gold    > 0 ? `🪙${quest.rewards.gold} G` : '',
                  quest.rewards?.diamond > 0 ? `💎${quest.rewards.diamond}` : '',
                ].filter(Boolean).join(' ')})
              </span>
            </div>
            <button
              onClick={onAcknowledge}
              disabled={isBusy}
              className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 text-white font-extrabold text-sm rounded-xl transition-all active:scale-95 disabled:opacity-50 shadow-sm">
              ✓ 확인했어요
            </button>
          </div>
        ) : isChecked ? (
          <div>
            <div className="py-3 bg-teal-50 text-teal-700 font-bold text-sm rounded-xl text-center border border-teal-200">
              ✅ 완료! 선생님 확인을 기다리는 중...
            </div>
            {quest.selfCheck && (
              <button onClick={onToggleCheck} disabled={isBusy}
                className="mt-2 w-full py-1.5 text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors disabled:opacity-50">
                취소하기
              </button>
            )}
          </div>
        ) : quest.selfCheck ? (
          <button onClick={onToggleCheck} disabled={isBusy}
            className={`w-full py-3 rounded-xl font-extrabold text-sm transition-all active:scale-95 shadow-md disabled:opacity-50
              ${isDaily
                ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-sky-200'
                : 'bg-violet-500 hover:bg-violet-600 text-white shadow-violet-200'}`}>
            {isBusy ? '처리 중...' : '완료 체크하기 ✓'}
          </button>
        ) : (
          <div className="py-3 bg-slate-50 text-slate-400 text-sm rounded-xl text-center border border-slate-200">
            🔒 선생님이 직접 확인합니다
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── 완료된 퀘스트 카드 ────────────────
function CompletedQuestCard({ quest, completion }) {
  const isDaily      = quest.type === 'daily';
  const rewardedDate = formatDate(completion?.rewardedAt);

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full
          ${isDaily ? 'bg-sky-100 text-sky-600' : 'bg-violet-100 text-violet-600'}`}>
          {isDaily ? '일일퀘스트' : '주간퀘스트'}
        </span>
        <span className="text-[10px] text-slate-400 font-medium">
          🗓 {rewardedDate || '날짜 없음'} 완료
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-extrabold text-slate-700 mb-3 text-sm">{quest.title}</h3>
        <div className="flex flex-wrap gap-1.5">
          {quest.rewards?.exp     > 0 && (
            <span className="text-xs bg-yellow-50 text-yellow-700 font-bold px-2.5 py-1 rounded-full border border-yellow-200">
              ⭐+{quest.rewards.exp} EXP
            </span>
          )}
          {quest.rewards?.gold    > 0 && (
            <span className="text-xs bg-amber-50 text-amber-700 font-bold px-2.5 py-1 rounded-full border border-amber-200">
              🪙+{quest.rewards.gold} G
            </span>
          )}
          {quest.rewards?.diamond > 0 && (
            <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-full border border-indigo-200">
              💎+{quest.rewards.diamond}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Main ──────────────────────────────
function StudentQuestPage({ studentCode }) {
  const [quests, setQuests]           = useState([]);
  const [studentId, setStudentId]     = useState(null);
  const [studentName, setStudentName] = useState('');
  const [completions, setCompletions] = useState({});  // { questId: completion }
  const [mainTab, setMainTab]         = useState('active');
  const [typeFilter, setTypeFilter]   = useState('all');
  const [isLoading, setIsLoading]     = useState(true);
  const [busyQuestId, setBusyQuestId] = useState(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        if (studentCode) {
          const sq   = query(collection(db, 'students'), where('studentCode', '==', studentCode));
          const snap = await getDocs(sq);
          if (!snap.empty) {
            const sDoc  = snap.docs[0];
            const sData = sDoc.data();
            setStudentId(sDoc.id);
            setStudentName(sData.name || sData.studentCode);

            // teacherUid로 퀘스트 필터링
            // fallback(teacherUid:null)은 테스트 계정(admin_master_001)에만 적용
            const isTestAccount = sData.teacherUid === 'admin_master_001';
            let allQuests = [];
            if (sData.teacherUid) {
              const qs = await getDocs(
                query(collection(db, 'quests'), where('teacherUid', '==', sData.teacherUid))
              );
              allQuests = qs.docs.map(d => ({ id: d.id, ...d.data() }));
              if (allQuests.length === 0 && isTestAccount) {
                const qs2 = await getDocs(collection(db, 'quests'));
                allQuests = qs2.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => !q.teacherUid);
              }
            } else {
              const qs = await getDocs(collection(db, 'quests'));
              allQuests = qs.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            allQuests.sort((a, b) => {
              if (a.type !== b.type) return a.type === 'daily' ? -1 : 1;
              return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
            });
            setQuests(allQuests);

            const compMap = {};
            await Promise.all(
              allQuests.map(async quest => {
                const cd = await getDoc(doc(db, 'quests', quest.id, 'completions', sDoc.id));
                if (cd.exists()) compMap[quest.id] = cd.data();
              })
            );
            setCompletions(compMap);
          }
        }
      } catch (err) {
        console.error('퀘스트 로딩 에러:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [studentCode]);

  // 자체 체크 토글
  const toggleCheck = async (quest) => {
    if (!studentId) return;
    const cur = completions[quest.id];
    if (cur?.rewarded) return;
    setBusyQuestId(quest.id);
    try {
      const ref = doc(db, 'quests', quest.id, 'completions', studentId);
      if (cur?.checked) {
        await deleteDoc(ref);
        setCompletions(prev => { const n = { ...prev }; delete n[quest.id]; return n; });
      } else {
        await setDoc(ref, { checked: true, checkedAt: serverTimestamp(), rewarded: false, rewardedBy: null });
        setCompletions(prev => ({ ...prev, [quest.id]: { checked: true, rewarded: false } }));
      }
    } catch (err) { console.error('체크 에러:', err); }
    finally { setBusyQuestId(null); }
  };

  // 보상 확인 → 완료 탭으로 이동
  const acknowledgeReward = async (quest) => {
    if (!studentId) return;
    setBusyQuestId(quest.id);
    try {
      await updateDoc(doc(db, 'quests', quest.id, 'completions', studentId), {
        acknowledgedAt: serverTimestamp(),
      });
      setCompletions(prev => ({
        ...prev,
        [quest.id]: { ...prev[quest.id], acknowledgedAt: { seconds: Date.now() / 1000 } },
      }));
    } catch (err) { console.error('확인 에러:', err); }
    finally { setBusyQuestId(null); }
  };

  // ── 데이터 파생 ──────────────────────────────────────────
  const activeQuests = quests.filter(q => q.active !== false);

  // 진행 중: 활성 퀘스트 중 (보상받고 확인) 아닌 것
  const inProgressQuests = activeQuests.filter(q => {
    const c = completions[q.id];
    return !(c?.rewarded && c?.acknowledgedAt);
  });

  // 보상 받았지만 아직 확인 안 한 수 (뱃지용)
  const pendingAckCount = activeQuests.filter(q => {
    const c = completions[q.id];
    return c?.rewarded && !c?.acknowledgedAt;
  }).length;

  // 완료한 퀘스트 탭 (보상 + 확인 완료)
  const completedList = quests
    .filter(q => completions[q.id]?.rewarded && completions[q.id]?.acknowledgedAt)
    .map(q => ({ quest: q, completion: completions[q.id] }))
    .sort((a, b) => (b.completion.rewardedAt?.seconds || 0) - (a.completion.rewardedAt?.seconds || 0));

  // 보상 로그: 보상 받은 모든 퀘스트 (확인 여부 무관)
  const rewardLog = quests
    .filter(q => completions[q.id]?.rewarded)
    .map(q => ({ quest: q, completion: completions[q.id] }))
    .sort((a, b) => (b.completion.rewardedAt?.seconds || 0) - (a.completion.rewardedAt?.seconds || 0));

  const totalExp     = rewardLog.reduce((s, { quest: q }) => s + (q.rewards?.exp     || 0), 0);
  const totalGold    = rewardLog.reduce((s, { quest: q }) => s + (q.rewards?.gold    || 0), 0);
  const totalDiamond = rewardLog.reduce((s, { quest: q }) => s + (q.rewards?.diamond || 0), 0);

  const filteredActive = inProgressQuests.filter(q =>
    typeFilter === 'all' || q.type === typeFilter
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-64">
        <div className="text-slate-400 font-bold text-lg">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <img src={iconQuest} alt="퀘스트" className="w-8 h-8 object-contain drop-shadow-sm" />
            나의 퀘스트
          </h1>
          {studentCode && studentName && (
            <p className="text-sm text-slate-500 mt-0.5 font-medium">{studentName}</p>
          )}
        </div>
        <div className="flex gap-2">
          <div className="text-center bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 min-w-[52px]">
            <div className="text-lg font-extrabold text-sky-600">{activeQuests.filter(q => q.type === 'daily').length}</div>
            <div className="text-[10px] text-sky-500 font-bold">일일</div>
          </div>
          <div className="text-center bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 min-w-[52px]">
            <div className="text-lg font-extrabold text-violet-600">{activeQuests.filter(q => q.type === 'weekly').length}</div>
            <div className="text-[10px] text-violet-500 font-bold">주간</div>
          </div>
          {rewardLog.length > 0 && (
            <div className="text-center bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 min-w-[52px]">
              <div className="text-lg font-extrabold text-amber-600">{rewardLog.length}</div>
              <div className="text-[10px] text-amber-500 font-bold">보상완료</div>
            </div>
          )}
        </div>
      </div>

      {/* 메인 탭 */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setMainTab('active')}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors relative
            ${mainTab === 'active' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-200'}`}>
          진행 중
          {pendingAckCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
              {pendingAckCount}
            </span>
          )}
        </button>
        <button onClick={() => setMainTab('completed')}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
            ${mainTab === 'completed' ? 'bg-slate-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
          완료한 퀘스트 ({completedList.length})
        </button>
        <button onClick={() => setMainTab('log')}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
            ${mainTab === 'log' ? 'bg-amber-500 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:border-amber-300'}`}>
          보상 로그
        </button>
      </div>

      {/* ── 진행 중 탭 ─────────────────────────────────────── */}
      {mainTab === 'active' && (
        <>
          <div className="flex gap-2 mb-4">
            {[['all', '전체'], ['daily', '📅 일일'], ['weekly', '📆 주간']].map(([val, label]) => (
              <button key={val} onClick={() => setTypeFilter(val)}
                className={`px-3 py-1.5 rounded-xl font-bold text-sm transition-colors
                  ${typeFilter === val
                    ? val === 'daily' ? 'bg-sky-500 text-white' : val === 'weekly' ? 'bg-violet-500 text-white' : 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200'}`}>
                {label}
              </button>
            ))}
          </div>

          {!studentCode && (
            <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-medium">
              💡 교사 페이지에서 <strong>SINSEOK-5-01</strong>로 테스트 로그인하면 퀘스트를 체크할 수 있습니다.
            </div>
          )}

          {filteredActive.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-3">{inProgressQuests.length === 0 ? '🎊' : '⚔️'}</div>
              <p className="font-bold text-lg text-slate-600">
                {inProgressQuests.length === 0 ? '모든 퀘스트를 완료했어요!' : '퀘스트가 없습니다'}
              </p>
              {inProgressQuests.length === 0 && (
                <p className="text-sm mt-1 text-slate-400">
                  받은 보상을 확인하려면 "완료한 퀘스트" 탭을 눌러보세요
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredActive.map(quest => (
                <ActiveQuestCard
                  key={quest.id}
                  quest={quest}
                  completion={completions[quest.id]}
                  onToggleCheck={() => toggleCheck(quest)}
                  onAcknowledge={() => acknowledgeReward(quest)}
                  isBusy={busyQuestId === quest.id}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── 완료한 퀘스트 탭 ────────────────────────────────── */}
      {mainTab === 'completed' && (
        completedList.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <div className="text-5xl mb-3">📋</div>
            <p className="font-bold text-lg text-slate-600">아직 완료한 퀘스트가 없습니다</p>
            <p className="text-sm mt-1">퀘스트 보상을 받고 "확인했어요"를 누르면 여기에 표시됩니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {completedList.map(({ quest, completion }) => (
              <CompletedQuestCard key={quest.id} quest={quest} completion={completion} />
            ))}
          </div>
        )
      )}

      {/* ── 보상 로그 탭 ────────────────────────────────────── */}
      {mainTab === 'log' && (
        <div>
          {/* 합계 카드 */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-center">
              <div className="text-2xl font-extrabold text-yellow-700">{totalExp.toLocaleString()}</div>
              <div className="text-xs text-yellow-600 font-bold mt-1">⭐ 누적 EXP</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
              <div className="text-2xl font-extrabold text-amber-700">{totalGold.toLocaleString()}</div>
              <div className="text-xs text-amber-600 font-bold mt-1">🪙 누적 골드</div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-center">
              <div className="text-2xl font-extrabold text-indigo-700">{totalDiamond.toLocaleString()}</div>
              <div className="text-xs text-indigo-600 font-bold mt-1">💎 누적 다이아</div>
            </div>
          </div>

          {/* 로그 목록 */}
          {rewardLog.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <div className="text-4xl mb-2">📊</div>
              <p className="font-bold">아직 받은 보상이 없습니다</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h3 className="font-bold text-slate-700 text-sm">보상 내역</h3>
                <span className="text-xs text-slate-400">{rewardLog.length}건</span>
              </div>
              <div className="divide-y divide-slate-100">
                {rewardLog.map(({ quest: q, completion: c }) => (
                  <div key={q.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0 mr-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0
                          ${q.type === 'daily' ? 'bg-sky-100 text-sky-600' : 'bg-violet-100 text-violet-600'}`}>
                          {q.type === 'daily' ? '일일' : '주간'}
                        </span>
                        <span className="font-bold text-slate-800 text-sm truncate">{q.title}</span>
                      </div>
                      <div className="text-xs text-slate-400 pl-0.5">
                        🗓 {c.rewardedAt ? formatDate(c.rewardedAt) : '날짜 없음'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {q.rewards?.exp     > 0 && (
                        <span className="text-xs font-bold text-yellow-700 bg-yellow-50 px-2 py-1 rounded-lg border border-yellow-100">
                          ⭐+{q.rewards.exp}
                        </span>
                      )}
                      {q.rewards?.gold    > 0 && (
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                          🪙+{q.rewards.gold}
                        </span>
                      )}
                      {q.rewards?.diamond > 0 && (
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                          💎+{q.rewards.diamond}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default StudentQuestPage;
