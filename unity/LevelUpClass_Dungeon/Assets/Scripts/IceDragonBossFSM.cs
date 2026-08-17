using UnityEngine;

/// <summary>
/// BossFSM preset for the Ice Dragon boss.
/// Pattern loop: frost breath -> jump slam -> blizzard field -> falling ice.
/// </summary>
[DisallowMultipleComponent]
public class IceDragonBossFSM : BossFSM
{
    [Header("Ice Dragon Preset")]
    public bool applyPresetOnAwake = true;

    [Header("Damage Hitbox")]
    public Vector2 bodyHitboxOffset = new Vector2(-0.5f, 2f);
    public Vector2 bodyHitboxSize = new Vector2(8f, 6f);

    private void Awake()
    {
        EnsureDamageHitbox();

        if (applyPresetOnAwake)
            ApplyIceDragonPreset();
    }

    private void Reset()
    {
        ApplyIceDragonPreset();
    }

    [ContextMenu("Apply Ice Dragon Preset")]
    public void ApplyIceDragonPreset()
    {
        bossName = "\uC544\uC774\uC2A4 \uB4DC\uB798\uACE4";

        idleAnimName = "Ready";
        walkAnimName = "Walk";
        attackAnimName = "Attack";
        chargeAnimName = "Attack";
        jumpAnimName = "Attack";
        skillAnimName = "Fire";
        hitAnimName = "Ready";
        deadAnimName = "Death";
        rageAnimName = "Fire";

        maxHealth = Mathf.Max(maxHealth, 950);
        attackPower = Mathf.Max(attackPower, 34);
        goldDrop = Mathf.Max(goldDrop, 520);
        fixedChestDiamondReward = Mathf.Max(fixedChestDiamondReward, 270);
        fixedChestExpReward = Mathf.Max(fixedChestExpReward, 250);

        chaseSpeed = 2.05f;
        chargeSpeed = 9.8f;
        phase2SpeedMultiplier = 1.35f;

        attackRange = 2.9f;
        normalAttackCooldown = 2.35f;
        chargeAttackCooldown = 7.2f;
        normalAttackEffectScale = 2.1f;
        chargeDuration = 0.58f;
        chargeDamageMultiplier = 1.85f;

        phase2Skill = Phase2SkillType.IceDragon;
        iceDragonPatternsStartInPhase1 = true;
        iceDragonSpecialCooldown = 6.2f;
        iceDragonPhase2CooldownMultiplier = 0.62f;
        iceDragonSkillTriggerRange = 9f;
        if (iceDragonBreathEffectPrefab == null)
            iceDragonBreathEffectPrefab = Resources.Load<GameObject>("IceBreathEffect");

        iceDragonBreathEffectOffset = new Vector3(2.25f, 1.35f, 0f);
        iceDragonBreathCastDelay = 0.28f;
        iceDragonBreathDuration = 0.9f;
        iceDragonBreathEffectLifetime = 1.9f;
        iceDragonBreathRange = 7.2f;
        iceDragonBreathHeight = 2.3f;
        iceDragonBreathSegmentCount = 4;
        iceDragonBreathSegmentSpacing = 1.25f;
        iceDragonBreathSegmentScale = 0.95f;
        iceDragonBreathTickInterval = 0.22f;
        iceDragonBreathDamageMultiplier = 0.95f;
        iceDragonBreathSlowDuration = 0.35f;

        jumpAttackCooldown = 0f;
        jumpPower = 8.8f;
        jumpMoveSpeed = 5.8f;
        jumpSlamVelocity = 16.5f;
        jumpImpactRadius = 3.2f;
        jumpDamageMultiplier = 1.8f;
        phase2JumpSpeedMultiplier = 1.45f;
        phase2JumpTimingMultiplier = 0.62f;
        landingEffectScale = 3.1f;
        landingEffectLifetime = 3.5f;

        poisonCastDelay = 0.42f;
        iceFieldRadius = 4f;
        iceFieldDuration = 4.6f;
        iceFieldTickInterval = 0.4f;
        iceFieldDamageMultiplier = 0.24f;
        iceFieldMoveSpeedMultiplier = 0.35f;
        iceFieldSlowDuration = 1f;
        iceDragonFieldImpactDamageMultiplier = 0.55f;
        iceDragonFieldEffectExtraLifetime = 1.6f;

        rockFallCastDelay = 0.45f;
        rockFallHeight = 7.4f;
        rockFallDuration = 0.78f;
        rockFallRadius = 1.45f;
        rockFallDamageMultiplier = 1.18f;
        if (fallingRockPrefab == null)
        {
            GameObject fallingIce = Resources.Load<GameObject>("IceDragonFallingIce");
            if (fallingIce != null)
                fallingRockPrefab = fallingIce.GetComponent<StoneGolemFallingRock>();
        }
        AssignEditorOnlyDefaultFallingIceAssets();
        iceDragonFallingIceCount = 5;
        phase2IceDragonFallingIceCount = 9;
        iceDragonFallingIceInterval = 0.22f;
        iceDragonFallingIceSpread = 4.1f;

        shakeDuration = 0.26f;
        shakeMagnitude = 0.22f;
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

    private void AssignEditorOnlyDefaultFallingIceAssets()
    {
#if UNITY_EDITOR
        if (fallingRockPrefab == null)
        {
            GameObject fallingIce = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>(
                "Assets/Layer Lab/2D Minimal-Environment/Environment 2/Prefabs/Ice/Ice_Snow_09.prefab"
            );
            if (fallingIce != null)
                fallingRockPrefab = fallingIce.GetComponent<StoneGolemFallingRock>();
        }

        if (iceSpikeWarningEffectPrefab == null)
        {
            iceSpikeWarningEffectPrefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>(
                "Assets/Layer Lab/Cartoon Casual VFX Pack/Prefabas/Explosion_Effect_Red.prefab"
            );
        }

        if (iceSpikeImpactEffectPrefab == null)
        {
            iceSpikeImpactEffectPrefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>(
                "Assets/JMO Assets/Cartoon FX Remaster/CFXR Prefabs/Misc/CFXR3 Hit Misc F Smoke.prefab"
            );
        }
#endif
    }
}
