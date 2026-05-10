import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

// 선생님의 기존 이미지 경로를 그대로 유지합니다.
import iconDashboard from '../assets/images/icon-dashboard.png';
import iconQuest from '../assets/images/icon-quest.png';
import iconAdventure from '../assets/images/icon-adventure.png';

const NavigationBar = ({ changeView, currentView }) => {
  const { t, i18n } = useTranslation();
  
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenu, setExpandedMenu] = useState('myCharacter'); // 아바타 룸 확인을 위해 기본값을 myCharacter로 둡니다.

  // 💡 1. 하위 메뉴(subMenus)를 객체 배열로 변경하여 id 값을 추가했습니다.
  const menuData = [
    {
      id: 'dashboard', icon: iconDashboard, title: t('menu.dashboard', '대시보드'), isReady: true,
      subMenus: [
        { title: t('submenu.status', '학급 현황'), id: 'dashboard' }, 
        { title: t('submenu.notice', '알림장'), id: 'notice' }
      ]
    },
    {
      id: 'myCharacter', icon: '🦸‍♂️', title: t('menu.character', '내 캐릭터'), isReady: true,
      subMenus: [
        // 🌟 아바타 룸을 클릭했을 때 'avatarRoom' 이라는 id가 전달되게 합니다!
        { title: t('submenu.avatarRoom', '아바타 룸'), id: 'avatarRoom' }, 
        { title: t('submenu.inventory', '인벤토리 (가방)'), id: 'inventory' }, 
        { title: t('submenu.petHouse', '펫 하우스'), id: 'petHouse' }, 
        { title: t('submenu.shop', '상점'), id: 'shop' }
      ]
    },
    {
      id: 'quest', icon: iconQuest, title: t('menu.quest', '퀘스트'), isReady: true,
      subMenus: [
        { title: t('submenu.dailyQuest', '일일 퀘스트'), id: 'dailyQuest' },
        { title: t('submenu.weeklyQuest', '주간 퀘스트'), id: 'weeklyQuest' },
        { title: t('submenu.classRole', '학급 직업'), id: 'classRole' },
        { title: t('submenu.achievement', '업적'), id: 'achievement' }
      ]
    },
    {
      id: 'academy', icon: '📚', title: t('menu.academy', '아카데미'), isReady: false,
      subMenus: [
        { title: t('submenu.assignment', '과제 제출'), id: 'assignment' },
        { title: t('submenu.studyRoom', '자습실'), id: 'studyRoom' },
        { title: t('submenu.wrongAnswerNote', '오답 노트'), id: 'wrongAnswerNote' },
        { title: t('submenu.readingBook', '독서록'), id: 'readingBook' }
      ]
    },
    {
      id: 'adventure', icon: iconAdventure, title: t('menu.adventure', '어드벤처'), isReady: true,
      subMenus: [
        { title: t('submenu.quizDungeon', '퀴즈 던전'), id: 'quizDungeon' },
        { title: t('submenu.bossRaid', '보스 레이드'), id: 'bossRaid' },
        { title: t('submenu.arena', '투기장'), id: 'arena' },
        { title: t('submenu.miniGame', '미니 게임'), id: 'miniGame' }
      ]
    },
    {
      id: 'trade', icon: '💰', title: t('menu.trade', '무역 센터'), isReady: true,
      subMenus: [
        { title: t('submenu.classBank', '학급 은행'), id: 'classBank' },
        { title: t('submenu.classShop', '학급 상점'), id: 'classShop' },
        { title: t('submenu.stockMarket', '주식 시장'), id: 'stockMarket' },
        { title: t('submenu.avatarMarket', '아바타 거래소'), id: 'avatarMarket' },
        { title: t('submenu.secretShop', '비밀 상점'), id: 'secretShop' }
      ]
    },
    {
      id: 'town', icon: '📢', title: t('menu.town', '마을 광장'), isReady: true,
      subMenus: [
        { title: t('submenu.freeBoard', '자유 게시판'), id: 'freeBoard' },
        { title: t('submenu.complimentMailbox', '칭찬 우체통'), id: 'complimentMailbox' },
        { title: t('submenu.suggestionBox', '건의함'), id: 'suggestionBox' }
      ]
    },
    {
      id: 'settings', icon: '⚙️', title: t('menu.settings', '시스템 설정'), isReady: true,
      subMenus: [
        { title: t('submenu.editProfile', '프로필 수정'), id: 'editProfile' },
        { title: t('submenu.themeSettings', '테마 설정'), id: 'themeSettings' }
      ]
    }
  ];

  const handleMenuClick = (menuId) => {
    if (changeView) {
      changeView(menuId);
    }

    if (!isSidebarOpen) {
      setSidebarOpen(true);
      setExpandedMenu(menuId);
    } else {
      setExpandedMenu(expandedMenu === menuId ? null : menuId);
    }
  };

  // 💡 2. 하위 메뉴를 클릭했을 때 실행되는 함수 추가
  const handleSubMenuClick = (e, subMenuId) => {
    e.stopPropagation(); // 메인 메뉴가 접히는 것을 방지
    if (changeView) {
      changeView(subMenuId); // App.jsx의 currentView를 'avatarRoom' 등으로 변경!
    }
  };

  return (
    <nav className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-gray-900 text-gray-300 transition-all duration-300 flex flex-col h-full z-50 shadow-2xl`}>
      
      <div className="flex items-center justify-between p-4 h-20 border-b border-gray-800 shrink-0">
        {isSidebarOpen && (
          <div className="flex items-center font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 text-xl tracking-wider truncate">
            LevelUp Class
          </div>
        )}
        <button 
          onClick={() => setSidebarOpen(!isSidebarOpen)} 
          className={`flex items-center justify-center w-8 h-8 rounded-full bg-gray-800 hover:bg-indigo-500 hover:text-white transition-all duration-200 border border-gray-700 hover:border-transparent focus:outline-none shrink-0 ${!isSidebarOpen && 'mx-auto'}`}
        >
          {isSidebarOpen ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"></path></svg>
          )}
        </button>
      </div>
      
      <ul className="flex-1 px-3 mt-4 overflow-y-auto space-y-1 pb-4 scrollbar-hide">
        {menuData.map((menu) => (
          <li key={menu.id} className="flex flex-col">
            
            <div
              onClick={() => handleMenuClick(menu.id)}
              className={`p-3 rounded-xl cursor-pointer flex items-center justify-between transition-colors
                ${currentView === menu.id || menu.subMenus.some(sub => sub.id === currentView) ? 'bg-gray-800 text-indigo-300 font-bold' : 'hover:bg-gray-800 hover:text-white'}
                ${!menu.isReady ? 'opacity-50' : ''}
              `}
            >
              <div className="flex items-center">
                {menu.icon.length > 10 ? (
                  <img src={menu.icon} alt={menu.title} className={`drop-shadow-md object-contain ${menu.id === 'adventure' ? 'w-11 h-11' : 'w-8 h-8'}`} />
                ) : (
                  <span className="text-3xl drop-shadow-md inline-block w-8 text-center">{menu.icon}</span>
                )}

                {isSidebarOpen && (
                  <span className={`ml-4 text-lg font-medium ${(currentView === menu.id || menu.subMenus.some(sub => sub.id === currentView)) ? 'font-bold' : ''}`}>
                    {menu.title}
                    {!menu.isReady && <span className="ml-2 text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{t('common.update', '업데이트')}</span>}
                  </span>
                )}
              </div>
              
              {isSidebarOpen && (
                <svg 
                  className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${expandedMenu === menu.id ? 'rotate-180 text-indigo-400' : ''}`} 
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              )}
            </div>

            <div 
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isSidebarOpen && expandedMenu === menu.id ? 'max-h-60 opacity-100 mt-1 mb-2' : 'max-h-0 opacity-0'
              }`}
            >
              <ul className="space-y-1">
                {menu.subMenus.map((subMenu, idx) => (
                  <li 
                    key={idx} 
                    // 💡 3. onClick 이벤트 연결
                    onClick={(e) => handleSubMenuClick(e, subMenu.id)}
                    // 💡 4. 현재 뷰와 일치하면 하이라이트
                    className={`pl-14 py-2 text-base rounded-lg cursor-pointer transition-colors flex items-center before:content-[''] before:w-1 before:h-1 before:rounded-full before:mr-3
                      ${currentView === subMenu.id 
                        ? 'text-indigo-300 bg-gray-800/80 before:bg-indigo-400 font-bold' 
                        : 'text-gray-400 hover:text-indigo-300 hover:bg-gray-800/50 before:bg-gray-600 hover:before:bg-indigo-400'
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

      <div className="p-4 border-t border-gray-800 shrink-0">
        <button className="flex items-center w-full p-3 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors group">
          <span className="text-2xl group-hover:scale-110 transition-transform inline-block w-8 text-center">🚪</span>
          {isSidebarOpen && <span className="ml-4 font-bold">{t('common.logout', '로그아웃')}</span>}
        </button>
      </div>
    </nav>
  );
};

export default NavigationBar;