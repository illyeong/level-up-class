import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, where, orderBy, arrayUnion,
} from 'firebase/firestore';
import { db } from '../../firebase';

const REACTIONS = ['👍', '❤️', '👏', '🔥'];
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

const BOARD_CARD_STRIPS = [
  'bg-rose-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-cyan-500',
];

const getBoardCardStrip = (board, fallbackIndex = 0) => {
  const seed = String(board?.id || board?.title || fallbackIndex);
  const hash = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return BOARD_CARD_STRIPS[hash % BOARD_CARD_STRIPS.length];
};

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

export default function BoardManage({ selectedClass, user, themeMode }) {
  const teacherLightModeClass = themeMode === 'light' ? 'teacher-board-light' : '';
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
  const [editingPageId, setEditingPageId] = useState(null);
  const [editingPageTitle, setEditingPageTitle] = useState('');
  const [lightboxSrc, setLightboxSrc]   = useState(null); // 이미지 라이트박스
  const [pageSizes, setPageSizes] = useState({}); // { [pageId]: number }
  const pageSizesRef = useRef({});
  const resizeDragRef = useRef(null); // { pageId, startCoord, startSize, axis }
  const [isRenamingSheet, setIsRenamingSheet] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const latestPostIdRef = useRef(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [commentSavingId, setCommentSavingId] = useState(null);
  const [editingBoardId, setEditingBoardId] = useState(null);
  const [editingBoardTitle, setEditingBoardTitle] = useState('');
  const [isSavingBoardTitle, setIsSavingBoardTitle] = useState(false);

  // write
  const [showWrite, setShowWrite]   = useState(false);
  const [writeTitle, setWriteTitle] = useState('');
  const [writeContent, setWriteContent] = useState('');
  const [writeImage, setWriteImage] = useState('');
  const [writeAttachment, setWriteAttachment] = useState(null);
  const [writePageId, setWritePageId] = useState(null);
  const [writeLat, setWriteLat]     = useState(null);
  const [writeLng, setWriteLng]     = useState(null);
  const [selectedMapPost, setSelectedMapPost] = useState(null);
  const [isPosting, setIsPosting]   = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [editPostContent, setEditPostContent] = useState('');
  const [editPostPageId, setEditPostPageId] = useState(null);
  const [isSavingPostEdit, setIsSavingPostEdit] = useState(false);

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

  const beginBoardTitleEdit = (board) => {
    setEditingBoardId(board.id);
    setEditingBoardTitle(board.title || '');
  };

  const cancelBoardTitleEdit = () => {
    setEditingBoardId(null);
    setEditingBoardTitle('');
  };

  const saveBoardTitle = async (board) => {
    const nextTitle = editingBoardTitle.trim();
    if (!nextTitle) {
      showToast('게시판 제목을 입력해주세요.', 'error');
      return;
    }
    if (nextTitle === (board.title || '')) {
      cancelBoardTitleEdit();
      return;
    }
    setIsSavingBoardTitle(true);
    try {
      await updateDoc(doc(db, 'boards', board.id), { title: nextTitle });
      setBoards(prev => prev.map(b => b.id === board.id ? { ...b, title: nextTitle } : b));
      setSelectedBoard(prev => prev?.id === board.id ? { ...prev, title: nextTitle } : prev);
      cancelBoardTitleEdit();
      showToast('게시판 제목을 수정했습니다.');
    } catch (e) {
      console.error(e);
      showToast('게시판 제목 수정에 실패했습니다.', 'error');
    } finally {
      setIsSavingBoardTitle(false);
    }
  };

  const deleteBoard = (board) => {
    showConfirm(`"${board.title}" 게시판을 삭제할까요?\n모든 게시물이 삭제됩니다.`, async () => {
      await deleteDoc(doc(db, 'boards', board.id));
      setBoards(prev => prev.filter(b => b.id !== board.id));
    });
  };

  // ── open board ────────────────────────────────────────────────
  const loadBoardPosts = async (board = selectedBoard) => {
    if (!board?.id) return;
    setLoadingPosts(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'boards', board.id, 'posts'), orderBy('createdAt', 'desc'))
      );
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPosts(list);
      latestPostIdRef.current = list[0]?.id || null;
      setHasNewPosts(false);
    } catch (e) { console.error(e); }
    finally { setLoadingPosts(false); }
  };

  const openBoard = async (board) => {
    setSelectedBoard(board);
    cancelBoardTitleEdit();
    setPages(board.pages || []);
    const nextSheets = (board.sheets && board.sheets.length > 0) ? board.sheets : [{ id: 'sheet_1', title: '시트 1' }];
    setSheets(nextSheets);
    setSelectedSheetId(nextSheets[0]?.id || null);
    setEditingSheetId(null);
    setEditingSheetTitle('');
    latestPostIdRef.current = null;
    setHasNewPosts(false);
    await loadBoardPosts(board);
  };

  const addPage = async () => {
    if (!selectedBoard) return;
    const newPage = { id: `page_${Date.now()}`, title: `그룹 ${pages.length + 1}` };
    const updated = [...pages, newPage];
    await updateDoc(doc(db, 'boards', selectedBoard.id), { pages: updated });
    setPages(updated);
  };

  const renamePage = async (pageId, nextTitle) => {
    if (!selectedBoard || !nextTitle.trim()) return;
    const updated = pages.map(p => p.id === pageId ? { ...p, title: nextTitle.trim() } : p);
    await updateDoc(doc(db, 'boards', selectedBoard.id), { pages: updated });
    setPages(updated);
  };

  const deletePage = async (pageId) => {
    if (!selectedBoard) return;
    if (!window.confirm('이 그룹을 삭제하시겠습니까?\n그룹 안의 게시물은 "그룹 없음"으로 이동합니다.')) return;
    const updated = pages.filter(p => p.id !== pageId);
    await updateDoc(doc(db, 'boards', selectedBoard.id), { pages: updated });
    setPages(updated);
  };

  // ── 그룹 크기 조정 ────────────────────────────────────────────
  // pages 변경 시 크기 초기화 (저장된 size 또는 기본값)
  useEffect(() => {
    const init = {};
    pages.forEach(p => { init[p.id] = p.size || 252; });
    setPageSizes(init);
    pageSizesRef.current = init;
  }, [pages]);

  useEffect(() => { pageSizesRef.current = pageSizes; }, [pageSizes]);

  const startResize = (e, pageId, axis) => {
    e.preventDefault();
    e.stopPropagation();
    resizeDragRef.current = {
      pageId, axis,
      startCoord: axis === 'x' ? e.clientX : e.clientY,
      startSize: pageSizesRef.current[pageId] || (axis === 'x' ? 252 : 320),
    };
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!resizeDragRef.current) return;
      const { pageId, startCoord, startSize, axis } = resizeDragRef.current;
      const delta = (axis === 'x' ? e.clientX : e.clientY) - startCoord;
      const min = axis === 'x' ? 180 : 160;
      const max = axis === 'x' ? 600 : 800;
      const newSize = Math.max(min, Math.min(max, startSize + delta));
      setPageSizes(prev => ({ ...prev, [pageId]: newSize }));
    };

    const onUp = async () => {
      if (!resizeDragRef.current) return;
      const { pageId } = resizeDragRef.current;
      resizeDragRef.current = null;
      const size = pageSizesRef.current[pageId];
      if (size != null && selectedBoard) {
        const updated = pages.map(p => p.id === pageId ? { ...p, size } : p);
        try {
          await updateDoc(doc(db, 'boards', selectedBoard.id), { pages: updated });
          setPages(updated);
        } catch (e) { console.error(e); }
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [selectedBoard, pages]);

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
    if (!writeTitle.trim() && !writeContent.trim() && !writeImage && !writeAttachment) return;
    setIsPosting(true);
    try {
      const newPost = {
        studentId: null, studentCode: null, studentName: '선생님',
        characterImage: '', isTeacher: true,
        title: writeTitle.trim(),
        content: writeContent.trim(), imageBase64: writeImage || '',
        attachment: writeAttachment || null,
        reactions: {}, comments: [],
        pageId: writePageId || null,
        sheetId: selectedSheetId || null,
        lat: writeLat || null, lng: writeLng || null,
        pinned: false, createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'boards', selectedBoard.id, 'posts'), newPost);
      latestPostIdRef.current = ref.id;
      setHasNewPosts(false);
      setPosts(prev => [{ id: ref.id, ...newPost, createdAt: { toDate: () => new Date() } }, ...prev]);
      if (selectedBoard.boardType === 'map') {
        setSelectedMapPost({ id: ref.id, ...newPost, createdAt: { toDate: () => new Date() } });
      }
      setWriteTitle(''); setWriteContent(''); setWriteImage(''); setWriteAttachment(null); setWritePageId(null);
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

  const openEditPost = (post) => {
    setEditingPost(post);
    setEditPostContent(post.content || '');
    setEditPostPageId(post.pageId || '');
  };

  const closeEditPost = () => {
    setEditingPost(null);
    setEditPostContent('');
    setEditPostPageId(null);
    setIsSavingPostEdit(false);
  };

  const submitEditPost = async () => {
    if (!selectedBoard || !editingPost) return;
    const nextContent = editPostContent.trim();
    if (!nextContent && !editingPost.imageBase64 && !editingPost.attachment) {
      showToast('내용을 입력해주세요.', 'error');
      return;
    }

    const isGroupType = selectedBoard.boardType === 'vertical-group' || selectedBoard.boardType === 'horizontal-group';
    const updates = {
      content: nextContent,
      pageId: isGroupType ? (editPostPageId || null) : (editingPost.pageId || null),
    };

    setIsSavingPostEdit(true);
    try {
      await updateDoc(doc(db, 'boards', selectedBoard.id, 'posts', editingPost.id), updates);
      const applyUpdate = (post) => post.id === editingPost.id ? { ...post, ...updates } : post;
      setPosts(prev => prev.map(applyUpdate));
      setSelectedMapPost(prev => prev?.id === editingPost.id ? { ...prev, ...updates } : prev);
      closeEditPost();
      showToast('게시글을 수정했습니다.');
    } catch {
      showToast('게시글 수정에 실패했습니다.', 'error');
      setIsSavingPostEdit(false);
    }
  };

  // ── Leaflet map init ──────────────────────────────────────────
  const teacherReactionId = `teacher_${String(selectedClass?.teacherUid || user?.uid || 'unknown').replace(/[.~*\/[\]]/g, '_')}`;
  const teacherDisplayName = user?.displayName || user?.email || '선생님';

  const handleTeacherReact = async (post, emoji) => {
    if (!selectedBoard?.id || !post?.id) return;
    const currentReactions = post.reactions || {};
    const nextReactions = { ...currentReactions };
    if (nextReactions[teacherReactionId] === emoji) delete nextReactions[teacherReactionId];
    else nextReactions[teacherReactionId] = emoji;

    try {
      await updateDoc(doc(db, 'boards', selectedBoard.id, 'posts', post.id), { reactions: nextReactions });
      const applyUpdate = (p) => p.id === post.id ? { ...p, reactions: nextReactions } : p;
      setPosts(prev => prev.map(applyUpdate));
      setSelectedMapPost(prev => prev?.id === post.id ? { ...prev, reactions: nextReactions } : prev);
    } catch {
      showToast('반응 저장에 실패했습니다.', 'error');
    }
  };

  const submitTeacherComment = async (post) => {
    const text = (commentDrafts[post.id] || '').trim();
    if (!selectedBoard?.id || !post?.id || !text) return;
    const newComment = {
      id: `${Date.now()}_${teacherReactionId}`,
      authorId: teacherReactionId,
      authorName: teacherDisplayName,
      characterImage: '',
      text,
      createdAt: new Date().toISOString(),
    };

    setCommentSavingId(post.id);
    try {
      await updateDoc(doc(db, 'boards', selectedBoard.id, 'posts', post.id), { comments: arrayUnion(newComment) });
      const nextComments = [...(post.comments || []), newComment];
      const applyUpdate = (p) => p.id === post.id ? { ...p, comments: nextComments } : p;
      setPosts(prev => prev.map(applyUpdate));
      setSelectedMapPost(prev => prev?.id === post.id ? { ...prev, comments: nextComments } : prev);
      setCommentDrafts(prev => ({ ...prev, [post.id]: '' }));
    } catch {
      showToast('댓글 저장에 실패했습니다.', 'error');
    } finally {
      setCommentSavingId(null);
    }
  };
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
          title: p.title || p.content || '지도 게시물',
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

  useEffect(() => {
    if (!selectedBoard?.id) return;
    const timer = setInterval(async () => {
      if (loadingPosts) return;
      try {
        const snap = await getDocs(
          query(collection(db, 'boards', selectedBoard.id, 'posts'), orderBy('createdAt', 'desc'))
        );
        const latestId = snap.docs[0]?.id || null;
        if (latestPostIdRef.current && latestId && latestId !== latestPostIdRef.current) {
          setHasNewPosts(true);
        }
      } catch (e) {
        console.error(e);
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [selectedBoard?.id, loadingPosts]);

  // ── PostCard ──────────────────────────────────────────────────
  const PostCard = ({ post, idx }) => (
    <div className={`rounded-2xl border-2 p-4 shadow-sm relative group transition-all
      ${post.pinned ? 'ring-2 ring-amber-400 ring-offset-1' : ''}
      ${post.isTeacher ? 'bg-indigo-50 border-indigo-200' : POST_COLORS[idx % POST_COLORS.length]}
      dark:!bg-slate-800/95 dark:!border-slate-600 dark:shadow-lg dark:shadow-black/30 dark:ring-offset-slate-950`}>
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
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
        <button
          type="button"
          onClick={() => openEditPost(post)}
          className="rounded-lg border border-slate-200 bg-white/90 px-2 py-0.5 text-[10px] font-extrabold text-slate-500 shadow-sm hover:border-indigo-200 hover:text-indigo-600 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300"
        >
          수정
        </button>
        <button
          type="button"
          onClick={() => deletePost(post.id)}
          className="rounded-lg border border-slate-200 bg-white/90 px-2 py-0.5 text-[10px] font-extrabold text-slate-500 shadow-sm hover:border-rose-200 hover:text-rose-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300"
        >
          삭제
        </button>
      </div>
      <div className="flex items-center gap-2 mb-3 mt-1">
        <div className="w-14 h-14 rounded-xl bg-white border-2 border-white shadow-sm overflow-hidden shrink-0 flex items-center justify-center dark:bg-slate-950 dark:border-slate-700">
          {post.isTeacher ? <span className="text-2xl">👑</span>
            : post.characterImage ? <img src={post.characterImage} alt="" className="w-full h-full object-contain scale-[2]" />
            : <span className="text-2xl">🧑‍🎓</span>}
        </div>
        <span className={`font-extrabold text-xs truncate ${post.isTeacher ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>
          {post.studentName}
        </span>
      </div>
      {post.title && (
        <h3 className="mb-2 text-base font-extrabold text-slate-900 leading-snug break-words dark:text-white">
          {post.title}
        </h3>
      )}
      {post.content && (
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words mb-1 dark:text-slate-200">{post.content}</p>
      )}
      {post.imageBase64 && (
        <img src={post.imageBase64} alt=""
          className="w-full rounded-xl object-cover max-h-40 mb-2 border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity dark:border-slate-600"
          onClick={() => setLightboxSrc(post.imageBase64)} />
      )}
      {post.attachment?.dataUrl && (
        <a
          href={post.attachment.dataUrl}
          download={post.attachment.name || 'attachment'}
          className="mb-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          📎 {post.attachment.name || '첨부파일'}
        </a>
      )}
      <div className="text-[10px] text-slate-400 mt-1 dark:text-slate-500">
        {post.createdAt?.toDate?.()?.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || ''}
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {REACTIONS.map(emoji => {
          const counts = {};
          Object.values(post.reactions || {}).forEach(e => { if (e) counts[e] = (counts[e] || 0) + 1; });
          const count = counts[emoji] || 0;
          const isMine = post.reactions?.[teacherReactionId] === emoji;
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => handleTeacherReact(post, emoji)}
              className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold border transition-colors active:scale-95 ${
                isMine
                  ? 'border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-400/70 dark:bg-indigo-500/20 dark:text-indigo-100'
                  : 'border-slate-200 bg-white/70 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <span>{emoji}</span>
              {count > 0 && <span className={isMine ? 'text-indigo-600 dark:text-indigo-200' : 'text-slate-400 dark:text-slate-300'}>{count}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 border-t border-black/5 pt-3 dark:border-slate-700">
        <div className="mb-1.5 text-[11px] font-extrabold text-slate-500 dark:text-slate-400">
          💬 댓글 {(post.comments || []).length}개
        </div>
        {(post.comments || []).length > 0 ? (
          <div className="space-y-2">
            {(post.comments || []).map(c => (
              <div key={c.id} className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center dark:bg-slate-950 dark:border-slate-700">
                  {c.characterImage
                    ? <img src={c.characterImage} alt="" className="w-full h-full object-contain scale-[2]" />
                    : <span className="text-sm">👤</span>}
                </div>
                <div className="flex-1 rounded-xl bg-white/60 px-2.5 py-1.5 dark:bg-slate-950/70 dark:border dark:border-slate-700">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-extrabold text-slate-700 dark:text-slate-200">{c.authorName}</span>
                    <span className="text-[10px] text-slate-400">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words dark:text-slate-300">{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs font-bold text-slate-400 dark:text-slate-500">댓글 없음</div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <input
            value={commentDrafts[post.id] || ''}
            onChange={e => setCommentDrafts(prev => ({ ...prev, [post.id]: e.target.value }))}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitTeacherComment(post);
              }
            }}
            placeholder="댓글 입력..."
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-400 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={() => submitTeacherComment(post)}
            disabled={commentSavingId === post.id || !(commentDrafts[post.id] || '').trim()}
            className="rounded-xl px-3 py-1.5 text-xs font-extrabold text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
          >
            {commentSavingId === post.id ? '...' : '등록'}
          </button>
        </div>
      </div>
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
    const wrap = { backgroundColor: bg, minHeight: '100%', borderRadius: '1rem' };

    if (type === 'wall') {
      return (
        <div style={{ ...wrap, padding: '1.25rem' }} className="dark:!bg-slate-950">
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
        <div style={{ ...wrap, padding: '1.25rem' }} className="space-y-4 dark:!bg-slate-950">
          {pages.map((page, gi) => {
            const gc = GROUP_COLORS[gi % GROUP_COLORS.length];
            const pagePosts = sorted.filter(p => p.pageId === page.id);
            return (
              <div key={page.id}
                className={`rounded-2xl border-2 ${gc.bg} ${gc.border} overflow-hidden shadow-sm relative dark:!bg-slate-900 dark:!border-slate-700`}
                style={{ borderLeftWidth: '6px' }}>
                <div className={`${gc.header} px-5 py-3 flex items-center gap-3`}>
                  <div className="w-2 h-2 rounded-full bg-white/70 shrink-0" />
                  {editingPageId === page.id ? (
                    <input
                      autoFocus
                      value={editingPageTitle}
                      onChange={e => setEditingPageTitle(e.target.value)}
                      onBlur={async () => { await renamePage(page.id, editingPageTitle); setEditingPageId(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') { renamePage(page.id, editingPageTitle); setEditingPageId(null); } if (e.key === 'Escape') setEditingPageId(null); }}
                      className="flex-1 bg-white/20 text-white font-extrabold text-sm rounded-lg px-2 py-0.5 focus:outline-none focus:bg-white/30 border border-white/40"
                    />
                  ) : (
                    <span
                      className={`${gc.text} font-extrabold text-sm cursor-pointer hover:underline`}
                      onDoubleClick={() => { setEditingPageId(page.id); setEditingPageTitle(page.title); }}
                      title="더블클릭하여 이름 수정"
                    >{page.title}</span>
                  )}
                  <span className={`${gc.text} text-xs bg-black/10 px-2 py-0.5 rounded-full opacity-80`}>{pagePosts.length}개</span>
                  <button
                    onClick={() => { setEditingPageId(page.id); setEditingPageTitle(page.title); }}
                    className={`text-[10px] bg-white/20 hover:bg-white/35 ${gc.text} px-1.5 py-0.5 rounded-lg border border-white/30 font-bold transition-colors`}
                    title="이름 수정"
                  >✏️</button>
                  <button
                    onClick={() => deletePage(page.id)}
                    className="text-[10px] bg-white/20 hover:bg-rose-500/70 text-white px-1.5 py-0.5 rounded-lg border border-white/30 font-bold transition-colors"
                    title="그룹 삭제"
                  >🗑</button>
                  <button
                    onClick={() => { setWritePageId(page.id); setShowWrite(true); setTimeout(() => textRef.current?.focus(), 50); }}
                    className={`ml-auto px-3 py-1.5 text-xs font-bold rounded-xl bg-white/20 hover:bg-white/35 ${gc.text} border border-white/30 transition-colors`}
                  >
                    + 게시물 추가
                  </button>
                </div>
                <div
                  className="p-4 flex gap-4 flex-wrap overflow-auto"
                  style={{ maxHeight: pageSizes[page.id] && pageSizes[page.id] !== 252 ? pageSizes[page.id] : undefined }}
                >
                  {pagePosts.length === 0 ? (
                    <div className="w-full flex items-center justify-center gap-2 py-8 text-sm text-slate-400 opacity-60">
                      <span>📭</span> 게시물이 없습니다.
                    </div>
                  ) : pagePosts.map((p, i) => (
                    <div key={p.id} style={{ width: 200, flexShrink: 0 }}><PostCard post={p} idx={i} /></div>
                  ))}
                </div>
                {/* 아래쪽 드래그 핸들 */}
                <div
                  className="w-full h-2.5 cursor-row-resize flex items-center justify-center group/rh hover:bg-black/5 transition-colors"
                  onMouseDown={(e) => startResize(e, page.id, 'y')}
                  title="드래그하여 높이 조절"
                >
                  <div className="w-10 h-1 rounded-full bg-slate-300 group-hover/rh:bg-indigo-400 transition-colors" />
                </div>
              </div>
            );
          })}
          {ungrouped.length > 0 && (
            <div className="bg-white/40 rounded-2xl p-4 border border-dashed border-slate-300 dark:bg-slate-900 dark:border-slate-700">
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
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-2xl bg-white border-2 border-dashed border-indigo-300 text-indigo-500 hover:bg-indigo-50 hover:border-indigo-400 transition-all shadow-sm dark:bg-slate-900 dark:border-indigo-500/50 dark:text-indigo-300 dark:hover:bg-slate-800"
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
        <div style={{ ...wrap, overflowX: 'auto', padding: '1.25rem' }} className="dark:!bg-slate-950">
          <div className="flex gap-4 items-start pb-4"
            style={{ minWidth: `${(cols.length + 1) * 268}px` }}>
            {cols.map(col => {
              const gc = GROUP_COLORS[col.colorIdx % GROUP_COLORS.length];
              return (
                <div key={col.id}
                  style={{ width: pageSizes[col.id] || 252, flexShrink: 0, position: 'relative' }}
                  className={`rounded-2xl border-2 ${gc.border} ${gc.bg} overflow-hidden shadow-sm flex flex-col dark:!bg-slate-900 dark:!border-slate-700`}>
                  <div className={`${gc.header} px-4 py-3 flex items-center gap-2 shrink-0`}>
                    {col.id !== 'ungrouped' && editingPageId === col.id ? (
                      <input
                        autoFocus
                        value={editingPageTitle}
                        onChange={e => setEditingPageTitle(e.target.value)}
                        onBlur={async () => { await renamePage(col.id, editingPageTitle); setEditingPageId(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') { renamePage(col.id, editingPageTitle); setEditingPageId(null); } if (e.key === 'Escape') setEditingPageId(null); }}
                        className="flex-1 bg-white/20 text-white font-extrabold text-sm rounded-lg px-2 py-0.5 focus:outline-none focus:bg-white/30 border border-white/40"
                      />
                    ) : (
                      <span
                        className={`font-extrabold text-sm ${gc.text} flex-1 truncate ${col.id !== 'ungrouped' ? 'cursor-pointer hover:underline' : ''}`}
                        onDoubleClick={() => col.id !== 'ungrouped' && (setEditingPageId(col.id), setEditingPageTitle(col.title))}
                        title={col.id !== 'ungrouped' ? '더블클릭하여 이름 수정' : ''}
                      >{col.title}</span>
                    )}
                    <span className={`text-xs ${gc.text} opacity-80 bg-black/10 px-2 py-0.5 rounded-full shrink-0`}>{col.posts.length}</span>
                    {col.id !== 'ungrouped' && (
                      <>
                        <button
                          onClick={() => { setEditingPageId(col.id); setEditingPageTitle(col.title); }}
                          className={`text-[10px] bg-white/20 hover:bg-white/35 ${gc.text} px-1 py-0.5 rounded border border-white/20 font-bold transition-colors shrink-0`}
                          title="이름 수정"
                        >✏️</button>
                        <button
                          onClick={() => deletePage(col.id)}
                          className="text-[10px] bg-white/20 hover:bg-rose-500/70 text-white px-1 py-0.5 rounded border border-white/20 font-bold transition-colors shrink-0"
                          title="그룹 삭제"
                        >🗑</button>
                        <button
                          onClick={() => { setWritePageId(col.id); setShowWrite(true); setTimeout(() => textRef.current?.focus(), 50); }}
                          className={`w-7 h-7 rounded-lg bg-white/20 hover:bg-white/35 ${gc.text} font-black text-xl leading-none flex items-center justify-center border border-white/20 transition-colors shrink-0`}
                        >+</button>
                      </>
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
                  {/* 오른쪽 드래그 핸들 */}
                  {col.id !== 'ungrouped' && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize flex items-center justify-center z-20 group/rh"
                      onMouseDown={(e) => startResize(e, col.id, 'x')}
                    >
                      <div className="w-1 h-10 rounded-full bg-white/20 group-hover/rh:bg-white/60 transition-colors" />
                    </div>
                  )}
                </div>
              );
            })}
            {/* 그룹 추가 팬텀 컬럼 */}
            <div
              style={{ width: 252, flexShrink: 0, minHeight: 140 }}
              className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/50 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/60 transition-all group self-stretch dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:border-indigo-500"
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
              onClick={() => { setSelectedBoard(null); setPages([]); setPosts([]); setSheets([]); setSelectedSheetId(null); setEditingSheetId(null); setEditingSheetTitle(''); setSelectedMapPost(null); closeEditPost(); }}
              className="bg-white hover:bg-rose-50 shadow-lg rounded-xl px-4 py-2 text-sm font-bold text-slate-700 hover:text-rose-600 border border-slate-200 hover:border-rose-300 flex items-center gap-2 transition-all dark:bg-slate-900/95 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-rose-950/50 dark:hover:border-rose-500/60 dark:hover:text-rose-300"
            >
              ← 목록으로
            </button>
            <div className="bg-white/95 shadow-lg rounded-xl px-3 py-2 text-xs font-extrabold text-slate-600 border border-slate-200 dark:bg-slate-900/95 dark:border-slate-700 dark:text-slate-100">
              📌 게시물 {sorted.length}개
            </div>
            {hasNewPosts && (
              <div className="bg-amber-100 shadow-lg rounded-xl px-3 py-2 text-xs font-extrabold text-amber-700 border border-amber-200 dark:bg-amber-500/20 dark:border-amber-400/50 dark:text-amber-200">
                새 글이 올라왔어요
              </div>
            )}
            <button
              type="button"
              onClick={() => loadBoardPosts()}
              disabled={loadingPosts}
              className="bg-white/95 shadow-lg rounded-xl px-3 py-2 text-xs font-extrabold text-slate-600 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 dark:bg-slate-900/95 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300"
            >
              새로고침
            </button>
          </div>
          <div className="absolute bottom-4 left-4 z-[1100] max-w-sm rounded-2xl border border-indigo-100 bg-white/95 px-4 py-3 text-xs text-slate-600 shadow-lg dark:bg-slate-900/95 dark:border-slate-700 dark:text-slate-300">
            <div className="font-extrabold text-slate-800 dark:text-slate-100">지도에 글 남기기</div>
            <div className="mt-1">원하는 위치를 클릭하면 글쓰기 창이 열리고, 게시 후 해당 위치에 번호 핀이 표시됩니다.</div>
          </div>
          <div
            className="absolute right-4 top-4 bottom-4 z-[1100] w-[340px] max-w-[calc(100%-2rem)] pointer-events-none"
          >
            <div className="h-full rounded-2xl border border-slate-200 bg-white/95 shadow-2xl pointer-events-auto overflow-hidden flex flex-col dark:bg-slate-900/95 dark:border-slate-700 dark:shadow-black/40">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                <div>
                  <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                    {selectedMapPost ? '지도 게시물' : '위치를 선택하세요'}
                  </div>
                  <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                    {selectedMapPost ? `${selectedMapPost.studentName || '작성자'} · 핀 상세` : '지도 클릭으로 새 게시물 작성'}
                  </div>
                </div>
                {selectedMapPost && (
                  <button
                    onClick={() => setSelectedMapPost(null)}
                    className="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-500 font-extrabold dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-rose-950/60 dark:hover:text-rose-300"
                    title="닫기"
                  >
                    ✕
                  </button>
                )}
              </div>
              {selectedMapPost ? (
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 dark:bg-indigo-950/30 dark:border-indigo-500/40">
                    <div className="mb-2 text-xs font-extrabold text-indigo-600 dark:text-indigo-300">{selectedMapPost.studentName || '선생님'}</div>
                    {selectedMapPost.title && (
                      <div className="mb-2 text-sm font-extrabold text-slate-900 dark:text-slate-100">{selectedMapPost.title}</div>
                    )}
                    <div className="whitespace-pre-wrap text-sm font-bold leading-relaxed text-slate-800 dark:text-slate-200">
                      {selectedMapPost.content || '내용 없음'}
                    </div>
                    {selectedMapPost.imageBase64 && (
                      <img src={selectedMapPost.imageBase64} alt="" className="mt-3 max-h-44 w-full rounded-xl object-cover border border-white dark:border-slate-600" />
                    )}
                    {selectedMapPost.attachment?.name && (
                      <a
                        href={selectedMapPost.attachment.dataUrl}
                        download={selectedMapPost.attachment.name}
                        className="mt-3 block rounded-xl bg-white px-3 py-2 text-xs font-bold text-indigo-600 border border-indigo-100 hover:bg-indigo-50 dark:bg-slate-900 dark:border-indigo-500/40 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                      >
                        📎 {selectedMapPost.attachment.name}
                      </a>
                    )}
                  </div>
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-white/80 p-3 dark:bg-slate-950/70 dark:border-slate-700">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {REACTIONS.map(emoji => {
                        const counts = {};
                        Object.values(selectedMapPost.reactions || {}).forEach(e => { if (e) counts[e] = (counts[e] || 0) + 1; });
                        const count = counts[emoji] || 0;
                        const isMine = selectedMapPost.reactions?.[teacherReactionId] === emoji;
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleTeacherReact(selectedMapPost, emoji)}
                            className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold border transition-colors active:scale-95 ${
                              isMine
                                ? 'border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-400/70 dark:bg-indigo-500/20 dark:text-indigo-100'
                                : 'border-slate-200 bg-white/70 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span>{emoji}</span>
                            {count > 0 && <span className={isMine ? 'text-indigo-600 dark:text-indigo-200' : 'text-slate-400 dark:text-slate-300'}>{count}</span>}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mb-1.5 text-[11px] font-extrabold text-slate-500 dark:text-slate-400">
                      💬 댓글 {(selectedMapPost.comments || []).length}개
                    </div>
                    {(selectedMapPost.comments || []).length > 0 && (
                      <div className="mb-2 space-y-2">
                        {(selectedMapPost.comments || []).map(c => (
                          <div key={c.id} className="rounded-xl bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900 dark:border dark:border-slate-700">
                            <div className="mb-0.5 flex items-center gap-2">
                              <span className="text-[10px] font-extrabold text-slate-700 dark:text-slate-200">{c.authorName}</span>
                              <span className="text-[10px] text-slate-400">
                                {c.createdAt ? new Date(c.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words dark:text-slate-300">{c.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        value={commentDrafts[selectedMapPost.id] || ''}
                        onChange={e => setCommentDrafts(prev => ({ ...prev, [selectedMapPost.id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submitTeacherComment(selectedMapPost);
                          }
                        }}
                        placeholder="댓글 입력..."
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-400 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        onClick={() => submitTeacherComment(selectedMapPost)}
                        disabled={commentSavingId === selectedMapPost.id || !(commentDrafts[selectedMapPost.id] || '').trim()}
                        className="rounded-xl px-3 py-1.5 text-xs font-extrabold text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                      >
                        {commentSavingId === selectedMapPost.id ? '...' : '등록'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      onClick={() => togglePin(selectedMapPost.id, selectedMapPost.pinned)}
                      className="rounded-xl border border-amber-200 bg-amber-50 py-2 text-xs font-extrabold text-amber-700 hover:bg-amber-100 dark:bg-amber-500/20 dark:border-amber-400/50 dark:text-amber-200 dark:hover:bg-amber-500/30"
                    >
                      {selectedMapPost.pinned ? '고정 해제' : '상단 고정'}
                    </button>
                    <button
                      onClick={() => openEditPost(selectedMapPost)}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 py-2 text-xs font-extrabold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:border-indigo-400/50 dark:text-indigo-200 dark:hover:bg-indigo-500/30"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => {
                        deletePost(selectedMapPost.id);
                        setSelectedMapPost(null);
                      }}
                      className="rounded-xl border border-rose-200 bg-rose-50 py-2 text-xs font-extrabold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/20 dark:border-rose-400/50 dark:text-rose-200 dark:hover:bg-rose-500/30"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                  <div className="mb-3 text-5xl">📍</div>
                  <div className="text-sm font-extrabold text-slate-700 dark:text-slate-200">지도를 클릭해 글을 작성하세요</div>
                  <div className="mt-2 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
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
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm dark:bg-slate-900 dark:border dark:border-slate-700">
            <p className="text-slate-700 font-bold text-sm mb-5 leading-relaxed whitespace-pre-line dark:text-slate-100">{confirmState.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmState(null)}
                className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">취소</button>
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
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden dark:bg-slate-900 dark:border dark:border-slate-700">
          <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center gap-3 dark:bg-indigo-950/30 dark:border-indigo-500/40">
            <div className="w-12 h-12 rounded-full bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center text-xl dark:bg-indigo-500/20 dark:border-indigo-400/50">👑</div>
            <div>
              <div className="font-extrabold text-indigo-800 text-sm dark:text-indigo-200">선생님</div>
              <div className="text-[10px] text-indigo-400 dark:text-indigo-300">
                {selectedBoard?.title}에 게시
                {writeLat ? ` · 📍 ${writeLat.toFixed(3)}, ${writeLng.toFixed(3)}` : ''}
              </div>
            </div>
            <button onClick={() => { setShowWrite(false); setWriteTitle(''); setWriteContent(''); setWriteImage(''); setWriteAttachment(null); setWriteLat(null); setWriteLng(null); }}
              className="ml-auto text-slate-400 hover:text-slate-600 text-xl dark:hover:text-slate-100">✕</button>
          </div>
          {isGroupType && pages.length > 0 && (
            <div className="px-4 pt-3">
              <label className="text-xs font-bold text-slate-500 block mb-1.5 dark:text-slate-300">그룹 선택</label>
              <div className="flex gap-2 flex-wrap">
                {pages.map(p => (
                  <button key={p.id} onClick={() => setWritePageId(p.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors
                      ${writePageId === p.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:border-indigo-400'}`}>
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="p-4 space-y-3">
            <input
              value={writeTitle}
              onChange={e => setWriteTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-indigo-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <textarea ref={textRef} value={writeContent} onChange={e => setWriteContent(e.target.value)}
              placeholder="내용을 입력하세요..." rows={5}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-indigo-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500" />
            {writeImage && (
              <div className="relative">
                <img src={writeImage} alt="" className="w-full rounded-xl object-cover max-h-48 border border-slate-200" />
                <button onClick={() => setWriteImage('')}
                  className="absolute top-2 right-2 bg-slate-900/60 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center">✕</button>
              </div>
            )}
            {writeAttachment?.name && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:bg-slate-800 dark:border-slate-700">
                <span className="truncate text-xs font-bold text-slate-600 dark:text-slate-200">📎 {writeAttachment.name}</span>
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
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-300">
              {isCompressing ? '⏳ 처리 중...' : '🖼️ 이미지 첨부'}
            </button>
          </div>
            <button
              type="button"
              onClick={() => attachFileRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-300"
            >
              📎 파일 첨부
            </button>
          <div className="p-4 border-t border-slate-100 flex gap-3 dark:border-slate-700">
            <button onClick={() => { setShowWrite(false); setWriteTitle(''); setWriteContent(''); setWriteImage(''); setWriteAttachment(null); setWriteLat(null); setWriteLng(null); }}
              className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">취소</button>
            <button onClick={submitPost} disabled={isPosting || isCompressing || (!writeTitle.trim() && !writeContent.trim() && !writeImage && !writeAttachment)}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40">
              {isPosting ? '게시 중...' : '게시하기 ✓'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const EditPostModal = () => {
    if (!editingPost) return null;
    const isGroupType = selectedBoard?.boardType === 'vertical-group' || selectedBoard?.boardType === 'horizontal-group';

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1400] flex items-end sm:items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden dark:bg-slate-900 dark:border dark:border-slate-700">
          <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center gap-3 dark:bg-indigo-950/30 dark:border-indigo-500/40">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-lg dark:bg-indigo-500/20 dark:border-indigo-400/50">✏️</div>
            <div className="min-w-0">
              <div className="font-extrabold text-indigo-800 text-sm dark:text-indigo-200">게시글 수정</div>
              <div className="text-[10px] text-indigo-400 truncate dark:text-indigo-300">
                {editingPost.studentName || '작성자'} · {selectedBoard?.title}
              </div>
            </div>
            <button onClick={closeEditPost}
              className="ml-auto text-slate-400 hover:text-slate-600 text-xl dark:hover:text-slate-100">✕</button>
          </div>

          <div className="p-4 space-y-4">
            {isGroupType && (
              <div>
                <label className="text-xs font-extrabold text-slate-500 block mb-1.5 dark:text-slate-300">그룹 변경</label>
                <select
                  value={editPostPageId || ''}
                  onChange={e => setEditPostPageId(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100"
                >
                  <option value="">그룹 없음</option>
                  {pages.map(page => (
                    <option key={page.id} value={page.id}>{page.title}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-extrabold text-slate-500 block mb-1.5 dark:text-slate-300">내용</label>
              <textarea
                value={editPostContent}
                onChange={e => setEditPostContent(e.target.value)}
                rows={7}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-indigo-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="게시글 내용을 입력하세요..."
              />
            </div>

            {editingPost.imageBase64 && (
              <img src={editingPost.imageBase64} alt="" className="w-full rounded-xl object-cover max-h-40 border border-slate-200 dark:border-slate-600" />
            )}
            {editingPost.attachment?.name && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                📎 {editingPost.attachment.name}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 flex gap-3">
            <button onClick={closeEditPost}
              className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">취소</button>
            <button onClick={submitEditPost} disabled={isSavingPostEdit}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-40">
              {isSavingPostEdit ? '저장 중...' : '저장하기'}
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

    // 시트 탭 UI (헤더에 인라인으로 사용)
    const SheetTabs = () => (
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {sheets.map((sheet) => {
          const isSelected = selectedSheetId === sheet.id;
          const isEditing  = editingSheetId === sheet.id;
          return (
            <div key={sheet.id} className={`flex items-center gap-1 rounded-xl px-1 py-1 shrink-0 ${isSelected ? 'bg-indigo-600' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}`}>
              {isEditing ? (
                <>
                  <input
                    value={editingSheetTitle}
                    onChange={e => setEditingSheetTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitSheetRename(sheet.id); if (e.key === 'Escape') cancelSheetRename(); }}
                    onBlur={() => submitSheetRename(sheet.id)}
                    className="w-24 px-2 py-0.5 text-xs rounded-md border border-slate-300 focus:outline-none"
                    autoFocus disabled={isRenamingSheet}
                  />
                  <button onMouseDown={e => e.preventDefault()} onClick={() => submitSheetRename(sheet.id)}
                    className="px-1.5 py-0.5 text-[11px] rounded-md bg-emerald-500 text-white" disabled={isRenamingSheet}>저장</button>
                </>
              ) : (
                <>
                  <button onClick={() => setSelectedSheetId(sheet.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${isSelected ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                    {sheet.title}
                  </button>
                  <button onClick={() => beginSheetRename(sheet)}
                    className={`px-1 py-0.5 rounded text-[10px] font-semibold ${isSelected ? 'text-indigo-100 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                    title="이름 변경">✏️</button>
                  <button onClick={() => removeSheet(sheet)}
                    className={`px-1 py-0.5 rounded text-[10px] font-semibold ${isSelected ? 'text-rose-100 hover:text-white' : 'text-rose-400 hover:text-rose-600'}`}
                    title="삭제">✕</button>
                </>
              )}
            </div>
          );
        })}
        <button onClick={addSheet}
          className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-900 text-white text-sm font-bold shrink-0 flex items-center justify-center"
          title="시트 추가">+</button>
      </div>
    );

    return (
      <div className={`flex flex-col bg-slate-100 dark:bg-slate-950 ${teacherLightModeClass}`} style={{ height: 'calc(100vh - 0px)' }}>
        {/* ── 통합 헤더 (지도형 제외) ── */}
        {!isMapType && (
          <div className="bg-white border-b border-slate-200 shadow-sm shrink-0 dark:bg-slate-900 dark:border-slate-700">
            {/* 상단 줄: 뒤로 + 제목 + 게시물 수 */}
            <div className="px-4 pr-48 py-2.5 flex items-center gap-3">
              <button
                onClick={() => { setSelectedBoard(null); setPages([]); setPosts([]); setSheets([]); setSelectedSheetId(null); setEditingSheetId(null); setEditingSheetTitle(''); closeEditPost(); }}
                className="text-slate-500 hover:text-slate-800 font-bold text-sm px-2.5 py-1 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors shrink-0 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
                ← 목록
              </button>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {typeInfo && (
                  <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${typeInfo.color} ${typeInfo.bg} ${typeInfo.border}`}>
                    {typeInfo.label}
                  </span>
                )}
                {editingBoardId === selectedBoard.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1.5"
                    onSubmit={(e) => { e.preventDefault(); saveBoardTitle(selectedBoard); }}
                  >
                    <input
                      value={editingBoardTitle}
                      onChange={e => setEditingBoardTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') cancelBoardTitleEdit(); }}
                      autoFocus
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm font-extrabold text-slate-800 outline-none focus:border-indigo-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      disabled={isSavingBoardTitle}
                      className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-extrabold text-white disabled:opacity-50"
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={cancelBoardTitleEdit}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-extrabold text-slate-500 hover:bg-slate-100 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      취소
                    </button>
                  </form>
                ) : (
                  <>
                    <h1 className="text-sm font-extrabold text-slate-800 truncate dark:text-slate-100">{selectedBoard.title}</h1>
                    <button
                      type="button"
                      onClick={() => beginBoardTitleEdit(selectedBoard)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-extrabold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300"
                      title="게시판 제목 수정"
                    >
                      수정
                    </button>
                  </>
                )}
              </div>
              {hasNewPosts && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold text-amber-700 border border-amber-200 shrink-0">
                  새 글이 올라왔어요
                </span>
              )}
              <button
                type="button"
                onClick={() => loadBoardPosts()}
                disabled={loadingPosts}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-extrabold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 shrink-0 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300"
              >
                새로고침
              </button>
              <span className="text-xs text-slate-400 font-medium shrink-0 dark:text-slate-500">게시물 {sorted.length}개</span>
            </div>
            {/* 시트 탭 줄 */}
            <div className="px-4 pb-2">
              <SheetTabs />
            </div>
          </div>
        )}

        {/* ── 보드 컨텐츠 (남은 공간 꽉 채움) ── */}
        <div className="flex-1 overflow-auto">
          {loadingPosts
            ? <div className="flex items-center justify-center gap-2.5 h-full">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-sm text-slate-400">불러오는 중...</span>
              </div>
            : renderContent()
          }
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
        {editingPost && <EditPostModal />}
        <Modals />

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

  // ── board list ────────────────────────────────────────────────
  return (
    <div className={`min-h-screen bg-slate-100 p-8 dark:bg-slate-950 ${teacherLightModeClass}`}>
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-6 dark:bg-slate-900 dark:border-slate-700">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">📋 공유 게시판</h1>
            <p className="text-slate-500 text-sm mt-0.5 dark:text-slate-400">학생들이 학습 결과를 카드 형태로 자유롭게 공유하는 게시판</p>
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
                {boards.map((board, boardIndex) => {
                  const typeInfo = BOARD_TYPES.find(t => t.id === board.boardType);
                  const stripColor = getBoardCardStrip(board, boardIndex);
                  const fmtCreatedAt = board.createdAt?.toDate
                    ? board.createdAt.toDate().toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
                    : board.createdAt?.seconds
                      ? new Date(board.createdAt.seconds * 1000).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
                      : '날짜 없음';
                  return (
                    <div key={board.id}
                      className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all cursor-pointer group dark:bg-slate-900
                        ${board.active ? 'border-slate-200 hover:shadow-lg hover:-translate-y-0.5 dark:border-slate-700 dark:hover:border-slate-600' : 'border-slate-100 opacity-60 dark:border-slate-800'}`}
                      onClick={() => openBoard(board)}>
                      {/* 색깔 띠 헤더 */}
                      <div className={`px-4 py-1.5 text-white text-[10px] font-extrabold flex justify-between items-center ${stripColor}`}>
                        <span>{typeInfo?.label || '기본형'}</span>
                        <span>{board.active ? '🟢 공개' : '⏸ 비공개'}</span>
                      </div>
                      <div className="p-4">
                        {editingBoardId === board.id ? (
                          <form
                            className="mb-2 flex items-center gap-1.5"
                            onClick={e => e.stopPropagation()}
                            onSubmit={(e) => { e.preventDefault(); saveBoardTitle(board); }}
                          >
                            <input
                              value={editingBoardTitle}
                              onChange={e => setEditingBoardTitle(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Escape') cancelBoardTitleEdit(); }}
                              autoFocus
                              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-extrabold text-slate-800 outline-none focus:border-indigo-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100"
                            />
                            <button
                              type="submit"
                              disabled={isSavingBoardTitle}
                              className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-extrabold text-white disabled:opacity-50"
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={cancelBoardTitleEdit}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-extrabold text-slate-500 hover:bg-slate-100 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              취소
                            </button>
                          </form>
                        ) : (
                          <div className="mb-1 flex items-start gap-2">
                            <h3 className="min-w-0 flex-1 font-extrabold text-slate-800 text-base group-hover:text-indigo-700 transition-colors dark:text-slate-100 dark:group-hover:text-indigo-300">{board.title}</h3>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); beginBoardTitleEdit(board); }}
                              className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-extrabold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                              title="게시판 제목 수정"
                            >
                              수정
                            </button>
                          </div>
                        )}
                        {board.description && <p className="text-xs text-slate-500 mb-2 line-clamp-2 dark:text-slate-400">{board.description}</p>}
                        <div className="text-[11px] text-slate-400 mb-3 flex items-center gap-1 dark:text-slate-500">
                          🗓 {fmtCreatedAt}
                        </div>
                        <div className="flex gap-2 mt-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => openBoard(board)}
                            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors">
                            열기
                          </button>
                          <button onClick={() => toggleActive(board)}
                            className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl border border-slate-200 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col dark:bg-slate-900 dark:border dark:border-slate-700">
            <div className="p-5 bg-indigo-600 text-white font-bold text-lg flex justify-between rounded-t-2xl shrink-0">
              <span>📋 게시판 만들기</span>
              <button onClick={() => setShowCreate(false)} className="text-indigo-200 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 dark:text-slate-300">제목 *</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="예: 오늘의 수업 정리" autoFocus
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 dark:text-slate-300">설명 (선택)</label>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="학생들에게 안내할 내용"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500" />
              </div>

              {/* board type */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-3 dark:text-slate-300">보드 유형 *</label>
                <div className="grid grid-cols-2 gap-3">
                  {BOARD_TYPES.map(t => (
                    <button key={t.id} onClick={() => setNewType(t.id)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${
                        newType === t.id ? `${t.border} ${t.bg} shadow-md dark:bg-indigo-950/30 dark:border-indigo-500/50` : 'border-slate-200 hover:border-slate-300 bg-white dark:bg-slate-950 dark:border-slate-700 dark:hover:border-slate-500'
                      }`}>
                      <div className="mb-2">{t.icon}</div>
                      <div className={`font-extrabold text-sm mb-1 ${newType === t.id ? t.color : 'text-slate-700 dark:text-slate-100'}`}>{t.label}</div>
                      <div className="text-xs text-slate-500 leading-relaxed dark:text-slate-400">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* background color */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2 dark:text-slate-300">보드 배경색</label>
                <div className="relative">
                  <button onClick={() => setShowColorPicker(v => !v)}
                    className="flex items-center gap-3 w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl hover:border-indigo-400 transition-colors dark:bg-slate-950 dark:border-slate-700 dark:hover:border-indigo-400">
                    <span className="w-5 h-5 rounded-full border border-slate-300 shrink-0" style={{ backgroundColor: newBgColor }} />
                    <span className="text-sm text-slate-700 font-medium flex-1 text-left dark:text-slate-100">
                      {BG_COLORS.find(c => c.value === newBgColor)?.label || '색상 선택'}
                    </span>
                    <span className="text-slate-400 text-xs">{showColorPicker ? '▲' : '▼'}</span>
                  </button>
                  {showColorPicker && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden dark:bg-slate-900 dark:border-slate-700">
                      {BG_COLORS.map(c => (
                        <button key={c.id} onClick={() => { setNewBgColor(c.value); setShowColorPicker(false); }}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 ${newBgColor === c.value ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''}`}>
                          <span className="w-8 h-5 rounded border border-slate-200 shrink-0" style={{ backgroundColor: c.value }} />
                          <span className="text-sm text-slate-700 dark:text-slate-100">{c.label}</span>
                          {newBgColor === c.value && <span className="ml-auto text-indigo-500 font-bold text-xs">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-3 shrink-0 dark:border-slate-700">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">취소</button>
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
