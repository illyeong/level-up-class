using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class FPSChecker : MonoBehaviour
{
    private float deltaTime = 0.0f;
    private GUIStyle style;

    // Start is called before the first frame update
    void Start()
    {
        style = new GUIStyle();
        style.alignment = TextAnchor.LowerLeft;
        style.fontSize = 50;
        style.normal.textColor = Color.red;
    }

    // Update is called once per frame
    void Update()
    {
        deltaTime += (Time.unscaledDeltaTime - deltaTime) * 0.1f;
    }

    void OnGUI()
    {
        float fps = 1.0f / deltaTime;
        string text = string.Format("FPS: {0:0.}", fps);
        GUI.Label(new Rect(40, Screen.height - 30, 100, 20), text, style);
    }
}
