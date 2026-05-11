import React, { useState, useEffect } from 'react';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../firebase'; // ⚠️ 실제 firebase.js 경로 확인!

function TeacherDashboard({ user }) {
  const [students, setStudents] = useState([]);
  const [studentCount, setStudentCount] = useState(25); // 기본 생성 인원
  const [isLoading, setIsLoading] = useState(false);

  // DB에서 우리 반 학생 목록 불러오기
  const fetchStudents = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "students"));
      const studentList = [];
      querySnapshot.forEach((doc) => {
        studentList.push({ id: doc.id, ...doc.data() });
      });
      // 번호순(studentCode 기준) 정렬
      studentList.sort((a, b) => a.studentCode.localeCompare(b.studentCode));
      setStudents(studentList);
    } catch (error) {
      console.error("학생 목록 불러오기 에러:", error);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // 🌟 학생 계정 일괄 생성 로직
  const generateStudentAccounts = async () => {
    if (!window.confirm(`정말 ${studentCount}명의 학생 계정을 새로 생성하시겠습니까?\n(기존 데이터가 있다면 덮어쓸 수 있으니 주의하세요!)`)) return;
    
    setIsLoading(true);
    try {
      const batch = writeBatch(db);

      for (let i = 1; i <= studentCount; i++) {
        // 1번부터 순서대로 번호 생성 (예: 01, 02, 03 ...)
        const studentNumber = String(i).padStart(2, '0');
        
        // 아이들이 로그인할 때 쓸 아이디 (예: SINSEOK-5-01)
        const studentCode = `SINSEOK-5-${studentNumber}`; 
        
        // 랜덤 4자리 PIN 번호 (비밀번호)
        const pin = Math.floor(1000 + Math.random() * 9000).toString(); 
        
        // DB 문서 참조 (문서 ID를 studentCode로 지정해서 찾기 쉽게 만듦)
        const studentRef = doc(db, "students", studentCode);
        
        // 생성할 초기 데이터
        batch.set(studentRef, {
          studentCode: studentCode,
          pin: pin,
          diamonds: 1000, // 초기 정착 지원금 (1000 다이아)
          parts: "",      // 장착한 아바타 파츠 (초기엔 빈 값)
          teacherUid: user.uid // 담당 선생님(현재 로그인한 사람)의 UID
        });
      }

      // 묶어둔 데이터를 한방에 DB로 쏘기!
      await batch.commit();
      alert('성공적으로 학생 계정이 발급되었습니다!');
      fetchStudents(); // 생성 후 목록 새로고침

    } catch (error) {
      console.error("계정 생성 중 에러:", error);
      alert('계정 생성에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-5xl mx-auto">
        
        {/* 상단 헤더 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 flex justify-between items-center border border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">👨‍🏫 학급 관리 대시보드</h1>
            <p className="text-slate-500 mt-1">{user?.displayName || "선생님"} 환영합니다. 학생들의 상점 계정을 관리하세요.</p>
          </div>
        </div>

        {/* 계정 생성 컨트롤 패널 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 border border-indigo-100 border-l-4 border-l-indigo-500">
          <h2 className="text-lg font-bold text-slate-800 mb-4">🚀 학생 계정 일괄 발급</h2>
          <div className="flex items-end gap-4">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-slate-600 mb-1">우리 반 학생 수</label>
              <input 
                type="number" 
                value={studentCount}
                onChange={(e) => setStudentCount(e.target.value)}
                className="border border-slate-300 rounded-lg px-4 py-2 w-32 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                min="1" max="50"
              />
            </div>
            <button 
              onClick={generateStudentAccounts}
              disabled={isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-sm transition-colors disabled:bg-slate-400"
            >
              {isLoading ? "생성 중..." : "계정 및 PIN 번호 생성"}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            * 생성된 계정에는 자동으로 초기 정착금 1,000 다이아가 지급됩니다.
          </p>
        </div>

        {/* 학생 목록 테이블 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-800">📋 학생 계정 목록 (총 {students.length}명)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                  <th className="p-4 font-semibold">로그인 코드 (ID)</th>
                  <th className="p-4 font-semibold">PIN 번호 (PW)</th>
                  <th className="p-4 font-semibold">보유 다이아 💎</th>
                </tr>
              </thead>
              <tbody>
                {students.length > 0 ? (
                  students.map((student) => (
                    <tr key={student.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-mono font-medium text-indigo-600">{student.studentCode}</td>
                      <td className="p-4 font-mono font-bold text-rose-500 tracking-widest">{student.pin}</td>
                      <td className="p-4 font-semibold text-slate-700">{student.diamonds.toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="p-8 text-center text-slate-400">
                      아직 생성된 학생 계정이 없습니다. 위에서 계정을 발급해 주세요!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

export default TeacherDashboard;