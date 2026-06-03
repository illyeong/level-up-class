using UnityEngine;
using UnityEngine.EventSystems;

/// <summary>
/// Stage2, Stage2_Boss 씬에서 GameManager에 저장된 캐릭터 외형 + 스탯을 재적용.
/// 각 씬의 빈 GameObject에 붙이면 됩니다.
/// </summary>
public class CharacterAutoSetup : MonoBehaviour
{
    void Start()
    {
        ApplyStats();
        ApplyAppearance();
        ApplySkillUI();
        StartCoroutine(FixJoystickAfterSceneLoad());
    }

    void ApplySkillUI()
    {
        var gm = GameManager.Instance;
        if (gm == null) return;

        var skills = gm.selectedSkills;
        if (skills == null || skills.Length == 0)
        {
            if (string.IsNullOrEmpty(gm.selectedSkill)) return;
            skills = new[] { gm.selectedSkill };
        }

        // 비활성 오브젝트도 포함해서 탐색
        var uiList = FindObjectsByType<SkillButtonUI>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        for (int i = 0; i < uiList.Length && i < skills.Length; i++)
            uiList[i].ShowSkill(skills[i]);
    }

    /// <summary>
    /// 씬 전환 후 조이스틱 Canvas 레퍼런스가 깨지는 문제 수정.
    /// 1프레임 대기 후 Joystick + PlayerMovement 재연결.
    /// </summary>
    System.Collections.IEnumerator FixJoystickAfterSceneLoad()
    {
        // 1프레임 대기 (모든 Start() 완료 후 처리)
        yield return null;

        // EventSystem 활성화 확인
        var es = FindFirstObjectByType<EventSystem>();
        if (es != null && !es.enabled)
        {
            es.enabled = true;
            Debug.Log("[CharacterAutoSetup] EventSystem 재활성화");
        }

        // Joystick Canvas 레퍼런스 재캐시
        var joystick = FindFirstObjectByType<Joystick>();
        if (joystick != null)
        {
            joystick.RefreshCanvas();
            Debug.Log("[CharacterAutoSetup] Joystick RefreshCanvas 완료");

            // PlayerMovement에 joystick 재연결 (Inspector 연결이 없을 경우 대비)
            var movement = FindFirstObjectByType<LayerLab.ArtMaker.PlayerMovement>();
            if (movement != null)
            {
                // SerializeField 접근 방법: 자체 public setter 또는 SetJoystick 메서드 필요
                // PlayerMovement는 이미 FindFirstObjectByType으로 자동 탐색하므로
                // 여기서는 Joystick을 disable→enable하여 Start()를 재실행
                joystick.gameObject.SetActive(false);
                yield return null;
                joystick.gameObject.SetActive(true);
                Debug.Log("[CharacterAutoSetup] Joystick 재활성화 완료");
            }
        }
        else
        {
            Debug.LogWarning("[CharacterAutoSetup] Joystick을 씬에서 찾지 못함!");
        }
    }

    void ApplyStats()
    {
        var gm = GameManager.Instance;
        var pc = LayerLab.ArtMaker.PlayerCombat.FindMainPlayerCombat();
        if (gm == null || pc == null) return;

        pc.maxHealth            = gm.maxHealth;
        pc.currentHealth        = gm.currentHealth;
        pc.attackPower          = gm.attackPower;
        pc.defense              = gm.defense;
        pc.critChance           = gm.critChance;
        pc.critDamageMultiplier = gm.critDamageMultiplier;
    }

    void ApplyAppearance()
    {
        var gm = GameManager.Instance;
        if (gm == null || string.IsNullOrEmpty(gm.savedAvatarJson)) return;

        var data = JsonUtility.FromJson<DungeonCharacterLoader.LoadAvatarMsg>(gm.savedAvatarJson);
        if (data == null) return;

        var pm = FindFirstObjectByType<LayerLab.ArtMaker.PartsManager>();
        if (pm == null) { Debug.LogWarning("[CharacterAutoSetup] PartsManager 없음"); return; }

        pm.Init();
        if (data.parts  != null) DungeonCharacterLoader.ApplyParts(pm, data.parts);
        if (data.colors != null) DungeonCharacterLoader.ApplyColors(pm, data.colors);
    }
}
