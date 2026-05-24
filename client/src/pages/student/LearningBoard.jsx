import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy,
  doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

// ── 이미지 압축 ───────────────────────────────────────────────
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

// ── 상수 ─────────────────────────────────────────────────────
const CARD_COLORS = [
  { id: 'yellow', bg: 'bg-yellow-50',  border: 'border-yellow-200', label: '노랑' },
  { id: 'sky',    bg: 'bg-sky-50',     border: 'border-sky-200',    label: '하늘' },
  { id: 'pink',   bg: 'bg-pink-50',    border: 'border-pink-200',   label: '분홍' },
  { id: 'green',  bg: 'bg-emerald-50', border: 'border-emerald-200',label: '초록' },
  { id: 'violet', bg: 'bg-violet-50',  border: 'border-violet-200', label: '보라' },
  { id: 'orange', bg: 'bg-orange-50',  border: 'border-orange-200', label: '주황' },
  { id: 'white',  bg: 'bg-white',      border: 'border-slate-200',  label: '흰색' },
  { id: 'indigo', bg: 'bg-indigo-50',  border: 'border-indigo-200', label: '남색' },
];

const getCardColor = (id) => CARD_COLORS.find(c => c.id === id) || CARD_COLORS[0];

const REACTIONS = ['❤️', '👍', '🔥', '😮'];

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date();
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)   return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

// ── 댓글 컴포넌트 ────────────────────────────────────────────
function CommentSection({ post, boardId, student }) {
  const [open, setOpen]         = useState(false);
  const [text, setText]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [localComments, setLocalComments] = useState(post.comments || []);

  const postRef = doc(db, 'boards', boardId, 'posts', post.id);

  const submitComment = async () => {
    if (!text.trim() || !student) return;
    setSaving(true);
    try {
      const newComment = {
        id:             `${Date.now()}_${student.id}`,
        authorId:       student.id,
        authorName:     student.name || student.studentCode,
        characterImage: student.characterImage || '',
        text:           text.trim(),
        createdAt:      new Date().toISOString(),
      };
      const updated = [...localComments, newComment];
      await updateDoc(postRef, { comments: updated });
      setLocalComments(updated);
      post.comments = updated;
      setText('');
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const deleteComment = async (id) => {
    const updated = localComments.filter(c => c.id !== id);
    await updateDoc(postRef, { comments: updated });
    setLocalComments(updated);
    post.comments = updated;
  };

  const saveEdit = async (id) => {
    if (!editText.trim()) return;
    const updated = localComments.map(c => c.id === id ? { ...c, text: editText.trim() } : c);
    await updateDoc(postRef, { comments: updated });
    setLocalComments(updated);
    post.comments = updated;
    setEditingId(null);
  };

  return (
    <div className="border-t border-black/5 mt-2 pt-2">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-indigo-600 transition-colors">
        💬 댓글 {localComments.length > 0 && <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">{localComments.length}</span>}
        <span className="text-slate-300">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {localComments.map(c => (
            <div key={c.id} className="flex items-start gap-2">
              <div className="w-10 h-10 rounded-full bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                {c.characterImage ? <img src={c.characterImage} alt="" className="w-full h-full object-contain scale-[2]" /> : <span className="text-base">🧑</span>}
              </div>
              <div className="flex-1">
                {editingId === c.id ? (
                  <div className="flex gap-1">
                    <input value={editText} onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(c.id)}
                      className="flex-1 text-xs bg-white border border-indigo-300 rounded-xl px-2.5 py-1.5 focus:outline-none" autoFocus />
                    <button onClick={() => saveEdit(c.id)} className="text-[10px] font-bold text-indigo-600 px-1">저장</button>
                    <button onClick={() => setEditingId(null)} className="text-[10px] text-slate-400 px-1">취소</button>
                  </div>
                ) : (
                  <div className="bg-white/60 rounded-xl px-2.5 py-1.5 group/comment relative">
                    <span className="text-[10px] font-extrabold text-slate-700">{c.authorName} </span>
                    <span className="text-xs text-slate-600">{c.text}</span>
                    {/* 수정/삭제 — 본인 댓글만 */}
                    {student?.id === c.authorId && (
                      <div className="absolute top-1 right-1 opacity-0 group-hover/comment:opacity-100 flex gap-0.5 transition-opacity">
                        <button onClick={() => { setEditingId(c.id); setEditText(c.text); }}
                          className="text-[9px] text-slate-400 hover:text-indigo-500 px-1 py-0.5 rounded bg-white/80">수정</button>
                        <button onClick={() => deleteComment(c.id)}
                          className="text-[9px] text-slate-400 hover:text-rose-500 px-1 py-0.5 rounded bg-white/80">삭제</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {student && (
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                {student.characterImage ? <img src={student.characterImage} alt="" className="w-full h-full object-contain scale-[2]" /> : <span className="text-base">🧑</span>}
              </div>
              <input value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submitComment()}
                placeholder="댓글 입력..."
                className="flex-1 text-xs bg-white/70 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-400" />
              <button onClick={submitComment} disabled={saving || !text.trim()}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40 px-1">
                {saving ? '...' : '↑'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 게시물 카드 ───────────────────────────────────────────────
function PostCard({ post, studentId, student, boardId, onReact, isPinned, onDelete, onEdit }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content || '');
  const [editSaving, setEditSaving]   = useState(false);
  const isMyPost = post.studentId && post.studentId === studentId;

  const saveEdit = async () => {
    if (!editContent.trim() && !post.imageBase64) return;
    setEditSaving(true);
    try {
      await updateDoc(doc(db, 'boards', boardId, 'posts', post.id), { content: editContent.trim() });
      post.content = editContent.trim();
      onEdit?.(post.id, editContent.trim());
      setIsEditing(false);
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };
  const color = post.isTeacher
    ? { bg: 'bg-indigo-50', border: 'border-indigo-300' }
    : getCardColor(post.cardColor);

  const reactionCounts = {};
  Object.values(post.reactions || {}).forEach(e => {
    reactionCounts[e] = (reactionCounts[e] || 0) + 1;
  });
  const myReaction = (post.reactions || {})[studentId];
  const totalReactions = Object.values(reactionCounts).reduce((a,b) => a+b, 0);

  return (
    <div className={`rounded-2xl border-2 ${color.bg} ${color.border} shadow-sm
      hover:shadow-md transition-all duration-200 relative group
      ${isPinned ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}>

      {/* 핀 배지 */}
      {isPinned && (
        <div className="bg-amber-400 text-amber-900 text-[10px] font-extrabold px-3 py-0.5 flex items-center gap-1 rounded-t-2xl">
          📌 고정
        </div>
      )}

      {/* 본인 게시물 수정/삭제 */}
      {isMyPost && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity z-10">
          <button onClick={() => setIsEditing(true)}
            className="text-[9px] text-slate-400 hover:text-indigo-500 px-1.5 py-0.5 rounded bg-white/90 font-bold shadow-sm">수정</button>
          <button onClick={() => onDelete?.(post.id)}
            className="text-[9px] text-slate-400 hover:text-rose-500 px-1.5 py-0.5 rounded bg-white/90 font-bold shadow-sm">삭제</button>
        </div>
      )}

      <div className="p-4">
        {/* 작성자 */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-14 h-14 rounded-xl bg-white border-2 border-white shadow-sm overflow-hidden shrink-0 flex items-center justify-center">
            {post.isTeacher ? (
              <span className="text-2xl">👑</span>
            ) : post.characterImage ? (
              <img src={post.characterImage} alt="" className="w-full h-full object-contain scale-[2]" />
            ) : (
              <span className="text-2xl">🧑‍🎓</span>
            )}
          </div>
          <span className={`font-extrabold text-xs truncate ${post.isTeacher ? 'text-indigo-700' : 'text-slate-800'}`}>
            {post.studentName}
          </span>
        </div>

        {/* 내용 (편집 모드) */}
        {isEditing ? (
          <div className="mb-3 space-y-2">
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
              className="w-full text-sm bg-white/70 border-2 border-indigo-300 rounded-xl px-3 py-2 resize-none h-20 focus:outline-none" autoFocus />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setIsEditing(false)} className="text-xs text-slate-500 hover:text-slate-700 font-bold px-2 py-1">취소</button>
              <button onClick={saveEdit} disabled={editSaving}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1 rounded-lg disabled:opacity-50">
                {editSaving ? '...' : '저장'}
              </button>
            </div>
          </div>
        ) : post.content ? (
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words mb-2 line-clamp-6">{post.content}</p>
        ) : null}

        {/* 이미지 */}
        {post.imageBase64 && (
          <img src={post.imageBase64} alt=""
            className="w-full rounded-xl object-cover mb-2 max-h-40 border border-slate-200/80 cursor-zoom-in"
            onClick={() => window.open(post.imageBase64, '_blank')}
          />
        )}

        {/* 날짜 */}
        <div className="text-[10px] text-slate-400 mb-2">{fmtDate(post.createdAt)}</div>

        {/* 반응 */}
        <div className="flex items-center gap-1 flex-wrap pt-2 border-t border-black/5">
          {REACTIONS.map(emoji => {
            const cnt = reactionCounts[emoji] || 0;
            const isMe = myReaction === emoji;
            return (
              <button key={emoji} onClick={() => onReact(post.id, emoji, myReaction)}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold transition-all active:scale-95
                  ${isMe
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                    : 'bg-white/70 text-slate-500 border border-slate-200 hover:bg-slate-100'}`}>
                <span>{emoji}</span>
                {cnt > 0 && <span className={isMe ? 'text-indigo-600' : 'text-slate-400'}>{cnt}</span>}
              </button>
            );
          })}
        </div>

        {/* 댓글 */}
        <CommentSection post={post} boardId={boardId} student={student} />
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function LearningBoard({ studentCode }) {
  const [boards, setBoards]             = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [posts, setPosts]               = useState([]);
  const [student, setStudent]           = useState(null);
  const [isLoading, setIsLoading]       = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // 글쓰기
  const [showWrite, setShowWrite]       = useState(false);
  const [content, setContent]           = useState('');
  const [cardColor, setCardColor]       = useState('yellow');
  const [imageBase64, setImageBase64]   = useState('');
  const [isPosting, setIsPosting]       = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  // 필터
  const [sort, setSort]                 = useState('newest'); // newest | oldest | popular
  const [searchQuery, setSearchQuery]   = useState('');

  const textRef = useRef(null);
  const fileRef = useRef(null);

  // 학생 정보 + 게시판 로드
  useEffect(() => {
    if (!studentCode) { setIsLoading(false); return; }
    (async () => {
      try {
        const sq = query(collection(db, 'students'), where('studentCode', '==', studentCode));
        const ss = await getDocs(sq);
        if (!ss.empty) {
          const d = ss.docs[0].data();
          setStudent({ id: ss.docs[0].id, ...d });

          let boardsList = [];
          if (d.teacherUid) {
            const bs = await getDocs(query(collection(db, 'boards'), where('teacherUid', '==', d.teacherUid)));
            boardsList = bs.docs.map(b => ({ id: b.id, ...b.data() })).filter(b => b.active !== false);
          }
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
    if (file.size > 10 * 1024 * 1024) return alert('10MB 이하 이미지만 가능합니다.');
    setIsCompressing(true);
    try { setImageBase64(await compressImage(file)); }
    catch { alert('이미지 처리 실패'); }
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
        cardColor,
        reactions:      {},
        pinned:         false,
        createdAt:      serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'boards', selectedBoard.id, 'posts'), newPost);
      setPosts(prev => [{ id: ref.id, ...newPost, createdAt: { toDate: () => new Date() } }, ...prev]);
      setContent(''); setImageBase64(''); setCardColor('yellow');
      setShowWrite(false);
    } catch (e) { alert('게시 실패'); }
    finally { setIsPosting(false); }
  };

  const handleDeletePost = async (postId) => {
    if (!window.confirm('게시물을 삭제할까요?')) return;
    try {
      await deleteDoc(doc(db, 'boards', selectedBoard.id, 'posts', postId));
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (e) { console.error(e); }
  };

  const handleEditPost = (postId, newContent) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, content: newContent } : p));
  };

  const handleReact = async (postId, emoji, currentMyReaction) => {
    if (!student) return;
    const postRef = doc(db, 'boards', selectedBoard.id, 'posts', postId);
    const newEmoji = currentMyReaction === emoji ? null : emoji;
    const field = `reactions.${student.id}`;

    try {
      if (newEmoji) {
        await updateDoc(postRef, { [field]: newEmoji });
        setPosts(prev => prev.map(p => p.id === postId
          ? { ...p, reactions: { ...p.reactions, [student.id]: newEmoji } }
          : p
        ));
      } else {
        // 반응 취소 - 해당 학생 키 삭제
        const updatedReactions = { ...(posts.find(p => p.id === postId)?.reactions || {}) };
        delete updatedReactions[student.id];
        await updateDoc(postRef, { reactions: updatedReactions });
        setPosts(prev => prev.map(p => p.id === postId
          ? { ...p, reactions: updatedReactions }
          : p
        ));
      }
    } catch (e) { console.error(e); }
  };

  // 정렬 + 검색 + 핀 적용
  const filteredPosts = posts
    .filter(p => !searchQuery || p.content?.includes(searchQuery) || p.studentName?.includes(searchQuery))
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (sort === 'newest')  return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      if (sort === 'oldest')  return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
      if (sort === 'popular') {
        const ra = Object.values(a.reactions || {}).length;
        const rb = Object.values(b.reactions || {}).length;
        return rb - ra;
      }
      return 0;
    });

  // ── 게시판 내부 ────────────────────────────────────────────
  if (selectedBoard) {
    return (
      <div className="min-h-full bg-slate-100">
        {/* 게시판 헤더 */}
        <div className="bg-white border-b border-slate-200 px-5 py-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => { setSelectedBoard(null); setPosts([]); setSearchQuery(''); }}
              className="text-slate-500 hover:text-slate-800 font-bold text-sm px-3 py-1.5 bg-slate-100 rounded-xl shrink-0">
              ← 목록
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-extrabold text-slate-800 text-lg truncate">{selectedBoard.title}</h1>
              {selectedBoard.description && (
                <p className="text-xs text-slate-500">{selectedBoard.description}</p>
              )}
            </div>
            <span className="text-xs text-slate-400 shrink-0 font-medium">{posts.length}개</span>
          </div>

          {/* 검색 + 정렬 */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-32">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="검색..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 bg-slate-50" />
            </div>
            <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white text-xs">
              {[['newest','최신'],['oldest','오래된'],['popular','인기']].map(([val, label]) => (
                <button key={val} onClick={() => setSort(val)}
                  className={`px-3 py-1.5 font-bold transition-colors
                    ${sort === val ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 게시물 */}
        <div className="p-4 pb-24">
          {loadingPosts ? (
            <div className="text-center py-20 text-slate-400 font-bold">불러오는 중...</div>
          ) : filteredPosts.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-5xl mb-3">✏️</div>
              <p className="font-bold text-slate-500">
                {searchQuery ? '검색 결과가 없습니다' : '첫 번째 게시물을 작성해보세요!'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredPosts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  studentId={student?.id}
                  student={student}
                  boardId={selectedBoard.id}
                  onReact={handleReact}
                  isPinned={post.pinned}
                  onDelete={handleDeletePost}
                  onEdit={handleEditPost}
                />
              ))}
            </div>
          )}
        </div>

        {/* 글쓰기 FAB */}
        <button onClick={() => { setShowWrite(true); setTimeout(() => textRef.current?.focus(), 50); }}
          className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-xl px-5 py-3 font-extrabold text-sm flex items-center gap-2 transition-all active:scale-95 z-10">
          ✏️ 글쓰기
        </button>

        {/* 글쓰기 모달 */}
        {showWrite && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
            <div className={`${getCardColor(cardColor).bg} ${getCardColor(cardColor).border} border-2 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden`}>

              {/* 내 정보 */}
              <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-black/10">
                <div className="w-10 h-10 rounded-full bg-white border-2 border-white shadow-sm overflow-hidden flex items-center justify-center shrink-0">
                  {student?.characterImage ? (
                    <img src={student.characterImage} alt="" className="w-full h-full object-contain scale-[1.8]" />
                  ) : <span className="text-lg">🧑‍🎓</span>}
                </div>
                <div className="flex-1">
                  <div className="font-extrabold text-slate-800 text-sm">{student?.name || studentCode}</div>
                  <div className="text-[10px] text-slate-400">{selectedBoard.title}에 게시</div>
                </div>
                <button onClick={() => { setShowWrite(false); setContent(''); setImageBase64(''); }}
                  className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center">✕</button>
              </div>

              <div className="p-4 space-y-3">
                {/* 텍스트 */}
                <textarea ref={textRef} value={content} onChange={e => setContent(e.target.value)}
                  placeholder="내용을 입력하세요..."
                  className="w-full bg-transparent border-0 text-sm resize-none h-24 focus:outline-none placeholder-slate-400 text-slate-800" />

                {/* 이미지 미리보기 */}
                {imageBase64 && (
                  <div className="relative">
                    <img src={imageBase64} alt="" className="w-full rounded-xl object-cover max-h-48 border border-black/10" />
                    <button onClick={() => setImageBase64('')}
                      className="absolute top-2 right-2 bg-slate-900/60 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center hover:bg-rose-500">✕</button>
                  </div>
                )}

                {/* 카드 색상 선택 */}
                <div>
                  <div className="text-[10px] text-slate-500 font-bold mb-1.5">카드 색상</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {CARD_COLORS.map(c => (
                      <button key={c.id} onClick={() => setCardColor(c.id)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${c.bg}
                          ${cardColor === c.id ? 'border-slate-600 scale-110 shadow-md' : 'border-slate-300 hover:scale-105'}`}
                        title={c.label} />
                    ))}
                  </div>
                </div>

                {/* 하단 액션 */}
                <div className="flex items-center gap-2 pt-1 border-t border-black/10">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                  <button onClick={() => fileRef.current?.click()} disabled={isCompressing}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-xl hover:bg-white/60 transition-colors">
                    {isCompressing ? '⏳' : '🖼️'} 사진
                  </button>
                  <div className="flex-1" />
                  <button onClick={() => { setShowWrite(false); setContent(''); setImageBase64(''); }}
                    className="px-4 py-2 rounded-xl text-slate-600 font-bold text-sm hover:bg-black/5">
                    취소
                  </button>
                  <button onClick={submitPost} disabled={isPosting || isCompressing || (!content.trim() && !imageBase64)}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-extrabold text-sm disabled:opacity-40 active:scale-95 transition-all">
                    {isPosting ? '게시 중...' : '게시 ✓'}
                  </button>
                </div>
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
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-800">📋 학습 게시판</h1>
        <p className="text-slate-500 text-sm mt-0.5">선생님이 만든 게시판에 학습 내용을 공유해요</p>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold animate-pulse">불러오는 중...</div>
      ) : boards.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <div className="text-6xl mb-4 opacity-40">📋</div>
          <p className="font-bold text-slate-600">아직 열린 게시판이 없습니다</p>
          <p className="text-sm mt-1">선생님이 게시판을 만들면 여기 표시됩니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {boards.map((board, i) => {
            const color = CARD_COLORS[i % CARD_COLORS.length];
            return (
              <button key={board.id} onClick={() => openBoard(board)}
                className={`text-left rounded-2xl p-5 border-2 ${color.bg} ${color.border}
                  shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-[0.98]`}>
                <div className="text-3xl mb-3">📋</div>
                <h3 className="font-extrabold text-slate-800 text-base mb-1 leading-tight">{board.title}</h3>
                {board.description && (
                  <p className="text-xs text-slate-500 leading-relaxed">{board.description}</p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-indigo-600 font-extrabold">입장하기 →</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
