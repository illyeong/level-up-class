import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, query, where, writeBatch, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { applyClassQuickSetup } from '../../utils/classQuickSetup';
import { getOperationModeFields } from '../../utils/operationModePresets';

// ?? ?숆탳紐????쎌묶 (珥덈벑?숆탳/以묓븰援?怨좊벑?숆탳 ?쒓굅) ??????????????
const getSchoolAbbr = (name = '') =>
  name.replace(/초등학교$/, '').replace(/중학교$/, '').replace(/고등학교$/, '').replace(/학교$/, '');

// ?? ?숈깮 肄붾뱶 ?앹꽦 ????????????????????????????????????????????
const makeStudentCode = (schoolName, grade, classNum, studentNum) => {
  const abbr = getSchoolAbbr(schoolName);
  return `${abbr}${grade}${String(classNum).padStart(2, '0')}${String(studentNum).padStart(2, '0')}`;
};

const newPin = () => Math.floor(1000 + Math.random() * 9000).toString();

// ?? ?ㅽ겕濡??쇱빱 ???????????????????????????????????????????????
function ScrollPicker({ items, value, onChange, label }) {
  const ITEM_H = 44;
  const ref    = useRef(null);
  const isInit = useRef(false);

  // ?좏깮媛????ㅽ겕濡??꾩튂
  useEffect(() => {
    if (!ref.current) return;
    const idx = items.findIndex(i => String(i.value) === String(value));
    if (idx < 0) return;
    ref.current.scrollTop = idx * ITEM_H;
    isInit.current = true;
  }, []);

  const handleScroll = () => {
    if (!ref.current || !isInit.current) return;
    const idx = Math.round(ref.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    if (String(items[clamped]?.value) !== String(value)) {
      onChange(String(items[clamped].value));
    }
  };

  const snapTo = (idx) => {
    if (!ref.current) return;
    ref.current.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs font-extrabold text-slate-600">{label}</span>
      <div className="relative w-24 sm:w-28">
        {/* ?좏깮 ?곸뿭 ?섏씠?쇱씠??*/}
        <div className="absolute inset-x-0 pointer-events-none z-10"
          style={{ top: ITEM_H * 2, height: ITEM_H }}>
          <div className="mx-1 h-full rounded-lg border-y-2 border-cyan-500 bg-cyan-50/80" />
        </div>
        {/* ?꾩븘??洹몃씪?곗씠???섏씠??*/}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white to-transparent pointer-events-none z-20 rounded-t-2xl" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none z-20 rounded-b-2xl" />

        <div
          ref={ref}
          onScroll={handleScroll}
          className="scrollbar-hide overflow-y-scroll rounded-2xl border border-slate-200 bg-white shadow-inner shadow-slate-200/50"
          style={{
            height: ITEM_H * 5,
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch',
          }}>
          {/* ?곷떒 ?⑤뵫 (2移? */}
          <div style={{ height: ITEM_H * 2 }} />
          {items.map((item, idx) => (
            <div
              key={item.value}
              onClick={() => snapTo(idx)}
              style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
              className={`flex items-center justify-center text-sm font-extrabold cursor-pointer transition-colors select-none
                ${String(item.value) === String(value)
                  ? 'text-teal-700'
                  : 'text-slate-400 hover:text-slate-600'}`}>
              {item.label}
            </div>
          ))}
          {/* ?섎떒 ?⑤뵫 (2移? */}
          <div style={{ height: ITEM_H * 2 }} />
        </div>
      </div>
    </div>
  );
}

// ?? ?숆탳 寃??????????????????????????????????????????????????
function useSchoolSearch() {
  const [query2, setQuery]    = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (query2.length < 2) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`/api/school-search?q=${encodeURIComponent(query2)}`);
        const data = await res.json();
        setResults(data.schools || []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 400);
  }, [query2]);

  return { query: query2, setQuery, results, loading, clearResults: () => setResults([]) };
}

// ?? ?숆툒 ?앹꽦 紐⑤떖 ????????????????????????????????????????????
function CreateClassModal({ onClose, onCreated, teacherUser }) {
  const { query, setQuery, results, loading, clearResults } = useSchoolSearch();
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [grade,          setGrade]          = useState('1');
  const [classNum,       setClassNum]       = useState('1');
  const [studentCount,   setStudentCount]   = useState('25');
  const [isCreating,     setIsCreating]     = useState(false);
  const [step,           setStep]           = useState(1); // 1:?숆탳?좏깮 2:?뺣낫?낅젰 3:?앹꽦以?
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const selectSchool = (school) => {
    setSelectedSchool(school);
    setQuery(school.name);
    clearResults();
  };

  const handleCreate = async () => {
    if (!selectedSchool || !grade || !classNum || !studentCount) return;
    const count = parseInt(studentCount);
    if (count < 1 || count > 32) { showToast('학생 수는 1~32명으로 입력해주세요.', 'error'); return; }

    setIsCreating(true);
    setStep(3);
    try {
      // 1. ?숆툒 臾몄꽌 ?앹꽦
      const classRef = await addDoc(collection(db, 'classes'), {
        teacherUid:   teacherUser.uid,
        teacherEmail: teacherUser.email || '',
        schoolName:   selectedSchool.name,
        schoolAbbr:   getSchoolAbbr(selectedSchool.name),
        schoolType:   selectedSchool.type,
        location:     selectedSchool.location || '',
        grade:        parseInt(grade),
        classNumber:  parseInt(classNum),
        studentCount: count,
        ...getOperationModeFields('basic'),
        createdAt:    serverTimestamp(),
      });

      // 2. ?숈깮 怨꾩젙 ?쇨큵 ?앹꽦 (batch: 500媛??쒗븳 ??50紐낆씠硫?OK)
      const batch = writeBatch(db);
      for (let i = 1; i <= count; i++) {
        const code = makeStudentCode(selectedSchool.name, grade, classNum, i);
        batch.set(doc(db, 'students', code), {
          studentCode:  code,
          classId:      classRef.id,
          teacherUid:   teacherUser.uid,
          pin:          newPin(),
          name:         '',
          diamonds:     1000,
          gold:         0,
          level:        5,
          exp:          0,
          maxExp:       100,
          parts:        {},
          characterImage: '',
          tickets:      { dungeon: 3, bossRaid: 1, arena: 5 },
          createdAt:     serverTimestamp(),
        });
      }
      await batch.commit();

      onCreated({
        id:           classRef.id,
        teacherUid:   teacherUser.uid,
        schoolName:   selectedSchool.name,
        schoolAbbr:   getSchoolAbbr(selectedSchool.name),
        grade:        parseInt(grade),
        classNumber:  parseInt(classNum),
        studentCount: count,
      });
    } catch (err) {
      console.error('학급 생성 오류:', err);
      showToast('학급 생성에 실패했습니다: ' + err.message, 'error');
      setIsCreating(false);
      setStep(2);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020b18]/80 p-3 backdrop-blur-md sm:p-5">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-slate-50 shadow-[0_28px_90px_rgba(2,8,23,0.5)]">
        <div className="relative overflow-hidden bg-[#071b2a] px-5 py-5 text-white sm:px-6">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="absolute -bottom-20 left-20 h-40 w-40 rounded-full bg-orange-400/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-black tracking-[0.18em] text-cyan-100">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> CLASS SETUP
              </div>
              <h2 className="text-xl font-black sm:text-2xl">새 학급 만들기</h2>
              <p className="mt-1 text-xs font-semibold text-slate-300 sm:text-sm">학교와 학급 정보를 선택하면 학생 계정까지 한 번에 준비됩니다.</p>
            </div>
            {!isCreating && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-lg text-slate-200 transition-colors hover:bg-white/20 hover:text-white"
                aria-label="학급 만들기 닫기"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {step === 3 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-cyan-50 ring-1 ring-cyan-100">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-600" />
              <span className="absolute text-lg">🏫</span>
            </div>
            <div>
              <p className="text-lg font-black text-slate-800">학급을 준비하고 있어요</p>
              <p className="mt-1 text-sm font-medium text-slate-500">학생 {studentCount}명의 계정을 안전하게 생성 중입니다.</p>
            </div>
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-cyan-500 to-teal-500" />
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-100 text-xs font-black text-cyan-800">1</span>
                <div>
                  <h3 className="text-sm font-black text-slate-800">학교 찾기</h3>
                  <p className="text-[11px] font-medium text-slate-400">재직 중인 학교명을 두 글자 이상 입력하세요.</p>
                </div>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-3 text-sm" aria-hidden="true">⌕</span>
                <input
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelectedSchool(null); }}
                  placeholder="예: OO초등학교"
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 py-2.5 pl-10 pr-20 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                />
                {loading && (
                  <div className="absolute right-3 top-3 text-xs font-bold text-cyan-700">검색 중...</div>
                )}
                {results.length > 0 && !selectedSchool && (
                  <div className="mt-2 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
                    {results.map((s, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => selectSchool(s)}
                        className="w-full border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-cyan-50"
                      >
                        <div className="text-sm font-extrabold text-slate-800">{s.name}</div>
                        <div className="mt-0.5 text-xs font-medium text-slate-400">{s.location} · {s.type}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedSchool && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                  <span aria-hidden="true">✓</span>
                  <span className="min-w-0 truncate">{selectedSchool.name} · {selectedSchool.location}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedSchool(null); setQuery(''); }}
                    className="ml-auto shrink-0 text-slate-400 transition-colors hover:text-rose-500"
                  >
                    다시 선택
                  </button>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-xs font-black text-orange-700">2</span>
                <div>
                  <h3 className="text-sm font-black text-slate-800">학급 정보</h3>
                  <p className="text-[11px] font-medium text-slate-400">가운데 선에 맞춰 학년·반·학생 수를 선택하세요.</p>
                </div>
              </div>
              <div className="flex justify-center gap-1 py-1 sm:gap-3">
                <ScrollPicker
                  label="학년"
                  value={grade || '1'}
                  onChange={v => setGrade(v)}
                  items={[1,2,3,4,5,6].map(g => ({ value: String(g), label: `${g}학년` }))}
                />
                <ScrollPicker
                  label="반"
                  value={classNum || '1'}
                  onChange={v => setClassNum(v)}
                  items={Array.from({ length: 20 }, (_, i) => i + 1).map(n => ({ value: String(n), label: `${n}반` }))}
                />
                <ScrollPicker
                  label="학생 수"
                  value={studentCount || '25'}
                  onChange={v => setStudentCount(v)}
                  items={Array.from({ length: 32 }, (_, i) => i + 1).map(n => ({ value: String(n), label: `${n}명` }))}
                />
              </div>
            </section>

            {selectedSchool && grade && classNum && studentCount && (
              <section className="rounded-2xl border border-cyan-300/20 bg-[#071b2a] p-4 text-sm text-white shadow-lg shadow-slate-900/15">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black tracking-[0.16em] text-cyan-300">PREVIEW</p>
                    <p className="mt-1 font-extrabold">{selectedSchool.name} {grade}학년 {classNum}반</p>
                  </div>
                  <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-black text-emerald-200">학생 {studentCount}명</span>
                </div>
                <div className="mt-3 rounded-xl bg-white/8 px-3 py-2.5">
                  <p className="text-[10px] font-bold text-slate-400">자동 생성 학생 코드</p>
                  <p className="mt-1 break-all font-mono text-xs font-bold text-cyan-100 sm:text-sm">
                    {makeStudentCode(selectedSchool.name, grade, classNum, 1)}
                    <span className="mx-2 text-slate-500">~</span>
                    {makeStudentCode(selectedSchool.name, grade, classNum, parseInt(studentCount)||1)}
                  </p>
                </div>
              </section>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border-2 border-slate-200 bg-white py-3 text-sm font-extrabold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!selectedSchool || !grade || !classNum || !studentCount || isCreating}
                className="rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 py-3 text-sm font-extrabold text-white shadow-lg shadow-cyan-900/20 transition-all hover:from-cyan-500 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-35"
              >
                학급 만들기 →
              </button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[400] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ?? ?숆툒 移대뱶 ?????????????????????????????????????????????????
function ClassCard({ cls, onSelect }) {
  return (
    <button
      onClick={() => onSelect(cls)}
      className="group w-full rounded-2xl border-2 border-slate-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-xl hover:shadow-cyan-950/15">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-2xl ring-1 ring-cyan-100">🏫</div>
      <h3 className="font-extrabold text-slate-800 text-lg leading-tight mb-1">
        {cls.schoolName}
      </h3>
      <p className="mb-3 text-base font-extrabold text-teal-700">
        {cls.grade}학년 {cls.classNumber}반
      </p>
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>학생 {cls.studentCount}명</span>
        <span className="text-slate-300">|</span>
        <span className="font-mono text-xs text-slate-400">
          {cls.schoolAbbr}{cls.grade}{String(cls.classNumber).padStart(2,'0')}XX
        </span>
      </div>
      <div className="mt-4 text-xs font-bold text-cyan-700 transition-colors group-hover:text-teal-700">
        입장하기 →
      </div>
    </button>
  );
}

// ?? 硫붿씤 ?????????????????????????????????????????????????????
function QuickSetupModal({ state, onClose, onRun, onEnterClass }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#020b18]/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-white/60 bg-white shadow-2xl">
        <div className="bg-[#071b2a] px-5 py-4 text-white">
          <h3 className="text-lg font-extrabold">학급 기본 셋팅</h3>
          <p className="mt-1 text-xs text-cyan-100/80">
            학급 생성 직후 한 번만 실행하면 기본 운영 환경이 자동으로 준비됩니다.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="font-bold">{state.newClass?.schoolName}</div>
            <div className="text-slate-500 mt-0.5">
              {state.newClass?.grade}학년 {state.newClass?.classNumber}반
            </div>
          </div>

          {!state.isDone && (
            <p className="rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-800">
              추천 퀘스트와 퀴즈던전 등 학급 운영에 필요한 기본 셋팅을 생성합니다.
            </p>
          )}

          {state.error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 font-bold">
              {state.error}
            </div>
          )}

          {state.result?.summary && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
              <div className="font-extrabold mb-1">✅ 기본 셋팅 완료!</div>
              <div>퀘스트 {state.result.summary.createdQuestCount}개 및 퀴즈던전 등 기본 셋팅이 완료됐습니다.</div>
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={state.isRunning}
            className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 disabled:opacity-50">
            나중에
          </button>
          {!state.isDone ? (
            <button
              onClick={onRun}
              disabled={state.isRunning}
              className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-500 disabled:opacity-50">
              {state.isRunning ? '적용 중...' : '바로 적용'}
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl bg-slate-700 py-2.5 text-sm font-bold text-white hover:bg-slate-600">
                닫기
              </button>
              <button
                onClick={onEnterClass}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm">
                확인
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClassSelectPage({ teacherUser, onClassSelected, onLogout, isAdmin = false, onEnterAdmin, onEnterTeacherTest, teacherAccessCode }) {
  const isTestTeacher = !teacherUser?.uid && typeof onEnterTeacherTest === 'function';
  const activeTeacher = teacherUser?.uid
    ? teacherUser
    : { uid: 'admin_master_001', email: '', displayName: '테스트 선생님' };
  const isVerified = isTestTeacher || !!localStorage.getItem(`teacherAuthVerified:${activeTeacher.uid}`);
  const [authInput,   setAuthInput]   = useState('');
  const [authError,   setAuthError]   = useState('');
  const [verified,    setVerified]    = useState(isVerified);

  const handleAuthSubmit = () => {
    if (authInput.trim() !== String(teacherAccessCode)) {
      setAuthError('인증번호가 올바르지 않습니다.');
      return;
    }
    localStorage.setItem(`teacherAuthVerified:${activeTeacher.uid}`, '1');
    setAuthError('');
    setVerified(true);
  };

  const [classes,     setClasses]     = useState([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [quickSetup, setQuickSetup] = useState({
    open: false,
    newClass: null,
    isRunning: false,
    isDone: false,
    result: null,
    error: '',
  });

  const fetchClasses = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'classes'), where('teacherUid', '==', activeTeacher.uid))
      );
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => item.active !== false));
    } catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchClasses(); }, []);

  const handleCreated = (newClass) => {
    setShowCreate(false);
    setClasses(prev => [...prev, newClass]);
    setQuickSetup({
      open: true,
      newClass,
      isRunning: false,
      isDone: false,
      result: null,
      error: '',
    });
  };

  const enterClassAfterQuickSetup = () => {
    if (!quickSetup?.newClass) return;
    onClassSelected(quickSetup.newClass);
  };

  const runQuickSetup = async () => {
    if (!quickSetup?.newClass || quickSetup.isRunning) return;
    setQuickSetup(prev => ({ ...prev, isRunning: true, error: '' }));
    try {
      const result = await applyClassQuickSetup(quickSetup.newClass);
      setQuickSetup(prev => ({
        ...prev,
        open: true,
        isRunning: false,
        isDone: true,
        result,
      }));
      await fetchClasses();
    } catch (error) {
      setQuickSetup(prev => ({
        ...prev,
        isRunning: false,
        error: error?.message || '기본 셋팅 중 오류가 발생했습니다.',
      }));
    }
  };

  if (!verified) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <h1 className="text-white text-xl font-extrabold mb-2">교사 계정 1회 인증</h1>
          <p className="text-slate-400 text-sm mb-5">관리자가 부여한 4자리 인증번호를 입력해 주세요.</p>
          <input
            value={authInput}
            onChange={(e) => {
              setAuthInput(e.target.value.replace(/\D/g, '').slice(0, 4));
              if (authError) setAuthError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
            placeholder="4자리 인증번호"
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-center font-mono text-2xl tracking-widest text-white focus:border-cyan-500 focus:outline-none"
            maxLength={4}
            autoFocus
          />
          {authError && <p className="mt-3 text-rose-400 text-sm font-bold">{authError}</p>}
          <button
            onClick={handleAuthSubmit}
            disabled={authInput.length !== 4}
            className="mt-4 w-full rounded-xl bg-teal-600 py-3 font-extrabold text-white hover:bg-teal-500 disabled:opacity-40"
          >
            인증 완료
          </button>
          <button onClick={onLogout} className="w-full mt-2 py-2 text-slate-500 hover:text-slate-300 text-sm">
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-[#03101f] via-[#07303a] to-[#07111f]">

      {/* ?곷떒 諛?*/}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="text-white/60 text-sm font-medium">
          {activeTeacher.email || activeTeacher.displayName || '선생님'}
        </div>
        <div className="flex items-center gap-2">
        {isAdmin && (
          <button
            onClick={onEnterAdmin}
            className="rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-100 transition-colors hover:border-cyan-200/70 hover:bg-cyan-400/20 hover:text-white">
            관리자 모드
          </button>
        )}
        {isAdmin && (
          <button
            onClick={onEnterTeacherTest}
            className="text-sky-100 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-sky-300/40 hover:border-sky-200/80 bg-sky-500/20 hover:bg-sky-500/30 transition-colors">
            교사 테스트 페이지
          </button>
        )}
        <button onClick={onLogout}
          className="text-white/50 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-white/20 hover:border-white/40 transition-colors">
          로그아웃
        </button>
        </div>
      </div>

      {/* 蹂몃Ц */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <h1 className="text-3xl font-extrabold text-white mb-2">학급 선택</h1>
        <p className="text-white/50 text-sm mb-10">입장할 학급을 선택하거나 새 학급을 만들어주세요.</p>

        {isLoading ? (
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            <span className="text-white/50 font-bold text-sm">불러오는 중...</span>
          </div>
        ) : (
          <div className="w-full max-w-2xl">
            {/* ?숆툒 移대뱶 紐⑸줉 */}
            {classes.length > 0 && (
              <div className={`grid gap-4 mb-6 ${classes.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {classes.map(cls => (
                  <ClassCard key={cls.id} cls={cls} onSelect={onClassSelected} />
                ))}
              </div>
            )}

            {/* ?숆툒 ?놁쓣 ???덈궡 */}
            {classes.length === 0 && (
              <div className="text-center mb-8">
                <div className="text-6xl mb-4 opacity-40">🏫</div>
                <p className="text-white/50 font-bold">아직 학급이 없습니다</p>
                <p className="text-white/30 text-sm mt-1">아래 버튼을 눌러 첫 번째 학급을 만들어보세요!</p>
              </div>
            )}

            {/* ?숆툒 異붽? 踰꾪듉 */}
            {classes.length < 2 ? (
              <button
                onClick={() => setShowCreate(true)}
                className="w-full rounded-2xl border-2 border-dashed border-cyan-200/30 py-4 font-bold text-cyan-50/65 transition-all hover:border-cyan-300 hover:bg-cyan-300/10 hover:text-white">
                + 새 학급 만들기 {classes.length > 0 && `(${2 - classes.length}개 더 가능)`}
              </button>
            ) : (
              <div className="text-center text-white/30 text-sm py-3">
                최대 2개 학급까지 만들 수 있습니다
              </div>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateClassModal
          teacherUser={activeTeacher}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {quickSetup.open && (
        <QuickSetupModal
          state={quickSetup}
          onClose={() => setQuickSetup({
            open: false, newClass: null, isRunning: false, isDone: false, result: null, error: '',
          })}
          onRun={runQuickSetup}
          onEnterClass={enterClassAfterQuickSetup}
        />
      )}
      
    </div>
  );
}




