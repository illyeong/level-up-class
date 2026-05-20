using UnityEngine;
using System.Runtime.InteropServices;
using LayerLab.ArtMaker;

public class WebBridge : MonoBehaviour
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern void SendToReact(string json);

    [DllImport("__Internal")]
    private static extern void RegisterMessageListener(string objName, string funcName);
#endif

    [Header("연결 필요")]
    public PartsManager partsManager; // Inspector에서 Player 오브젝트의 PartsManager 연결

    void Start()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        SendToReact("{\"type\":\"UNITY_READY\"}");
        RegisterMessageListener(gameObject.name, "OnReceiveMessage");
#endif
    }

    // jslib → Unity 호출 (React 메시지 수신)
    public void OnReceiveMessage(string json)
    {
        var msg = JsonUtility.FromJson<ReactMsg>(json);
        if (msg == null) return;

        if (msg.type == "REACT_LOAD_AVATAR")
        {
            var data = JsonUtility.FromJson<LoadAvatarMsg>(json);
            if (data?.parts != null)
                ApplyPartsData(data.parts);
            if (data?.colors != null)
                ApplyColorsData(data.colors);
        }
    }

    void ApplyPartsData(PartsData p)
    {
        if (partsManager == null) return;

        partsManager.EquipParts(PartsType.Back,       p.Back);
        partsManager.EquipParts(PartsType.Beard,      p.Beard);
        partsManager.EquipParts(PartsType.Boots,      p.Boots);
        partsManager.EquipParts(PartsType.Bottom,     p.Bottom);
        partsManager.EquipParts(PartsType.Brow,       p.Brow);
        partsManager.EquipParts(PartsType.Eyes,       p.Eyes);
        partsManager.EquipParts(PartsType.Gloves,     p.Gloves);
        partsManager.EquipParts(PartsType.Hair_Short, p.Hair_Short);
        partsManager.EquipParts(PartsType.Hair_Hat,   p.Hair_Hat);
        partsManager.EquipParts(PartsType.Helmet,     p.Helmet);
        partsManager.EquipParts(PartsType.Mouth,      p.Mouth);
        partsManager.EquipParts(PartsType.Eyewear,    p.Eyewear);
        partsManager.EquipParts(PartsType.Gear_Left,  p.Gear_Left);
        partsManager.EquipParts(PartsType.Gear_Right, p.Gear_Right);
        partsManager.EquipParts(PartsType.Top,        p.Top);
        partsManager.EquipParts(PartsType.Skin,       p.Skin);

        // 불러온 파츠를 DemoControl에 등록 → 동일 파츠 재선택 시 결제 0원
        DemoControl.Instance?.SetOwnedParts(new System.Collections.Generic.Dictionary<PartsType, int>
        {
            { PartsType.Back,       p.Back       },
            { PartsType.Beard,      p.Beard      },
            { PartsType.Boots,      p.Boots      },
            { PartsType.Bottom,     p.Bottom     },
            { PartsType.Brow,       p.Brow       },
            { PartsType.Eyes,       p.Eyes       },
            { PartsType.Gloves,     p.Gloves     },
            { PartsType.Hair_Short, p.Hair_Short },
            { PartsType.Hair_Hat,   p.Hair_Hat   },
            { PartsType.Helmet,     p.Helmet     },
            { PartsType.Mouth,      p.Mouth      },
            { PartsType.Eyewear,    p.Eyewear    },
            { PartsType.Gear_Left,  p.Gear_Left  },
            { PartsType.Gear_Right, p.Gear_Right },
            { PartsType.Top,        p.Top        },
            { PartsType.Skin,       p.Skin       },
        });
    }

    void ApplyColorsData(ColorData c)
    {
        ApplyColor(PartsType.Hair_Short, c.Hair_Short);
        ApplyColor(PartsType.Brow,       c.Brow);
        ApplyColor(PartsType.Beard,      c.Beard);
        ApplyColor(PartsType.Skin,       c.Skin);
    }

    void ApplyColor(PartsType type, string hex)
    {
        if (string.IsNullOrEmpty(hex)) return;
        if (!ColorUtility.TryParseHtmlString("#" + hex, out Color color)) return;

        switch (type)
        {
            case PartsType.Hair_Short: partsManager.ChangeHairColor(color);  break;
            case PartsType.Brow:       partsManager.ChangeBrowColor(color);  break;
            case PartsType.Beard:      partsManager.ChangeBeardColor(color); break;
            case PartsType.Skin:       partsManager.ChangeSkinColor(color);  break;
        }
        ColorPresetManager.Instance?.SetSelectByColor(type, color);
    }

    // ── 직렬화 클래스 ─────────────────────────────────────────────

    [System.Serializable]
    class ReactMsg { public string type; }

    [System.Serializable]
    class LoadAvatarMsg
    {
        public string type;
        public PartsData parts;
        public ColorData colors;
    }

    [System.Serializable]
    public class ColorData
    {
        public string Hair_Short;
        public string Brow;
        public string Beard;
        public string Skin;
    }
}

// Firebase에 저장된 parts 필드 구조와 동일하게 맞춤
[System.Serializable]
public class PartsData
{
    public int Back       = -1;
    public int Beard      = -1;
    public int Boots      = -1;
    public int Bottom     = -1;
    public int Brow       =  0;
    public int Eyes       =  0;
    public int Gloves     = -1;
    public int Hair_Short = -1;
    public int Hair_Hat   = -1;
    public int Helmet     = -1;
    public int Mouth      =  0;
    public int Eyewear    = -1;
    public int Gear_Left  = -1;
    public int Gear_Right = -1;
    public int Top        = -1;
    public int Skin       =  0;
}
