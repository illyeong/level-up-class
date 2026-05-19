import React, { useState } from 'react';
import NavigationBar from './components/NavigationBar';
import MyCharacter from './components/MyCharacter';
import StudentDashboard from './components/StudentDashboard';
import AvatarRoom from './pages/student/AvatarShop.jsx';
import StudentQuestPage from './pages/student/StudentQuestPage.jsx';
import ClassAllView from './pages/student/ClassAllView.jsx';
import EditProfile from './pages/student/EditProfile.jsx';
import ClassBank from './pages/student/ClassBank.jsx';
import ClassShop from './pages/student/ClassShop.jsx';
import AdventurePage from './pages/student/AdventurePage.jsx';
import StockMarket from './pages/student/StockMarket.jsx';
import TeacherLogin from './pages/teacher/TeacherLogin.jsx';

const ADVENTURE_VIEWS = ['adventure', 'quizDungeon', 'explorationDungeon', 'arena', 'bossRaid', 'miniGame'];

function App() {
  const [isTeacherMode, setIsTeacherMode] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [testStudentCode, setTestStudentCode] = useState(null);

  // 교사 페이지에서 학생 계정으로 테스트 로그인
  const handleStudentTestLogin = (code) => {
    setTestStudentCode(code);
    setIsTeacherMode(false);
    setCurrentView('quest');
  };

  if (isTeacherMode) {
    return (
      <div className="relative w-full h-screen">
        <TeacherLogin onStudentTestLogin={handleStudentTestLogin} />
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
        {currentView === 'dashboard' && <StudentDashboard studentCode={testStudentCode} />}
        {currentView === 'myCharacter' && <MyCharacter studentCode={testStudentCode} />}
        {currentView === 'avatarRoom' && <AvatarRoom studentCode={testStudentCode} />}
        
        {currentView === 'quest' && <StudentQuestPage studentCode={testStudentCode} />}
        {currentView === 'classAll'    && <ClassAllView />}
        {currentView === 'classBank'   && <ClassBank studentCode={testStudentCode} />}
        {currentView === 'classShop'   && <ClassShop studentCode={testStudentCode} />}
        {currentView === 'stockMarket' && <StockMarket studentCode={testStudentCode} />}
        {currentView === 'editProfile' && (
          <EditProfile
            studentCode={testStudentCode}
            onNameSaved={(name) => console.log('이름 저장됨:', name)}
          />
        )}
        {ADVENTURE_VIEWS.includes(currentView) && (
          <AdventurePage currentView={currentView} studentCode={testStudentCode} />
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