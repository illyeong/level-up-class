using UnityEngine;

/// <summary>
/// Combined-pattern preset for the Meadow Dragon boss.
/// Pattern order: jump slam -> poison pool -> falling rocks, with charge attacks
/// handled independently by BossFSM between special attacks.
/// </summary>
[DisallowMultipleComponent]
public class MeadowDragonBossFSM : BossFSM
{
    [Header("Meadow Dragon Preset")]
    public bool applyPresetOnAwake = true;

    [Header("Damage Hitbox")]
    public Vector2 bodyHitboxOffset = new Vector2(-0.5f, 2f);
    public Vector2 bodyHitboxSize = new Vector2(8f, 6f);

    private void Awake()
    {
        EnsureDamageHitbox();

        if (applyPresetOnAwake)
            ApplyRuntimeDefaults();
    }

    private void Reset()
    {
        ApplyMeadowDragonPreset();
    }

    [ContextMenu("Apply Meadow Dragon Preset")]
    public void ApplyMeadowDragonPreset()
    {
        bossName = "\uCD08\uC6D0\uC758 \uB4DC\uB798\uACE4";

        // FantasyMonsters Dragon controller clips.
        idleAnimName = "Ready";
        walkAnimName = "Walk";
        attackAnimName = "Attack";
        chargeAnimName = "Attack";
        jumpAnimName = "Attack";
        skillAnimName = "Fire";
        hitAnimName = "Ready";
        deadAnimName = "Death";
        rageAnimName = "Fire";

        maxHealth = Mathf.Max(maxHealth, 750);
        attackPower = Mathf.Max(attackPower, 28);
        goldDrop = Mathf.Max(goldDrop, 450);
        fixedChestDiamondReward = 230;
        fixedChestExpReward = 200;

        chaseSpeed = 2.1f;
        chargeSpeed = 9f;
        phase2SpeedMultiplier = 1.3f;

        attackRange = 2.8f;
        normalAttackCooldown = 2.4f;
        chargeAttackCooldown = 7.5f;

        phase2Skill = Phase2SkillType.MeadowDragon;
        dragonPatternsStartInPhase1 = true;
        dragonSpecialCooldown = 6.5f;
        dragonPhase2CooldownMultiplier = 0.7f;
        dragonSkillTriggerRange = 8f;

        jumpAttackCooldown = 0f;
        jumpPower = 8.5f;
        jumpMoveSpeed = 5.5f;
        jumpSlamVelocity = 16f;
        jumpImpactRadius = 3f;
        jumpDamageMultiplier = 1.8f;
        landingEffectScale = 3f;
        landingEffectLifetime = 4f;

        poisonCastDelay = 0.5f;
        poisonPoolRadius = 2.8f;
        poisonPoolDuration = 3.5f;
        poisonTickInterval = 0.5f;
        poisonTickDamageMultiplier = 0.35f;

        rockFallCastDelay = 0.55f;
        rockFallInterval = 0.3f;
        rockFallHeight = 7f;
        rockFallDuration = 0.85f;
        rockFallRadius = 1.4f;
        rockFallDamageMultiplier = 1.2f;
        rockFallCount = 4;
        phase2RockFallCount = 6;
        rockFallSpread = 2.8f;

    }

    private void ApplyRuntimeDefaults()
    {
        bossName = "\uCD08\uC6D0\uC758 \uB4DC\uB798\uACE4";
        idleAnimName = "Ready";
        walkAnimName = "Walk";
        attackAnimName = "Attack";
        chargeAnimName = "Attack";
        jumpAnimName = "Attack";
        skillAnimName = "Fire";
        hitAnimName = "Ready";
        deadAnimName = "Death";
        rageAnimName = "Fire";
        phase2Skill = Phase2SkillType.MeadowDragon;
        dragonPatternsStartInPhase1 = true;
        fixedChestDiamondReward = 230;
        fixedChestExpReward = 200;
        landingEffectScale = 3f;
        landingEffectLifetime = 4f;

        // The dragon artwork extends far beyond its compact physics collider.
        // Keep a visual gap so it attacks before overlapping the player sprite.
        attackRange = Mathf.Max(attackRange, 2.8f);
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
