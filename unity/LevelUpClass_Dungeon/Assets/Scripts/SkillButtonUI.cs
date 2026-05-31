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

    [Header("스킬 아이콘 스프라이트")]
    public Sprite thunderGodSprite;   // 벽력일섬 아이콘

    [Header("스킬 컴포넌트")]
    public SkillThunderGod thunderGod; // Player 오브젝트에서 연결

    // ── 내부 ──────────────────────────────────────────────────
    private string _activeSkillId = "";
    private float  _cooldownMax   = 0f;
    private float  _cooldownTimer = 0f;

    [Header("테스트")]
    [Tooltip("체크하면 시작 시 thunder_god 스킬을 자동으로 장착합니다")]
    public bool testThunderGod = false;

    void Awake()
    {
        if (cooldownFill) cooldownFill.fillAmount = 0f;

        // buttonRoot가 자기 자신이면 SetActive(false)하면 Start()가 안 돌아감
        // → 자기 자신이 아닌 경우에만 숨김 처리
        if (buttonRoot != null && buttonRoot != gameObject)
            buttonRoot.SetActive(false);
    }

    void Start()
    {
        if (testThunderGod)
        {
            ShowSkill("thunder_god");
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

        switch (skillId)
        {
            case "thunder_god":
                SetupButton(thunderGodSprite, 45f);
                break;
            default:
                if (buttonRoot) buttonRoot.SetActive(false);
                _activeSkillId = "";
                return;
        }

        if (buttonRoot) buttonRoot.SetActive(true);
    }

    /// <summary>버튼 OnClick 이벤트에 연결</summary>
    public void OnSkillButtonClick()
    {
        if (_cooldownTimer > 0f) return; // 쿨타임 중

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
        }
    }

    // ── 내부 헬퍼 ─────────────────────────────────────────────
    private void SetupButton(Sprite icon, float cooldown)
    {
        _cooldownMax = cooldown;
        if (skillIcon && icon) skillIcon.sprite = icon;
        if (cooldownFill)     cooldownFill.fillAmount = 0f;
        if (cooldownText)     cooldownText.text = "";
    }

    private void StartCooldown(float seconds)
    {
        _cooldownMax   = seconds;
        _cooldownTimer = seconds;
        if (cooldownFill) cooldownFill.fillAmount = 1f;
    }
}
