using System;
using System.Collections.Generic;
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
        [DllImport("__Internal")]
        private static extern void SendCharacterDataToReact(string partsJson, string imageBase64);
        #endif

        // Firebase에서 불러온 보유 파츠 (이미 결제 완료된 것들)
        private Dictionary<PartsType, int> _ownedParts = new();

        // 변경된 색상 파츠 추적
        private HashSet<PartsType> _changedColorTypes = new();

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
            
            // 피부색은 랜덤 아닌 기본값 유지 (Firebase 로드 시 덮어씀)
            Player.Instance.PartsManager.ClearClothes();

            Player.Instance.PartsManager.OnChangedParts += (type, index) => UpdateDiamondCost();
            Player.Instance.PartsManager.OnColorChange  += (type, color) =>
            {
                if (CanChangeColor(type))
                {
                    _changedColorTypes.Add(type);
                    UpdateDiamondCost();
                }
            };
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

        /// <summary>Firebase에서 불러온 보유 파츠를 등록 — 이미 결제된 것은 비용에서 제외</summary>
        public void SetOwnedParts(Dictionary<PartsType, int> owned)
        {
            _ownedParts = owned ?? new();
            UpdateDiamondCost();
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
                    // 보유 중인 파츠와 동일하면 결제 불필요
                    if (_ownedParts.TryGetValue(pType, out int ownedIdx) && idx == ownedIdx) continue;

                    if (slot.CanHide) { if (idx >= 0) count++; }
                    else { if (idx > 0) count++; }
                }
            }
            // 색상 변경도 각 100 다이아 추가
            count += _changedColorTypes.Count;

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

            // 구매 완료 후 스크린샷 캡처해서 React로 전송
            StartCoroutine(CaptureAndSendCharacter(jsonParts));
        }

        private System.Collections.IEnumerator CaptureAndSendCharacter(string jsonParts)
        {
            yield return new UnityEngine.WaitForEndOfFrame();

            // 전용 캡처 카메라로 캐릭터만 찍기 (없으면 전체 스크린샷 fallback)
            string imageBase64 = CharacterCapture.Instance != null
                ? CharacterCapture.Instance.Capture()
                : "data:image/png;base64," + Convert.ToBase64String(
                    ScreenCapture.CaptureScreenshotAsTexture().EncodeToPNG());

            // 결제 후 보유 파츠 + 색상 갱신 (다음부터 재결제 안 되게)
            SetOwnedParts(new Dictionary<PartsType, int>(Player.Instance.PartsManager.ActiveIndices));
            _changedColorTypes.Clear();

            #if UNITY_WEBGL && !UNITY_EDITOR
                SendCharacterDataToReact(jsonParts, imageBase64);
            #endif
            Debug.Log("[유니티] 캐릭터 이미지 전송 완료");
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