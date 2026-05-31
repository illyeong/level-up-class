using UnityEditor;

[CustomEditor(typeof(MegabearBossFSM))]
public class MegabearBossFSMEditor : Editor
{
    public override void OnInspectorGUI()
    {
        serializedObject.Update();

        DrawPropertiesExcluding(
            serializedObject,
            "m_Script",
            "poisonPoolEffectPrefab",
            "poisonPoolCooldown",
            "poisonPoolRadius",
            "poisonPoolDuration",
            "poisonTickInterval",
            "poisonTickDamageMultiplier",
            "poisonCastDelay",
            "jumpAttackCooldown",
            "jumpAnimName"
        );

        serializedObject.ApplyModifiedProperties();
    }
}
