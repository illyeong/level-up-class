import React, { useState } from 'react';
import TeacherNavigationBar from '../../components/TeacherNavigationBar';

// 🌟 필요한 화면 컴포넌트들 완벽하게 불러오기
import AccountIssue from './AccountIssue';
import TeacherDashboard from './TeacherDashboard';
import QuestManage from './QuestManage';
import BankManage from './BankManage';
import ClassShopManage from './ClassShopManage';
import StockManage from './StockManage';
import QuizDungeonManage from './QuizDungeonManage';
import BossRaidManage from './BossRaidManage';
import QuestKiosk from './QuestKiosk';
import AdventureManage from './AdventureManage';

function TeacherLayout({ user, onLogout, onStudentTestLogin }) {
  const [currentView, setCurrentView] = useState('dashboard');

  return (
    <div className="flex h-screen bg-slate-50 w-full">
      {/* 교사용 네비게이션 바 */}
      <TeacherNavigationBar
        changeView={setCurrentView}
        currentView={currentView}
        onLogout={onLogout}
      />

      {/* 우측 메인 화면 */}
      <main className="flex-1 overflow-auto relative bg-slate-100">

        {currentView === 'dashboard' && <TeacherDashboard onStudentTestLogin={onStudentTestLogin} />}

        {/* 학생 계정 발급 화면 */}
        {currentView === 'accountIssue'    && <AccountIssue user={user} />}
        {currentView === 'questManage'     && <QuestManage />}
        {currentView === 'bankManage'       && <BankManage />}
        {currentView === 'classShopManage' && <ClassShopManage />}
        {currentView === 'stockManage'        && <StockManage />}
        {currentView === 'quizDungeonManage' && <QuizDungeonManage />}
        {currentView === 'bossRaidManage'    && <BossRaidManage />}

        {/* 임시 준비 중 화면들 */}
        {currentView === 'myCharacter'     && <div className="p-10 text-2xl font-bold text-slate-800">선생님 캐릭터 룸 (준비 중 🦸‍♂️)</div>}
        {currentView === 'adventureManage' && <AdventureManage />}
        
      </main>

      {/* 학생 체크인 키오스크 모드 - 전체 화면 오버레이 (nav 포함 모두 덮음) */}
      {currentView === 'questKiosk' && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <QuestKiosk onExit={() => setCurrentView('dashboard')} />
        </div>
      )}
    </div>
  );
}

export default TeacherLayout;