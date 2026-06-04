import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, arrayUnion, arrayRemove,
  onSnapshot, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase';

const MAX_ATTACHMENT_SIZE = 450 * 1024;

export default function FreeBoard({ studentCode, teacherUid: propTeacherUid, isTeacher }) {
  const [myInfo, setMyInfo]       = useState(null);
  const [posts, setPosts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState('list'); // 'list' | 'write'
  const [selectedPost, setSelectedPost] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  // 교사 게시판 (boards 컬렉션)
  const [teacherBoards, setTeacherBoards] = useState([]);
  const [activeBoard, setActiveBoard]     = useState(null); // null = 자유게시판
  const [boardPosts, setBoardPosts]       = useState([]);
  const [loadingBoard, setLoadingBoard]   = useState(false);

  // 글쓰기 폼
  const [title, setTitle]         = useState('');
  const [content, setContent]     = useState('');
  const [imageData, setImageData] = useState(null);
  const [attachmentData, setAttachmentData] = useState(null);
  const [isPosting, setIsPosting] = useState(false);
  const fileRef = useRef(null);
  const attachmentFileRef = useRef(null);

  // 수정 모드
  const [editMode, setEditMode]       = useState(false);
  const [editTitle, setEditTitle]     = useState('');
  const [editContent, setEditContent] = useState('');
  const [editImageData, setEditImageData] = useState(null);
  const [editAttachmentData, setEditAttachmentData] = useState(null);
  const [isUpdating, setIsUpdating]   = useState(false);
  const editFileRef = useRef(null);
  const editAttachmentFileRef = useRef(null);

  // 댓글
  const [comments, setComments]       = useState([]);
  const [commentText, setCommentText] = useState('');
  const [isCommenting, setIsCommenting] = useState(false);

  useEffect(() => {
    if (propTeacherUid) {
      setMyInfo({ docId: null, name: '선생님', teacherUid: propTeacherUid });
      return;
    }
    if (!studentCode) return;
    (async () => {
      const snap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
      if (!snap.empty) {
        const d = snap.docs[0];
        setMyInfo({ docId: d.id, name: d.data().name, teacherUid: d.data().teacherUid });
      }
    })();
  }, [studentCode, propTeacherUid]);

  // 교사가 만든 boards 로드
  useEffect(() => {
    if (!myInfo?.teacherUid) return;
    getDocs(query(collection(db, 'boards'), where('teacherUid', '==', myInfo.teacherUid)))
      .then(snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(b => b.active !== false)
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setTeacherBoards(list);
      });
  }, [myInfo?.teacherUid]);

  // 선택한 교사 board의 posts 로드
  useEffect(() => {
    if (!activeBoard) return;
    setLoadingBoard(true);
    getDocs(query(collection(db, 'boards', activeBoard.id, 'posts'), orderBy('createdAt', 'desc')))
      .then(snap => {
        setBoardPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoadingBoard(false);
      });
  }, [activeBoard]);

  useEffect(() => {
    if (!myInfo) return;
    if (!myInfo.teacherUid) { setLoading(false); return; }

    const q = query(
      collection(db, 'boardPosts'),
      where('teacherUid', '==', myInfo.teacherUid),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setPosts(list);
        setLoading(false);
        // 상세 팝업이 열려있으면 최신 데이터 반영
        setSelectedPost(prev => prev ? (list.find(p => p.id === prev.id) || prev) : null);
      },
      err => { console.error('FreeBoard 에러:', err); setLoading(false); }
    );
    return unsub;
  }, [myInfo]);

  useEffect(() => {
    if (!selectedPost?.id) { setComments([]); return; }
    const q = query(
      collection(db, 'boardPosts', selectedPost.id, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [selectedPost?.id]);

  const compressImage = (file) => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  const handleImageUpload = async (e, setter) => {
    const file = e.target.files[0];
    if (!file) return;
    setter(await compressImage(file));
  };

  const toDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleAttachmentUpload = async (e, setter) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      alert('파일은 450KB 이하만 첨부할 수 있습니다.');
      e.target.value = '';
      return;
    }
    try {
      const dataUrl = await toDataUrl(file);
      setter({
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

  const submitPost = async () => {
    if (!title.trim() || !content.trim() || !myInfo) return;
    setIsPosting(true);
    await addDoc(collection(db, 'boardPosts'), {
      title:        title.trim(),
      content:      content.trim(),
      imageUrl:     imageData || null,
      attachment:   attachmentData || null,
      authorId:     isTeacher ? `teacher_${propTeacherUid}` : studentCode,
      authorName:   isTeacher ? '👨‍🏫 선생님' : myInfo.name,
      authorImage:  isTeacher ? null : (myInfo.characterImage || null),
      teacherUid:   myInfo.teacherUid,
      createdAt:    serverTimestamp(),
      likes:        [],
      commentCount: 0,
    });
    setTitle(''); setContent(''); setImageData(null); setAttachmentData(null);
    setIsPosting(false);
    setView('list');
  };

  const updatePost = async () => {
    if (!editTitle.trim() || !editContent.trim() || !selectedPost) return;
    setIsUpdating(true);
    await updateDoc(doc(db, 'boardPosts', selectedPost.id), {
      title:   editTitle.trim(),
      content: editContent.trim(),
      imageUrl: editImageData,
      attachment: editAttachmentData || null,
    });
    setIsUpdating(false);
    setEditMode(false);
  };

  const toggleLike = async (post) => {
    if (!studentCode) return;
    const ref   = doc(db, 'boardPosts', post.id);
    const liked = post.likes?.includes(studentCode);
    await updateDoc(ref, { likes: liked ? arrayRemove(studentCode) : arrayUnion(studentCode) });
  };

  const deletePost = async (postId) => {
    if (!window.confirm('이 게시글을 삭제할까요?')) return;
    await deleteDoc(doc(db, 'boardPosts', postId));
    setSelectedPost(null);
  };

  const submitComment = async () => {
    if (!commentText.trim() || !selectedPost || !myInfo) return;
    setIsCommenting(true);
    await addDoc(collection(db, 'boardPosts', selectedPost.id, 'comments'), {
      content:    commentText.trim(),
      authorId:   isTeacher ? `teacher_${propTeacherUid}` : studentCode,
      authorName: isTeacher ? '👨‍🏫 선생님' : myInfo.name,
      createdAt:  serverTimestamp(),
    });
    await updateDoc(doc(db, 'boardPosts', selectedPost.id), {
      commentCount: (selectedPost.commentCount || 0) + 1,
    });
    setCommentText('');
    setIsCommenting(false);
  };

  const openDetail = (post) => {
    setSelectedPost(post);
    setEditMode(false);
    setCommentText('');
  };

  const openEdit = () => {
    setEditTitle(selectedPost.title);
    setEditContent(selectedPost.content);
    setEditImageData(selectedPost.imageUrl || null);
    setEditAttachmentData(selectedPost.attachment || null);
    setEditMode(true);
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-400">불러오는 중...</div>
  );

  // ── 글쓰기 페이지 ──────────────────────────────────────────────
  if (view === 'write') {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-800 text-sm font-bold">← 목록</button>
          <h2 className="text-xl font-extrabold text-slate-800">✏️ 글쓰기</h2>
        </div>
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="제목" maxLength={50}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <textarea
          value={content} onChange={e => setContent(e.target.value)}
          placeholder="내용을 입력하세요" maxLength={1000}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
          style={{ minHeight: '280px' }}
        />
        {imageData ? (
          <div className="relative inline-block">
            <img src={imageData} alt="" className="max-h-48 rounded-xl border border-slate-200" />
            <button onClick={() => setImageData(null)}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black/70">✕</button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors text-sm">
            📷 사진 첨부
          </button>
        )}
        {attachmentData?.name && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="truncate text-xs font-bold text-slate-600">📎 {attachmentData.name}</span>
            <button
              type="button"
              onClick={() => setAttachmentData(null)}
              className="ml-2 text-xs font-bold text-slate-400 hover:text-rose-500"
            >
              삭제
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => handleImageUpload(e, setImageData)} />
        <input ref={attachmentFileRef} type="file" className="hidden"
          onChange={e => handleAttachmentUpload(e, setAttachmentData)} />
        <button onClick={() => attachmentFileRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors text-sm">
          📎 파일 첨부
        </button>
        <button onClick={submitPost} disabled={!title.trim() || !content.trim() || isPosting}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold transition-colors disabled:opacity-50">
          {isPosting ? '게시 중...' : '게시하기'}
        </button>
      </div>
    );
  }

  // ── 카드 색상 (교사 게시판과 동일) ─────────────────────────────
  const POST_COLORS = [
    'bg-yellow-50 border-yellow-200',
    'bg-sky-50 border-sky-200',
    'bg-pink-50 border-pink-200',
    'bg-emerald-50 border-emerald-200',
    'bg-violet-50 border-violet-200',
    'bg-orange-50 border-orange-200',
  ];

  // ── 목록 ──────────────────────────────────────────────────────
  return (
    <div className="p-5" style={{ background: '#f8fafc', minHeight: 'calc(100vh - 88px)' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-extrabold text-slate-700">📋 게시판</h1>
        {!activeBoard && (
          <button onClick={() => setView('write')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors shadow-md">
            ✏️ 글쓰기
          </button>
        )}
      </div>

      {/* 게시판 탭 */}
      {teacherBoards.length > 0 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveBoard(null)}
            className={`px-4 py-2 rounded-xl text-sm font-extrabold shrink-0 transition-all
              ${!activeBoard ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
            ✏️ 자유 게시판
          </button>
          {teacherBoards.map(b => (
            <button key={b.id}
              onClick={() => setActiveBoard(b)}
              className={`px-4 py-2 rounded-xl text-sm font-extrabold shrink-0 transition-all
                ${activeBoard?.id === b.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              {b.boardType === 'map' ? '🗺️' : b.boardType === 'wall' ? '📌' : '📋'} {b.title}
            </button>
          ))}
        </div>
      )}

      {/* 교사 게시판 뷰 */}
      {activeBoard && (() => {
        if (loadingBoard) return <div className="text-center py-20 text-slate-400 animate-pulse">불러오는 중...</div>;
        const COLORS = ['bg-yellow-50 border-yellow-200','bg-sky-50 border-sky-200','bg-pink-50 border-pink-200','bg-emerald-50 border-emerald-200','bg-violet-50 border-violet-200','bg-orange-50 border-orange-200'];
        return boardPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 opacity-50">
            <div className="text-6xl">📭</div>
            <p className="text-slate-500 font-bold text-sm">아직 게시물이 없습니다</p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
            {boardPosts.map((post, idx) => (
              <div key={post.id} style={{ breakInside: 'avoid', marginBottom: '1rem' }}>
                <div className={`rounded-2xl border-2 p-4 shadow-sm ${COLORS[idx % COLORS.length]}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-white shadow-sm overflow-hidden shrink-0 flex items-center justify-center">
                      {post.isTeacher ? <span className="text-lg">👑</span>
                        : post.characterImage ? <img src={post.characterImage} alt="" className="w-full h-full object-contain scale-[2]" />
                        : <span className="text-lg">🧑‍🎓</span>}
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold text-xs text-slate-700 truncate">{post.isTeacher ? '선생님' : post.studentName}</div>
                      <div className="text-[10px] text-slate-400">
                        {post.createdAt?.toDate?.()?.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) || ''}
                      </div>
                    </div>
                  </div>
                  {post.content && (
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words line-clamp-6">{post.content}</p>
                  )}
                  {post.imageBase64 && (
                    <img
                      src={post.imageBase64}
                      alt=""
                      className="w-full rounded-xl object-cover max-h-40 mt-2 border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity"
                      onClick={e => { e.stopPropagation(); setLightboxSrc(post.imageBase64); }}
                    />
                  )}
                  {post.attachment?.dataUrl && (
                    <a href={post.attachment.dataUrl} download={post.attachment.name || 'file'}
                      onClick={e => e.stopPropagation()}
                      className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 bg-white/70 rounded-lg border border-slate-200 px-2 py-1 hover:bg-white">
                      📎 {post.attachment.name || '첨부파일'}
                    </a>
                  )}
                  {Object.keys(post.reactions || {}).length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {Object.entries(
                        Object.values(post.reactions).reduce((acc, e) => { if(e) acc[e] = (acc[e]||0)+1; return acc; }, {})
                      ).map(([emoji, cnt]) => (
                        <span key={emoji} className="text-xs bg-white/70 rounded-full px-1.5 py-0.5 border border-slate-200">{emoji} <span className="font-bold">{cnt}</span></span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* 자유 게시판 (activeBoard가 없을 때) */}
      {!activeBoard && (<>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 opacity-50">
          <div className="text-6xl">📝</div>
          <p className="text-slate-500 font-bold text-sm">첫 번째 글을 작성해보세요!</p>
        </div>
      ) : (
        /* 담벼락형 masonry 레이아웃 */
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
          {posts.map((post, idx) => (
            <div key={post.id} style={{ breakInside: 'avoid', marginBottom: '1rem' }}>
              <div className={`rounded-2xl border-2 p-4 shadow-sm cursor-pointer relative group transition-all hover:shadow-md hover:-translate-y-0.5
                ${POST_COLORS[idx % POST_COLORS.length]}`}
                onClick={() => openDetail(post)}>
                {/* 작성자 */}
                <div className="flex items-center gap-2 mb-3 mt-1">
                  <div className="w-14 h-14 rounded-xl bg-white border-2 border-white shadow-sm overflow-hidden shrink-0 flex items-center justify-center">
                    {post.authorImage
                      ? <img src={post.authorImage} alt="" className="w-full h-full object-contain scale-[2]" />
                      : <span className="text-2xl">🧑‍🎓</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-xs text-slate-700 truncate">{post.authorName}</div>
                    <div className="text-[10px] text-slate-400">{formatDate(post.createdAt)}</div>
                  </div>
                </div>
                {/* 제목 */}
                <div className="font-extrabold text-sm text-slate-800 mb-1 leading-snug">{post.title}</div>
                {/* 내용 */}
                {post.content && (() => {
                  const isLong = post.content.length > 50 || post.content.split('\n').length > 3;
                  return (
                    <>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words line-clamp-5 mb-1">{post.content}</p>
                      {isLong && (
                        <button onClick={e => { e.stopPropagation(); openDetail(post); }}
                          className="inline-flex items-center rounded-full bg-white/80 border border-indigo-100 px-2.5 py-1 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-white font-extrabold transition-colors">
                          더보기 ▾
                        </button>
                      )}
                    </>
                  );
                })()}
                {/* 이미지 */}
                {post.imageUrl && (
                  <img src={post.imageUrl} alt=""
                    className="w-full rounded-xl object-cover max-h-40 mt-2 border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity"
                    onClick={e => { e.stopPropagation(); setLightboxSrc(post.imageUrl); }} />
                )}
                {/* 첨부파일 */}
                {post.attachment?.name && (
                  <div className="mt-2 text-[10px] font-bold text-slate-500">📎 {post.attachment.name}</div>
                )}
                {/* 반응 */}
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  <span className="flex items-center gap-0.5 text-xs bg-white/70 rounded-full px-2 py-0.5 border border-slate-200">
                    ❤️ <span className="font-bold text-slate-600">{post.likes?.length || 0}</span>
                  </span>
                  <span className="flex items-center gap-0.5 text-xs bg-white/70 rounded-full px-2 py-0.5 border border-slate-200">
                    💬 <span className="font-bold text-slate-600">{post.commentCount || 0}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      </>)}

      {/* ── 상세 팝업 모달 (자유게시판용) ── */}
      {selectedPost && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setSelectedPost(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden">

            {editMode ? (
              /* ── 수정 모드 ── */
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                  <h3 className="font-extrabold text-slate-800">✏️ 게시글 수정</h3>
                  <button onClick={() => setEditMode(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 text-xl">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    placeholder="제목" maxLength={50}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                    placeholder="내용" rows={6} maxLength={1000}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  {editImageData ? (
                    <div className="relative inline-block">
                      <img src={editImageData} alt="" className="max-h-40 rounded-xl border border-slate-200" />
                      <button onClick={() => setEditImageData(null)}
                        className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => editFileRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 text-sm">
                      📷 사진 첨부
                    </button>
                  )}
                  <input ref={editFileRef} type="file" accept="image/*" className="hidden"
                    onChange={e => handleImageUpload(e, setEditImageData)} />
                  {editAttachmentData?.name && (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="truncate text-xs font-bold text-slate-600">📎 {editAttachmentData.name}</span>
                      <button
                        type="button"
                        onClick={() => setEditAttachmentData(null)}
                        className="ml-2 text-xs font-bold text-slate-400 hover:text-rose-500"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                  <input ref={editAttachmentFileRef} type="file" className="hidden"
                    onChange={e => handleAttachmentUpload(e, setEditAttachmentData)} />
                  <button
                    type="button"
                    onClick={() => editAttachmentFileRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 text-sm"
                  >
                    📎 파일 첨부
                  </button>
                </div>
                <div className="flex gap-3 p-4 border-t border-slate-100 shrink-0">
                  <button onClick={() => setEditMode(false)}
                    className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
                    취소
                  </button>
                  <button onClick={updatePost} disabled={!editTitle.trim() || !editContent.trim() || isUpdating}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm disabled:opacity-50">
                    {isUpdating ? '저장 중...' : '수정 완료'}
                  </button>
                </div>
              </>
            ) : (
              /* ── 상세 보기 ── */
              <>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-slate-800 text-base leading-snug">{selectedPost.title}</h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <span className="font-bold text-slate-500">{selectedPost.authorName}</span>
                      <span>·</span>
                      <span>{formatDate(selectedPost.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(isTeacher || selectedPost.authorId === studentCode) && (
                      <>
                        <button onClick={openEdit}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-100 transition-colors">
                          수정
                        </button>
                        <button onClick={() => deletePost(selectedPost.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-50 border border-rose-100 transition-colors">
                          삭제
                        </button>
                      </>
                    )}
                    <button onClick={() => setSelectedPost(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 text-xl ml-1">✕</button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {selectedPost.imageUrl && (
                    <img src={selectedPost.imageUrl} alt=""
                      className="w-full rounded-xl max-h-72 object-contain bg-slate-50 border border-slate-100 cursor-zoom-in hover:opacity-90 transition-opacity"
                      onClick={() => setLightboxSrc(selectedPost.imageUrl)} />
                  )}
                  {selectedPost.attachment?.dataUrl && (
                    <a
                      href={selectedPost.attachment.dataUrl}
                      download={selectedPost.attachment.name || 'attachment'}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                    >
                      📎 {selectedPost.attachment.name || '첨부파일'}
                    </a>
                  )}
                  <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">{selectedPost.content}</p>

                  <div className="flex items-center gap-4 pt-3 border-t border-slate-100">
                    <button onClick={() => toggleLike(selectedPost)}
                      className={`flex items-center gap-1.5 text-sm font-bold transition-colors
                        ${selectedPost.likes?.includes(studentCode) ? 'text-rose-500' : 'text-slate-400 hover:text-rose-400'}`}>
                      {selectedPost.likes?.includes(studentCode) ? '❤️' : '🤍'} {selectedPost.likes?.length || 0}
                    </button>
                    <span className="text-slate-400 text-sm">💬 {comments.length}</span>
                  </div>

                  {/* 댓글 */}
                  <div className="space-y-2">
                    {comments.map(c => (
                      <div key={c.id} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-slate-700">{c.authorName}</span>
                          <span className="text-xs text-slate-400">{formatDate(c.createdAt)}</span>
                        </div>
                        <p className="text-sm text-slate-600">{c.content}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 p-4 border-t border-slate-100 shrink-0">
                  <input value={commentText} onChange={e => setCommentText(e.target.value)}
                    placeholder="댓글 입력..."
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <button onClick={submitComment} disabled={!commentText.trim() || isCommenting}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm disabled:opacity-50 transition-colors">
                    등록
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {lightboxSrc && (
        <div
          className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt=""
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white text-2xl font-bold"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
