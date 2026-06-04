mergeInto(LibraryManager.library, {

  // DemoControl.cs 링커 에러 해결용 스텁 (던전에서는 미사용)
  SendPurchaseDataToReact: function(totalCost, equipmentJsonPtr) {},

  // HTML 오버레이 컨트롤(조이스틱·공격존) 활성/비활성
  // enabled = 1 → 활성, 0 → 비활성 (보상창/결과창 표시 중에는 0으로 설정)
  SetHtmlControlsEnabled: function(enabled) {
    var state = enabled ? 'auto' : 'none';
    var ids = ['joy-zone', 'tap-attack-zone', 'btn-attack'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) el.style.pointerEvents = state;
    }
  },

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
      var json = JSON.stringify(event.data);
      SendMessage(objName, funcName, json);
      // 캐릭터 로더도 동시에 수신
      try { SendMessage("DungeonCharacterLoader", "OnReceiveMessage", json); } catch(e) {}
    });
  }

});
