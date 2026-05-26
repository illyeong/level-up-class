import React, { useEffect, useMemo, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';

const INTRO_SECTIONS = [
  {
    id: 'student',
    label: '학생 화면',
    desc: '학생이 실제로 사용하는 주요 기능 화면',
    items: [
      ['학생 대시보드', '학생대시보드.png'],
      ['나의 퀘스트', '학생-퀘스트.png'],
      ['학급 상점', '학급상점.png'],
      ['학급 은행', '학급은행.png'],
      ['주식/ETF 거래소', '주식ETF.png'],
      ['장비창', '장비창.png'],
      ['아바타 룸', '아바타룸.png'],
      ['보물상자', '보물상자.png'],
      ['투기장', '투기장.png'],
      ['탐험던전', '탐험던전.png'],
      ['퀴즈던전', '퀴즈던전.png'],
      ['배움노트 쓰기', '배움노트쓰기.png'],
      ['학생 셀프체크인', '학생 셀프체크인.png'],
    ],
  },
  {
    id: 'teacher',
    label: '교사 화면',
    desc: '교사가 운영/관리하는 핵심 화면',
    items: [
      ['교사 대시보드', '교사대시보드.png'],
      ['학생 계정 발급', '학생계정발급.png'],
      ['퀘스트 관리', '교사-퀘스트관리.png'],
      ['퀴즈 은행', '퀴즈은행.png'],
      ['퀴즈던전 관리', '퀴즈던전 관리.png'],
      ['어드벤처 관리', '어드벤처관리.png'],
      ['보스레이드 관리', '보스레이드관리.png'],
      ['배움노트 관리', '배움노트관리.png'],
      ['주식/ETF 관리', '주식ETF관리.png'],
      ['공유게시판', '공유게시판.png'],
      ['AI 문제출제', 'AI문제출제.png'],
    ],
  },
  {
    id: 'battle',
    label: '전투/레이드',
    desc: '전투, 레이드, 랭킹 관련 화면',
    items: [
      ['당 명예의 전당', '당명예의 전당.png'],
      ['보스레이드 대기실', '보스레이드 대기실.png'],
      ['보스레이드 전투화면', '보스레이드 전투화면.png'],
    ],
  },
];

function IntroModal({ open, onClose }) {
  const [tab, setTab] = useState(INTRO_SECTIONS[0].id);
  const selected = useMemo(
    () => INTRO_SECTIONS.find((section) => section.id === tab) || INTRO_SECTIONS[0],
    [tab]
  );

  useEffect(() => {
    if (!open) return undefined;
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 p-4 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-7xl max-h-[92vh] rounded-2xl border border-white/15 bg-slate-900 overflow-hidden shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-white font-extrabold text-lg">LevelUp Class 소개</h3>
            <p className="text-indigo-200/80 text-xs mt-0.5">{selected.desc}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm font-bold hover:bg-white/20"
          >
            닫기
          </button>
        </div>

        <div className="px-5 pt-4 pb-3 border-b border-white/10 flex flex-wrap gap-2 items-center">
          {INTRO_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setTab(section.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                section.id === tab
                  ? 'bg-indigo-500 border-indigo-400 text-white'
                  : 'bg-white/5 border-white/15 text-indigo-100 hover:bg-white/10'
              }`}
            >
              {section.label} ({section.items.length})
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto max-h-[72vh] bg-slate-900">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {selected.items.map(([title, file]) => (
              <article key={file} className="rounded-xl border border-white/15 bg-slate-800/50 overflow-hidden hover:border-indigo-300/40 transition-colors">
                <div className="px-3 py-2 border-b border-white/10">
                  <p className="text-indigo-100 text-sm font-bold">{title}</p>
                </div>
                <div className="aspect-[16/10] bg-slate-950">
                  <img
                    src={`/intro/${encodeURIComponent(file)}`}
                    alt={title}
                    loading="lazy"
                    className="w-full h-full object-contain"
                  />
                </div>
              </article>
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
              className="flex-1 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 text-xs font-bold py-2 rounded-xl border border-white/10 transition-colors"
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
