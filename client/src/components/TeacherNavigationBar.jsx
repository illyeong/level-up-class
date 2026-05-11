import React, { useState } from 'react';

// 🌟 학생용과 동일한 아이콘 경로를 불러옵니다.
import iconDashboard from '../assets/images/icon-dashboard.png';
import iconQuest from '../assets/images/icon-quest.png';
import iconAdventure from '../assets/images/icon-adventure.png';

const TeacherNavigationBar = ({ changeView, currentView, onLogout }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenu, setExpandedMenu] = useState('dashboard');

  // 🌟 선생님이 요청하신 새로운 메뉴 구조
  const teacherMenuData = [
    {
      id: 'dashboard', icon: iconDashboard, title: '대시보드', isReady: true,
      subMenus: [] // 하위 메뉴 없음 (바로 이동)
    },
    {
      id: 'myCharacter', icon: '🦸‍♂️', title: '내 캐릭터', isReady: true,
      subMenus: [] // 하위 메뉴 없음 (바로 이동)
    },
    {
      id: 'adventure', icon: iconAdventure, title: '어드벤처', isReady: true,
      subMenus: [
        { title: '퀴즈 던전', id: 'quizDungeon' },
        { title: '보스 레이드', id: 'bossRaid' },
        { title: '투기장', id: 'arena' },
        { title: '미니 게임', id: 'miniGame' },
        { title: '어드벤처 관리', id: 'adventureManage' } // 선생님 전용 관리 메뉴 추가
      ]
    },
    {
      id: 'questManage', icon: iconQuest, title: '퀘스트 관리소', isReady: true,
      subMenus: [] // 하위 목록 모두 삭제 (바로 이동)
    },
    {
      id: 'economyManage', icon: '💎', title: '학급 경제 관리', isReady: true,
      subMenus: [
        { title: '주식etf 관리', id: 'stockManage' },
        { title: '은행 관리', id: 'bankManage' }
      ]
    },
    {
      id: 'studentManage', icon: '👨‍🎓', title: '학급/학생 관리', isReady: true, // 시스템 설정 위로 이동
      subMenus: [
        { title: '학생 계정 발급', id: 'accountIssue' },
        { title: '학생 상세 정보', id: 'studentDetail' },
        { title: '학급 공지 발송', id: 'sendNotice' } // 알림장 발송 -> 학급 공지 발송으로 변경
      ]
    },
    {
      id: 'systemSettings', icon: '⚙️', title: '시스템 설정', isReady: true,
      subMenus: [
        { title: '초기화 및 백업', id: 'systemBackup' },
        { title: '접근 권한 설정', id: 'accessSettings' }
      ]
    }
  ];

  const handleMenuClick = (menuId) => {
    const clickedMenu = teacherMenuData.find(m => m.id === menuId);
    
    // 💡 하위 메뉴가 없는 메인 메뉴(대시보드, 내 캐릭터, 퀘스트 관리소 등)를 누르면 바로 화면 이동!
    if (changeView && clickedMenu && clickedMenu.subMenus.length === 0) {
      changeView(menuId);
    }

    if (!isSidebarOpen) {
      setSidebarOpen(true);
      setExpandedMenu(menuId);
    } else {
      setExpandedMenu(expandedMenu === menuId ? null : menuId);
    }
  };

  const handleSubMenuClick = (e, subMenuId) => {
    e.stopPropagation();
    if (changeView) {
      changeView(subMenuId); 
    }
  };

  return (
    <nav className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-indigo-950 text-indigo-100 transition-all duration-300 flex flex-col h-full z-50 shadow-2xl`}>
      
      {/* 최상단 로고 영역 */}
      <div className="flex items-center justify-between p-4 h-20 border-b border-indigo-900 shrink-0">
        {isSidebarOpen && (
          <div className="flex flex-col">
            <span className="font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-400 text-xl tracking-wider truncate">
              Teacher Mode
            </span>
            <span className="text-xs text-indigo-300 font-bold tracking-widest">LEVELUP CLASS</span>
          </div>
        )}
        <button 
          onClick={() => setSidebarOpen(!isSidebarOpen)} 
          className={`flex items-center justify-center w-8 h-8 rounded-full bg-indigo-900 hover:bg-amber-500 hover:text-white transition-all duration-200 border border-indigo-700 hover:border-transparent focus:outline-none shrink-0 ${!isSidebarOpen && 'mx-auto'}`}
        >
          {isSidebarOpen ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"></path></svg>
          )}
        </button>
      </div>
      
      {/* 메뉴 리스트 */}
      <ul className="flex-1 px-3 mt-4 overflow-y-auto space-y-1 pb-4 scrollbar-hide">
        {teacherMenuData.map((menu) => (
          <li key={menu.id} className="flex flex-col">
            <div
              onClick={() => handleMenuClick(menu.id)}
              className={`p-3 rounded-xl cursor-pointer flex items-center justify-between transition-colors
                ${currentView === menu.id || menu.subMenus.some(sub => sub.id === currentView) ? 'bg-indigo-900/80 text-amber-300 font-bold shadow-inner' : 'hover:bg-indigo-900 hover:text-white'}
                ${!menu.isReady ? 'opacity-50' : ''}
              `}
            >
              <div className="flex items-center">
                {/* 🌟 학생용 네비게이션과 동일한 아이콘 렌더링 방식 적용 */}
                {menu.icon.length > 10 ? (
                  <img src={menu.icon} alt={menu.title} className={`drop-shadow-md object-contain ${menu.id === 'adventure' ? 'w-11 h-11' : 'w-8 h-8'}`} />
                ) : (
                  <span className="text-3xl drop-shadow-md inline-block w-8 text-center">{menu.icon}</span>
                )}

                {isSidebarOpen && (
                  <span className={`ml-4 text-sm font-medium ${(currentView === menu.id || menu.subMenus.some(sub => sub.id === currentView)) ? 'font-bold' : ''}`}>
                    {menu.title}
                    {!menu.isReady && <span className="ml-2 text-[10px] bg-indigo-800 text-indigo-300 px-2 py-0.5 rounded-full">준비중</span>}
                  </span>
                )}
              </div>
              
              {isSidebarOpen && menu.subMenus.length > 0 && (
                <svg className={`w-4 h-4 text-indigo-400 transition-transform duration-300 ${expandedMenu === menu.id ? 'rotate-180 text-amber-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              )}
            </div>

            {/* 하위 메뉴 */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isSidebarOpen && expandedMenu === menu.id ? 'max-h-60 opacity-100 mt-1 mb-2' : 'max-h-0 opacity-0'}`}>
              <ul className="space-y-1">
                {menu.subMenus.map((subMenu, idx) => (
                  <li 
                    key={idx} 
                    onClick={(e) => handleSubMenuClick(e, subMenu.id)}
                    className={`pl-14 py-2 text-sm rounded-lg cursor-pointer transition-colors flex items-center before:content-[''] before:w-1 before:h-1 before:rounded-full before:mr-3
                      ${currentView === subMenu.id 
                        ? 'text-amber-300 bg-indigo-900/50 before:bg-amber-400 font-bold' 
                        : 'text-indigo-300 hover:text-amber-200 hover:bg-indigo-900/30 before:bg-indigo-600 hover:before:bg-amber-400'
                      }
                    `}
                  >
                    {subMenu.title}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>

      {/* 하단 학생 모드 복귀(로그아웃) 버튼 */}
      <div className="p-4 border-t border-indigo-900 shrink-0">
        <button 
          onClick={onLogout}
          className="flex items-center w-full p-3 text-indigo-300 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors group"
        >
          <span className="text-2xl group-hover:scale-110 transition-transform inline-block w-8 text-center">🚪</span>
          {isSidebarOpen && <span className="ml-4 font-bold text-sm">학생 화면 복귀 (로그아웃)</span>}
        </button>
      </div>
    </nav>
  );
};

export default TeacherNavigationBar;