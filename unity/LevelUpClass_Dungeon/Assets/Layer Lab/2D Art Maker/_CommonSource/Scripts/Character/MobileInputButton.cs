using UnityEngine;
using UnityEngine.EventSystems;

namespace LayerLab.ArtMaker
{
    public class MobileInputButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        [Tooltip("오른쪽 버튼: 1  /  왼쪽 버튼: -1")]
        public float direction = 1f;

        public void OnPointerDown(PointerEventData eventData)
        {
            MobileInput.horizontal = direction;
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (Mathf.Approximately(MobileInput.horizontal, direction))
                MobileInput.horizontal = 0f;
        }

        void OnDisable()
        {
            if (Mathf.Approximately(MobileInput.horizontal, direction))
                MobileInput.horizontal = 0f;
        }
    }
}
