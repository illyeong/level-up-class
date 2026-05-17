using UnityEngine;

// 🔥 PartsManager와 완벽하게 동일한 소속(울타리)으로 묶어줍니다.
namespace LayerLab.ArtMaker
{
    public class DungeonWebBridge : MonoBehaviour
    {
        [Header("연결할 파츠 매니저")]
        public PartsManager partManager; 

        [System.Serializable]
        public class AvatarSaveData
        {
            public int skinIndex;
            public int eyesIndex;
            public int mouthIndex;
            public int browIndex;
            public int topIndex;
            public int bottomIndex;
            public int bootsIndex;
            public int hairShortIndex;
            public int weaponIndex; 
        }

void Start()
        {
            if (partManager == null)
            {
                partManager = GetComponent<PartsManager>();
            }
        }

        // 🔥 여기를 추가하세요! (테스트용)
        void Update()
        {
            // 키보드 T 키를 누를 때마다 무작위로 옷을 갈아입습니다!
            if (Input.GetKeyDown(KeyCode.T))
            {
                if (partManager != null)
                {
                    // 옷장 초기화 (에러 방지)
                    partManager.Init();

                    // 상의, 머리, 무기를 0~5번 중 랜덤으로 장착
                    partManager.EquipParts(PartsType.Top, UnityEngine.Random.Range(0, 5));
                    partManager.EquipParts(PartsType.Hair_Short, UnityEngine.Random.Range(0, 5));
                    partManager.EquipParts(PartsType.Gear_Right, UnityEngine.Random.Range(0, 5));
                    
                    Debug.Log("짠! 아바타 갈아입기 성공!");
                }
            }
        }

        public void ApplyWebData(string jsonString)
        {
            Debug.Log("웹에서 넘어온 아바타 데이터: " + jsonString);
            
            AvatarSaveData data = JsonUtility.FromJson<AvatarSaveData>(jsonString);

            if (partManager != null)
            {
                // 옷 입기 전에 옷장 강제 초기화 (에러 방지)
                partManager.Init(); 

                partManager.EquipParts(PartsType.Skin, data.skinIndex);
                partManager.EquipParts(PartsType.Eyes, data.eyesIndex);
                partManager.EquipParts(PartsType.Mouth, data.mouthIndex);
                partManager.EquipParts(PartsType.Brow, data.browIndex);
                
                partManager.EquipParts(PartsType.Top, data.topIndex);
                partManager.EquipParts(PartsType.Bottom, data.bottomIndex);
                partManager.EquipParts(PartsType.Boots, data.bootsIndex);
                partManager.EquipParts(PartsType.Hair_Short, data.hairShortIndex);
                
                partManager.EquipParts(PartsType.Gear_Right, data.weaponIndex); 
            }
            else
            {
                Debug.LogError("PartsManager를 찾을 수 없습니다!");
            }
        }
    }
}