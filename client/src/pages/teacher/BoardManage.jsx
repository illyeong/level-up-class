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
    strip: 'bg-red-500',
    color: 'text-red-500', border: 'border-red-400', bg: 'bg-red-50',
    icon: (
      <svg viewBox="0 0 44 44" className="w-9 h-9">
        <rect x="4" y="4" width="10" height="36" rx="2" fill="#ef4444" opacity="0.7"/>
        <rect x="17" y="4" width="10" height="36" rx="2" fill="#ef4444" opacity="0.7"/>
        <rect x="30" y="4" width="10" height="36" rx="2" fill="#ef4444" opacity="0.7"/>
      </svg>
    ),
  },
  {
    id: 'horizontal-group', label: '가로그룹형',
    desc: '그룹이 가로로 나열되는 형태로 각 그룹 안에서는 포스트들이 세로로 배치됩니다.',
    strip: 'bg-orange-500',
    color: 'text-orange-500', border: 'border-orange-400', bg: 'bg-orange-50',
    icon: (
      <svg viewBox="0 0 44 44" className="w-9 h-9">
        <rect x="4" y="4" width="36" height="6" rx="2" fill="#f97316" opacity="0.8"/>
        <rect x="4" y="14" width="16" height="12" rx="2" fill="#f97316" opacity="0.5"/>
        <rect x="24" y="14" width="16" height="12" rx="2" fill="#f97316" opacity="0.5"/>
        <rect x="4" y="30" width="36" height="6" rx="2" fill="#f97316" opacity="0.8"/>
      </svg>
    ),
  },
  {
    id: 'wall', label: '담벼락형',
    desc: '벽에 붙이는 벽보처럼 벽돌 형식으로 포스트가 자동으로 배치되는 형태입니다.',
    strip: 'bg-green-500',
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
    strip: 'bg-purple-500',
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

const GROUP_COLORS = [
  { bg: 'bg-rose-50',    border: 'border-rose-300',    header: 'bg-rose-400',    text: 'text-white', btn: 'bg-rose-500 hover:bg-rose-600 text-white',    dot: 'bg-rose-400' },
  { bg: 'bg-sky-50',     border: 'border-sky-300',     header: 'bg-sky-400',     text: 'text-white', btn: 'bg-sky-500 hover:bg-sky-600 text-white',       dot: 'bg-sky-400' },
  { bg: 'bg-amber-50',   border: 'border-amber-300',   header: 'bg-amber-400',   text: 'text-white', btn: 'bg-amber-500 hover:bg-amber-600 text-white',   dot: 'bg-amber-400' },
  { bg: 'bg-emerald-50', border: 'border-emerald-300', header: 'bg-emerald-500', text: 'text-white', btn: 'bg-emerald-500 hover:bg-emerald-600 text-white',dot: 'bg-emerald-400' },
  { bg: 'bg-violet-50',  border: 'border-violet-300',  header: 'bg-violet-500',  text: 'text-white', btn: 'bg-violet-500 hover:bg-violet-600 text-white', dot: 'bg-violet-400' },
  { bg: 'bg-orange-50',  border: 'border-orange-300',  header: 'bg-orange-400',  text: 'text-white', btn: 'bg-orange-500 hover:bg-orange-600 text-white', dot: 'bg-orange-400' },
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

const MAX_ATTACHMENT_SIZE = 450 * 1024;

const toDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
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
  const [sheets, setSheets]         = useState([]);
  const [selectedSheetId, setSelectedSheetId] = useState(null);
  const [editingSheetId, setEditingSheetId] = useState(null);
  const [editingSheetTitle, setEditingSheetTitle] = useState('');
  const [isRenamingSheet, setIsRenamingSheet] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // write
  const [showWrite, setShowWrite]   = useState(false);
  const [writeContent, setWriteContent] = useState('');
  const [writeImage, setWriteImage] = useState('');
  const [writeAttachment, setWriteAttachment] = useState(null);
  const [writePageId, setWritePageId] = useState(null);
  const [writeLat, setWriteLat]     = useState(null);
  const [writeLng, setWriteLng]     = useState(null);
  const [selectedMapPost, setSelectedMapPost] = useState(null);
  const [isPosting, setIsPosting]   = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  const [toast, setToast]           = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const textRef       = useRef(null);
  const imageFileRef  = useRef(null);
  const attachFileRef = useRef(null);
  const mapDivRef     = useRef(null);
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
      const defaultSheets = [{ id: 'sheet_1', title: '시트 1' }];
      await addDoc(collection(db, 'boards'), {
        title: newTitle.trim(), description: newDesc.trim(),
        teacherUid: selectedClass?.teacherUid || null,
        classId:    selectedClass?.id          || null,
        boardType:  newType, bgColor: newBgColor,
        pages: defaultPages, sheets: defaultSheets, active: true, createdAt: serverTimestamp(),
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
    const nextSheets = (board.sheets && board.sheets.length > 0) ? board.sheets : [{ id: 'sheet_1', title: '시트 1' }];
    setSheets(nextSheets);
    setSelectedSheetId(nextSheets[0]?.id || null);
    setEditingSheetId(null);
    setEditingSheetTitle('');
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

  const addSheet = async () => {
    if (!selectedBoard) return;
    const nextIndex = sheets.length + 1;
    const newSheet = { id: `sheet_${Date.now()}`, title: `시트 ${nextIndex}` };
    const updated = [...sheets, newSheet];
    await updateDoc(doc(db, 'boards', selectedBoard.id), { sheets: updated });
    setSheets(updated);
    setSelectedSheetId(newSheet.id);
    setEditingSheetId(null);
    setEditingSheetTitle('');
  };

  // ── write post ────────────────────────────────────────────────
  const beginSheetRename = (sheet) => {
    setEditingSheetId(sheet.id);
    setEditingSheetTitle(sheet.title || '');
  };

  const cancelSheetRename = () => {
    setEditingSheetId(null);
    setEditingSheetTitle('');
  };

  const submitSheetRename = async (sheetId = editingSheetId) => {
    if (!selectedBoard || !sheetId) return;

    const nextTitle = editingSheetTitle.trim();
    if (!nextTitle) {
      showToast('시트 이름을 입력해주세요.', 'error');
      return;
    }

    const target = sheets.find((sheet) => sheet.id === sheetId);
    if (!target) return;
    if ((target.title || '') === nextTitle) {
      cancelSheetRename();
      return;
    }

    setIsRenamingSheet(true);
    try {
      const updated = sheets.map((sheet) => (
        sheet.id === sheetId ? { ...sheet, title: nextTitle } : sheet
      ));
      await updateDoc(doc(db, 'boards', selectedBoard.id), { sheets: updated });
      setSheets(updated);
      cancelSheetRename();
      showToast('시트 이름을 변경했습니다.');
    } catch {
      showToast('시트 이름 변경에 실패했습니다.', 'error');
    } finally {
      setIsRenamingSheet(false);
    }
  };

  const removeSheet = (sheet) => {
    if (!selectedBoard) return;
    if (sheets.length <= 1) {
      showToast('시트는 최소 1개가 필요합니다.', 'error');
      return;
    }

    const usedCount = posts.filter((post) => (post.sheetId || 'sheet_1') === sheet.id).length;
    if (usedCount > 0) {
      showToast('게시물이 있는 시트는 삭제할 수 없습니다.', 'error');
      return;
    }

    showConfirm(`"${sheet.title}" 시트를 삭제할까요?`, async () => {
      try {
        const updated = sheets.filter((it) => it.id !== sheet.id);
        await updateDoc(doc(db, 'boards', selectedBoard.id), { sheets: updated });
        setSheets(updated);
        if (selectedSheetId === sheet.id) {
          setSelectedSheetId(updated[0]?.id || null);
        }
        if (editingSheetId === sheet.id) {
          cancelSheetRename();
        }
        showToast('시트를 삭제했습니다.');
      } catch {
        showToast('시트 삭제에 실패했습니다.', 'error');
      }
    });
  };

  const submitPost = async () => {
    if (!writeContent.trim() && !writeImage && !writeAttachment) return;
    setIsPosting(true);
    try {
      const newPost = {
        studentId: null, studentCode: null, studentName: '선생님',
        characterImage: '', isTeacher: true,
        content: writeContent.trim(), imageBase64: writeImage || '',
        attachment: writeAttachment || null,
        reactions: {}, comments: [],
        pageId: writePageId || null,
        sheetId: selectedSheetId || null,
        lat: writeLat || null, lng: writeLng || null,
        pinned: false, createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'boards', selectedBoard.id, 'posts'), newPost);
      setPosts(prev => [{ id: ref.id, ...newPost, createdAt: { toDate: () => new Date() } }, ...prev]);
      if (selectedBoard.boardType === 'map') {
        setSelectedMapPost({ id: ref.id, ...newPost, createdAt: { toDate: () => new Date() } });
      }
      setWriteContent(''); setWriteImage(''); setWriteAttachment(null); setWritePageId(null);
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
    setSelectedMapPost(prev => prev?.id === postId ? { ...prev, pinned: !cur } : prev);
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
      const visiblePosts = selectedSheetId
        ? posts.filter((p) => (p.sheetId || 'sheet_1') === selectedSheetId)
        : posts;
      visiblePosts.forEach((p, idx) => {
        if (!p.lat || !p.lng) return;
        const marker = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            className: 'levelup-map-pin',
            html: `<div style="width:34px;height:34px;border-radius:999px;background:#4f46e5;color:#fff;border:3px solid #fff;box-shadow:0 8px 18px rgba(15,23,42,.28);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;">${idx + 1}</div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
          title: p.content || '지도 게시물',
        }).addTo(map);
        marker.on('click', (event) => {
          event.originalEvent?.stopPropagation?.();
          setSelectedMapPost(p);
        });
      });
      const initTime = Date.now();
      map.on('click', e => {
        if (Date.now() - initTime < 800) return;
        setSelectedMapPost(null);
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
      {post.attachment?.dataUrl && (
        <a
          href={post.attachment.dataUrl}
          download={post.attachment.name || 'attachment'}
          className="mb-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          📎 {post.attachment.name || '첨부파일'}
        </a>
      )}
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
  const filteredBySheet = selectedSheetId
    ? posts.filter((p) => (p.sheetId || 'sheet_1') === selectedSheetId)
    : posts;
  const sorted = [...filteredBySheet].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const renderContent = () => {
    const type = selectedBoard?.boardType || 'wall';
    const bg   = selectedBoard?.bgColor   || '#ffffff';
    const wrap = { backgroundColor: bg, minHeight: 'calc(100vh - 230px)', borderRadius: '1rem' };

    if (type === 'wall') {
      return (
        <div style={{ ...wrap, padding: '1.25rem' }}>
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 opacity-50">
              <div className="text-6xl">📝</div>
              <p className="text-slate-500 font-bold text-sm">오른쪽 아래 버튼으로 첫 번째 게시물을 작성해보세요!</p>
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5 gap-4">
              {sorted.map((p, i) => (
                <div key={p.id} style={{ breakInside: 'avoid', marginBottom: '1rem' }}>
                  <PostCard post={p} idx={i} />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (type === 'vertical-group') {
      const ungrouped = sorted.filter(p => !p.pageId);
      return (
        <div style={{ ...wrap, padding: '1.25rem' }} className="space-y-4">
          {pages.map((page, gi) => {
            const gc = GROUP_COLORS[gi % GROUP_COLORS.length];
            const pagePosts = sorted.filter(p => p.pageId === page.id);
            return (
              <div key={page.id}
                className={`rounded-2xl border-2 ${gc.bg} ${gc.border} overflow-hidden shadow-sm`}
                style={{ borderLeftWidth: '6px' }}>
                <div className={`${gc.header} px-5 py-3 flex items-center gap-3`}>
                  <div className="w-2 h-2 rounded-full bg-white/70 shrink-0" />
                  <span className={`${gc.text} font-extrabold text-sm`}>{page.title}</span>
                  <span className={`${gc.text} text-xs bg-black/10 px-2 py-0.5 rounded-full opacity-80`}>{pagePosts.length}개</span>
                  <button
                    onClick={() => { setWritePageId(page.id); setShowWrite(true); setTimeout(() => textRef.current?.focus(), 50); }}
                    className={`ml-auto px-3 py-1.5 text-xs font-bold rounded-xl bg-white/20 hover:bg-white/35 ${gc.text} border border-white/30 transition-colors`}
                  >
                    + 게시물 추가
                  </button>
                </div>
                <div className="p-4 flex gap-4 flex-wrap">
                  {pagePosts.length === 0 ? (
                    <div className="w-full flex items-center justify-center gap-2 py-8 text-sm text-slate-400 opacity-60">
                      <span>📭</span> 게시물이 없습니다.
                    </div>
                  ) : pagePosts.map((p, i) => (
                    <div key={p.id} style={{ width: 200, flexShrink: 0 }}><PostCard post={p} idx={i} /></div>
                  ))}
                </div>
              </div>
            );
          })}
          {ungrouped.length > 0 && (
            <div className="bg-white/40 rounded-2xl p-4 border border-dashed border-slate-300">
              <h3 className="font-bold text-slate-400 text-xs mb-3">📌 그룹 없음</h3>
              <div className="flex gap-4 flex-wrap">
                {ungrouped.map((p, i) => (
                  <div key={p.id} style={{ width: 200, flexShrink: 0 }}><PostCard post={p} idx={i} /></div>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={addPage}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-2xl bg-white border-2 border-dashed border-indigo-300 text-indigo-500 hover:bg-indigo-50 hover:border-indigo-400 transition-all shadow-sm"
          >
            <span className="text-lg font-black leading-none">+</span>
            그룹 추가
          </button>
        </div>
      );
    }

    if (type === 'horizontal-group') {
      const ungrouped = sorted.filter(p => !p.pageId);
      const cols = [
        ...pages.map((pg, gi) => ({ ...pg, posts: sorted.filter(p => p.pageId === pg.id), colorIdx: gi })),
        ...(ungrouped.length > 0 ? [{ id: 'ungrouped', title: '그룹 없음', posts: ungrouped, colorIdx: pages.length }] : []),
      ];
      return (
        <div style={{ ...wrap, overflowX: 'auto', padding: '1.25rem' }}>
          <div className="flex gap-4 items-start pb-4"
            style={{ minWidth: `${(cols.length + 1) * 268}px` }}>
            {cols.map(col => {
              const gc = GROUP_COLORS[col.colorIdx % GROUP_COLORS.length];
              return (
                <div key={col.id} style={{ width: 252, flexShrink: 0 }}
                  className={`rounded-2xl border-2 ${gc.border} ${gc.bg} overflow-hidden shadow-sm flex flex-col`}>
                  <div className={`${gc.header} px-4 py-3 flex items-center gap-2 shrink-0`}>
                    <span className={`font-extrabold text-sm ${gc.text} flex-1 truncate`}>{col.title}</span>
                    <span className={`text-xs ${gc.text} opacity-80 bg-black/10 px-2 py-0.5 rounded-full shrink-0`}>{col.posts.length}</span>
                    {col.id !== 'ungrouped' && (
                      <button
                        onClick={() => { setWritePageId(col.id); setShowWrite(true); setTimeout(() => textRef.current?.focus(), 50); }}
                        className={`w-7 h-7 rounded-lg bg-white/20 hover:bg-white/35 ${gc.text} font-black text-xl leading-none flex items-center justify-center border border-white/20 transition-colors shrink-0`}
                      >+</button>
                    )}
                  </div>
                  <div className="p-3 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                    {col.posts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2 text-xs text-slate-400 opacity-60">
                        <span className="text-2xl">📭</span>
                        게시물 없음
                      </div>
                    ) : col.posts.map((p, i) => <PostCard key={p.id} post={p} idx={i} />)}
                  </div>
                </div>
              );
            })}
            {/* 그룹 추가 팬텀 컬럼 */}
            <div
              style={{ width: 252, flexShrink: 0, minHeight: 140 }}
              className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/50 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/60 transition-all group self-stretch"
              onClick={addPage}
            >
              <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-slate-300 group-hover:border-indigo-400 flex items-center justify-center transition-colors">
                <span className="text-3xl font-black text-slate-400 group-hover:text-indigo-500 leading-none">+</span>
              </div>
              <span className="text-xs font-bold text-slate-400 group-hover:text-indigo-500 transition-colors">그룹 추가</span>
            </div>
          </div>
        </div>
      );
    }

    if (type === 'map') {
      return (
        <div style={{ ...wrap, padding: 0, position: 'relative', overflow: 'hidden' }}>
          <div ref={mapDivRef} style={{ height: 'calc(100vh - 230px)', width: '100%' }} />
          <div className="absolute left-4 top-4 z-[1100] flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setSelectedBoard(null); setPages([]); setPosts([]); setSheets([]); setSelectedSheetId(null); setEditingSheetId(null); setEditingSheetTitle(''); setSelectedMapPost(null); }}
              className="bg-white hover:bg-rose-50 shadow-lg rounded-xl px-4 py-2 text-sm font-bold text-slate-700 hover:text-rose-600 border border-slate-200 hover:border-rose-300 flex items-center gap-2 transition-all"
            >
              ← 목록으로
            </button>
            <div className="bg-white/95 shadow-lg rounded-xl px-3 py-2 text-xs font-extrabold text-slate-600 border border-slate-200">
              📌 게시물 {sorted.length}개
            </div>
          </div>
          <div className="absolute bottom-4 left-4 z-[1100] max-w-sm rounded-2xl border border-indigo-100 bg-white/95 px-4 py-3 text-xs text-slate-600 shadow-lg">
            <div className="font-extrabold text-slate-800">지도에 글 남기기</div>
            <div className="mt-1">원하는 위치를 클릭하면 글쓰기 창이 열리고, 게시 후 해당 위치에 번호 핀이 표시됩니다.</div>
          </div>
          <div
            className="absolute right-4 top-4 bottom-4 z-[1100] w-[340px] max-w-[calc(100%-2rem)] pointer-events-none"
          >
            <div className="h-full rounded-2xl border border-slate-200 bg-white/95 shadow-2xl pointer-events-auto overflow-hidden flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="text-sm font-extrabold text-slate-800">
                    {selectedMapPost ? '지도 게시물' : '위치를 선택하세요'}
                  </div>
                  <div className="text-[11px] font-bold text-slate-400">
                    {selectedMapPost ? `${selectedMapPost.studentName || '작성자'} · 핀 상세` : '지도 클릭으로 새 게시물 작성'}
                  </div>
                </div>
                {selectedMapPost && (
                  <button
                    onClick={() => setSelectedMapPost(null)}
                    className="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-500 font-extrabold"
                    title="닫기"
                  >
                    ✕
                  </button>
                )}
              </div>
              {selectedMapPost ? (
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                    <div className="mb-2 text-xs font-extrabold text-indigo-600">{selectedMapPost.studentName || '선생님'}</div>
                    <div className="whitespace-pre-wrap text-sm font-bold leading-relaxed text-slate-800">
                      {selectedMapPost.content || '내용 없음'}
                    </div>
                    {selectedMapPost.imageBase64 && (
                      <img src={selectedMapPost.imageBase64} alt="" className="mt-3 max-h-44 w-full rounded-xl object-cover border border-white" />
                    )}
                    {selectedMapPost.attachment?.name && (
                      <a
                        href={selectedMapPost.attachment.dataUrl}
                        download={selectedMapPost.attachment.name}
                        className="mt-3 block rounded-xl bg-white px-3 py-2 text-xs font-bold text-indigo-600 border border-indigo-100 hover:bg-indigo-50"
                      >
                        📎 {selectedMapPost.attachment.name}
                      </a>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => togglePin(selectedMapPost.id, selectedMapPost.pinned)}
                      className="rounded-xl border border-amber-200 bg-amber-50 py-2 text-xs font-extrabold text-amber-700 hover:bg-amber-100"
                    >
                      {selectedMapPost.pinned ? '고정 해제' : '상단 고정'}
                    </button>
                    <button
                      onClick={() => {
                        deletePost(selectedMapPost.id);
                        setSelectedMapPost(null);
                      }}
                      className="rounded-xl border border-rose-200 bg-rose-50 py-2 text-xs font-extrabold text-rose-600 hover:bg-rose-100"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                  <div className="mb-3 text-5xl">📍</div>
                  <div className="text-sm font-extrabold text-slate-700">지도를 클릭해 글을 작성하세요</div>
                  <div className="mt-2 text-xs leading-relaxed text-slate-400">
                    위치를 찍으면 글쓰기 창이 열립니다. 이미 등록된 번호 핀을 누르면 여기서 게시물을 확인할 수 있습니다.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ ...wrap, padding: '1.25rem' }}>
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
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1300] flex items-end sm:items-center justify-center p-4">
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
            <button onClick={() => { setShowWrite(false); setWriteContent(''); setWriteImage(''); setWriteAttachment(null); setWriteLat(null); setWriteLng(null); }}
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
            {writeAttachment?.name && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="truncate text-xs font-bold text-slate-600">📎 {writeAttachment.name}</span>
                <button
                  type="button"
                  onClick={() => setWriteAttachment(null)}
                  className="ml-2 text-xs font-bold text-slate-400 hover:text-rose-500"
                >
                  삭제
                </button>
              </div>
            )}
            <input ref={imageFileRef} type="file" accept="image/*" className="hidden"
              onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                setIsCompressing(true);
                try { setWriteImage(await compressImage(file)); }
                catch { showToast('이미지 처리 실패', 'error'); }
                finally { setIsCompressing(false); e.target.value = ''; }
              }} />
            <input
              ref={attachFileRef}
              type="file"
              className="hidden"
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > MAX_ATTACHMENT_SIZE) {
                  showToast('파일은 450KB 이하만 첨부할 수 있습니다.', 'error');
                  e.target.value = '';
                  return;
                }
                try {
                  const dataUrl = await toDataUrl(file);
                  setWriteAttachment({
                    name: file.name,
                    type: file.type || 'application/octet-stream',
                    size: file.size,
                    dataUrl,
                  });
                } catch {
                  showToast('파일 첨부에 실패했습니다.', 'error');
                } finally {
                  e.target.value = '';
                }
              }}
            />
            <button onClick={() => imageFileRef.current?.click()} disabled={isCompressing}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-xl border border-slate-200">
              {isCompressing ? '⏳ 처리 중...' : '🖼️ 이미지 첨부'}
            </button>
          </div>
            <button
              type="button"
              onClick={() => attachFileRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-xl border border-slate-200"
            >
              📎 파일 첨부
            </button>
          <div className="p-4 border-t border-slate-100 flex gap-3">
            <button onClick={() => { setShowWrite(false); setWriteContent(''); setWriteImage(''); setWriteAttachment(null); setWriteLat(null); setWriteLng(null); }}
              className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">취소</button>
            <button onClick={submitPost} disabled={isPosting || isCompressing || (!writeContent.trim() && !writeImage && !writeAttachment)}
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
    const typeInfo = BOARD_TYPES.find(t => t.id === selectedBoard.boardType);
    const isMapType = selectedBoard.boardType === 'map';
    return (
      <div className="min-h-screen bg-slate-100">
        {/* 헤더 바 (지도형은 제외) */}
        {!isMapType && (
          <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 shadow-sm">
            <button onClick={() => { setSelectedBoard(null); setPages([]); setPosts([]); setSheets([]); setSelectedSheetId(null); setEditingSheetId(null); setEditingSheetTitle(''); }}
              className="text-slate-500 hover:text-slate-800 font-bold text-sm px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors shrink-0">
              ← 목록
            </button>
            <div className="flex items-center gap-2 min-w-0">
              {typeInfo && (
                <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border shrink-0 ${typeInfo.color} ${typeInfo.bg} ${typeInfo.border}`}>
                  {typeInfo.label}
                </span>
              )}
              <h1 className="text-base font-extrabold text-slate-800 truncate">{selectedBoard.title}</h1>
              {selectedBoard.description && (
                <span className="text-xs text-slate-400 truncate hidden sm:block">— {selectedBoard.description}</span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-400 font-medium bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
                게시물 {sorted.length}개
              </span>
            </div>
          </div>
        )}

        <div className={`${isMapType ? 'px-4 pt-4' : 'px-6'} pb-2`}>
          <div className="bg-white border border-slate-200 rounded-2xl p-2 flex items-center gap-2 overflow-x-auto">
            {sheets.map((sheet) => {
              const isSelected = selectedSheetId === sheet.id;
              const isEditing = editingSheetId === sheet.id;

              return (
                <div key={sheet.id} className={`flex items-center gap-1 rounded-xl px-1 py-1 ${isSelected ? 'bg-indigo-600' : 'bg-slate-100'}`}>
                  {isEditing ? (
                    <>
                      <input
                        value={editingSheetTitle}
                        onChange={(e) => setEditingSheetTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitSheetRename(sheet.id);
                          if (e.key === 'Escape') cancelSheetRename();
                        }}
                        onBlur={() => submitSheetRename(sheet.id)}
                        className="w-32 px-2 py-1 text-xs rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        autoFocus
                        disabled={isRenamingSheet}
                      />
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => submitSheetRename(sheet.id)}
                        className="px-1.5 py-1 text-[11px] rounded-md bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-60"
                        disabled={isRenamingSheet}
                        title="시트 이름 저장"
                      >
                        저장
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setSelectedSheetId(sheet.id)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                          isSelected
                            ? 'text-white'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        {sheet.title}
                      </button>
                      <button
                        onClick={() => beginSheetRename(sheet)}
                        className={`px-1.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                          isSelected
                            ? 'text-indigo-100 hover:text-white'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                        title="시트 이름 변경"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => removeSheet(sheet)}
                        className={`px-1.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                          isSelected
                            ? 'text-rose-100 hover:text-white'
                            : 'text-rose-500 hover:text-rose-700'
                        }`}
                        title="시트 삭제"
                      >
                        삭제
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            <button
              onClick={addSheet}
              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold shrink-0"
              title="시트 추가"
            >
              +
            </button>
          </div>
        </div>

        <div className={isMapType ? '' : 'p-6'}>
          <div className={isMapType ? '' : 'w-full'}>
            {loadingPosts
              ? <div className="flex items-center justify-center gap-2.5 py-20">
                  <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                  <span className="text-sm text-slate-400">불러오는 중...</span>
                </div>
              : renderContent()
            }
          </div>
        </div>

        {!isMapType && (
          <button onClick={() => {
            setWritePageId(pages[0]?.id || null);
            setShowWrite(true);
            setTimeout(() => textRef.current?.focus(), 50);
          }} className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-xl text-2xl flex items-center justify-center z-10 transition-colors">
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
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">📋 공유 게시판</h1>
            <p className="text-slate-500 text-sm mt-0.5">학생들이 학습 결과를 카드 형태로 자유롭게 공유하는 게시판</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors">
            + 게시판 만들기
          </button>
        </div>

        {isLoading
          ? <div className="flex items-center justify-center gap-2.5 py-20">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm text-slate-400">불러오는 중...</span>
            </div>
          : boards.length === 0
            ? (
              <div className="text-center py-24">
                <div className="text-7xl mb-4 opacity-30">📋</div>
                <p className="font-bold text-lg text-slate-500">아직 생성된 게시판이 없습니다</p>
                <p className="text-sm text-slate-400 mt-1">위의 버튼을 눌러 첫 번째 게시판을 만들어보세요!</p>
              </div>
            )
            : <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {boards.map(board => {
                  const typeInfo = BOARD_TYPES.find(t => t.id === board.boardType);
                  const fmtCreatedAt = board.createdAt?.toDate
                    ? board.createdAt.toDate().toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
                    : board.createdAt?.seconds
                      ? new Date(board.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
                      : '날짜 없음';
                  return (
                    <div key={board.id}
                      className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all cursor-pointer group
                        ${board.active ? 'border-slate-200 hover:shadow-lg hover:-translate-y-0.5' : 'border-slate-100 opacity-60'}`}
                      onClick={() => openBoard(board)}>
                      {/* 색깔 띠 헤더 */}
                      <div className={`px-4 py-1.5 text-white text-[10px] font-extrabold flex justify-between items-center ${typeInfo?.strip || 'bg-slate-400'}`}>
                        <span>{typeInfo?.label || '기본형'}</span>
                        <span>{board.active ? '🟢 공개' : '⏸ 비공개'}</span>
                      </div>
                      <div className="p-4">
                        <h3 className="font-extrabold text-slate-800 text-base mb-1 group-hover:text-indigo-700 transition-colors">{board.title}</h3>
                        {board.description && <p className="text-xs text-slate-500 mb-2 line-clamp-2">{board.description}</p>}
                        <div className="text-[11px] text-slate-400 mb-3 flex items-center gap-1">
                          🗓 {fmtCreatedAt}
                        </div>
                        <div className="flex gap-2 mt-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => openBoard(board)}
                            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors">
                            열기
                          </button>
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
