import React, { useState } from 'react';
import NavigationBar from './components/NavigationBar';
import MyCharacter from './components/MyCharacter';
import StudentDashboard from './components/StudentDashboard';
import AvatarRoom from './pages/student/AvatarShop.jsx'; // 이름 바꾼 아바타 상점 파일
import TeacherLogin from './pages/teacher/TeacherLogin.jsx';

function App() {
  // 🌟 주소창 대신 '비밀 버튼 클릭'으로 관리자 화면을 띄우는 상태!
  const [isTeacherMode, setIsTeacherMode] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');

  // =========================================================
  // 1. 관리자 모드가 켜졌을 때 (비밀 통로 진입 성공!)
  // =========================================================
  if (isTeacherMode) {
    return (
      <div className="relative w-full h-screen">
        {/* 선생님 로그인 화면 렌더링 */}
        <TeacherLogin />

      </div>
    );
  }

  // =========================================================
  // 2. 평소 학생 모드일 때 (사이드바 + 메인 화면)
  // =========================================================
  return (
    <div className="flex h-screen bg-slate-50 relative">
      <NavigationBar changeView={setCurrentView} currentView={currentView} />
      
      <main className="flex-1 overflow-auto relative">
        {currentView === 'dashboard' && <StudentDashboard />}
        {currentView === 'myCharacter' && <MyCharacter />}
        {currentView === 'avatarRoom' && <AvatarRoom />}
        
        {currentView === 'quest' && (
          <div className="p-8 text-2xl font-bold text-slate-800">퀘스트 화면 (준비 중 ⚔️)</div>
        )}
        {currentView === 'academy' && (
          <div className="p-8 text-2xl font-bold text-slate-800">아카데미 화면 (준비 중 📚)</div>
        )}
      </main>

      {/* 🌟🌟 대망의 비밀 통로 버튼 🌟🌟 */}
      {/* 화면 좌측 하단 맨 구석에 배경색과 비슷하게 숨어있습니다. 마우스를 올리면 보라색으로 변합니다! */}
      <button
        onClick={() => setIsTeacherMode(true)}
        className="absolute bottom-2 left-2 text-slate-200 hover:text-indigo-500 transition-colors duration-300 z-50 cursor-pointer p-2"
        title="선생님 전용 관리자 모드"
      >
        {/* 아주 작은 자물쇠 아이콘 */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </button>

    </div>
  );
}

export default App;