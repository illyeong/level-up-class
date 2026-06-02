import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, updateDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  COSMETIC_SECTIONS,
  getEquippedCosmetics,
  getOwnedCosmetics,
} from '../../data/avatarCosmetics';

function AvatarShop({ studentCode, defaultTab = 'avatar' }) {
  const [myDiamonds, setMyDiamonds]     = useState(0);
  const [myGold, setMyGold]             = useState(0);
  const [studentDocId, setStudentDocId] = useState(null);
  const [activeTab, setActiveTab]       = useState(defaultTab);
  const [ownedCosmetics, setOwnedCosmetics]       = useState(getOwnedCosmetics());
  const [equippedCosmetics, setEquippedCosmetics] = useState(getEquippedCosmetics());
  const [isReady, setIsReady]           = useState(false);
  const [avatarSent, setAvatarSent]     = useState(false);
  const [unityLoaded, setUnityLoaded]   = useState(false);
  const [unityReady, setUnityReady]     = useState(false);

  // ─── refs ────────────────────────────────────────────────
  const diamondsRef      = useRef(0);
  const goldRef          = useRef(0);
  const studentDocIdRef  = useRef(null);
  const savedPartsRef    = useRef(null);
  const savedColorsRef   = useRef(null);   // Firebase에서 불러온 colors
  const savedImageRef    = useRef(null);
  const retryTimerRef    = useRef(null);   // 반복 전송 타이머 id
  const retryCountRef    = useRef(0);      // 반복 횟수

  useEffect(() => { diamondsRef.current    = myDiamonds;    }, [myDiamonds]);
  useEffect(() => { goldRef.current        = myGold;        }, [myGold]);
  useEffect(() => { studentDocIdRef.current = studentDocId; }, [studentDocId]);

  // ─── Unity에 저장된 아바타 전송 ──────────────────────────
  const sendAvatarToUnity = useCallback(() => {
    if (!savedPartsRef.current) return false; // 저장된 아바타 없음

    const iframe = document.getElementById('avatar-iframe');
    if (!iframe?.contentWindow) return false;

    iframe.contentWindow.postMessage({
      type:           'REACT_LOAD_AVATAR',
      parts:          savedPartsRef.current,
      colors:         savedColorsRef.current ?? null,
      characterImage: savedImageRef.current  ?? null,
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
          setMyGold(data.gold ?? 0);
          setOwnedCosmetics(getOwnedCosmetics(data.ownedCosmetics));
          setEquippedCosmetics(getEquippedCosmetics(data.equippedCosmetics));

          // 저장된 아바타 데이터를 ref에 보관 (이후 Unity가 준비되면 전송)
          savedPartsRef.current   = data.parts          ?? null;
          savedColorsRef.current  = data.colors         ?? null;
          savedImageRef.current   = data.characterImage ?? null;

          if (savedPartsRef.current) {
            console.log('💾 Firebase에서 아바타 파츠 로딩 완료. Unity 준비를 기다리는 중...');
          } else {
            console.log('💾 저장된 아바타 없음. 기본 캐릭터로 시작합니다.');
            setAvatarSent(true); // 보낼 것 없음 → 완료 처리
          }
        } else {
          setMyDiamonds(9999);
          setMyGold(9999);
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
    // UNITY_READY 메시지가 늦거나 누락되는 빌드 대비용 fallback
    setTimeout(() => setUnityReady(true), 4500);
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
        setUnityReady(true);
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
        const { parts, colors, characterImage } = msg;
        const currentDocId = studentDocIdRef.current;
        if (!currentDocId) return;

        const updateData = {};
        if (parts)          { updateData.parts          = parts;          savedPartsRef.current  = parts; }
        if (colors)         { updateData.colors         = colors;         savedColorsRef.current = colors; }
        if (characterImage) { updateData.characterImage = characterImage; savedImageRef.current  = characterImage; }

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

  const handleBuyOrEquipCosmetic = async (item) => {
    const currentDocId = studentDocIdRef.current;
    if (!currentDocId) {
      alert('학생 계정을 불러온 뒤 이용해주세요.');
      return;
    }

    const safeOwned = getOwnedCosmetics(ownedCosmetics);
    const safeEquipped = getEquippedCosmetics(equippedCosmetics);
    const isOwned = safeOwned[item.type]?.includes(item.id);
    const equipKey = item.type === 'frames' ? 'frame' : 'background';

    if (isOwned) {
      const nextEquipped = { ...safeEquipped, [equipKey]: item.id };
      setEquippedCosmetics(nextEquipped);
      try {
        await updateDoc(doc(db, 'students', currentDocId), { equippedCosmetics: nextEquipped });
      } catch (err) {
        console.error('꾸미기 아이템 장착 오류:', err);
        setEquippedCosmetics(safeEquipped);
        alert('장착 저장 중 오류가 발생했습니다.');
      }
      return;
    }

    if (item.costType === 'gold' && goldRef.current < item.cost) {
      alert(`골드가 부족합니다.\n현재: ${goldRef.current.toLocaleString()}G / 필요: ${item.cost.toLocaleString()}G`);
      return;
    }

    if (item.costType === 'diamond' && diamondsRef.current < item.cost) {
      alert(`다이아가 부족합니다.\n현재: ${diamondsRef.current.toLocaleString()}개 / 필요: ${item.cost.toLocaleString()}개`);
      return;
    }

    const nextOwned = {
      ...safeOwned,
      [item.type]: [...safeOwned[item.type], item.id],
    };
    const nextEquipped = { ...safeEquipped, [equipKey]: item.id };
    const updateData = {
      ownedCosmetics: nextOwned,
      equippedCosmetics: nextEquipped,
    };

    if (item.costType === 'gold') {
      const nextGold = goldRef.current - item.cost;
      updateData.gold = nextGold;
      setMyGold(nextGold);
    }

    if (item.costType === 'diamond') {
      const nextDiamonds = diamondsRef.current - item.cost;
      updateData.diamonds = nextDiamonds;
      setMyDiamonds(nextDiamonds);
    }

    setOwnedCosmetics(nextOwned);
    setEquippedCosmetics(nextEquipped);

    try {
      await updateDoc(doc(db, 'students', currentDocId), updateData);
    } catch (err) {
      console.error('꾸미기 아이템 저장 오류:', err);
      setOwnedCosmetics(safeOwned);
      setEquippedCosmetics(safeEquipped);
      setMyGold(goldRef.current);
      setMyDiamonds(diamondsRef.current);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const renderCosmeticCard = (item) => {
    const safeOwned = getOwnedCosmetics(ownedCosmetics);
    const safeEquipped = getEquippedCosmetics(equippedCosmetics);
    const isOwned = safeOwned[item.type]?.includes(item.id);
    const equipKey = item.type === 'frames' ? 'frame' : 'background';
    const isEquipped = safeEquipped[equipKey] === item.id;
    const priceLabel = item.costType === 'free'
      ? '기본 지급'
      : item.costType === 'gold'
        ? `${item.cost.toLocaleString()}G`
        : `다이아 ${item.cost.toLocaleString()}개`;

    return (
      <div key={item.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4">
          <div
            className="relative h-28 rounded-2xl overflow-hidden flex items-center justify-center"
            style={item.style}
          >
            {item.floorStyle && (
              <div className="absolute left-1/2 bottom-5 -translate-x-1/2 w-24 h-6 rounded-full" style={item.floorStyle} />
            )}
            <div className={`relative z-10 w-14 h-16 rounded-2xl ${item.dark ? 'bg-white/20' : 'bg-white/70'} shadow-lg flex items-center justify-center text-2xl`}>
              🧑‍🚀
            </div>
            {isEquipped && (
              <div className="absolute right-2 top-2 bg-emerald-500 text-white text-[11px] font-extrabold px-2 py-1 rounded-full">
                장착 중
              </div>
            )}
          </div>

          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-slate-800">{item.name}</h4>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{item.rarity}</span>
              </div>
              <p className="text-xs text-slate-500 font-semibold mt-1 leading-relaxed">{item.description}</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => handleBuyOrEquipCosmetic(item)}
          disabled={isEquipped}
          className={`w-full py-3 text-sm font-extrabold transition-colors
            ${isEquipped
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : isOwned
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
        >
          {isEquipped ? '장착 중' : isOwned ? '장착하기' : `${priceLabel} 구매`}
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-white" style={{ height: 'calc(100vh - 88px)' }}>
      {/* 상단 UI */}
      <div className="flex justify-between items-center px-3 py-2 border-b bg-white shadow-sm gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-slate-800">👕 아바타 상점</h2>
          <div className="flex bg-slate-100 rounded-2xl p-1 border border-slate-200">
            <button
              onClick={() => setActiveTab('avatar')}
              className={`px-4 py-2 rounded-xl text-sm font-extrabold transition-colors ${activeTab === 'avatar' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              아바타 룸
            </button>
            <button
              onClick={() => setActiveTab('cosmetics')}
              className={`px-4 py-2 rounded-xl text-sm font-extrabold transition-colors ${activeTab === 'cosmetics' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              꾸미기 상점
            </button>
          </div>
        </div>

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
          <div className="font-bold text-amber-600 bg-amber-50 px-4 py-2 rounded-full shadow-sm border border-amber-100">
            🪙 내 골드: {myGold.toLocaleString()}
          </div>
        </div>
      </div>

      {activeTab === 'avatar' ? (
        <div className="flex-1 w-full relative bg-slate-100">
          <iframe
            id="avatar-iframe"
            title="Avatar Game"
            src="/avatar_game/index.html"
            onLoad={handleIframeLoad}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
          {(!unityLoaded || !unityReady) && (
            <div className="absolute inset-0 z-20 bg-slate-950/90 flex items-center justify-center">
              <div className="text-center px-6">
                <div className="mx-auto mb-4 w-10 h-10 border-4 border-indigo-300/30 border-t-indigo-400 rounded-full animate-spin" />
                <p className="text-white font-extrabold text-lg">아바타 룸 로딩 중...</p>
                <p className="text-slate-300 text-sm mt-1">유니티 엔진을 준비하고 있습니다</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-5 md:p-7">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="bg-slate-900 rounded-3xl p-5 md:p-6 text-white shadow-sm">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                  <p className="text-sm font-extrabold text-indigo-200">프로필 꾸미기</p>
                  <h3 className="text-2xl font-black mt-1">프레임과 CSS 배경을 구매하고 장착하세요</h3>
                  <p className="text-sm text-slate-300 mt-2">
                    장착한 효과는 학생 대시보드와 내 캐릭터 카드에 바로 반영됩니다.
                  </p>
                </div>
                <div className="flex gap-2 text-sm font-extrabold">
                  <span className="bg-white/10 border border-white/15 rounded-2xl px-4 py-2">🪙 {myGold.toLocaleString()}G</span>
                  <span className="bg-white/10 border border-white/15 rounded-2xl px-4 py-2">💎 {myDiamonds.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {COSMETIC_SECTIONS.map(section => (
              <section key={section.key} className="space-y-3">
                <div>
                  <h3 className="text-xl font-black text-slate-900">{section.title}</h3>
                  <p className="text-sm text-slate-500 font-semibold mt-1">{section.description}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {section.items.map(renderCosmeticCard)}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AvatarShop;
