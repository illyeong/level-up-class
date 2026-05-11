import React, { useState } from 'react';
import NavigationBar from './components/NavigationBar';
import MyCharacter from './components/MyCharacter';
import StudentDashboard from './components/StudentDashboard';

// 📂 파일명 바꾼 AvatarShop 불러오기
import AvatarRoom from './pages/student/AvatarShop.jsx'; 
// 📂 선생님 로그인 화면 불러오기
import TeacherLogin from './pages/teacher/TeacherLogin.jsx';

function App() {
  // 🌟 핵심 해결책: react-router-dom 없이 기본 자바스크립트로 주소 확인!
  // 주소창 끝이 '/teacher' 인지 아닌지 검사합니다.
  const isTeacherMode = window.location.pathname === '/teacher';

  // 기존 선생님의 훌륭한 상태 관리 로직
  const [currentView, setCurrentView] = useState('dashboard');

  // =========================================================
  // 1. 선생님용 주소(/teacher)로 들어왔을 때: 깔끔하게 로그인 화면만!
  // =========================================================
  if (isTeacherMode) {
    return <TeacherLogin />;
  }

  // =========================================================
  // 2. 일반 주소(/)로 들어왔을 때: 기존 학생용 메인 화면!
  // =========================================================
  return (
    <div className="flex h-screen bg-slate-50">
      
      {/* 좌측 사이드바 */}
      <NavigationBar changeView={setCurrentView} currentView={currentView} />

      {/* 우측 메인 화면 */}
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

    </div>
  );
}

export default App;