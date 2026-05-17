using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.U2D;
using UnityEditor;

namespace StudioNAP
{
    public class SpriteFont : MonoBehaviour
    {
        [SerializeField] private string _text = "";
        public string text
        {
            get => _text;
            set
            {
                if (_text != value)
                {
                    _text = value;
                    _isDirty = true;
                    UpdateText(); // 🔥 추가 3: 텍스트 숫자가 바뀔 때도 무조건 다시 그리도록 확실하게 강제!
                }
            }
    
        }
        private float _spaceWidth = 0.2f;
        [SerializeField] private float spacing = 0f;
        [SerializeField] private bool alignCenter = true;
        [SerializeField] public Color textColor = Color.white;
        [SerializeField] private bool Waggle = false;
        [SerializeField] private float waggleAmount = 0.1f;
        [SerializeField] private Sprite PrefixSprite;
        [SerializeField] private Vector3 PrefixOffset = new Vector3(1, 0);
        [SerializeField] private int sortingOrder = 0;
        [SerializeField] private string sortingLayerName = "Default";

        [SerializeField] private SpriteAtlas myAtlas;

        public SpriteAtlas Atlas
        {
            get => myAtlas;
            set
            {if (myAtlas != value)
                {
                    myAtlas = value;
                    ClearDics(); // 🔥 추가 1: 색상이 바뀌면 예전 색상 기억을 강제로 싹 지워버림!
                    UpdateText(); // 🔥 추가 2: 바뀐 색상으로 즉시 다시 그리도록 명령!
                }
            }
        }

        public List<SpriteRenderer> _spriteRenderers = new List<SpriteRenderer>();

        public Dictionary<int, Sprite> SpriteNumDics = new Dictionary<int, Sprite>();
        public Dictionary<string, Sprite> SpriteWordDics = new Dictionary<string, Sprite>();


        private bool _isDirty = false;
        bool _isDestroyed = false;

        private Dictionary<int, float> _waggleOffsets = new Dictionary<int, float>();
        public static int PoolSize = 20;

        void Awake()
        {
            SpriteNumDics = new Dictionary<int, Sprite>();
            SpriteWordDics = new Dictionary<string, Sprite>();
        }
        void Start()
        {
            UpdateText();
        }

        private void OnDestroy()
        {
            _isDestroyed = true;
        }

        private void AdjustCharacterPosition(Transform spriteTransform, string character, int index)
        {
            Vector3 pos = spriteTransform.localPosition;

            if (character.Equals(".") || character.Equals(","))
            {
                pos.y -= 0.2f;
            }

            if (Waggle)
            {
                if (!_waggleOffsets.ContainsKey(index))
                {
                    _waggleOffsets[index] = UnityEngine.Random.Range(-waggleAmount, waggleAmount);
                }
                pos.y += _waggleOffsets[index];
            }

            spriteTransform.localPosition = pos;
        }

        private void CreatePrefixSprite(ref float totalWidth)
        {
            if (PrefixSprite != null)
            {
                GameObject prefixObj;
                if (_spriteRenderers.Count > 0 && _spriteRenderers[0].gameObject.name.Equals("Prefix"))
                {
                    prefixObj = _spriteRenderers[0].gameObject;
                    _spriteRenderers[0].sortingOrder = sortingOrder - 1;
                    _spriteRenderers[0].sortingLayerName = sortingLayerName;
                    prefixObj.SetActive(true);
                }
                else
                {
                    prefixObj = new GameObject("Prefix");
                    prefixObj.transform.SetParent(transform);
                    prefixObj.transform.localPosition = Vector2.zero;
                    prefixObj.transform.localRotation = Quaternion.identity;
                    prefixObj.transform.localScale = Vector3.one;

                    SpriteRenderer prefixRenderer = prefixObj.AddComponent<SpriteRenderer>();
                    prefixRenderer.sprite = PrefixSprite;
                    prefixRenderer.color = textColor;
                    prefixRenderer.sortingOrder = sortingOrder - 1;
                    prefixRenderer.sortingLayerName = sortingLayerName;
                    _spriteRenderers.Insert(0, prefixRenderer);
                }
                totalWidth += PrefixSprite.bounds.size.x + spacing;
            }
        }

        private void CreateCharacterSprite(string character, int index, ref float totalWidth)
        {
            int rendererIndex = index + (PrefixSprite != null ? 1 : 0);
            if (character.Equals(" "))
            {
                totalWidth += _spaceWidth;
                if (rendererIndex < _spriteRenderers.Count)
                {
                    _spriteRenderers[rendererIndex].sprite = GetSprite(".");
                    _spriteRenderers[rendererIndex].gameObject.SetActive(false);
                }

                return;
            }

            GameObject spriteObj;
            SpriteRenderer renderer;

            if (rendererIndex < _spriteRenderers.Count)
            {
                spriteObj = _spriteRenderers[rendererIndex].gameObject;
                renderer = _spriteRenderers[rendererIndex];
                renderer.sortingOrder = sortingOrder;
                renderer.sortingLayerName = sortingLayerName;
                spriteObj.SetActive(true);
            }
            else
            {
                spriteObj = new GameObject($"Number_{index}");
                spriteObj.transform.SetParent(transform);
                spriteObj.transform.localPosition = Vector3.zero;
                spriteObj.transform.localRotation = Quaternion.identity;
                spriteObj.transform.localScale = Vector3.one;

                renderer = spriteObj.AddComponent<SpriteRenderer>();
                renderer.sortingOrder = sortingOrder;
                renderer.sortingLayerName = sortingLayerName;
                _spriteRenderers.Add(renderer);
            }
            renderer.color = textColor;
            renderer.sortingOrder = sortingOrder;
            renderer.sortingLayerName = sortingLayerName;

            Sprite sprite;
            if (int.TryParse(character, out int num))
            {
                sprite = GetSpriteNum(num);
            }
            else
            {
                sprite = GetSprite(character);
            }

            if (sprite != null)
            {
                renderer.sprite = sprite;
                totalWidth += sprite.bounds.size.x;
            }
        }
        public void ClearDics()
        {
            SpriteNumDics.Clear();
            SpriteWordDics.Clear();
        }

        private void PositionSprites(float totalWidth)
        {
            float currentX = alignCenter ? -totalWidth / 2 : 0;
            currentX -= PrefixSprite != null ? PrefixOffset.x : 0;
            string text = new string(_text);

            if (PrefixSprite != null)
            {
                _spriteRenderers[0].transform.localPosition = new Vector3(currentX + PrefixSprite.bounds.size.x / 2, 0, 0) + PrefixOffset;
                currentX += PrefixSprite.bounds.size.x + spacing;
            }

            for (int i = PrefixSprite != null ? 1 : 0; i < _spriteRenderers.Count; i++)
            {
                int loopCounter = 0;
                bool spaceHandled = false;
                while (text.Length > 0 && text[0] == ' ' && loopCounter < 100)
                {
                    currentX += _spaceWidth + spacing;
                    text = text.Substring(1);
                    loopCounter++;
                    spaceHandled = true;
                }
                if (_spriteRenderers[i].sprite != null)
                {
                    _spriteRenderers[i].transform.localPosition = new Vector3(currentX + _spriteRenderers[i].sprite.bounds.size.x / 2, 0, 0);
                    int tIndex = i - (PrefixSprite != null ? 1 : 0);
                    if (tIndex < _text.Length)
                        AdjustCharacterPosition(_spriteRenderers[i].transform, _text[tIndex].ToString(), i);
                    currentX += _spriteRenderers[i].sprite.bounds.size.x + spacing;
                }
                if (text.Length > 0 && !spaceHandled) text = text.Substring(1);
            }
        }

        void UpdateText()
        {
            if (string.Equals(_text, "") || _text == null)
                return;
            if (Waggle)
            {
                _waggleOffsets.Clear();
            }

            for (int i = _text.Length; i < _spriteRenderers.Count; i++)
            {
                _spriteRenderers[i].gameObject.SetActive(false);
            }

            float totalWidth = 0f;

            CreatePrefixSprite(ref totalWidth);

            for (int i = 0; i < _text.Length; i++)
            {
                string character = _text[i].ToString();
                CreateCharacterSprite(character, i, ref totalWidth);
            }
            totalWidth += spacing * (_text.Length - 1);
            PositionSprites(totalWidth);
        }
        public void UpdatePrefixSprite()
        {
            if (PrefixSprite != null)
            {
                _spriteRenderers[0].sprite = PrefixSprite;
            }
        }
        public void EditorUpdateText()
        {
#if UNITY_EDITOR
            UpdateText();
#endif
        }

        public Sprite GetSprite(string key)
        {
            if (SpriteWordDics == null || myAtlas == null)
            {
                return null;
            }
            if (key.Equals(".")) key = "dot";
            else if (key.Equals(",")) key = "comma";

            if (SpriteWordDics == null)
            {
                SpriteWordDics = new Dictionary<string, Sprite>();
            }
            if (SpriteWordDics.ContainsKey(key))
            {
                return SpriteWordDics[key];
            }

            Sprite spt = myAtlas.GetSprite(key.ToLower());
            if (spt != null)
            {
                SpriteWordDics.Add(key, spt);
                return spt;
            }
            return null;
        }

        public Sprite GetSpriteNum(int key)
        {
            if (SpriteNumDics == null || myAtlas == null)
            {
                return null;
            }
            if (SpriteNumDics == null)
            {
                SpriteNumDics = new Dictionary<int, Sprite>();
            }
            if (SpriteNumDics.ContainsKey(key))
            {
                return SpriteNumDics[key];
            }

            Sprite spt = myAtlas.GetSprite(key.ToString());
            if (spt != null)
            {
                SpriteNumDics.Add(key, spt);
                return spt;
            }
            return null;
        }

        public static ObjectPool _damagePool;

        public static Transform ShowDamage(string str, Vector3 pos)
        {
            if (!_damagePool)
            {
                GameObject objPool = new GameObject("DamagePool");
                _damagePool = objPool.AddComponent<ObjectPool>();
                _damagePool.prefab = Resources.Load<GameObject>("Prefab/SNFontPooling");
                _damagePool.poolSize = 20;
            }
            if (_damagePool.poolSize != PoolSize)
            {
                _damagePool.poolSize = PoolSize;
            }

            GameObject hitFont = _damagePool.GetObject();
            hitFont.transform.position = pos;
            hitFont.GetComponent<SpriteFont>().text = str;
            return hitFont.transform;
        }

        public static Transform ShowDamage(string str, Vector3 pos, FontType fontType)
        {
            Transform tr = ShowDamage(str, pos);
            switch (fontType)
            {
                case FontType.Red:
                    tr.GetComponent<SpriteFont>().Atlas = Resources.Load<SpriteAtlas>("Atlas/RedAtlas");
                    break;
                case FontType.Rainbow:
                    tr.GetComponent<SpriteFont>().Atlas = Resources.Load<SpriteAtlas>("Atlas/RainbowAtlas");
                    break;
                case FontType.White:
                    tr.GetComponent<SpriteFont>().Atlas = Resources.Load<SpriteAtlas>("Atlas/WhiteAtlas");
                    break;
                case FontType.Gold:
                    tr.GetComponent<SpriteFont>().Atlas = Resources.Load<SpriteAtlas>("Atlas/GoldAtlas");
                    break;
            }
            return tr;
        }
    }
}

public enum FontType
{
    Red,
    Rainbow,
    White,
    Gold
}