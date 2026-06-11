using UnityEngine;

/// <summary>
/// BossFSM preset for the Stone Golem boss.
/// Uses only Ready, Walk, Attack, and Death animations.
/// </summary>
[DisallowMultipleComponent]
public class StoneGolemBossFSM : BossFSM
{
    [Header("Stone Golem Preset")]
    public bool applyPresetOnAwake = true;

    private void Awake()
    {
        if (applyPresetOnAwake)
            ApplyRuntimeDefaults();
    }

    private void Reset()
    {
        ApplyStoneGolemPreset();
    }

    [ContextMenu("Apply Stone Golem Preset")]
    public void ApplyStoneGolemPreset()
    {
        bossName = "\uC2A4\uD1A4 \uACE8\uB818";

        idleAnimName = "Ready";
        walkAnimName = "Walk";
        attackAnimName = "Attack";
        deadAnimName = "Death";

        // Stone Golem has no AttackAlt, Hit, Charge, Jump, or Rage clips.
        hitAnimName = "Ready";
        chargeAnimName = "Attack";
        jumpAnimName = "";
        skillAnimName = "Attack";
        rageAnimName = "Ready";

        maxHealth = Mathf.Max(maxHealth, 600);
        attackPower = Mathf.Max(attackPower, 25);
        goldDrop = Mathf.Max(goldDrop, 350);

        chaseSpeed = 1.35f;
        chargeSpeed = 4.5f;
        phase2SpeedMultiplier = 1.2f;

        attackRange = 2.4f;
        normalAttackCooldown = 2.8f;
        chargeAttackCooldown = 8.5f;

        phase2Skill = Phase2SkillType.StoneGolem;
        stoneSkillCooldown = 7.5f;

        firstRockFallHitThreshold = 2;
        stoneJumpPower = 7f;
        stoneJumpMoveSpeed = 4f;
        stoneJumpTrackDuration = 0.8f;
        stoneJumpRadius = 3.5f;
        stoneJumpDamageMultiplier = 1.8f;

        rockFallCastDelay = 0.6f;
        rockFallInterval = 0.32f;
        rockFallHeight = 7f;
        rockFallDuration = 0.9f;
        rockFallRadius = 1.5f;
        rockFallDamageMultiplier = 1.25f;
        rockFallCount = 3;
        phase2RockFallCount = 5;
        rockFallSpread = 2.4f;
    }

    private void ApplyRuntimeDefaults()
    {
        bossName = "\uC2A4\uD1A4 \uACE8\uB818";
        idleAnimName = "Ready";
        walkAnimName = "Walk";
        attackAnimName = "Attack";
        deadAnimName = "Death";
        hitAnimName = "Ready";
        chargeAnimName = "Attack";
        jumpAnimName = "";
        skillAnimName = "Attack";
        rageAnimName = "Ready";
        phase2Skill = Phase2SkillType.StoneGolem;
    }
}
