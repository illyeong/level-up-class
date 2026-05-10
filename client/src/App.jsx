import React, { useState } from 'react';
import NavigationBar from './components/NavigationBar';
import MyCharacter from './components/MyCharacter';
import StudentDashboard from './components/StudentDashboard';

// 🌟 1. 아바타 룸 컴포넌트를 불러옵니다! (파일 경로가 다르다면 맞게 수정해주세요)
import AvatarRoom from './pages/student/AvatarRoom.jsx';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');

  return (
    <div className="flex h-screen bg-slate-50">
      
      {/* 좌측 사이드바 */}
      <NavigationBar changeView={setCurrentView} currentView={currentView} />

      {/* 우측 메인 화면 */}
      <main className="flex-1 overflow-auto relative">
        
        {currentView === 'dashboard' && <StudentDashboard />}
        {currentView === 'myCharacter' && <MyCharacter />}
        
        {/* 🌟 2. 네비게이션바에서 'avatarRoom' 신호가 오면 아바타 상점을 띄웁니다! */}
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