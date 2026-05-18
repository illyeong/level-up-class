import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';

function AvatarShop({ studentCode }) {
  const [myDiamonds, setMyDiamonds] = useState(0);
  const [studentDocId, setStudentDocId] = useState(null);
  const [isReady, setIsReady] = useState(false);

  // ref로 최신값 유지 (이벤트 핸들러 클로저 문제 방지)
  const diamondsRef    = useRef(0);
  const studentDocIdRef = useRef(null);

  useEffect(() => { diamondsRef.current    = myDiamonds;    }, [myDiamonds]);
  useEffect(() => { studentDocIdRef.current = studentDocId; }, [studentDocId]);

  // ───────────────────────────────────────────────────────────
  // 학생 데이터 로딩 (studentCode → Firestore docId 해석)
  // ───────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        let docId = null;
        let data  = null;

        if (studentCode) {
          // studentCode (예: "SINSEOK-5-01")로 실제 문서 ID 찾기
          const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            docId = snap.docs[0].id;
            data  = snap.docs[0].data();
          } else {
            console.warn(`학생 코드 "${studentCode}"에 해당하는 계정을 찾을 수 없습니다.`);
          }
        } else {
          // fallback: localStorage에서 직접 docId 읽기
          const uid = localStorage.getItem('currentStudentUid');
          if (uid) {
            const snap = await getDoc(doc(db, 'students', uid));
            if (snap.exists()) { docId = uid; data = snap.data(); }
          }
        }

        if (docId && data) {
          setStudentDocId(docId);
          setMyDiamonds(data.diamonds ?? 0);

          // 저장된 아바타 파츠 → 유니티 iframe으로 전송
          setTimeout(() => {
            const iframe = document.getElementById('avatar-iframe');
            if (iframe?.contentWindow && data.parts) {
              iframe.contentWindow.postMessage({
                type: 'REACT_LOAD_AVATAR',
                parts:          data.parts,
                characterImage: data.characterImage ?? null,
              }, '*');
            }
          }, 1500); // iframe 로딩 대기
        } else {
          // 학생 계정 없음 → 임시 다이아 9999 (저장 불가)
          setMyDiamonds(9999);
        }
      } catch (err) {
        console.error('데이터 불러오기 에러:', err);
      } finally {
        setIsReady(true);
      }
    };

    load();
  }, [studentCode]);

  // ───────────────────────────────────────────────────────────
  // 유니티 메시지 수신 (구매 / 캐릭터 저장)
  // ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handleMessage = async (event) => {
      const msg = event.data;
      if (!msg?.type) return;

      // ── 구매 처리 ──────────────────────────────────────────
      if (msg.type === 'UNITY_PURCHASE') {
        const { cost, equipment, characterImage } = msg;
        const currentDiamonds = diamondsRef.current;
        const currentDocId    = studentDocIdRef.current;

        if (currentDiamonds < cost) {
          alert(`다이아가 부족합니다!\n현재: ${currentDiamonds}💎 / 필요: ${cost}💎`);
          return;
        }

        if (!window.confirm(`${cost} 다이아를 결제하시겠습니까?\n보유 다이아에서 차감됩니다.`)) {
          console.log('결제 취소됨');
          return;
        }

        if (!currentDocId) {
          alert('학생 계정을 찾을 수 없어 저장에 실패했습니다.\n교사 페이지에서 테스트 로그인 후 이용해주세요.');
          return;
        }

        const newDiamonds = currentDiamonds - cost;
        setMyDiamonds(newDiamonds); // UI 즉시 반영

        try {
          const updateData = {
            diamonds: newDiamonds,
            parts:    equipment,
          };
          // 유니티가 캐릭터 이미지(base64)를 함께 보낸 경우 저장
          if (characterImage) updateData.characterImage = characterImage;

          await updateDoc(doc(db, 'students', currentDocId), updateData);
          console.log(`💾 저장 완료. 남은 다이아: ${newDiamonds}`);
          alert('성공적으로 저장되었습니다! 🎉');
        } catch (err) {
          console.error('DB 저장 에러:', err);
          setMyDiamonds(currentDiamonds); // 실패 시 롤백
          alert(`저장 중 오류가 발생했습니다.\n(계정: ${currentDocId})`);
        }
      }

      // ── 캐릭터 이미지만 별도 저장 (UNITY_SAVE_CHARACTER) ───
      if (msg.type === 'UNITY_SAVE_CHARACTER') {
        const { parts, characterImage } = msg;
        const currentDocId = studentDocIdRef.current;
        if (!currentDocId) return;

        try {
          const updateData = {};
          if (parts)          updateData.parts          = parts;
          if (characterImage) updateData.characterImage = characterImage;
          await updateDoc(doc(db, 'students', currentDocId), updateData);
          console.log('💾 캐릭터 이미지 저장 완료');
        } catch (err) {
          console.error('캐릭터 저장 에러:', err);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []); // ref 사용으로 의존성 불필요

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 상단 UI */}
      <div className="flex justify-between items-center p-4 border-b bg-white shadow-sm">
        <h2 className="text-xl font-bold text-slate-800">👕 아바타 상점</h2>
        <div className="flex items-center gap-3">
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
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  );
}

export default AvatarShop;
