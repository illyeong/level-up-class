using UnityEngine;
using UnityEngine.UI;
using TMPro;

/// <summary>
/// 몬스터/보스 머리 위 World Space HP 바 + 이름 표시.
/// MonsterFSM 과 BossFSM 둘 다 지원.
/// HP 바는 피격 시에만 나타나고, 이름은 항상 표시.
/// </summary>
public class MonsterHpBar : MonoBehaviour
{
    [Header("HP 바 UI")]
    public Image hpFillImage;
    public GameObject hpBarRoot;

    [Header("이름 텍스트")]
    public TextMeshProUGUI nameText;

    [Header("설정")]
    public float hideDelay = 3f;

    private MonsterFSM monster;
    private BossFSM boss;

    private float hideTimer = 0f;
    private bool isVisible = false;

    // 현재 HP / 최대 HP (MonsterFSM·BossFSM 공통 접근)
    private int CurrentHealth => monster != null ? monster.currentHealth : (boss != null ? boss.CurrentHealth : 0);
    private int MaxHealth     => monster != null ? monster.maxHealth     : (boss != null ? boss.maxHealth     : 1);

    void Start()
    {
        monster = GetComponentInParent<MonsterFSM>();
        boss    = GetComponentInParent<BossFSM>();

        if (nameText != null)
        {
            if (monster != null) nameText.text = monster.monsterName;
            else if (boss != null) nameText.text = boss.bossName;
        }

        if (hpBarRoot != null)
            hpBarRoot.SetActive(false);
    }

    void Update()
    {
        if (monster == null && boss == null) return;

        // 좌우 반전 보정
        if (transform.parent != null)
        {
            float sx = Mathf.Sign(transform.parent.localScale.x);
            transform.localScale = new Vector3(sx, 1f, 1f);
        }

        if (hpFillImage != null)
            hpFillImage.fillAmount = Mathf.Clamp01((float)CurrentHealth / MaxHealth);

        if (isVisible)
        {
            hideTimer -= Time.deltaTime;
            if (hideTimer <= 0f)
            {
                isVisible = false;
                if (hpBarRoot != null) hpBarRoot.SetActive(false);
            }
        }
    }

    public void Show()
    {
        isVisible = true;
        hideTimer = hideDelay;
        if (hpBarRoot != null) hpBarRoot.SetActive(true);
    }
}
