import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const AVATAR_URL = '/avatar_game/index.html';

export default function TeacherCharacter({ selectedClass }) {
  const teacherUid = selectedClass?.teacherUid;
  const docRef     = teacherUid ? doc(db, 'teacherProfiles', teacherUid) : null;

  const [profile, setProfile]       = useState(null);   // { characterImage, parts }
  const [isLoading, setIsLoading]   = useState(true);
  const [isSaved, setIsSaved]       = useState(false);
  const [showAvatar, setShowAvatar] = useState(false);

  const partsRef  = useRef(null);
  const imageRef  = useRef(null);
  const retryRef  = useRef(null);
  const retryNum  = useRef(0);

  // Firebase에서 캐릭터 불러오기
  useEffect(() => {
    if (!docRef) { setIsLoading(false); return; }
    (async () => {
      try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const d = snap.data();
          setProfile({ characterImage: d.characterImage || '', parts: d.parts || {} });
          partsRef.current  = d.parts || {};
          imageRef.current  = d.characterImage || '';
        }
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    })();
  }, [teacherUid]);

  // Unity → React 메시지 수신
  useEffect(() => {
    if (!showAvatar) return;
    const handler = (e) => {
      if (!e.data?.type) return;
      if (e.data.type === 'UNITY_READY') {
        sendAvatarToUnity();
      }
      if (e.data.type === 'UNITY_SAVE_CHARACTER') {
        const { parts, characterImage } = e.data;
        partsRef.current = parts;
        imageRef.current = characterImage;
        saveCharacter(parts, characterImage);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [showAvatar]);

  const sendAvatarToUnity = useCallback(() => {
    const iframe = document.getElementById('teacher-avatar-iframe');
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({
      type:           'REACT_LOAD_AVATAR',
      parts:          partsRef.current || {},
      characterImage: imageRef.current || '',
    }, '*');
  }, []);

  const handleIframeLoad = () => {
    retryNum.current = 0;
    const retry = () => {
      sendAvatarToUnity();
      retryNum.current++;
      if (retryNum.current < 8)
        retryRef.current = setTimeout(retry, 800);
    };
    retry();
  };

  const saveCharacter = async (parts, characterImage) => {
    if (!docRef) return;
    try {
      await setDoc(docRef, { teacherUid, parts, characterImage }, { merge: true });
      setProfile({ characterImage, parts });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (e) { console.error(e); }
  };

  if (!teacherUid) return (
    <div className="p-10 text-center text-slate-400 font-bold">학급을 선택해야 캐릭터를 이용할 수 있습니다.</div>
  );

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-slate-400 font-bold animate-pulse">불러오는 중...</div>
  );

  // ── 아바타샵 모드 ────────────────────────────────────────────
  if (showAvatar) {
    return (
      <div className="relative w-full h-full" style={{ minHeight: '600px' }}>
        <iframe
          id="teacher-avatar-iframe"
          src={AVATAR_URL}
          onLoad={handleIframeLoad}
          className="w-full h-full border-0"
          allow="fullscreen"
          title="아바타 꾸미기"
        />
        {isSaved && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white font-extrabold px-5 py-2.5 rounded-2xl shadow-lg text-sm z-10 animate-bounce">
            ✅ 캐릭터 저장 완료!
          </div>
        )}
        <button onClick={() => setShowAvatar(false)}
          className="absolute top-3 right-3 z-10 bg-slate-900/70 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl backdrop-blur-sm transition-colors">
          ✕ 닫기
        </button>
      </div>
    );
  }

  // ── 내 캐릭터 보기 ───────────────────────────────────────────
  return (
    <div className="min-h-full bg-slate-100 p-8 flex flex-col items-center">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-extrabold text-slate-800 mb-6 text-center">🦸 선생님 캐릭터</h1>

        {/* 캐릭터 카드 */}
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 overflow-hidden mb-4">
          <div className="h-72 bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center relative">
            {profile?.characterImage ? (
              <img
                src={profile.characterImage}
                alt="선생님 캐릭터"
                className="w-full h-full object-contain scale-[2.8] drop-shadow-md"
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <span className="text-7xl">🧑‍🏫</span>
                <p className="text-sm font-bold">아직 캐릭터가 없습니다</p>
              </div>
            )}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-4 py-1 rounded-full font-extrabold text-xs shadow">
              👑 선생님
            </div>
          </div>
        </div>

        {/* 아바타샵 버튼 */}
        <button
          onClick={() => setShowAvatar(true)}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all active:scale-95">
          ✏️ 캐릭터 꾸미기
        </button>
        <p className="text-center text-xs text-slate-400 mt-2">Unity 아바타 메이커에서 캐릭터를 꾸미고 저장하세요</p>
      </div>
    </div>
  );
}
