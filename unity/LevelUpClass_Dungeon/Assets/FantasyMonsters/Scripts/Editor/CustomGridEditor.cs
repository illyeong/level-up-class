using Assets.FantasyMonsters.Common.Scripts.EditorScripts;
using UnityEditor;
using UnityEngine;

namespace Assets.FantasyMonsters.Common.Scripts.Editor
{
    /// <summary>
    /// Add action buttons to LayerManager script
    /// </summary>
    [CustomEditor(typeof(CustomGrid))]
    public class CustomGridEditor : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            DrawDefaultInspector();

            var script = (CustomGrid) target;

            if (GUILayout.Button("Rebuild"))
            {
                script.Rebuild();
            }
        }
    }
}