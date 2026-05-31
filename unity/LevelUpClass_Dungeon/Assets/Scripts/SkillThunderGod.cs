using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using LayerLab.ArtMaker;

public class SkillThunderGod : MonoBehaviour
{
    [Header("Dash")]
    public float dashSpeed = 150f;
    public float dashDistance = 14f;
    public float hitBoxHeight = 4f;
    public float hitDelayAfterFX = 0.5f;
    public float invincibleDuration = 0.5f;

    [Header("Damage")]
    [Tooltip("Total skill damage multiplier. The value is split across all strikes.")]
    public float totalDamageMultiplier = 3f;
    public int hitCount = 6;
    public float hitInterval = 0.1f;

    [Header("FX")]
    public GameObject playerFXPrefab;
    public GameObject monsterFXPrefab;

    [Header("Target Search")]
    public LayerMask targetLayer;
    public float fallbackVerticalRange = 5f;

    private PlayerCombat _combat;
    private PlayerMovement _movement;
    private Rigidbody2D _rb;
    private bool _running;

    private struct StrikeTarget
    {
        public MonsterFSM monster;
        public BossFSM boss;
        public Transform transform;
    }

    private void Awake()
    {
        _combat = GetComponent<PlayerCombat>();
        _movement = GetComponent<PlayerMovement>();
        _rb = GetComponent<Rigidbody2D>();

        if (targetLayer.value == 0)
            targetLayer = LayerMask.GetMask("Monster");
    }

    public bool IsReady => !_running;

    public void Activate()
    {
        if (_running) return;
        StartCoroutine(Routine());
    }

    private IEnumerator Routine()
    {
        _running = true;

        float dir = GetFacingDir();
        Vector3 startPos = transform.position;

        // ① 캐릭터 이펙트 먼저 출현
        SpawnAttachedFX(playerFXPrefab);

        // ② 0.7초 대기
        yield return new WaitForSeconds(0.7f);

        // ③ 대쉬
        SetPlayerControl(false);
        yield return Dash(dir);

        Vector3 endPos = transform.position;
        List<StrikeTarget> targets = FindTargets(startPos, endPos);

        if (targets.Count == 0)
        {
            SetPlayerControl(true);
            _running = false;
            yield break;
        }

        // ④ 몬스터 즉시 정지
        SetTargetsFrozen(targets, true);

        // ⑤ 0.5초 대기 (몬스터 멈춤 상태)
        yield return new WaitForSeconds(0.5f);

        // ⑥ 대쉬 후 캐릭터 이펙트
        SpawnAttachedFX(playerFXPrefab);

        // ⑦ 0.3초 대기
        yield return new WaitForSeconds(0.3f);

        // ⑧ 6연타 + 사망 판정
        _combat?.GrantInvincibility(invincibleDuration);
        yield return StrikeTargets(targets);

        // ⑨ 몬스터 정지 해제
        SetTargetsFrozen(targets, false);

        SetPlayerControl(true);
        _running = false;
    }

    private float GetFacingDir()
    {
        return transform.localScale.x < 0f ? 1f : -1f;
    }

    private void SetPlayerControl(bool enabled)
    {
        if (_movement) _movement.enabled = enabled;
        if (_rb) _rb.linearVelocity = Vector2.zero;
    }

    private IEnumerator Dash(float dir)
    {
        float traveled = 0f;

        while (traveled < dashDistance)
        {
            float step = Mathf.Min(dashSpeed * Time.deltaTime, dashDistance - traveled);
            transform.position += new Vector3(dir * step, 0f, 0f);
            traveled += step;
            yield return null;
        }

        if (_rb) _rb.linearVelocity = Vector2.zero;
    }

    private List<StrikeTarget> FindTargets(Vector3 startPos, Vector3 endPos)
    {
        var targets = new List<StrikeTarget>();
        Vector3 pathCenter = (startPos + endPos) * 0.5f;
        float pathWidth = Vector3.Distance(startPos, endPos) + 2f;

        Collider2D[] cols = Physics2D.OverlapBoxAll(
            pathCenter,
            new Vector2(pathWidth, hitBoxHeight),
            0f,
            targetLayer
        );

        foreach (var col in cols)
            TryAddTarget(targets, col);

        if (targets.Count == 0)
            AddFallbackTargets(targets, startPos, endPos);

        return targets;
    }

    private void AddFallbackTargets(List<StrikeTarget> targets, Vector3 startPos, Vector3 endPos)
    {
        float minX = Mathf.Min(startPos.x, endPos.x) - 1f;
        float maxX = Mathf.Max(startPos.x, endPos.x) + 1f;
        float centerY = (startPos.y + endPos.y) * 0.5f;

        foreach (var monster in FindObjectsByType<MonsterFSM>(FindObjectsSortMode.None))
        {
            if (monster == null || monster.isDead) continue;
            Vector3 pos = monster.transform.position;
            if (pos.x >= minX && pos.x <= maxX && Mathf.Abs(pos.y - centerY) <= fallbackVerticalRange)
                AddMonsterTarget(targets, monster);
        }

        foreach (var boss in FindObjectsByType<BossFSM>(FindObjectsSortMode.None))
        {
            if (boss == null || boss.isDead) continue;
            Vector3 pos = boss.transform.position;
            if (pos.x >= minX && pos.x <= maxX && Mathf.Abs(pos.y - centerY) <= fallbackVerticalRange)
                AddBossTarget(targets, boss);
        }
    }

    private void TryAddTarget(List<StrikeTarget> targets, Collider2D col)
    {
        if (col == null) return;

        MonsterFSM monster = col.GetComponentInParent<MonsterFSM>();
        if (monster != null && !monster.isDead)
        {
            AddMonsterTarget(targets, monster);
            return;
        }

        BossFSM boss = col.GetComponentInParent<BossFSM>();
        if (boss != null && !boss.isDead)
            AddBossTarget(targets, boss);
    }

    private void AddMonsterTarget(List<StrikeTarget> targets, MonsterFSM monster)
    {
        foreach (var target in targets)
            if (target.monster == monster) return;

        targets.Add(new StrikeTarget
        {
            monster = monster,
            transform = monster.transform
        });
    }

    private void AddBossTarget(List<StrikeTarget> targets, BossFSM boss)
    {
        foreach (var target in targets)
            if (target.boss == boss) return;

        targets.Add(new StrikeTarget
        {
            boss = boss,
            transform = boss.transform
        });
    }

    private IEnumerator StrikeTargets(List<StrikeTarget> targets)
    {
        int   baseAttack  = _combat != null ? _combat.attackPower          : 10;
        int   critChance  = _combat != null ? _combat.critChance           : 20;
        float critMult    = _combat != null ? _combat.critDamageMultiplier : 1.5f;
        // 타격당 데미지 = 공격력 / 2
        int   baseDmg     = Mathf.Max(1, baseAttack / 2);

        // ① 6연타 시작 전 — 모든 타겟 사망 판정 지연
        foreach (var t in targets)
        {
            if (t.monster != null) t.monster.suppressDeath = true;
            if (t.boss    != null) t.boss.suppressDeath    = true;
        }

        // ② 6연타 — 타격마다 크리확률 독립 적용
        for (int i = 0; i < hitCount; i++)
        {
            for (int t = 0; t < targets.Count; t++)
            {
                StrikeTarget target = targets[t];
                if (target.transform == null) continue;

                bool isCrit  = Random.Range(0, 200) < Mathf.Min(critChance, 160);
                int  dmg     = isCrit ? Mathf.RoundToInt(baseDmg * critMult) : baseDmg;

                SpawnFX(monsterFXPrefab, target.transform.position + Vector3.up * 0.6f);

                if (target.monster != null && !target.monster.isDead)
                    target.monster.TakeDamage(dmg, isCrit);
                else if (target.boss != null && !target.boss.isDead)
                    target.boss.TakeDamage(dmg, isCrit);
            }

            if (i < hitCount - 1)
                yield return new WaitForSeconds(hitInterval);
        }

        // ③ 모든 타격 완료 — 지연된 사망 판정 일괄 처리
        yield return new WaitForSeconds(hitInterval); // 마지막 피격모션 잠깐 유지
        foreach (var t in targets)
        {
            t.monster?.ReleaseSuppressDeath();
            t.boss?.ReleaseSuppressDeath();
        }
    }

    private void SetTargetsFrozen(List<StrikeTarget> targets, bool freeze)
    {
        foreach (var t in targets)
        {
            if (t.monster != null) { t.monster.frozen = freeze; if (freeze && t.monster.TryGetComponent<Rigidbody2D>(out var rb)) rb.linearVelocity = Vector2.zero; }
            if (t.boss    != null) { t.boss.frozen    = freeze; if (freeze && t.boss.TryGetComponent<Rigidbody2D>(out var rb)) rb.linearVelocity = Vector2.zero; }
        }
    }

    private void SpawnAttachedFX(GameObject prefab)
    {
        if (prefab == null) return;
        var fx = Instantiate(prefab, transform.position, Quaternion.identity);
        fx.transform.SetParent(transform, true);
        Destroy(fx, 3f);
    }

    private void SpawnFX(GameObject prefab, Vector3 pos)
    {
        if (prefab == null) return;
        var fx = Instantiate(prefab, pos, Quaternion.identity);
        Destroy(fx, 2f);
    }

    private void OnDrawGizmosSelected()
    {
        Gizmos.color = new Color(1f, 0.9f, 0f, 0.35f);
        Gizmos.DrawCube(transform.position, new Vector3(dashDistance, hitBoxHeight, 0.1f));
    }
}
