using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// 플레이어가 Trigger 영역에 닿으면 지정된 씬으로 이동한다.
/// GameObject에 BoxCollider2D(Is Trigger ✓)를 함께 달아준다.
/// </summary>
public class PortalTrigger : MonoBehaviour
{
    [Header("이동할 씬 이름 (GameManager 상수 참고)")]
    [SerializeField] private string targetScene = GameManager.SceneStage1;

    [Header("포탈 활성화 여부")]
    [SerializeField] private bool isActive = true;

    [Header("포탈 이펙트 (선택)")]
    [SerializeField] private GameObject portalEffect;

    void OnEnable()
    {
        if (portalEffect != null)
            portalEffect.SetActive(true);
    }

    void OnDisable()
    {
        if (portalEffect != null)
            portalEffect.SetActive(false);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (!isActive) return;
        if (!other.CompareTag("Player")) return;

        // 씬 이동 전 현재 체력을 GameManager에 저장
        if (GameManager.Instance != null)
        {
            var pc = other.GetComponent<LayerLab.ArtMaker.PlayerCombat>();
            if (pc != null)
                GameManager.Instance.SyncHealth(pc.currentHealth);
        }

        SceneManager.LoadScene(targetScene);
    }

    // 에디터에서 포탈 범위를 시각적으로 확인할 수 있도록 기즈모 표시
    void OnDrawGizmosSelected()
    {
        BoxCollider2D box = GetComponent<BoxCollider2D>();
        if (box == null) return;

        Gizmos.color = new Color(0.2f, 0.9f, 1f, 0.4f);
        Gizmos.DrawCube(transform.position + (Vector3)box.offset, box.size);
        Gizmos.color = new Color(0.2f, 0.9f, 1f, 1f);
        Gizmos.DrawWireCube(transform.position + (Vector3)box.offset, box.size);
    }
}
