import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, where, orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase';

const BOARD_TYPES = [
  {
    id: 'vertical-group', label: '세로그룹형',
    desc: '그룹이 세로로 나열되는 형태로 각 그룹 안에서는 포스트들이 가로로 배치됩니다.',
    color: 'text-red-500', border: 'border-red-400', bg: 'bg-red-50',
    icon: (
      <svg viewBox="0 0 44 44" className="w-9 h-9">
        <rect x="4" y="4" width="36" height="6" rx="2" fill="#ef4444" opacity="0.8"/>
        <rect x="4" y="14" width="16" height="12" rx="2" fill="#ef4444" opacity="0.5"/>
        <rect x="24" y="14" width="16" height="12" rx="2" fill="#ef4444" opacity="0.5"/>
        <rect x="4" y="30" width="36" height="6" rx="2" fill="#ef4444" opacity="0.8"/>
      </svg>
    ),
  },
  {
    id: 'horizontal-group', label: '가로그룹형',
    desc: '그룹이 가로로 나열되는 형태로 각 그룹 안에서는 포스트들이 세로로 배치됩니다.',
    color: 'text-orange-500', border: 'border-orange-400', bg: 'bg-orange-50',
    icon: (
      <svg viewBox="0 0 44 44" className="w-9 h-9">
        <rect x="4" y="4" width="10" height="36" rx="2" fill="#f97316" opacity="0.7"/>
        <rect x="17" y="4" width="10" height="36" rx="2" fill="#f97316" opacity="0.7"/>
        <rect x="30" y="4" width="10" height="36" rx="2" fill="#f97316" opacity="0.7"/>
      </svg>
    ),
  },
  {
    id: 'wall', label: '담벼락형',
    desc: '벽에 붙이는 벽보처럼 벽돌 형식으로 포스트가 자동으로 배치되는 형태입니다.',
    color: 'text-green-600', border: 'border-green-400', bg: 'bg-green-50',
    icon: (
      <svg viewBox="0 0 44 44" className="w-9 h-9">
        <rect x="4" y="4" width="15" height="10" rx="2" fill="#22c55e" opacity="0.7"/>
        <rect x="22" y="4" width="18" height="16" rx="2" fill="#22c55e" opacity="0.7"/>
        <rect x="4" y="17" width="15" height="16" rx="2" fill="#22c55e" opacity="0.5"/>
        <rect x="22" y="23" width="18" height="10" rx="2" fill="#22c55e" opacity="0.5"/>
        <rect x="4" y="36" width="36" height="5" rx="2" fill="#22c55e" opacity="0.3"/>
      </svg>
    ),
  },
  {
    id: 'map', label: '지도형',
    desc: '지도 위에 핀을 찍어 포스트를 작성하는 형태입니다.',
    color: 'text-purple-600', border: 'border-purple-400', bg: 'bg-purple-50',
    icon: (
      <svg viewBox="0 0 44 44" className="w-9 h-9">
        <circle cx="22" cy="18" r="13" fill="#a855f7" opacity="0.2"/>
        <circle cx="22" cy="18" r="7" fill="#a855f7" opacity="0.8"/>
        <circle cx="22" cy="18" r="3" fill="white"/>
        <path d="M22 25 Q22 34 22 38" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round"/>
        <ellipse cx="22" cy="38" rx="5" ry="2" fill="#a855f7" opacity="0.3"/>
      </svg>
    ),
  },
];

const BG_COLORS = [
  { id: 'white',  label: '흰색',   value: '#ffffff' },
  { id: 'yellow', label: '노란색', value: '#fef9c3' },
  { id: 'violet', label: '보라색', value: '#ede9fe' },
  { id: 'green',  label: '연두색', value: '#dcfce7' },
  { id: 'orange', label: '주황색', value: '#ffedd5' },
  { id: 'sky',    label: '하늘색', value: '#e0f2fe' },
  { id: 'slate',  label: '회색',   value: '#f1f5f9' },
];

const POST_COLORS = [
  'bg-yellow-50 border-yellow-200',
  'bg-sky-50 border-sky-200',
  'bg-pink-50 border-pink-200',
  'bg-emerald-50 border-emerald-200',
  'bg-violet-50 border-violet-200',
  'bg-orange-50 border-orange-200',
];

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

export default function BoardManage({ selectedClass, user }) {
  const [boards, setBoards]         = useState([]);
  const [isLoading, setIsLoading]   = useState(true);

  // creation
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle]     = useState('');
  const [newDesc, setNewDesc]       = useState('');
  const [newType, setNewType]       = useState('wall');
  const [newBgColor, setNewBgColor] = useState('#ffffff');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // board view
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [posts, setPosts]           = useState([]);
  const [pages, setPages]           = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // write
  const [showWrite, setShowWrite]   = useState(false);
  const [writeContent, setWriteContent] = useState('');
  const [writeImage, setWriteImage] = useState('');
  const [writePageId, setWritePageId] = useState(null);
  const [writeLat, setWriteLat]     = useState(null);
  const [writeLng, setWriteLng]     = useState(null);
  const [isPosting, setIsPosting]   = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  const [toast, setToast]           = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const textRef     = useRef(null);
  const fileRef     = useRef(null);
  const mapDivRef   = useRef(null);
  const mapInstance = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (msg, fn) => setConfirmState({ message: msg, onConfirm: fn });

  // ── fetch boards ──────────────────────────────────────────────
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

  // ── create board ──────────────────────────────────────────────
  const createBoard = async () => {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      const defaultPages = (newType === 'vertical-group' || newType === 'horizontal-group')
        ? [{ id: `page_${Date.now()}`, title: '그룹 1' }] : [];
      await addDoc(collection(db, 'boards'), {
        title: newTitle.trim(), description: newDesc.trim(),
        teacherUid: selectedClass?.teacherUid || null,
        classId:    selectedClass?.id          || null,
        boardType:  newType, bgColor: newBgColor,
        pages: defaultPages, active: true, createdAt: serverTimestamp(),
      });
      setNewTitle(''); setNewDesc(''); setNewType('wall'); setNewBgColor('#ffffff');
      setShowCreate(false);
      fetchBoards();
    } catch { showToast('게시판 생성에 실패했습니다.', 'error'); }
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
    });
  };

  // ── open board ────────────────────────────────────────────────
  const openBoard = async (board) => {
    setSelectedBoard(board);
    setPages(board.pages || []);
    setLoadingPosts(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'boards', board.id, 'posts'), orderBy('createdAt', 'desc'))
      );
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoadingPosts(false); }
  };

  const addPage = async () => {
    if (!selectedBoard) return;
    const newPage = { id: `page_${Date.now()}`, title: `그룹 ${pages.length + 1}` };
    const updated = [...pages, newPage];
    await updateDoc(doc(db, 'boards', selectedBoard.id), { pages: updated });
    setPages(updated);
  };

  // ── write post ────────────────────────────────────────────────
  const submitPost = async () => {
    if (!writeContent.trim() && !writeImage) return;
    setIsPosting(true);
    try {
      const newPost = {
        studentId: null, studentCode: null, studentName: '선생님',
        characterImage: '', isTeacher: true,
        content: writeContent.trim(), imageBase64: writeImage || '',
        reactions: {}, comments: [],
        pageId: writePageId || null,
        lat: writeLat || null, lng: writeLng || null,
        pinned: false, createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'boards', selectedBoard.id, 'posts'), newPost);
      setPosts(prev => [{ id: ref.id, ...newPost, createdAt: { toDate: () => new Date() } }, ...prev]);
      if (selectedBoard.boardType === 'map' && writeLat && mapInstance.current && window.L) {
        window.L.marker([writeLat, writeLng]).addTo(mapInstance.current)
          .bindPopup(`<b>선생님</b><br>${writeContent.trim()}`);
      }
      setWriteContent(''); setWriteImage(''); setWritePageId(null);
      setWriteLat(null); setWriteLng(null); setShowWrite(false);
    } catch { showToast('게시에 실패했습니다.', 'error'); }
    finally { setIsPosting(false); }
  };

  const deletePost = (postId) => {
    showConfirm('이 게시물을 삭제할까요?', async () => {
      await deleteDoc(doc(db, 'boards', selectedBoard.id, 'posts', postId));
      setPosts(prev => prev.filter(p => p.id !== postId));
    });
  };

  const togglePin = async (postId, cur) => {
    await updateDoc(doc(db, 'boards', selectedBoard.id, 'posts', postId), { pinned: !cur });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, pinned: !cur } : p));
  };

  // ── Leaflet map init ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedBoard || selectedBoard.boardType !== 'map' || loadingPosts) {
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
      return;
    }
    const init = () => {
      if (!mapDivRef.current || mapInstance.current) return;
      const L = window.L;
      const map = L.map(mapDivRef.current).setView([37.5665, 126.9780], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map);
      posts.forEach(p => {
        if (p.lat && p.lng)
          L.marker([p.lat, p.lng]).addTo(map).bindPopup(`<b>${p.studentName}</b><br>${p.content || ''}`);
      });
      map.on('click', e => {
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
  }, [selectedBoard?.boardType, loadingPosts]);

  // ── PostCard ──────────────────────────────────────────────────
  const PostCard = ({ post, idx }) => (
    <div className={`rounded-2xl border-2 p-4 shadow-sm relative group transition-all
      ${post.pinned ? 'ring-2 ring-amber-400 ring-offset-1' : ''}
      ${post.isTeacher ? 'bg-indigo-50 border-indigo-200' : POST_COLORS[idx % POST_COLORS.length]}`}>
      {post.pinned
        ? <button onClick={() => togglePin(post.id, post.pinned)}
            className="absolute top-2 left-2 bg-amber-400 text-amber-900 text-[10px] font-extrabold px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 hover:bg-amber-500 z-10">
            📌 고정
          </button>
        : <button onClick={() => togglePin(post.id, post.pinned)}
            className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-amber-500 text-xs font-bold transition-all">
            📌
          </button>
      }
      <button onClick={() => deletePost(post.id)}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 text-xs font-bold transition-all">✕</button>
      <div className="flex items-center gap-2 mb-3 mt-1">
        <div className="w-14 h-14 rounded-xl bg-white border-2 border-white shadow-sm overflow-hidden shrink-0 flex items-center justify-center">
          {post.isTeacher ? <span className="text-2xl">👑</span>
            : post.characterImage ? <img src={post.characterImage} alt="" className="w-full h-full object-contain scale-[2]" />
            : <span className="text-2xl">🧑‍🎓</span>}
        </div>
        <span className={`font-extrabold text-xs truncate ${post.isTeacher ? 'text-indigo-700' : 'text-slate-800'}`}>
          {post.studentName}
        </span>
      </div>
      {post.content && <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words mb-2 line-clamp-6">{post.content}</p>}
      {post.imageBase64 && <img src={post.imageBase64} alt="" className="w-full rounded-xl object-cover max-h-40 mb-2 border border-slate-200" />}
      <div className="text-[10px] text-slate-400 mt-1">
        {post.createdAt?.toDate?.()?.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || ''}
      </div>
      {(Object.keys(post.reactions || {}).length > 0 || (post.comments || []).length > 0) && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {Object.entries(post.reactions || {}).map(([emoji, users]) => {
            const count = Array.isArray(users) ? users.length : (typeof users === 'number' ? users : 0);
            return count ? (
              <span key={emoji} className="flex items-center gap-0.5 text-xs bg-white/70 rounded-full px-1.5 py-0.5 border border-slate-200">
                {emoji} <span className="font-bold text-slate-600">{count}</span>
              </span>
            ) : null;
          })}
          {(post.comments || []).length > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-slate-500 bg-white/70 rounded-full px-1.5 py-0.5 border border-slate-200">
              💬 <span className="font-bold">{(post.comments || []).length}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );

  // ── layout renderers ──────────────────────────────────────────
  const sorted = [...posts].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const renderContent = () => {
    const type = selectedBoard?.boardType || 'wall';
    const bg   = selectedBoard?.bgColor   || '#ffffff';
    const wrap = { backgroundColor: bg, minHeight: 'calc(100vh - 230px)', borderRadius: '1rem', padding: '1rem' };

    if (type === 'wall') {
      return (
        <div style={wrap}>
          <div style={{ columnCount: 4, columnGap: '1rem' }}>
            {sorted.map((p, i) => (
              <div key={p.id} style={{ breakInside: 'avoid', marginBottom: '1rem' }}>
                <PostCard post={p} idx={i} />
              </div>
            ))}
            {sorted.length === 0 && <p className="text-slate-400 text-sm text-center py-10 col-span-full">게시물이 없습니다.</p>}
          </div>
        </div>
      );
    }

    if (type === 'vertical-group') {
      const ungrouped = sorted.filter(p => !p.pageId);
      return (
        <div style={wrap} className="space-y-5">
          {pages.map(page => {
            const pagePosts = sorted.filter(p => p.pageId === page.id);
            return (
              <div key={page.id} className="bg-white/60 rounded-2xl p-4 border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="font-extrabold text-slate-700 text-sm">{page.title}</h3>
                  <button onClick={() => { setWritePageId(page.id); setShowWrite(true); setTimeout(() => textRef.current?.focus(), 50); }}
                    className="ml-auto px-3 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold rounded-xl border border-indigo-200">
                    + 게시물 추가
                  </button>
                </div>
                <div className="flex gap-4 flex-wrap">
                  {pagePosts.map((p, i) => (
                    <div key={p.id} style={{ width: 200, flexShrink: 0 }}><PostCard post={p} idx={i} /></div>
                  ))}
                  {pagePosts.length === 0 && <p className="text-sm text-slate-400 py-4">게시물이 없습니다.</p>}
                </div>
              </div>
            );
          })}
          {ungrouped.length > 0 && (
            <div className="bg-white/40 rounded-2xl p-4 border border-dashed border-slate-300">
              <h3 className="font-bold text-slate-400 text-xs mb-3">그룹 없음</h3>
              <div className="flex gap-4 flex-wrap">
                {ungrouped.map((p, i) => <div key={p.id} style={{ width: 200, flexShrink: 0 }}><PostCard post={p} idx={i} /></div>)}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (type === 'horizontal-group') {
      const ungrouped = sorted.filter(p => !p.pageId);
      const cols = [
        ...pages.map(pg => ({ ...pg, posts: sorted.filter(p => p.pageId === pg.id) })),
        ...(ungrouped.length > 0 ? [{ id: 'ungrouped', title: '그룹 없음', posts: ungrouped }] : []),
      ];
      return (
        <div style={{ ...wrap, overflowX: 'auto', padding: '1rem' }}>
          <div className="flex gap-4" style={{ minWidth: `${Math.max(cols.length, 1) * 260}px` }}>
            {cols.map(col => (
              <div key={col.id} style={{ width: 240, flexShrink: 0 }}
                className="bg-white/60 rounded-2xl border border-slate-200 flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white/80 rounded-t-2xl sticky top-0">
                  <span className="font-extrabold text-slate-700 text-sm flex-1">{col.title}</span>
                  {col.id !== 'ungrouped' && (
                    <button onClick={() => { setWritePageId(col.id); setShowWrite(true); setTimeout(() => textRef.current?.focus(), 50); }}
                      className="text-xl text-slate-400 hover:text-indigo-500 font-bold leading-none">+</button>
                  )}
                </div>
                <div className="p-3 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                  {col.posts.map((p, i) => <PostCard key={p.id} post={p} idx={i} />)}
                  {col.posts.length === 0 && <p className="text-xs text-slate-400 text-center py-6">게시물이 없습니다.</p>}
                </div>
              </div>
            ))}
            {cols.length === 0 && <p className="text-slate-400 text-sm py-10">그룹을 추가해주세요.</p>}
          </div>
        </div>
      );
    }

    if (type === 'map') {
      return (
        <div style={{ ...wrap, padding: 0, position: 'relative', overflow: 'hidden' }}>
          <div ref={mapDivRef} style={{ height: 'calc(100vh - 230px)', width: '100%' }} />
          <div className="absolute bottom-4 left-4 bg-white/90 rounded-xl px-3 py-2 text-xs text-slate-500 shadow pointer-events-none">
            📍 지도를 클릭하면 해당 위치에 게시물을 작성합니다
          </div>
        </div>
      );
    }

    return (
      <div style={wrap}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {sorted.map((p, i) => <PostCard key={p.id} post={p} idx={i} />)}
        </div>
      </div>
    );
  };

  // ── shared modals (toast + confirm) ──────────────────────────
  const Modals = () => (
    <>
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>{toast.message}</div>
      )}
      {confirmState && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setConfirmState(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <p className="text-slate-700 font-bold text-sm mb-5 leading-relaxed whitespace-pre-line">{confirmState.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmState(null)}
                className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm">취소</button>
              <button onClick={() => { confirmState.onConfirm(); setConfirmState(null); }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm">확인</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ── write modal ───────────────────────────────────────────────
  const WriteModal = () => {
    const isGroupType = selectedBoard?.boardType === 'vertical-group' || selectedBoard?.boardType === 'horizontal-group';
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center text-xl">👑</div>
            <div>
              <div className="font-extrabold text-indigo-800 text-sm">선생님</div>
              <div className="text-[10px] text-indigo-400">
                {selectedBoard?.title}에 게시
                {writeLat ? ` · 📍 ${writeLat.toFixed(3)}, ${writeLng.toFixed(3)}` : ''}
              </div>
            </div>
            <button onClick={() => { setShowWrite(false); setWriteContent(''); setWriteImage(''); setWriteLat(null); setWriteLng(null); }}
              className="ml-auto text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
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
            <textarea ref={textRef} value={writeContent} onChange={e => setWriteContent(e.target.value)}
              placeholder="내용을 입력하세요..." rows={5}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-indigo-500" />
            {writeImage && (
              <div className="relative">
                <img src={writeImage} alt="" className="w-full rounded-xl object-cover max-h-48 border border-slate-200" />
                <button onClick={() => setWriteImage('')}
                  className="absolute top-2 right-2 bg-slate-900/60 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center">✕</button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                setIsCompressing(true);
                try { setWriteImage(await compressImage(file)); }
                catch { showToast('이미지 처리 실패', 'error'); }
                finally { setIsCompressing(false); e.target.value = ''; }
              }} />
            <button onClick={() => fileRef.current?.click()} disabled={isCompressing}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-xl border border-slate-200">
              {isCompressing ? '⏳ 처리 중...' : '🖼️ 이미지 첨부'}
            </button>
          </div>
          <div className="p-4 border-t border-slate-100 flex gap-3">
            <button onClick={() => { setShowWrite(false); setWriteContent(''); setWriteImage(''); setWriteLat(null); setWriteLng(null); }}
              className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">취소</button>
            <button onClick={submitPost} disabled={isPosting || isCompressing || (!writeContent.trim() && !writeImage)}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40">
              {isPosting ? '게시 중...' : '게시하기 ✓'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── board view ────────────────────────────────────────────────
  if (selectedBoard) {
    const isGroupType = selectedBoard.boardType === 'vertical-group' || selectedBoard.boardType === 'horizontal-group';
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => { setSelectedBoard(null); setPages([]); setPosts([]); }}
              className="text-slate-500 hover:text-slate-800 font-bold text-sm px-3 py-1.5 bg-white rounded-xl border border-slate-200">← 목록</button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-800">{selectedBoard.title}</h1>
              {selectedBoard.description && <p className="text-xs text-slate-500 mt-0.5">{selectedBoard.description}</p>}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {isGroupType && (
                <button onClick={addPage}
                  className="px-3 py-1.5 text-sm bg-white hover:bg-indigo-50 text-indigo-600 font-bold rounded-xl border border-indigo-200 transition-colors">
                  + 그룹 추가
                </button>
              )}
              <span className="text-sm text-slate-400 font-medium">{posts.length}개 게시물</span>
            </div>
          </div>

          {loadingPosts
            ? <div className="flex items-center justify-center gap-2.5 py-20">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-sm text-slate-400">불러오는 중...</span>
              </div>
            : renderContent()
          }
        </div>

        {selectedBoard.boardType !== 'map' && (
          <button onClick={() => {
            setWritePageId(pages[0]?.id || null);
            setShowWrite(true);
            setTimeout(() => textRef.current?.focus(), 50);
          }} className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-xl text-2xl flex items-center justify-center z-10">
            ✏️
          </button>
        )}

        {showWrite && <WriteModal />}
        <Modals />
      </div>
    );
  }

  // ── board list ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">📋 학습 게시판 관리</h1>
            <p className="text-slate-500 text-sm mt-0.5">학생들이 학습 결과를 공유하는 패들렛 형식 게시판</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm">
            + 게시판 만들기
          </button>
        </div>

        {isLoading
          ? <div className="flex items-center justify-center gap-2.5 py-20">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm text-slate-400">불러오는 중...</span>
            </div>
          : boards.length === 0
            ? <div className="text-center py-20"><div className="text-6xl mb-4">📋</div><p className="font-bold text-lg text-slate-600">생성된 게시판이 없습니다</p></div>
            : <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {boards.map(board => {
                  const typeInfo = BOARD_TYPES.find(t => t.id === board.boardType);
                  return (
                    <div key={board.id}
                      className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all
                        ${board.active ? 'border-slate-200 hover:shadow-md' : 'border-slate-100 opacity-60'}`}>
                      <div className="px-4 py-1.5 text-[11px] font-bold text-slate-500 flex items-center gap-1.5"
                        style={{ backgroundColor: board.bgColor || '#f8fafc' }}>
                        {typeInfo?.label || '게시판'}
                      </div>
                      <div className={`px-4 py-2 text-white text-xs font-bold ${board.active ? 'bg-indigo-600' : 'bg-slate-400'}`}>
                        {board.active ? '🟢 공개 중' : '⏸ 비공개'}
                      </div>
                      <div className="p-4">
                        <h3 className="font-extrabold text-slate-800 text-base mb-1">{board.title}</h3>
                        {board.description && <p className="text-xs text-slate-500 mb-2">{board.description}</p>}
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => openBoard(board)}
                            className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl">게시물 보기</button>
                          <button onClick={() => toggleActive(board)}
                            className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl border border-slate-200">
                            {board.active ? '숨기기' : '공개'}
                          </button>
                          <button onClick={() => deleteBoard(board)}
                            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-500 font-bold text-xs rounded-xl border border-rose-200">삭제</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
        }
      </div>

      {/* creation modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="p-5 bg-indigo-600 text-white font-bold text-lg flex justify-between rounded-t-2xl shrink-0">
              <span>📋 게시판 만들기</span>
              <button onClick={() => setShowCreate(false)} className="text-indigo-200 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">제목 *</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="예: 오늘의 수업 정리" autoFocus
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">설명 (선택)</label>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="학생들에게 안내할 내용"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
              </div>

              {/* board type */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-3">보드 유형 *</label>
                <div className="grid grid-cols-2 gap-3">
                  {BOARD_TYPES.map(t => (
                    <button key={t.id} onClick={() => setNewType(t.id)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${
                        newType === t.id ? `${t.border} ${t.bg} shadow-md` : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}>
                      <div className="mb-2">{t.icon}</div>
                      <div className={`font-extrabold text-sm mb-1 ${newType === t.id ? t.color : 'text-slate-700'}`}>{t.label}</div>
                      <div className="text-xs text-slate-500 leading-relaxed">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* background color */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">보드 배경색</label>
                <div className="relative">
                  <button onClick={() => setShowColorPicker(v => !v)}
                    className="flex items-center gap-3 w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl hover:border-indigo-400 transition-colors">
                    <span className="w-5 h-5 rounded-full border border-slate-300 shrink-0" style={{ backgroundColor: newBgColor }} />
                    <span className="text-sm text-slate-700 font-medium flex-1 text-left">
                      {BG_COLORS.find(c => c.value === newBgColor)?.label || '색상 선택'}
                    </span>
                    <span className="text-slate-400 text-xs">{showColorPicker ? '▲' : '▼'}</span>
                  </button>
                  {showColorPicker && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                      {BG_COLORS.map(c => (
                        <button key={c.id} onClick={() => { setNewBgColor(c.value); setShowColorPicker(false); }}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-50 ${newBgColor === c.value ? 'bg-indigo-50' : ''}`}>
                          <span className="w-8 h-5 rounded border border-slate-200 shrink-0" style={{ backgroundColor: c.value }} />
                          <span className="text-sm text-slate-700">{c.label}</span>
                          {newBgColor === c.value && <span className="ml-auto text-indigo-500 font-bold text-xs">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-3 shrink-0">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">취소</button>
              <button onClick={createBoard} disabled={isCreating || !newTitle.trim()}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40">
                {isCreating ? '생성 중...' : '만들기'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modals />
    </div>
  );
}
