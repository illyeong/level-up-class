import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// 기존 컴포넌트들
import NavigationBar from './components/NavigationBar';
import MyCharacter from './components/MyCharacter';
import StudentDashboard from './components/StudentDashboard';
import AvatarRoom from './pages/student/AvatarRoom.jsx';

// 🌟 새로 만든 선생님 로그인 페이지 (파일 경로가 맞는지 확인해주세요!)
import TeacherLogin from './pages/TeacherLogin.jsx';

// =====================================================================
// 1. 기존 App의 내용을 '학생용 메인 화면' 묶음으로 분리합니다.
// =====================================================================
function StudentMain() {
  const [currentView, setCurrentView] = useState('dashboard');

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

// =====================================================================
// 2. 최상단 App: 주소에 따라 화면을 분기처리(라우팅) 합니다.
// =====================================================================
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 기본 주소( / )로 접속하면 기존의 네비게이션바가 있는 학생용 화면을 보여줍니다. */}
        <Route path="/" element={<StudentMain />} />
        
        {/* 관리자 주소( /teacher )로 접속하면 네비게이션바 없이 선생님 로그인 창만 띄웁니다. */}
        <Route path="/teacher" element={<TeacherLogin />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;