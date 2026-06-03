using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using LayerLab.ArtMaker;

public class SkillExplosiveBomb : MonoBehaviour, IDungeonSkill
{
    [Header("Timing")]
    public float cooldown = 30f;
    public float castDelay = 0.15f;
    public float projectileTravelTime = 0.18f;
    public float impactPause = 0.08f;
    public float secondaryExplosionDelay = 0.1f;
    public float controlLockTime = 0.65f;

    [Header("Damage")]
    public float damageMultiplier = 2.2f;
    public int tickCount = 5;
    public float tickInterval = 0.08f;
    public bool canCrit = true;

    [Header("Explosion")]
    public float forwardDistance = 4f;
    public float explosionRadius = 2.8f;
    public float secondaryExplosionRadius = 2f;
    public float secondaryExplosionOffset = 1.35f;
    public float secondaryDamageRatio = 0.45f;
    public float knockbackForce = 5f;

    [Header("FX")]
    public GameObject projectilePrefab;
    public GameObject explosionSmokePrefab;
    public float fxLifetime = 2f;
    public float projectileLifetime = 1f;
    public Vector2 fxOffset = new Vector2(0f, 0.2f);
    public Vector2 projectileStartOffset = new Vector2(0.35f, 0.6f);
    public float mainFxScale = 1.15f;
    public float secondaryFxScale = 0.8f;

    [Header("Camera Shake")]
    public float cameraShakeDuration = 0.12f;
    public float cameraShakeStrength = 0.08f;

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
        Transform owner = _owner != null ? _owner : transform;
        Vector3 explosionPoint = owner.position + new Vector3(forwardDistance * dir + fxOffset.x, fxOffset.y, 0f);

        if (castDelay > 0f)
            yield return new WaitForSeconds(castDelay);

        Vector3 startPoint = owner.position + new Vector3(projectileStartOffset.x * dir, projectileStartOffset.y, 0f);
        if (projectileTravelTime > 0f)
            yield return StartCoroutine(PlayProjectile(startPoint, explosionPoint));

        SpawnExplosion(explosionPoint, mainFxScale);
        StartCoroutine(ShakeCamera());
        yield return StartCoroutine(DealTickDamage(explosionPoint, damageMultiplier, explosionRadius, 1f));

        if (impactPause > 0f)
            yield return new WaitForSeconds(impactPause);

        yield return StartCoroutine(SecondaryBlasts(explosionPoint));

        float tickDuration = Mathf.Max(0, tickCount - 1) * Mathf.Max(0f, tickInterval);
        float elapsedLockTime = castDelay + projectileTravelTime + impactPause + secondaryExplosionDelay * 2f + tickDuration * 3f;
        float remain = Mathf.Max(0f, controlLockTime - elapsedLockTime);
        if (remain > 0f)
            yield return new WaitForSeconds(remain);

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

    private IEnumerator PlayProjectile(Vector3 start, Vector3 end)
    {
        GameObject projectile = projectilePrefab != null ? Instantiate(projectilePrefab, start, Quaternion.identity) : null;
        if (projectile != null)
            Destroy(projectile, projectileLifetime);

        float elapsed = 0f;
        while (elapsed < projectileTravelTime)
        {
            elapsed += Time.deltaTime;
            float t = Mathf.Clamp01(elapsed / projectileTravelTime);
            Vector3 pos = Vector3.Lerp(start, end, t);
            pos.y += Mathf.Sin(t * Mathf.PI) * 0.45f;

            if (projectile != null)
                projectile.transform.position = pos;

            yield return null;
        }

        if (projectile != null)
            Destroy(projectile);
    }

    private IEnumerator SecondaryBlasts(Vector3 center)
    {
        if (secondaryExplosionDelay > 0f)
            yield return new WaitForSeconds(secondaryExplosionDelay);

        Vector3 left = center + Vector3.left * secondaryExplosionOffset;
        Vector3 right = center + Vector3.right * secondaryExplosionOffset;

        SpawnExplosion(left, secondaryFxScale);
        yield return StartCoroutine(DealTickDamage(left, damageMultiplier * secondaryDamageRatio, secondaryExplosionRadius, 0.65f));

        if (secondaryExplosionDelay > 0f)
            yield return new WaitForSeconds(secondaryExplosionDelay);

        SpawnExplosion(right, secondaryFxScale);
        yield return StartCoroutine(DealTickDamage(right, damageMultiplier * secondaryDamageRatio, secondaryExplosionRadius, 0.65f));
    }

    private void SpawnExplosion(Vector3 pos, float scale)
    {
        if (explosionSmokePrefab == null) return;

        GameObject fx = Instantiate(explosionSmokePrefab, pos, Quaternion.identity);
        fx.transform.localScale *= Mathf.Max(0.01f, scale);
        Destroy(fx, fxLifetime);
    }

    private IEnumerator ShakeCamera()
    {
        if (cameraShakeDuration <= 0f || cameraShakeStrength <= 0f) yield break;

        Camera cam = Camera.main;
        if (cam == null) yield break;

        Transform camTransform = cam.transform;
        Vector3 origin = camTransform.position;
        float elapsed = 0f;

        while (elapsed < cameraShakeDuration)
        {
            elapsed += Time.deltaTime;
            Vector2 offset = Random.insideUnitCircle * cameraShakeStrength;
            camTransform.position = origin + new Vector3(offset.x, offset.y, 0f);
            yield return null;
        }

        camTransform.position = origin;
    }

    private IEnumerator DealTickDamage(Vector3 center, float multiplier, float radius, float knockbackMultiplier)
    {
        int count = Mathf.Max(1, tickCount);
        float perTickMultiplier = multiplier / count;

        for (int i = 0; i < count; i++)
        {
            DealExplosionDamage(center, perTickMultiplier, radius, i == 0 ? knockbackMultiplier : 0f);
            if (i < count - 1 && tickInterval > 0f)
                yield return new WaitForSeconds(tickInterval);
        }
    }

    private void DealExplosionDamage(Vector3 center, float multiplier, float radius, float knockbackMultiplier)
    {
        int baseAttack = _combat != null ? _combat.attackPower : 10;
        int critChance = _combat != null ? _combat.critChance : 20;
        float critMult = _combat != null ? _combat.critDamageMultiplier : 1.5f;

        int damage = Mathf.Max(1, Mathf.RoundToInt(baseAttack * multiplier));
        bool isCrit = canCrit && Random.Range(0, 100) < Mathf.Clamp(critChance, 0, 100);
        if (isCrit)
            damage = Mathf.Max(1, Mathf.RoundToInt(damage * critMult));

        Collider2D[] hits = Physics2D.OverlapCircleAll(center, radius, targetLayer);
        HashSet<Transform> damaged = new HashSet<Transform>();

        foreach (var hit in hits)
        {
            if (hit == null) continue;
            TryDamageTarget(hit, center, damage, isCrit, damaged, knockbackMultiplier);
        }
    }

    private void TryDamageTarget(Collider2D hit, Vector3 center, int damage, bool isCrit, HashSet<Transform> damaged, float knockbackMultiplier)
    {
        MonsterFSM monster = hit.GetComponentInParent<MonsterFSM>();
        if (monster != null && !monster.isDead)
        {
            if (damaged.Add(monster.transform))
            {
                monster.TakeDamage(damage, isCrit);
                ApplyKnockback(monster.transform, center, knockbackMultiplier);
            }
            return;
        }

        BossFSM boss = hit.GetComponentInParent<BossFSM>();
        if (boss != null && !boss.isDead)
        {
            if (damaged.Add(boss.transform))
            {
                boss.TakeDamage(damage, isCrit);
                ApplyKnockback(boss.transform, center, 0.35f * knockbackMultiplier);
            }
        }
    }

    private void ApplyKnockback(Transform target, Vector3 center, float multiplier = 1f)
    {
        if (target == null || knockbackForce <= 0f) return;
        if (!target.TryGetComponent<Rigidbody2D>(out var targetRb)) return;

        Vector2 dir = ((Vector2)target.position - (Vector2)center).normalized;
        if (dir.sqrMagnitude < 0.01f)
            dir = Vector2.right * GetFacingDir();

        targetRb.AddForce(dir * knockbackForce * multiplier, ForceMode2D.Impulse);
    }

    private void OnDrawGizmosSelected()
    {
        float dir = Application.isPlaying ? GetFacingDir() : 1f;
        Transform owner = _owner != null ? _owner : transform;
        Vector3 center = owner.position + new Vector3(forwardDistance * dir + fxOffset.x, fxOffset.y, 0f);

        Gizmos.color = new Color(1f, 0.45f, 0f, 0.3f);
        Gizmos.DrawSphere(center, explosionRadius);

        Gizmos.color = new Color(1f, 0.2f, 0f, 0.18f);
        Gizmos.DrawSphere(center + Vector3.left * secondaryExplosionOffset, secondaryExplosionRadius);
        Gizmos.DrawSphere(center + Vector3.right * secondaryExplosionOffset, secondaryExplosionRadius);
    }
}
