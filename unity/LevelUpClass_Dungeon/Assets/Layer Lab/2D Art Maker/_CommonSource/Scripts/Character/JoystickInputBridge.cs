using UnityEngine;
using UnityEngine.EventSystems;
using LayerLab.ArtMaker;

/// <summary>
/// 조이스틱 오브젝트에 추가하면 터치 시작/끝을 MobileInput.isJoystickActive에 반영.
/// PlayerCombat이 조이스틱 터치 중 공격 입력을 무시하도록 합니다.
/// </summary>
public class JoystickInputBridge : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
{
    public void OnPointerDown(PointerEventData eventData)
    {
        MobileInput.isJoystickActive = true;
    }

    public void OnPointerUp(PointerEventData eventData)
    {
        MobileInput.isJoystickActive = false;
    }

    void OnDisable()
    {
        MobileInput.isJoystickActive = false;
    }
}
