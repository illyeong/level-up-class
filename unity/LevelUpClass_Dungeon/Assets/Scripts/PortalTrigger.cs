using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// 플레이어가 Trigger 영역에 닿으면 지정된 씬으로 이동한다.
/// GameObject에 BoxCollider2D(Is Trigger ✓)를 함께 달아준다.
/// </summary>
public class PortalTrigger : MonoBehaviour
{
    [Header("이동할 씬 이름 (예: D01_S1, D01_S2, D01_S3)")]
    [SerializeField] private string targetScene = "D01_S1";

    [Header("포탈 활성화 여부")]
    [SerializeField] private bool isActive = true;

    [Header("포탈 이펙트 (선택)")]
    [SerializeField] private GameObject portalEffect;

    string ResolveTargetScene()
    {
        int idx = Mathf.Max(1, GameManager.Instance?.dungeonIndex ?? 1);
        if (string.IsNullOrWhiteSpace(targetScene))
            return GameManager.SceneS1(idx);

        // 기존 씬에 D01_S1 / D01_S2 / D01_S3(또는 D01_Boss) 같은 값이 박혀 있어도
        // 현재 선택한 dungeonIndex를 반영해 DXX_*로 자동 변환한다.
        if (targetScene.Length >= 5 &&
            targetScene[0] == 'D' &&
            char.IsDigit(targetScene[1]) &&
            char.IsDigit(targetScene[2]) &&
            targetScene[3] == '_')
        {
            string suffix = targetScene.Substring(4);
            if (suffix == "S3") return GameManager.SceneBoss(idx);
            if (suffix == "S1") return GameManager.SceneS1(idx);
            if (suffix == "S2") return GameManager.SceneS2(idx);
            if (suffix == "Boss") return GameManager.SceneBoss(idx);
            return $"D{idx:D2}_{suffix}";
        }

        return targetScene;
    }

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
        if (GameManager.Instance != null && !GameManager.Instance.hasReactDungeonIndex) return;

        // 씬 이동 전 현재 체력을 GameManager에 저장
        if (GameManager.Instance != null)
        {
            var pc = other.GetComponent<LayerLab.ArtMaker.PlayerCombat>();
            if (pc != null)
                GameManager.Instance.SyncHealth(pc.currentHealth);
        }

        SceneManager.LoadScene(ResolveTargetScene());
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
