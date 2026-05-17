using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using StudioNAP;
using TMPro;

public class PerformanceTest : MonoBehaviour
{
    public List<Transform> Targets;
    public float interval = 0.1f;
    float _timer = 0;
    int _index = 0;
    public GameObject TMPPrefab;
    // Start is called before the first frame update
    void Start()
    {
        if (Application.platform == RuntimePlatform.Android || Application.platform == RuntimePlatform.IPhonePlayer)
        {
            Application.targetFrameRate = 70;
        }
    }

    // Update is called once per frame
    void Update()
    {
        _timer += Time.deltaTime;
        if (_timer < interval) return;
        _timer = 0;


        Vector3 pos = Targets[_index].position + new Vector3(0, 1, 0);
        _index++;
        if (_index >= Targets.Count) _index = 0;

        string strDamage = string.Format("{0}.{1}A", Random.Range(100, 999), Random.Range(0, 10));
        SpriteFont.PoolSize = 200;

        SpriteFont.ShowDamage(strDamage, pos, (FontType)Random.Range(0, 4));

        // GameObject go = Instantiate(TMPPrefab, pos, Quaternion.identity);
        // go.transform.Find("TMP").GetComponent<TextMeshPro>().text = strDamage;
        // go.transform.position = pos;
    }
}
