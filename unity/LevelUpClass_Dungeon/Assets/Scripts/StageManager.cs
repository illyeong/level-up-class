using UnityEngine;

/// <summary>
/// 씬에 배치된 모든 MonsterFSM을 감시하다가
/// 전부 처치되면 clearPortal을 활성화한다.
/// Stage 1 / Stage 2 둘 다 이 스크립트 하나로 사용.
/// </summary>
public class StageManager : MonoBehaviour
{
    [Header("몬스터 전멸 시 열릴 포탈")]
    public GameObject clearPortal;

    private MonsterFSM[] monsters;

    void Start()
    {
        // 씬 내 모든 몬스터 수집
        monsters = FindObjectsByType<MonsterFSM>(FindObjectsSortMode.None);

        // 포탈은 닫힌 채로 시작
        if (clearPortal != null)
            clearPortal.SetActive(false);
    }

    void Update()
    {
        if (clearPortal == null || clearPortal.activeSelf) return;

        // 살아있는 몬스터가 한 마리라도 있으면 대기
        foreach (var m in monsters)
        {
            if (m != null && !m.isDead) return;
        }

        // 전멸 — 포탈 오픈
        clearPortal.SetActive(true);
    }
}
