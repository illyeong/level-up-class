import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase'; // ⚠️ 실제 firebase.js 경로에 맞게 수정해주세요!

function AvatarRoom() {
  // 선생님의 DB 연동 전 임시 테스트용 초기 다이아 (초기값 0, DB에서 불러올 예정)
  const [myDiamonds, setMyDiamonds] = useState(0);
  
  // iframe 요소에 접근하기 위한 Ref
  const iframeRef = useRef(null);

  // 현재 로그인한 학생의 UID (임시로 test_student_01 지정. 나중엔 로그인 정보에서 가져옴)
  const studentUid = localStorage.getItem('currentStudentUid') || "test_student_01";

  // =====================================================================
  // [목표 2] 접속 시 DB에서 데이터 불러오기 및 유니티로 전송 (역방향 통신)
  // =====================================================================
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const docRef = doc(db, "students", studentUid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setMyDiamonds(data.diamonds); // DB에서 불러온 다이아 적용
          
          console.log("📥 DB 데이터 불러오기 성공:", data);

          // 유니티(iframe)로 아바타 파츠 데이터 보내기
          // (주의: 유니티가 완전히 로드된 후 메시지를 받는 것이 가장 안전합니다)
          if (iframeRef.current && data.parts) {
            iframeRef.current.contentWindow.postMessage({
              type: "REACT_LOAD_AVATAR",
              parts: data.parts
            }, "*");
          }
        } else {
          console.log("학생 데이터가 없습니다. (새 계정)");
          // 새 계정이면 기본 다이아 9999로 세팅해줄 수도 있습니다.
          setMyDiamonds(9999);
        }
      } catch (error) {
        console.error("데이터 불러오기 에러:", error);
      }
    };

    loadUserData();
  }, [studentUid]);


  // =====================================================================
  // [목표 1] 유니티 결제 신호 수신 시 -> 다이아 차감 및 DB 영구 저장
  // =====================================================================
  useEffect(() => {
    const handleUnityMessage = (event) => {
      if (event.data && event.data.type === "UNITY_PURCHASE") {
        const { cost, equipment } = event.data;
        console.log("🔥 유니티 결제 신호 도착! 비용:", cost, "장비:", equipment);

        // React 최신 상태(prevDiamonds)를 가져와서 계산
        setMyDiamonds((prevDiamonds) => {
          const newDiamonds = prevDiamonds - cost;

          // 상태 업데이트와 동시에 DB에도 즉시 저장
          const saveUserData = async () => {
            try {
              const docRef = doc(db, "students", studentUid);
              await updateDoc(docRef, {
                diamonds: newDiamonds,    // 차감된 다이아몬드
                parts: equipment          // 현재 장착중인 아바타 파츠 JSON
              });
              
              console.log(`💾 DB 영구 저장 완료! 남은 다이아: ${newDiamonds}`);
              alert(`저장 완료! ${cost} 다이아가 차감되었습니다.`);
            } catch (error) {
              console.error("DB 저장 에러:", error);
              alert("데이터 저장에 실패했습니다. 인터넷 연결을 확인해주세요.");
            }
          };
          
          saveUserData(); // 비동기 함수 실행
          return newDiamonds; // React 화면에 보여줄 다이아 값 업데이트
        });
      }
    };

    window.addEventListener("message", handleUnityMessage);
    return () => {
      window.removeEventListener("message", handleUnityMessage);
    };
  }, [studentUid]); // 의존성 배열에 studentUid 추가

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 🌟 상단 다이아 UI */}
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-xl font-bold text-slate-800">👕 아바타 상점</h2>
        <div className="font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-full">
          💎 내 다이아: {myDiamonds.toLocaleString()}
        </div>
      </div>

      {/* 🌟 유니티 iframe 화면 */}
      <div className="flex-1 w-full relative">
        <iframe
          ref={iframeRef} /* Ref 연결! */
          title="Avatar Game"
          src="/avatar_game/index.html" 
          style={{ width: "100%", height: "100%", border: "none" }}
        />
      </div>
    </div>
  );
}

export default AvatarRoom;