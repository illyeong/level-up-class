using UnityEngine;

/// <summary>
/// BossFSM preset for the Ice Golem boss.
/// Pattern loop: empowered ice field -> falling ice barrage -> frost quake.
/// </summary>
[DisallowMultipleComponent]
public class IceGolemBossFSM : BossFSM
{
    [Header("Ice Golem Preset")]
    public bool applyPresetOnAwake = true;

    [Header("Damage Hitbox")]
    public Vector2 bodyHitboxOffset = new Vector2(0f, 1.25f);
    public Vector2 bodyHitboxSize = new Vector2(3.8f, 3.1f);

    private void Awake()
    {
        EnsureDamageHitbox();

        if (applyPresetOnAwake)
            ApplyIceGolemPreset();
    }

    private void Reset()
    {
        ApplyIceGolemPreset();
    }

    [ContextMenu("Apply Ice Golem Preset")]
    public void ApplyIceGolemPreset()
    {
        bossName = "\uC544\uC774\uC2A4 \uACE8\uB818";

        idleAnimName = "Ready";
        walkAnimName = "Walk";
        attackAnimName = "Attack";
        chargeAnimName = "Attack";
        jumpAnimName = "Attack";
        skillAnimName = "Attack";
        hitAnimName = "Ready";
        deadAnimName = "Death";
        rageAnimName = "Attack";

        maxHealth = Mathf.Max(maxHealth, 1100);
        attackPower = Mathf.Max(attackPower, 38);
        goldDrop = Mathf.Max(goldDrop, 550);
        fixedChestDiamondReward = Mathf.Max(fixedChestDiamondReward, 280);
        fixedChestExpReward = Mathf.Max(fixedChestExpReward, 260);

        chaseSpeed = 1.55f;
        chargeSpeed = 7.2f;
        phase2SpeedMultiplier = 1.22f;

        attackRange = 2.6f;
        normalAttackCooldown = 2.55f;
        chargeAttackCooldown = 7.8f;
        chargeDuration = 0.48f;
        chargeDamageMultiplier = 1.75f;

        phase2Skill = Phase2SkillType.IceGolem;
        iceGolemPatternsStartInPhase1 = true;
        iceGolemSpecialCooldown = 6.6f;
        iceGolemPhase2CooldownMultiplier = 0.65f;
        iceGolemSkillTriggerRange = 9f;

        poisonCastDelay = 0.45f;
        iceFieldRadius = 3.6f;
        iceFieldDuration = 4.6f;
        iceFieldTickInterval = 0.45f;
        iceFieldDamageMultiplier = 0.34f;
        iceFieldMoveSpeedMultiplier = 0.38f;
        iceFieldSlowDuration = 0.85f;
        iceGolemFieldImpactDamageMultiplier = 0.95f;

        rockFallCastDelay = 0.45f;
        rockFallHeight = 7.4f;
        rockFallDuration = 0.78f;
        rockFallRadius = 1.55f;
        rockFallDamageMultiplier = 1.25f;
        iceGolemFallingIceCount = 4;
        phase2IceGolemFallingIceCount = 8;
        iceGolemFallingIceInterval = 0.22f;
        iceGolemFallingIceSpread = 3.8f;

        smashCastDelay = 0.38f;
        iceGolemQuakeCount = 4;
        phase2IceGolemQuakeCount = 6;
        iceGolemQuakeSpacing = 1.45f;
        iceGolemQuakeStepDelay = 0.18f;
        iceGolemQuakeRadius = 1.75f;
        iceGolemQuakeDamageMultiplier = 1.1f;

        shakeDuration = 0.25f;
        shakeMagnitude = 0.2f;
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
