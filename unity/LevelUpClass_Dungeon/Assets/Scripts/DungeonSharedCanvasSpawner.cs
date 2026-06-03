using UnityEngine;

public class DungeonSharedCanvasSpawner : MonoBehaviour
{
    [SerializeField] private GameObject sharedCanvasPrefab;
    [SerializeField] private string resourcesPath = "DungeonSharedCanvas";

    void Awake()
    {
        EnsureSharedCanvas();
    }

    public void EnsureSharedCanvas()
    {
        if (DungeonSharedCanvas.Instance != null || FindFirstObjectByType<DungeonSharedCanvas>() != null)
            return;

        var prefab = sharedCanvasPrefab != null
            ? sharedCanvasPrefab
            : Resources.Load<GameObject>(resourcesPath);

        if (prefab == null)
        {
            Debug.LogWarning($"[DungeonSharedCanvasSpawner] Shared canvas prefab not found. Put it at Resources/{resourcesPath}.prefab or assign it in the inspector.");
            return;
        }

        var instance = Instantiate(prefab);
        instance.name = prefab.name;

        if (instance.GetComponent<DungeonSharedCanvas>() == null)
            instance.AddComponent<DungeonSharedCanvas>();
    }
}
