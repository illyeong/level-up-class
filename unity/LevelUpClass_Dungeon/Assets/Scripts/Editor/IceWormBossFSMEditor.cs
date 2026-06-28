using UnityEditor;
using UnityEngine;

[CustomEditor(typeof(IceWormBossFSM))]
[CanEditMultipleObjects]
public class IceWormBossFSMEditor : Editor
{
    private void OnEnable()
    {
        serializedObject.Update();
        ForceIceWormPatternType();
    }

    public override void OnInspectorGUI()
    {
        serializedObject.Update();
        ForceIceWormPatternType(false);

        DrawScriptField();

        EditorGUILayout.HelpBox(
            "Ice Worm focused Inspector. Shared BossFSM fields for poison, golem, and dragon patterns are hidden.",
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

        DrawSection("Ice Worm Patterns");
        Draw("iceWormPatternsStartInPhase1", "Use From Phase 1");
        Draw("iceWormSpecialCooldown", "Pattern Cooldown");
        Draw("iceWormPhase2CooldownMultiplier", "Rage Cooldown Multiplier");
        Draw("iceWormSkillTriggerRange", "Pattern Trigger Range");

        DrawSubSection("Burrow Ambush");
        Draw("iceBurrowEffectPrefab", "Burrow Effect");
        Draw("iceEmergeEffectPrefab", "Emerge Effect");
        Draw("iceBurrowDuration", "Burrow Duration");
        Draw("iceEmergeOffsetFromPlayer", "Emerge Offset From Player");
        Draw("iceEmergeRadius", "Emerge Damage Radius");
        Draw("iceEmergeDamageMultiplier", "Emerge Damage Multiplier");

        DrawSubSection("Frozen Field");
        Draw("iceFieldEffectPrefab", "Ice Field Effect");
        Draw("poisonCastDelay", "Cast Delay");
        Draw("iceFieldRadius", "Field Radius");
        Draw("iceFieldDuration", "Field Duration");
        Draw("iceFieldTickInterval", "Tick Interval");
        Draw("iceFieldDamageMultiplier", "Tick Damage Multiplier");
        Draw("iceFieldMoveSpeedMultiplier", "Player Speed Multiplier");
        Draw("iceFieldSlowDuration", "Slow Duration");

        DrawSubSection("Ice Spike Barrage");
        Draw("fallingRockPrefab", "Falling Ice Prefab");
        Draw("iceSpikeWarningEffectPrefab", "Warning Effect");
        Draw("iceSpikeImpactEffectPrefab", "Impact Effect");
        Draw("rockFallHeight", "Fall Height");
        Draw("rockFallDuration", "Fall Duration");
        Draw("rockFallRadius", "Impact Radius");
        Draw("rockFallDamageMultiplier", "Impact Damage Multiplier");
        Draw("iceSpikeCount", "Spike Count");
        Draw("phase2IceSpikeCount", "Rage Spike Count");
        Draw("iceSpikeInterval", "Spike Interval");
        Draw("iceSpikeSpread", "Spike Spread");

        DrawSection("Hit / Emerge / Clear Effects");
        Draw("hitEffectPrefab", "Hit Effect");
        Draw("critHitEffectPrefab", "Critical Hit Effect");
        Draw("critBoomEffectPrefab", "Critical Boom Effect");
        Draw("landingEffectPrefab", "Emerge Fallback Effect");
        Draw("landingEffectScale", "Fallback Effect Scale");
        Draw("landingEffectLifetime", "Fallback Effect Lifetime");
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
        if (GUILayout.Button("Apply Ice Worm Preset"))
        {
            foreach (Object targetObject in targets)
            {
                IceWormBossFSM boss = targetObject as IceWormBossFSM;
                if (boss == null) continue;
                Undo.RecordObject(boss, "Apply Ice Worm Preset");
                boss.ApplyIceWormPreset();
                EditorUtility.SetDirty(boss);
            }

            serializedObject.Update();
            ForceIceWormPatternType(false);
        }

        if (GUILayout.Button("Reset Hitbox"))
        {
            SetVector2("bodyHitboxOffset", new Vector2(-0.15f, 1.15f));
            SetVector2("bodyHitboxSize", new Vector2(4.4f, 2.9f));
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

    private void ForceIceWormPatternType(bool apply = true)
    {
        SerializedProperty phase2Skill = serializedObject.FindProperty("phase2Skill");
        if (phase2Skill != null)
            phase2Skill.enumValueIndex = (int)BossFSM.Phase2SkillType.IceWorm;

        if (apply)
            serializedObject.ApplyModifiedProperties();
    }
}
