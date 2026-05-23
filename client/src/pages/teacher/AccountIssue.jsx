import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, writeBatch, doc, updateDoc, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebase';

const newPin = () => Math.floor(1000 + Math.random() * 9000).toString();

// studentCode에서 자리번호 추출 (예: "SINSEOK-5-01" → 1)
const getSeatNum = (code) => parseInt(code?.split('-').pop()) || 0;

// 기존 학생코드에서 prefix 추출 (예: "SINSEOK-5-01" → "SINSEOK-5")
const getPrefix = (students) => {
  if (students.length === 0) return 'SINSEOK-5';
  const code = students[0].studentCode || '';
  const parts = code.split('-');
  return parts.slice(0, parts.length - 1).join('-') || 'SINSEOK-5';
};

function AccountIssue({ user, selectedClass }) {
  const [students, setStudents]         = useState([]);
  const [studentCount, setStudentCount] = useState(25);
  const [isLoading, setIsLoading]       = useState(false);

  // 인라인 편집 상태
  const [editingId, setEditingId]   = useState(null);
  const [editField, setEditField]   = useState('');
  const [editValue, setEditValue]   = useState('');
  const inputRef = useRef(null);

  // 학생 추가 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSeatNum, setAddSeatNum]     = useState('');
  const [addName, setAddName]           = useState('');
  const [isAdding, setIsAdding]         = useState(false);
  const [toast, setToast]               = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (message, onConfirm) => setConfirmState({ message, onConfirm });

  const fetchStudents = async () => {
    if (!selectedClass?.id && !selectedClass?.teacherUid) { setStudents([]); return; }
    try {
      const q = selectedClass.id
        ? query(collection(db, 'students'), where('classId',    '==', selectedClass.id))
        : query(collection(db, 'students'), where('teacherUid', '==', selectedClass.teacherUid));
      const snap = await getDocs(q);
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => getSeatNum(a.studentCode) - getSeatNum(b.studentCode));
      setStudents(list);
    } catch (err) {
      console.error('학생 목록 에러:', err);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  // 편집 시작
  const startEdit = (student, field) => {
    setEditingId(student.id);
    setEditField(field);
    setEditValue(field === 'name' ? (student.name || '') : String(getSeatNum(student.studentCode)));
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // 편집 저장
  const saveEdit = async () => {
    if (!editingId) return;
    const trimmed = editValue.trim();
    try {
      if (editField === 'name') {
        await updateDoc(doc(db, 'students', editingId), { name: trimmed });
        setStudents(prev => prev.map(s => s.id === editingId ? { ...s, name: trimmed } : s));
      }
      // seatNum은 studentCode가 ID이므로 표시만 (실제 변경 불가)
    } catch (err) {
      console.error('저장 에러:', err);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setEditingId(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditingId(null);
  };

  // 일괄 계정 생성
  const generateStudentAccounts = () => {
    showConfirm(
      `정말 ${studentCount}명의 학생 계정을 새로 생성하시겠습니까?\n기존 데이터가 있다면 덮어쓸 수 있으니 주의하세요!`,
      async () => {
        setIsLoading(true);
        try {
          const batch = writeBatch(db);
          for (let i = 1; i <= studentCount; i++) {
            const num         = String(i).padStart(2, '0');
            const studentCode = `SINSEOK-5-${num}`;
            const pin         = Math.floor(1000 + Math.random() * 9000).toString();
            const studentRef  = doc(db, 'students', studentCode);

            batch.set(studentRef, {
              studentCode,
              pin,
              name:       '',
              diamonds:   1000,
              gold:       0,
              level:      1,
              exp:        0,
              maxExp:     1000,
              parts:      '',
              teacherUid: user.uid,
            });
          }
          await batch.commit();
          showToast('학생 계정이 발급되었습니다!');
          fetchStudents();
        } catch (err) {
          console.error('계정 생성 에러:', err);
          showToast('계정 생성에 실패했습니다.', 'error');
        } finally {
          setIsLoading(false);
        }
      }
    );
  };

  // 개별 PIN 초기화
  const resetPin = async (student) => {
    const pin = newPin();
    try {
      await updateDoc(doc(db, 'students', student.id), { pin });
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, pin } : s));
    } catch (err) {
      showToast('PIN 초기화 실패', 'error');
    }
  };

  // 전체 PIN 재생성
  const resetAllPins = () => {
    showConfirm('전체 학생 PIN을 새로 생성할까요?', async () => {
      setIsLoading(true);
      try {
        const batch = writeBatch(db);
        const updated = students.map(s => {
          const pin = newPin();
          batch.update(doc(db, 'students', s.id), { pin });
          return { ...s, pin };
        });
        await batch.commit();
        setStudents(updated);
        showToast('전체 PIN이 재생성되었습니다.');
      } catch (err) {
        showToast('PIN 재생성 실패', 'error');
      } finally {
        setIsLoading(false);
      }
    });
  };

  // 학생 1명 추가
  const addStudent = async () => {
    const num = parseInt(addSeatNum);
    if (!num || num < 1 || num > 99) return showToast('1~99 사이의 번호를 입력해주세요.', 'error');
    const prefix      = getPrefix(students);
    const studentCode = `${prefix}-${String(num).padStart(2, '0')}`;
    if (students.some(s => s.studentCode === studentCode)) {
      return showToast(`${studentCode} 코드가 이미 존재합니다.`, 'error');
    }
    setIsAdding(true);
    try {
      const pin  = newPin();
      const data = {
        studentCode,
        pin,
        name:       addName.trim(),
        diamonds:   1000,
        gold:       0,
        level:      1,
        exp:        0,
        maxExp:     1000,
        parts:      '',
        teacherUid: user.uid,
      };
      await setDoc(doc(db, 'students', studentCode), data);
      setStudents(prev =>
        [...prev, { id: studentCode, ...data }]
          .sort((a, b) => getSeatNum(a.studentCode) - getSeatNum(b.studentCode))
      );
      setShowAddModal(false);
      setAddSeatNum('');
      setAddName('');
    } catch (err) {
      console.error('학생 추가 에러:', err);
      showToast('학생 추가에 실패했습니다.', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  // 학생 데이터 초기화 (재화·캐릭터 → 초기값)
  const resetStudentData = (student) => {
    showConfirm(
      `[${student.studentCode}] ${student.name || '(이름없음)'} 학생의\n경험치·골드·다이아·캐릭터를 초기화할까요?\n\n💎 1,000 다이아 / 🪙 0 골드 / Lv.1 / 캐릭터 없음`,
      async () => {
        try {
          await updateDoc(doc(db, 'students', student.id), {
            gold: 0, diamonds: 1000, level: 1, exp: 0, maxExp: 1000,
            parts: {}, characterImage: '',
          });
          setStudents(prev => prev.map(s => s.id === student.id
            ? { ...s, gold: 0, diamonds: 1000, level: 1, exp: 0, maxExp: 1000, parts: {}, characterImage: '' }
            : s
          ));
          showToast(`${student.name || student.studentCode} 초기화 완료!`);
        } catch (err) {
          console.error(err);
          showToast('초기화에 실패했습니다.', 'error');
        }
      }
    );
  };

  // 학생 1명 삭제
  const deleteStudent = (student) => {
    showConfirm(
      `정말 [${student.studentCode}] ${student.name || '(이름없음)'} 계정을 삭제하시겠습니까?\n\n보유 재화, 퀘스트 기록 등 모든 데이터가 사라집니다.`,
      async () => {
        try {
          await deleteDoc(doc(db, 'students', student.id));
          setStudents(prev => prev.filter(s => s.id !== student.id));
        } catch (err) {
          console.error('삭제 에러:', err);
          showToast('삭제에 실패했습니다.', 'error');
        }
      }
    );
  };

  // 이름 일괄 저장 (여러 명을 한 번에 편집한 경우 대비)
  const handleRowBlur = () => {
    // 약간의 딜레이로 같은 행 내 다른 셀 클릭 감지
    setTimeout(() => {
      if (editingId) saveEdit();
    }, 150);
  };

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      {/* 인쇄 전용 카드 영역 (화면에선 숨김) */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-cards, #print-cards * { visibility: visible; }
          #print-cards {
            position: fixed; top: 0; left: 0; width: 100%;
            display: grid !important;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px; padding: 12px;
          }
          .print-card {
            border: 1.5px dashed #aaa;
            border-radius: 8px;
            padding: 10px 14px;
            page-break-inside: avoid;
          }
        }
      `}</style>
      <div id="print-cards" style={{ display: 'none' }}>
        {students.map(s => (
          <div key={s.id} className="print-card">
            <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>LevelUp Class 학생 계정</div>
            <div style={{ fontWeight: 900, fontSize: 15 }}>{s.name || `${getSeatNum(s.studentCode)}번`}</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>
              <span style={{ color: '#555' }}>코드: </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#3730a3' }}>{s.studentCode}</span>
            </div>
            <div style={{ fontSize: 11, marginTop: 2 }}>
              <span style={{ color: '#555' }}>PIN: </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: '#e11d48', letterSpacing: 3 }}>{s.pin}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 border border-slate-200 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">👨‍🎓 학생 계정 발급</h1>
            <p className="text-slate-500 mt-1 text-sm">학생 로그인 코드, PIN, 이름을 관리합니다.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
              ➕ 학생 추가
            </button>
            <button
              onClick={resetAllPins}
              disabled={isLoading || students.length === 0}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
              🔄 전체 PIN 재생성
            </button>
            <button
              onClick={() => window.print()}
              className="bg-slate-600 hover:bg-slate-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
              🖨️ 출력
            </button>
          </div>
        </div>

        {/* 계정 생성 패널 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 border-l-4 border-indigo-500 border border-indigo-100">
          <h2 className="text-lg font-bold text-slate-800 mb-4">🚀 학생 계정 일괄 발급</h2>
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">우리 반 학생 수</label>
              <input
                type="number" min="1" max="50"
                value={studentCount}
                onChange={e => setStudentCount(e.target.value)}
                className="border border-slate-300 rounded-lg px-4 py-2 w-32 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={generateStudentAccounts}
              disabled={isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-sm transition-colors disabled:bg-slate-400">
              {isLoading ? '생성 중...' : '계정 및 PIN 번호 생성'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            * 신규 생성 시 초기 정착금 1,000 다이아가 지급됩니다. 이름 칸은 생성 후 직접 입력하거나 학생이 직접 수정합니다.
          </p>
        </div>

        {/* 학생 목록 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">📋 학생 목록 (총 {students.length}명)</h2>
            <p className="text-xs text-slate-400">이름 셀을 클릭하면 수정할 수 있습니다</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                  <th className="p-4 font-semibold w-16 text-center">번호</th>
                  <th className="p-4 font-semibold">이름</th>
                  <th className="p-4 font-semibold">로그인 코드 (ID)</th>
                  <th className="p-4 font-semibold">PIN 번호</th>
                  <th className="p-4 font-semibold">💎 다이아</th>
                  <th className="p-4 font-semibold">🪙 골드</th>
                  <th className="p-4 font-semibold w-20 text-center">초기화</th>
                  <th className="p-4 font-semibold w-16 text-center">삭제</th>
                </tr>
              </thead>
              <tbody>
                {students.length > 0 ? (
                  students.map(student => {
                    const seatNum = getSeatNum(student.studentCode);
                    const isEditingName = editingId === student.id && editField === 'name';

                    return (
                      <tr key={student.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        {/* 번호 */}
                        <td className="p-4 text-center font-bold text-slate-500 text-sm">
                          {seatNum}
                        </td>

                        {/* 이름 (인라인 편집) */}
                        <td className="p-4">
                          {isEditingName ? (
                            <div className="flex items-center gap-2">
                              <input
                                ref={inputRef}
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={handleRowBlur}
                                placeholder="이름 입력"
                                className="border-2 border-indigo-400 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none"
                              />
                              <button
                                onClick={saveEdit}
                                className="text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg font-bold hover:bg-indigo-700 transition-colors">
                                저장
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-1.5">
                                취소
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEdit(student, 'name')}
                              className="flex items-center gap-2 group w-full text-left">
                              <span className={`text-sm font-bold ${student.name ? 'text-slate-800' : 'text-slate-300 italic'}`}>
                                {student.name || '(미입력)'}
                              </span>
                              <span className="text-slate-300 group-hover:text-indigo-400 transition-colors text-xs">✏️</span>
                            </button>
                          )}
                        </td>

                        {/* 로그인 코드 */}
                        <td className="p-4 font-mono font-medium text-indigo-600 text-sm">
                          {student.studentCode}
                        </td>

                        {/* PIN */}
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-rose-500 tracking-widest text-sm">
                              {student.pin || '없음'}
                            </span>
                            <button
                              onClick={() => resetPin(student)}
                              className="text-[10px] text-slate-400 hover:text-rose-500 hover:bg-rose-50 px-1.5 py-0.5 rounded border border-slate-200 hover:border-rose-200 transition-colors"
                              title="PIN 초기화">
                              🔄
                            </button>
                          </div>
                        </td>

                        {/* 다이아 */}
                        <td className="p-4 font-semibold text-slate-700 text-sm">
                          {(student.diamonds || 0).toLocaleString()}
                        </td>

                        {/* 골드 */}
                        <td className="p-4 font-semibold text-slate-700 text-sm">
                          {(student.gold || 0).toLocaleString()}
                        </td>

                        {/* 데이터 초기화 */}
                        <td className="p-4 text-center">
                          <button
                            onClick={() => resetStudentData(student)}
                            className="text-slate-300 hover:text-amber-500 hover:bg-amber-50 w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-colors"
                            title="데이터 초기화">
                            🔄
                          </button>
                        </td>

                        {/* 삭제 */}
                        <td className="p-4 text-center">
                          <button
                            onClick={() => deleteStudent(student)}
                            className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-colors"
                            title="계정 삭제">
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-slate-400">
                      아직 생성된 학생 계정이 없습니다. 위에서 계정을 발급해 주세요!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* 학생 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-5 bg-emerald-600 text-white font-bold text-lg flex justify-between items-center">
              <span>➕ 학생 추가</span>
              <button onClick={() => setShowAddModal(false)} className="text-emerald-200 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  번호 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number" min="1" max="99"
                  value={addSeatNum}
                  onChange={e => setAddSeatNum(e.target.value)}
                  placeholder="예: 26"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
                {addSeatNum && (
                  <p className="text-xs text-slate-400 mt-1">
                    생성 코드: <span className="font-mono font-bold text-indigo-600">
                      {getPrefix(students)}-{String(parseInt(addSeatNum) || 0).padStart(2, '0')}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">이름 (선택)</label>
                <input
                  type="text"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addStudent()}
                  placeholder="나중에 입력해도 됩니다"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">
                📌 PIN은 자동 발급됩니다. 초기 지급금: 💎 1,000 다이아
              </p>
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => { setShowAddModal(false); setAddSeatNum(''); setAddName(''); }}
                className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
                취소
              </button>
              <button
                onClick={addStudent}
                disabled={isAdding || !addSeatNum}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-40 transition-colors">
                {isAdding ? '추가 중...' : '추가하기'}
              </button>
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

export default AccountIssue;
