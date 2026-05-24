import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, orderBy, arrayUnion, arrayRemove,
  onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

export default function FreeBoard({ studentCode, teacherUid: propTeacherUid, isTeacher }) {
  const [myInfo, setMyInfo]       = useState(null);
  const [posts, setPosts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState('list'); // 'list' | 'write' | 'detail'
  const [selectedPost, setSelectedPost] = useState(null);

  const [title, setTitle]         = useState('');
  const [content, setContent]     = useState('');
  const [imageData, setImageData] = useState(null);
  const [isPosting, setIsPosting] = useState(false);
  const fileRef = useRef(null);

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

  useEffect(() => {
    if (!myInfo?.teacherUid) return;
    const q = query(
      collection(db, 'boardPosts'),
      where('teacherUid', '==', myInfo.teacherUid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [myInfo?.teacherUid]);

  useEffect(() => {
    if (!selectedPost?.id) return;
    const q = query(
      collection(db, 'boardPosts', selectedPost.id, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [selectedPost?.id]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        setImageData(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const submitPost = async () => {
    if (!title.trim() || !content.trim() || !myInfo) return;
    setIsPosting(true);
    await addDoc(collection(db, 'boardPosts'), {
      title:      title.trim(),
      content:    content.trim(),
      imageUrl:   imageData || null,
      authorId:   isTeacher ? `teacher_${propTeacherUid}` : studentCode,
      authorName: isTeacher ? '👨‍🏫 선생님' : myInfo.name,
      teacherUid: myInfo.teacherUid,
      createdAt:  serverTimestamp(),
      likes:      [],
      commentCount: 0,
    });
    setTitle(''); setContent(''); setImageData(null);
    setIsPosting(false);
    setView('list');
  };

  const toggleLike = async (post) => {
    if (!studentCode) return;
    const ref = doc(db, 'boardPosts', post.id);
    const liked = post.likes?.includes(studentCode);
    await updateDoc(ref, { likes: liked ? arrayRemove(studentCode) : arrayUnion(studentCode) });
  };

  const deletePost = async (postId) => {
    await deleteDoc(doc(db, 'boardPosts', postId));
    setSelectedPost(null);
    setView('list');
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

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-400">불러오는 중...</div>
  );

  // ── 글쓰기 ─────────────────────────────────────────────────────────
  if (view === 'write') {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-800 text-sm font-bold">← 목록</button>
          <h2 className="text-xl font-extrabold text-slate-800">✏️ 글쓰기</h2>
        </div>
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="제목" maxLength={50}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <textarea
          value={content} onChange={e => setContent(e.target.value)}
          placeholder="내용을 입력하세요" rows={7} maxLength={1000}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {imageData ? (
          <div className="relative inline-block">
            <img src={imageData} alt="" className="max-h-48 rounded-xl border border-slate-200" />
            <button
              onClick={() => setImageData(null)}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black/70"
            >✕</button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors text-sm"
          >
            📷 사진 첨부
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        <button
          onClick={submitPost}
          disabled={!title.trim() || !content.trim() || isPosting}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold transition-colors disabled:opacity-50"
        >
          {isPosting ? '게시 중...' : '게시하기'}
        </button>
      </div>
    );
  }

  // ── 상세보기 ───────────────────────────────────────────────────────
  if (view === 'detail' && selectedPost) {
    const liked    = selectedPost.likes?.includes(studentCode);
    const isAuthor = isTeacher || selectedPost.authorId === studentCode;
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <button
          onClick={() => { setView('list'); setSelectedPost(null); }}
          className="text-slate-500 hover:text-slate-800 text-sm font-bold"
        >← 목록으로</button>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-extrabold text-slate-800">{selectedPost.title}</h2>
            {isAuthor && (
              <button
                onClick={() => deletePost(selectedPost.id)}
                className="text-rose-400 hover:text-rose-600 text-xs font-bold shrink-0 mt-1"
              >삭제</button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 mb-4 text-xs text-slate-400">
            <span className="font-bold text-slate-600">{selectedPost.authorName}</span>
            <span>·</span>
            <span>{formatDate(selectedPost.createdAt)}</span>
          </div>
          {selectedPost.imageUrl && (
            <img src={selectedPost.imageUrl} alt="" className="w-full rounded-xl mb-4 max-h-80 object-contain bg-slate-50 border border-slate-100" />
          )}
          <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">{selectedPost.content}</p>
          <div className="flex items-center gap-4 mt-5 pt-4 border-t border-slate-100">
            <button
              onClick={() => toggleLike(selectedPost)}
              className={`flex items-center gap-1.5 text-sm font-bold transition-colors ${liked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-400'}`}
            >
              {liked ? '❤️' : '🤍'} {selectedPost.likes?.length || 0}
            </button>
            <span className="text-slate-400 text-sm">💬 {comments.length}</span>
          </div>
        </div>

        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="bg-white rounded-xl px-4 py-3 border border-slate-100">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-sm text-slate-700">{c.authorName}</span>
                <span className="text-xs text-slate-400">{formatDate(c.createdAt)}</span>
              </div>
              <p className="text-sm text-slate-600">{c.content}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={commentText} onChange={e => setCommentText(e.target.value)}
              placeholder="댓글 입력..."
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={submitComment}
              disabled={!commentText.trim() || isCommenting}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm disabled:opacity-50 transition-colors"
            >등록</button>
          </div>
        </div>
      </div>
    );
  }

  // ── 목록 ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-slate-800">📋 자유 게시판</h1>
        <button
          onClick={() => setView('write')}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors"
        >✏️ 글쓰기</button>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-24 text-slate-400">
          <div className="text-5xl mb-4">📭</div>
          <div className="font-bold text-lg">아직 게시글이 없어요</div>
          <div className="text-sm mt-1">첫 번째 글을 작성해보세요!</div>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <div
              key={post.id}
              onClick={() => { setSelectedPost(post); setView('detail'); }}
              className="bg-white rounded-2xl p-4 border border-slate-100 hover:border-indigo-200 hover:shadow-sm cursor-pointer transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-800 truncate">{post.title}</div>
                  <div className="text-sm text-slate-500 mt-1 line-clamp-2">{post.content}</div>
                </div>
                {post.imageUrl && (
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                    <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                <span className="font-bold text-slate-500">{post.authorName}</span>
                <span>{formatDate(post.createdAt)}</span>
                <span className="ml-auto flex items-center gap-2">
                  <span>❤️ {post.likes?.length || 0}</span>
                  <span>💬 {post.commentCount || 0}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
