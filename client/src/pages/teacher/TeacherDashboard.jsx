import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, writeBatch, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase'; 

import iconGold from '../../assets/images/icon-gold.png'; 
import iconDiamond from '../../assets/images/icon-diamond.png'; 

function TeacherDashboard() {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(''); 
  const [selectedIds, setSelectedIds] = useState([]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [searchQuery, setSearchQuery] = useState(''); 

  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logs, setLogs] = useState([]);

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "students"));
      const studentList = [];
      querySnapshot.forEach((doc) => {
        studentList.push({ id: doc.id, ...doc.data() });
      });
      studentList.sort((a, b) => a.studentCode.localeCompare(b.studentCode));
      setStudents(studentList);
    } catch (error) {
      console.error("학생 목록 에러:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const openModal = (type) => {
    setModalType(type);
    setSelectedIds([]); 
    setAmount('');
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

  // 🌟 퀵 버튼 클릭 시 금액 추가 기능
  const addQuickAmount = (val) => {
    setAmount(prev => (Number(prev || 0) + val).toString());
  };

  const submitTransaction = async () => {
    if (selectedIds.length === 0) return alert("학생을 최소 1명 이상 선택해주세요.");
    if (!amount || amount <= 0) return alert("올바른 금액을 입력해주세요.");
    
    // 🌟 사유 필수 입력 체크(reason.trim())를 삭제했습니다. 사유가 없으면 "일반 지급/차감"으로 저장됩니다.

    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      
      const isAdd = modalType.includes('_add');
      const isDiamond = modalType.includes('dia');
      const actualAmount = isAdd ? Number(amount) : -Number(amount);
      const currencyLabel = isDiamond ? '다이아' : '골드';

      selectedIds.forEach(id => {
        const studentRef = doc(db, "students", id);
        const targetStudent = students.find(s => s.id === id);
        
        const currentDia = targetStudent.diamonds || 0;
        const currentGold = targetStudent.gold || 0;

        if (isDiamond) {
          batch.update(studentRef, { diamonds: currentDia + actualAmount });
        } else {
          batch.update(studentRef, { gold: currentGold + actualAmount });
        }
      });

      const logRef = doc(collection(db, "transactions"));
      batch.set(logRef, {
        timestamp: serverTimestamp(),
        type: modalType,
        currency: currencyLabel,
        amount: actualAmount,
        reason: reason.trim() || (isAdd ? "선생님 보상 지급" : "선생님 차감 집행"), // 사유 비었을 때 기본값
        targetCount: selectedIds.length,
        targetIds: selectedIds 
      });

      await batch.commit();

      alert(`${currencyLabel} 처리가 완료되었습니다!`);
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
          <button onClick={() => openModal('dia_add')} className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white px-3 py-2 rounded-lg font-bold text-xs transition-colors">
            <img src={iconDiamond} alt="다이아" className="w-4 h-4" /> 다이아 지급
          </button>
          <button onClick={() => openModal('dia_sub')} className="flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-600 hover:text-white px-3 py-2 rounded-lg font-bold text-xs transition-colors">
            <img src={iconDiamond} alt="다이아" className="w-4 h-4" /> 다이아 차감
          </button>
          <button onClick={() => openModal('gold_add')} className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-500 hover:text-white px-3 py-2 rounded-lg font-bold text-xs transition-colors">
            <img src={iconGold} alt="골드" className="w-4 h-4" /> 골드 지급
          </button>
          <button onClick={() => openModal('gold_sub')} className="flex items-center gap-1 bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-600 hover:text-white px-3 py-2 rounded-lg font-bold text-xs transition-colors">
            <img src={iconGold} alt="골드" className="w-4 h-4" /> 골드 차감
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {students.map((student) => (
          <div key={student.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow relative">
            <div className="h-28 bg-gradient-to-b from-slate-50 to-white flex items-center justify-center border-b border-slate-100 relative">
              {student.parts ? <span className="text-6xl drop-shadow-sm">🦸‍♂️</span> : <span className="text-6xl drop-shadow-sm opacity-50">🧍</span>}
              <div className="absolute top-2 left-2 bg-slate-800 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                {student.studentCode.split('-').pop()}번
              </div>
              <div className="absolute bottom-2 right-2 bg-amber-400 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                LV.{student.level || 1}
              </div>
            </div>
            <div className="p-3 text-center">
              <h3 className="text-sm font-bold text-slate-800 mb-2 truncate">{student.studentCode}</h3>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
            <div className={`p-5 text-white font-bold text-xl flex justify-between items-center
              ${modalType.includes('dia') ? (modalType.includes('add') ? 'bg-indigo-600' : 'bg-rose-600') : (modalType.includes('add') ? 'bg-amber-500' : 'bg-orange-600')}
            `}>
              <h2 className="flex items-center gap-2">
                {modalType.includes('dia') 
                  ? <><img src={iconDiamond} alt="다이아" className="w-6 h-6" /> 다이아</> 
                  : <><img src={iconGold} alt="골드" className="w-6 h-6" /> 골드</>} 
                {modalType.includes('add') ? '일괄 지급' : '일괄 차감'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-white hover:text-slate-200">✕</button>
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
                      <div className="flex-1">
                        <div className="font-bold text-xs text-slate-800">{student.studentCode} <span className="text-amber-500 text-[10px]">LV.{student.level || 1}</span></div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                          <img src={iconDiamond} alt="다이아" className="w-3 h-3" /> {student.diamonds || 0} / 
                          <img src={iconGold} alt="골드" className="w-3 h-3 ml-1" /> {student.gold || 0}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full lg:w-80 p-6 bg-white flex flex-col overflow-y-auto">
                <div className="mb-6 p-4 bg-slate-100 rounded-xl text-center border border-slate-200">
                  <span className="text-slate-500 text-xs font-medium">선택된 학생</span>
                  <div className="text-3xl font-black text-indigo-600 my-1">{selectedIds.length} <span className="text-lg text-slate-700">명</span></div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-700 mb-2">지급/차감 금액</label>
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-xl text-slate-800 focus:outline-none focus:border-indigo-500 mb-3" placeholder="금액 입력" />
                  
                  {/* 🌟 10, 50, 100 퀵 버튼 추가 */}
                  <div className="flex gap-2">
                    <button onClick={() => addQuickAmount(10)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 rounded-lg text-sm transition-colors">+10</button>
                    <button onClick={() => addQuickAmount(50)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 rounded-lg text-sm transition-colors">+50</button>
                    <button onClick={() => addQuickAmount(100)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 rounded-lg text-sm transition-colors">+100</button>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-bold text-slate-700 mb-2">지급/차감 사유 (선택)</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                    className="w-full h-24 border-2 border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 resize-none" placeholder="비워두셔도 됩니다." />
                </div>

                <button onClick={submitTransaction}
                  className={`w-full py-4 rounded-xl font-bold text-lg text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] mt-auto
                    ${modalType.includes('dia') ? (modalType.includes('add') ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700') : (modalType.includes('add') ? 'bg-amber-500 hover:bg-amber-600' : 'bg-orange-600 hover:bg-orange-700')}
                  `}>집행하기</button>
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
                    <th className="p-4 font-semibold">재화</th>
                    <th className="p-4 font-semibold">금액</th>
                    <th className="p-4 font-semibold">사유</th>
                    <th className="p-4 font-semibold">대상</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-4 text-slate-500">{log.timestamp ? new Date(log.timestamp.toDate()).toLocaleString() : '방금 전'}</td>
                      <td className="p-4 font-bold flex items-center gap-1">
                        {log.currency === '다이아' 
                          ? <><img src={iconDiamond} alt="다이아" className="w-4 h-4" /> 다이아</> 
                          : <><img src={iconGold} alt="골드" className="w-4 h-4" /> 골드</>}
                      </td>
                      <td className={`p-4 font-bold ${log.amount > 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{log.amount > 0 ? `+${log.amount}` : log.amount}</td>
                      <td className="p-4 text-slate-700">{log.reason}</td>
                      <td className="p-4 font-medium text-slate-600">{log.targetCount}명</td>
                    </tr>
                  ))}
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