using UnityEngine;

/// <summary>
/// BossFSM preset for the Ice Worm boss.
/// Unique pattern loop: burrow ambush -> frozen field -> ice spike barrage,
/// while charge remains in the base loop.
/// </summary>
[DisallowMultipleComponent]
public class IceWormBossFSM : BossFSM
{
    [Header("Ice Worm Preset")]
    public bool applyPresetOnAwake = true;

    [Header("Damage Hitbox")]
    public Vector2 bodyHitboxOffset = new Vector2(-0.15f, 1.15f);
    public Vector2 bodyHitboxSize = new Vector2(4.4f, 2.9f);

    private void Awake()
    {
        EnsureDamageHitbox();

        if (applyPresetOnAwake)
            ApplyIceWormPreset();
    }

    private void Reset()
    {
        ApplyIceWormPreset();
    }

    [ContextMenu("Apply Ice Worm Preset")]
    public void ApplyIceWormPreset()
    {
        bossName = "\uC544\uC774\uC2A4 \uC6DC";

        idleAnimName = "Ready";
        walkAnimName = "Walk";
        attackAnimName = "Attack";
        chargeAnimName = "Attack";
        jumpAnimName = "Attack";
        skillAnimName = "Attack";
        hitAnimName = "Ready";
        deadAnimName = "Death";
        rageAnimName = "Attack";

        maxHealth = Mathf.Max(maxHealth, 850);
        attackPower = Mathf.Max(attackPower, 32);
        goldDrop = Mathf.Max(goldDrop, 500);
        fixedChestDiamondReward = Mathf.Max(fixedChestDiamondReward, 260);
        fixedChestExpReward = Mathf.Max(fixedChestExpReward, 240);

        chaseSpeed = 1.9f;
        chargeSpeed = 10.5f;
        phase2SpeedMultiplier = 1.35f;

        attackRange = 2.7f;
        normalAttackCooldown = 2.35f;
        chargeAttackCooldown = 6.8f;
        chargeDuration = 0.62f;
        chargeDamageMultiplier = 1.9f;

        phase2Skill = Phase2SkillType.IceWorm;
        iceWormPatternsStartInPhase1 = true;
        iceWormSpecialCooldown = 6.2f;
        iceWormPhase2CooldownMultiplier = 0.68f;
        iceWormSkillTriggerRange = 8.5f;
        iceBurrowDuration = 0.45f;
        iceBurrowAlpha = 0.45f;
        iceEmergeOffsetFromPlayer = 1.25f;
        iceEmergeRadius = 2.9f;
        iceEmergeDamageMultiplier = 1.65f;

        jumpAttackCooldown = 0f;
        jumpPower = 7.8f;
        jumpMoveSpeed = 5.2f;
        jumpSlamVelocity = 15.5f;
        jumpImpactRadius = 3.1f;
        jumpDamageMultiplier = 1.75f;
        phase2JumpSpeedMultiplier = 1.35f;
        phase2JumpTimingMultiplier = 0.72f;
        landingEffectScale = 2.5f;
        landingEffectLifetime = 3.2f;

        // Assign iceFieldEffectPrefab for the visual. Falls back to poisonPoolEffectPrefab if empty.
        poisonCastDelay = 0.45f;
        iceFieldRadius = 3.2f;
        iceFieldDuration = 3.4f;
        iceFieldTickInterval = 0.55f;
        iceFieldDamageMultiplier = 0.3f;
        iceFieldMoveSpeedMultiplier = 0.45f;
        iceFieldSlowDuration = 0.8f;

        // Assign ice spike warning/impact prefabs. Falls back to rock warning/impact if empty.
        rockFallCastDelay = 0.5f;
        rockFallHeight = 7.2f;
        rockFallDuration = 0.85f;
        rockFallRadius = 1.45f;
        rockFallDamageMultiplier = 1.2f;
        iceSpikeCount = 5;
        phase2IceSpikeCount = 8;
        iceSpikeInterval = 0.26f;
        iceSpikeSpread = 3.2f;

        shakeDuration = 0.28f;
        shakeMagnitude = 0.22f;
    }

    private void ApplyRuntimeDefaults()
    {
        bossName = "\uC544\uC774\uC2A4 \uC6DC";
        idleAnimName = "Ready";
        walkAnimName = "Walk";
        attackAnimName = "Attack";
        chargeAnimName = "Attack";
        jumpAnimName = "Attack";
        skillAnimName = "Attack";
        hitAnimName = "Ready";
        deadAnimName = "Death";
        rageAnimName = "Attack";

        phase2Skill = Phase2SkillType.IceWorm;
        iceWormPatternsStartInPhase1 = true;

        attackRange = Mathf.Max(attackRange, 2.7f);
        chargeDuration = Mathf.Max(chargeDuration, 0.62f);
        landingEffectScale = Mathf.Max(landingEffectScale, 2.5f);
        landingEffectLifetime = Mathf.Max(landingEffectLifetime, 3.2f);
    }

    private void EnsureDamageHitbox()
    {
        const string hitboxName = "BossDamageHitbox";
        Transform hitboxTransform = transform.Find(hitboxName);
        GameObject hitboxObject;

        if (hitboxTransform == null)
        {
            hitboxObject = new GameObject(hitboxName);
            hitboxObject.transform.SetParent(transform, false);
        }
        else
        {
            hitboxObject = hitboxTransform.gameObject;
        }

        hitboxObject.layer = gameObject.layer;

        BoxCollider2D hitbox = hitboxObject.GetComponent<BoxCollider2D>();
        if (hitbox == null)
            hitbox = hitboxObject.AddComponent<BoxCollider2D>();

        hitbox.isTrigger = true;
        hitbox.offset = bodyHitboxOffset;
        hitbox.size = bodyHitboxSize;
    }
}
