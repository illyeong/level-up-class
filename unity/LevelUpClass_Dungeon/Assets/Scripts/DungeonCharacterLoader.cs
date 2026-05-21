using UnityEngine;
using System.Runtime.InteropServices;

/// <summary>
/// 탐험던전 입장 시 React에서 보내는 REACT_LOAD_AVATAR 메시지를 수신해
/// Player의 PartsManager에 파츠와 색상을 적용합니다.
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
        // React에 준비 완료 신호 → React가 캐릭터 데이터를 보내줌
        SendDungeonResultToReact("{\"type\":\"DUNGEON_READY\"}");
#endif
    }

    public void OnReceiveMessage(string json)
    {
        var msg = JsonUtility.FromJson<MsgBase>(json);
        if (msg?.type != "REACT_LOAD_AVATAR") return;

        var data = JsonUtility.FromJson<LoadAvatarMsg>(json);
        if (data == null) return;

        // 스탯 먼저 적용 (PlayerCombat.Start()보다 늦게 받는 경우 직접 반영)
        if (data.stats != null) ApplyStats(data.stats);

        // GameManager에 저장 → 씬 전환 후 재적용용
        if (GameManager.Instance != null)
        {
            if (data.parts  != null) GameManager.Instance.savedPartsJson  = ExtractJson(json, "parts");
            if (data.colors != null) GameManager.Instance.savedColorsJson = ExtractJson(json, "colors");
        }

        var pm = FindPartsManager();
        if (pm != null)
        {
            if (data.parts  != null) ApplyParts(pm, data.parts);
            if (data.colors != null) ApplyColors(pm, data.colors);
        }
    }

    LayerLab.ArtMaker.PartsManager FindPartsManager()
    {
        // Character 오브젝트에서 찾기
        var character = GameObject.Find("Character");
        if (character != null)
        {
            var pm = character.GetComponentInChildren<LayerLab.ArtMaker.PartsManager>();
            if (pm != null) return pm;
        }
        return FindFirstObjectByType<LayerLab.ArtMaker.PartsManager>();
    }

    /// <summary>씬 전환 후 GameManager에 저장된 외형 재적용 (Stage2, BossScene 등에서 호출)</summary>
    public static void ApplyFromGameManager()
    {
        var gm = GameManager.Instance;
        if (gm == null) return;

        var pm = FindFirstObjectByType<DungeonCharacterLoader>()?.FindPartsManager()
              ?? FindFirstObjectByType<LayerLab.ArtMaker.PartsManager>();
        if (pm == null) return;

        if (!string.IsNullOrEmpty(gm.savedPartsJson))
        {
            var p = JsonUtility.FromJson<PartsData>("{" + gm.savedPartsJson + "}");
            if (p != null) FindFirstObjectByType<DungeonCharacterLoader>()?.ApplyParts(pm, p);
        }
        if (!string.IsNullOrEmpty(gm.savedColorsJson))
        {
            var c = JsonUtility.FromJson<ColorData>("{" + gm.savedColorsJson + "}");
            if (c != null) FindFirstObjectByType<DungeonCharacterLoader>()?.ApplyColors(pm, c);
        }
    }

    // JSON 문자열에서 특정 키의 값(object) 추출
    static string ExtractJson(string fullJson, string key)
    {
        // 단순 추출 — 중첩 객체 처리
        var search = $"\"{key}\":";
        int start  = fullJson.IndexOf(search);
        if (start < 0) return "";
        start += search.Length;
        int depth = 0; int end = start;
        for (; end < fullJson.Length; end++)
        {
            if (fullJson[end] == '{') depth++;
            else if (fullJson[end] == '}') { if (--depth < 0) break; }
            else if (fullJson[end] == ',' && depth == 0) break;
        }
        return fullJson.Substring(start, end - start).Trim().Trim('{', '}');
    }

    void ApplyStats(StatsData s)
    {
        var gm = GameManager.Instance;
        if (gm == null) return;

        gm.level         = s.level;
        gm.gold          = s.gold;
        gm.maxHealth     = s.maxHealth > 0 ? s.maxHealth : gm.maxHealth;
        gm.currentHealth = s.currentHealth > 0 ? s.currentHealth : gm.maxHealth;

        // 레벨 기반 스탯 계산 (기본 + 레벨당 증가)
        gm.attackPower = 10 + (s.level - 1) * 2;
        gm.defense     = 5  + (s.level - 1) * 1;

        // PlayerCombat이 이미 Start()를 지났으면 직접 반영
        var pc = FindFirstObjectByType<LayerLab.ArtMaker.PlayerCombat>();
        if (pc != null)
        {
            pc.maxHealth     = gm.maxHealth;
            pc.currentHealth = gm.currentHealth;
            pc.attackPower   = gm.attackPower;
            pc.defense       = gm.defense;
        }

        Debug.Log($"[DungeonCharacterLoader] 스탯 적용 — Lv.{s.level} HP:{s.currentHealth}/{s.maxHealth} ATK:{gm.attackPower}");
    }

    void ApplyParts(LayerLab.ArtMaker.PartsManager pm, PartsData p)
    {
        // 파츠 맵핑 초기화 (Init 없이는 EquipParts가 파츠를 못 찾음)
        pm.Init();

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

    void ApplyColors(LayerLab.ArtMaker.PartsManager pm, ColorData c)
    {
        TryColor(c.Hair_Short, color => pm.ChangeHairColor(color));
        TryColor(c.Brow,       color => pm.ChangeBrowColor(color));
        TryColor(c.Beard,      color => pm.ChangeBeardColor(color));
        TryColor(c.Skin,       color => pm.ChangeSkinColor(color));
    }

    void TryColor(string hex, System.Action<Color> apply)
    {
        if (string.IsNullOrEmpty(hex)) return;
        if (ColorUtility.TryParseHtmlString("#" + hex, out Color color))
            apply(color);
    }

    // ── 직렬화 ────────────────────────────────────────────────────

    [System.Serializable] class MsgBase { public string type; }

    [System.Serializable]
    class LoadAvatarMsg
    {
        public string    type;
        public PartsData parts;
        public ColorData colors;
        public StatsData stats;
    }

    [System.Serializable]
    class StatsData
    {
        public int level         = 1;
        public int exp           = 0;
        public int maxExp        = 1000;
        public int gold          = 0;
        public int diamonds      = 0;
        public int maxHealth     = 100;
        public int currentHealth = 100;
    }

    [System.Serializable]
    class ColorData { public string Hair_Short, Brow, Beard, Skin; }

    [System.Serializable]
    class PartsData
    {
        public int Back = -1, Beard = -1, Boots = -1, Bottom = -1;
        public int Brow = 0,  Eyes  =  0, Gloves = -1;
        public int Hair_Short = -1, Hair_Hat = -1, Helmet = -1;
        public int Mouth = 0, Eyewear = -1;
        public int Gear_Left = -1, Gear_Right = -1;
        public int Top = -1, Skin = 0;
    }
}
