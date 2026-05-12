import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase'; // ⚠️ 실제 firebase.js 경로 확인!

function AvatarShop() {
  const [myDiamonds, setMyDiamonds] = useState(0);
  const studentUid = localStorage.getItem('currentStudentUid') || "test_student_01";

  // =====================================================================
  // [목표 2] 접속 시 DB에서 데이터 불러오기 및 유니티로 전송
  // =====================================================================
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const docRef = doc(db, "students", studentUid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setMyDiamonds(data.diamonds); 
          console.log("📥 DB 데이터 불러오기 성공:", data);

          const iframe = document.getElementById("avatar-iframe");
          if (iframe && data.parts) {
            iframe.contentWindow.postMessage({
              type: "REACT_LOAD_AVATAR",
              parts: data.parts
            }, "*");
          }
        } else {
          setMyDiamonds(9999);
        }
      } catch (error) {
        console.error("데이터 불러오기 에러:", error);
      }
    };

    loadUserData();
  }, [studentUid]);


  // =====================================================================
  // [목표 1] 유니티 결제 신호 수신 시 -> 팝업 확인 -> 다이아 차감 및 DB 저장
  // =====================================================================
  useEffect(() => {
    const handleUnityMessage = (event) => {
      if (event.data && event.data.type === "UNITY_PURCHASE") {
        const { cost, equipment } = event.data;
        
        // 1️⃣ 보유 다이아 부족 여부 확인
        if (myDiamonds < cost) {
          alert(`다이아가 부족합니다! (현재: ${myDiamonds}💎 / 필요: ${cost}💎)`);
          return; // 결제 진행 안 함
        }

        // 2️⃣ 결제 의사 재확인 (브라우저 기본 팝업)
        const isConfirmed = window.confirm(
          `${cost} 다이아를 결제하시겠습니까?\n보유 중인 다이아에서 차감됩니다.`
        );

        if (!isConfirmed) {
          console.log("결제가 취소되었습니다.");
          return; // 취소 클릭 시 함수 종료
        }

        // 3️⃣ 결제 진행 및 DB 저장
        setMyDiamonds((prevDiamonds) => {
          const newDiamonds = prevDiamonds - cost;

          updateDoc(doc(db, "students", studentUid), {
            diamonds: newDiamonds,    
            parts: equipment          
          }).then(() => {
            console.log(`💾 DB 영구 저장 완료! 남은 다이아: ${newDiamonds}`);
            alert(`성공적으로 저장되었습니다! 🎉`);
          }).catch((error) => {
            console.error("DB 저장 에러:", error);
            alert("저장 중 오류가 발생했습니다.");
          });
          
          return newDiamonds; 
        });
      }
    };

    window.addEventListener("message", handleUnityMessage);
    return () => {
      window.removeEventListener("message", handleUnityMessage);
    };
  }, [studentUid, myDiamonds]); // 👈 myDiamonds를 의존성에 추가하여 최신 잔액을 검사하도록 함

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 상단 다이아 UI */}
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-xl font-bold text-slate-800">👕 아바타 상점</h2>
        <div className="font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-full shadow-sm">
          💎 내 다이아: {myDiamonds.toLocaleString()}
        </div>
      </div>

      {/* 유니티 iframe 화면 */}
      <div className="flex-1 w-full relative bg-slate-100">
        <iframe
          id="avatar-iframe"
          title="Avatar Game"
          src="/avatar_game/index.html" 
          style={{ width: "100%", height: "100%", border: "none" }}
        />
      </div>
    </div>
  );
}

export default AvatarShop;