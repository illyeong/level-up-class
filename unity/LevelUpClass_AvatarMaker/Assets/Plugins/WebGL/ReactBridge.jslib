mergeInto(LibraryManager.library, {
  SendPurchaseDataToReact: function (totalCost, equipmentJson) {
    try {
      var jsonData = UTF8ToString(equipmentJson);
      // iframe 안에 있는 유니티가 부모 창(React)을 향해 데이터를 쏘아 올립니다!
      window.parent.postMessage({
        type: "UNITY_PURCHASE",
        cost: totalCost,
        equipment: jsonData
      }, "*");
    } catch (e) {
      console.warn("React로 메시지를 보내지 못했습니다.", e);
    }
  }
});