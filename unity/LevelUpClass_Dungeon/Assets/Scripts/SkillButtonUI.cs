using UnityEngine;
using UnityEngine.UI;
using TMPro;

/// <summary>
/// 스킬 버튼 UI 관리.
/// - React에서 selectedSkill을 받으면 ShowSkill()로 버튼 활성화
/// - 클릭 시 해당 스킬 발동
/// - 쿨타임 중 fillAmount로 어둡게 표시
///
/// 인스펙터 연결:
///   buttonRoot   → 스킬 버튼 전체 오브젝트 (기본 비활성)
///   skillIcon    → 스킬 이미지 (Image 컴포넌트)
///   cooldownFill → 쿨타임 오버레이 Image (fillMethod: Radial360, 기본 fillAmount=0)
///   cooldownText → 남은 시간 텍스트 (TMP, 선택)
///   thunderGod   → Player 오브젝트의 SkillThunderGod 컴포넌트
/// </summary>
public class SkillButtonUI : MonoBehaviour
{
    [Header("UI 참조")]
    public GameObject  buttonRoot;    // 버튼 전체 (Show/Hide용)
    public Image       skillIcon;     // 스킬 아이콘 이미지
    public Image       cooldownFill;  // 쿨타임 어두운 오버레이 (fillAmount)
    public TMP_Text    cooldownText;  // 남은 쿨타임 초 표시 (없어도 됨)

    [Header("Skill Manager")]
    public SkillManager skillManager;  // Player에 붙은 공통 스킬 매니저

    [Header("스킬 아이콘 스프라이트")]
    public Sprite thunderGodSprite;   // 벽력일섬 아이콘
    public Sprite fireBreathSprite;   // 불 뿜기 아이콘
    public Sprite explosiveBombSprite; // 폭렬탄 아이콘

    [Header("스킬 컴포넌트")]
    public SkillThunderGod thunderGod; // Player 오브젝트에서 연결
    public SkillFireBreath fireBreath; // Player 오브젝트에서 연결
    public SkillExplosiveBomb explosiveBomb; // Player 오브젝트에서 연결

    // ── 내부 ──────────────────────────────────────────────────
    private string _activeSkillId = "";
    private float  _cooldownMax   = 0f;
    private float  _cooldownTimer = 0f;

    [Header("테스트")]
    [Tooltip("체크하면 시작 시 thunder_god 스킬을 자동으로 장착합니다")]
    public bool testThunderGod = false;
    [Tooltip("에디터 테스트용 스킬 ID. 예: thunder_god, fire_breath, explosive_bomb")]
    public string testSkillId = "";

    void Awake()
    {
        AutoBindChildren();

        if (cooldownFill)
        {
            cooldownFill.type = Image.Type.Filled;
            cooldownFill.fillMethod = Image.FillMethod.Radial360;
            cooldownFill.fillOrigin = (int)Image.Origin360.Top;
            cooldownFill.fillClockwise = false;
            cooldownFill.fillAmount = 0f;
        }

        // buttonRoot가 자기 자신이면 SetActive(false)하면 Start()가 안 돌아감
        // → 자기 자신이 아닌 경우에만 숨김 처리
        if (buttonRoot != null && buttonRoot != gameObject)
            buttonRoot.SetActive(false);
    }

    void Start()
    {
        if (testThunderGod || !string.IsNullOrEmpty(testSkillId))
        {
            ShowSkill(!string.IsNullOrEmpty(testSkillId) ? testSkillId : "thunder_god");
            return;
        }

        // GameManager에 저장된 스킬 복원 (씬 전환 후에도 유지)
        string saved = GameManager.Instance?.selectedSkill ?? "";
        if (!string.IsNullOrEmpty(saved))
        {
            ShowSkill(saved);
        }
        else
        {
            // buttonRoot가 자기 자신인 경우 여기서 숨김
            if (buttonRoot != null && buttonRoot == gameObject)
                gameObject.SetActive(false);
        }
    }

    void Update()
    {
        if (string.IsNullOrEmpty(_activeSkillId)) return;

        // 쿨타임 카운트다운
        if (_cooldownTimer > 0f)
        {
            _cooldownTimer -= Time.deltaTime;
            if (_cooldownTimer < 0f) _cooldownTimer = 0f;

            float pct = (_cooldownMax > 0f) ? (_cooldownTimer / _cooldownMax) : 0f;
            if (cooldownFill) cooldownFill.fillAmount = pct;
            if (cooldownText)
                cooldownText.text = _cooldownTimer > 0f
                    ? Mathf.CeilToInt(_cooldownTimer).ToString()
                    : "";
        }
        else
        {
            if (cooldownFill) cooldownFill.fillAmount = 0f;
            if (cooldownText) cooldownText.text = "";
        }
    }

    /// <summary>DungeonCharacterLoader가 호출 — selectedSkill에 따라 버튼 활성화</summary>
    public void ShowSkill(string skillId)
    {
        _activeSkillId = skillId;

        EnsureSkillManager();
        bool hasManagedSkill = skillManager != null && skillManager.HasSkill(skillId);
        bool hasKnownFallback = IsKnownSkill(skillId);

        if (!hasManagedSkill && !hasKnownFallback)
        {
            if (buttonRoot) buttonRoot.SetActive(false);
            _activeSkillId = "";
            return;
        }

        Sprite icon = hasManagedSkill ? skillManager.GetIcon(skillId) : null;
        SetupButton(icon != null ? icon : GetFallbackIcon(skillId), GetCooldown(skillId));

        if (buttonRoot) buttonRoot.SetActive(true);
    }

    /// <summary>버튼 OnClick 이벤트에 연결</summary>
    public void OnSkillButtonClick()
    {
        if (_cooldownTimer > 0f) return; // 쿨타임 중
        EnsureSkillManager();

        if (skillManager != null && skillManager.UseSkill(_activeSkillId))
        {
            StartCooldown(GetCooldown(_activeSkillId));
            return;
        }

        switch (_activeSkillId)
        {
            case "thunder_god":
                if (thunderGod == null)
                    thunderGod = FindFirstObjectByType<SkillThunderGod>();
                if (thunderGod != null && thunderGod.IsReady)
                {
                    thunderGod.Activate();
                    StartCooldown(45f);
                }
                break;
            case "fire_breath":
                if (fireBreath == null)
                    fireBreath = FindFirstObjectByType<SkillFireBreath>();
                if (fireBreath != null && fireBreath.IsReady)
                {
                    fireBreath.Activate();
                    StartCooldown(25f);
                }
                break;
            case "explosive_bomb":
                if (explosiveBomb == null)
                    explosiveBomb = FindFirstObjectByType<SkillExplosiveBomb>();
                if (explosiveBomb != null && explosiveBomb.IsReady)
                {
                    explosiveBomb.Activate();
                    StartCooldown(30f);
                }
                break;
        }
    }

    // ── 내부 헬퍼 ─────────────────────────────────────────────
    private void SetupButton(Sprite icon, float cooldown)
    {
        AutoBindChildren();

        _cooldownMax = cooldown;
        if (skillIcon && icon) skillIcon.sprite = icon;
        if (cooldownFill)
        {
            cooldownFill.type = Image.Type.Filled;
            cooldownFill.fillMethod = Image.FillMethod.Radial360;
            cooldownFill.fillOrigin = (int)Image.Origin360.Top;
            cooldownFill.fillClockwise = false;
            cooldownFill.fillAmount = 0f;
        }
        if (cooldownText)     cooldownText.text = "";
    }

    private void StartCooldown(float seconds)
    {
        _cooldownMax   = seconds;
        _cooldownTimer = seconds;
        if (cooldownFill) cooldownFill.fillAmount = 1f;
        if (cooldownText)
        {
            cooldownText.transform.SetAsLastSibling();
            cooldownText.text = Mathf.CeilToInt(seconds).ToString();
        }
    }

    private void EnsureSkillManager()
    {
        if (skillManager == null)
            skillManager = FindFirstObjectByType<SkillManager>();
    }

    private bool IsKnownSkill(string skillId)
    {
        return skillId == "thunder_god" || skillId == "fire_breath" || skillId == "explosive_bomb";
    }

    private Sprite GetFallbackIcon(string skillId)
    {
        return skillId switch
        {
            "thunder_god" => thunderGodSprite,
            "fire_breath" => fireBreathSprite,
            "explosive_bomb" => explosiveBombSprite,
            _ => null
        };
    }

    private float GetCooldown(string skillId)
    {
        float fallback = skillId switch
        {
            "thunder_god" => 45f,
            "fire_breath" => 25f,
            "explosive_bomb" => 30f,
            _ => 10f
        };

        EnsureSkillManager();
        return skillManager != null ? skillManager.GetCooldown(skillId, fallback) : fallback;
    }

    private void AutoBindChildren()
    {
        if (skillIcon == null)
            skillIcon = transform.Find("Icon")?.GetComponent<Image>();
        if (cooldownFill == null)
            cooldownFill = transform.Find("CooldownFill")?.GetComponent<Image>();
        if (cooldownText == null)
            cooldownText = transform.Find("CooldownText")?.GetComponent<TMP_Text>();
        if (cooldownText != null)
            cooldownText.transform.SetAsLastSibling();
    }
}
