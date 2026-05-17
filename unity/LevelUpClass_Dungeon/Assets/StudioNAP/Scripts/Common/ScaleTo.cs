using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class ScaleTo : MonoBehaviour
{
    public bool UseStartScale = false;
    [SerializeField] private Vector3 startScale = new Vector3(1f, 1f, 1f);
    [SerializeField] private float scaleTo = 1f;
    [SerializeField] private float delay = 1f;
    [SerializeField] private float scaleSpeed = 0.03f;

    public bool DestroyOnComplete = false;

    Coroutine _scaleToOneCoroutine;
    private void Start()
    {
        Init();
    }
    private void OnEnable()
    {
        Init();
    }
    void Init()
    {
        if (UseStartScale)
        {
            transform.localScale = startScale;
        }
        StartAllSchedules();
    }
    private void OnDisable()
    {
        StopAllSchedules();
    }
    public void StartAllSchedules()
    {
        StopAllSchedules();

        _scaleToOneCoroutine = StartCoroutine(ScaleToOneCoroutine());
    }
    public void StopAllSchedules()
    {
        if (_scaleToOneCoroutine != null) StopCoroutine(_scaleToOneCoroutine);
    }
    IEnumerator ScaleToOneCoroutine()
    {
        yield return new WaitForSeconds(delay);
        while (transform.localScale.x > scaleTo)
        {
            float scaleChange = scaleSpeed * Time.deltaTime;
            transform.localScale = new Vector3(transform.localScale.x - scaleChange, transform.localScale.y - scaleChange, transform.localScale.z - scaleChange);
            yield return null;
        }
        transform.localScale = new Vector3(scaleTo, scaleTo, scaleTo);
        if (DestroyOnComplete)
        {
            Destroy(gameObject);
        }
    }

}
