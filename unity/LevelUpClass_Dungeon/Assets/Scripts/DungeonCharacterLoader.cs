using UnityEngine;
using System.Runtime.InteropServices;

/// <summary>
/// Dungeon_Main 씬에서 React로부터 REACT_LOAD_AVATAR 메시지를 수신해
/// 캐릭터 외형 + 스탯을 적용하고, GameManager에 저장해 다음 씬에서도 유지.
/// 오브젝트 이름이 정확히 "DungeonCharacterLoader" 여야 합니다.
/// </summary>
public class DungeonCharacterLoader : MonoBehaviour
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern void RegisterMessageListener(string objName, string funcName);
    [DllImport("__Internal")]
    private static extern void SendDungeonResultToReact(string json);
#endif

    void Start()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        RegisterMessageListener(gameObject.name, "OnReceiveMessage");
        SendDungeonResultToReact("{\"type\":\"DUNGEON_READY\"}");
#endif
    }

    public void OnReceiveMessage(string json)
    {
        var msg = JsonUtility.FromJson<MsgBase>(json);
        if (msg?.type != "REACT_LOAD_AVATAR") return;

        var data = JsonUtility.FromJson<LoadAvatarMsg>(json);
        if (data == null) return;

        // GameManager에 JSON 저장 → 씬 전환 후 CharacterAutoSetup이 재사용
        if (GameManager.Instance != null)
            GameManager.Instance.savedAvatarJson = json;

        if (data.stats != null)
        {
            ApplyStats(data.stats);
            FindFirstObjectByType<PlayerHpBar>()?.RefreshLevel();
        }

        var pm = FindFirstObjectByType<LayerLab.ArtMaker.PartsManager>();
        if (pm != null)
        {
            pm.Init();
            if (data.parts  != null) ApplyParts(pm, data.parts);
            if (data.colors != null) ApplyColors(pm, data.colors);
        }

        // 선택된 스킬 → GameManager 저장 + 씬의 SkillButtonUI 직접 주입
        if (GameManager.Instance != null)
        {
            // 배열 우선, 없으면 단일값 변환
            if (data.selectedSkills != null && data.selectedSkills.Length > 0)
            {
                GameManager.Instance.selectedSkills = data.selectedSkills;
                GameManager.Instance.selectedSkill  = data.selectedSkills[0];
            }
            else if (!string.IsNullOrEmpty(data.selectedSkill))
            {
                GameManager.Instance.selectedSkill  = data.selectedSkill;
                GameManager.Instance.selectedSkills = new[] { data.selectedSkill };
            }

            // 이미 씬에 있는 SkillButtonUI에 직접 주입 (비활성 포함 — 숨겨진 버튼도 탐색)
            var uiList = FindObjectsByType<SkillButtonUI>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < uiList.Length && i < GameManager.Instance.selectedSkills.Length; i++)
                uiList[i].ShowSkill(GameManager.Instance.selectedSkills[i]);
        }

        // 캐릭터 데이터 적용이 끝난 뒤에만 던전 씬으로 이동
        if (GameManager.Instance != null)
            GameManager.Instance.RouteToSelectedDungeon();
    }

    static void ApplyStats(StatsData s)
    {
        var gm = GameManager.Instance;
        if (gm == null) return;

        int resolvedLevel = s.level > 0 ? s.level : (s.classLevel > 0 ? s.classLevel : gm.level);
        gm.level         = resolvedLevel;
        gm.gold          = s.gold;
        gm.maxHealth     = s.maxHealth > 0 ? s.maxHealth : (s.hp > 0 ? s.hp : gm.maxHealth);
        gm.currentHealth = s.currentHealth > 0 ? Mathf.Min(s.currentHealth, gm.maxHealth) : gm.maxHealth;

        int fallbackAttack  = 10 + (resolvedLevel - 1) * 2;
        int fallbackDefense = 5  + (resolvedLevel - 1) * 1;
        gm.attackPower      = s.attack > 0 ? s.attack : (s.attackPower > 0 ? s.attackPower : fallbackAttack);
        gm.defense          = s.defense > 0 ? s.defense : fallbackDefense;

        if (s.crit > 0)
            gm.critChance = Mathf.Clamp(s.crit, 0, 100);

        if (s.dungeonIndex > 0)
        {
            gm.dungeonIndex = s.dungeonIndex;
            gm.hasReactDungeonIndex = true;
        }

        var pc = LayerLab.ArtMaker.PlayerCombat.FindMainPlayerCombat();
        if (pc != null)
        {
            pc.maxHealth     = gm.maxHealth;
            pc.currentHealth = gm.currentHealth;
            pc.attackPower   = gm.attackPower;
            pc.defense       = gm.defense;
            pc.critChance    = gm.critChance;
        }
    }

    public static void ApplyParts(LayerLab.ArtMaker.PartsManager pm, PartsData p)
    {
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Back,       p.Back);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Beard,      p.Beard);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Boots,      p.Boots);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Bottom,     p.Bottom);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Brow,       p.Brow);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Eyes,       p.Eyes);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Gloves,     p.Gloves);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Hair_Short, p.Hair_Short);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Hair_Hat,   p.Hair_Hat);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Helmet,     p.Helmet);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Mouth,      p.Mouth);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Eyewear,    p.Eyewear);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Gear_Left,  p.Gear_Left);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Gear_Right, p.Gear_Right);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Top,        p.Top);
        pm.EquipParts(LayerLab.ArtMaker.PartsType.Skin,       p.Skin);
    }

    public static void ApplyColors(LayerLab.ArtMaker.PartsManager pm, ColorData c)
    {
        TryColor(c.Hair_Short, pm.ChangeHairColor);
        TryColor(c.Brow,       pm.ChangeBrowColor);
        TryColor(c.Beard,      pm.ChangeBeardColor);
        TryColor(c.Skin,       pm.ChangeSkinColor);
    }

    static void TryColor(string hex, System.Action<Color> apply)
    {
        if (string.IsNullOrEmpty(hex)) return;
        if (ColorUtility.TryParseHtmlString("#" + hex, out Color color))
            apply(color);
    }

    // ── 직렬화 클래스 (CharacterAutoSetup과 공유) ────────────────

    [System.Serializable] class MsgBase { public string type; }

    [System.Serializable]
    public class LoadAvatarMsg
    {
        public string    type;
        public PartsData parts;
        public ColorData colors;
        public StatsData stats;
        public string    selectedSkill;            // 단일 호환용
        public string[]  selectedSkills;           // 다중 슬롯용
    }

    [System.Serializable]
    public class StatsData
    {
        public int level=1, exp=0, maxExp=1000, gold=0, diamonds=0;
        public int classLevel=1;
        public int hp=0;
        public int attack=0;
        public int attackPower=0;
        public int defense=0;
        public int crit=0;
        public int attackSpeed=0;
        public int maxHealth=100, currentHealth=100;
        public int dungeonIndex=1;
    }

    [System.Serializable]
    public class ColorData { public string Hair_Short, Brow, Beard, Skin; }

    [System.Serializable]
    public class PartsData
    {
        public int Back=-1, Beard=-1, Boots=-1, Bottom=-1;
        public int Brow=0, Eyes=0, Gloves=-1;
        public int Hair_Short=-1, Hair_Hat=-1, Helmet=-1;
        public int Mouth=0, Eyewear=-1;
        public int Gear_Left=-1, Gear_Right=-1;
        public int Top=-1, Skin=0;
    }
}
