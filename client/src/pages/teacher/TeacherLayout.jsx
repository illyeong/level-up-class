import React, { useState } from 'react';
import TeacherNavigationBar from '../../components/TeacherNavigationBar';
import TeacherDashboard from './TeacherDashboard';

function TeacherLayout({ user, onLogout }) {
  // 대시보드가 처음 띄워질 기본 화면이 되도록 설정합니다.
  const [currentView, setCurrentView] = useState('dashboard');

  return (
    <div className="flex h-screen bg-slate-50 w-full">
      {/* 🌟 로그인 이후에만 나타나는 교사용 네비게이션 바 */}
      <TeacherNavigationBar
        changeView={setCurrentView}
        currentView={currentView}
        onLogout={onLogout}
      />

      {/* 우측 메인 화면 */}
      <main className="flex-1 overflow-auto relative bg-slate-100">
        {/* 네비바에서 선택한 메뉴에 따라 화면이 바뀝니다! */}
        {currentView === 'dashboard' && <TeacherDashboard user={user} />}
        
        {/* 아직 안 만든 메뉴들을 눌렀을 때 나올 임시 화면들 */}
        {currentView === 'studentDetail' && <div className="p-10 text-2xl font-bold text-slate-800">학생 상세 정보 화면 (준비 중 👨‍🎓)</div>}
        {currentView === 'diamondManage' && <div className="p-10 text-2xl font-bold text-slate-800">다이아몬드 일괄 지급 화면 (준비 중 💎)</div>}
        {currentView === 'questApproval' && <div className="p-10 text-2xl font-bold text-slate-800">퀘스트 결재 화면 (준비 중 📜)</div>}
      </main>
    </div>
  );
}

export default TeacherLayout;