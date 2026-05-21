using UnityEngine;

/// <summary>
/// Stage2, Stage2_Boss 등 씬 전환 후 캐릭터에 자동으로 외형 + 스탯을 적용.
/// 해당 씬의 Character 오브젝트 또는 빈 GameObject에 붙이면 됩니다.
/// </summary>
public class CharacterAutoSetup : MonoBehaviour
{
    void Start()
    {
        // GameManager에 저장된 외형 재적용
        DungeonCharacterLoader.ApplyFromGameManager();

        // GameManager에 저장된 스탯 → PlayerCombat에 반영
        var gm = GameManager.Instance;
        var pc = FindFirstObjectByType<LayerLab.ArtMaker.PlayerCombat>();
        if (gm != null && pc != null)
        {
            pc.maxHealth     = gm.maxHealth;
            pc.currentHealth = gm.currentHealth;
            pc.attackPower   = gm.attackPower;
            pc.defense       = gm.defense;
            pc.critChance    = gm.critChance;
            pc.critDamageMultiplier = gm.critDamageMultiplier;
        }
    }
}
