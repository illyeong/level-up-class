import React, { useState } from 'react';
import TeacherLayout from './TeacherLayout'; // 🌟 방금 만든 레이아웃 뼈대 불러오기

function TeacherLogin() {
  const [teacherUser, setTeacherUser] = useState(null);

  const handleDirectLogin = () => {
    setTeacherUser({
      displayName: "신석초 선생님", 
      uid: "admin_master_001"    
    });
  };

  const handleLogout = () => {
    window.location.reload(); 
  };

  // =========================================================
  // 🌟 로그인 성공 시: 네비게이션 바가 들어있는 '레이아웃' 화면으로 쏙 넘어갑니다!
  // =========================================================
  if (teacherUser) {
    return <TeacherLayout user={teacherUser} onLogout={handleLogout} />;
  }

  // =========================================================
  // 🌟 로그인 전: 네비게이션 바가 없는 깔끔한 로그인 화면 렌더링
  // =========================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500 flex items-center justify-center p-4 w-full relative">
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