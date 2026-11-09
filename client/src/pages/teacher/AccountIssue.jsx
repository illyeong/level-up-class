import { useState, useEffect } from 'react';
import { collection, getDocs, writeBatch, doc, updateDoc, setDoc, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../../firebase';
import { adjustPublicStats } from '../../utils/publicStats';

const newPin = () => Math.floor(1000 + Math.random() * 9000).toString();

// studentCode에서 자리번호 추출 (예: "SINSEOK-5-01" → 1)
const getSeatNum = (code) => {
  const match = String(code || '').match(/(\d{1,2})$/);
  return match ? parseInt(match[1], 10) : 0;
};

const getSchoolAbbr = (name = '') =>
  name.replace(/초등학교$/, '').replace(/중학교$/, '').replace(/고등학교$/, '').replace(/학교$/, '');

const getClassCodePrefix = (selectedClass, students = []) => {
  if (students.length > 0) {
    const code = students[0].studentCode || '';
    if (code.includes('-')) {
      const parts = code.split('-');
      return parts.slice(0, parts.length - 1).join('-') || null;
    }
    return code.slice(0, -2) || null;
  }

  const schoolAbbr = getSchoolAbbr(selectedClass?.schoolName || '');
  const grade = selectedClass?.grade;
  const classNumber = selectedClass?.classNumber;

  return schoolAbbr && grade && classNumber
    ? `${schoolAbbr}${grade}${String(classNumber).padStart(2, '0')}`
    : null;
};

const makeStudentCode = (selectedClass, students, seatNum) => {
  const prefix = getClassCodePrefix(selectedClass, students);
  if (!prefix) return '';
  const padded = String(seatNum).padStart(2, '0');
  return prefix.includes('-') ? `${prefix}-${padded}` : `${prefix}${padded}`;
};

function AccountIssue({ user, selectedClass }) {
  const [students, setStudents]         = useState([]);
  const [studentCount, setStudentCount] = useState(selectedClass?.studentCount || 25);
  const [isLoading, setIsLoading]       = useState(false);
  const [isListLoading, setIsListLoading] = useState(true);
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedIds, setSelectedIds]   = useState([]);
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  // 인라인 편집 상태
  const [editingId, setEditingId]   = useState(null);
  const [editField, setEditField]   = useState('');
  const [editValue, setEditValue]   = useState('');

  // 학생 추가 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSeatNum, setAddSeatNum]     = useState('');
  const [addName, setAddName]           = useState('');
  const [isAdding, setIsAdding]         = useState(false);
  const [toast, setToast]               = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const teacherUid = selectedClass?.teacherUid || user?.uid || null;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (message, onConfirm) => setConfirmState({ message, onConfirm });

  const fetchStudents = async () => {
    if (!selectedClass?.id && !teacherUid) {
      setStudents([]);
      setIsListLoading(false);
      return;
    }
    setIsListLoading(true);
    try {
      const q = selectedClass.id
        ? query(collection(db, 'students'), where('classId',    '==', selectedClass.id))
        : query(collection(db, 'students'), where('teacherUid', '==', teacherUid));
      const snap = await getDocs(q);
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => getSeatNum(a.studentCode) - getSeatNum(b.studentCode));
      setStudents(list);
      setSelectedIds(prev => prev.filter(id => list.some(student => student.id === id)));
    } catch (err) {
      console.error('학생 목록 에러:', err);
      showToast('학생 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      setIsListLoading(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => { fetchStudents(); }, [selectedClass?.id, teacherUid]);
  useEffect(() => {
    setStudentCount(selectedClass?.studentCount || 25);
    setSearchQuery('');
    setSelectedIds([]);
  }, [selectedClass?.id, selectedClass?.studentCount]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredStudents = students.filter(student => {
    if (!normalizedSearch) return true;
    const seatNum = String(getSeatNum(student.studentCode));
    return String(student.name || '').toLowerCase().includes(normalizedSearch)
      || String(student.studentCode || '').toLowerCase().includes(normalizedSearch)
      || seatNum === normalizedSearch;
  });
  const selectedSet = new Set(selectedIds);
  const printableStudents = selectedIds.length > 0
    ? students.filter(student => selectedSet.has(student.id))
    : filteredStudents;
  const namedCount = students.filter(student => String(student.name || '').trim()).length;
  const classLabel = [
    selectedClass?.schoolName,
    selectedClass?.grade ? `${selectedClass.grade}학년` : '',
    selectedClass?.classNumber ? `${selectedClass.classNumber}반` : '',
  ].filter(Boolean).join(' · ') || 'LevelUp Class';
  const allVisibleSelected = filteredStudents.length > 0
    && filteredStudents.every(student => selectedSet.has(student.id));

  const toggleStudent = (studentId) => {
    setSelectedIds(prev => prev.includes(studentId)
      ? prev.filter(id => id !== studentId)
      : [...prev, studentId]);
  };

  const toggleVisibleStudents = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(filteredStudents.map(student => student.id));
      setSelectedIds(prev => prev.filter(id => !visibleIds.has(id)));
      return;
    }
    setSelectedIds(prev => Array.from(new Set([
      ...prev,
      ...filteredStudents.map(student => student.id),
    ])));
  };

  const copyText = async (text, successMessage) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
    } catch (err) {
      console.error('클립보드 복사 에러:', err);
      showToast('복사하지 못했습니다. 브라우저 권한을 확인해주세요.', 'error');
    }
  };

  const copyStudentLogin = (student) => copyText(
    `${getSeatNum(student.studentCode)}번 ${student.name || '(이름 미입력)'}\n로그인 코드: ${student.studentCode}\nPIN: ${student.pin || '없음'}`,
    `${student.name || `${getSeatNum(student.studentCode)}번`} 로그인 정보를 복사했습니다.`,
  );

  const copyLoginList = () => {
    if (printableStudents.length === 0) return showToast('복사할 학생이 없습니다.', 'error');
    const text = printableStudents.map(student => (
      `${getSeatNum(student.studentCode)}번\t${student.name || '(이름 미입력)'}\t${student.studentCode}\tPIN ${student.pin || '없음'}`
    )).join('\n');
    return copyText(text, `${printableStudents.length}명의 로그인 정보를 복사했습니다.`);
  };

  const getNextSeatNum = () => {
    const used = new Set(students.map(student => getSeatNum(student.studentCode)));
    for (let seat = 1; seat <= 99; seat += 1) if (!used.has(seat)) return seat;
    return '';
  };

  const openAddModal = () => {
    setAddSeatNum(String(getNextSeatNum()));
    setAddName('');
    setShowAddModal(true);
  };

  // 편집 시작
  const startEdit = (student, field) => {
    setEditingId(student.id);
    setEditField(field);
    setEditValue(field === 'name' ? (student.name || '') : String(getSeatNum(student.studentCode)));
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

  // 빠진 번호의 계정만 안전하게 일괄 생성
  const generateStudentAccounts = () => {
    const targetCount = Math.min(99, Math.max(1, Number(studentCount) || 0));
    const usedSeats = new Set(students.map(student => getSeatNum(student.studentCode)));
    const missingSeats = Array.from({ length: targetCount }, (_, index) => index + 1)
      .filter(seat => !usedSeats.has(seat));
    if (missingSeats.length === 0) {
      showToast(`1~${targetCount}번 계정이 모두 준비되어 있습니다.`);
      return;
    }
    showConfirm(
      `1~${targetCount}번 중 빠진 ${missingSeats.length}명의 계정만 발급할까요?\n\n기존 학생 계정과 데이터는 변경하지 않습니다.`,
      async () => {
        setIsLoading(true);
        try {
          if (!teacherUid) throw new Error('교사 정보가 없습니다.');
          const batch = writeBatch(db);
          for (const i of missingSeats) {
            const studentCode = makeStudentCode(selectedClass, students, i);
            if (!studentCode) throw new Error('학급 코드 정보를 만들 수 없습니다.');
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
              maxExp:     100,
              parts:      {},
              characterImage: '',
              tickets:    { dungeon: 3, bossRaid: 1, arena: 5 },
              classId:    selectedClass?.id || null,
              teacherUid,
              createdAt:   serverTimestamp(),
            });
          }
          await batch.commit();
          await adjustPublicStats({ studentDelta: missingSeats.length });
          showToast(`${missingSeats.length}명의 계정이 발급되었습니다.`);
          await fetchStudents();
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
      showToast(`${student.name || `${getSeatNum(student.studentCode)}번`} 학생의 PIN을 재발급했습니다.`);
    } catch {
      showToast('PIN 초기화 실패', 'error');
    }
  };

  // 선택된 학생이 있으면 선택 학생, 없으면 전체 학생 PIN 재생성
  const resetAllPins = () => {
    const targets = selectedIds.length > 0
      ? students.filter(student => selectedSet.has(student.id))
      : students;
    if (targets.length === 0) return;
    const targetLabel = selectedIds.length > 0 ? `선택한 ${targets.length}명` : `전체 ${targets.length}명`;
    showConfirm(`${targetLabel}의 PIN을 새로 발급할까요?\n기존 PIN으로는 로그인할 수 없게 됩니다.`, async () => {
      setIsLoading(true);
      try {
        const batch = writeBatch(db);
        const nextPins = new Map();
        targets.forEach(student => {
          const pin = newPin();
          nextPins.set(student.id, pin);
          batch.update(doc(db, 'students', student.id), { pin });
        });
        await batch.commit();
        setStudents(prev => prev.map(student => nextPins.has(student.id)
          ? { ...student, pin: nextPins.get(student.id) }
          : student));
        showToast(`${targetLabel}의 PIN이 재발급되었습니다.`);
      } catch {
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
    const studentCode = makeStudentCode(selectedClass, students, num);
    if (!studentCode) return showToast('학급 정보를 확인할 수 없어 코드를 만들 수 없습니다.', 'error');
    if (students.some(s => s.studentCode === studentCode)) {
      return showToast(`${studentCode} 코드가 이미 존재합니다.`, 'error');
    }
    setIsAdding(true);
    try {
      if (!teacherUid) throw new Error('교사 정보가 없습니다.');
      const pin  = newPin();
      const data = {
        studentCode,
        pin,
        name:       addName.trim(),
        diamonds:   1000,
        gold:       0,
        level:      1,
        exp:        0,
        maxExp:     100,
        parts:      {},
        characterImage: '',
        tickets:    { dungeon: 3, bossRaid: 1, arena: 5 },
        classId:    selectedClass?.id || null,
        teacherUid,
        createdAt:   serverTimestamp(),
      };
      await setDoc(doc(db, 'students', studentCode), data);
      await adjustPublicStats({ studentDelta: 1 });
      setStudents(prev =>
        [...prev, { id: studentCode, ...data }]
          .sort((a, b) => getSeatNum(a.studentCode) - getSeatNum(b.studentCode))
      );
      setShowAddModal(false);
      setAddSeatNum('');
      setAddName('');
      showToast(`${data.name || `${num}번`} 학생 계정을 추가했습니다.`);
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
            gold: 0, diamonds: 1000, level: 1, exp: 0, maxExp: 100,
            parts: {}, characterImage: '',
          });
          setStudents(prev => prev.map(s => s.id === student.id
            ? { ...s, gold: 0, diamonds: 1000, level: 1, exp: 0, maxExp: 100, parts: {}, characterImage: '' }
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
          await adjustPublicStats({ studentDelta: -1 });
          setStudents(prev => prev.filter(s => s.id !== student.id));
          setSelectedIds(prev => prev.filter(id => id !== student.id));
          showToast('학생 계정을 삭제했습니다.');
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
    <div className="account-issue-page min-h-screen bg-slate-100 px-3 py-5 sm:px-6 sm:py-8">
      {/* 인쇄 전용 카드 영역 (화면에선 숨김) */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body * { visibility: hidden; }
          #print-cards, #print-cards * { visibility: visible; }
          #print-cards {
            position: absolute; top: 0; left: 0; width: 100%;
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 4mm;
            padding: 0;
            color: #0f172a;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-card {
            box-sizing: border-box;
            min-height: 74mm;
            overflow: hidden;
            border: 1px solid #cbd5e1;
            border-radius: 4mm;
            background: #fff;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .print-card-accent { height: 2.2mm; background: #4f46e5; }
          .print-card-body { padding: 4mm 4.5mm 3mm; }
          .print-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 3mm; }
          .print-brand { display: flex; align-items: center; gap: 2.2mm; }
          .print-brand-mark { display: flex; width: 8mm; height: 8mm; align-items: center; justify-content: center; border-radius: 2.2mm; background: #eef2ff; color: #4338ca; font-size: 10pt; font-weight: 900; }
          .print-brand-name { font-size: 9pt; font-weight: 900; color: #1e293b; }
          .print-brand-sub { margin-top: .5mm; font-size: 6.5pt; font-weight: 700; color: #94a3b8; }
          .print-class-chip { max-width: 42mm; overflow: hidden; border-radius: 99px; background: #f1f5f9; padding: 1.5mm 2.5mm; color: #475569; font-size: 6.5pt; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
          .print-student-row { display: grid; grid-template-columns: minmax(0, 1fr) 27mm; gap: 4mm; margin-top: 4mm; align-items: center; }
          .print-seat { color: #6366f1; font-size: 8pt; font-weight: 900; }
          .print-name { margin-top: .8mm; overflow: hidden; color: #0f172a; font-size: 17pt; font-weight: 900; letter-spacing: -.4pt; text-overflow: ellipsis; white-space: nowrap; }
          .print-login-box { margin-top: 3mm; border: 1px solid #e2e8f0; border-radius: 2.5mm; background: #f8fafc; padding: 2.5mm 3mm; }
          .print-login-line { display: grid; grid-template-columns: 12mm minmax(0, 1fr); align-items: center; gap: 1mm; }
          .print-login-line + .print-login-line { margin-top: 1.5mm; padding-top: 1.5mm; border-top: 1px solid #e2e8f0; }
          .print-login-label { color: #64748b; font-size: 6.5pt; font-weight: 800; }
          .print-code { overflow: hidden; color: #3730a3; font-family: ui-monospace, monospace; font-size: 8pt; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
          .print-pin { color: #e11d48; font-family: ui-monospace, monospace; font-size: 13pt; font-weight: 900; letter-spacing: 2pt; }
          .print-qr { text-align: center; }
          .print-qr-box { display: inline-flex; padding: 1.2mm; border: 1px solid #e2e8f0; border-radius: 2.5mm; background: #fff; }
          .print-qr-caption { margin-top: 1mm; color: #64748b; font-size: 6pt; font-weight: 800; }
          .print-card-footer { display: flex; align-items: center; justify-content: space-between; gap: 2mm; margin-top: 3mm; padding-top: 2.5mm; border-top: 1px dashed #cbd5e1; color: #64748b; font-size: 6.5pt; font-weight: 700; }
          .print-card-step { color: #4338ca; font-weight: 900; }
          .print-security { color: #94a3b8; white-space: nowrap; }
          .print-card:nth-child(6n) { break-after: page; page-break-after: always; }
          .print-card:last-child { break-after: auto; page-break-after: auto; }
          html, body { background: #fff !important; }
          body { margin: 0; }
          @supports not (print-color-adjust: exact) {
            .print-card-accent { background: #334155; }
          }
        }
      `}</style>
      <div id="print-cards" style={{ display: 'none' }}>
        {printableStudents.map(s => (
          <div key={s.id} className="print-card">
            <div className="print-card-accent" />
            <div className="print-card-body">
              <div className="print-card-top">
                <div className="print-brand"><div className="print-brand-mark">L</div><div><div className="print-brand-name">LevelUp Class</div><div className="print-brand-sub">STUDENT LOGIN CARD</div></div></div>
                <div className="print-class-chip">{classLabel}</div>
              </div>
              <div className="print-student-row">
                <div>
                  <div className="print-seat">{getSeatNum(s.studentCode)}번 학생</div>
                  <div className="print-name">{s.name || '이름 미입력'}</div>
                  <div className="print-login-box">
                    <div className="print-login-line"><span className="print-login-label">로그인 코드</span><span className="print-code">{s.studentCode}</span></div>
                    <div className="print-login-line"><span className="print-login-label">PIN</span><span className="print-pin">{s.pin || '없음'}</span></div>
                  </div>
                </div>
                <div className="print-qr">
                  <div className="print-qr-box"><QRCodeSVG value={`https://level-up-class.vercel.app?code=${encodeURIComponent(s.studentCode || '')}`} size={92} level="M" /></div>
                  <div className="print-qr-caption">카메라로 QR 스캔</div>
                </div>
              </div>
              <div className="print-card-footer"><span><span className="print-card-step">① QR 스캔</span> → ② PIN 입력 → ③ 로그인</span><span className="print-security">PIN을 안전하게 보관하세요</span></div>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-6xl">

        {/* 헤더 */}
        <div className="account-issue-header mb-4 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 p-5 text-white shadow-lg sm:mb-6 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-black">학급 · 학생 관리</span>
              <h1 className="mt-3 text-2xl font-black sm:text-3xl">학생 계정 발급</h1>
              <p className="mt-1 text-sm font-medium text-indigo-100">학생 이름과 로그인 정보를 한 화면에서 빠르게 관리하세요.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
              <div className="rounded-2xl bg-white/10 p-3 text-center backdrop-blur"><div className="text-2xl font-black">{students.length}</div><div className="text-[11px] font-bold text-indigo-100">전체 학생</div></div>
              <div className="rounded-2xl bg-white/10 p-3 text-center backdrop-blur"><div className="text-2xl font-black">{namedCount}</div><div className="text-[11px] font-bold text-indigo-100">이름 입력</div></div>
              <div className="rounded-2xl bg-white/10 p-3 text-center backdrop-blur"><div className="text-2xl font-black">{students.length - namedCount}</div><div className="text-[11px] font-bold text-indigo-100">이름 미입력</div></div>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:mb-6 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
            <button
              onClick={openAddModal}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700">
              ＋ 학생 추가
            </button>
            <button onClick={() => setShowBulkPanel(prev => !prev)} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-black text-indigo-700 transition hover:bg-indigo-100">여러 명 발급</button>
            <button onClick={copyLoginList} disabled={printableStudents.length === 0} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-40">로그인 정보 복사</button>
            </div>
            <div className="flex flex-wrap gap-2">
            <button
              onClick={resetAllPins}
              disabled={isLoading || students.length === 0}
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-700 transition hover:bg-amber-100 disabled:opacity-40">
              {selectedIds.length ? `선택 ${selectedIds.length}명 PIN 재발급` : '전체 PIN 재발급'}
            </button>
            <button
              onClick={() => window.print()}
              disabled={printableStudents.length === 0}
              className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-900 disabled:opacity-40">
              {selectedIds.length ? `선택 ${selectedIds.length}명 출력` : searchQuery ? `검색 결과 ${filteredStudents.length}명 출력` : '전체 QR 출력'}
            </button>
            </div>
          </div>
          {showBulkPanel && (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 sm:flex-row sm:items-end sm:justify-between">
              <div><label className="block text-xs font-black text-indigo-800">몇 번까지 계정을 준비할까요?</label><p className="mt-1 text-xs text-indigo-600">기존 학생은 유지하고, 1번부터 입력한 번호 사이의 빠진 계정만 만듭니다.</p></div>
              <div className="flex gap-2">
                <div className="relative"><input type="number" min="1" max="99" value={studentCount} onChange={event => setStudentCount(event.target.value)} className="w-24 rounded-xl border-2 border-indigo-200 bg-white px-3 py-2.5 pr-9 text-right text-sm font-black outline-none focus:border-indigo-500" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">번</span></div>
                <button onClick={generateStudentAccounts} disabled={isLoading} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-40">{isLoading ? '처리 중...' : '빠진 계정 발급'}</button>
              </div>
            </div>
          )}
        </div>

        {/* 학생 목록 */}
        <div className="account-issue-table bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="account-issue-table-toolbar border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-lg font-black text-slate-800">학생 목록</h2><p className="text-xs font-medium text-slate-400">이름을 누르면 바로 수정할 수 있습니다.</p></div>
              <div className="relative w-full sm:w-80">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
                <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="이름 · 번호 · 로그인 코드 검색" className="w-full rounded-xl border-2 border-slate-200 py-2.5 pl-9 pr-10 text-sm font-semibold outline-none transition focus:border-indigo-400" />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">✕</button>}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-black text-slate-600">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleStudents} disabled={filteredStudents.length === 0} className="h-4 w-4 rounded accent-indigo-600" />
                {searchQuery ? `검색 결과 ${filteredStudents.length}명 전체 선택` : `전체 ${students.length}명 선택`}
              </label>
              {selectedIds.length > 0 && <button onClick={() => setSelectedIds([])} className="text-xs font-black text-indigo-600 hover:text-indigo-800">선택 해제 ({selectedIds.length})</button>}
            </div>
          </div>
          {isListLoading ? (
            <div className="p-14 text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" /><p className="mt-3 text-sm font-bold text-slate-400">학생 목록을 불러오는 중...</p></div>
          ) : <><div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[980px] text-left border-collapse">
              <thead>
                <tr className="account-issue-table-head bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                  <th className="w-12 p-4"></th>
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
                {filteredStudents.length > 0 ? (
                  filteredStudents.map(student => {
                    const seatNum = getSeatNum(student.studentCode);
                    const isEditingName = editingId === student.id && editField === 'name';

                    return (
                      <tr key={student.id} className={`account-issue-row border-b border-slate-100 transition-colors ${selectedSet.has(student.id) ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}`}>
                        <td className="p-4"><input type="checkbox" checked={selectedSet.has(student.id)} onChange={() => toggleStudent(student.id)} className="h-4 w-4 rounded accent-indigo-600" aria-label={`${seatNum}번 선택`} /></td>
                        {/* 번호 */}
                        <td className="p-4 text-center font-bold text-slate-500 text-sm">
                          {seatNum}
                        </td>

                        {/* 이름 (인라인 편집) */}
                        <td className="p-4">
                          {isEditingName ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={handleRowBlur}
                                placeholder="이름 입력"
                                className="account-issue-edit-input border-2 border-indigo-400 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none"
                              />
                              <button
                                onClick={saveEdit}
                                className="account-issue-edit-save text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg font-bold hover:bg-indigo-700 transition-colors">
                                저장
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="account-issue-edit-cancel text-xs text-slate-400 hover:text-slate-600 px-1.5 py-1.5">
                                취소
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEdit(student, 'name')}
                              className="account-issue-name-button flex items-center gap-2 group w-full text-left">
                              <span className={`text-sm font-bold ${student.name ? 'text-slate-800' : 'text-slate-300 italic'}`}>
                                {student.name || '(미입력)'}
                              </span>
                              <span className="text-slate-300 group-hover:text-indigo-400 transition-colors text-xs">✏️</span>
                            </button>
                          )}
                        </td>

                        {/* 로그인 코드 */}
                        <td className="account-issue-code p-4 font-mono font-medium text-indigo-600 text-sm">
                          <div className="flex items-center gap-2"><span>{student.studentCode}</span><button onClick={() => copyStudentLogin(student)} className="rounded-lg border border-slate-200 px-2 py-1 font-sans text-[10px] font-black text-slate-500 hover:bg-white hover:text-indigo-600">복사</button></div>
                        </td>

                        {/* PIN */}
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="account-issue-pin font-mono font-bold text-rose-500 tracking-widest text-sm">
                              {student.pin || '없음'}
                            </span>
                            <button
                              onClick={() => resetPin(student)}
                              className="account-issue-pin-reset rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700 transition-colors hover:bg-amber-100"
                              title="PIN 초기화">
                              재발급
                            </button>
                          </div>
                        </td>

                        {/* 다이아 */}
                        <td className="account-issue-currency p-4 font-semibold text-slate-700 text-sm">
                          {(student.diamonds || 0).toLocaleString()}
                        </td>

                        {/* 골드 */}
                        <td className="account-issue-currency p-4 font-semibold text-slate-700 text-sm">
                          {(student.gold || 0).toLocaleString()}
                        </td>

                        {/* 데이터 초기화 */}
                        <td className="p-4 text-center">
                          <button
                            onClick={() => resetStudentData(student)}
                            className="account-issue-icon-button account-issue-reset-button text-slate-300 hover:text-amber-500 hover:bg-amber-50 w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-colors"
                            title="데이터 초기화">
                            🔄
                          </button>
                        </td>

                        {/* 삭제 */}
                        <td className="p-4 text-center">
                          <button
                            onClick={() => deleteStudent(student)}
                            className="account-issue-icon-button account-issue-delete-button text-slate-300 hover:text-rose-500 hover:bg-rose-50 w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-colors"
                            title="계정 삭제">
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="9" className="p-12 text-center text-slate-400">
                      <div className="text-4xl">{students.length ? '🔎' : '👨‍🎓'}</div>
                      <p className="mt-3 font-black text-slate-700">{students.length ? '검색 결과가 없습니다.' : '아직 학생 계정이 없습니다.'}</p>
                      <p className="mt-1 text-sm">{students.length ? '다른 이름이나 번호로 검색해보세요.' : '학생 추가 또는 여러 명 발급으로 시작하세요.'}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-100 lg:hidden">
            {filteredStudents.length > 0 ? filteredStudents.map(student => {
              const seatNum = getSeatNum(student.studentCode);
              const isEditingName = editingId === student.id && editField === 'name';
              return (
                <article key={student.id} className={`p-4 ${selectedSet.has(student.id) ? 'bg-indigo-50/60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selectedSet.has(student.id)} onChange={() => toggleStudent(student.id)} className="mt-1 h-4 w-4 rounded accent-indigo-600" aria-label={`${seatNum}번 선택`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-600">{seatNum}</span>
                        {isEditingName ? (
                          <div className="flex min-w-0 flex-1 gap-1">
                            <input autoFocus value={editValue} onChange={event => setEditValue(event.target.value)} onKeyDown={handleKeyDown} onBlur={handleRowBlur} placeholder="이름 입력" className="min-w-0 flex-1 rounded-lg border-2 border-indigo-400 px-2 py-1 text-sm font-bold outline-none" />
                            <button onMouseDown={event => event.preventDefault()} onClick={saveEdit} className="rounded-lg bg-indigo-600 px-2 text-xs font-black text-white">저장</button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(student, 'name')} className={`truncate text-sm font-black ${student.name ? 'text-slate-800' : 'italic text-slate-300'}`}>{student.name || '(이름 미입력)'} <span className="text-slate-300">✎</span></button>
                        )}
                      </div>
                      <div className="mt-3 rounded-xl bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-xs font-bold text-indigo-700">{student.studentCode}</span><button onClick={() => copyStudentLogin(student)} className="shrink-0 rounded-lg bg-white px-2 py-1 text-[11px] font-black text-indigo-600 shadow-sm">복사</button></div>
                        <div className="mt-1 font-mono text-base font-black tracking-[0.2em] text-rose-500">PIN {student.pin || '없음'}</div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex gap-3 text-xs font-black"><span className="text-sky-600">💎 {(student.diamonds || 0).toLocaleString()}</span><span className="text-amber-600">🪙 {(student.gold || 0).toLocaleString()}</span></div>
                        <details className="relative">
                          <summary className="cursor-pointer list-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500">관리</summary>
                          <div className="absolute bottom-9 right-0 z-20 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl"><button onClick={() => resetPin(student)} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-black text-amber-700 hover:bg-amber-50">PIN 재발급</button><button onClick={() => resetStudentData(student)} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-black text-slate-600 hover:bg-slate-50">데이터 초기화</button><button onClick={() => deleteStudent(student)} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-black text-rose-500 hover:bg-rose-50">계정 삭제</button></div>
                        </details>
                      </div>
                    </div>
                  </div>
                </article>
              );
            }) : (
              <div className="p-12 text-center"><div className="text-4xl">{students.length ? '🔎' : '👨‍🎓'}</div><p className="mt-3 font-black text-slate-700">{students.length ? '검색 결과가 없습니다.' : '아직 학생 계정이 없습니다.'}</p><p className="mt-1 text-sm text-slate-400">{students.length ? '다른 이름이나 번호로 검색해보세요.' : '학생 추가 또는 여러 명 발급으로 시작하세요.'}</p></div>
            )}
          </div></>}
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
                      {makeStudentCode(selectedClass, students, parseInt(addSeatNum) || 0)}
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
