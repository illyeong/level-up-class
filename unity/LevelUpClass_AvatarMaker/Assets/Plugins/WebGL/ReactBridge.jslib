mergeInto(LibraryManager.library, {

  // Unity → React 메시지 전송
  SendToReact: function(jsonPtr) {
    var json = UTF8ToString(jsonPtr);
    window.parent.postMessage(JSON.parse(json), "*");
  },

  // DemoControl.cs에서 호출 — 구매 데이터를 React로 전송
  SendPurchaseDataToReact: function(totalCost, equipmentJsonPtr) {
    var equipmentJson = UTF8ToString(equipmentJsonPtr);
    window.parent.postMessage({
      type: "UNITY_PURCHASE",
      cost: totalCost,
      equipment: JSON.parse(equipmentJson)
    }, "*");
  },

  // 캐릭터 이미지 + 파츠를 React로 전송 (구매 완료 후 스크린샷)
  SendCharacterDataToReact: function(partsJsonPtr, imageBase64Ptr) {
    var partsJson   = UTF8ToString(partsJsonPtr);
    var imageBase64 = UTF8ToString(imageBase64Ptr);
    window.parent.postMessage({
      type: "UNITY_SAVE_CHARACTER",
      parts: JSON.parse(partsJson),
      characterImage: imageBase64
    }, "*");
  },

  // React → Unity 메시지 수신 등록
  RegisterMessageListener: function(objNamePtr, funcNamePtr) {
    var objName  = UTF8ToString(objNamePtr);
    var funcName = UTF8ToString(funcNamePtr);
    window.addEventListener("message", function(event) {
      if (!event.data || !event.data.type) return;
      unityInstance.SendMessage(objName, funcName, JSON.stringify(event.data));
    });
  }

});
