using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;

public class DungeonSharedCanvas : MonoBehaviour
{
    public static DungeonSharedCanvas Instance { get; private set; }

    [SerializeField] private bool keepAcrossScenes = true;
    [SerializeField] private bool refreshJoystickOnSceneLoad = true;
    [SerializeField] private bool refreshPlayerHudOnSceneLoad = true;

    void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }

        Instance = this;
        if (keepAcrossScenes) DontDestroyOnLoad(gameObject);
        SceneManager.sceneLoaded += OnSceneLoaded;
    }

    void Start()
    {
        RefreshSceneBindings();
    }

    void OnDestroy()
    {
        if (Instance == this)
        {
            SceneManager.sceneLoaded -= OnSceneLoaded;
            Instance = null;
        }
    }

    void OnSceneLoaded(Scene scene, LoadSceneMode mode)
    {
        RefreshSceneBindings();
    }

    public static void RefreshActiveCanvas()
    {
        Instance?.RefreshSceneBindings();
    }

    public void RefreshSceneBindings()
    {
        EnsureEventSystem();

        if (refreshJoystickOnSceneLoad)
        {
            foreach (var joystick in FindObjectsByType<Joystick>(FindObjectsSortMode.None))
            {
                joystick.RefreshCanvas();
            }
        }

        if (refreshPlayerHudOnSceneLoad)
        {
            var playerCombat = LayerLab.ArtMaker.PlayerCombat.FindMainPlayerCombat();
            foreach (var hpBar in FindObjectsByType<PlayerHpBar>(FindObjectsSortMode.None))
            {
                if (hpBar.playerCombat == null && playerCombat != null)
                    hpBar.playerCombat = playerCombat;

                hpBar.RefreshLevel();
            }
        }
    }

    static void EnsureEventSystem()
    {
        var eventSystem = FindFirstObjectByType<EventSystem>();
        if (eventSystem != null) return;

        var go = new GameObject("EventSystem");
        go.AddComponent<EventSystem>();
        go.AddComponent<StandaloneInputModule>();
    }
}
