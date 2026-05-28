using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

public class FixedJoystick : Joystick
{
    // 조이스틱 background 이미지 영역 바깥 터치는 무시
    public override void OnPointerDown(PointerEventData eventData)
    {
        if (!IsPointerOverBackground(eventData)) return;
        base.OnPointerDown(eventData);
    }
}