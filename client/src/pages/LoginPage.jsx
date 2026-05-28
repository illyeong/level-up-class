import React, { useEffect, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';

const GUIDE_TABS = [
  { id: 'student', label: '🎓 학생 메뉴' },
  { id: 'teacher', label: '👨‍🏫 교사 메뉴' },
];

const STUDENT_MENUS = [
  {
    icon: '📊', title: '대시보드', color: 'indigo',
    desc: '내 캐릭터 레벨·골드·다이아·경험치를 한눈에 확인하고 오늘의 퀘스트 현황을 파악합니다.',
    features: [
      { name: '내 스탯 요약', desc: '레벨, 골드, 다이아, 경험치 진행률 표시' },
      { name: '우리반 전체 보기', desc: '반 친구들의 캐릭터와 레벨 카드 확인' },
      { name: '오늘의 할 일', desc: '진행 중인 퀘스트 및 미완료 항목 알림' },
    ],
  },
  {
    icon: '🦸‍♂️', title: '내 캐릭터', color: 'purple',
    desc: '나만의 캐릭터를 성장시키고 꾸밉니다. 아바타, 장비, 보물상자까지 다양한 콘텐츠가 있습니다.',
    features: [
      { name: '캐릭터 현황', desc: '레벨·경험치·스탯 확인 및 성장 그래프' },
      { name: '아바타 룸', desc: 'Unity 기반 캐릭터 외형 커스터마이징·저장' },
      { name: '장비', desc: '장비 착용·강화로 공격력·방어력 스탯 상승' },
      { name: '보물상자', desc: '다이아로 뽑기해 무작위 보상 획득' },
    ],
  },
  {
    icon: '⚔️', title: '퀘스트', color: 'amber',
    desc: '선생님이 만든 퀘스트를 수행하고 골드·경험치 보상을 받습니다.',
    features: [
      { name: '진행중 탭', desc: '수행해야 할 퀘스트 목록, 자기 체크 제출' },
      { name: '완료 탭', desc: '완료·보상 대기 퀘스트 현황 확인' },
      { name: '보상로그 탭', desc: '지금까지 받은 보상 내역 기록' },
    ],
  },
  {
    icon: '📚', title: '배움노트', color: 'teal',
    desc: '오늘 수업에서 배운 내용을 기록합니다. 선생님이 확인 후 보상을 지급합니다.',
    features: [
      { name: '노트 작성', desc: '자유형식으로 학습 내용 기록' },
      { name: '승인 대기', desc: '작성한 노트의 승인 상태 확인' },
      { name: '보상 획득', desc: '승인 시 골드·경험치 자동 지급' },
    ],
  },
  {
    icon: '📋', title: '공유 게시판', color: 'sky',
    desc: '선생님이 올린 수업 자료, 공지, 학습 자료를 확인합니다.',
    features: [
      { name: '시트별 게시판', desc: '주제별로 분류된 학습 게시판' },
      { name: '공지 확인', desc: '중요 공지 및 과제 안내' },
    ],
  },
  {
    icon: '🗺️', title: '어드벤처', color: 'emerald',
    desc: '퀴즈·탐험·전투 콘텐츠로 공부와 게임을 동시에! 이용권으로 입장하며 매주 자동 지급됩니다.',
    features: [
      { name: '퀴즈던전', desc: '문제를 풀며 몬스터를 처치하는 솔로 퀴즈 배틀' },
      { name: '탐험던전', desc: 'Unity 2D 플랫포머 액션 던전 탐험' },
      { name: '투기장', desc: '실시간 1:1 퀴즈 PvP 배틀' },
      { name: '보스 레이드', desc: '학급 전체 협동으로 보스 HP를 0으로 만들기' },
    ],
  },
  {
    icon: '💰', title: '무역 센터', color: 'yellow',
    desc: '학급 경제 시스템에 참여합니다. 은행 이자, 상점 구매, 주식 투자까지!',
    features: [
      { name: '학급 은행', desc: '골드·다이아 예치·출금, 주간 복리 이자' },
      { name: '학급 상점', desc: '아이템 구매 → 인벤토리 보유 → 사용 시스템' },
      { name: '주식/ETF 거래소', desc: '실시간 가격 기반 매수·매도, 배당 수익' },
    ],
  },
  {
    icon: '📢', title: '마을 광장', color: 'rose',
    desc: '학급 친구들과 소통하고 투표에 참여합니다.',
    features: [
      { name: '자유 게시판', desc: '자유로운 학급 소통 공간' },
      { name: '학급 투표', desc: '다양한 주제로 실시간 학급 투표 진행' },
    ],
  },
  {
    icon: '⚙️', title: '시스템 설정', color: 'slate',
    desc: '프로필과 앱 테마를 내 취향에 맞게 설정합니다.',
    features: [
      { name: '프로필 수정', desc: '닉네임 변경' },
      { name: '테마 설정', desc: '어두운 모드 / 밝은 모드 전환' },
    ],
  },
];

const TEACHER_MENUS = [
  {
    icon: '📊', title: '대시보드', color: 'amber',
    desc: '학급 전체 현황을 한눈에 파악하고, 재화 지급·학생 상태 모니터링을 빠르게 처리합니다.',
    features: [
      { name: '학급 현황 요약', desc: '퀘스트 진행률, 오늘 활동, 승인 대기 수' },
      { name: '재화 지급·차감', desc: '골드·다이아 개별 또는 전체 학생에게 지급' },
      { name: '학생 테스트 로그인', desc: '특정 학생 화면으로 진입해 미리 확인' },
    ],
  },
  {
    icon: '⚔️', title: '퀘스트 관리소', color: 'orange',
    desc: '퀘스트를 직접 만들고 관리합니다. 학생이 키오스크에서 셀프 체크인도 가능합니다.',
    features: [
      { name: '퀘스트 생성·수정·복제', desc: '기간·보상·유형 설정, 추천 템플릿 제공' },
      { name: '진행률 모니터링', desc: '학생별 달성 현황 실시간 확인' },
      { name: '셀프 체크인 키오스크', desc: '전체화면 오버레이로 학생이 직접 퀘스트 체크' },
    ],
  },
  {
    icon: '🗺️', title: '어드벤처 관리', color: 'emerald',
    desc: '퀴즈 콘텐츠를 만들고 레이드를 운영합니다. AI가 퀴즈를 자동으로 생성해 줍니다.',
    features: [
      { name: '퀴즈 은행', desc: '문제 제작·보관, 카테고리 분류' },
      { name: '퀴즈던전 관리', desc: 'AI 퀴즈 자동 생성 (PDF·PPT 업로드 지원), 던전 발행' },
      { name: '보스레이드 관리', desc: '레이드 생성·종료, 실시간 HP 모니터링, 보상 일괄 지급' },
      { name: '어드벤처 이용권 관리', desc: '학생별·전체 이용권 부여 및 초기화' },
    ],
  },
  {
    icon: '📋', title: '게시판 및 배움노트', color: 'sky',
    desc: '학급 공유 자료를 관리하고 학생 배움노트를 승인합니다.',
    features: [
      { name: '공유 게시판 관리', desc: '시트·그룹·게시글 구조로 학습 자료 운영' },
      { name: '배움노트 승인', desc: '학생 노트 승인·반려 및 보상 지급' },
    ],
  },
  {
    icon: '💎', title: '학급 경제 관리', color: 'violet',
    desc: '학급 경제 시스템 전체를 운영합니다. 상점, 은행, 주식 모두 교사가 설정합니다.',
    features: [
      { name: '학급 상점 관리', desc: '아이템 등록·수정·삭제, 구매 및 사용 내역' },
      { name: '은행 관리', desc: '예치 이율 설정, 이자 일괄 지급' },
      { name: '주식/ETF 관리', desc: '가격 새로고침, 배당 지급, 선생님의 영혼 특별 채권 운영' },
    ],
  },
  {
    icon: '📢', title: '마을 광장 관리', color: 'rose',
    desc: '게시판, 명예의 전당, 학급 투표를 관리합니다.',
    features: [
      { name: '자유 게시판 관리', desc: '게시글 모더레이션' },
      { name: '명예의 전당', desc: '투기장·던전 랭킹 관리' },
      { name: '학급 투표 관리', desc: '투표 생성·종료·결과 확인' },
    ],
  },
  {
    icon: '👨‍🎓', title: '학급/학생 관리', color: 'teal',
    desc: '학생 계정을 발급하고 출력물을 만듭니다.',
    features: [
      { name: '학생 계정 발급', desc: '학번·이름 입력, PIN 생성·개별·전체 초기화' },
      { name: 'QR 출력', desc: '학생 코드·QR 카드 인쇄용 출력' },
    ],
  },
  {
    icon: '⚙️', title: '시스템 설정', color: 'slate',
    desc: '학생에게 보여줄 메뉴를 선택하고 데이터를 관리합니다.',
    features: [
      { name: '메뉴 활성화·비활성화', desc: '학생·교사 메뉴별 노출 여부 개별 설정' },
      { name: '데이터 초기화', desc: '학급 경제·퀘스트 데이터 선택 초기화' },
    ],
  },
];

const COLOR_MAP = {
  indigo: { card: 'border-indigo-500/30 bg-indigo-950/40', icon: 'bg-indigo-500/20 text-indigo-300', badge: 'bg-indigo-500/20 text-indigo-200', dot: 'bg-indigo-400' },
  purple: { card: 'border-purple-500/30 bg-purple-950/40', icon: 'bg-purple-500/20 text-purple-300', badge: 'bg-purple-500/20 text-purple-200', dot: 'bg-purple-400' },
  amber:  { card: 'border-amber-500/30 bg-amber-950/40',  icon: 'bg-amber-500/20 text-amber-300',  badge: 'bg-amber-500/20 text-amber-200',  dot: 'bg-amber-400' },
  teal:   { card: 'border-teal-500/30 bg-teal-950/40',   icon: 'bg-teal-500/20 text-teal-300',   badge: 'bg-teal-500/20 text-teal-200',   dot: 'bg-teal-400' },
  sky:    { card: 'border-sky-500/30 bg-sky-950/40',     icon: 'bg-sky-500/20 text-sky-300',     badge: 'bg-sky-500/20 text-sky-200',     dot: 'bg-sky-400' },
  emerald:{ card: 'border-emerald-500/30 bg-emerald-950/40', icon: 'bg-emerald-500/20 text-emerald-300', badge: 'bg-emerald-500/20 text-emerald-200', dot: 'bg-emerald-400' },
  yellow: { card: 'border-yellow-500/30 bg-yellow-950/40', icon: 'bg-yellow-500/20 text-yellow-300', badge: 'bg-yellow-500/20 text-yellow-200', dot: 'bg-yellow-400' },
  rose:   { card: 'border-rose-500/30 bg-rose-950/40',   icon: 'bg-rose-500/20 text-rose-300',   badge: 'bg-rose-500/20 text-rose-200',   dot: 'bg-rose-400' },
  slate:  { card: 'border-slate-500/30 bg-slate-800/40', icon: 'bg-slate-500/20 text-slate-300', badge: 'bg-slate-500/20 text-slate-200', dot: 'bg-slate-400' },
  orange: { card: 'border-orange-500/30 bg-orange-950/40', icon: 'bg-orange-500/20 text-orange-300', badge: 'bg-orange-500/20 text-orange-200', dot: 'bg-orange-400' },
  violet: { card: 'border-violet-500/30 bg-violet-950/40', icon: 'bg-violet-500/20 text-violet-300', badge: 'bg-violet-500/20 text-violet-200', dot: 'bg-violet-400' },
};

function MenuCard({ menu }) {
  const [expanded, setExpanded] = useState(false);
  const c = COLOR_MAP[menu.color] || COLOR_MAP.slate;
  return (
    <article className={`rounded-2xl border ${c.card} overflow-hidden transition-all duration-200`}>
      <button
        type="button"
        className="w-full text-left px-4 py-3.5 flex items-start gap-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`text-2xl w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${c.icon}`}>
          {menu.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-white font-extrabold text-sm">{menu.title}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${c.badge}`}>
              {menu.features.length}개 기능
            </span>
          </div>
          <p className="text-slate-300 text-xs mt-1 leading-relaxed">{menu.desc}</p>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 shrink-0 mt-1 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-4 py-3 space-y-2">
          {menu.features.map((f) => (
            <div key={f.name} className="flex items-start gap-2.5">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${c.dot}`} />
              <div>
                <span className="text-white text-xs font-bold">{f.name}</span>
                <span className="text-slate-400 text-xs"> — {f.desc}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function IntroModal({ open, onClose }) {
  const [tab, setTab] = useState('student');

  useEffect(() => {
    if (!open) return undefined;
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const menus = tab === 'student' ? STUDENT_MENUS : TEACHER_MENUS;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm p-4 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] rounded-2xl border border-white/15 bg-slate-900 overflow-hidden shadow-2xl shadow-black/60 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-white font-extrabold text-lg">LevelUp Class 기능 안내</h3>
            <p className="text-indigo-200/70 text-xs mt-0.5">각 메뉴를 클릭하면 상세 기능을 확인할 수 있습니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm font-bold hover:bg-white/20 transition-colors"
          >
            닫기
          </button>
        </div>

        {/* 탭 */}
        <div className="px-5 pt-4 pb-3 border-b border-white/10 flex gap-2 shrink-0">
          {GUIDE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                t.id === tab
                  ? t.id === 'student'
                    ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-900/40'
                    : 'bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-900/40'
                  : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
              }`}
            >
              {t.label}
              <span className="ml-2 text-[11px] opacity-70">({(t.id === 'student' ? STUDENT_MENUS : TEACHER_MENUS).length}개 메뉴)</span>
            </button>
          ))}
        </div>

        {/* 설명 배너 */}
        <div className={`px-5 py-3 shrink-0 ${
          tab === 'student'
            ? 'bg-indigo-900/30 border-b border-indigo-500/20'
            : 'bg-amber-900/30 border-b border-amber-500/20'
        }`}>
          <p className="text-sm font-bold text-white">
            {tab === 'student'
              ? '🎓 학생은 로그인 후 아래 메뉴를 통해 학급 활동에 참여합니다.'
              : '👨‍🏫 교사는 구글 계정으로 로그인 후 학급을 선택하여 전체 시스템을 운영합니다.'}
          </p>
        </div>

        {/* 메뉴 카드 그리드 */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {menus.map((menu) => (
              <MenuCard key={menu.title} menu={menu} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage({ onTeacherLogin, onStudentLogin }) {
  const [mode, setMode] = useState(null); // null | 'student'
  const [studentCode, setStudentCode] = useState('');
  const [isCodeLocked, setIsCodeLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isIntroOpen, setIsIntroOpen] = useState(false);

  useEffect(() => {
    const codeFromUrl = new URLSearchParams(window.location.search).get('code');
    if (!codeFromUrl) return;
    setStudentCode(codeFromUrl.trim().toUpperCase());
    setIsCodeLocked(true);
    setMode('student');
  }, []);

  const handleTeacherLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      onTeacherLogin(result.user);
    } catch (e) {
      if (e.code === 'auth/popup-blocked') {
        setError('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.');
      } else if (e.code === 'auth/unauthorized-domain') {
        setError('현재 도메인이 Firebase 인증 허용 목록에 없습니다.');
      } else if (e.code !== 'auth/popup-closed-by-user') {
        setError(`로그인 실패: ${e.code}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStudentLogin = async (e) => {
    e.preventDefault();
    if (!studentCode.trim() || !pin.trim()) return;

    setLoading(true);
    setError('');
    try {
      const q = query(
        collection(db, 'students'),
        where('studentCode', '==', studentCode.trim().toUpperCase()),
        where('pin', '==', pin.trim())
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setError('학생 코드 또는 PIN이 올바르지 않습니다.');
        return;
      }

      const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
      onStudentLogin(data);
    } catch {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/images/openingpage.png)' }}
      />
      <div className="absolute inset-0 bg-slate-900/55" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10">
          <img
            src={`/images/levelupclass.png?t=${Date.now()}`}
            alt="LevelUp Class"
            className="w-full object-contain drop-shadow-lg"
          />
          <p className="text-indigo-300 mt-3 font-medium">게임형 학급 경제 관리 시스템</p>
        </div>

        {mode === null && (
          <div className="space-y-4">
            <button
              onClick={() => setMode('student')}
              className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-4 px-6 rounded-2xl text-lg transition-all hover:scale-[1.02] shadow-lg shadow-indigo-900/50 flex items-center justify-center gap-3"
            >
              <span className="text-2xl">🎓</span> 학생 로그인
            </button>

            <button
              onClick={handleTeacherLogin}
              disabled={loading}
              className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-4 px-6 rounded-2xl text-lg transition-all hover:scale-[1.02] border border-white/20 flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              교사 로그인 (Google)
            </button>

            <button
              type="button"
              onClick={() => setIsIntroOpen(true)}
              className="w-full bg-white/5 hover:bg-white/10 text-indigo-100 font-bold py-3.5 px-6 rounded-2xl border border-white/20 transition-all hover:scale-[1.01]"
            >
              소개화면 보기
            </button>
          </div>
        )}

        {mode === 'student' && (
          <form onSubmit={handleStudentLogin} className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20">
            <h2 className="text-white font-bold text-xl mb-6 text-center">학생 로그인</h2>

            <div className="space-y-4">
              {!isCodeLocked ? (
                <div>
                  <label className="text-indigo-200 text-sm font-bold mb-1.5 block">학생 코드</label>
                  <input
                    type="text"
                    value={studentCode}
                    onChange={(e) => setStudentCode(e.target.value)}
                    placeholder="예: SINSEOK-5-01"
                    className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 font-mono font-bold focus:outline-none focus:border-indigo-400"
                    autoCapitalize="characters"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-indigo-300/30 bg-indigo-500/10 px-4 py-3 text-center">
                  <p className="text-indigo-100 text-xs font-bold mb-1">QR 인증 코드</p>
                  <p className="text-white font-mono font-extrabold">{studentCode}</p>
                </div>
              )}

              <div>
                <label className="text-indigo-200 text-sm font-bold mb-1.5 block">PIN 번호</label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="4자리 PIN"
                  maxLength={6}
                  className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 font-mono text-center text-2xl tracking-widest focus:outline-none focus:border-indigo-400"
                />
              </div>

              {error && (
                <p className="text-rose-400 text-sm font-bold text-center bg-rose-500/10 rounded-xl py-2 px-4">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !studentCode || !pin}
                className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-all"
              >
                {loading ? '확인 중...' : '입장하기'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setMode(null);
                setError('');
              }}
              className="w-full mt-4 text-indigo-300 hover:text-white text-sm font-medium transition-colors"
            >
              뒤로
            </button>
          </form>
        )}

        {error && mode === null && (
          <p className="text-rose-400 text-sm font-bold text-center mt-4 bg-rose-500/10 rounded-xl py-2 px-4">
            {error}
          </p>
        )}

        <div className="mt-8 border-t border-white/10 pt-6">
          <div className="mb-3 bg-white/10 border border-white/20 rounded-2xl p-3.5">
            <p className="text-white font-extrabold text-sm mb-1">학생 테스트 페이지 안내</p>
            <p className="text-indigo-200 text-xs leading-relaxed">
              학생 테스트 페이지로 모든 기능을 확인하실 수 있습니다.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const pw = window.prompt('비밀번호를 입력해 주세요');
                if (pw === '1234') onTeacherLogin({ email: 'test@test.com', displayName: '테스트 교사' });
                else if (pw !== null) alert('비밀번호가 올바르지 않습니다.');
              }}
              className="hidden flex-1 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 text-xs font-bold py-2 rounded-xl border border-white/10 transition-colors"
            >
              교사 테스트
            </button>
            <button
              onClick={() => {
                const pw = window.prompt('비밀번호를 입력해 주세요');
                if (pw === '0505') onStudentLogin({ id: 'test', studentCode: 'SINSEOK-5-15', name: '테스트 학생' });
                else if (pw !== null) alert('비밀번호가 올바르지 않습니다.');
              }}
              className="flex-1 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 text-xs font-bold py-2 rounded-xl border border-white/10 transition-colors"
            >
              학생 테스트
            </button>
          </div>
        </div>
      </div>

      <IntroModal open={isIntroOpen} onClose={() => setIsIntroOpen(false)} />
    </div>
  );
}
