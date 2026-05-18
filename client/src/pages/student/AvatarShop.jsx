import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, updateDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';

function AvatarShop({ studentCode }) {
  const [myDiamonds, setMyDiamonds]     = useState(0);
  const [studentDocId, setStudentDocId] = useState(null);
  const [isReady, setIsReady]           = useState(false);   // Firebase 로딩 완료
  const [avatarSent, setAvatarSent]     = useState(false);   // Unity에 아바타 전송 여부
  const [unityLoaded, setUnityLoaded]   = useState(false);   // iframe onload 여부

  // ─── refs (이벤트 핸들러에서 최신값 접근용) ────────────────
  const diamondsRef      = useRef(0);
  const studentDocIdRef  = useRef(null);
  const savedPartsRef    = useRef(null);   // Firebase에서 불러온 parts
  const savedImageRef    = useRef(null);   // Firebase에서 불러온 characterImage
  const retryTimerRef    = useRef(null);   // 반복 전송 타이머 id
  const retryCountRef    = useRef(0);      // 반복 횟수

  useEffect(() => { diamondsRef.current    = myDiamonds;    }, [myDiamonds]);
  useEffect(() => { studentDocIdRef.current = studentDocId; }, [studentDocId]);

  // ─── Unity에 저장된 아바타 전송 ──────────────────────────
  const sendAvatarToUnity = useCallback(() => {
    if (!savedPartsRef.current) return false; // 저장된 아바타 없음

    const iframe = document.getElementById('avatar-iframe');
    if (!iframe?.contentWindow) return false;

    iframe.contentWindow.postMessage({
      type:           'REACT_LOAD_AVATAR',
      parts:          savedPartsRef.current,
      characterImage: savedImageRef.current ?? null,
    }, '*');

    console.log(`📤 [${new Date().toLocaleTimeString()}] 저장된 아바타 전송 (시도 ${retryCountRef.current + 1}회)`);
    return true;
  }, []);

  // ─── iframe 로드 후 반복 시도 시작 ───────────────────────
  const startRetry = useCallback(() => {
    if (retryTimerRef.current) return; // 이미 실행 중
    retryCountRef.current = 0;

    const MAX_RETRY = 10;
    const INTERVAL  = 2000; // 2초 간격

    retryTimerRef.current = setInterval(() => {
      if (retryCountRef.current >= MAX_RETRY) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
        console.warn('⚠️ 아바타 전송 최대 시도 횟수 초과. 수동 버튼을 사용하세요.');
        return;
      }
      sendAvatarToUnity();
      retryCountRef.current += 1;
    }, INTERVAL);
  }, [sendAvatarToUnity]);

  const stopRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // ─── Firebase 데이터 로딩 ────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        let docId = null;
        let data  = null;

        if (studentCode) {
          const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            docId = snap.docs[0].id;
            data  = snap.docs[0].data();
          } else {
            console.warn(`학생 코드 "${studentCode}"를 찾을 수 없습니다.`);
          }
        } else {
          const uid = localStorage.getItem('currentStudentUid');
          if (uid) {
            const snap = await getDoc(doc(db, 'students', uid));
            if (snap.exists()) { docId = uid; data = snap.data(); }
          }
        }

        if (docId && data) {
          setStudentDocId(docId);
          setMyDiamonds(data.diamonds ?? 0);

          // 저장된 아바타 데이터를 ref에 보관 (이후 Unity가 준비되면 전송)
          savedPartsRef.current = data.parts         ?? null;
          savedImageRef.current = data.characterImage ?? null;

          if (savedPartsRef.current) {
            console.log('💾 Firebase에서 아바타 파츠 로딩 완료. Unity 준비를 기다리는 중...');
          } else {
            console.log('💾 저장된 아바타 없음. 기본 캐릭터로 시작합니다.');
            setAvatarSent(true); // 보낼 것 없음 → 완료 처리
          }
        } else {
          setMyDiamonds(9999);
          setAvatarSent(true);
        }
      } catch (err) {
        console.error('데이터 불러오기 에러:', err);
      } finally {
        setIsReady(true);
      }
    };

    load();

    // 컴포넌트 언마운트 시 타이머 정리
    return () => stopRetry();
  }, [studentCode, stopRetry]);

  // ─── iframe이 로드되면 반복 전송 시작 ────────────────────
  const handleIframeLoad = useCallback(() => {
    setUnityLoaded(true);
    console.log('🎮 iframe 로드 완료. Unity 초기화를 기다리며 아바타 전송 시도...');
    // Unity WebGL은 iframe onload 이후에도 초기화 시간이 필요
    // → 2초 간격으로 최대 10회 재시도
    startRetry();
  }, [startRetry]);

  // ─── Unity 메시지 수신 ────────────────────────────────────
  useEffect(() => {
    const handleMessage = async (event) => {
      const msg = event.data;
      if (!msg?.type) return;

      // ── Unity 준비 완료 신호 (Unity 측에서 보내면 즉시 전송) ──
      if (msg.type === 'UNITY_READY') {
        console.log('✅ Unity READY 신호 수신. 아바타 즉시 전송.');
        stopRetry();
        sendAvatarToUnity();
      }

      // ── Unity가 아바타 수신 확인 ──────────────────────────
      if (msg.type === 'UNITY_AVATAR_LOADED') {
        console.log('✅ Unity 아바타 로딩 확인. 재시도 중단.');
        stopRetry();
        setAvatarSent(true);
      }

      // ── 구매 처리 ──────────────────────────────────────────
      if (msg.type === 'UNITY_PURCHASE') {
        const { cost, equipment, characterImage } = msg;
        const currentDiamonds = diamondsRef.current;
        const currentDocId    = studentDocIdRef.current;

        if (currentDiamonds < cost) {
          alert(`다이아가 부족합니다!\n현재: ${currentDiamonds}💎 / 필요: ${cost}💎`);
          return;
        }

        if (!window.confirm(`${cost} 다이아를 결제하시겠습니까?\n보유 다이아에서 차감됩니다.`)) return;

        if (!currentDocId) {
          alert('학생 계정을 찾을 수 없어 저장에 실패했습니다.\n교사 페이지에서 테스트 로그인 후 이용해주세요.');
          return;
        }

        const newDiamonds = currentDiamonds - cost;
        setMyDiamonds(newDiamonds);

        try {
          const updateData = { diamonds: newDiamonds, parts: equipment };
          if (characterImage) {
            updateData.characterImage = characterImage;
            savedImageRef.current     = characterImage; // ref도 최신화
          }
          if (equipment) savedPartsRef.current = equipment;

          await updateDoc(doc(db, 'students', currentDocId), updateData);
          console.log(`💾 저장 완료. 남은 다이아: ${newDiamonds}`);
          alert('성공적으로 저장되었습니다! 🎉');
        } catch (err) {
          console.error('DB 저장 에러:', err);
          setMyDiamonds(currentDiamonds);
          alert(`저장 중 오류가 발생했습니다.\n(계정: ${currentDocId})`);
        }
      }

      // ── 캐릭터 이미지 별도 저장 ────────────────────────────
      if (msg.type === 'UNITY_SAVE_CHARACTER') {
        const { parts, characterImage } = msg;
        const currentDocId = studentDocIdRef.current;
        if (!currentDocId) return;

        const updateData = {};
        if (parts)          { updateData.parts          = parts;          savedPartsRef.current = parts; }
        if (characterImage) { updateData.characterImage = characterImage; savedImageRef.current = characterImage; }

        try {
          await updateDoc(doc(db, 'students', currentDocId), updateData);
          console.log('💾 캐릭터 이미지 저장 완료');
        } catch (err) {
          console.error('캐릭터 저장 에러:', err);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sendAvatarToUnity, stopRetry]);

  // ─── 수동 전송 (버튼) ────────────────────────────────────
  const handleManualLoad = () => {
    stopRetry();
    retryCountRef.current = 0;
    const sent = sendAvatarToUnity();
    if (!sent) alert('저장된 아바타가 없습니다.');
    else {
      setAvatarSent(false);
      startRetry(); // 확인 신호 받을 때까지 재시도
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 상단 UI */}
      <div className="flex justify-between items-center px-4 py-3 border-b bg-white shadow-sm gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-slate-800">👕 아바타 상점</h2>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 아바타 불러오기 상태 표시 */}
          {isReady && savedPartsRef.current && !avatarSent && unityLoaded && (
            <span className="text-xs text-amber-600 font-bold bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200 animate-pulse">
              🔄 저장된 아바타 전송 중...
            </span>
          )}
          {isReady && savedPartsRef.current && avatarSent && (
            <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
              ✅ 저장된 아바타 로딩됨
            </span>
          )}

          {/* 수동 불러오기 버튼 */}
          {isReady && savedPartsRef.current && (
            <button
              onClick={handleManualLoad}
              className="text-xs text-indigo-600 font-bold bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full border border-indigo-200 transition-colors">
              🔄 저장된 캐릭터 불러오기
            </button>
          )}

          {studentCode && (
            <span className="text-xs text-slate-400 font-medium bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
              {studentCode}
            </span>
          )}
          {!studentDocId && isReady && (
            <span className="text-xs text-rose-500 font-bold bg-rose-50 px-3 py-1.5 rounded-full border border-rose-200">
              ⚠️ 저장 불가 (계정 미연결)
            </span>
          )}
          <div className="font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-full shadow-sm border border-blue-100">
            💎 내 다이아: {myDiamonds.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 유니티 iframe */}
      <div className="flex-1 w-full relative bg-slate-100">
        <iframe
          id="avatar-iframe"
          title="Avatar Game"
          src="/avatar_game/index.html"
          onLoad={handleIframeLoad}
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  );
}

export default AvatarShop;
