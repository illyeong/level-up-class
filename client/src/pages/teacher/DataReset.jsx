import React, { useState, useCallback } from 'react';
import {
  collection, getDocs, doc, writeBatch, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';

/* ─── 학생 목록 조회 헬퍼 ─────────────────────────────── */
const fetchStudents = async (selectedClass) => {
  let q;
  if (selectedClass.id) {
    q = query(collection(db, 'students'), where('classId', '==', selectedClass.id));
  } else {
    q = query(collection(db, 'students'), where('teacherUid', '==', selectedClass.teacherUid));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

/* ─── ConfirmModal ────────────────────────────────────── */
function ConfirmModal({ title, description, danger, confirmWord = '초기화', onConfirm, onCancel }) {
  const [inputVal, setInputVal] = useState('');
  const needsType = danger;
  const canConfirm = !needsType || inputVal.trim() === confirmWord;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${danger ? 'bg-rose-100' : 'bg-amber-100'}`}>
          <span className="text-2xl">{danger ? '⚠️' : '❓'}</span>
        </div>
        <h3 className="font-extrabold text-slate-800 text-lg mb-1">{title}</h3>
        <p className="text-sm text-slate-500 leading-relaxed mb-4">{description}</p>

        {needsType && (
          <div className="mb-4">
            <p className="text-sm text-rose-600 font-bold mb-2">
              확인을 위해 아래에 <span className="font-mono bg-rose-50 px-1 rounded">{confirmWord}</span> 를 입력해주세요.
            </p>
            <input
              type="text"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder={confirmWord}
              className="w-full border-2 border-slate-200 focus:border-rose-400 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
              autoFocus
            />
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:border-slate-300 transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-5 py-2 rounded-xl font-bold text-sm text-white transition-colors disabled:opacity-40 ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            실행하기
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── ActionCard ──────────────────────────────────────── */
function ActionCard({ icon, title, description, buttonLabel, danger, onAction, loading }) {
  return (
    <div className={`bg-white rounded-2xl border p-5 shadow-sm flex items-start gap-4 ${
      danger ? 'border-rose-200' : 'border-slate-200'
    }`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl ${
        danger ? 'bg-rose-100' : 'bg-slate-100'
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-extrabold text-slate-800 text-sm">{title}</h4>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        onClick={onAction}
        disabled={loading}
        className={`shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-colors disabled:opacity-40 ${
          danger
            ? 'bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-200'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
        }`}
      >
        {loading ? '처리 중...' : buttonLabel}
      </button>
    </div>
  );
}

/* ─── 메인 컴포넌트 ───────────────────────────────────── */
export default function DataReset({ selectedClass, onClassDeleted }) {
  const [loadingKey, setLoadingKey] = useState(null);
  const [logs, setLogs]             = useState([]);
  const [modal, setModal]           = useState(null); // { key, title, description, danger, action }

  /* 로그 추가 */
  const addLog = useCallback((msg, type = 'info') => {
    const time = new Date().toLocaleTimeString('ko-KR');
    setLogs(prev => [{ time, msg, type, id: Date.now() + Math.random() }, ...prev]);
  }, []);

  /* 공통 실행 래퍼 */
  const run = async (key, fn) => {
    setLoadingKey(key);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      addLog(`오류: ${e.message}`, 'error');
    } finally {
      setLoadingKey(null);
    }
  };

  /* 모달 열기 */
  const openModal = (key, title, description, danger, action, confirmWord = '초기화') => {
    setModal({ key, title, description, danger, action, confirmWord });
  };

  const closeModal = () => setModal(null);

  const confirmModal = () => {
    if (!modal) return;
    const { key, action } = modal;
    closeModal();
    run(key, action);
  };

  /* ── 1. 재화 초기화 ── */
  const resetCurrency = async () => {
    const students = await fetchStudents(selectedClass);
    const batch = writeBatch(db);
    students.forEach(s => {
      batch.update(doc(db, 'students', s.id), { gold: 0, diamonds: 0 });
    });
    await batch.commit();
    addLog(`재화 초기화 완료 (${students.length}명)`, 'success');
  };

  /* ── 2. 은행 초기화 ── */
  const resetBank = async () => {
    const students = await fetchStudents(selectedClass);
    const batch = writeBatch(db);
    students.forEach(s => {
      batch.update(doc(db, 'students', s.id), {
        bankGold: 0, bankDiamond: 0,
        bankGoldInterest: 0, bankDiamondInterest: 0,
      });
    });
    await batch.commit();

    // bankLogs 삭제 (이 학급 학생 uid 기준)
    const studentIds = students.map(s => s.id);
    if (studentIds.length > 0) {
      const logsSnap = await getDocs(
        query(collection(db, 'bankLogs'), where('studentId', 'in', studentIds.slice(0, 30)))
      );
      const logBatch = writeBatch(db);
      logsSnap.docs.forEach(d => logBatch.delete(d.ref));
      if (!logsSnap.empty) await logBatch.commit();
    }
    addLog(`은행 초기화 완료 (${students.length}명, 예치금·이자·로그 삭제)`, 'success');
  };

  /* ── 3. 상점 인벤토리 초기화 ── */
  const resetShop = async () => {
    const students = await fetchStudents(selectedClass);
    const studentIds = students.map(s => s.id);

    // shopInventory: {studentId}_{itemId} 형태 — studentId 접두사로 필터
    const invSnap = await getDocs(collection(db, 'shopInventory'));
    const purchasesSnap = await getDocs(collection(db, 'shopPurchases'));

    const batch = writeBatch(db);
    invSnap.docs
      .filter(d => studentIds.includes(d.data().studentId))
      .forEach(d => batch.delete(d.ref));
    purchasesSnap.docs
      .filter(d => studentIds.includes(d.data().studentId))
      .forEach(d => batch.delete(d.ref));
    await batch.commit();
    addLog(`상점 인벤토리 초기화 완료 (${students.length}명)`, 'success');
  };

  /* ── 4. 레벨/경험치 초기화 ── */
  const resetLevel = async () => {
    const students = await fetchStudents(selectedClass);
    const batch = writeBatch(db);
    students.forEach(s => {
      batch.update(doc(db, 'students', s.id), { level: 1, exp: 0, maxExp: 100 });
    });
    await batch.commit();
    addLog(`레벨/경험치 초기화 완료 (${students.length}명)`, 'success');
  };

  /* ── 5. 이용권 초기화 ── */
  const resetTickets = async () => {
    const students = await fetchStudents(selectedClass);
    const batch = writeBatch(db);
    students.forEach(s => {
      batch.update(doc(db, 'students', s.id), {
        tickets: { dungeon: 3, bossRaid: 1, arena: 5 },
      });
    });
    await batch.commit();
    addLog(`이용권 초기화 완료 (${students.length}명)`, 'success');
  };

  /* ── 6. 퀘스트 완료 기록 초기화 ── */
  const resetQuestCompletions = async () => {
    const students = await fetchStudents(selectedClass);
    const studentIds = new Set(students.map(s => s.id));

    const questsSnap = await getDocs(collection(db, 'quests'));
    const batch = writeBatch(db);
    let count = 0;

    for (const questDoc of questsSnap.docs) {
      const completionsSnap = await getDocs(
        collection(db, 'quests', questDoc.id, 'completions')
      );
      completionsSnap.docs
        .filter(d => studentIds.has(d.id))
        .forEach(d => { batch.delete(d.ref); count++; });
    }
    await batch.commit();
    addLog(`퀘스트 완료 기록 초기화 완료 (${count}건 삭제)`, 'success');
  };

  /* ── 7. 학급 삭제 ── */
  const deleteClass = async () => {
    addLog('학급 삭제 시작...', 'info');
    const students = await fetchStudents(selectedClass);
    const studentIds = students.map(s => s.id);
    const teacherUid = selectedClass.teacherUid;

    // 배치 단위 helper (500개 제한)
    const batchDelete = async (refs) => {
      for (let i = 0; i < refs.length; i += 490) {
        const b = writeBatch(db);
        refs.slice(i, i + 490).forEach(r => b.delete(r));
        await b.commit();
      }
    };

    // 학생 문서 삭제
    await batchDelete(students.map(s => doc(db, 'students', s.id)));
    addLog(`학생 ${students.length}명 삭제`, 'info');

    if (studentIds.length > 0) {
      // bankLogs
      const bankSnap = await getDocs(query(collection(db, 'bankLogs'), where('studentId', 'in', studentIds.slice(0, 30))));
      await batchDelete(bankSnap.docs.map(d => d.ref));

      // shopInventory / shopPurchases
      const invSnap = await getDocs(collection(db, 'shopInventory'));
      const purSnap = await getDocs(collection(db, 'shopPurchases'));
      await batchDelete([
        ...invSnap.docs.filter(d => studentIds.includes(d.data().studentId)).map(d => d.ref),
        ...purSnap.docs.filter(d => studentIds.includes(d.data().studentId)).map(d => d.ref),
      ]);
    }

    // teacherUid 기준 컬렉션 삭제
    if (teacherUid) {
      // quizDungeons
      const dungSnap = await getDocs(query(collection(db, 'quizDungeons'), where('teacherUid', '==', teacherUid)));
      await batchDelete(dungSnap.docs.map(d => d.ref));

      // classVotes
      const voteSnap = await getDocs(query(collection(db, 'classVotes'), where('teacherUid', '==', teacherUid)));
      await batchDelete(voteSnap.docs.map(d => d.ref));

      // boardPosts
      const boardSnap = await getDocs(query(collection(db, 'boardPosts'), where('teacherUid', '==', teacherUid)));
      await batchDelete(boardSnap.docs.map(d => d.ref));
    }

    // quests (classId 또는 teacherUid 기준)
    let questsSnap;
    if (selectedClass.id) {
      questsSnap = await getDocs(query(collection(db, 'quests'), where('classId', '==', selectedClass.id)));
    } else if (teacherUid) {
      questsSnap = await getDocs(query(collection(db, 'quests'), where('teacherUid', '==', teacherUid)));
    }
    if (questsSnap && !questsSnap.empty) {
      await batchDelete(questsSnap.docs.map(d => d.ref));
    }

    if (selectedClass?.id) {
      await batchDelete([doc(db, 'classes', selectedClass.id)]);
      addLog('학급 문서 삭제 완료', 'info');
    }
    addLog('학급 삭제 완료', 'success');
    if (onClassDeleted) onClassDeleted();
  };

  /* 선택된 학급 없을 때 */
  if (!selectedClass) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-6xl mb-4">🏫</div>
          <p className="font-extrabold text-slate-700 text-lg">학급을 먼저 선택해주세요</p>
          <p className="text-sm text-slate-400 mt-1">데이터 초기화는 학급 선택 후 이용할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* ── 헤더 ── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center text-2xl shrink-0">
              🗂️
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800">데이터 초기화</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                <span className="font-bold text-slate-700">{selectedClass.name || selectedClass.id}</span> 학급의 데이터를 초기화합니다.
              </p>
              <p className="text-xs text-rose-500 font-bold mt-2 bg-rose-50 px-3 py-1.5 rounded-lg inline-block">
                ⚠️ 초기화된 데이터는 복구할 수 없습니다. 신중하게 실행해주세요.
              </p>
            </div>
          </div>
        </div>

        {/* ── 경제 데이터 ── */}
        <section>
          <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3 px-1">경제 데이터</h2>
          <div className="space-y-3">
            <ActionCard
              icon="💰"
              title="재화 초기화"
              description="모든 학생의 골드·다이아를 0으로 초기화합니다."
              buttonLabel="초기화"
              loading={loadingKey === 'currency'}
              onAction={() => openModal(
                'currency',
                '재화를 초기화할까요?',
                `${selectedClass.name || '선택된 학급'} 학생 전체의 골드·다이아가 0이 됩니다.`,
                false,
                resetCurrency
              )}
            />
            <ActionCard
              icon="🏦"
              title="은행 초기화"
              description="예치금·이자를 0으로 초기화하고 거래 로그를 삭제합니다."
              buttonLabel="초기화"
              loading={loadingKey === 'bank'}
              onAction={() => openModal(
                'bank',
                '은행 데이터를 초기화할까요?',
                '예치금, 이자, 거래 로그가 모두 삭제됩니다.',
                false,
                resetBank
              )}
            />
            <ActionCard
              icon="🛒"
              title="상점 인벤토리 초기화"
              description="모든 학생의 구매 내역과 보유 아이템을 삭제합니다."
              buttonLabel="초기화"
              loading={loadingKey === 'shop'}
              onAction={() => openModal(
                'shop',
                '상점 인벤토리를 초기화할까요?',
                '구매 내역과 보유 아이템이 모두 삭제됩니다.',
                false,
                resetShop
              )}
            />
          </div>
        </section>

        {/* ── 성장 데이터 ── */}
        <section>
          <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3 px-1">성장 데이터</h2>
          <div className="space-y-3">
            <ActionCard
              icon="⭐"
              title="레벨 / 경험치 초기화"
              description="모든 학생의 레벨을 1, 경험치를 0으로 초기화합니다."
              buttonLabel="초기화"
              loading={loadingKey === 'level'}
              onAction={() => openModal(
                'level',
                '레벨·경험치를 초기화할까요?',
                '모든 학생이 레벨 1, 경험치 0으로 돌아갑니다.',
                false,
                resetLevel
              )}
            />
            <ActionCard
              icon="🎫"
              title="이용권 초기화"
              description="모든 학생의 이용권을 기본값(던전 3, 퀴즈레이드 1, 투기장 5)으로 초기화합니다."
              buttonLabel="초기화"
              loading={loadingKey === 'tickets'}
              onAction={() => openModal(
                'tickets',
                '이용권을 초기화할까요?',
                '던전 3장, 퀴즈레이드 1장, 투기장 5장으로 복원됩니다.',
                false,
                resetTickets
              )}
            />
          </div>
        </section>

        {/* ── 활동 기록 ── */}
        <section>
          <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3 px-1">활동 기록</h2>
          <div className="space-y-3">
            <ActionCard
              icon="📋"
              title="퀘스트 완료 기록 초기화"
              description="이 학급 학생들의 퀘스트 완료·보상 수령 기록을 삭제합니다."
              buttonLabel="초기화"
              loading={loadingKey === 'quests'}
              onAction={() => openModal(
                'quests',
                '퀘스트 기록을 초기화할까요?',
                '이 학급 학생들의 퀘스트 완료·보상 기록이 모두 삭제됩니다.',
                false,
                resetQuestCompletions
              )}
            />
          </div>
        </section>

        {/* ── 위험 구역 ── */}
        <section className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🚨</span>
            <h2 className="font-extrabold text-rose-700 text-sm uppercase tracking-widest">위험 구역</h2>
          </div>
          <ActionCard
            icon="🗑️"
            title="학급 삭제"
            description="학급의 모든 학생 계정, 퀘스트, 퀴즈 던전, 학급 투표, 게시글, 은행 로그, 상점 데이터를 영구 삭제합니다. 절대 되돌릴 수 없습니다."
            buttonLabel="학급 삭제"
            danger
            loading={loadingKey === 'deleteClass'}
            onAction={() => openModal(
              'deleteClass',
              '학급을 삭제할까요?',
              '모든 학생 계정과 학급 데이터가 영구적으로 삭제됩니다. 이 작업은 절대 되돌릴 수 없습니다.',
              true,
              deleteClass,
              '삭제'
            )}
          />
        </section>

        {/* ── 실행 로그 ── */}
        {logs.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">실행 로그</h2>
              <button
                onClick={() => setLogs([])}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                지우기
              </button>
            </div>
            <div className="bg-slate-800 rounded-2xl p-4 space-y-1.5 max-h-56 overflow-y-auto">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-2 text-xs font-mono">
                  <span className="text-slate-500 shrink-0">[{log.time}]</span>
                  <span className={
                    log.type === 'success' ? 'text-emerald-400' :
                    log.type === 'error'   ? 'text-rose-400' :
                    'text-slate-300'
                  }>
                    {log.type === 'success' ? '✓ ' : log.type === 'error' ? '✗ ' : '· '}
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* ── 확인 모달 ── */}
      {modal && (
        <ConfirmModal
          title={modal.title}
          description={modal.description}
          danger={modal.danger}
          confirmWord={modal.confirmWord}
          onConfirm={confirmModal}
          onCancel={closeModal}
        />
      )}
    </div>
  );
}
