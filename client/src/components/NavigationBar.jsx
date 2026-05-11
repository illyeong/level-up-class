import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import iconDashboard from '../assets/images/icon-dashboard.png';
import iconQuest from '../assets/images/icon-quest.png';
import iconAdventure from '../assets/images/icon-adventure.png';

const NavigationBar = ({ changeView, currentView }) => {
  const { t } = useTranslation();
  
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenu, setExpandedMenu] = useState('myCharacter'); 

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
    if (changeView) changeView(menuId);
    if (!isSidebarOpen) {
      setSidebarOpen(true);
      setExpandedMenu(menuId);
    } else {
      setExpandedMenu(expandedMenu === menuId ? null : menuId);
    }
  };

  const handleSubMenuClick = (e, subMenuId) => {
    e.stopPropagation(); 
    if (changeView) changeView(subMenuId); 
  };

  return (
    // 🌟 바탕색을 bg-indigo-950 으로 변경하여 교사용과 통일!
    <nav className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-indigo-950 text-indigo-100 transition-all duration-300 flex flex-col h-full z-50 shadow-2xl`}>
      
      <div className="flex items-center justify-between p-4 h-20 border-b border-indigo-900 shrink-0">
        {isSidebarOpen && (
          <div className="flex flex-col">
            <span className="font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-400 text-xl tracking-wider truncate">
              LevelUp Class
            </span>
            <span className="text-xs text-indigo-300 font-bold tracking-widest">STUDENT MODE</span>
          </div>
        )}
        <button 
          onClick={() => setSidebarOpen(!isSidebarOpen)} 
          className={`flex items-center justify-center w-8 h-8 rounded-full bg-indigo-900 hover:bg-indigo-500 hover:text-white transition-all duration-200 border border-indigo-700 hover:border-transparent focus:outline-none shrink-0 ${!isSidebarOpen && 'mx-auto'}`}
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
                ${currentView === menu.id || menu.subMenus.some(sub => sub.id === currentView) ? 'bg-indigo-900/80 text-amber-300 font-bold shadow-inner' : 'hover:bg-indigo-900 hover:text-white'}
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
                  <span className={`ml-4 text-sm font-medium ${(currentView === menu.id || menu.subMenus.some(sub => sub.id === currentView)) ? 'font-bold' : ''}`}>
                    {menu.title}
                    {!menu.isReady && <span className="ml-2 text-[10px] bg-indigo-800 text-indigo-300 px-2 py-0.5 rounded-full">{t('common.update', '업데이트')}</span>}
                  </span>
                )}
              </div>
              
              {isSidebarOpen && menu.subMenus.length > 0 && (
                <svg className={`w-4 h-4 text-indigo-400 transition-transform duration-300 ${expandedMenu === menu.id ? 'rotate-180 text-amber-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              )}
            </div>

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

      <div className="p-4 border-t border-indigo-900 shrink-0">
        <button className="flex items-center w-full p-3 text-indigo-300 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors group">
          <span className="text-2xl group-hover:scale-110 transition-transform inline-block w-8 text-center">🚪</span>
          {isSidebarOpen && <span className="ml-4 font-bold text-sm">{t('common.logout', '로그아웃')}</span>}
        </button>
      </div>
    </nav>
  );
};

export default NavigationBar;