import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../firebase'; // ⚠️ firebase.js 경로 확인

function TeacherDashboard() {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // DB에서 전체 학생 데이터 불러오기
  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "students"));
      const studentList = [];
      querySnapshot.forEach((doc) => {
        studentList.push({ id: doc.id, ...doc.data() });
      });
      // 번호순으로 정렬
      studentList.sort((a, b) => a.studentCode.localeCompare(b.studentCode));
      setStudents(studentList);
    } catch (error) {
      console.error("학생 목록 불러오기 에러:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // 🌟 다이아몬드 즉시 지급/차감 로직
  const handleDiamondChange = async (studentId, amount) => {
    try {
      const studentRef = doc(db, "students", studentId);
      
      // DB에 increment 함수를 사용하여 값을 안전하게 더하거나 뺌
      await updateDoc(studentRef, {
        diamonds: increment(amount)
      });

      // UI도 즉시 업데이트하여 새로고침 없이 숫자가 바뀌게 만듦
      setStudents(prevStudents => 
        prevStudents.map(student => 
          student.id === studentId 
            ? { ...student, diamonds: student.diamonds + amount } 
            : student
        )
      );

    } catch (error) {
      console.error("다이아몬드 업데이트 에러:", error);
      alert("다이아몬드 처리에 실패했습니다.");
    }
  };

  if (isLoading) {
    return <div className="p-10 text-center text-xl font-bold text-slate-500">학생 데이터를 불러오는 중입니다...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      
      {/* 상단 헤더 */}
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 flex items-center">
            👑 학급 전체 대시보드
          </h1>
          <p className="text-slate-500 mt-2">
            우리 반 학생들의 캐릭터 상태와 경제 현황을 모니터링하고 관리합니다.
          </p>
        </div>
        <button 
          onClick={fetchStudents}
          className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg shadow-sm hover:bg-slate-50 transition-colors font-medium flex items-center"
        >
          🔄 새로고침
        </button>
      </div>

      {/* 🌟 학생 카드 그리드 레이아웃 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {students.length > 0 ? (
          students.map((student) => (
            <div key={student.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow relative group">
              
              {/* 캐릭터 아바타 표시 영역 (추후 유니티 이미지 캡처본이나 렌더텍스처로 대체 가능) */}
              <div className="h-40 bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center border-b border-slate-100 relative">
                {student.parts ? (
                  // 장비가 있다면 임시로 '꾸민 캐릭터' 아이콘 표시
                  <span className="text-7xl drop-shadow-md">🦸‍♂️</span>
                ) : (
                  // 기본 상태
                  <span className="text-7xl drop-shadow-md opacity-50">🧍</span>
                )}
                
                {/* 학생 ID 뱃지 */}
                <div className="absolute top-3 left-3 bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-md shadow-sm">
                  {student.studentCode.split('-').pop()}번
                </div>
              </div>

              {/* 학생 정보 및 경제 관리 영역 */}
              <div className="p-5">
                <h3 className="text-lg font-bold text-slate-800 mb-4">{student.studentCode}</h3>
                
                {/* 재화 현황 */}
                <div className="flex justify-between items-center mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center">
                    <span className="text-xl mr-2">💎</span>
                    <span className="font-bold text-indigo-700 text-lg">{student.diamonds.toLocaleString()}</span>
                  </div>
                </div>

                {/* 다이아몬드 지급/차감 컨트롤러 */}
                <div className="flex justify-between gap-2">
                  <div className="flex gap-1 flex-1">
                    <button 
                      onClick={() => handleDiamondChange(student.id, -10)}
                      className="flex-1 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 font-bold py-2 rounded-lg transition-colors text-sm"
                      title="10 다이아 차감"
                    >
                      -10
                    </button>
                    <button 
                      onClick={() => handleDiamondChange(student.id, -100)}
                      className="flex-1 bg-rose-100 text-rose-700 hover:bg-rose-200 hover:text-rose-800 font-bold py-2 rounded-lg transition-colors text-sm"
                      title="100 다이아 차감"
                    >
                      -100
                    </button>
                  </div>
                  
                  <div className="flex gap-1 flex-1">
                    <button 
                      onClick={() => handleDiamondChange(student.id, 10)}
                      className="flex-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 font-bold py-2 rounded-lg transition-colors text-sm"
                      title="10 다이아 지급"
                    >
                      +10
                    </button>
                    <button 
                      onClick={() => handleDiamondChange(student.id, 100)}
                      className="flex-1 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 hover:text-indigo-800 font-bold py-2 rounded-lg transition-colors text-sm"
                      title="100 다이아 지급"
                    >
                      +100
                    </button>
                  </div>
                </div>

              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-slate-200">
            <span className="text-5xl mb-4 block">📭</span>
            <p className="text-xl font-bold text-slate-700 mb-2">아직 등록된 학생이 없습니다.</p>
            <p className="text-slate-500">좌측 [학생 계정 발급] 메뉴에서 계정을 먼저 생성해 주세요.</p>
          </div>
        )}
      </div>

    </div>
  );
}

export default TeacherDashboard;