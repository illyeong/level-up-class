using System;
using UnityEngine;

namespace LayerLab.ArtMaker
{
    /// <summary>
    /// 캐릭터만 렌더링하는 전용 카메라로 PNG를 캡처한다.
    /// UI, 배경 없이 캐릭터 레이어만 찍음.
    /// </summary>
    public class CharacterCapture : MonoBehaviour
    {
        public static CharacterCapture Instance { get; private set; }

        [Header("전용 캡처 카메라 (Character 레이어만 렌더링)")]
        public Camera captureCamera;

        [Header("캡처 해상도")]
        public int width  = 256;
        public int height = 256;

        void Awake() { Instance = this; }

        /// <summary>캐릭터를 투명 배경 PNG로 캡처해 Base64 문자열로 반환</summary>
        public string Capture()
        {
            if (captureCamera == null)
            {
                Debug.LogWarning("[CharacterCapture] captureCamera가 연결되지 않았습니다.");
                return null;
            }

            var rt  = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32);
            captureCamera.targetTexture  = rt;
            captureCamera.backgroundColor = new Color(0, 0, 0, 0); // 투명 배경
            captureCamera.clearFlags      = CameraClearFlags.SolidColor;
            captureCamera.Render();

            RenderTexture.active = rt;
            var tex = new Texture2D(width, height, TextureFormat.RGBA32, false);
            tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            tex.Apply();

            captureCamera.targetTexture = null;
            RenderTexture.active        = null;
            Destroy(rt);

            byte[] bytes  = tex.EncodeToPNG();
            Destroy(tex);

            return "data:image/png;base64," + Convert.ToBase64String(bytes);
        }
    }
}
