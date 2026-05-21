import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';

// .env 파일에 VITE_TEACHER_EMAILS=email1@gmail.com,email2@gmail.com 등록
const TEACHER_EMAILS = (import.meta.env.VITE_TEACHER_EMAILS || '')
  .split(',').map(e => e.trim()).filter(Boolean);

export default function LoginPage({ onTeacherLogin, onStudentLogin }) {
  const [mode, setMode]         = useState(null); // null | 'student'
  const [studentCode, setCode]  = useState('');
  const [pin, setPin]           = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // ── 교사 구글 로그인 ─────────────────────────────────────────
  const handleTeacherLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email  = result.user.email;

      if (TEACHER_EMAILS.length > 0 && !TEACHER_EMAILS.includes(email)) {
        await auth.signOut();
        setError('등록된 교사 계정이 아닙니다.');
        return;
      }
      onTeacherLogin(result.user);
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user')
        setError('로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // ── 학생 ID + PIN 로그인 ──────────────────────────────────────
  const handleStudentLogin = async (e) => {
    e.preventDefault();
    if (!studentCode.trim() || !pin.trim()) return;
    setLoading(true);
    setError('');
    try {
      const q    = query(
        collection(db, 'students'),
        where('studentCode', '==', studentCode.trim().toUpperCase()),
        where('pin', '==', pin.trim())
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setError('학생 코드 또는 PIN이 올바르지 않습니다.');
      } else {
        const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
        onStudentLogin(data);
      }
    } catch (e) {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // ── 렌더링 ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* 타이틀 */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-4">🏰</div>
          <h1 className="text-4xl font-black text-white tracking-tight">LevelUp Class</h1>
          <p className="text-indigo-300 mt-2 font-medium">게임형 학급 관리 플랫폼</p>
        </div>

        {/* 모드 선택 */}
        {mode === null && (
          <div className="space-y-4">
            <button
              onClick={() => setMode('student')}
              className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-4 px-6 rounded-2xl text-lg transition-all hover:scale-[1.02] shadow-lg shadow-indigo-900/50 flex items-center justify-center gap-3">
              <span className="text-2xl">🧑‍🎓</span> 학생 로그인
            </button>
            <button
              onClick={handleTeacherLogin}
              disabled={loading}
              className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-4 px-6 rounded-2xl text-lg transition-all hover:scale-[1.02] border border-white/20 flex items-center justify-center gap-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              교사 로그인 (Google)
            </button>
          </div>
        )}

        {/* 학생 로그인 폼 */}
        {mode === 'student' && (
          <form onSubmit={handleStudentLogin} className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20">
            <h2 className="text-white font-bold text-xl mb-6 text-center">학생 로그인</h2>

            <div className="space-y-4">
              <div>
                <label className="text-indigo-200 text-sm font-bold mb-1.5 block">학생 코드</label>
                <input
                  type="text"
                  value={studentCode}
                  onChange={e => setCode(e.target.value)}
                  placeholder="예: SINSEOK-5-01"
                  className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 font-mono font-bold focus:outline-none focus:border-indigo-400"
                  autoCapitalize="characters"
                />
              </div>

              <div>
                <label className="text-indigo-200 text-sm font-bold mb-1.5 block">PIN 번호</label>
                <input
                  type="password"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
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
                className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-all">
                {loading ? '확인 중...' : '입장하기'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setMode(null); setError(''); }}
              className="w-full mt-4 text-indigo-300 hover:text-white text-sm font-medium transition-colors">
              ← 뒤로
            </button>
          </form>
        )}

        {error && mode === null && (
          <p className="text-rose-400 text-sm font-bold text-center mt-4 bg-rose-500/10 rounded-xl py-2 px-4">
            {error}
          </p>
        )}

      </div>
    </div>
  );
}
