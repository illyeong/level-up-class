import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, query, where, writeBatch, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { applyClassQuickSetup } from '../../utils/classQuickSetup';

// ?? ?숆탳紐????쎌묶 (珥덈벑?숆탳/以묓븰援?怨좊벑?숆탳 ?쒓굅) ??????????????
const getSchoolAbbr = (name) =>
  name.replace(/珥덈벑?숆탳$/, '').replace(/以묓븰援?/, '').replace(/怨좊벑?숆탳$/, '').replace(/?숆탳$/, '');

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
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <div className="relative w-28">
        {/* ?좏깮 ?곸뿭 ?섏씠?쇱씠??*/}
        <div className="absolute inset-x-0 pointer-events-none z-10"
          style={{ top: ITEM_H * 2, height: ITEM_H }}>
          <div className="h-full border-t-2 border-b-2 border-indigo-400 bg-indigo-50/60 rounded-lg mx-1" />
        </div>
        {/* ?꾩븘??洹몃씪?곗씠???섏씠??*/}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white to-transparent pointer-events-none z-20 rounded-t-2xl" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none z-20 rounded-b-2xl" />

        <div
          ref={ref}
          onScroll={handleScroll}
          className="overflow-y-scroll scrollbar-hide rounded-2xl bg-white border border-slate-200 shadow-inner"
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
                  ? 'text-indigo-700'
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
    if (count < 1 || count > 32) { showToast('?숈깮 ?섎뒗 1~32紐낆쑝濡??낅젰?댁＜?몄슂.', 'error'); return; }

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
      console.error('?숆툒 ?앹꽦 ?먮윭:', err);
      showToast('?숆툒 ?앹꽦???ㅽ뙣?덉뒿?덈떎: ' + err.message, 'error');
      setIsCreating(false);
      setStep(2);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[calc(100vh-4rem)] overflow-hidden">

        {/* ?ㅻ뜑 */}
        <div className="p-5 bg-indigo-600 text-white flex justify-between items-center">
          <h2 className="font-extrabold text-lg">학급 만들기</h2>
          {!isCreating && <button onClick={onClose} className="text-indigo-200 hover:text-white text-xl">✕</button>}
        </div>

        {step === 3 ? (
          <div className="p-10 flex flex-col items-center gap-4">
            <div className="text-5xl animate-spin">?숋툘</div>
            <p className="font-extrabold text-slate-700 text-lg">?숆툒 諛??숈깮 怨꾩젙 ?앹꽦 以?..</p>
            <p className="text-slate-400 text-sm">{studentCount}紐낆쓽 怨꾩젙??留뚮뱾怨??덉뒿?덈떎</p>
          </div>
        ) : (
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            {/* ?숆탳 寃??*/}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                ?숆탳 ?대쫫 寃??<span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelectedSchool(null); }}
                  placeholder="?? OO珥덈벑?숆탳"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                />
                {loading && (
                  <div className="absolute right-3 top-3 text-slate-400 text-xs">寃??以?..</div>
                )}
                {/* 寃??寃곌낵 ?쒕∼?ㅼ슫 */}
                {results.length > 0 && !selectedSchool && (
                  <div className="w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto mt-1">
                    {results.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => selectSchool(s)}
                        className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-0">
                        <div className="font-bold text-slate-800 text-sm">{s.name}</div>
                        <div className="text-xs text-slate-400">{s.location} 쨌 {s.type}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedSchool && (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-indigo-600 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg">
                  ??{selectedSchool.name} ({selectedSchool.location})
                  <button onClick={() => { setSelectedSchool(null); setQuery(''); }} className="ml-auto text-slate-400 hover:text-rose-400">삭제</button>
                </div>
              )}
            </div>

            {/* ?숇뀈 / 諛?/ ?숈깮???ㅽ겕濡??쇱빱 */}
            <div>
              <div className="text-xs font-bold text-slate-600 mb-3 text-center">
                ?숇뀈 쨌 諛?쨌 ?숈깮 ??<span className="text-rose-500">*</span>
              </div>
              <div className="flex justify-center gap-4 py-2">
                <ScrollPicker
                  label="?숇뀈"
                  value={grade || '1'}
                  onChange={v => setGrade(v)}
                  items={[1,2,3,4,5,6].map(g => ({ value: String(g), label: `${g}?숇뀈` }))}
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
            </div>

            {/* 誘몃━蹂닿린 */}
            {selectedSchool && grade && classNum && studentCount && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-1">
                <div className="font-bold text-slate-700">?뱥 ?앹꽦 誘몃━蹂닿린</div>
                <div className="text-slate-500">
                  ?숆툒: {selectedSchool.name} {grade}?숇뀈 {classNum}諛?
                </div>
                <div className="text-slate-500">
                  ?숈깮 肄붾뱶 ?덉떆:&nbsp;
                  <span className="font-mono font-bold text-indigo-600">
                    {makeStudentCode(selectedSchool.name, grade, classNum, 1)}
                    &nbsp;~&nbsp;
                    {makeStudentCode(selectedSchool.name, grade, classNum, parseInt(studentCount)||1)}
                  </span>
                </div>
                <div className="text-slate-500">?숈깮 {studentCount}紐?怨꾩젙 ?먮룞 ?앹꽦</div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={onClose}
                className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
                痍⑥냼
              </button>
              <button
                onClick={handleCreate}
                disabled={!selectedSchool || !grade || !classNum || !studentCount || isCreating}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40 transition-colors">
                ?숆툒 ?앹꽦?섍린
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
      className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all p-6 text-left w-full group">
      <div className="text-3xl mb-3">?룶</div>
      <h3 className="font-extrabold text-slate-800 text-lg leading-tight mb-1">
        {cls.schoolName}
      </h3>
      <p className="text-indigo-600 font-extrabold text-base mb-3">
        {cls.grade}?숇뀈 {cls.classNumber}諛?
      </p>
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>학생 {cls.studentCount}명</span>
        <span className="text-slate-300">|</span>
        <span className="font-mono text-xs text-slate-400">
          {cls.schoolAbbr}{cls.grade}{String(cls.classNumber).padStart(2,'0')}XX
        </span>
      </div>
      <div className="mt-4 text-xs font-bold text-indigo-500 group-hover:text-indigo-600 transition-colors">
        ?낆옣?섍린 ??
      </div>
    </button>
  );
}

// ?? 硫붿씤 ?????????????????????????????????????????????????????
function QuickSetupModal({ state, onClose, onRun, onEnterClass }) {
  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-indigo-600 text-white">
          <h3 className="text-lg font-extrabold">?숆툒 湲곕낯 ?뗮똿</h3>
          <p className="text-xs text-indigo-100 mt-1">
            ?숆툒 ?앹꽦 吏곹썑 ??踰덈쭔 ?ㅽ뻾?섎㈃ 湲곕낯 ?댁쁺 ?섍꼍???먮룞?쇰줈 以鍮꾨맗?덈떎.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="font-bold">{state.newClass?.schoolName}</div>
            <div className="text-slate-500 mt-0.5">
              {state.newClass?.grade}?숇뀈 {state.newClass?.classNumber}諛?            </div>
          </div>

          {!state.isDone && (
            <ul className="text-sm text-slate-600 space-y-1.5 list-disc pl-5">
              <li>異붿쿇 ?섏뒪???꾩껜 ?먮룞 ?앹꽦</li>
              <li>湲곕낯 ?숆툒 ?곸젏 5醫??먮룞 ?깅줉</li>
              <li>?먰뿕?섏쟾 ?낆옣沅?3??湲곕낯 吏湲?</li>
              <li>?숇뀈 留욎땄 ?섑븰 6臾명빆 + ?덉떆 ?댁쫰?섏쟾 ?먮룞 ?앹꽦</li>
              <li>?숇뀈 留욎땄 蹂댁뒪?덉씠?쒖슜 6臾명빆 + 湲곕낯 蹂댁뒪 ?덉씠??1媛??앹꽦</li>
            </ul>
          )}

          {state.error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 font-bold">
              {state.error}
            </div>
          )}

          {state.result?.summary && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
              <div className="font-extrabold mb-1">?곸슜 ?꾨즺</div>
              <div>?앹꽦???섏뒪?? {state.result.summary.createdQuestCount}媛?/div>
              <div>?앹꽦???곸젏 ?꾩씠?? {state.result.summary.createdShopItemCount}媛?/div>
              <div>??젣??湲곕낯 ?꾩씠???꾨━?⑥뒪 荑좏룿): {state.result.summary.removedLegacyShopItemCount || 0}媛?/div>
              <div>?낆옣沅?蹂댁젙 ?숈깮 ?? {state.result.summary.updatedStudentTicketCount}紐?/div>
              <div>?앹꽦??蹂댁뒪?덉씠???댁쫰?? {state.result.summary.createdBossQuizSet ? '?? : '?꾨땲??}</div>
              <div>?앹꽦??湲곕낯 蹂댁뒪 ?덉씠?? {state.result.summary.createdBossRaid ? '?? : '?꾨땲??}</div>
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={state.isRunning}
            className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 disabled:opacity-50">
            ?섏쨷??          </button>
          {!state.isDone ? (
            <button
              onClick={onRun}
              disabled={state.isRunning}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-50">
              {state.isRunning ? '?곸슜 以?..' : '諛붾줈 ?곸슜'}
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm">
                ?リ린
              </button>
              <button
                onClick={onEnterClass}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm">
                ?뺤씤
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClassSelectPage({ teacherUser, onClassSelected, onLogout, isAdmin = false, onEnterAdmin }) {
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
        error: error?.message || '湲곕낯 ?뗮똿 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.',
      }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 flex flex-col">

      {/* ?곷떒 諛?*/}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="text-white/60 text-sm font-medium">
          {teacherUser?.email || teacherUser?.displayName || '?좎깮??}
        </div>
        <div className="flex items-center gap-2">
        {isAdmin && (
          <button
            onClick={onEnterAdmin}
            className="text-indigo-100 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-indigo-300/40 hover:border-indigo-200/80 bg-indigo-500/20 hover:bg-indigo-500/30 transition-colors">
            愿由ъ옄 紐⑤뱶
          </button>
        )}
        <button onClick={onLogout}
          className="text-white/50 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-white/20 hover:border-white/40 transition-colors">
          濡쒓렇?꾩썐
        </button>
        </div>
      </div>

      {/* 蹂몃Ц */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <h1 className="text-3xl font-extrabold text-white mb-2">???숆툒</h1>
        <p className="text-white/50 text-sm mb-10">?낆옣???숆툒???좏깮?섍굅?????숆툒??留뚮뱶?몄슂</p>

        {isLoading ? (
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            <span className="text-white/50 font-bold text-sm">遺덈윭?ㅻ뒗 以?..</span>
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
                <div className="text-6xl mb-4 opacity-40">?룶</div>
                <p className="text-white/50 font-bold">?꾩쭅 ?숆툒???놁뒿?덈떎</p>
                <p className="text-white/30 text-sm mt-1">?꾨옒 踰꾪듉???뚮윭 泥?踰덉㎏ ?숆툒??留뚮뱾?대낫?몄슂!</p>
              </div>
            )}

            {/* ?숆툒 異붽? 踰꾪듉 */}
            {classes.length < 2 ? (
              <button
                onClick={() => setShowCreate(true)}
                className="w-full py-4 rounded-2xl border-2 border-dashed border-white/30 hover:border-indigo-400 text-white/50 hover:text-white font-bold transition-all hover:bg-white/5">
                + ???숆툒 留뚮뱾湲?{classes.length > 0 && `(${2 - classes.length}媛???媛??`}
              </button>
            ) : (
              <div className="text-center text-white/30 text-sm py-3">
                理쒕? 2媛??숆툒源뚯? 留뚮뱾 ???덉뒿?덈떎
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




