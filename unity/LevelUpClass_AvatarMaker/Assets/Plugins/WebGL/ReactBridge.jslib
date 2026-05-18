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
