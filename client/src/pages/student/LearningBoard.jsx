import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, query, where, orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

// 이미지 압축 (최대 800px, JPEG 70%)
const compressImage = (file) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const MAX = 800;
    let w = img.width, h = img.height;
    if (w > MAX || h > MAX) {
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else        { w = Math.round(w * MAX / h); h = MAX; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    resolve(canvas.toDataURL('image/jpeg', 0.7));
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
});

const COLORS = [
  'bg-yellow-50 border-yellow-200',
  'bg-sky-50 border-sky-200',
  'bg-pink-50 border-pink-200',
  'bg-emerald-50 border-emerald-200',
  'bg-violet-50 border-violet-200',
  'bg-orange-50 border-orange-200',
];

// ── 게시물 카드 ───────────────────────────────────────────────
function PostCard({ post, index }) {
  return (
    <div className={`rounded-2xl border-2 p-4 shadow-sm
      ${post.isTeacher ? 'bg-indigo-50 border-indigo-200' : COLORS[index % COLORS.length]}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-10 h-10 rounded-full bg-white border-2 border-white shadow overflow-hidden shrink-0 flex items-center justify-center">
          {post.isTeacher ? (
            <span className="text-lg">👑</span>
          ) : post.characterImage ? (
            <img src={post.characterImage} alt="" className="w-full h-full object-contain scale-150" />
          ) : (
            <span className="text-lg">🧑‍🎓</span>
          )}
        </div>
        <span className={`font-extrabold text-xs truncate ${post.isTeacher ? 'text-indigo-700' : 'text-slate-800'}`}>
          {post.studentName}
        </span>
      </div>
      {post.content && (
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words mb-2">{post.content}</p>
      )}
      {post.imageBase64 && (
        <img src={post.imageBase64} alt="첨부 이미지"
          className="w-full rounded-xl object-cover max-h-48 mb-2 border border-slate-200" />
      )}
      <div className="text-[10px] text-slate-400">
        {post.createdAt?.toDate?.()?.toLocaleDateString('ko-KR', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        }) || ''}
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function LearningBoard({ studentCode }) {
  const [boards, setBoards]           = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [posts, setPosts]             = useState([]);
  const [student, setStudent]         = useState(null);
  const [isLoading, setIsLoading]     = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [showWrite, setShowWrite]     = useState(false);
  const [content, setContent]         = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [isPosting, setIsPosting]     = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const textRef  = useRef(null);
  const fileRef  = useRef(null);

  // 학생 정보 + 게시판 목록 로드
  useEffect(() => {
    if (!studentCode) { setIsLoading(false); return; }
    (async () => {
      try {
        const sq = query(collection(db, 'students'), where('studentCode', '==', studentCode));
        const ss = await getDocs(sq);
        if (!ss.empty) {
          const d = ss.docs[0].data();
          setStudent({ id: ss.docs[0].id, ...d });

          // teacherUid로 게시판 필터
          let boardsList = [];
          if (d.teacherUid) {
            const bs = await getDocs(
              query(collection(db, 'boards'), where('teacherUid', '==', d.teacherUid))
            );
            boardsList = bs.docs.map(b => ({ id: b.id, ...b.data() })).filter(b => b.active !== false);
          }
          // 매칭 없으면 teacherUid 없는 게시판도 포함 (테스트 계정 대응)
          if (boardsList.length === 0) {
            const bs = await getDocs(collection(db, 'boards'));
            boardsList = bs.docs.map(b => ({ id: b.id, ...b.data() }))
              .filter(b => b.active !== false && !b.teacherUid);
          }
          setBoards(boardsList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        }
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    })();
  }, [studentCode]);

  const openBoard = async (board) => {
    setSelectedBoard(board);
    setLoadingPosts(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'boards', board.id, 'posts'), orderBy('createdAt', 'desc'))
      );
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoadingPosts(false); }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return alert('10MB 이하 이미지만 업로드 가능합니다.');
    setIsCompressing(true);
    try {
      const b64 = await compressImage(file);
      setImageBase64(b64);
    } catch { alert('이미지 처리 실패'); }
    finally { setIsCompressing(false); e.target.value = ''; }
  };

  const submitPost = async () => {
    if (!content.trim() && !imageBase64) return;
    if (!student || !selectedBoard) return;
    setIsPosting(true);
    try {
      const newPost = {
        studentId:      student.id,
        studentCode:    student.studentCode,
        studentName:    student.name || student.studentCode,
        characterImage: student.characterImage || '',
        content:        content.trim(),
        imageBase64:    imageBase64 || '',
        createdAt:      serverTimestamp(),
      };
      const ref = await addDoc(
        collection(db, 'boards', selectedBoard.id, 'posts'), newPost
      );
      setPosts(prev => [{ id: ref.id, ...newPost, createdAt: { toDate: () => new Date() } }, ...prev]);
      setContent('');
      setImageBase64('');
      setShowWrite(false);
    } catch (e) {
      console.error(e);
      alert('게시 실패');
    } finally {
      setIsPosting(false);
    }
  };

  // ── 게시판 내부 ────────────────────────────────────────────
  if (selectedBoard) {
    return (
      <div className="min-h-full bg-slate-50 p-5">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => { setSelectedBoard(null); setPosts([]); }}
            className="text-slate-500 hover:text-slate-800 font-bold text-sm px-3 py-1.5 bg-white rounded-xl border border-slate-200 shrink-0">
            ← 목록
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-extrabold text-slate-800 text-lg truncate">{selectedBoard.title}</h1>
            {selectedBoard.description && (
              <p className="text-xs text-slate-500 mt-0.5">{selectedBoard.description}</p>
            )}
          </div>
          <span className="text-xs text-slate-400 shrink-0">{posts.length}개</span>
        </div>

        {/* 게시물 그리드 */}
        {loadingPosts ? (
          <div className="text-center py-20 text-slate-400 font-bold">불러오는 중...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-24">
            {posts.map((post, i) => <PostCard key={post.id} post={post} index={i} />)}
            {posts.length === 0 && (
              <div className="col-span-full text-center py-16 text-slate-400">
                <div className="text-5xl mb-3">✏️</div>
                <p className="font-bold text-slate-500">첫 번째 게시물을 작성해보세요!</p>
              </div>
            )}
          </div>
        )}

        {/* 글쓰기 버튼 (FAB) */}
        <button onClick={() => { setShowWrite(true); setTimeout(() => textRef.current?.focus(), 50); }}
          className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-xl text-2xl flex items-center justify-center transition-all active:scale-95 z-10">
          ✏️
        </button>

        {/* 글쓰기 모달 */}
        {showWrite && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              {/* 내 아바타 + 이름 미리보기 */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white border-2 border-slate-200 overflow-hidden flex items-center justify-center shadow-sm">
                  {student?.characterImage ? (
                    <img src={student.characterImage} alt="" className="w-full h-full object-contain scale-150" />
                  ) : (
                    <span className="text-xl">🧑‍🎓</span>
                  )}
                </div>
                <div>
                  <div className="font-extrabold text-slate-800 text-sm">{student?.name || studentCode}</div>
                  <div className="text-[10px] text-slate-400">{selectedBoard.title}에 게시</div>
                </div>
                <button onClick={() => { setShowWrite(false); setContent(''); }}
                  className="ml-auto text-slate-400 hover:text-slate-600 text-xl">✕</button>
              </div>

              <div className="p-4 space-y-3">
                <textarea
                  ref={textRef}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="내용을 입력하세요..."
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm resize-none h-28 focus:outline-none focus:border-indigo-500"
                />

                {/* 이미지 미리보기 */}
                {imageBase64 && (
                  <div className="relative">
                    <img src={imageBase64} alt="첨부 이미지"
                      className="w-full rounded-xl object-cover max-h-40 border border-slate-200" />
                    <button onClick={() => setImageBase64('')}
                      className="absolute top-2 right-2 bg-slate-900/60 text-white w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center hover:bg-rose-500 transition-colors">
                      ✕
                    </button>
                  </div>
                )}

                {/* 이미지 업로드 버튼 */}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                <button onClick={() => fileRef.current?.click()} disabled={isCompressing}
                  className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors disabled:opacity-50">
                  {isCompressing ? '⏳ 처리 중...' : '🖼️ 이미지 첨부'}
                </button>
              </div>

              <div className="p-4 border-t border-slate-100 flex gap-3">
                <button onClick={() => { setShowWrite(false); setContent(''); setImageBase64(''); }}
                  className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">
                  취소
                </button>
                <button onClick={submitPost} disabled={isPosting || isCompressing || (!content.trim() && !imageBase64)}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40">
                  {isPosting ? '게시 중...' : '게시하기 ✓'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 게시판 목록 ────────────────────────────────────────────
  return (
    <div className="min-h-full bg-slate-50 p-6">
      <h1 className="text-2xl font-extrabold text-slate-800 mb-1">📋 학습 게시판</h1>
      <p className="text-slate-500 text-sm mb-6">선생님이 만든 게시판에 학습 내용을 공유해요</p>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold">불러오는 중...</div>
      ) : boards.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <div className="text-6xl mb-4">📋</div>
          <p className="font-bold text-slate-600">아직 열린 게시판이 없습니다</p>
          <p className="text-sm mt-1">선생님이 게시판을 만들면 여기 표시됩니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {boards.map((board, i) => (
            <button key={board.id} onClick={() => openBoard(board)}
              className={`text-left rounded-2xl p-5 border-2 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${COLORS[i % COLORS.length]}`}>
              <div className="text-3xl mb-3">📋</div>
              <h3 className="font-extrabold text-slate-800 text-base mb-1">{board.title}</h3>
              {board.description && (
                <p className="text-xs text-slate-500">{board.description}</p>
              )}
              <div className="mt-3 text-xs text-indigo-600 font-bold">입장하기 →</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
