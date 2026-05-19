using System.Collections;
using UnityEngine;

public class CameraFollow : MonoBehaviour
{
    public static CameraFollow Instance { get; private set; }

    [Header("카메라 설정")]
    public Transform target;
    public float smoothSpeed = 5f;
    public Vector3 offset = new Vector3(0, 2f, -10f);

    [Header("맵 제한 (카메라 가두기)")]
    public float minX = -22f;
    public float maxX = 21.19f;
    public float minY = -18.38f;
    public float maxY = 7.66f;

    // ── 화면 흔들림 ───────────────────────────────────────────
    private Vector3 shakeOffset;

    public void Shake(float duration = 0.3f, float magnitude = 0.3f)
    {
        StartCoroutine(ShakeRoutine(duration, magnitude));
    }

    IEnumerator ShakeRoutine(float duration, float magnitude)
    {
        float elapsed = 0f;
        while (elapsed < duration)
        {
            float x = Random.Range(-1f, 1f) * magnitude;
            float y = Random.Range(-1f, 1f) * magnitude;
            shakeOffset = new Vector3(x, y, 0f);
            elapsed += Time.deltaTime;
            yield return null;
        }
        shakeOffset = Vector3.zero;
    }
    // ──────────────────────────────────────────────────────────

    void Awake() { Instance = this; }

    void Start()
    {
        if (target == null) return;

        // 시작할 때 목표 위치를 미리 계산하고
        Vector3 startPosition = target.position + offset;
        startPosition.x = Mathf.Clamp(startPosition.x, minX, maxX);
        startPosition.y = Mathf.Clamp(startPosition.y, minY, maxY);
        
        // 부드럽게 이동(Lerp)하지 말고, 그 위치로 즉시 꽂아버립니다!
        transform.position = startPosition; 
    }

    void LateUpdate()
    {
        if (target == null) return;

        // 1. 카메라가 원래 가야 할 목표 위치 계산
        Vector3 desiredPosition = target.position + offset;

        // 2. 목표 위치가 맵 제한 선을 넘지 못하도록 가두기
        desiredPosition.x = Mathf.Clamp(desiredPosition.x, minX, maxX);
        desiredPosition.y = Mathf.Clamp(desiredPosition.y, minY, maxY);

        // 3. 제한된 위치로 스르륵 이동 + 흔들림 오프셋 적용
        transform.position = Vector3.Lerp(transform.position, desiredPosition, smoothSpeed * Time.deltaTime) + shakeOffset;
    }
}