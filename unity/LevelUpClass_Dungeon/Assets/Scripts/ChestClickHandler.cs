using System.Collections;
using UnityEngine;
using UnityEngine.EventSystems;

/// <summary>
/// IronChest 클릭 감지.
/// Main Camera에 Physics2DRaycaster 컴포넌트가 필요합니다.
/// </summary>
public class ChestClickHandler : MonoBehaviour, IPointerClickHandler, IPointerEnterHandler, IPointerExitHandler
{
    [HideInInspector] public int  chestIndex;
    [HideInInspector] public bool opened = false;

    private Vector3 basePosition;
    private Vector3 baseScale;
    private float bobPhase;
    private bool presentationReady;
    private bool introPlaying;
    private bool hovered;
    private bool selected;

    public void InitializePresentation(float delay)
    {
        basePosition = transform.position;
        baseScale = transform.localScale;
        bobPhase = chestIndex * 1.7f;
        transform.localScale = Vector3.zero;
        StartCoroutine(PlayIntro(delay));
    }

    IEnumerator PlayIntro(float delay)
    {
        introPlaying = true;
        if (delay > 0f)
            yield return new WaitForSeconds(delay);

        float elapsed = 0f;
        const float duration = 0.38f;
        while (elapsed < duration)
        {
            elapsed += Time.deltaTime;
            float t = Mathf.Clamp01(elapsed / duration);
            float overshoot = 1f + Mathf.Sin(t * Mathf.PI) * 0.12f;
            transform.localScale = baseScale * (Mathf.SmoothStep(0f, 1f, t) * overshoot);
            yield return null;
        }

        transform.localScale = baseScale;
        introPlaying = false;
        presentationReady = true;
    }

    void Update()
    {
        if (!presentationReady || selected) return;

        transform.position = basePosition + Vector3.up * (Mathf.Sin(Time.time * 2f + bobPhase) * 0.12f);
        if (!introPlaying)
        {
            Vector3 targetScale = baseScale * (hovered ? 1.12f : 1f);
            transform.localScale = Vector3.Lerp(transform.localScale, targetScale, Time.deltaTime * 12f);
        }
    }

    public void OnPointerClick(PointerEventData eventData)
    {
        if (opened) return;
        GameResultUI.Instance?.OnChestClick(chestIndex);
    }

    public void OnPointerEnter(PointerEventData eventData) => hovered = true;
    public void OnPointerExit(PointerEventData eventData) => hovered = false;

    public void MarkSelected()
    {
        selected = true;
        transform.position = basePosition + Vector3.up * 0.2f;
        transform.localScale = baseScale * 1.18f;
    }

    public void MarkUnselected()
    {
        selected = true;
        transform.position = basePosition;
        transform.localScale = baseScale * 0.92f;
    }
}
