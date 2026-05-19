using UnityEngine;

/// <summary>
/// 보상 텍스트가 위로 떠오르다 사라지는 컴포넌트.
/// RewardTextPrefab에 붙여 사용.
/// </summary>
public class RewardFloater : MonoBehaviour
{
    public float moveSpeed = 1.5f;
    public float lifeTime  = 2.5f;

    void Start()
    {
        Destroy(gameObject, lifeTime);
    }

    void Update()
    {
        transform.Translate(Vector3.up * moveSpeed * Time.unscaledDeltaTime);
    }
}
