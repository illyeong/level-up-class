using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class ObjectPoolItem : MonoBehaviour
{
    bool _isTimerOn = false;
    public float EnableTime = 1;
    public float _timer;
    public ObjectPool Parent;
    public bool PlayAniOnAwake = false;
    public bool PlayTimerOnAwake = false;
    public ParticleSystem Particle;
    private void Start()
    {
        StartTimer(EnableTime);
    }
    public void StartTimer(float dur)
    {
        // print("start timer:" + dur);
        _isTimerOn = true;
        gameObject.SetActive(true);
        _timer = 0;
        EnableTime = dur;
        Animator ani = GetComponent<Animator>();
        if (ani != null && ani.enabled && PlayAniOnAwake)
        {
            ani.Play(0, -1, 0);
        }
        if (Particle)
        {
            Particle.Stop();
            Particle.Play();
        }
    }
    private void OnEnable()
    {
        //StartTimer( EnableTime);
        if (PlayTimerOnAwake) StartTimer(EnableTime);
    }
    //public void SetDisableTimer(float dur)
    //{
    //    gameObject.SetActive(false);
    //    _timer = 0;
    //    EnableTime = dur;
    //}
    // Update is called once per frame
    void Update()
    {
        if (_isTimerOn)
        {
            _timer += Time.deltaTime;
            if (_timer > EnableTime)
            {
                EndLife();
            }
        }
    }

    public void EndLife()
    {
        if (Parent) Parent.ReturnObject(gameObject);
        gameObject.SetActive(false);
    }
}
