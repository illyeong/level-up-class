import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, where, orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase';

export default function BoardManage({ selectedClass, user }) {
  const [boards, setBoards]       = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle]         = useState('');
  const [desc, setDesc]           = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [posts, setPosts]         = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // 글쓰기
  const [showWrite, setShowWrite]       = useState(false);
  const [writeContent, setWriteContent] = useState('');
  const [writeImage, setWriteImage]     = useState('');
  const [isPosting, setIsPosting]       = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const textRef = useRef(null);
  const fileRef = useRef(null);

  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (message, onConfirm) => setConfirmState({ message, onConfirm });

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
      resolve(canvas.toDataURL('image/jpeg', 0.75));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });

  const fetchBoards = async () => {
    try {
      const q = selectedClass?.id
        ? query(collection(db, 'boards'), where('classId', '==', selectedClass.id))
        : collection(db, 'boards');
      const snap = await getDocs(q);
      setBoards(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchBoards(); }, []);

  const createBoard = async () => {
    if (!title.trim()) return;
    setIsCreating(true);
    try {
      await addDoc(collection(db, 'boards'), {
        title:      title.trim(),
        description: desc.trim(),
        teacherUid: selectedClass?.teacherUid || null,
        classId:    selectedClass?.id          || null,
        active:     true,
        createdAt:  serverTimestamp(),
      });
      setTitle(''); setDesc('');
      setShowCreate(false);
      fetchBoards();
    } catch (e) { showToast('게시판 생성에 실패했습니다.', 'error'); }
    finally { setIsCreating(false); }
  };

  const toggleActive = async (board) => {
    await updateDoc(doc(db, 'boards', board.id), { active: !board.active });
    setBoards(prev => prev.map(b => b.id === board.id ? { ...b, active: !b.active } : b));
  };

  const deleteBoard = (board) => {
    showConfirm(`"${board.title}" 게시판을 삭제할까요?\n모든 게시물이 삭제됩니다.`, async () => {
      await deleteDoc(doc(db, 'boards', board.id));
      setBoards(prev => prev.filter(b => b.id !== board.id));
      if (selectedBoard?.id === board.id) setSelectedBoard(null);
    });
  };

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

  const submitPost = async () => {
    if (!writeContent.trim() || !selectedBoard) return;
    setIsPosting(true);
    try {
      const newPost = {
        studentId:      null,
        studentCode:    null,
        studentName:    selectedClass?.schoolName
          ? `선생님 (${selectedClass.schoolName})`
          : (user?.email || '선생님'),
        characterImage: '',
        isTeacher:      true,
        content:        writeContent.trim(),
        imageBase64:    writeImage || '',
        reactions:      {},
        comments:       [],
        createdAt:      serverTimestamp(),
      };
      const ref = await addDoc(
        collection(db, 'boards', selectedBoard.id, 'posts'), newPost
      );
      setPosts(prev => [{ id: ref.id, ...newPost, createdAt: { toDate: () => new Date() } }, ...prev]);
      setWriteContent('');
      setWriteImage('');
      setShowWrite(false);
    } catch (e) { showToast('게시에 실패했습니다.', 'error'); }
    finally { setIsPosting(false); }
  };

  const deletePost = (postId) => {
    showConfirm('이 게시물을 삭제할까요?', async () => {
      await deleteDoc(doc(db, 'boards', selectedBoard.id, 'posts', postId));
      setPosts(prev => prev.filter(p => p.id !== postId));
    });
  };

  const COLORS = [
    'bg-yellow-50 border-yellow-200',
    'bg-sky-50 border-sky-200',
    'bg-pink-50 border-pink-200',
    'bg-emerald-50 border-emerald-200',
    'bg-violet-50 border-violet-200',
    'bg-orange-50 border-orange-200',
  ];

  // ── 게시물 보기 화면 ────────────────────────────────────────
  if (selectedBoard) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setSelectedBoard(null)}
              className="text-slate-500 hover:text-slate-800 font-bold text-sm px-3 py-1.5 bg-white rounded-xl border border-slate-200">
              ← 목록
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-800">{selectedBoard.title}</h1>
              {selectedBoard.description && (
                <p className="text-xs text-slate-500 mt-0.5">{selectedBoard.description}</p>
              )}
            </div>
            <span className="ml-auto text-sm text-slate-400 font-medium">{posts.length}개 게시물</span>
          </div>

          {loadingPosts ? (
            <div className="flex items-center justify-center gap-2.5 py-20">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm text-slate-400 font-medium">불러오는 중...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pb-24">
              {posts.map((post, i) => (
                <div key={post.id}
                  className={`rounded-2xl border-2 p-4 shadow-sm relative group
                    ${post.isTeacher ? 'bg-indigo-50 border-indigo-200' : COLORS[i % COLORS.length]}`}>
                  <button onClick={() => deletePost(post.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 text-xs font-bold transition-all">
                    ✕
                  </button>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-10 h-10 rounded-full bg-white border-2 border-white shadow-sm overflow-hidden shrink-0 flex items-center justify-center">
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
                    <img src={post.imageBase64} alt="" className="w-full rounded-xl object-cover max-h-40 mb-2 border border-slate-200" />
                  )}
                  <div className="text-[10px] text-slate-400 mt-1">
                    {post.createdAt?.toDate?.()?.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || ''}
                  </div>
                </div>
              ))}
              {posts.length === 0 && (
                <div className="col-span-full text-center py-16 text-slate-400">
                  <div className="text-5xl mb-3">📭</div>
                  <p className="font-bold text-slate-500">아직 게시물이 없습니다</p>
                </div>
              )}
            </div>
          )}

          {/* 글쓰기 FAB */}
          <button onClick={() => { setShowWrite(true); setTimeout(() => textRef.current?.focus(), 50); }}
            className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-xl text-2xl flex items-center justify-center transition-all active:scale-95 z-10">
            ✏️
          </button>

          {/* 글쓰기 모달 */}
          {showWrite && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center text-xl shadow-sm">
                    👑
                  </div>
                  <div>
                    <div className="font-extrabold text-indigo-800 text-sm">선생님</div>
                    <div className="text-[10px] text-indigo-400">{selectedBoard?.title}에 게시</div>
                  </div>
                  <button onClick={() => { setShowWrite(false); setWriteContent(''); }}
                    className="ml-auto text-slate-400 hover:text-slate-600 text-xl">✕</button>
                </div>
                <div className="p-4 space-y-3">
                  <textarea
                    ref={textRef}
                    value={writeContent}
                    onChange={e => setWriteContent(e.target.value)}
                    placeholder="내용을 입력하세요..."
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm resize-none h-28 focus:outline-none focus:border-indigo-500"
                  />
                  {writeImage && (
                    <div className="relative">
                      <img src={writeImage} alt="" className="w-full rounded-xl object-cover max-h-48 border border-slate-200" />
                      <button onClick={() => setWriteImage('')}
                        className="absolute top-2 right-2 bg-slate-900/60 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center hover:bg-rose-500">✕</button>
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsCompressing(true);
                      try { setWriteImage(await compressImage(file)); }
                      catch { showToast('이미지 처리에 실패했습니다.', 'error'); }
                      finally { setIsCompressing(false); e.target.value = ''; }
                    }} />
                  <button onClick={() => fileRef.current?.click()} disabled={isCompressing}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-xl border border-slate-200 transition-colors">
                    {isCompressing ? '⏳ 처리 중...' : '🖼️ 이미지 첨부'}
                  </button>
                </div>
                <div className="p-4 border-t border-slate-100 flex gap-3">
                  <button onClick={() => { setShowWrite(false); setWriteContent(''); setWriteImage(''); }}
                    className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">
                    취소
                  </button>
                  <button onClick={submitPost} disabled={isPosting || isCompressing || (!writeContent.trim() && !writeImage)}
                    className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40">
                    {isPosting ? '게시 중...' : '게시하기 ✓'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.message}
        </div>
      )}
      {confirmState && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setConfirmState(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <p className="text-slate-700 font-bold text-sm mb-5 leading-relaxed whitespace-pre-line">{confirmState.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmState(null)}
                className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-50">취소</button>
              <button onClick={() => { confirmState.onConfirm(); setConfirmState(null); }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  }

  // ── 게시판 목록 화면 ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-4xl mx-auto">

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">📋 학습 게시판 관리</h1>
            <p className="text-slate-500 text-sm mt-0.5">학생들이 학습 결과를 공유하는 패들렛 형식 게시판</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors">
            + 게시판 만들기
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2.5 py-20">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-sm text-slate-400 font-medium">불러오는 중...</span>
          </div>
        ) : boards.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <div className="text-6xl mb-4">📋</div>
            <p className="font-bold text-lg text-slate-600">생성된 게시판이 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {boards.map(board => (
              <div key={board.id}
                className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all
                  ${board.active ? 'border-slate-200 hover:shadow-md' : 'border-slate-100 opacity-60'}`}>
                <div className={`px-4 py-2 text-white text-xs font-bold
                  ${board.active ? 'bg-indigo-600' : 'bg-slate-400'}`}>
                  {board.active ? '🟢 공개 중' : '⏸ 비공개'}
                </div>
                <div className="p-4">
                  <h3 className="font-extrabold text-slate-800 text-base mb-1">{board.title}</h3>
                  {board.description && (
                    <p className="text-xs text-slate-500 mb-3">{board.description}</p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => openBoard(board)}
                      className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-colors">
                      게시물 보기
                    </button>
                    <button onClick={() => toggleActive(board)}
                      className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl border border-slate-200 transition-colors">
                      {board.active ? '숨기기' : '공개'}
                    </button>
                    <button onClick={() => deleteBoard(board)}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-500 font-bold text-xs rounded-xl border border-rose-200 transition-colors">
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 게시판 생성 모달 */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 bg-indigo-600 text-white font-bold text-lg flex justify-between">
              <span>📋 게시판 만들기</span>
              <button onClick={() => setShowCreate(false)} className="text-indigo-200 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">제목 *</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="예: 오늘의 수업 정리"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  autoFocus />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">설명 (선택)</label>
                <input value={desc} onChange={e => setDesc(e.target.value)}
                  placeholder="학생들에게 안내할 내용"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
                취소
              </button>
              <button onClick={createBoard} disabled={isCreating || !title.trim()}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40">
                {isCreating ? '생성 중...' : '만들기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.message}
        </div>
      )}
      {confirmState && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setConfirmState(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <p className="text-slate-700 font-bold text-sm mb-5 leading-relaxed whitespace-pre-line">{confirmState.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmState(null)}
                className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-50">취소</button>
              <button onClick={() => { confirmState.onConfirm(); setConfirmState(null); }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
