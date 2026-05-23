import React, { useState, useEffect } from 'react';
import {
  doc, getDoc, getDocs, collection,
  writeBatch, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

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

// 학생 번호 추출 (studentCode 형식: "반-번호" 또는 그냥 번호)
const getStudentNum = (studentCode) => {
  if (!studentCode) return '?';
  const parts = studentCode.split('-');
  return parts[parts.length - 1];
};

function QuestDetail({ questId, onBack, isModal = false }) {
  const [quest, setQuest] = useState(null);
  const [students, setStudents] = useState([]);
  const [completions, setCompletions] = useState({});
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (message, onConfirm) => setConfirmState({ message, onConfirm });

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [questDoc, studentsSnap, completionsSnap] = await Promise.all([
          getDoc(doc(db, 'quests', questId)),
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'quests', questId, 'completions')),
        ]);

        if (!questDoc.exists()) { onBack(); return; }
        const questData = questDoc.data();
        setQuest({ id: questDoc.id, ...questData });

        // 같은 학급 학생만 표시 (teacherUid 필터)
        const tid = questData.teacherUid;
        let studentList = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (tid) studentList = studentList.filter(s => s.teacherUid === tid);
        studentList.sort((a, b) => {
          const na = parseInt(getStudentNum(a.studentCode)) || 0;
          const nb = parseInt(getStudentNum(b.studentCode)) || 0;
          return na - nb;
        });
        setStudents(studentList);

        const map = {};
        completionsSnap.docs.forEach(d => { map[d.id] = d.data(); });

        // 매일반복 퀘스트: 어제 이전의 미보상 completion 삭제 (교사가 상세 열 때 초기화)
        if (questData.repeatDaily) {
          const todayMidnight = new Date();
          todayMidnight.setHours(0, 0, 0, 0);
          const staleDocs = completionsSnap.docs.filter(d => {
            const data = d.data();
            if (data.rewarded) return false; // 보상된 건 유지
            const ts = data.checkedAt;
            const checkedAt = ts?.toDate?.() ?? (ts?.seconds ? new Date(ts.seconds * 1000) : null);
            return checkedAt && checkedAt < todayMidnight;
          });
          if (staleDocs.length > 0) {
            const batch = writeBatch(db);
            staleDocs.forEach(d => {
              batch.delete(doc(db, 'quests', questId, 'completions', d.id));
              delete map[d.id];
            });
            await batch.commit();
          }
        }

        setCompletions(map);
      } catch (err) {
        console.error('퀘스트 상세 로딩 에러:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [questId]);

  const isChecked  = (sid) => completions[sid]?.checked  === true;
  const isRewarded = (sid) => completions[sid]?.rewarded === true;

  const checkedCount  = students.filter(s => isChecked(s.id)).length;
  const rewardedCount = students.filter(s => isRewarded(s.id)).length;
  const progressPct   = students.length > 0
    ? Math.round((checkedCount / students.length) * 100) : 0;

  // 카드 클릭 → 체크 토글 (보상받은 학생은 불가)
  const toggleCheck = async (studentId) => {
    if (isRewarded(studentId)) return;
    const currently = isChecked(studentId);
    try {
      const ref = doc(db, 'quests', questId, 'completions', studentId);
      if (currently) {
        await deleteDoc(ref);
        setCompletions(prev => { const n = { ...prev }; delete n[studentId]; return n; });
      } else {
        await setDoc(ref, { checked: true, checkedAt: serverTimestamp(), rewarded: false, rewardedBy: null });
        setCompletions(prev => ({ ...prev, [studentId]: { checked: true, rewarded: false } }));
      }
    } catch (err) {
      console.error('체크 토글 에러:', err);
    }
  };

  // 지정된 학생 ID 목록에 보상 지급
  const giveRewards = (targetIds, label) => {
    if (targetIds.length === 0) return showToast('보상을 지급할 학생이 없습니다.', 'error');
    showConfirm(`${targetIds.length}명(${label})에게 보상을 지급할까요?`, async () => {
      setIsBusy(true);
      try {
        const batch = writeBatch(db);
        targetIds.forEach(sid => {
          const student = students.find(s => s.id === sid);
          if (!student) return;
          batch.update(doc(db, 'students', sid), {
            gold:     (student.gold     || 0) + (quest.rewards?.gold    || 0),
            diamonds: (student.diamonds || 0) + (quest.rewards?.diamond || 0),
            exp:      (student.exp      || 0) + (quest.rewards?.exp     || 0),
          });
          batch.set(doc(db, 'quests', questId, 'completions', sid), {
            checked:     true,
            checkedAt:   completions[sid]?.checkedAt || serverTimestamp(),
            rewarded:    true,
            rewardedAt:  serverTimestamp(),
            rewardedBy:  'teacher',
          }, { merge: true });
        });
        await batch.commit();

        setStudents(prev => prev.map(s => {
          if (!targetIds.includes(s.id)) return s;
          return {
            ...s,
            gold:     (s.gold     || 0) + (quest.rewards?.gold    || 0),
            diamonds: (s.diamonds || 0) + (quest.rewards?.diamond || 0),
            exp:      (s.exp      || 0) + (quest.rewards?.exp     || 0),
          };
        }));
        setCompletions(prev => {
          const n = { ...prev };
          targetIds.forEach(sid => { n[sid] = { ...n[sid], checked: true, rewarded: true, rewardedBy: 'teacher' }; });
          return n;
        });
        showToast('보상 지급 완료!');
      } catch (err) {
        console.error('보상 지급 에러:', err);
        showToast('보상 지급 중 오류가 발생했습니다.', 'error');
      } finally {
        setIsBusy(false);
      }
    });
  };

  const rewardChecked = () => {
    const targets = students.filter(s => isChecked(s.id) && !isRewarded(s.id)).map(s => s.id);
    giveRewards(targets, '체크된 학생');
  };

  const rewardAll = () => {
    const targets = students.filter(s => !isRewarded(s.id)).map(s => s.id);
    giveRewards(targets, '전체');
  };

  // 개별 취소 (보상 회수 포함)
  const cancelStudent = (studentId) => {
    const student   = students.find(s => s.id === studentId);
    const wasRewarded = isRewarded(studentId);
    const name = student?.name || student?.studentCode || '학생';
    const msg = wasRewarded
      ? `${name}의 체크를 취소하고 보상(골드 ${quest.rewards?.gold || 0}, EXP ${quest.rewards?.exp || 0})을 회수할까요?`
      : `${name}의 체크를 취소할까요?`;

    showConfirm(msg, async () => {
      setIsBusy(true);
      try {
        const batch = writeBatch(db);
        if (wasRewarded && student) {
          batch.update(doc(db, 'students', studentId), {
            gold:     Math.max(0, (student.gold     || 0) - (quest.rewards?.gold    || 0)),
            diamonds: Math.max(0, (student.diamonds || 0) - (quest.rewards?.diamond || 0)),
            exp:      Math.max(0, (student.exp      || 0) - (quest.rewards?.exp     || 0)),
          });
        }
        batch.delete(doc(db, 'quests', questId, 'completions', studentId));
        await batch.commit();

        if (wasRewarded) {
          setStudents(prev => prev.map(s => s.id !== studentId ? s : {
            ...s,
            gold:     Math.max(0, (s.gold     || 0) - (quest.rewards?.gold    || 0)),
            diamonds: Math.max(0, (s.diamonds || 0) - (quest.rewards?.diamond || 0)),
            exp:      Math.max(0, (s.exp      || 0) - (quest.rewards?.exp     || 0)),
          }));
        }
        setCompletions(prev => { const n = { ...prev }; delete n[studentId]; return n; });
      } catch (err) {
        console.error('취소 에러:', err);
        showToast('취소 중 오류가 발생했습니다.', 'error');
      } finally {
        setIsBusy(false);
      }
    });
  };

  const displayedStudents = (() => {
    if (activeTab === 'done')   return students.filter(s =>  isChecked(s.id));
    if (activeTab === 'undone') return students.filter(s => !isChecked(s.id));
    return students;
  })();

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <div className="text-slate-400 font-bold text-lg">불러오는 중...</div>
      </div>
    );
  }
  if (!quest) return null;

  const diff = DIFF[quest.difficulty] || DIFF.easy;
  const checkedNotRewarded = students.filter(s => isChecked(s.id) && !isRewarded(s.id)).length;
  const notRewarded        = students.filter(s => !isRewarded(s.id)).length;

  return (
    <div className="min-h-screen bg-slate-100 p-8">

      {/* 상단: 뒤로가기 + 제목 + 배지 */}
      <div className="flex items-center flex-wrap gap-3 mb-6">
        {!isModal && (
          <button onClick={onBack}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-800 font-bold text-sm bg-white px-3 py-2 rounded-xl border border-slate-200 hover:border-slate-400 transition-colors">
            ← 목록으로
          </button>
        )}
        <h1 className="text-2xl font-extrabold text-slate-800">{quest.title}</h1>
        <div className="flex gap-1.5 flex-wrap">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full
            ${quest.type === 'daily' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
            {quest.type === 'daily' ? '일일퀘스트' : '주간퀘스트'}
          </span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${diff.cls}`}>{diff.label}</span>
          {quest.selfCheck && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-teal-100 text-teal-700">자체체크</span>
          )}
        </div>
      </div>

      {/* 정보 패널 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* 보상 + 능력치 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">보상</div>
          <div className="flex items-center gap-5 mb-4">
            {quest.rewards?.exp > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-2xl">⭐</span>
                <div>
                  <div className="text-[10px] text-slate-400">경험치</div>
                  <div className="font-extrabold text-slate-800">+{quest.rewards.exp} EXP</div>
                </div>
              </div>
            )}
            {quest.rewards?.gold > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-2xl">🪙</span>
                <div>
                  <div className="text-[10px] text-slate-400">골드</div>
                  <div className="font-extrabold text-amber-600">+{quest.rewards.gold} G</div>
                </div>
              </div>
            )}
            {quest.rewards?.diamond > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-2xl">💎</span>
                <div>
                  <div className="text-[10px] text-slate-400">다이아</div>
                  <div className="font-extrabold text-indigo-600">+{quest.rewards.diamond}</div>
                </div>
              </div>
            )}
          </div>
          {quest.skills?.length > 0 && (
            <>
              <div className="text-xs font-bold text-slate-400 mb-2">능력치</div>
              <div className="flex flex-wrap gap-1.5">
                {quest.skills.map(skill => (
                  <span key={skill}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full
                      ${SKILL_COLORS[skill] || 'bg-slate-100 text-slate-600'}`}>
                    {skill} +1
                  </span>
                ))}
              </div>
            </>
          )}
          {quest.description && (
            <p className="mt-3 text-xs text-slate-500 border-t border-slate-100 pt-3">{quest.description}</p>
          )}
        </div>

        {/* 진행률 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">진행률</div>
          <div className="text-5xl font-black text-indigo-600 mb-3">{progressPct}%</div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-sm font-bold text-slate-600">
            <span>완료 {checkedCount}명</span>
            <span>전체 {students.length}명</span>
          </div>
          {rewardedCount > 0 && (
            <div className="mt-2 text-xs text-emerald-600 font-semibold bg-emerald-50 px-3 py-1.5 rounded-lg inline-block">
              보상 지급 완료: {rewardedCount}명
            </div>
          )}
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex flex-wrap gap-3 mb-5">
        <button
          onClick={rewardChecked}
          disabled={isBusy || checkedNotRewarded === 0}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-sm transition-colors">
          ✅ 체크한 학생 보상지급 ({checkedNotRewarded}명)
        </button>
        <button
          onClick={rewardAll}
          disabled={isBusy || notRewarded === 0}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-sm transition-colors">
          🎁 전체 보상지급 ({notRewarded}명 미지급)
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-4">
        {[
          ['all',    `전체 (${students.length})`],
          ['done',   `완료 (${checkedCount})`],
          ['undone', `미완료 (${students.length - checkedCount})`],
        ].map(([val, label]) => (
          <button key={val} onClick={() => setActiveTab(val)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${activeTab === val
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-indigo-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 학생 카드 그리드 */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {displayedStudents.map(student => {
          const checked  = isChecked(student.id);
          const rewarded = isRewarded(student.id);
          const num  = getStudentNum(student.studentCode);
          const name = student.name || student.studentCode || '?';

          return (
            <div
              key={student.id}
              onClick={() => toggleCheck(student.id)}
              className={`relative bg-white rounded-xl border-2 overflow-hidden transition-all select-none
                ${rewarded
                  ? 'border-indigo-300 bg-indigo-50 cursor-default'
                  : checked
                    ? 'border-teal-400 cursor-pointer hover:border-teal-500'
                    : 'border-slate-200 cursor-pointer hover:border-indigo-300 hover:shadow-sm'}`}
            >
              {/* 체크 뱃지 */}
              {checked && (
                <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center z-10
                  ${rewarded ? 'bg-indigo-500' : 'bg-teal-500'}`}>
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}

              {/* 취소 버튼 */}
              {checked && (
                <button
                  onClick={e => { e.stopPropagation(); cancelStudent(student.id); }}
                  disabled={isBusy}
                  className="absolute top-1.5 left-1.5 w-5 h-5 bg-rose-100 hover:bg-rose-200 text-rose-500 rounded-full flex items-center justify-center z-10 text-[10px] font-bold transition-colors disabled:opacity-50"
                  title={rewarded ? '취소 (보상 회수)' : '체크 취소'}
                >
                  ✕
                </button>
              )}

              {/* 캐릭터 이미지 영역 */}
              <div className="h-20 bg-gradient-to-b from-slate-50 to-white flex items-center justify-center border-b border-slate-100 overflow-hidden">
                {student.characterImage
                  ? <img src={student.characterImage} alt="캐릭터" className="h-full w-full object-contain scale-[2.5]" onError={e => { e.target.style.display='none'; }} />
                  : <span className="text-4xl opacity-30">🧍</span>
                }
              </div>

              {/* 학생 정보 */}
              <div className="p-2 text-center">
                <div className="text-[10px] text-slate-400 font-medium">{num}번</div>
                <div className={`text-xs truncate
                  ${!checked ? 'font-extrabold text-slate-800' : 'font-bold text-slate-600'}`}>
                  {name}
                </div>
                {rewarded && (
                  <div className="mt-1 text-[9px] bg-indigo-100 text-indigo-600 font-bold rounded-full px-1.5 py-0.5">
                    보상완료
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {displayedStudents.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="font-bold">해당 학생이 없습니다.</p>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.message}
        </div>
      )}
      {confirmState && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setConfirmState(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <p className="text-slate-700 font-bold text-sm mb-5 leading-relaxed whitespace-pre-line">{confirmState.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmState(null)}
                className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-50">취소</button>
              <button onClick={() => { confirmState.onConfirm(); setConfirmState(null); }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuestDetail;
