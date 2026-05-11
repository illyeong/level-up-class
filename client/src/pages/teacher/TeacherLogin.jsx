import React, { useState } from 'react';
import TeacherDashboard from './TeacherDashboard'; 

function TeacherLogin() {
  // 선생님 정보를 담을 공간
  const [teacherUser, setTeacherUser] = useState(null);

  // 🌟 구글 로그인 창 띄우지 않고 그냥 묻지도 따지지도 않고 바로 통과!
  const handleDirectLogin = () => {
    setTeacherUser({
      displayName: "신석초 선생님", // 대시보드에 뜰 이름
      uid: "admin_master_001"    // DB에 저장될 임시 관리자 고유 ID
    });
  };

  // 🌟 입장이 허락되었다면, 대시보드를 띄웁니다!
  if (teacherUser) {
    return <TeacherDashboard user={teacherUser} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur-sm p-10 rounded-3xl shadow-2xl w-full max-w-md transform transition-all hover:scale-[1.01]">
        
        <div className="text-center mb-8">
          <div className="inline-block bg-indigo-100 p-4 rounded-full mb-4 shadow-inner">
            <span className="text-4xl">👑</span>
          </div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-2">
            LevelUp Class
          </h1>
          <h2 className="text-xl font-bold text-slate-700">관리자 접속 (테스트 모드)</h2>
          <p className="text-slate-500 mt-2 text-sm">
            현재 빠른 테스트를 위해 <br/>구글 로그인 없이 바로 입장 가능합니다.
          </p>
        </div>

        {/* 🚀 프리패스 버튼 */}
        <button 
          onClick={handleDirectLogin}
          className="flex items-center justify-center w-full bg-indigo-600 border border-transparent rounded-xl px-6 py-4 text-white font-bold text-lg hover:bg-indigo-700 transition-all duration-300 shadow-md"
        >
          🚀 교사 대시보드 바로 입장하기
        </button>

      </div>
    </div>
  );
}

export default TeacherLogin;