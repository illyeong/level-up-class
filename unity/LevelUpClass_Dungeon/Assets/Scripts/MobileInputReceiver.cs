using UnityEngine;
using LayerLab.ArtMaker;

/// <summary>
/// HTML 오버레이 조이스틱에서 SendMessage로 받는 수신기.
/// DontDestroyOnLoad로 씬 전환 후에도 유지됩니다.
/// </summary>
public class MobileInputReceiver : MonoBehaviour
{
    public static MobileInputReceiver Instance { get; private set; }

    void Awake()
    {
        if (Instance != null && Instance != this) { Destroy(gameObject); return; }
        Instance = this;
        DontDestroyOnLoad(gameObject);
    }

    // JavaScript: unityInstance.SendMessage('MobileInputReceiver', 'SetHorizontal', '0.8')
    public void SetHorizontal(string value)
    {
        if (float.TryParse(value,
            System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture,
            out float h))
        {
            MobileInput.horizontal     = h;
            MobileInput.isMovingButton = Mathf.Abs(h) > 0.05f;
        }
    }

    // JavaScript: unityInstance.SendMessage('MobileInputReceiver', 'SetAttack', '1')
    public void SetAttack(string value)
    {
        if (value == "1")
            MobileInput.isAttackPressed = true;
    }

    void LateUpdate()
    {
        // isAttackPressed는 1프레임 플래그이므로 매 프레임 리셋
        MobileInput.isAttackPressed = false;
    }
}
