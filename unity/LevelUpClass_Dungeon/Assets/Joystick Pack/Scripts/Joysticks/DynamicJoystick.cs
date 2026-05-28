using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

public class DynamicJoystick : Joystick
{
    public float MoveThreshold { get { return moveThreshold; } set { moveThreshold = Mathf.Abs(value); } }

    [SerializeField] private float moveThreshold = 1;

    protected override void Start()
    {
        MoveThreshold = moveThreshold;
        base.Start();
        background.gameObject.SetActive(false);
    }

    [SerializeField] private bool restrictToSelf = true; // 컴포넌트 RectTransform 범위 안에서만 반응

    public override void OnPointerDown(PointerEventData eventData)
    {
        // restrictToSelf: DynamicJoystick GameObject 자체 RectTransform 영역 밖 터치 무시
        if (restrictToSelf)
        {
            Camera c = (canvas != null && canvas.renderMode == RenderMode.ScreenSpaceCamera)
                ? canvas.worldCamera : null;
            var rt = GetComponent<UnityEngine.RectTransform>();
            if (rt != null && !RectTransformUtility.RectangleContainsScreenPoint(rt, eventData.position, c))
                return;
        }
        background.anchoredPosition = ScreenPointToAnchoredPosition(eventData.position);
        background.gameObject.SetActive(true);
        base.OnPointerDown(eventData);
    }

    public override void OnPointerUp(PointerEventData eventData)
    {
        background.gameObject.SetActive(false);
        base.OnPointerUp(eventData);
    }

    protected override void HandleInput(float magnitude, Vector2 normalised, Vector2 radius, Camera cam)
    {
        if (magnitude > moveThreshold)
        {
            Vector2 difference = normalised * (magnitude - moveThreshold) * radius;
            background.anchoredPosition += difference;
        }
        base.HandleInput(magnitude, normalised, radius, cam);
    }
}