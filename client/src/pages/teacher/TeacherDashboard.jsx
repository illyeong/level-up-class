import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, writeBatch, serverTimestamp, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';

import iconGold from '../../assets/images/icon-gold.png';
import iconDiamond from '../../assets/images/icon-diamond.png';
import iconQuest from '../../assets/images/icon-quest.png'; 

const getSeatNum = (code) => parseInt(code?.slice(-2)) || 0;

function TeacherDashboard({ onStudentTestLogin, selectedClass }) {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [questStats, setQuestStats] = useState([]);

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
      console.error("학생 목록 에러:", error);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQuestStats = async (classStudentIds = []) => {
    const teacherUid = selectedClass?.teacherUid;
    if (!teacherUid) return;
    try {
      // QuestManage와 동일한 방식: 전체 조회 후 메모리 필터 (where 인덱스 문제 회피)
      const questsSnap = await getDocs(collection(db, 'quests'));
      const allQuests = questsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log('[Quest Debug] teacherUid:', teacherUid, '/ 전체 퀘스트 수:', allQuests.length);
      console.log('[Quest Debug] 샘플:', allQuests.slice(0,3).map(q => ({ id: q.id, teacherUid: q.teacherUid, active: q.active, title: q.title })));
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

      const stats = await Promise.all(
        activeQuests.map(async q => {
          const snap = await getDocs(collection(db, 'quests', q.id, 'completions'));
          let checkedCount = 0;
          snap.docs.forEach(d => {
            const sid = d.id;
            if (!studentIdSet.has(sid)) return;
            const data = d.data();
            if (data.checked) checkedCount++;
            if (q.type === 'daily') {
              if (!sqMap[sid]) sqMap[sid] = [];
              sqMap[sid].push({
                title:    q.title,
                checked:  data.checked  || false,
                rewarded: data.rewarded || false,
              });
            }
          });
          return { ...q, checkedCount };
        })
      );

      console.log('[Quest Debug] 활성 퀘스트:', activeQuests.length, activeQuests.map(q => q.title));
      setQuestStats(stats);
      setStudentQuestMap(sqMap);
    } catch (err) {
      console.error('퀘스트 통계 에러:', err);
    }
  };

  useEffect(() => {
    const load = async () => {
      const studentList = await fetchStudents();
      await fetchQuestStats(studentList.map(s => s.id));
    };
    load();
  }, [selectedClass]);

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
    if (selectedIds.length === 0) return alert("학생을 최소 1명 이상 선택해주세요.");
    const diaAmt  = Number(diaAmount)  || 0;
    const goldAmt = Number(goldAmount) || 0;
    if (diaAmt === 0 && goldAmt === 0) return alert("다이아 또는 골드 금액을 입력해주세요.");

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
        reason:      reason.trim() || (isAdd ? "선생님 보상 지급" : "선생님 차감 집행"),
        targetCount: selectedIds.length,
        targetIds:   selectedIds,
      });

      await batch.commit();

      const parts = [];
      if (diaAmt  > 0) parts.push(`💎 ${diaAmt.toLocaleString()} 다이아`);
      if (goldAmt > 0) parts.push(`🪙 ${goldAmt.toLocaleString()} 골드`);
      alert(`${parts.join(', ')} ${isAdd ? '지급' : '차감'} 완료!`);
      setIsModalOpen(false);
      fetchStudents();
    } catch (error) {
      console.error("트랜잭션 에러:", error);
      alert("처리 중 오류가 발생했습니다.");
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
      console.error("로그 에러:", error);
    }
  };

  const filteredStudents = students.filter(s => s.studentCode.includes(searchQuery));

  return (
    <div className="min-h-screen bg-slate-100 p-8 relative">
      
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 flex items-center">
            👑 학급 전체 대시보드
          </h1>
          <p className="text-slate-500 mt-2 text-sm">학생들의 레벨과 재화를 관리합니다.</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button onClick={fetchLogs} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors mr-2 text-sm">
            📋 지급/차감 내역 보기
          </button>
          <button onClick={() => openModal('add')}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors">
            ✨ 지급하기
          </button>
          <button onClick={() => openModal('sub')}
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors">
            ✕ 차감하기
          </button>
        </div>
      </div>

      {/* 퀘스트 현황 섹션 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <img src={iconQuest} alt="퀘스트" className="w-6 h-6 object-contain" />
          <h2 className="font-extrabold text-slate-700 text-base">오늘의 퀘스트 현황</h2>
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
                  {/* 상단 타입 띠 */}
                  <div className={`px-3 py-1.5 text-[10px] font-extrabold tracking-wide
                    ${isDaily ? 'bg-sky-500 text-white' : 'bg-violet-500 text-white'}`}>
                    {isDaily ? '📅 일일퀘스트' : '📆 주간퀘스트'}
                  </div>
                  <div className="p-3">
                    <div className="font-extrabold text-sm text-slate-800 mb-2 leading-tight truncate">
                      {quest.title}
                    </div>
                    {/* 진행률 */}
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
        {students.map((student) => (
          <div key={student.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow relative">
            {/* 일일퀘스트 완료 현황 */}
            {(() => {
              const qs = studentQuestMap[student.id] || [];
              if (qs.length === 0) return null;
              const done = qs.filter(q => q.checked).length;
              return (
                <div className={`px-2.5 py-1.5 flex items-center justify-between gap-1
                  ${done === qs.length ? 'bg-emerald-50 border-b border-emerald-100' : 'bg-slate-50 border-b border-slate-100'}`}>
                  <div className="flex gap-1 flex-wrap">
                    {qs.map((q, i) => (
                      <span key={i} title={q.title}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full truncate max-w-[80px]
                          ${q.rewarded ? 'bg-amber-100 text-amber-700'
                          : q.checked  ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-400'}`}>
                        {q.checked ? '✓' : '○'} {q.title.length > 6 ? q.title.slice(0, 6) + '…' : q.title}
                      </span>
                    ))}
                  </div>
                  <span className={`text-[10px] font-extrabold shrink-0 ${done === qs.length ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {done}/{qs.length}
                  </span>
                </div>
              );
            })()}
            <div className="h-36 bg-gradient-to-b from-slate-50 to-white flex items-center justify-center border-b border-slate-100 relative overflow-hidden">
              {student.characterImage ? (
                <img
                  src={student.characterImage}
                  alt="캐릭터"
                  className="h-full w-full object-contain scale-[2.5] drop-shadow-sm"
                  onError={e => { e.target.style.display = 'none'; }}
                />
              ) : student.parts ? (
                <span className="text-6xl drop-shadow-sm">🦸‍♂️</span>
              ) : (
                <span className="text-6xl drop-shadow-sm opacity-30">🧍</span>
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
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className={`p-5 text-white font-bold text-xl flex justify-between items-center
              ${modalMode === 'add' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              <h2 className="flex items-center gap-2">
                {modalMode === 'add' ? '✨ 일괄 지급' : '✕ 일괄 차감'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-white hover:text-white/70">✕</button>
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
                  <input type="text" placeholder="아이디 검색..." className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-32 focus:outline-none focus:border-indigo-500"
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
                {/* 선택 인원 */}
                <div className="p-3 bg-slate-50 rounded-xl text-center border border-slate-200">
                  <span className="text-slate-500 text-xs font-medium">선택된 학생</span>
                  <div className="text-3xl font-black text-indigo-600 my-0.5">{selectedIds.length} <span className="text-lg text-slate-700">명</span></div>
                </div>

                {/* 💎 다이아 */}
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

                {/* 🪙 골드 */}
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

                {/* 사유 */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">사유 (선택)</label>
                  <textarea value={reason} onChange={e => setReason(e.target.value)}
                    className="w-full h-16 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                    placeholder="비워두셔도 됩니다." />
                </div>

                <button onClick={submitTransaction}
                  className={`w-full py-4 rounded-xl font-bold text-lg text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]
                    ${modalMode === 'add' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                  {modalMode === 'add' ? '✨ 지급 집행하기' : '✕ 차감 집행하기'}
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
              <h2>📋 최근 지급/차감 내역</h2>
              <button onClick={() => setIsLogOpen(false)} className="text-slate-300 hover:text-white">✕</button>
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
                    // 신규 포맷 (diaAmount/goldAmount) & 구형 포맷 (currency/amount) 모두 지원
                    const isAdd = log.mode === 'add' || (log.amount > 0);
                    const parts = [];
                    if (log.diaAmount  !== undefined && log.diaAmount  !== 0)
                      parts.push(`💎 ${log.diaAmount  > 0 ? '+' : ''}${log.diaAmount.toLocaleString()}`);
                    if (log.goldAmount !== undefined && log.goldAmount !== 0)
                      parts.push(`🪙 ${log.goldAmount > 0 ? '+' : ''}${log.goldAmount.toLocaleString()}`);
                    // 구형 포맷 fallback
                    if (parts.length === 0 && log.currency) {
                      const sign = log.amount > 0 ? '+' : '';
                      parts.push(`${log.currency === '다이아' ? '💎' : '🪙'} ${sign}${(log.amount || 0).toLocaleString()}`);
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
    </div>
  );
}

export default TeacherDashboard;