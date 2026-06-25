/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const HELP_CONTENT = {
  dashboard: {
    title: '대시보드',
    summary: '우리 반 학생 현황, 오늘의 퀘스트 진행률, 주요 운영 버튼을 한눈에 보는 첫 화면입니다.',
    steps: ['학생 카드에서 레벨과 재화를 확인합니다.', '오늘의 퀘스트 진행률을 보고 참여가 낮은 퀘스트를 점검합니다.', '지급하기/차감하기로 보상을 빠르게 조정합니다.'],
    tip: '수업 시작 전에는 퀘스트 진행률과 접속 학생 수를 먼저 확인하면 운영 흐름을 잡기 좋습니다.',
  },
  myCharacter: {
    title: '내 캐릭터',
    summary: '교사용 탐험 캐릭터와 장비 상태를 확인하는 메뉴입니다.',
    steps: ['교사 캐릭터의 레벨과 능력치를 확인합니다.', '탐험던전 테스트 시 적용되는 기본 능력치를 점검합니다.'],
    tip: '탐험던전 테스트 전에 캐릭터 레벨이 의도한 값으로 들어가는지 확인해 주세요.',
  },
  questManage: {
    title: '퀘스트 관리소',
    summary: '일일/주간 퀘스트를 만들고, 학생 제출 내역을 승인하며 보상을 관리합니다.',
    steps: ['추천 퀘스트를 추가하거나 새 퀘스트를 만듭니다.', '학생 제출을 확인하고 승인/반려합니다.', '종료된 퀘스트는 보관하거나 복사해서 다시 사용합니다.'],
    tip: '처음에는 일일 퀘스트 3~5개 정도만 운영하면 학생들이 적응하기 쉽습니다.',
  },
  questKiosk: {
    title: '학생 셀프체크인',
    summary: '학생들이 직접 오늘의 퀘스트 완료를 체크하는 전용 화면입니다.',
    steps: ['교실 전자칠판이나 태블릿에서 화면을 열어둡니다.', '학생이 본인 이름을 찾아 완료한 퀘스트를 체크합니다.', '매일 자정 초기화와 함께 자동 보상이 처리됩니다.'],
    tip: '교사가 일일이 체크하지 않아도 되는 반복 퀘스트에 적합합니다.',
  },
  adventure: {
    title: '어드벤처',
    summary: '학생 화면과 동일한 던전·보스레이드를 테스트하고 이용권을 관리하는 영역입니다.',
    steps: ['발행된 퀴즈던전을 테스트합니다.', '탐험던전과 보스레이드 화면을 점검합니다.', '어드벤처 관리에서 학생 이용권을 조정합니다.'],
    tip: '콘텐츠 발행은 수업 콘텐츠 제작실에서 진행한 뒤 이 메뉴에서 학생 화면을 테스트하세요.',
  },
  contentStudio: {
    title: '수업 콘텐츠 제작실',
    summary: '수업용 퀴즈를 만들고 퀴즈던전과 보스레이드 콘텐츠로 발행하는 영역입니다.',
    steps: ['퀴즈 은행에서 문제를 준비합니다.', '퀴즈던전 또는 보스레이드를 생성합니다.', '발행 설정과 보상을 확인합니다.'],
    tip: '퀴즈 은행 → 콘텐츠 생성 → 어드벤처 테스트 순서로 운영하면 편리합니다.',
  },
  quizBank: {
    title: '퀴즈 은행',
    summary: '퀴즈던전과 보스레이드에 사용할 문제를 만들고 관리합니다.',
    steps: ['학년, 학기, 과목, 출판사, 단원을 선택합니다.', '직접 출제하거나 AI 출제로 문제를 만듭니다.', '미리보기로 정답과 보기를 확인한 뒤 공유하거나 던전에 연결합니다.'],
    tip: '문항 수가 너무 적으면 반복감이 생기므로 같은 차시에도 여러 유형을 섞어 주세요.',
  },
  quizDungeonManage: {
    title: '퀴즈던전 관리',
    summary: '퀴즈 은행의 문제를 학생용 퀴즈던전으로 발행합니다.',
    steps: ['사용할 퀴즈를 선택합니다.', '난이도, 보상, 몬스터를 설정합니다.', '발행 후 학생 화면에서 입장 가능한지 확인합니다.'],
    tip: '보상은 정답 수에 따라 차등 지급되므로 최대 보상을 먼저 정하면 운영이 쉽습니다.',
  },
  bossRaidManage: {
    title: '보스레이드 관리',
    summary: '학급 전체가 함께 참여하는 협동 퀴즈 레이드를 생성하고 결과를 확인합니다.',
    steps: ['보스와 배경을 선택합니다.', '퀴즈와 제한 시간, 보상을 설정합니다.', '결과 확인에서 학생별 정답과 데미지를 확인합니다.'],
    tip: '보스 HP는 학생 수와 문항 수를 기준으로 추천값을 활용하세요.',
  },
  classOperationManage: {
    title: '우리반 대작전 관리',
    summary: '학생들이 매일 능력치대로 공격해 학급의 공동 목표를 달성하는 장기 협동 활동입니다.',
    steps: ['과자파티나 피구처럼 학급이 함께 원하는 목표를 적습니다.', '기간과 보스만 고르면 학생 수와 공격력 기준으로 HP가 자동 계산됩니다.', '학생별 누적 데미지와 최근 공격 기록을 확인합니다.', '보스 HP가 0이 되면 공동 목표가 달성됩니다.'],
    tip: '개인 순위보다 매일 참여와 학급 전체 달성도를 중심으로 안내해 주세요.',
  },
  quizDungeon: {
    title: '퀴즈던전',
    summary: '교사가 학생 화면과 동일한 퀴즈던전을 테스트하는 메뉴입니다.',
    steps: ['발행된 던전 목록을 확인합니다.', '입장해서 문제, 전투 화면, 결과 화면을 점검합니다.'],
    tip: '학생에게 공개하기 전에 한 번 테스트하면 보상/성공 조건 오류를 줄일 수 있습니다.',
  },
  explorationDungeon: {
    title: '탐험던전',
    summary: '유니티 탐험던전을 교사용으로 테스트하는 메뉴입니다.',
    steps: ['캐릭터 능력치와 장비 스탯이 반영되는지 확인합니다.', '던전 번호와 씬 연결이 맞는지 점검합니다.'],
    tip: '웹 배포 후에는 브라우저 캐시 영향이 있을 수 있어 새로고침 후 테스트해 주세요.',
  },
  bossRaid: {
    title: '보스 레이드',
    summary: '현재 진행 중인 보스레이드 대기실과 전투 화면을 확인합니다.',
    steps: ['레이드 대기실에서 참여 학생 수를 확인합니다.', '전투 화면에서 배경, 보스, 문제 UI를 확인합니다.', '종료 후 결과 화면에서 보상 지급 상태를 봅니다.'],
    tip: '교실에서 사용할 때는 대기실을 먼저 띄우고 학생 참여가 모이면 시작하세요.',
  },
  adventureManage: {
    title: '어드벤처 관리',
    summary: '탐험던전 입장권, 교사 레벨 등 어드벤처 기본 설정을 관리합니다.',
    steps: ['교사 레벨과 입장권 지급량을 확인합니다.', '학생별 이용권 보유량을 조정합니다.'],
    tip: '입장권은 너무 많이 주기보다 주간 목표와 연결해 운영하는 것이 좋습니다.',
  },
  aiCourseware: {
    title: 'AI 코스웨어',
    summary: 'AI 학습관의 학생 진행도, 숙달도, 취약 단원을 확인합니다.',
    steps: ['단원별 현황에서 완료율을 봅니다.', '학생별 분석으로 개별 점수를 확인합니다.', '문제 검토에서 AI가 만든 문제를 수정합니다.'],
    tip: 'AI 문제는 반드시 샘플을 확인하고, 반복되는 유형은 교과서 맥락을 추가해 주세요.',
  },
  boardManage: {
    title: '공유 게시판',
    summary: '학생들이 글, 파일, 지도 게시물을 올리는 공유 공간을 관리합니다.',
    steps: ['시트별 게시물을 확인합니다.', '필요한 시트를 추가/수정합니다.', '부적절한 게시물은 수정하거나 삭제합니다.'],
    tip: '지도 게시판은 위치 기반 기록이나 현장체험학습 정리에 활용하기 좋습니다.',
  },
  learningNoteManage: {
    title: '배움노트 관리',
    summary: '학생들이 작성한 배움노트를 확인하고 보상을 승인합니다.',
    steps: ['승인 대기 목록을 확인합니다.', '내용을 보고 승인 또는 반려합니다.', '학생별 현황에서 누적 기록을 확인합니다.'],
    tip: '짧은 메모라도 꾸준히 남기게 하면 포트폴리오처럼 활용할 수 있습니다.',
  },
  freeBoard: {
    title: '자유 게시판',
    summary: '학급 자유 글쓰기와 파일 공유를 관리합니다.',
    steps: ['게시글 목록을 확인합니다.', '댓글과 첨부파일을 점검합니다.', '필요하면 글을 고정하거나 삭제합니다.'],
    tip: '공지와 자유글을 구분해 운영하면 게시판이 덜 복잡해집니다.',
  },
  hallOfFame: {
    title: '명예의 전당',
    summary: '퀘스트, 골드, 다이아, 투기장 등 학생 랭킹을 보여줍니다.',
    steps: ['랭킹 탭을 선택합니다.', '반영되지 않는 항목이 있으면 해당 활동 로그를 확인합니다.'],
    tip: '경쟁이 과열되지 않도록 칭찬 포인트나 성장 지표와 함께 보여주는 것이 좋습니다.',
  },
  classVoteManage: {
    title: '학급 투표 관리',
    summary: '학생들이 참여할 학급 투표를 만들고 결과를 확인합니다.',
    steps: ['투표 주제와 선택지를 만듭니다.', '공개 범위와 기간을 설정합니다.', '결과를 확인하고 수업에 활용합니다.'],
    tip: '자리 배치, 학급 행사, 학급 규칙 정하기에 활용하기 좋습니다.',
  },
  economyManage: {
    title: '학급 경제 관리',
    summary: '상점, 은행, 주식/ETF를 묶어서 관리하는 경제 시스템 영역입니다.',
    steps: ['학급 상점에서 소비처를 만듭니다.', '은행에서 예금과 이자를 관리합니다.', '주식/ETF에서 시장 가격과 배당을 운영합니다.'],
    tip: '재화를 많이 지급했다면 상점 아이템과 이벤트로 소비처를 함께 만들어 주세요.',
  },
  classShopManage: {
    title: '학급 상점 관리',
    summary: '학생들이 골드나 다이아로 구매할 수 있는 아이템을 등록합니다.',
    steps: ['아이템 이름, 설명, 가격을 입력합니다.', '구매 가능 수량과 판매 상태를 설정합니다.', '구매 내역을 확인하고 실제 보상을 제공합니다.'],
    tip: '자리바꾸기, 급식 1등권처럼 실제 교실에서 실행 가능한 보상이 운영하기 쉽습니다.',
  },
  bankManage: {
    title: '은행 관리',
    summary: '학생의 예금, 출금, 이자 지급을 관리합니다.',
    steps: ['학생별 보유 골드와 예금액을 확인합니다.', '필요 시 입금/출금 기록을 확인합니다.', '이자 정책을 조정합니다.'],
    tip: '이자율이 너무 높으면 골드가 빠르게 늘어나므로 상점 가격과 함께 조정하세요.',
  },
  stockManage: {
    title: '주식/ETF 관리',
    summary: '학급별 모의 시장을 운영하고 가격 변동, 배당, 포트폴리오를 관리합니다.',
    steps: ['안정형/균형형/공격형 시장 특징을 확인합니다.', '매일 8시 이후 첫 접속 시 시장이 자동으로 열립니다.', '학생 포트폴리오와 배당 내역을 확인합니다.'],
    tip: '실제 투자와 다르다는 점을 안내하고, 경제 개념 학습용으로 활용해 주세요.',
  },
  studentManage: {
    title: '학급/학생 관리',
    summary: '학생 계정, PIN, QR코드, 기본 정보를 관리합니다.',
    steps: ['학생 계정을 발급합니다.', 'PIN과 학생코드를 확인합니다.', 'QR 출력물로 학생 로그인을 안내합니다.'],
    tip: '처음 학급을 만든 뒤 학생 QR 출력물을 먼저 준비하면 접속 안내가 쉬워집니다.',
  },
  accountIssue: {
    title: '학생 계정 발급',
    summary: '학생 로그인 코드와 PIN을 만들고 출력하는 페이지입니다.',
    steps: ['학생 수를 확인합니다.', '필요한 학생을 추가/삭제합니다.', '출력 버튼으로 학생별 QR과 PIN 안내장을 준비합니다.'],
    tip: '학생코드는 반 번호 순서대로 관리하면 문제 발생 시 찾기 쉽습니다.',
  },
  systemSettings: {
    title: '시스템 설정',
    summary: '테마, 화면 표시, 메뉴 설정 등 학급 운영 환경을 조정합니다.',
    steps: ['밝은 모드/어두운 모드를 선택합니다.', '필요한 화면 설정을 조정합니다.', '변경 후 학생 화면에서 적용 상태를 확인합니다.'],
    tip: '학생용 메뉴를 숨길 때는 수업 흐름에 꼭 필요한 메뉴만 남겨두는 것이 좋습니다.',
  },
  dataReset: {
    title: '데이터 초기화 및 삭제',
    summary: '학급 데이터를 초기화하거나 학급을 삭제하는 위험 작업 메뉴입니다.',
    steps: ['초기화할 항목을 정확히 확인합니다.', '안내 문구를 읽고 실행합니다.', '완료 후 학급 선택 화면으로 돌아가는지 확인합니다.'],
    tip: '삭제 전에는 반드시 필요한 데이터가 없는지 확인해 주세요.',
  },
  inquiry: {
    title: '건의 및 문의하기',
    summary: '버그 신고, 기능 요청, 개선 의견을 관리자에게 보내는 메뉴입니다.',
    steps: ['문제가 생긴 화면과 상황을 적습니다.', '가능하면 학생/교사 화면 여부와 메뉴 이름을 함께 적습니다.', '전송 후 반영을 기다립니다.'],
    tip: '스크린샷과 함께 알려주시면 원인을 훨씬 빨리 찾을 수 있습니다.',
  },
};

const TeacherNavigationBar = ({ changeView, currentView, onLogout, teacherUser, selectedClass, hiddenMenuIds = [] }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenu, setExpandedMenu] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [fbText, setFbText]             = useState('');
  const [fbSaving, setFbSaving]         = useState(false);

  const hidden = new Set(hiddenMenuIds || []);
  const teacherMenuData = [
    {
      id: 'dashboard', icon: '🏠', title: '대시보드', isReady: true,
      subMenus: []
    },
    {
      id: 'topicWritingManage', icon: '✍️', title: '주제글쓰기 관리', isReady: true, directNav: true,
      subMenus: []
    },
    {
      id: 'classOperations', icon: '📋', title: '학급운영', isReady: true,
      subMenus: [
        { title: '퀘스트 관리', id: 'questManage' },
        { title: '🖐️ 학생 셀프체크인', id: 'questKiosk' },
        { title: '🏰 우리반 대작전', id: 'classOperationManage' },
      ],
    },
    {
      id: 'contentStudio', icon: '🧰', title: '수업 콘텐츠', isReady: true,
      subMenus: [
        { title: '📚 퀴즈 은행',    id: 'quizBank' },
        { title: '퀴즈던전 관리',  id: 'quizDungeonManage' },
        { title: '보스레이드 관리', id: 'bossRaidManage' },
        { title: '🤖 AI 학습현황', id: 'aiCourseware' },
        { title: 'AI 학습 학생화면', id: 'aiCoursewareView' },
      ],
    },
    {
      id: 'classActivities', icon: '💬', title: '학급 활동', isReady: true,
      subMenus: [
        { title: '공유 게시판',       id: 'boardManage' },
        { title: '📚 배움노트 관리',  id: 'learningNoteManage' },
        { title: '📋 자유 게시판',    id: 'freeBoard' },
        { title: '📊 학급 투표 관리', id: 'classVoteManage' },
        { title: '🏆 명예의 전당',    id: 'hallOfFame' },
      ],
    },
    {
      id: 'gameReward', icon: '⚔️', title: '게임·보상 관리', isReady: true,
      subMenus: [
        { title: '내 캐릭터', id: 'myCharacter' },
        { title: '탐험던전 테스트', id: 'explorationDungeon' },
        { title: '어드벤처 이용권 관리', id: 'adventureManage' },
      ],
    },
    {
      id: 'economyManage', icon: '💎', title: '학급 경제 관리', isReady: true,
      subMenus: [
        { title: '학급 상점 관리', id: 'classShopManage' },
        { title: '은행 관리',     id: 'bankManage' },
        { title: '주식etf 관리',  id: 'stockManage' },
      ]
    },
    {
      id: 'studentManage', icon: '👥', title: '학생·학급 관리', isReady: true,
      subMenus: [
        { title: '학생 계정 발급', id: 'accountIssue' },
      ],
    }
  ].filter((menu) => !hidden.has(menu.id))
    .map((menu) => ({
      ...menu,
      subMenus: (menu.subMenus || []).filter((sub) => !hidden.has(sub.id)),
    }))
    .filter((menu) => menu.subMenus.length > 0 || menu.id === 'dashboard' || menu.directNav);

  const utilityMenus = [
    { id: 'systemSettings', icon: '⚙️', title: '시스템 설정' },
    { id: 'dataReset', icon: '🗑️', title: '데이터 초기화' },
    { id: 'inquiry', icon: '💬', title: '건의 및 문의' },
  ].filter((menu) => !hidden.has(menu.id));

  const activeParentId = teacherMenuData.find(menu => menu.subMenus.some(sub => sub.id === currentView))?.id;
  const visibleExpandedMenu = expandedMenu ?? activeParentId;

  const submitFeedback = async () => {
    if (!fbText.trim()) return;
    setFbSaving(true);
    try {
      await addDoc(collection(db, 'feedbacks'), {
        teacherUid:   teacherUser?.uid   || null,
        teacherEmail: teacherUser?.email || '',
        message:      fbText.trim(),
        status:       'new',
        createdAt:    serverTimestamp(),
      });
      setFbText('');
      setShowFeedback(false);
      alert('✅ 건의/문의가 전달되었습니다. 감사합니다!');
    } catch { alert('전송 실패'); }
    finally { setFbSaving(false); }
  };

  const handleMenuClick = (menuId) => {
    const clickedMenu = teacherMenuData.find(m => m.id === menuId);

    if (changeView && (clickedMenu?.id === 'dashboard' || clickedMenu?.directNav)) {
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
    const parent = teacherMenuData.find(menu => menu.subMenus.some(sub => sub.id === subMenuId));
    if (parent) setExpandedMenu(parent.id);
    if (changeView) {
      changeView(subMenuId); 
    }
  };

  const handleUtilityClick = (menuId) => {
    changeView?.(menuId);
  };

  return (
    <>
    <nav className={`${isSidebarOpen ? 'w-64' : 'w-[72px]'} bg-indigo-950 text-indigo-100 transition-all duration-300 flex flex-col h-full z-50 shadow-2xl`}>
      
      {/* 최상단 로고 영역 */}
      <div className="flex items-center justify-between px-4 h-[84px] border-b border-indigo-900 shrink-0">
        {isSidebarOpen && (
          <div className="flex flex-col">
            <span className="font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-400 text-lg tracking-wide truncate">
              Teacher Mode
            </span>
            {selectedClass?.grade && selectedClass?.classNumber ? (
              <span className="max-w-40 truncate text-[11px] text-indigo-200 font-bold tracking-wide">
                {selectedClass.schoolName ? `${selectedClass.schoolName} · ` : ''}{selectedClass.grade}학년 {selectedClass.classNumber}반
              </span>
            ) : (
              <span className="text-xs text-indigo-300 font-bold tracking-widest">LEVELUP CLASS</span>
            )}
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
      <ul className="flex-1 px-3 py-4 overflow-y-auto space-y-1 scrollbar-hide">
        {teacherMenuData.map((menu) => (
          <li key={menu.id} className="flex flex-col">
            <div
              onClick={() => handleMenuClick(menu.id)}
              className={`min-h-11 px-2.5 py-2 rounded-xl cursor-pointer flex items-center justify-between transition-colors
                ${currentView === menu.id || menu.subMenus.some(sub => sub.id === currentView) ? 'bg-indigo-900 text-amber-300 font-bold' : 'text-indigo-100 hover:bg-indigo-900/70 hover:text-white'}
                ${!menu.isReady ? 'opacity-50' : ''}
              `}
            >
              <div className="flex items-center">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-[20px]">{menu.icon}</span>

                {isSidebarOpen && (
                  <span className={`ml-3 text-[13px] font-semibold ${(currentView === menu.id || menu.subMenus.some(sub => sub.id === currentView)) ? 'font-extrabold' : ''}`}>
                    {menu.title}
                    {!menu.isReady && <span className="ml-2 text-[10px] bg-indigo-800 text-indigo-300 px-2 py-0.5 rounded-full">준비중</span>}
                  </span>
                )}
              </div>
              
              {isSidebarOpen && menu.subMenus.length > 0 && (
                <svg className={`w-4 h-4 text-indigo-400 transition-transform duration-300 ${visibleExpandedMenu === menu.id ? 'rotate-180 text-amber-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              )}
            </div>

            {/* 하위 메뉴 */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isSidebarOpen && visibleExpandedMenu === menu.id ? 'max-h-[420px] opacity-100 mt-1 mb-2' : 'max-h-0 opacity-0'}`}>
              <ul className="space-y-1">
                {menu.subMenus.map((subMenu, idx) => (
                  <li 
                    key={idx} 
                    onClick={(e) => handleSubMenuClick(e, subMenu.id)}
                    className={`ml-5 pl-7 pr-2 py-2 text-[12px] rounded-lg cursor-pointer transition-colors flex items-center border-l before:content-[''] before:w-1 before:h-1 before:rounded-full before:mr-2.5
                      ${currentView === subMenu.id 
                        ? 'border-amber-400 text-amber-300 bg-indigo-900/50 before:bg-amber-400 font-bold'
                        : 'border-indigo-800 text-indigo-300 hover:text-white hover:bg-indigo-900/30 before:bg-indigo-600 hover:before:bg-indigo-300'
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

      <div className="border-t border-indigo-900 p-3 shrink-0 space-y-1">
        {utilityMenus.map(menu => (
          <button key={menu.id} onClick={() => handleUtilityClick(menu.id)}
            className={`flex min-h-10 w-full items-center rounded-xl px-2.5 text-left transition-colors ${currentView === menu.id ? 'bg-indigo-900 text-amber-300' : 'text-indigo-300 hover:bg-indigo-900/70 hover:text-white'}`}>
            <span className="grid h-7 w-8 shrink-0 place-items-center text-lg">{menu.icon}</span>
            {isSidebarOpen && <span className="ml-3 text-xs font-bold">{menu.title}</span>}
          </button>
        ))}
        <button 
          onClick={onLogout}
          className="flex min-h-10 w-full items-center rounded-xl px-2.5 text-indigo-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors group"
        >
          <span className="grid h-7 w-8 shrink-0 place-items-center text-lg group-hover:scale-110 transition-transform">🚪</span>
          {isSidebarOpen && <span className="ml-3 font-bold text-xs">학생 화면 복귀 (로그아웃)</span>}
        </button>
      </div>
    </nav>

    {/* 건의/문의 모달 */}
    {showFeedback && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="p-5 bg-indigo-600 text-white font-bold text-lg flex justify-between">
            <span>💬 건의 및 문의하기</span>
            <button onClick={() => setShowFeedback(false)} className="text-indigo-200 hover:text-white">✕</button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-slate-500">버그 신고, 기능 요청, 개선 사항 등 무엇이든 남겨주세요. 관리자가 확인 후 처리합니다.</p>
            <textarea value={fbText} onChange={e => setFbText(e.target.value)}
              placeholder="내용을 입력하세요..."
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm resize-none h-32 focus:outline-none focus:border-indigo-500" />
          </div>
          <div className="p-4 border-t border-slate-100 flex gap-3">
            <button onClick={() => setShowFeedback(false)}
              className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">취소</button>
            <button onClick={submitFeedback} disabled={fbSaving || !fbText.trim()}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40">
              {fbSaving ? '전송 중...' : '전송하기'}
            </button>
          </div>
        </div>
      </div>
    )}

    </>
  );
};

export default TeacherNavigationBar;
