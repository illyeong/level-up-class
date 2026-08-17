using UnityEditor;
using UnityEngine;

[CustomEditor(typeof(IceDragonBossFSM))]
[CanEditMultipleObjects]
public class IceDragonBossFSMEditor : Editor
{
    private void OnEnable()
    {
        serializedObject.Update();
        ForceIceDragonPatternType();
    }

    public override void OnInspectorGUI()
    {
        serializedObject.Update();
        ForceIceDragonPatternType(false);

        DrawScriptField();

        EditorGUILayout.HelpBox(
            "Ice Dragon focused Inspector. Pattern loop: frost breath, jump slam, blizzard field, falling ice.",
            MessageType.Info
        );

        DrawPresetActions();

        DrawSection("Base Stats");
        Draw("bossName", "Boss Name");
        Draw("maxHealth", "Max Health");
        Draw("attackPower", "Attack Power");
        Draw("goldDrop", "Gold Drop");
        Draw("fixedChestDiamondReward", "Chest Diamond Reward");
        Draw("fixedChestExpReward", "Chest EXP Reward");

        DrawSection("Movement / Basic Attack");
        Draw("chaseSpeed", "Chase Speed");
        Draw("phase2SpeedMultiplier", "Rage Speed Multiplier");
        Draw("attackRange", "Attack Range");
        Draw("normalAttackCooldown", "Basic Attack Cooldown");
        Draw("normalAttackEffectPrefab", "Basic Attack Effect");
        Draw("normalAttackEffectOffset", "Basic Effect Offset");
        Draw("normalAttackEffectScale", "Basic Effect Scale");
        Draw("normalAttackEffectLifetime", "Basic Effect Lifetime");
        Draw("flipNormalAttackEffectWithFacing", "Flip Basic Effect");

        DrawSection("Charge Attack");
        Draw("chargeSpeed", "Charge Speed");
        Draw("chargeAttackCooldown", "Charge Cooldown");
        Draw("chargeDuration", "Charge Duration");
        Draw("chargeDamageMultiplier", "Charge Damage Multiplier");

        DrawSection("Ice Dragon Pattern Loop");
        Draw("iceDragonPatternsStartInPhase1", "Use From Phase 1");
        Draw("iceDragonSpecialCooldown", "Pattern Cooldown");
        Draw("iceDragonPhase2CooldownMultiplier", "Rage Cooldown Multiplier");
        Draw("iceDragonSkillTriggerRange", "Pattern Trigger Range");

        DrawSubSection("Frost Breath");
        Draw("iceDragonBreathEffectPrefab", "Breath Effect");
        Draw("iceDragonBreathEffectOffset", "Breath Effect Offset");
        Draw("iceDragonBreathCastDelay", "Cast Delay");
        Draw("iceDragonBreathDuration", "Damage Duration");
        Draw("iceDragonBreathEffectLifetime", "Effect Lifetime");
        Draw("iceDragonBreathRange", "Damage Range");
        Draw("iceDragonBreathHeight", "Damage Height");
        Draw("iceDragonBreathSegmentCount", "Visual Segment Count");
        Draw("iceDragonBreathSegmentSpacing", "Visual Segment Spacing");
        Draw("iceDragonBreathSegmentScale", "Visual Segment Scale");
        Draw("iceDragonBreathTickInterval", "Tick Interval");
        Draw("iceDragonBreathDamageMultiplier", "Tick Damage Multiplier");
        Draw("iceDragonBreathSlowDuration", "Slow Duration");

        DrawSubSection("Jump Slam");
        Draw("jumpPower", "Jump Power");
        Draw("jumpMoveSpeed", "Jump Move Speed");
        Draw("jumpSlamVelocity", "Slam Velocity");
        Draw("jumpImpactRadius", "Impact Radius");
        Draw("jumpDamageMultiplier", "Damage Multiplier");
        Draw("phase2JumpSpeedMultiplier", "Rage Jump Speed Multiplier");
        Draw("phase2JumpTimingMultiplier", "Rage Jump Timing Multiplier");
        Draw("landingEffectPrefab", "Landing Effect");
        Draw("landingEffectScale", "Landing Effect Scale");
        Draw("landingEffectLifetime", "Landing Effect Lifetime");

        DrawSubSection("Blizzard Field");
        Draw("iceFieldEffectPrefab", "Ice Field Effect");
        Draw("poisonPoolEffectPrefab", "Fallback Field Effect");
        Draw("poisonCastDelay", "Cast Delay");
        Draw("iceFieldRadius", "Field Radius");
        Draw("iceFieldDuration", "Field Duration");
        Draw("iceDragonFieldImpactDamageMultiplier", "Opening Hit Damage Multiplier");
        Draw("iceDragonFieldEffectExtraLifetime", "Effect Extra Lifetime");
        Draw("iceFieldTickInterval", "Tick Interval");
        Draw("iceFieldDamageMultiplier", "Tick Damage Multiplier");
        Draw("iceFieldMoveSpeedMultiplier", "Player Speed Multiplier");
        Draw("iceFieldSlowDuration", "Slow Duration");

        DrawSubSection("Falling Ice");
        Draw("fallingRockPrefab", "Falling Ice Prefab");
        Draw("iceSpikeWarningEffectPrefab", "Warning Effect");
        Draw("iceSpikeImpactEffectPrefab", "Impact Effect");
        Draw("rockWarningEffectPrefab", "Fallback Warning Effect");
        Draw("rockImpactEffectPrefab", "Fallback Impact Effect");
        Draw("rockFallHeight", "Fall Height");
        Draw("rockFallDuration", "Fall Duration");
        Draw("rockFallRadius", "Impact Radius");
        Draw("rockFallDamageMultiplier", "Impact Damage Multiplier");
        Draw("iceDragonFallingIceCount", "Falling Ice Count");
        Draw("phase2IceDragonFallingIceCount", "Rage Falling Ice Count");
        Draw("iceDragonFallingIceInterval", "Falling Ice Interval");
        Draw("iceDragonFallingIceSpread", "Falling Ice Spread");

        DrawSection("Hit / Clear Effects");
        Draw("hitEffectPrefab", "Hit Effect");
        Draw("critHitEffectPrefab", "Critical Hit Effect");
        Draw("critBoomEffectPrefab", "Critical Boom Effect");
        Draw("clearFXPrefab", "Clear FX");
        Draw("shakeDuration", "Shake Duration");
        Draw("shakeMagnitude", "Shake Magnitude");

        DrawSection("HP UI / Clear");
        Draw("bossHpBar", "Boss HP Slider");
        Draw("bossHpFillImage", "Boss HP Fill Image");
        Draw("bossHpBarUI", "Boss HP Bar UI");
        Draw("clearPortal", "Clear Portal");

        DrawSection("Animation");
        Draw("animator", "Animator");
        Draw("skeletonAnim", "Skeleton Animation");
        Draw("skeletonGraphic", "Skeleton Graphic");
        Draw("idleAnimName", "Idle");
        Draw("walkAnimName", "Walk");
        Draw("attackAnimName", "Attack");
        Draw("chargeAnimName", "Charge");
        Draw("jumpAnimName", "Jump");
        Draw("skillAnimName", "Skill");
        Draw("hitAnimName", "Hit");
        Draw("deadAnimName", "Death");
        Draw("rageAnimName", "Rage");

        DrawSection("Target / Hitbox");
        Draw("playerTarget", "Player Target");
        Draw("applyPresetOnAwake", "Apply Preset On Awake");
        Draw("bodyHitboxOffset", "Body Hitbox Offset");
        Draw("bodyHitboxSize", "Body Hitbox Size");

        serializedObject.ApplyModifiedProperties();
    }

    private void DrawPresetActions()
    {
        EditorGUILayout.BeginHorizontal();
        if (GUILayout.Button("Apply Ice Dragon Preset"))
        {
            foreach (Object targetObject in targets)
            {
                IceDragonBossFSM boss = targetObject as IceDragonBossFSM;
                if (boss == null) continue;
                Undo.RecordObject(boss, "Apply Ice Dragon Preset");
                boss.ApplyIceDragonPreset();
                EditorUtility.SetDirty(boss);
            }

            serializedObject.Update();
            ForceIceDragonPatternType(false);
        }

        if (GUILayout.Button("Reset Hitbox"))
        {
            SetVector2("bodyHitboxOffset", new Vector2(-0.5f, 2f));
            SetVector2("bodyHitboxSize", new Vector2(8f, 6f));
        }
        EditorGUILayout.EndHorizontal();
    }

    private void DrawScriptField()
    {
        SerializedProperty script = serializedObject.FindProperty("m_Script");
        if (script == null) return;

        using (new EditorGUI.DisabledScope(true))
            EditorGUILayout.PropertyField(script);
    }

    private void DrawSection(string title)
    {
        EditorGUILayout.Space(10f);
        EditorGUILayout.LabelField(title, EditorStyles.boldLabel);
    }

    private void DrawSubSection(string title)
    {
        EditorGUILayout.Space(6f);
        EditorGUILayout.LabelField(title, EditorStyles.miniBoldLabel);
    }

    private void Draw(string propertyName, string label)
    {
        SerializedProperty property = serializedObject.FindProperty(propertyName);
        if (property == null) return;
        EditorGUILayout.PropertyField(property, new GUIContent(label), true);
    }

    private void SetVector2(string propertyName, Vector2 value)
    {
        SerializedProperty property = serializedObject.FindProperty(propertyName);
        if (property == null) return;
        property.vector2Value = value;
    }

    private void ForceIceDragonPatternType(bool apply = true)
    {
        SerializedProperty phase2Skill = serializedObject.FindProperty("phase2Skill");
        if (phase2Skill != null)
            phase2Skill.enumValueIndex = (int)BossFSM.Phase2SkillType.IceDragon;

        if (apply)
            serializedObject.ApplyModifiedProperties();
    }
}
