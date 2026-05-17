using UnityEngine;

public class CameraFollow : MonoBehaviour
{
    [Header("카메라 설정")]
    public Transform target; 
    public float smoothSpeed = 5f; 
    public Vector3 offset = new Vector3(0, 2f, -10f); 

    [Header("맵 제한 (카메라 가두기)")]
    // 올려주신 사진의 수치를 기본값으로 세팅했습니다!
    public float minX = -22f; 
    public float maxX = 21.19f;  
    public float minY = -18.38f;  
    public float maxY = 7.66f;   

    // 🔥 여기가 새로 추가된 핵심입니다! (게임 시작 시 순간이동)
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

        // 3. 제한된 위치로 스르륵 이동
        transform.position = Vector3.Lerp(transform.position, desiredPosition, smoothSpeed * Time.deltaTime);
    }
}