import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebase';

function EditProfile({ studentCode, onNameSaved }) {
  const [inputCode, setInputCode]     = useState('');
  const [studentDocId, setStudentDocId] = useState(null);
  const [currentName, setCurrentName] = useState('');
  const [newName, setNewName]         = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [isSearched, setIsSearched]   = useState(false);
  const [isSaved, setIsSaved]         = useState(false);
  const [error, setError]             = useState('');

  // 이미 studentCode가 전달되면 자동 조회
  useEffect(() => {
    if (studentCode) {
      setInputCode(studentCode);
      searchStudent(studentCode);
    }
  }, [studentCode]);

  const searchStudent = async (code) => {
    const target = (code || inputCode).trim().toUpperCase();
    if (!target) { setError('학생 코드를 입력해주세요.'); return; }

    setIsLoading(true);
    setError('');
    setIsSearched(false);

    try {
      const q    = query(collection(db, 'students'), where('studentCode', '==', target));
      const snap = await getDocs(q);

      if (snap.empty) {
        setError(`"${target}" 코드의 학생 계정을 찾을 수 없습니다.`);
        setStudentDocId(null);
      } else {
        const data = snap.docs[0].data();
        setStudentDocId(snap.docs[0].id);
        setCurrentName(data.name || '');
        setNewName(data.name || '');
        setIsSearched(true);
      }
    } catch (err) {
      console.error('학생 조회 에러:', err);
      setError('조회 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const saveName = async () => {
    if (!studentDocId) return;
    const trimmed = newName.trim();
    if (!trimmed) { setError('이름을 입력해주세요.'); return; }

    setIsLoading(true);
    setError('');
    try {
      await updateDoc(doc(db, 'students', studentDocId), { name: trimmed });
      setCurrentName(trimmed);
      setIsSaved(true);
      onNameSaved?.(trimmed); // 부모에게 이름 변경 알림
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err) {
      console.error('이름 저장 에러:', err);
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 flex items-start justify-center p-6 pt-12">
      <div className="w-full max-w-md">

        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-4">
            🧑‍🎓
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800">프로필 설정</h1>
          <p className="text-slate-500 mt-1 text-sm">게임에서 표시될 이름을 설정해주세요</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">

          {/* 학생 코드 입력 (코드가 자동으로 주어지지 않은 경우) */}
          {!studentCode && (
            <div className="mb-5">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                학생 코드 (선생님이 알려준 코드)
              </label>
              <div className="flex gap-2">
                <input
                  value={inputCode}
                  onChange={e => setInputCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && searchStudent()}
                  placeholder="예: SINSEOK-5-01"
                  className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500 uppercase"
                />
                <button
                  onClick={() => searchStudent()}
                  disabled={isLoading}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50">
                  {isLoading ? '...' : '확인'}
                </button>
              </div>
            </div>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-600 font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* 학생 코드 자동 로딩 중 */}
          {studentCode && isLoading && (
            <div className="text-center py-8 text-slate-400 font-bold">불러오는 중...</div>
          )}

          {/* 이름 설정 폼 */}
          {isSearched && (
            <div>
              {/* 현재 코드 표시 */}
              <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-400 font-medium">학생 코드</span>
                <div className="font-mono font-bold text-indigo-600 mt-0.5">{inputCode || studentCode}</div>
              </div>

              {/* 이름 입력 */}
              <div className="mb-5">
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  이름 <span className="text-slate-400 font-normal">(미입력 시 코드로 표시됨)</span>
                </label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveName()}
                  placeholder="이름을 입력하세요"
                  maxLength={10}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-base font-bold focus:outline-none focus:border-indigo-500"
                />
                <div className="text-right text-xs text-slate-400 mt-1">{newName.length}/10</div>
              </div>

              {/* 저장 버튼 */}
              {isSaved ? (
                <div className="w-full py-3 bg-emerald-500 text-white font-bold text-sm rounded-xl text-center">
                  ✅ 저장되었습니다!
                </div>
              ) : (
                <button
                  onClick={saveName}
                  disabled={isLoading || !newName.trim() || newName.trim() === currentName}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {isLoading ? '저장 중...' : '이름 저장하기'}
                </button>
              )}

              {currentName && newName.trim() === currentName && (
                <p className="text-center text-xs text-slate-400 mt-2">현재 저장된 이름입니다</p>
              )}
            </div>
          )}

          {/* 코드 미입력 안내 */}
          {!studentCode && !isSearched && !isLoading && !error && (
            <div className="text-center py-6 text-slate-400">
              <div className="text-3xl mb-2">🔍</div>
              <p className="text-sm">학생 코드를 입력하고 확인을 눌러주세요</p>
            </div>
          )}
        </div>

        {/* 안내 */}
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
          💡 이름은 대시보드, 퀘스트 화면, 우리반 전체 보기에 표시됩니다.<br/>
          언제든지 다시 돌아와 변경할 수 있습니다.
        </div>
      </div>
    </div>
  );
}

export default EditProfile;
