import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, query, where, writeBatch, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

// ── 학교명 → 약칭 (초등학교/중학교/고등학교 제거) ──────────────
const getSchoolAbbr = (name) =>
  name.replace(/초등학교$/, '').replace(/중학교$/, '').replace(/고등학교$/, '').replace(/학교$/, '');

// ── 학생 코드 생성 ────────────────────────────────────────────
const makeStudentCode = (schoolName, grade, classNum, studentNum) => {
  const abbr = getSchoolAbbr(schoolName);
  return `${abbr}${grade}${String(classNum).padStart(2, '0')}${String(studentNum).padStart(2, '0')}`;
};

const newPin = () => Math.floor(1000 + Math.random() * 9000).toString();

// ── 학교 검색 훅 ──────────────────────────────────────────────
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

// ── 학급 생성 모달 ────────────────────────────────────────────
function CreateClassModal({ onClose, onCreated, teacherUser }) {
  const { query, setQuery, results, loading, clearResults } = useSchoolSearch();
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [grade,          setGrade]          = useState('');
  const [classNum,       setClassNum]       = useState('');
  const [studentCount,   setStudentCount]   = useState('');
  const [isCreating,     setIsCreating]     = useState(false);
  const [step,           setStep]           = useState(1); // 1:학교선택 2:정보입력 3:생성중

  const selectSchool = (school) => {
    setSelectedSchool(school);
    setQuery(school.name);
    clearResults();
  };

  const handleCreate = async () => {
    if (!selectedSchool || !grade || !classNum || !studentCount) return;
    const count = parseInt(studentCount);
    if (count < 1 || count > 50) return alert('학생 수는 1~50명으로 입력해주세요.');

    setIsCreating(true);
    setStep(3);
    try {
      // 1. 학급 문서 생성
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
        createdAt:    serverTimestamp(),
      });

      // 2. 학생 계정 일괄 생성 (batch: 500개 제한 → 50명이면 OK)
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
          level:        1,
          exp:          0,
          maxExp:       500,
          parts:        {},
          characterImage: '',
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
      console.error('학급 생성 에러:', err);
      alert('학급 생성에 실패했습니다: ' + err.message);
      setIsCreating(false);
      setStep(2);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* 헤더 */}
        <div className="p-5 bg-indigo-600 text-white flex justify-between items-center">
          <h2 className="font-extrabold text-lg">🏫 새 학급 만들기</h2>
          {!isCreating && <button onClick={onClose} className="text-indigo-200 hover:text-white text-xl">✕</button>}
        </div>

        {step === 3 ? (
          <div className="p-10 flex flex-col items-center gap-4">
            <div className="text-5xl animate-spin">⚙️</div>
            <p className="font-extrabold text-slate-700 text-lg">학급 및 학생 계정 생성 중...</p>
            <p className="text-slate-400 text-sm">{studentCount}명의 계정을 만들고 있습니다</p>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* 학교 검색 */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                학교 이름 검색 <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelectedSchool(null); }}
                  placeholder="예: 인천신석초등학교"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                />
                {loading && (
                  <div className="absolute right-3 top-3 text-slate-400 text-xs">검색 중...</div>
                )}
                {/* 검색 결과 드롭다운 */}
                {results.length > 0 && !selectedSchool && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-52 overflow-y-auto mt-1">
                    {results.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => selectSchool(s)}
                        className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-0">
                        <div className="font-bold text-slate-800 text-sm">{s.name}</div>
                        <div className="text-xs text-slate-400">{s.location} · {s.type}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedSchool && (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-indigo-600 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg">
                  ✅ {selectedSchool.name} ({selectedSchool.location})
                  <button onClick={() => { setSelectedSchool(null); setQuery(''); }} className="ml-auto text-slate-400 hover:text-rose-400">✕</button>
                </div>
              )}
            </div>

            {/* 학년 / 반 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">학년 <span className="text-rose-500">*</span></label>
                <select value={grade} onChange={e => setGrade(e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
                  <option value="">선택</option>
                  {[1,2,3,4,5,6].map(g => <option key={g} value={g}>{g}학년</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">반 <span className="text-rose-500">*</span></label>
                <select value={classNum} onChange={e => setClassNum(e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
                  <option value="">선택</option>
                  {Array.from({length: 20}, (_,i) => i+1).map(n => <option key={n} value={n}>{n}반</option>)}
                </select>
              </div>
            </div>

            {/* 학생 수 */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">학생 수 <span className="text-rose-500">*</span></label>
              <input
                type="number" min="1" max="50"
                value={studentCount}
                onChange={e => setStudentCount(e.target.value)}
                placeholder="예: 25"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* 미리보기 */}
            {selectedSchool && grade && classNum && studentCount && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-1">
                <div className="font-bold text-slate-700">📋 생성 미리보기</div>
                <div className="text-slate-500">
                  학급: {selectedSchool.name} {grade}학년 {classNum}반
                </div>
                <div className="text-slate-500">
                  학생 코드 예시:&nbsp;
                  <span className="font-mono font-bold text-indigo-600">
                    {makeStudentCode(selectedSchool.name, grade, classNum, 1)}
                    &nbsp;~&nbsp;
                    {makeStudentCode(selectedSchool.name, grade, classNum, parseInt(studentCount)||1)}
                  </span>
                </div>
                <div className="text-slate-500">학생 {studentCount}명 계정 자동 생성</div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={onClose}
                className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={!selectedSchool || !grade || !classNum || !studentCount}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40 transition-colors">
                학급 생성하기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 학급 카드 ─────────────────────────────────────────────────
function ClassCard({ cls, onSelect }) {
  return (
    <button
      onClick={() => onSelect(cls)}
      className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all p-6 text-left w-full group">
      <div className="text-3xl mb-3">🏫</div>
      <h3 className="font-extrabold text-slate-800 text-lg leading-tight mb-1">
        {cls.schoolName}
      </h3>
      <p className="text-indigo-600 font-extrabold text-base mb-3">
        {cls.grade}학년 {cls.classNumber}반
      </p>
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>👨‍🎓 {cls.studentCount}명</span>
        <span className="text-slate-300">|</span>
        <span className="font-mono text-xs text-slate-400">
          {cls.schoolAbbr}{cls.grade}{String(cls.classNumber).padStart(2,'0')}XX
        </span>
      </div>
      <div className="mt-4 text-xs font-bold text-indigo-500 group-hover:text-indigo-600 transition-colors">
        입장하기 →
      </div>
    </button>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function ClassSelectPage({ teacherUser, onClassSelected, onLogout }) {
  const [classes,     setClasses]     = useState([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);

  const fetchClasses = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'classes'), where('teacherUid', '==', teacherUser.uid))
      );
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchClasses(); }, []);

  const handleCreated = (newClass) => {
    setShowCreate(false);
    setClasses(prev => [...prev, newClass]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 flex flex-col">

      {/* 상단 바 */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="text-white/60 text-sm font-medium">
          {teacherUser?.email || teacherUser?.displayName || '선생님'}
        </div>
        <button onClick={onLogout}
          className="text-white/50 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-white/20 hover:border-white/40 transition-colors">
          로그아웃
        </button>
      </div>

      {/* 본문 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <h1 className="text-3xl font-extrabold text-white mb-2">내 학급</h1>
        <p className="text-white/50 text-sm mb-10">입장할 학급을 선택하거나 새 학급을 만드세요</p>

        {isLoading ? (
          <div className="text-white/50 font-bold animate-pulse">불러오는 중...</div>
        ) : (
          <div className="w-full max-w-2xl">
            {/* 학급 카드 목록 */}
            {classes.length > 0 && (
              <div className={`grid gap-4 mb-6 ${classes.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {classes.map(cls => (
                  <ClassCard key={cls.id} cls={cls} onSelect={onClassSelected} />
                ))}
              </div>
            )}

            {/* 학급 없을 때 안내 */}
            {classes.length === 0 && (
              <div className="text-center mb-8">
                <div className="text-6xl mb-4 opacity-40">🏫</div>
                <p className="text-white/50 font-bold">아직 학급이 없습니다</p>
                <p className="text-white/30 text-sm mt-1">아래 버튼을 눌러 첫 번째 학급을 만들어보세요!</p>
              </div>
            )}

            {/* 학급 추가 버튼 */}
            {classes.length < 2 ? (
              <button
                onClick={() => setShowCreate(true)}
                className="w-full py-4 rounded-2xl border-2 border-dashed border-white/30 hover:border-indigo-400 text-white/50 hover:text-white font-bold transition-all hover:bg-white/5">
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
          teacherUser={teacherUser}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
