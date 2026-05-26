using UnityEngine;
using UnityEditor;
using System.Collections.Generic;

public class RemoveGearRightItems : EditorWindow
{
    [MenuItem("Tools/Remove Gear Right Items")]
    static void Execute()
    {
        MonoBehaviour demoControl = null;
        foreach (var mb in FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None))
        {
            if (mb.GetType().Name == "DemoControl") { demoControl = mb; break; }
        }
        if (demoControl == null)
        {
            Debug.LogError("[RemoveGearRight] DemoControl을 찾지 못했습니다. Demo 씬을 열고 실행하세요.");
            return;
        }

        var toRemove = new HashSet<int> { 2,3,4,5,6,7,8,10,11,12,15,16,17,18,19,20,21,22,23,24,25,26,27,29,30,31,32,33,39,40 };

        var so = new SerializedObject(demoControl);
        var spritesProperty = so.FindProperty("sprites");

        if (spritesProperty == null || !spritesProperty.isArray)
        {
            Debug.LogError("[RemoveGearRight] DemoControl에서 'sprites' 배열을 찾지 못했습니다.");
            return;
        }

        // gear_right 관련 스프라이트 이름 디버그 출력
        var gearNames = new System.Text.StringBuilder();
        for (int i = 0; i < spritesProperty.arraySize; i++)
        {
            var s = spritesProperty.GetArrayElementAtIndex(i).objectReferenceValue as Sprite;
            if (s != null && s.name.ToLower().Contains("gear"))
                gearNames.AppendLine($"[{i}] {s.name}");
        }
        Debug.Log("[RemoveGearRight] gear 포함 스프라이트:\n" + gearNames);

        // 유지할 스프라이트만 수집
        var keepSprites = new List<Sprite>();
        int removedCount = 0;

        for (int i = 0; i < spritesProperty.arraySize; i++)
        {
            var element = spritesProperty.GetArrayElementAtIndex(i);
            var sprite = element.objectReferenceValue as Sprite;

            // null(파일 삭제된 broken reference)도 제거
            if (sprite == null)
            {
                removedCount++;
                continue;
            }

            if (sprite.name.StartsWith("gear_right_c_"))
            {
                string numStr = sprite.name.Substring("gear_right_c_".Length);
                if (int.TryParse(numStr, out int num) && toRemove.Contains(num))
                {
                    removedCount++;
                    continue;
                }
            }

            keepSprites.Add(sprite);
        }

        // 배열 재설정
        spritesProperty.arraySize = keepSprites.Count;
        for (int i = 0; i < keepSprites.Count; i++)
            spritesProperty.GetArrayElementAtIndex(i).objectReferenceValue = keepSprites[i];

        so.ApplyModifiedProperties();
        EditorUtility.SetDirty(demoControl);

        Debug.Log($"[RemoveGearRight] 완료 — {removedCount}개 제거, {keepSprites.Count}개 유지");
    }
}
