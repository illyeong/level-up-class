import React, { useState } from 'react';
import TeacherNavigationBar from '../../components/TeacherNavigationBar';

// 🌟 필요한 화면 컴포넌트들 완벽하게 불러오기
import AccountIssue from './AccountIssue'; 
import TeacherDashboard from './TeacherDashboard'; // 👈 이게 빠져있었습니다!

function TeacherLayout({ user, onLogout }) {
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
        
        {/* 🌟 가짜 글씨를 없애고 "진짜 대시보드 컴포넌트"를 연결했습니다! */}
        {currentView === 'dashboard' && <TeacherDashboard />}

        {/* 학생 계정 발급 화면 */}
        {currentView === 'accountIssue' && <AccountIssue user={user} />}
        
        {/* 임시 준비 중 화면들 */}
        {currentView === 'myCharacter' && <div className="p-10 text-2xl font-bold text-slate-800">선생님 캐릭터 룸 (준비 중 🦸‍♂️)</div>}
        {currentView === 'sendNotice' && <div className="p-10 text-2xl font-bold text-slate-800">학급 공지 발송 화면 (준비 중 📢)</div>}
        {currentView === 'stockManage' && <div className="p-10 text-2xl font-bold text-slate-800">주식 ETF 관리 화면 (준비 중 📈)</div>}
        {currentView === 'bankManage' && <div className="p-10 text-2xl font-bold text-slate-800">은행 관리 화면 (준비 중 🏦)</div>}
        {currentView === 'adventureManage' && <div className="p-10 text-2xl font-bold text-slate-800">어드벤처 관리 화면 (준비 중 ⚔️)</div>}
        
      </main>
    </div>
  );
}

export default TeacherLayout;