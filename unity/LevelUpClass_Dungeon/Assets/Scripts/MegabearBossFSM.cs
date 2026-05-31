using UnityEngine;

/// <summary>
/// BossFSM preset for the ferocious Megabear boss.
/// Uses the Megabear Animator clips: Ready, Walk, Attack, AttackAlt, Death.
/// </summary>
[DisallowMultipleComponent]
public class MegabearBossFSM : BossFSM
{
    [Header("Megabear Preset")]
    public bool applyPresetOnAwake = true;

    private void Awake()
    {
        if (applyPresetOnAwake)
        {
            ApplyMegabearPreset();
        }
    }

    private void Reset()
    {
        ApplyMegabearPreset();
    }

    [ContextMenu("Apply Megabear Preset")]
    public void ApplyMegabearPreset()
    {
        bossName = "\uD3EC\uC545\uD55C \uAC70\uB300\uACF0";

        // Animation names available on Megabear.
        idleAnimName = "Ready";
        walkAnimName = "Walk";
        attackAnimName = "Attack";
        deadAnimName = "Death";

        // AttackAlt is the weapon thrust animation.
        hitAnimName = "Ready";
        chargeAnimName = "AttackAlt";
        jumpAnimName = "";
        skillAnimName = "AttackAlt";
        rageAnimName = "Attack";

        maxHealth = Mathf.Max(maxHealth, 450);
        attackPower = Mathf.Max(attackPower, 22);
        goldDrop = Mathf.Max(goldDrop, 300);

        chaseSpeed = 1.9f;
        chargeSpeed = 7.5f;
        phase2SpeedMultiplier = 1.25f;

        attackRange = 3.1f;
        normalAttackCooldown = 2.4f;
        chargeAttackCooldown = 7.5f;

        // Phase 2 uses a grounded weapon smash. Assign smashEffectPrefab in Inspector.
        phase2Skill = Phase2SkillType.Smash;
        smashCooldown = 9f;
        smashCastDelay = 0.45f;
        smashRadius = 3.4f;
        smashDamageMultiplier = 2.2f;
        poisonPoolEffectPrefab = null;
    }
}
