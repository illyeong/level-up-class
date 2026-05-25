using UnityEngine;

/// <summary>
/// BossFSM preset for the Green Worm boss.
/// Reuses BossFSM behavior while forcing Green Worm animation clip names.
/// </summary>
[DisallowMultipleComponent]
public class GreenWormBossFSM : BossFSM
{
    [Header("Green Worm Preset")]
    public bool applyPresetOnAwake = true;

    private void Awake()
    {
        if (applyPresetOnAwake)
        {
            ApplyGreenWormPreset();
        }
    }

    private void Reset()
    {
        ApplyGreenWormPreset();
    }

    [ContextMenu("Apply Green Worm Preset")]
    public void ApplyGreenWormPreset()
    {
        // Animation names available on Green Worm.
        idleAnimName = "Ready";
        walkAnimName = "Walk";
        attackAnimName = "Attack";
        deadAnimName = "Death";

        // Optional clips fallback to Attack when empty in BossFSM.
        hitAnimName = "Ready";
        chargeAnimName = "";
        jumpAnimName = "";
        rageAnimName = "";

        phase2Skill = Phase2SkillType.PoisonPool;
        attackRange = 2.75f;
        poisonPoolCooldown = 8f;
        poisonPoolRadius = 3f;
        poisonPoolDuration = 3.5f;
        poisonTickInterval = 0.5f;
        poisonTickDamageMultiplier = 0.35f;

        if (string.IsNullOrWhiteSpace(bossName))
        {
            bossName = "Green Worm";
        }
    }
}
