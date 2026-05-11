import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from '../../firebase'; // ⚠️ 경로 주의! (../../firebase)

// 🌟 방금 만든 대시보드 불러오기
import TeacherDashboard from './TeacherDashboard'; 

function TeacherLogin() {
  // 로그인한 선생님의 정보를 담을 공간
  const [teacherUser, setTeacherUser] = useState(null);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      // 로그인 성공 시 정보를 상태에 저장 -> 화면이 대시보드로 바뀜!
      setTeacherUser(result.user); 
    } catch (error) {
      console.error("❌ 로그인 실패:", error.message);
      alert("로그인에 실패했습니다. 다시 시도해주세요.");
    }
  };

  // 🌟 로그인이 완료된 상태라면, 로그인 화면 대신 대시보드를 보여줍니다.
  if (teacherUser) {
    return <TeacherDashboard user={teacherUser} />;
  }

  // 로그인이 안 된 상태면 기존의 로그인 화면을 보여줍니다.
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
          <h2 className="text-xl font-bold text-slate-700">관리자 접속</h2>
        </div>

        <button 
          onClick={handleGoogleLogin}
          className="group relative flex items-center justify-center w-full bg-white border-2 border-slate-200 rounded-xl px-6 py-4 text-slate-700 font-bold text-lg hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all duration-300 shadow-sm"
        >
          <svg className="w-6 h-6 mr-3 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google 계정으로 시작하기
        </button>
      </div>
    </div>
  );
}

export default TeacherLogin;