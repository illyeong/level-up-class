using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
using TMPro;

/// <summary>
/// 로비(Lobby) 씬 UI 전체를 관리한다.
///
/// [씬 구성 가이드]
/// ┌─ Canvas
/// │  ├─ TopBar
/// │  │  ├─ GoldText       (TMP)
/// │  │  ├─ HealthText     (TMP)
/// │  │  └─ PlayerNameText (TMP)
/// │  ├─ BottomBar
/// │  │  ├─ EnterDungeonBtn
/// │  │  ├─ StatUpgradeBtn
/// │  │  └─ ResetDataBtn   (개발용 — 배포 시 비활성화)
/// │  └─ StatUpgradePanel  (기본 비활성화)
/// │     ├─ AttackCostText (TMP)
/// │     ├─ DefenseCostText(TMP)
/// │     ├─ UpgradeAttackBtn
/// │     ├─ UpgradeDefenseBtn
/// │     └─ CloseBtn
/// </summary>
public class LobbyUIManager : MonoBehaviour
{
    [Header("상단 UI")]
    [SerializeField] private TextMeshProUGUI goldText;
    [SerializeField] private TextMeshProUGUI healthText;
    [SerializeField] private TextMeshProUGUI playerNameText;
    [SerializeField] private Image healthBarFill;

    [Header("하단 버튼")]
    [SerializeField] private Button enterDungeonButton;
    [SerializeField] private Button statUpgradeButton;
    [SerializeField] private Button resetDataButton;     // 개발/테스트 전용

    [Header("스탯 강화 패널")]
    [SerializeField] private GameObject statUpgradePanel;
    [SerializeField] private TextMeshProUGUI attackCostText;
    [SerializeField] private TextMeshProUGUI defenseCostText;
    [SerializeField] private TextMeshProUGUI attackStatText;
    [SerializeField] private TextMeshProUGUI defenseStatText;
    [SerializeField] private Button upgradeAttackButton;
    [SerializeField] private Button upgradeDefenseButton;
    [SerializeField] private Button closePanelButton;

    [Header("플레이어 이름 (에디터 설정)")]
    [SerializeField] private string playerName = "모험가";

    // ─────────────────────────────────────────────────────────────

    void Start()
    {
        // 로비 도착 시 체력 완전 회복
        GameManager.Instance?.FullHeal();

        RefreshUI();
        RegisterButtons();
    }

    void RegisterButtons()
    {
        enterDungeonButton? .onClick.AddListener(OnClickEnterDungeon);
        statUpgradeButton?  .onClick.AddListener(OnClickToggleStatPanel);
        resetDataButton?    .onClick.AddListener(OnClickResetData);
        upgradeAttackButton? .onClick.AddListener(OnClickUpgradeAttack);
        upgradeDefenseButton?.onClick.AddListener(OnClickUpgradeDefense);
        closePanelButton?   .onClick.AddListener(OnClickToggleStatPanel);

        if (statUpgradePanel != null)
            statUpgradePanel.SetActive(false);
    }

    // ── UI 갱신 ───────────────────────────────────────────────────

    void RefreshUI()
    {
        if (GameManager.Instance == null) return;
        var gm = GameManager.Instance;

        if (playerNameText != null) playerNameText.text = playerName;
        if (goldText   != null) goldText.text   = $"Gold  {gm.gold:N0}";
        if (healthText != null) healthText.text = $"HP  {gm.currentHealth} / {gm.maxHealth}";

        if (healthBarFill != null)
            healthBarFill.fillAmount = (float)gm.currentHealth / gm.maxHealth;

        // 강화 패널 비용/스탯 표시
        if (attackCostText   != null) attackCostText.text   = $"공격력 강화\nATK +2   [ {gm.GetAttackUpgradeCost():N0} G ]";
        if (defenseCostText  != null) defenseCostText.text  = $"방어력 강화\nDEF +2   [ {gm.GetDefenseUpgradeCost():N0} G ]";
        if (attackStatText   != null) attackStatText.text   = $"공격력: {gm.attackPower}  (Lv.{gm.attackUpgradeLevel})";
        if (defenseStatText  != null) defenseStatText.text  = $"방어력: {gm.defense}  (Lv.{gm.defenseUpgradeLevel})";
    }

    // ── 버튼 콜백 ─────────────────────────────────────────────────

    void OnClickEnterDungeon()
    {
        SceneManager.LoadScene(GameManager.SceneDungeonSelect);
    }

    void OnClickToggleStatPanel()
    {
        if (statUpgradePanel == null) return;
        bool next = !statUpgradePanel.activeSelf;
        statUpgradePanel.SetActive(next);
        if (next) RefreshUI();      // 패널 열 때 최신 정보 반영
    }

    void OnClickUpgradeAttack()
    {
        if (GameManager.Instance == null) return;
        var gm = GameManager.Instance;

        if (gm.SpendGold(gm.GetAttackUpgradeCost()))
        {
            gm.attackPower        += 2;
            gm.attackUpgradeLevel += 1;
            RefreshUI();
        }
        else
        {
            Debug.Log("골드가 부족합니다!");
        }
    }

    void OnClickUpgradeDefense()
    {
        if (GameManager.Instance == null) return;
        var gm = GameManager.Instance;

        if (gm.SpendGold(gm.GetDefenseUpgradeCost()))
        {
            gm.defense            += 2;
            gm.defenseUpgradeLevel += 1;
            RefreshUI();
        }
        else
        {
            Debug.Log("골드가 부족합니다!");
        }
    }

    void OnClickResetData()
    {
        GameManager.Instance?.ResetAllData();
        RefreshUI();
        Debug.Log("데이터 초기화 완료");
    }
}
