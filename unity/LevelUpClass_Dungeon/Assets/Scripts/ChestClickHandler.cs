using UnityEngine;
using UnityEngine.EventSystems;

/// <summary>
/// IronChest 클릭 감지.
/// Main Camera에 Physics2DRaycaster 컴포넌트가 필요합니다.
/// </summary>
public class ChestClickHandler : MonoBehaviour, IPointerClickHandler
{
    [HideInInspector] public int  chestIndex;
    [HideInInspector] public bool opened = false;

    public void OnPointerClick(PointerEventData eventData)
    {
        if (opened) return;
        GameResultUI.Instance?.OnChestClick(chestIndex);
    }
}
