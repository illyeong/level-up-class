using UnityEngine;
using UnityEngine.UI;
using TMPro;

/// <summary>
/// 화면 고정 HUD — HP 바, 마나 바, 레벨 표시.
/// </summary>
public class PlayerHpBar : MonoBehaviour
{
    [Header("HP 바")]
    public Image hpFillImage;
    public Image hpDelayImage;     // 피격 시 천천히 줄어드는 노란 바 (선택)
    public TextMeshProUGUI hpText; // "80 / 100" (선택)

    [Header("마나 바")]
    public Image mpFillImage;
    public TextMeshProUGUI mpText; // "50 / 100" (선택)

    [Header("레벨")]
    public TextMeshProUGUI levelText; // "Lv.5" (선택)

    [Header("딜레이 바 속도")]
    public float delaySpeed = 2f;

    [Header("플레이어 (자동 탐색, 안 되면 직접 연결)")]
    public LayerLab.ArtMaker.PlayerCombat playerCombat;
    private float delayFill = 1f;

    void Start()
    {
        if (playerCombat == null)
            playerCombat = FindFirstObjectByType<LayerLab.ArtMaker.PlayerCombat>();

        if (playerCombat == null)
            Debug.LogWarning("[PlayerHpBar] PlayerCombat을 찾지 못했습니다.");

        // 레벨은 변하지 않으므로 Start에서 한 번만 설정
        UpdateLevel();
    }

    void Update()
    {
        if (playerCombat == null) return;

        UpdateHp();
        UpdateMp();
    }

    void UpdateHp()
    {
        float ratio = Mathf.Clamp01((float)playerCombat.currentHealth / playerCombat.maxHealth);

        if (hpFillImage != null)
            hpFillImage.fillAmount = ratio;

        if (hpDelayImage != null)
        {
            delayFill = Mathf.Lerp(delayFill, ratio, Time.deltaTime * delaySpeed);
            hpDelayImage.fillAmount = delayFill;
        }

        if (hpText != null)
            hpText.text = $"{playerCombat.currentHealth} / {playerCombat.maxHealth}";
    }

    void UpdateMp()
    {
        float ratio = Mathf.Clamp01((float)playerCombat.currentMana / playerCombat.maxMana);

        if (mpFillImage != null)
            mpFillImage.fillAmount = ratio;

        if (mpText != null)
            mpText.text = $"{playerCombat.currentMana} / {playerCombat.maxMana}";
    }

    void UpdateLevel()
    {
        if (levelText == null) return;

        int lv = GameManager.Instance != null ? GameManager.Instance.level : 1;
        levelText.text = $"Lv.{lv}";
    }
}
