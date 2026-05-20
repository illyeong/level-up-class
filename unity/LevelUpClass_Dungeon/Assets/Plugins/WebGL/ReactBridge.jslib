mergeInto(LibraryManager.library, {

  // DemoControl.cs 링커 에러 해결용 스텁 (던전에서는 미사용)
  SendPurchaseDataToReact: function(totalCost, equipmentJsonPtr) {},

  // Unity → React: 던전 결과 전송
  SendDungeonResultToReact: function(jsonPtr) {
    var json = UTF8ToString(jsonPtr);
    window.parent.postMessage(JSON.parse(json), "*");
  },

  // React → Unity 메시지 수신 등록
  RegisterMessageListener: function(objNamePtr, funcNamePtr) {
    var objName  = UTF8ToString(objNamePtr);
    var funcName = UTF8ToString(funcNamePtr);
    window.addEventListener("message", function(event) {
      if (!event.data || !event.data.type) return;
      SendMessage(objName, funcName, JSON.stringify(event.data));
    });
  }

});
