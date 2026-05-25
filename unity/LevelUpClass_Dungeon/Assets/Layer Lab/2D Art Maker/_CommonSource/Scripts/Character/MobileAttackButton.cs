using UnityEngine;
using UnityEngine.EventSystems;
using LayerLab.ArtMaker;

/// <summary>
/// 공격 버튼 UI에 붙이면 OnPointerDown 시 MobileInput.isAttackPressed를 1프레임 true로 설정.
/// FloatingJoystick과 공격 입력 충돌 문제를 전용 버튼으로 해결합니다.
/// </summary>
public class MobileAttackButton : MonoBehaviour, IPointerDownHandler
{
    public void OnPointerDown(PointerEventData eventData)
    {
        MobileInput.isAttackPressed = true;
    }

    void LateUpdate()
    {
        MobileInput.isAttackPressed = false;
    }
}
