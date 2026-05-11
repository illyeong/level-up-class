import React from 'react';
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from '../firebase'; // 🔥 실제 firebase.js 경로에 맞게 맞춰주세요

function TeacherLogin() {
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    
    try {
      // 구글 로그인 팝업 띄우기
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      console.log("✅ 선생님 로그인 성공!");
      console.log("선생님 이름:", user.displayName);
      console.log("선생님 이메일:", user.email);
      console.log("선생님 UID:", user.uid);

      alert(`${user.displayName} 선생님, 환영합니다!`);
      
      // TODO: 로그인 성공 후 대시보드(학생 관리 페이지)로 이동하는 로직 추가
      // 예: navigate('/teacher-dashboard');

    } catch (error) {
      console.error("❌ 로그인 실패:", error.message);
      alert("로그인에 실패했습니다.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
      <div className="p-8 bg-white rounded-xl shadow-md text-center">
        <h2 className="text-2xl font-bold mb-6 text-slate-800">👩‍🏫 교사 로그인</h2>
        <p className="text-slate-600 mb-6">학급 관리를 위해 구글 계정으로 로그인해주세요.</p>
        
        <button 
          onClick={handleGoogleLogin}
          className="flex items-center justify-center w-full bg-white border border-gray-300 rounded-lg px-6 py-3 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
        >
          {/* 구글 로고 아이콘 (선택사항) */}
          <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google 계정으로 로그인
        </button>
      </div>
    </div>
  );
}

export default TeacherLogin;