using UnityEditor;
using UnityEngine;

[CustomEditor(typeof(IceGolemBossFSM))]
[CanEditMultipleObjects]
public class IceGolemBossFSMEditor : Editor
{
    private void OnEnable()
    {
        serializedObject.Update();
        ForceIceGolemPatternType();
    }

    public override void OnInspectorGUI()
    {
        serializedObject.Update();
        ForceIceGolemPatternType(false);

        DrawScriptField();

        EditorGUILayout.HelpBox(
            "Ice Golem focused Inspector. Uses falling ice, empowered ice field, and frost quake patterns.",
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

        DrawSection("Ice Golem Pattern Loop");
        Draw("iceGolemPatternsStartInPhase1", "Use From Phase 1");
        Draw("iceGolemSpecialCooldown", "Pattern Cooldown");
        Draw("iceGolemPhase2CooldownMultiplier", "Rage Cooldown Multiplier");
        Draw("iceGolemSkillTriggerRange", "Pattern Trigger Range");

        DrawSubSection("Empowered Ice Field");
        Draw("iceFieldEffectPrefab", "Ice Field Effect");
        Draw("poisonPoolEffectPrefab", "Fallback Field Effect");
        Draw("poisonCastDelay", "Cast Delay");
        Draw("iceFieldRadius", "Field Radius");
        Draw("iceFieldDuration", "Field Duration");
        Draw("iceGolemFieldImpactDamageMultiplier", "Opening Hit Damage Multiplier");
        Draw("iceFieldTickInterval", "Tick Interval");
        Draw("iceFieldDamageMultiplier", "Tick Damage Multiplier");
        Draw("iceFieldMoveSpeedMultiplier", "Player Speed Multiplier");
        Draw("iceFieldSlowDuration", "Slow Duration");

        DrawSubSection("Falling Ice Barrage");
        Draw("fallingRockPrefab", "Falling Ice Prefab");
        Draw("iceSpikeWarningEffectPrefab", "Warning Effect");
        Draw("iceSpikeImpactEffectPrefab", "Impact Effect");
        Draw("rockWarningEffectPrefab", "Fallback Warning Effect");
        Draw("rockImpactEffectPrefab", "Fallback Impact Effect");
        Draw("rockFallHeight", "Fall Height");
        Draw("rockFallDuration", "Fall Duration");
        Draw("rockFallRadius", "Impact Radius");
        Draw("rockFallDamageMultiplier", "Impact Damage Multiplier");
        Draw("iceGolemFallingIceCount", "Falling Ice Count");
        Draw("phase2IceGolemFallingIceCount", "Rage Falling Ice Count");
        Draw("iceGolemFallingIceInterval", "Falling Ice Interval");
        Draw("iceGolemFallingIceSpread", "Falling Ice Spread");

        DrawSubSection("Frost Quake");
        Draw("smashCastDelay", "Cast Delay");
        Draw("iceGolemQuakeCount", "Quake Count");
        Draw("phase2IceGolemQuakeCount", "Rage Quake Count");
        Draw("iceGolemQuakeSpacing", "Quake Spacing");
        Draw("iceGolemQuakeStepDelay", "Step Delay");
        Draw("iceGolemQuakeRadius", "Damage Radius");
        Draw("iceGolemQuakeDamageMultiplier", "Damage Multiplier");

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
        if (GUILayout.Button("Apply Ice Golem Preset"))
        {
            foreach (Object targetObject in targets)
            {
                IceGolemBossFSM boss = targetObject as IceGolemBossFSM;
                if (boss == null) continue;
                Undo.RecordObject(boss, "Apply Ice Golem Preset");
                boss.ApplyIceGolemPreset();
                EditorUtility.SetDirty(boss);
            }

            serializedObject.Update();
            ForceIceGolemPatternType(false);
        }

        if (GUILayout.Button("Reset Hitbox"))
        {
            SetVector2("bodyHitboxOffset", new Vector2(0f, 1.25f));
            SetVector2("bodyHitboxSize", new Vector2(3.8f, 3.1f));
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

    private void ForceIceGolemPatternType(bool apply = true)
    {
        SerializedProperty phase2Skill = serializedObject.FindProperty("phase2Skill");
        if (phase2Skill != null)
            phase2Skill.enumValueIndex = (int)BossFSM.Phase2SkillType.IceGolem;

        if (apply)
            serializedObject.ApplyModifiedProperties();
    }
}
