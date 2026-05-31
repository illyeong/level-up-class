using UnityEngine;
using UnityEngine.SceneManagement;
using System;

/// <summary>
/// 씬 전환 후에도 파괴되지 않는 싱글톤 데이터 관리자.
/// 플레이어 체력·재화·스탯을 PlayerPrefs에 저장/로드한다.
/// </summary>
public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }
    bool _autoRoutedFromMain = false;

    void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
        TryApplyDungeonIndexFromUrl();
        DontDestroyOnLoad(gameObject);

        // MobileInputReceiver가 없으면 자동 생성 (WebGL 태블릿 터치 수신)
        if (MobileInputReceiver.Instance == null)
        {
            var go = new GameObject("MobileInputReceiver");
            go.AddComponent<MobileInputReceiver>();
        }
    }

    // ── 씬 이름 상수 ──────────────────────────────────────────────
    public const string SceneLobby         = "Lobby";
    public const string SceneDungeonSelect = "DungeonSelect";
    public const string SceneClear         = "Clear";

    // 던전 씬 이름 헬퍼 (dungeonIndex 1~25)
    // 씬 파일명 규칙: D01_S1 / D01_S2 / D01_S3
    public static string SceneS1(int d)   => $"D{d:D2}_S1";
    public static string SceneS2(int d)   => $"D{d:D2}_S2";
    public static string SceneBoss(int d) => $"D{d:D2}_S3";

    // ── 플레이어 체력 ─────────────────────────────────────────────
    [Header("플레이어 체력")]
    public int maxHealth     = 100;
    public int currentHealth = 100;

    // ── 플레이어 마나 ─────────────────────────────────────────────
    [Header("플레이어 마나")]
    public int maxMana     = 100;
    public int currentMana = 100;

    // ── 레벨 ─────────────────────────────────────────────────────
    [Header("레벨")]
    public int level = 1;

    // ── 재화 ─────────────────────────────────────────────────────
    [Header("재화")]
    public int gold = 0;

    // ── 플레이어 스탯 ─────────────────────────────────────────────
    [Header("플레이어 스탯")]
    public int   attackPower          = 10;
    public int   defense              = 5;
    [Range(0, 100)]
    public int   critChance           = 20;
    public float critDamageMultiplier = 1.5f;

    // ── 강화 단계 (비용 계산용) ───────────────────────────────────
    [Header("강화 단계")]
    public int attackUpgradeLevel  = 0;
    public int defenseUpgradeLevel = 0;

    // ── 세션 통계 (씬 간 유지, 저장 안 함) ───────────────────────
    [HideInInspector] public int sessionKillCount     = 0;
    [HideInInspector] public int sessionEarnedGold    = 0;
    [HideInInspector] public int sessionEarnedDiamond = 0;

    // ── 현재 던전 번호 (React에서 수신, 1~25) ────────────────────
    [HideInInspector] public int dungeonIndex = 1;
    [HideInInspector] public bool hasReactDungeonIndex = false;

    // ── 선택된 스킬 (React에서 수신, 씬 전환 후에도 유지) ────────
    [HideInInspector] public string selectedSkill = "";

    // ── 캐릭터 외형 (씬 전환 시 재적용용) ────────────────────────
    [HideInInspector] public string savedAvatarJson = ""; // REACT_LOAD_AVATAR 전체 JSON

    public void ResetSession()
    {
        sessionKillCount     = 0;
        sessionEarnedGold    = 0;
        sessionEarnedDiamond = 0;
    }

    // WebGL iframe URL의 ?dungeonIndex= 값을 직접 읽어 초기 던전 인덱스를 고정한다.
    // (React -> Unity 메시지 타이밍 이슈가 있어도 동작하도록 하는 안전장치)
    void TryApplyDungeonIndexFromUrl()
    {
        try
        {
            int idx = ExtractDungeonIndexFromUrl(Application.absoluteURL);
            if (idx > 0)
            {
                dungeonIndex = idx;
                hasReactDungeonIndex = true;
                Debug.Log($"[GameManager] dungeonIndex from URL = {dungeonIndex}");
            }
        }
        catch (Exception e)
        {
            Debug.LogWarning($"[GameManager] Failed to parse dungeonIndex from URL: {e.Message}");
        }
    }

    void TryRouteFromDungeonMain()
    {
        if (_autoRoutedFromMain) return;
        var active = SceneManager.GetActiveScene().name;
        if (!string.Equals(active, "Dungeon_Main", StringComparison.Ordinal)) return;
        if (!hasReactDungeonIndex || dungeonIndex <= 0) return;
        if (string.IsNullOrEmpty(savedAvatarJson)) return;

        _autoRoutedFromMain = true;
        var target = SceneS1(dungeonIndex);
        Debug.Log($"[GameManager] Auto route from Dungeon_Main -> {target}");
        SceneManager.LoadScene(target);
    }

    // DungeonCharacterLoader에서 캐릭터 데이터 적용 완료 후 호출
    public void RouteToSelectedDungeon()
    {
        TryRouteFromDungeonMain();
    }

    static int ExtractDungeonIndexFromUrl(string url)
    {
        if (string.IsNullOrEmpty(url)) return 0;
        int qPos = url.IndexOf('?');
        if (qPos < 0 || qPos >= url.Length - 1) return 0;

        string query = url.Substring(qPos + 1);
        string[] pairs = query.Split('&');
        foreach (var pair in pairs)
        {
            if (string.IsNullOrEmpty(pair)) continue;
            int eq = pair.IndexOf('=');
            if (eq <= 0 || eq >= pair.Length - 1) continue;

            string key = pair.Substring(0, eq);
            if (!string.Equals(key, "dungeonIndex", StringComparison.OrdinalIgnoreCase)) continue;

            string raw = Uri.UnescapeDataString(pair.Substring(eq + 1));
            if (int.TryParse(raw, out int idx) && idx > 0) return idx;
        }
        return 0;
    }

    // JS에서 SendMessage("GameManager", "SetDungeonIndexFromJS", "2")로 직접 호출 가능
    public void SetDungeonIndexFromJS(string value)
    {
        if (int.TryParse(value, out int idx) && idx > 0)
        {
            dungeonIndex = idx;
            hasReactDungeonIndex = true;
            Debug.Log($"[GameManager] dungeonIndex from JS = {dungeonIndex}");
        }
    }

    // ─────────────────────────────────────────────────────────────

    // ── Gold ──────────────────────────────────────────────────────

    public void AddGold(int amount)
    {
        gold += amount;
        SaveData();
    }

    /// <returns>골드가 충분하면 true, 부족하면 false</returns>
    public bool SpendGold(int amount)
    {
        if (gold < amount) return false;
        gold -= amount;
        SaveData();
        return true;
    }

    // ── Health ────────────────────────────────────────────────────

    public void SyncHealth(int hp)
    {
        currentHealth = Mathf.Clamp(hp, 0, maxHealth);
        SaveData();
    }

    public void SyncMana(int mp)
    {
        currentMana = Mathf.Clamp(mp, 0, maxMana);
        SaveData();
    }

    public void FullHeal()
    {
        currentHealth = maxHealth;
        currentMana   = maxMana;
        SaveData();
    }

    // ── Scene ─────────────────────────────────────────────────────

    public void GoToScene(string sceneName)
    {
        SceneManager.LoadScene(sceneName);
    }

    // ── Upgrade cost (강화 단계마다 30% 상승) ─────────────────────

    public int GetAttackUpgradeCost()  => Mathf.RoundToInt(100 * Mathf.Pow(1.3f, attackUpgradeLevel));
    public int GetDefenseUpgradeCost() => Mathf.RoundToInt(80  * Mathf.Pow(1.3f, defenseUpgradeLevel));

    // ── Save / Load ───────────────────────────────────────────────

    void SaveData()
    {
        PlayerPrefs.SetInt  ("gold",                 gold);
        PlayerPrefs.SetInt  ("maxHealth",            maxHealth);
        PlayerPrefs.SetInt  ("currentHealth",        currentHealth);
        PlayerPrefs.SetInt  ("maxMana",              maxMana);
        PlayerPrefs.SetInt  ("currentMana",          currentMana);
        PlayerPrefs.SetInt  ("level",                level);
        PlayerPrefs.SetInt  ("attackPower",          attackPower);
        PlayerPrefs.SetInt  ("defense",              defense);
        PlayerPrefs.SetInt  ("critChance",           critChance);
        PlayerPrefs.SetFloat("critDamageMultiplier", critDamageMultiplier);
        PlayerPrefs.SetInt  ("attackUpgradeLevel",   attackUpgradeLevel);
        PlayerPrefs.SetInt  ("defenseUpgradeLevel",  defenseUpgradeLevel);
        PlayerPrefs.Save();
    }

    void LoadData()
    {
        gold                 = PlayerPrefs.GetInt  ("gold",                 0);
        maxHealth            = PlayerPrefs.GetInt  ("maxHealth",            100);
        currentHealth        = PlayerPrefs.GetInt  ("currentHealth",        100);
        maxMana              = PlayerPrefs.GetInt  ("maxMana",              100);
        currentMana          = PlayerPrefs.GetInt  ("currentMana",          100);
        level                = PlayerPrefs.GetInt  ("level",                1);
        attackPower          = PlayerPrefs.GetInt  ("attackPower",          10);
        defense              = PlayerPrefs.GetInt  ("defense",              5);
        critChance           = PlayerPrefs.GetInt  ("critChance",           20);
        critDamageMultiplier = PlayerPrefs.GetFloat("critDamageMultiplier", 1.5f);
        attackUpgradeLevel   = PlayerPrefs.GetInt  ("attackUpgradeLevel",   0);
        defenseUpgradeLevel  = PlayerPrefs.GetInt  ("defenseUpgradeLevel",  0);
    }

    /// <summary>개발/테스트용 전체 초기화</summary>
    public void ResetAllData()
    {
        PlayerPrefs.DeleteAll();
        gold                 = 0;
        maxHealth            = 100;
        currentHealth        = 100;
        attackPower          = 10;
        defense              = 5;
        critChance           = 20;
        critDamageMultiplier = 1.5f;
        attackUpgradeLevel   = 0;
        defenseUpgradeLevel  = 0;
    }
}
