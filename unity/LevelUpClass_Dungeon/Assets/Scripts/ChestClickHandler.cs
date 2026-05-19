using UnityEngine;

/// <summary>
/// IronChest 프리팹에 런타임으로 추가되는 클릭 핸들러.
/// OnMouseDown으로 클릭 감지 → GameResultUI에 전달.
/// </summary>
public class ChestClickHandler : MonoBehaviour
{
    [HideInInspector] public int chestIndex;
    [HideInInspector] public bool opened = false;

    void OnMouseDown()
    {
        if (opened) return;
        GameResultUI.Instance?.OnChestClick(chestIndex);
    }
}
