using System;
using TMPro; 
using UnityEngine;
using UnityEngine.UI;
using System.Runtime.InteropServices; 

namespace LayerLab.ArtMaker
{
    public enum PlayMode { None, Home, Experience }

    public class DemoControl : MonoBehaviour
    {
        public static DemoControl Instance { get; private set; }
        public Action<PlayMode> OnPlayMode { get; set; }
        public PlayMode CurrentPlayMode { get; set; } 

        [field: SerializeField] public PanelParts PanelParts { get; set; }
        [field: SerializeField] public PanelPreset PanelPreset { get; set; }
        [field: SerializeField] public PresetData PresetData { get; set; }

        public string pathAsset; 

        [SerializeField] private Sprite[] sprites;
        [SerializeField] private Button buttonHome, buttonRandomParts, buttonExperience;
        [SerializeField] private GameObject buttonMouseMove;
        
        [Header("Payment & UI Fix (WebGL)")]
        [SerializeField] private GameObject purchaseButton; 
        [SerializeField] private RectTransform panelPartsRect; 
        [SerializeField] private TextMeshProUGUI textTotalDiamonds; 
        private int currentTotalCost = 0;

        #if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void SendPurchaseDataToReact(int totalCost, string equipmentJson);
        #endif

        private void Awake() { Instance = this; }

        private void Start()
        {
            ChangeMode(PlayMode.Home);
            Init();
            ForceUpdateUI(); 
        }

        public void Init()
        {
            Player.Instance.PartsManager.Init();
            CameraControl.Instance.Init();
            Player.Instance.Init();
            PanelParts.Init();
            PanelPreset.Init();
            AnimationController.Instance.Init();
            
            ColorPresetManager.Instance.SetRandomAllColor();
            StartCoroutine(UpdateHexAfterRandomColors());
            Player.Instance.PartsManager.ClearClothes(); 

            Player.Instance.PartsManager.OnChangedParts += (type, index) => UpdateDiamondCost();
            UpdateDiamondCost(); 
        }

        public static bool CanChangeColor(PartsType partsType) => 
            partsType is PartsType.Hair_Short or PartsType.Brow or PartsType.Beard or PartsType.Skin;

        // 🔥 [수정] 억지로 위치를 바꾸던 버그 코드를 제거했습니다.
        public void ForceUpdateUI()
        {
            Canvas.ForceUpdateCanvases();
            if (panelPartsRect != null) LayoutRebuilder.ForceRebuildLayoutImmediate(panelPartsRect);
            if (purchaseButton != null) purchaseButton.SetActive(CurrentPlayMode == PlayMode.Home);
        }

        public void UpdateDiamondCost()
        {
            int count = 0;
            var activeIndices = Player.Instance.PartsManager.ActiveIndices;
            foreach (var slot in PanelParts.partsSlots)
            {
                var pType = slot.PartsType;
                if (pType == PartsType.None || pType == PartsType.Skin) continue;
                if (activeIndices.TryGetValue(pType, out int idx))
                {
                    if (slot.CanHide) { if (idx >= 0) count++; }
                    else { if (idx > 0) count++; }
                }
            }
            currentTotalCost = count * 100;
            if (textTotalDiamonds != null) textTotalDiamonds.text = $"결제하기\n{currentTotalCost} 다이아";
            
            Canvas.ForceUpdateCanvases();
        }

        public void ChangeMode(PlayMode playMode)
        {
            if (CurrentPlayMode == playMode) return;
            CurrentPlayMode = playMode;
            OnPlayMode?.Invoke(playMode);

            if (playMode == PlayMode.Home)
            {
                buttonMouseMove.SetActive(false);
                buttonRandomParts.gameObject.SetActive(true);
                buttonExperience.gameObject.SetActive(true);
                buttonHome.gameObject.SetActive(false);
            }
            else
            {
                buttonMouseMove.SetActive(true);
                buttonRandomParts.gameObject.SetActive(false);
                buttonExperience.gameObject.SetActive(false);
                buttonHome.gameObject.SetActive(true);
            }
            ForceUpdateUI();
        }

        public void OnClick_PaymentAndSave()
        {
            string jsonParts = "{";
            foreach (var pair in Player.Instance.PartsManager.ActiveIndices) jsonParts += $"\"{pair.Key}\":{pair.Value},";
            jsonParts = jsonParts.TrimEnd(',') + "}"; 

            #if UNITY_WEBGL && !UNITY_EDITOR
                SendPurchaseDataToReact(currentTotalCost, jsonParts);
            #endif
            Debug.Log($"[유니티] 결제 다이아: {currentTotalCost}, 데이터: {jsonParts}");
        }

        public void OnClick_RandomParts()
        {
            AudioManager.Instance.PlaySound(SoundList.ButtonRandom, 0.7f);
            PanelParts.PanelPartsList.OnClick_Close(false);
            Player.Instance.PartsManager.RandomParts();
            ColorPresetManager.Instance.SetRandomAllColor();
            StartCoroutine(UpdateHexAfterRandomColors());
        }

        private System.Collections.IEnumerator UpdateHexAfterRandomColors()
        {
            yield return new WaitForEndOfFrame();
            yield return new WaitForEndOfFrame(); 
            if (ColorFavoriteManager.Instance != null && ColorPicker.Instance != null)
            {
                var currentPartsTypeField = typeof(ColorPicker).GetField("_currentPartsType", 
                    System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
                if (currentPartsTypeField?.GetValue(ColorPicker.Instance) is PartsType currentPartsType && currentPartsType != PartsType.None)
                {
                    Color currentColor = ColorPresetManager.Instance.GetColorByType(currentPartsType);
                    ColorFavoriteManager.Instance.UpdateHexDisplay(currentColor);
                }
            }
        }

        public Sprite GetSprite(string name) { foreach (var t in sprites) { if (t.name == name.Split("/")[1]) return t; } return null; }
        public void OnClick_Experience() { Player.Instance.SetCollider(true); AudioManager.Instance.PlaySound(SoundList.ButtonDefault); ChangeMode(PlayMode.Experience); }
        public void OnClick_Home() { Player.Instance.SetCollider(false); AudioManager.Instance.PlaySound(SoundList.ButtonDefault); ChangeMode(PlayMode.Home); }
        public void OnClick_Discord() { } public void OnClick_Facebook() { } public void OnClick_AssetStore() { } public void OnClick_Asset() { }
    }
}