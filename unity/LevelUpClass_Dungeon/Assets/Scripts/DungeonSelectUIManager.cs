using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
using TMPro;

/// <summary>
/// 던전 선택(DungeonSelect) 씬 UI를 관리한다.
///
/// [씬 구성 가이드]
/// ┌─ Canvas
/// │  ├─ GoldText          (TMP) — 보유 골드 표시
/// │  ├─ Stage1Button      — Stage1 입장
/// │  ├─ Stage2BossButton  — 보스 직행 (해금 조건 달성 시 활성화 예정)
/// │  └─ BackButton        — 로비로 복귀
/// </summary>
public class DungeonSelectUIManager : MonoBehaviour
{
    [Header("상단 정보")]
    [SerializeField] private TextMeshProUGUI goldText;
    [SerializeField] private TextMeshProUGUI playerStatText;

    [Header("던전 입장 버튼")]
    [SerializeField] private Button stage1Button;
    [SerializeField] private Button stage2BossButton;
    [SerializeField] private Button backButton;

    [Header("보스 해금 조건 (예: 골드 임계값)")]
    [SerializeField] private int bossUnlockGold = 300;

    void Start()
    {
        RefreshUI();

        stage1Button?    .onClick.AddListener(OnClickStage1);
        stage2BossButton?.onClick.AddListener(OnClickStage2Boss);
        backButton?      .onClick.AddListener(OnClickBack);
    }

    void RefreshUI()
    {
        if (GameManager.Instance == null) return;
        var gm = GameManager.Instance;

        if (goldText != null)
            goldText.text = $"Gold  {gm.gold:N0}";

        if (playerStatText != null)
            playerStatText.text = $"ATK {gm.attackPower}  |  DEF {gm.defense}  |  HP {gm.currentHealth}/{gm.maxHealth}";

        // 보스 버튼 해금 조건
        if (stage2BossButton != null)
            stage2BossButton.interactable = gm.gold >= bossUnlockGold;
    }

    void OnClickStage1()    => SceneManager.LoadScene(GameManager.SceneStage1);
    void OnClickStage2Boss() => SceneManager.LoadScene(GameManager.SceneStage2Boss);
    void OnClickBack()      => SceneManager.LoadScene(GameManager.SceneLobby);
}
