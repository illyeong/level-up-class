using System.Collections.Generic;
using UnityEngine;

public class ObjectPool : MonoBehaviour
{
    public GameObject prefab;
    public int poolSize = 10;
    int _index = 0;
    int _limit = 3;

    List<GameObject> pool = new List<GameObject>();

    private void Start()
    {
        CheckPool();

        for (int i = 0; i < poolSize; i++)
        {
            if (pool.Count >= poolSize) break;
            if (!prefab)
            {
                continue;
            }
            GameObject obj = Instantiate(prefab, transform);
            obj.SetActive(false);
            pool.Add(obj);
        }
    }
    void CheckPool()
    {
        if (pool == null) pool = new List<GameObject>(poolSize);
    }

    public GameObject GetObject()
    {
        CheckPool();
        foreach (var item in pool)
        {
            if (!item.activeSelf)
            {
                item.SetActive(true);
                return item;
            }
        }
        if (pool.Count >= _limit)
        {
            GameObject forcedObj = pool[_index];
            forcedObj.SetActive(true);
            _index++;
            if (_index >= pool.Count) _index = 0;
            return forcedObj;
        }
        GameObject obj = Instantiate(prefab, transform);
        obj.SetActive(true);
        pool.Add(obj);

        return obj;
    }

    public void ReturnObject(GameObject obj)
    {
        obj.SetActive(false);
        obj.transform.SetParent(transform);
    }
}
