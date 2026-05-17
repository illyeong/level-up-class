using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;

namespace StudioNAP
{
    public static class SpriteFontMenu
    {
        [MenuItem("GameObject/StudioNAP/SpriteFont")]
        public static void MakeBtnInfo()
        {
            GameObject obj = PrefabUtility.InstantiatePrefab(Resources.Load("Prefab/SNFont")) as GameObject;
            obj.name = "SNFont";
            CreateObject(obj);
        }
        public static void CreateObject(GameObject obj)
        {
            obj.transform.parent = Selection.activeTransform;
            obj.transform.localScale = Vector3.one;

            SceneView lastView = SceneView.lastActiveSceneView;
            obj.transform.position = lastView ? lastView.pivot : Vector3.zero;
            if (obj.transform.localPosition.z != 0) obj.transform.localPosition = new Vector3(obj.transform.localPosition.x, obj.transform.localPosition.y, 0);

            StageUtility.PlaceGameObjectInCurrentStage(obj);
            GameObjectUtility.EnsureUniqueNameForSibling(obj);

            Undo.RegisterCreatedObjectUndo(obj, $"Create Object: {obj.name}");
            Selection.activeGameObject = obj;

            if (Application.isPlaying == false) EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
        }
    }
}