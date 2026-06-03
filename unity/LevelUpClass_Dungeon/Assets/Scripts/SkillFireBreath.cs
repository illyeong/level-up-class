using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using LayerLab.ArtMaker;

public class SkillFireBreath : MonoBehaviour, IDungeonSkill
{
    [Header("Timing")]
    public float cooldown = 25f;
    public float castLockTime = 0.15f;
    public float duration = 1.2f;
    public float tickInterval = 0.2f;

    [Header("Damage")]
    public float damageMultiplierPerTick = 0.45f;
    public bool canCrit = true;

    [Header("Range")]
    public float range = 5f;
    public float height = 2.4f;
    public Vector2 hitBoxOffset = new Vector2(2.6f, 0.2f);

    [Header("FX")]
    public GameObject fireBreathPrefab;
    public Vector2 fxOffset = new Vector2(0.45f, 0.35f);
    public float fxLifetimePadding = 0.3f;
    public bool attachFxToPlayer = true;
    public bool flipFxByFacingDirection = true;

    [Header("Target Search")]
    public LayerMask targetLayer;

    private PlayerCombat _combat;
    private PlayerMovement _movement;
    private Rigidbody2D _rb;
    private Transform _owner;
    private bool _running;

    private void Awake()
    {
        Initialize(gameObject);

        if (targetLayer.value == 0)
            targetLayer = LayerMask.GetMask("Monster");
    }

    public bool IsReady => !_running;
    public float Cooldown => cooldown;

    public void Initialize(GameObject owner)
    {
        if (owner == null) owner = gameObject;

        _owner = owner.transform;
        _combat = owner.GetComponent<PlayerCombat>();
        _movement = owner.GetComponent<PlayerMovement>();
        _rb = owner.GetComponent<Rigidbody2D>();
    }

    public void Activate()
    {
        if (_running) return;
        StartCoroutine(Routine());
    }

    private IEnumerator Routine()
    {
        _running = true;
        SetPlayerControl(false);

        float dir = GetFacingDir();
        SpawnFireBreathFx(dir);

        if (castLockTime > 0f)
            yield return new WaitForSeconds(castLockTime);

        float elapsed = 0f;
        while (elapsed < duration)
        {
            DealTickDamage(dir);
            yield return new WaitForSeconds(tickInterval);
            elapsed += tickInterval;
        }

        SetPlayerControl(true);
        _running = false;
    }

    private float GetFacingDir()
    {
        Transform owner = _owner != null ? _owner : transform;
        return owner.localScale.x < 0f ? 1f : -1f;
    }

    private void SetPlayerControl(bool enabled)
    {
        if (_movement) _movement.enabled = enabled;
        if (_rb) _rb.linearVelocity = Vector2.zero;
    }

    private void SpawnFireBreathFx(float dir)
    {
        if (fireBreathPrefab == null) return;

        Transform owner = _owner != null ? _owner : transform;
        Vector3 pos = owner.position + new Vector3(fxOffset.x * dir, fxOffset.y, 0f);
        GameObject fx = Instantiate(fireBreathPrefab, pos, fireBreathPrefab.transform.rotation);

        if (flipFxByFacingDirection)
        {
            Vector3 scale = fireBreathPrefab.transform.localScale;
            scale.x = Mathf.Abs(scale.x) * dir;
            fx.transform.localScale = scale;
        }

        if (attachFxToPlayer)
            fx.transform.SetParent(owner, true);

        Destroy(fx, duration + fxLifetimePadding);
    }

    private void DealTickDamage(float dir)
    {
        int baseAttack = _combat != null ? _combat.attackPower : 10;
        int critChance = _combat != null ? _combat.critChance : 20;
        float critMult = _combat != null ? _combat.critDamageMultiplier : 1.5f;

        int damage = Mathf.Max(1, Mathf.RoundToInt(baseAttack * damageMultiplierPerTick));
        bool isCrit = canCrit && Random.Range(0, 100) < Mathf.Clamp(critChance, 0, 100);
        if (isCrit)
            damage = Mathf.Max(1, Mathf.RoundToInt(damage * critMult));

        Transform owner = _owner != null ? _owner : transform;
        Vector2 center = (Vector2)owner.position + new Vector2(hitBoxOffset.x * dir, hitBoxOffset.y);
        Collider2D[] hits = Physics2D.OverlapBoxAll(center, new Vector2(range, height), 0f, targetLayer);

        HashSet<Transform> damaged = new HashSet<Transform>();
        foreach (var hit in hits)
        {
            if (hit == null) continue;
            TryDamageTarget(hit, damage, isCrit, damaged);
        }
    }

    private void TryDamageTarget(Collider2D hit, int damage, bool isCrit, HashSet<Transform> damaged)
    {
        MonsterFSM monster = hit.GetComponentInParent<MonsterFSM>();
        if (monster != null && !monster.isDead)
        {
            if (damaged.Add(monster.transform))
                monster.TakeDamage(damage, isCrit);
            return;
        }

        BossFSM boss = hit.GetComponentInParent<BossFSM>();
        if (boss != null && !boss.isDead)
        {
            if (damaged.Add(boss.transform))
                boss.TakeDamage(damage, isCrit);
        }
    }

    private void OnDrawGizmosSelected()
    {
        float dir = Application.isPlaying ? GetFacingDir() : 1f;
        Transform owner = _owner != null ? _owner : transform;
        Vector3 center = owner.position + new Vector3(hitBoxOffset.x * dir, hitBoxOffset.y, 0f);

        Gizmos.color = new Color(1f, 0.25f, 0f, 0.28f);
        Gizmos.DrawCube(center, new Vector3(range, height, 0.1f));
    }
}
