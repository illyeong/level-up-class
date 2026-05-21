using UnityEngine;

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
    }

    void ApplyStats()
    {
        var gm = GameManager.Instance;
        var pc = FindFirstObjectByType<LayerLab.ArtMaker.PlayerCombat>();
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
