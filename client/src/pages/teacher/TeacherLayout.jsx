import React, { useState } from 'react';
import TeacherNavigationBar from '../../components/TeacherNavigationBar';

// 🌟 이름 바꾼 파일 불러오기!
import AccountIssue from './AccountIssue'; 

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
        
        {/* 1. 선생님이 기획하신 "진짜 메인 대시보드" (학생 캐릭터 전체 뷰) - 추후 개발! */}
        {currentView === 'dashboard' && (
          <div className="p-10 flex flex-col items-center justify-center h-full text-center">
            <span className="text-6xl mb-4">👑</span>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">학급 전체 대시보드 (준비 중)</h1>
            <p className="text-slate-500">이곳에 반 학생들의 캐릭터가 모두 표시되고,<br/>다이아와 골드를 한눈에 보고 지급/차감할 수 있게 될 예정입니다!</p>
          </div>
        )}

        {/* 2. 네비바에서 '학급/학생 관리 > 학생 계정 발급'을 눌렀을 때 나오는 화면! */}
        {currentView === 'accountIssue' && <AccountIssue user={user} />}
        
        {/* 임시 준비 중 화면들 */}
        {currentView === 'myCharacter' && <div className="p-10 text-2xl font-bold text-slate-800">선생님 캐릭터 룸 (준비 중 🦸‍♂️)</div>}
        {currentView === 'sendNotice' && <div className="p-10 text-2xl font-bold text-slate-800">학급 공지 발송 화면 (준비 중 📢)</div>}
        {currentView === 'stockManage' && <div className="p-10 text-2xl font-bold text-slate-800">주식 ETF 관리 화면 (준비 중 📈)</div>}
        {currentView === 'adventureManage' && <div className="p-10 text-2xl font-bold text-slate-800">어드벤처 관리 화면 (준비 중 ⚔️)</div>}
        
      </main>
    </div>
  );
}

export default TeacherLayout;