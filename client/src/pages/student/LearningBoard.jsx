import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy,
  doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

// ── 이미지 압축 ────────────────────────────────────────────────
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

const MAX_ATTACHMENT_SIZE = 450 * 1024;

const toDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// ── 상수 ───────────────────────────────────────────────────────
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

const GROUP_COLORS = [
  { bg: 'bg-rose-50',    border: 'border-rose-300',    header: 'bg-rose-400',    text: 'text-white', dot: 'bg-rose-400' },
  { bg: 'bg-sky-50',     border: 'border-sky-300',     header: 'bg-sky-400',     text: 'text-white', dot: 'bg-sky-400' },
  { bg: 'bg-amber-50',   border: 'border-amber-300',   header: 'bg-amber-400',   text: 'text-white', dot: 'bg-amber-400' },
  { bg: 'bg-emerald-50', border: 'border-emerald-300', header: 'bg-emerald-500', text: 'text-white', dot: 'bg-emerald-400' },
  { bg: 'bg-violet-50',  border: 'border-violet-300',  header: 'bg-violet-500',  text: 'text-white', dot: 'bg-violet-400' },
  { bg: 'bg-orange-50',  border: 'border-orange-300',  header: 'bg-orange-400',  text: 'text-white', dot: 'bg-orange-400' },
];

const BOARD_TYPE_INFO = {
  'vertical-group':   { label: '세로그룹형', emoji: '⊞' },
  'horizontal-group': { label: '가로그룹형', emoji: '☰' },
  'wall':             { label: '담벼락형',   emoji: '🧱' },
  'map':              { label: '지도형',     emoji: '🗺️' },
};

const getCardColor = (id) => CARD_COLORS.find(c => c.id === id) || CARD_COLORS[0];
const REACTIONS = ['❤️', '👍', '🔥', '😮'];
const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date();
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)    return '방금 전';
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

// ── 댓글 컴포넌트 ──────────────────────────────────────────────
function CommentSection({ post, boardId, student }) {
  const [open, setOpen]           = useState(false);
  const [text, setText]           = useState('');
  const [saving, setSaving]       = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText]   = useState('');
  const [localComments, setLocalComments] = useState(post.comments || []);
  const postRef = doc(db, 'boards', boardId, 'posts', post.id);

  const submitComment = async () => {
    if (!text.trim() || !student) return;
    setSaving(true);
    try {
      const newComment = {
        id: `${Date.now()}_${student.id}`, authorId: student.id,
        authorName: student.name || student.studentCode,
        characterImage: student.characterImage || '',
        text: text.trim(), createdAt: new Date().toISOString(),
      };
      const updated = [...localComments, newComment];
      await updateDoc(postRef, { comments: updated });
      setLocalComments(updated); post.comments = updated; setText('');
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const deleteComment = async (id) => {
    const updated = localComments.filter(c => c.id !== id);
    await updateDoc(postRef, { comments: updated });
    setLocalComments(updated); post.comments = updated;
  };

  const saveEdit = async (id) => {
    if (!editText.trim()) return;
    const updated = localComments.map(c => c.id === id ? { ...c, text: editText.trim() } : c);
    await updateDoc(postRef, { comments: updated });
    setLocalComments(updated); post.comments = updated; setEditingId(null);
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

// ── 게시물 카드 ────────────────────────────────────────────────
function PostCard({ post, studentId, student, boardId, onReact, isPinned, onDelete, onEdit, onImageClick }) {
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
  Object.values(post.reactions || {}).forEach(e => { reactionCounts[e] = (reactionCounts[e] || 0) + 1; });
  const myReaction = (post.reactions || {})[studentId];

  return (
    <div className={`rounded-2xl border-2 ${color.bg} ${color.border} shadow-sm hover:shadow-md transition-all duration-200 relative group
      ${isPinned ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}>
      {isPinned && (
        <div className="bg-amber-400 text-amber-900 text-[10px] font-extrabold px-3 py-0.5 flex items-center gap-1 rounded-t-2xl">
          📌 고정
        </div>
      )}
      {isMyPost && (
        <div className="absolute top-2 right-2 flex gap-1 z-10">
          <button onClick={() => setIsEditing(true)}
            className="text-[9px] text-slate-500 hover:text-indigo-600 px-1.5 py-0.5 rounded bg-white/90 font-bold shadow-sm border border-slate-200">수정</button>
          <button onClick={() => onDelete?.(post.id)}
            className="text-[9px] text-slate-500 hover:text-rose-500 px-1.5 py-0.5 rounded bg-white/90 font-bold shadow-sm border border-slate-200">삭제</button>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-14 h-14 rounded-xl bg-white border-2 border-white shadow-sm overflow-hidden shrink-0 flex items-center justify-center">
            {post.isTeacher ? <span className="text-2xl">👑</span>
              : post.characterImage ? <img src={post.characterImage} alt="" className="w-full h-full object-contain scale-[2]" />
              : <span className="text-2xl">🧑‍🎓</span>}
          </div>
          <span className={`font-extrabold text-xs truncate ${post.isTeacher ? 'text-indigo-700' : 'text-slate-800'}`}>
            {post.studentName}
          </span>
        </div>
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
        {post.imageBase64 && (
          <img src={post.imageBase64} alt=""
            className="w-full rounded-xl object-cover mb-2 max-h-40 border border-slate-200/80 cursor-zoom-in hover:opacity-90 transition-opacity"
            onClick={() => onImageClick?.(post.imageBase64)} />
        )}
        {post.attachment?.dataUrl && (
          <a
            href={post.attachment.dataUrl}
            download={post.attachment.name || 'attachment'}
            className="mb-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            📎 {post.attachment.name || '첨부파일'}
          </a>
        )}
        <div className="text-[10px] text-slate-400 mb-2">{fmtDate(post.createdAt)}</div>
        <div className="flex items-center gap-1 flex-wrap pt-2 border-t border-black/5">
          {REACTIONS.map(emoji => {
            const cnt = reactionCounts[emoji] || 0;
            const isMe = myReaction === emoji;
            return (
              <button key={emoji} onClick={() => onReact(post.id, emoji, myReaction)}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold transition-all active:scale-95
                  ${isMe ? 'bg-indigo-100 text-indigo-700 border border-indigo-300' : 'bg-white/70 text-slate-500 border border-slate-200 hover:bg-slate-100'}`}>
                <span>{emoji}</span>
                {cnt > 0 && <span className={isMe ? 'text-indigo-600' : 'text-slate-400'}>{cnt}</span>}
              </button>
            );
          })}
        </div>
        <CommentSection post={post} boardId={boardId} student={student} />
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────
export default function LearningBoard({ studentCode }) {
  const [boards, setBoards]               = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [posts, setPosts]                 = useState([]);
  const [pages, setPages]                 = useState([]);
  const [sheets, setSheets]               = useState([]);
  const [selectedSheetId, setSelectedSheetId] = useState(null);
  const [student, setStudent]             = useState(null);
  const [isLoading, setIsLoading]         = useState(true);
  const [loadingPosts, setLoadingPosts]   = useState(false);

  // 글쓰기
  const [showWrite, setShowWrite]         = useState(false);
  const [content, setContent]             = useState('');
  const [cardColor, setCardColor]         = useState('yellow');
  const [imageBase64, setImageBase64]     = useState('');
  const [attachment, setAttachment]       = useState(null);
  const [isPosting, setIsPosting]         = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [writePageId, setWritePageId]     = useState(null);
  const [writeLat, setWriteLat]           = useState(null);
  const [writeLng, setWriteLng]           = useState(null);

  const [lightboxSrc, setLightboxSrc] = useState(null); // 이미지 라이트박스

  // 필터
  const [sort, setSort]               = useState('newest');
  const [searchQuery, setSearchQuery] = useState('');

  const textRef        = useRef(null);
  const imageFileRef   = useRef(null);
  const attachFileRef  = useRef(null);
  const mapDivRef      = useRef(null);
  const mapInstance    = useRef(null);

  // ── 학생 정보 + 게시판 목록 로드 ─────────────────────────────
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
    setPages(board.pages || []);
    const nextSheets = (board.sheets && board.sheets.length > 0) ? board.sheets : [{ id: 'sheet_1', title: '시트 1' }];
    setSheets(nextSheets);
    setSelectedSheetId(nextSheets[0]?.id || null);
    setShowWrite(false);
    setWriteLat(null); setWriteLng(null);
    setLoadingPosts(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'boards', board.id, 'posts'), orderBy('createdAt', 'desc'))
      );
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoadingPosts(false); }
  };

  const addSheet = async () => {
    if (!selectedBoard) return;
    const nextIndex = sheets.length + 1;
    const newSheet = { id: `sheet_${Date.now()}`, title: `시트 ${nextIndex}` };
    const updated = [...sheets, newSheet];
    try {
      await updateDoc(doc(db, 'boards', selectedBoard.id), { sheets: updated });
      setSheets(updated);
      setSelectedSheetId(newSheet.id);
    } catch (e) {
      console.error(e);
      alert('시트 추가 권한이 없습니다.');
    }
  };

  // ── Leaflet 지도 초기화 ──────────────────────────────────────
  useEffect(() => {
    if (!selectedBoard || selectedBoard.boardType !== 'map' || loadingPosts) {
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
      return;
    }
    const init = () => {
      if (!mapDivRef.current || mapInstance.current) return;
      const L = window.L;
      const map = L.map(mapDivRef.current).setView([37.5665, 126.9780], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
      const visiblePosts = selectedSheetId
        ? posts.filter((p) => (p.sheetId || 'sheet_1') === selectedSheetId)
        : posts;
      visiblePosts.forEach(p => {
        if (p.lat && p.lng)
          L.marker([p.lat, p.lng]).addTo(map).bindPopup(`<b>${p.studentName}</b><br>${p.content || ''}`);
      });
      const initTime = Date.now();
      map.on('click', e => {
        if (Date.now() - initTime < 800) return;
        setWriteLat(e.latlng.lat); setWriteLng(e.latlng.lng);
        setShowWrite(true); setTimeout(() => textRef.current?.focus(), 50);
      });
      mapInstance.current = map;
    };
    const loadLeaflet = () => {
      if (!document.getElementById('leaflet-css')) {
        const l = document.createElement('link');
        l.id = 'leaflet-css'; l.rel = 'stylesheet';
        l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(l);
      }
      if (!document.getElementById('leaflet-js')) {
        const s = document.createElement('script');
        s.id = 'leaflet-js'; s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        s.onload = () => setTimeout(init, 100);
        document.head.appendChild(s);
      } else { setTimeout(init, 200); }
    };
    window.L ? setTimeout(init, 100) : loadLeaflet();
    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [selectedBoard?.boardType, loadingPosts, posts, selectedSheetId]);

  // ── 이미지 선택 ──────────────────────────────────────────────
  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return alert('10MB 이하 이미지만 가능합니다.');
    setIsCompressing(true);
    try { setImageBase64(await compressImage(file)); }
    catch { alert('이미지 처리 실패'); }
    finally { setIsCompressing(false); e.target.value = ''; }
  };

  const handleAttachmentSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      alert('파일은 450KB 이하만 첨부할 수 있습니다.');
      e.target.value = '';
      return;
    }
    try {
      const dataUrl = await toDataUrl(file);
      setAttachment({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl,
      });
    } catch {
      alert('파일 첨부에 실패했습니다.');
    } finally {
      e.target.value = '';
    }
  };

  // ── 게시물 작성 ──────────────────────────────────────────────
  const submitPost = async () => {
    if (!content.trim() && !imageBase64 && !attachment) return;
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
        attachment:     attachment || null,
        cardColor,
        reactions:      {},
        pinned:         false,
        pageId:         writePageId || null,
        sheetId:        selectedSheetId || null,
        lat:            writeLat || null,
        lng:            writeLng || null,
        createdAt:      serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'boards', selectedBoard.id, 'posts'), newPost);
      const local = { id: ref.id, ...newPost, createdAt: { toDate: () => new Date() } };
      setPosts(prev => [local, ...prev]);
      if (selectedBoard.boardType === 'map' && writeLat && mapInstance.current && window.L) {
        window.L.marker([writeLat, writeLng]).addTo(mapInstance.current)
          .bindPopup(`<b>${student.name || student.studentCode}</b><br>${content.trim()}`);
      }
      setContent(''); setImageBase64(''); setAttachment(null); setCardColor('yellow');
      setWritePageId(null); setWriteLat(null); setWriteLng(null);
      setShowWrite(false);
    } catch { alert('게시 실패'); }
    finally { setIsPosting(false); }
  };

  const handleDeletePost = async (postId) => {
    const post = posts.find(p => p.id === postId);
    if (!post || post.studentId !== student?.id) return;
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
          ? { ...p, reactions: { ...p.reactions, [student.id]: newEmoji } } : p));
      } else {
        const updatedReactions = { ...(posts.find(p => p.id === postId)?.reactions || {}) };
        delete updatedReactions[student.id];
        await updateDoc(postRef, { reactions: updatedReactions });
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions: updatedReactions } : p));
      }
    } catch (e) { console.error(e); }
  };

  // ── 정렬 + 검색 + 핀 ──────────────────────────────────────────
  const filteredPosts = posts
    .filter(p => !selectedSheetId || (p.sheetId || 'sheet_1') === selectedSheetId)
    .filter(p => !searchQuery || p.content?.includes(searchQuery) || p.studentName?.includes(searchQuery))
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (sort === 'newest')  return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      if (sort === 'oldest')  return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
      if (sort === 'popular') return Object.values(b.reactions || {}).length - Object.values(a.reactions || {}).length;
      return 0;
    });

  const postCardProps = (post) => ({
    post, studentId: student?.id, student, boardId: selectedBoard?.id,
    onReact: handleReact, isPinned: post.pinned, onDelete: handleDeletePost, onEdit: handleEditPost,
    onImageClick: setLightboxSrc,
  });

  // ── 게시판 유형별 레이아웃 렌더링 ────────────────────────────
  const renderContent = () => {
    const type = selectedBoard?.boardType || 'wall';
    const bg   = selectedBoard?.bgColor  || '#ffffff';
    const wrap = { backgroundColor: bg, minHeight: 'calc(100vh - 230px)', borderRadius: '1rem' };

    if (type === 'wall') {
      return (
        <div style={{ ...wrap, padding: '1.25rem' }}>
          {filteredPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 opacity-50">
              <div className="text-5xl">✏️</div>
              <p className="text-slate-500 font-bold text-sm">
                {searchQuery ? '검색 결과가 없습니다' : '첫 번째 게시물을 작성해보세요!'}
              </p>
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5 gap-4">
              {filteredPosts.map(post => (
                <div key={post.id} style={{ breakInside: 'avoid', marginBottom: '1rem' }}>
                  <PostCard {...postCardProps(post)} />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (type === 'vertical-group') {
      const ungrouped = filteredPosts.filter(p => !p.pageId);
      return (
        <div style={{ ...wrap, padding: '1.25rem' }} className="space-y-4">
          {pages.map((page, gi) => {
            const gc = GROUP_COLORS[gi % GROUP_COLORS.length];
            const pagePosts = filteredPosts.filter(p => p.pageId === page.id);
            return (
              <div key={page.id}
                className={`rounded-2xl border-2 ${gc.bg} ${gc.border} overflow-hidden shadow-sm`}
                style={{ borderLeftWidth: '6px' }}>
                <div className={`${gc.header} px-5 py-3 flex items-center gap-3`}>
                  <div className="w-2 h-2 rounded-full bg-white/70 shrink-0" />
                  <span className={`${gc.text} font-extrabold text-sm`}>{page.title}</span>
                  <span className={`${gc.text} text-xs bg-black/10 px-2 py-0.5 rounded-full opacity-80`}>{pagePosts.length}개</span>
                </div>
                <div className="p-4 flex gap-4 flex-wrap">
                  {pagePosts.length === 0 ? (
                    <div className="w-full flex items-center justify-center gap-2 py-8 text-sm text-slate-400 opacity-60">
                      <span>📭</span> 게시물이 없습니다.
                    </div>
                  ) : pagePosts.map(post => (
                    <div key={post.id} style={{ width: page.size || 200, flexShrink: 0 }}>
                      <PostCard {...postCardProps(post)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {ungrouped.length > 0 && (
            <div className="bg-white/40 rounded-2xl p-4 border border-dashed border-slate-300">
              <h3 className="font-bold text-slate-400 text-xs mb-3">📌 그룹 없음</h3>
              <div className="flex gap-4 flex-wrap">
                {ungrouped.map(post => (
                  <div key={post.id} style={{ width: 200, flexShrink: 0 }}>
                    <PostCard {...postCardProps(post)} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {pages.length === 0 && filteredPosts.length === 0 && (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-3 opacity-40">📝</div>
              <p className="font-bold">게시물이 없습니다</p>
            </div>
          )}
        </div>
      );
    }

    if (type === 'horizontal-group') {
      const ungrouped = filteredPosts.filter(p => !p.pageId);
      const cols = [
        ...pages.map((pg, gi) => ({ ...pg, posts: filteredPosts.filter(p => p.pageId === pg.id), colorIdx: gi })),
        ...(ungrouped.length > 0 ? [{ id: 'ungrouped', title: '그룹 없음', posts: ungrouped, colorIdx: pages.length }] : []),
      ];
      return (
        <div style={{ ...wrap, overflowX: 'auto', padding: '1.25rem' }}>
          <div className="flex gap-4 items-start pb-4"
            style={{ minWidth: `${cols.reduce((s, c) => s + (c.size || 252) + 16, 0)}px` }}>
            {cols.map(col => {
              const gc = GROUP_COLORS[col.colorIdx % GROUP_COLORS.length];
              const colW = col.size || 252;
              return (
                <div key={col.id} style={{ width: colW, flexShrink: 0 }}
                  className={`rounded-2xl border-2 ${gc.border} ${gc.bg} overflow-hidden shadow-sm flex flex-col`}>
                  <div className={`${gc.header} px-4 py-3 flex items-center gap-2 shrink-0`}>
                    <span className={`font-extrabold text-sm ${gc.text} flex-1 truncate`}>{col.title}</span>
                    <span className={`text-xs ${gc.text} opacity-80 bg-black/10 px-2 py-0.5 rounded-full shrink-0`}>{col.posts.length}</span>
                  </div>
                  <div className="p-3 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                    {col.posts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2 text-xs text-slate-400 opacity-60">
                        <span className="text-2xl">📭</span>
                        게시물 없음
                      </div>
                    ) : col.posts.map(post => <PostCard key={post.id} {...postCardProps(post)} />)}
                  </div>
                </div>
              );
            })}
            {cols.length === 0 && (
              <p className="text-slate-400 text-sm py-10">그룹이 없습니다.</p>
            )}
          </div>
        </div>
      );
    }

    if (type === 'map') {
      return (
        <div style={{ ...wrap, padding: 0, position: 'relative', overflow: 'hidden' }}>
          <div ref={mapDivRef} style={{ height: 'calc(100vh - 180px)', width: '100%' }} />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 rounded-xl border border-slate-200 shadow-lg p-1.5 flex items-center gap-1.5 overflow-x-auto max-w-[80%]">
            {sheets.map((sheet) => (
              <button
                key={sheet.id}
                onClick={() => setSelectedSheetId(sheet.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  selectedSheetId === sheet.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {sheet.title}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setSelectedBoard(null); setPosts([]); setPages([]); setSheets([]); setSelectedSheetId(null); setSearchQuery(''); }}
            className="absolute top-3 left-3 z-[1000] bg-white hover:bg-slate-50 shadow-lg rounded-xl px-4 py-2 text-sm font-bold text-slate-700 hover:text-indigo-600 border border-slate-200 flex items-center gap-2 transition-all">
            ← 목록
          </button>
          <div className="absolute bottom-4 left-4 bg-white/90 rounded-xl px-3 py-2 text-xs text-slate-500 shadow pointer-events-none z-[1000]">
            📍 지도를 클릭하면 해당 위치에 게시물을 작성합니다
          </div>
          {filteredPosts.length > 0 && (
            <div className="absolute top-3 right-3 z-[1000] bg-white/90 shadow-lg rounded-xl px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200">
              📌 게시물 {filteredPosts.length}개
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={{ ...wrap, padding: '1rem' }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filteredPosts.map(post => <PostCard key={post.id} {...postCardProps(post)} />)}
        </div>
      </div>
    );
  };

  // ── 게시판 내부 뷰 ─────────────────────────────────────────────
  if (selectedBoard) {
    const typeInfo    = BOARD_TYPE_INFO[selectedBoard.boardType];
    const isMapType   = selectedBoard.boardType === 'map';
    const isGroupType = selectedBoard.boardType === 'vertical-group' || selectedBoard.boardType === 'horizontal-group';
    return (
      <div className="min-h-full bg-slate-100">
        {!isMapType && (
          <div className="bg-white border-b border-slate-200 px-5 py-3 sticky top-0 z-20 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => { setSelectedBoard(null); setPosts([]); setPages([]); setSheets([]); setSelectedSheetId(null); setSearchQuery(''); }}
                className="text-slate-500 hover:text-slate-800 font-bold text-sm px-3 py-1.5 bg-slate-100 rounded-xl shrink-0">
                ← 목록
              </button>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {typeInfo && (
                  <span className="text-base shrink-0">{typeInfo.emoji}</span>
                )}
                <h1 className="font-extrabold text-slate-800 text-base truncate">{selectedBoard.title}</h1>
                {selectedBoard.description && (
                  <span className="text-xs text-slate-400 truncate hidden sm:block">— {selectedBoard.description}</span>
                )}
              </div>
              <span className="text-xs text-slate-400 shrink-0 font-medium">{filteredPosts.length}개</span>
            </div>
            <div className="mb-3 bg-slate-50 border border-slate-200 rounded-xl p-1.5 flex items-center gap-1.5 overflow-x-auto">
              {sheets.map((sheet) => (
                <button
                  key={sheet.id}
                  onClick={() => setSelectedSheetId(sheet.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                    selectedSheetId === sheet.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {sheet.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={isMapType ? '' : 'p-4 pb-24'}>
          {loadingPosts ? (
            <div className="text-center py-20 text-slate-400 font-bold">불러오는 중...</div>
          ) : renderContent()}
        </div>

        {/* 글쓰기 FAB (지도형 제외) */}
        {!isMapType && (
          <button onClick={() => {
            setWritePageId(isGroupType ? (pages[0]?.id || null) : null);
            setShowWrite(true);
            setTimeout(() => textRef.current?.focus(), 50);
          }}
            className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-xl px-5 py-3 font-extrabold text-sm flex items-center gap-2 transition-all active:scale-95 z-10">
            ✏️ 글쓰기
          </button>
        )}

        {/* 글쓰기 모달 */}
        {showWrite && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
            <div className={`${getCardColor(cardColor).bg} ${getCardColor(cardColor).border} border-2 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden`}>
              <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-black/10">
                <div className="w-10 h-10 rounded-full bg-white border-2 border-white shadow-sm overflow-hidden flex items-center justify-center shrink-0">
                  {student?.characterImage
                    ? <img src={student.characterImage} alt="" className="w-full h-full object-contain scale-[1.8]" />
                    : <span className="text-lg">🧑‍🎓</span>}
                </div>
                <div className="flex-1">
                  <div className="font-extrabold text-slate-800 text-sm">{student?.name || studentCode}</div>
                  <div className="text-[10px] text-slate-400">
                    {selectedBoard.title}에 게시
                    {writeLat ? ` · 📍 ${writeLat.toFixed(3)}, ${writeLng.toFixed(3)}` : ''}
                  </div>
                </div>
                <button onClick={() => { setShowWrite(false); setContent(''); setImageBase64(''); setAttachment(null); setWriteLat(null); setWriteLng(null); }}
                  className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center">✕</button>
              </div>

              {/* 그룹 선택 (그룹형 게시판) */}
              {isGroupType && pages.length > 0 && (
                <div className="px-4 pt-3">
                  <label className="text-xs font-bold text-slate-500 block mb-1.5">그룹 선택</label>
                  <div className="flex gap-2 flex-wrap">
                    {pages.map(p => (
                      <button key={p.id} onClick={() => setWritePageId(p.id)}
                        className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors
                          ${writePageId === p.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                        {p.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 space-y-3">
                <textarea ref={textRef} value={content} onChange={e => setContent(e.target.value)}
                  placeholder="내용을 입력하세요..."
                  className="w-full bg-transparent border-0 text-sm resize-none h-24 focus:outline-none placeholder-slate-400 text-slate-800" />
                {imageBase64 && (
                  <div className="relative">
                    <img src={imageBase64} alt="" className="w-full rounded-xl object-cover max-h-48 border border-black/10" />
                    <button onClick={() => setImageBase64('')}
                      className="absolute top-2 right-2 bg-slate-900/60 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center hover:bg-rose-500">✕</button>
                  </div>
                )}
                {attachment?.name && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 px-3 py-2">
                    <span className="truncate text-xs font-bold text-slate-600">📎 {attachment.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="ml-2 text-xs font-bold text-slate-400 hover:text-rose-500"
                    >
                      삭제
                    </button>
                  </div>
                )}
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
                <div className="flex items-center gap-2 pt-1 border-t border-black/10">
                  <input ref={imageFileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                  <input ref={attachFileRef} type="file" className="hidden" onChange={handleAttachmentSelect} />
                  <button onClick={() => imageFileRef.current?.click()} disabled={isCompressing}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-xl hover:bg-white/60 transition-colors">
                    {isCompressing ? '⏳' : '🖼️'} 사진
                  </button>
                  <button
                    type="button"
                    onClick={() => attachFileRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-xl hover:bg-white/60 transition-colors"
                  >
                    📎 파일
                  </button>
                  <div className="flex-1" />
                  <button onClick={() => { setShowWrite(false); setContent(''); setImageBase64(''); setAttachment(null); setWriteLat(null); setWriteLng(null); }}
                    className="px-4 py-2 rounded-xl text-slate-600 font-bold text-sm hover:bg-black/5">취소</button>
                  <button onClick={submitPost} disabled={isPosting || isCompressing || (!content.trim() && !imageBase64 && !attachment)}
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

  // ── 게시판 목록 ────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-800">📋 공유 게시판</h1>
        <p className="text-slate-500 text-sm mt-0.5">학생들이 학습 결과를 카드 형태로 자유롭게 공유하는 게시판</p>
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
            const color    = CARD_COLORS[i % CARD_COLORS.length];
            const typeInfo = BOARD_TYPE_INFO[board.boardType];
            return (
              <button key={board.id} onClick={() => openBoard(board)}
                className={`text-left rounded-2xl border-2 ${color.bg} ${color.border}
                  shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-[0.98] overflow-hidden`}>
                {/* 색상 헤더 */}
                <div className="px-4 py-2.5 border-b border-black/5" style={{ backgroundColor: board.bgColor || '#f8fafc' }}>
                  <span className="text-xs font-extrabold text-slate-600 flex items-center gap-1.5">
                    {typeInfo ? (
                      <>
                        <span className="text-base">{typeInfo.emoji}</span>
                        {typeInfo.label}
                      </>
                    ) : '📋 게시판'}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="font-extrabold text-slate-800 text-base mb-1 leading-tight">{board.title}</h3>
                  {board.description && (
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{board.description}</p>
                  )}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-indigo-600 font-extrabold">입장하기 →</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 이미지 라이트박스 */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 bg-black/90 z-[300] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt=""
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 hover:bg-white/40 text-white text-lg font-bold flex items-center justify-center transition-colors"
          >✕</button>
        </div>
      )}
    </div>
  );
}
