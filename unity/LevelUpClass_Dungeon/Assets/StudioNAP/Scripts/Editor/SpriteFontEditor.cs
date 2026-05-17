using UnityEngine;
using UnityEditor;
using UnityEngine.U2D;

namespace StudioNAP
{

    [CustomEditor(typeof(StudioNAP.SpriteFont))]
    public class SpriteFontEditor : Editor
    {
        SerializedProperty textProperty;
        SerializedProperty spacingProperty;
        SerializedProperty alignCenterProperty;
        SerializedProperty textColorProperty;
        SerializedProperty waggleProperty;
        SerializedProperty waggleAmountProperty;
        SerializedProperty prefixSpriteProperty;
        SerializedProperty prefixOffsetProperty;
        SerializedProperty sortingOrderProperty;
        SerializedProperty sortingLayerNameProperty;
        private StudioNAP.SpriteFont spriteFont;
        private string previousText = "";
        private Color previousColor;
        private SpriteAtlas atlas;
        private SpriteAtlas previousAtlas;
        private bool previousWaggle;
        private float previousWaggleAmount;
        private Sprite previousPrefixSprite;
        private Vector3 previousPrefixOffset;
        private int previousSortingOrder;
        private string previousSortingLayerName;

        private void OnEnable()
        {
            spriteFont = (StudioNAP.SpriteFont)target;
            textProperty = serializedObject.FindProperty("_text");
            spacingProperty = serializedObject.FindProperty("spacing");
            alignCenterProperty = serializedObject.FindProperty("alignCenter");
            textColorProperty = serializedObject.FindProperty("textColor");
            waggleProperty = serializedObject.FindProperty("Waggle");
            waggleAmountProperty = serializedObject.FindProperty("waggleAmount");
            prefixSpriteProperty = serializedObject.FindProperty("PrefixSprite");
            prefixOffsetProperty = serializedObject.FindProperty("PrefixOffset");
            sortingOrderProperty = serializedObject.FindProperty("sortingOrder");
            sortingLayerNameProperty = serializedObject.FindProperty("sortingLayerName");

            previousWaggle = waggleProperty.boolValue;
            previousWaggleAmount = waggleAmountProperty.floatValue;
            previousPrefixSprite = prefixSpriteProperty.objectReferenceValue as Sprite;
            previousPrefixOffset = prefixOffsetProperty.vector3Value;
            previousColor = textColorProperty.colorValue;
            previousText = textProperty.stringValue;
            previousSortingOrder = sortingOrderProperty.intValue;
            previousSortingLayerName = sortingLayerNameProperty.stringValue;
            atlas = spriteFont.Atlas;
            previousAtlas = atlas;
        }

        public override void OnInspectorGUI()
        {
            serializedObject.Update();

            EditorGUI.BeginChangeCheck();

            EditorGUILayout.PropertyField(textProperty, new GUIContent("Text"));
            bool textChanged = previousText != textProperty.stringValue;
            if (textChanged)
            {
                previousText = textProperty.stringValue;
                serializedObject.ApplyModifiedProperties();

            }

            EditorGUI.BeginChangeCheck();
            EditorGUILayout.PropertyField(spacingProperty, new GUIContent("Spacing"));
            EditorGUILayout.PropertyField(alignCenterProperty, new GUIContent("Align Center"));
            EditorGUILayout.PropertyField(textColorProperty, new GUIContent("Text Color"));
            EditorGUILayout.PropertyField(sortingOrderProperty, new GUIContent("Sorting Order"));
            EditorGUILayout.PropertyField(sortingLayerNameProperty, new GUIContent("Sorting Layer Name"));

            Color currentColor = textColorProperty.colorValue;
            bool colorChanged = previousColor != currentColor;

            if (EditorGUI.EndChangeCheck() || colorChanged)
            {
                spriteFont.textColor = currentColor;
                previousColor = currentColor;

                serializedObject.ApplyModifiedProperties();
            }

            // SpriteAtlas 필드 커스텀 표시
            EditorGUI.BeginChangeCheck();
            atlas = (SpriteAtlas)EditorGUILayout.ObjectField("Sprite Atlas", atlas, typeof(SpriteAtlas), false);
            bool atlasChanged = previousAtlas != atlas;
            if (EditorGUI.EndChangeCheck())
            {
                spriteFont.Atlas = atlas;
                previousAtlas = atlas;
            }
            if (atlasChanged)
            {
                spriteFont.ClearDics();
            }

            EditorGUI.BeginChangeCheck();
            waggleProperty.boolValue = EditorGUILayout.Toggle("Waggle", waggleProperty.boolValue);
            bool waggleChanged = previousWaggle != waggleProperty.boolValue;
            if (EditorGUI.EndChangeCheck() || waggleChanged)
            {
                if (waggleChanged)
                {
                    previousWaggle = waggleProperty.boolValue;
                }

                serializedObject.ApplyModifiedProperties();
            }

            EditorGUI.BeginChangeCheck();
            waggleAmountProperty.floatValue = EditorGUILayout.Slider("Waggle Amount", waggleAmountProperty.floatValue, 0.01f, 0.5f);
            bool waggleAmountChanged = previousWaggleAmount != waggleAmountProperty.floatValue;
            if (EditorGUI.EndChangeCheck() || waggleAmountChanged)
            {
                previousWaggleAmount = waggleAmountProperty.floatValue;
                serializedObject.ApplyModifiedProperties();
            }

            EditorGUI.BeginChangeCheck();
            prefixSpriteProperty.objectReferenceValue = (Sprite)EditorGUILayout.ObjectField("Prefix Sprite", previousPrefixSprite, typeof(Sprite), false);
            bool prefixSpriteChanged = previousPrefixSprite != prefixSpriteProperty.objectReferenceValue;
            if (EditorGUI.EndChangeCheck() || prefixSpriteChanged)
            {
                previousPrefixSprite = prefixSpriteProperty.objectReferenceValue as Sprite;
                serializedObject.ApplyModifiedProperties();
                spriteFont.UpdatePrefixSprite();
            }

            EditorGUI.BeginChangeCheck();
            prefixOffsetProperty.vector3Value = EditorGUILayout.Vector3Field("Prefix Offset", prefixOffsetProperty.vector3Value);
            bool prefixOffsetChanged = previousPrefixOffset != prefixOffsetProperty.vector3Value;
            if (EditorGUI.EndChangeCheck() || prefixOffsetChanged)
            {
                previousPrefixOffset = prefixOffsetProperty.vector3Value;
                serializedObject.ApplyModifiedProperties();
            }

            EditorGUI.BeginChangeCheck();
            sortingOrderProperty.intValue = EditorGUILayout.IntField("Sorting Order", sortingOrderProperty.intValue);
            bool sortingOrderChanged = previousSortingOrder != sortingOrderProperty.intValue;
            if (EditorGUI.EndChangeCheck() || sortingOrderChanged)
            {
                previousSortingOrder = sortingOrderProperty.intValue;
                serializedObject.ApplyModifiedProperties();
            }

            EditorGUI.BeginChangeCheck();
            sortingLayerNameProperty.stringValue = EditorGUILayout.TextField("Sorting Layer Name", sortingLayerNameProperty.stringValue);
            bool sortingLayerNameChanged = previousSortingLayerName != sortingLayerNameProperty.stringValue;
            if (EditorGUI.EndChangeCheck() || sortingLayerNameChanged)
            {
                previousSortingLayerName = sortingLayerNameProperty.stringValue;
                serializedObject.ApplyModifiedProperties();
            }

            if (atlasChanged || colorChanged || textChanged || waggleChanged || waggleAmountChanged ||
             prefixSpriteChanged || prefixOffsetChanged || sortingOrderChanged || sortingLayerNameChanged || GUI.changed)
            {
                spriteFont.EditorUpdateText();
                EditorUtility.SetDirty(spriteFont);
                SceneView.RepaintAll();
            }
        }
    }
}
