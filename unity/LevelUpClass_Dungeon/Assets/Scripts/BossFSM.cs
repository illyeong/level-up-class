using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using StudioNAP;
using Spine.Unity;

/// <summary>
/// Stage 2 보스 전투 AI.
/// Phase 1 (HP > 50%): 추적 + 일반공격 + 돌진공격
/// Phase 2 (HP <= 50%): 분노 모드 — 속도/데미지 1.5배 + 점프공격 추가
/// 사망 시 clearPortal을 활성화하여 Clear 씬으로 이동 가능.
/// </summary>
public class BossFSM : MonoBehaviour
{
    public enum Phase2SkillType
    {
        Jump,
        PoisonPool
    }

    public UnityEngine.UI.Slider bossHpBar;
    [Header("보스 기본 설정")]
    public string bossName = "다크 슬라임 킹";
    public int maxHealth = 300;
    public int attackPower = 15;
    public int goldDrop = 200;

    [Header("이동 설정")]
    public float chaseSpeed = 2.5f;
    public float chargeSpeed = 10f;
    public float phase2SpeedMultiplier = 1.5f;

    [Header("공격 설정")]
    public float attackRange = 1.5f;
    public float normalAttackCooldown = 2f;
    public float chargeAttackCooldown = 8f;
    public float jumpAttackCooldown = 10f;
    public Phase2SkillType phase2Skill = Phase2SkillType.Jump;

    [Header("Poison Pool Attack (Phase 2)")]
    public GameObject poisonPoolEffectPrefab;
    public float poisonPoolCooldown = 10f;
    public float poisonPoolRadius = 2.5f;
    public float poisonPoolDuration = 3f;
    public float poisonTickInterval = 0.5f;
    public float poisonTickDamageMultiplier = 0.35f;
    public float poisonCastDelay = 0.35f;

    [Header("지형 감지")]
    public Transform frontCheck;
    public LayerMask groundLayer;

    [Header("포탈 (보스 처치 후 활성화)")]
    public GameObject clearPortal;

    [Header("클리어 축하 이펙트")]
    public GameObject clearFXPrefab;  // 보스 사망 1초 후 스폰할 파티클

    [Header("피격 이펙트")]
    public GameObject hitEffectPrefab;
    public GameObject critHitEffectPrefab;   // 몬스터 위치에 재생되는 이펙트
    public GameObject critBoomEffectPrefab;  // 머리 위에 뜨는 Boom! 이펙트

    [Header("착지 이펙트 (Rage 점프 착지 시)")]
    public GameObject landingEffectPrefab; // 파티클 프리팹
    public float shakeDuration  = 0.35f;
    public float shakeMagnitude = 0.4f;

    [Header("보스 HP 바 UI")]
    public Image bossHpFillImage;  // Hp_Fill Image 연결
    public GameObject bossHpBarUI;

    [Header("애니메이션 (Spine)")]
    public SkeletonAnimation skeletonAnim;
    public SkeletonGraphic   skeletonGraphic;
    public Animator animator;
    public string idleAnimName   = "Idle";
    public string walkAnimName   = "Walk";
    public string attackAnimName = "Attack";
    public string chargeAnimName = "";
    public string jumpAnimName   = "";
    public string hitAnimName    = "Hit";
    public string deadAnimName   = "Die";
    public string rageAnimName   = "";

    [Header("플레이어 (자동 탐색, 안 되면 직접 연결)")]
    public Transform playerTarget;

    private int currentHealth;
    private int movingDir = -1;
    private Rigidbody2D rb;
    private Collider2D bossCollider;
    private Collider2D playerCollider;
    private SpriteRenderer spriteRenderer;

    public int CurrentHealth => currentHealth;
    public bool isDead { get; private set; } = false;
    private bool isHit           = false;
    private bool isAttacking     = false;
    private bool isCharging      = false;
    private bool isPhase2        = false;
    private bool phase2Triggered = false;

    private float lastNormalAttackTime = 0f;
    private float lastChargeAttackTime = 0f;
    private float lastJumpAttackTime   = 0f;
    private float lastPoisonAttackTime = 0f;

    void Start()
    {
        currentHealth   = maxHealth;
        rb              = GetComponent<Rigidbody2D>();
        bossCollider    = GetComponent<Collider2D>();
        spriteRenderer  = GetComponent<SpriteRenderer>();
        skeletonAnim    ??= GetComponent<SkeletonAnimation>();
        skeletonGraphic ??= GetComponent<SkeletonGraphic>();
        animator        ??= GetComponent<Animator>();

        if (playerTarget == null)
        {
            var byTag  = GameObject.FindWithTag("Player");
            var byName = GameObject.Find("Character");
            var found  = byTag ?? byName;
            if (found != null) playerTarget = found.transform;
            else Debug.LogWarning("[BossFSM] 플레이어를 찾지 못했습니다. Inspector에서 직접 연결하세요.");
        }

        if (playerTarget != null)
            playerCollider = playerTarget.GetComponent<Collider2D>();

        if (bossHpBar != null)
        {
            bossHpBar.maxValue = maxHealth;
            bossHpBar.value    = maxHealth;
        }

        // Spine AnimationState 초기화 (한 프레임 뒤 Idle 재생)
        Invoke(nameof(InitAnim), 0.1f);
        if (bossHpBarUI != null) bossHpBarUI.SetActive(true);
        if (clearPortal != null) clearPortal.SetActive(false);
    }

    void Update()
    {
        if (isDead || isHit || isAttacking || isCharging) return;
        if (playerTarget == null) return;

        // Phase 2 전환 감지
        if (!phase2Triggered && currentHealth <= maxHealth / 2)
        {
            StartCoroutine(TriggerPhase2());
            return;
        }

        float dist = GetDistanceToPlayer();
        float currentChaseSpeed = isPhase2 ? chaseSpeed * phase2SpeedMultiplier : chaseSpeed;

        // Phase 2 전용: 점프 공격
        if (isPhase2 && phase2Skill == Phase2SkillType.Jump &&
            dist <= 5f && Time.time >= lastJumpAttackTime + jumpAttackCooldown)
        {
            StartCoroutine(JumpAttack());
            return;
        }

        if (isPhase2 && phase2Skill == Phase2SkillType.PoisonPool &&
            dist <= 6f && Time.time >= lastPoisonAttackTime + poisonPoolCooldown)
        {
            StartCoroutine(PoisonPoolAttack());
            return;
        }

        // 돌진 공격
        if (dist > attackRange && Time.time >= lastChargeAttackTime + chargeAttackCooldown)
        {
            StartCoroutine(ChargeAttack());
            return;
        }

        // 사거리 안 — 멈추고 쿨다운 기다린 뒤 공격
        if (dist <= attackRange)
        {
            rb.linearVelocity = new Vector2(0f, rb.linearVelocity.y);
            PlayAnim(idleAnimName);
            if (Time.time >= lastNormalAttackTime + normalAttackCooldown)
                StartCoroutine(NormalAttack());
            return;
        }

        // 기본 추적
        Chase(currentChaseSpeed);
    }

    private string currentAnimName = "";

    void InitAnim() => PlayAnim(idleAnimName);

    void PlayAnim(string animName, bool loop = true)
    {
        if (string.IsNullOrEmpty(animName)) return;
        if (animName == currentAnimName) return; // 이미 재생 중이면 스킵
        currentAnimName = animName;

        if (skeletonGraphic != null && skeletonGraphic.AnimationState != null)
            skeletonGraphic.AnimationState.SetAnimation(0, animName, loop);
        else if (skeletonAnim != null && skeletonAnim.AnimationState != null)
            skeletonAnim.AnimationState.SetAnimation(0, animName, loop);
        else if (animator != null)
        {
            int stateHash = Animator.StringToHash(animName);
            if (animator.HasState(0, stateHash))
                animator.Play(stateHash, 0, 0f);
        }
    }

    void Chase(float speed)
    {
        if (playerTarget == null) return;

        movingDir = (playerTarget.position.x > transform.position.x) ? 1 : -1;
        transform.localScale = new Vector3(-movingDir, 1, 1);
        rb.linearVelocity = new Vector2(speed * movingDir, rb.linearVelocity.y);
        PlayAnim(walkAnimName);

        // 벽/절벽 감지 제거 — Invisible Wall이 막아줌
    }

    // ── 일반 공격 ─────────────────────────────────────────────────────

    IEnumerator NormalAttack()
    {
        isAttacking = true;
        lastNormalAttackTime = Time.time;
        rb.linearVelocity = Vector2.zero;

        PlayAnim(attackAnimName, false);
        yield return new WaitForSeconds(0.3f);

        DealDamageToPlayer(attackPower);

        yield return new WaitForSeconds(0.5f);
        isAttacking = false;
    }

    // ── 돌진 공격 ─────────────────────────────────────────────────────

    IEnumerator ChargeAttack()
    {
        isCharging = true;
        lastChargeAttackTime = Time.time;

        PlayAnim(string.IsNullOrEmpty(chargeAnimName) ? attackAnimName : chargeAnimName, false);
        yield return new WaitForSeconds(0.4f);

        int chargeDir = (playerTarget.position.x > transform.position.x) ? 1 : -1;
        transform.localScale = new Vector3(-chargeDir, 1, 1);
        rb.linearVelocity = new Vector2(chargeSpeed * chargeDir, rb.linearVelocity.y);

        yield return new WaitForSeconds(0.3f); // 돌진 지속

        float dist = Vector2.Distance(transform.position, playerTarget.position);
        if (dist <= attackRange + 1f)
            DealDamageToPlayer(Mathf.RoundToInt(attackPower * 1.8f));

        rb.linearVelocity = Vector2.zero;
        yield return new WaitForSeconds(0.4f);
        isCharging = false;
    }

    // ── 점프 공격 (Phase 2 전용) ──────────────────────────────────────

    IEnumerator JumpAttack()
    {
        isAttacking = true;
        lastJumpAttackTime = Time.time;
        rb.linearVelocity = Vector2.zero;

        PlayAnim(string.IsNullOrEmpty(jumpAnimName) ? attackAnimName : jumpAnimName, false);

        // 위로 점프
        rb.AddForce(Vector2.up * 8f, ForceMode2D.Impulse);
        yield return new WaitForSeconds(0.5f);

        // 플레이어 방향으로 수평 이동
        if (playerTarget != null)
        {
            float dir = (playerTarget.position.x > transform.position.x) ? 1f : -1f;
            rb.linearVelocity = new Vector2(dir * 5f, rb.linearVelocity.y);
        }
        yield return new WaitForSeconds(0.3f);

        // 낙하
        rb.linearVelocity = new Vector2(0f, -15f);
        yield return new WaitForSeconds(0.2f);

        // ── 착지 연출 ─────────────────────────────────────────
        // 파티클 이펙트 스폰
        if (landingEffectPrefab != null)
        {
            var fx = Instantiate(landingEffectPrefab, transform.position, Quaternion.identity);
            Destroy(fx, 2f);
        }

        // 카메라 흔들림
        CameraFollow.Instance?.Shake(shakeDuration, shakeMagnitude);

        // 착지 충격 — Player 레이어만 감지
        Collider2D[] hits = Physics2D.OverlapCircleAll(transform.position, 2.5f, LayerMask.GetMask("Player"));
        foreach (var hit in hits)
        {
            var pc = hit.GetComponent<LayerLab.ArtMaker.PlayerCombat>();
            if (pc != null)
                pc.TakePlayerDamage(Mathf.RoundToInt(attackPower * 2f), transform.position);
        }

        yield return new WaitForSeconds(0.5f);
        isAttacking = false;
    }

    IEnumerator PoisonPoolAttack()
    {
        isAttacking = true;
        lastPoisonAttackTime = Time.time;
        rb.linearVelocity = Vector2.zero;

        PlayAnim(attackAnimName, false);
        yield return new WaitForSeconds(poisonCastDelay);

        Vector3 poolCenter = (playerTarget != null) ? playerTarget.position : transform.position;
        poolCenter.z = transform.position.z;

        if (poisonPoolEffectPrefab != null)
        {
            var fx = Instantiate(poisonPoolEffectPrefab, poolCenter, Quaternion.identity);
            Destroy(fx, poisonPoolDuration + 1f);
        }

        int tickDamage = Mathf.Max(1, Mathf.RoundToInt(attackPower * poisonTickDamageMultiplier));
        float elapsed = 0f;
        while (elapsed < poisonPoolDuration)
        {
            Collider2D[] hits = Physics2D.OverlapCircleAll(poolCenter, poisonPoolRadius, LayerMask.GetMask("Player"));
            foreach (var hit in hits)
            {
                var pc = hit.GetComponent<LayerLab.ArtMaker.PlayerCombat>();
                if (pc != null)
                    pc.TakePlayerDamage(tickDamage, poolCenter);
            }

            yield return new WaitForSeconds(poisonTickInterval);
            elapsed += poisonTickInterval;
        }

        isAttacking = false;
    }

    // ── Phase 2 전환 ──────────────────────────────────────────────────

    IEnumerator TriggerPhase2()
    {
        phase2Triggered = true;
        isAttacking = true;
        rb.linearVelocity = Vector2.zero;

        PlayAnim(string.IsNullOrEmpty(rageAnimName) ? attackAnimName : rageAnimName, false);

        // 빨간 플래시 6회
        for (int i = 0; i < 6; i++)
        {
            if (spriteRenderer)
                spriteRenderer.color = (i % 2 == 0) ? Color.red : Color.white;
            yield return new WaitForSeconds(0.15f);
        }
        if (spriteRenderer) spriteRenderer.color = Color.red; // Phase 2 상시 붉게

        isPhase2     = true;
        attackPower  = Mathf.RoundToInt(attackPower * 1.5f);

        SpriteFont.ShowDamage("RAGE!!", transform.position + new Vector3(0, 2.5f, 0), FontType.Rainbow);

        yield return new WaitForSeconds(0.5f);
        isAttacking = false;
    }

    // ── 피해 처리 ─────────────────────────────────────────────────────

    void DealDamageToPlayer(int damage)
    {
        if (playerTarget == null) return;
        if (GetDistanceToPlayer() > attackRange + 0.75f) return;
        var pc = playerTarget.GetComponent<LayerLab.ArtMaker.PlayerCombat>();
        pc?.TakePlayerDamage(damage, transform.position);
    }

    float GetDistanceToPlayer()
    {
        if (playerTarget == null) return float.PositiveInfinity;

        if (playerCollider == null)
            playerCollider = playerTarget.GetComponent<Collider2D>();

        if (bossCollider != null && playerCollider != null)
        {
            ColliderDistance2D info = bossCollider.Distance(playerCollider);
            return Mathf.Max(0f, info.distance);
        }

        return Vector2.Distance(transform.position, playerTarget.position);
    }

    public void TakeDamage(int damage, bool isCritical = false)
    {
        if (isDead) return;
        currentHealth -= damage;

        Vector3 textPos = transform.position + new Vector3(0, 1.5f, 0);
        SpriteFont.ShowDamage(damage.ToString(), textPos, FontType.Rainbow);

        GetComponentInChildren<MonsterHpBar>(true)?.Show();
        if (bossHpFillImage != null)
            bossHpFillImage.fillAmount = Mathf.Clamp01((float)currentHealth / maxHealth);

        // 피격 이펙트 스폰 (크리티컬이면 크리티컬 이펙트 우선)
        GameObject effectToSpawn = (isCritical && critHitEffectPrefab != null)
            ? critHitEffectPrefab : hitEffectPrefab;
        if (effectToSpawn != null)
        {
            var fx = Instantiate(effectToSpawn, transform.position, Quaternion.identity);
            Destroy(fx, 2f);
        }

        // 크리티컬 Boom! 이펙트 (머리 위)
        if (isCritical && critBoomEffectPrefab != null)
        {
            Vector3 boomPos = transform.position + new Vector3(0, 2.5f, 0);
            var boom = Instantiate(critBoomEffectPrefab, boomPos, Quaternion.identity);
            Destroy(boom, 2f);
        }

        if (currentHealth <= 0) { Die(); return; }

        // 히트 애니메이션 없으므로 경직 없이 바로 재개
        isAttacking = false;
        isCharging  = false;
    }

    // ── 사망 ─────────────────────────────────────────────────────────

    void Die()
    {
        isDead = true;
        StopAllCoroutines();
        rb.linearVelocity = Vector2.zero;

        PlayAnim(deadAnimName, false);
        if (spriteRenderer) spriteRenderer.color = Color.white;

        var col = GetComponent<Collider2D>();
        if (col) col.enabled = false;
        rb.isKinematic = true;

        if (bossHpBarUI != null) bossHpBarUI.SetActive(false);

        GameManager.Instance?.AddGold(goldDrop);

        // 보스 처치 다이아 = dungeonIndex × 5 (던전1→5, 던전5→25, ...)
        if (GameManager.Instance != null)
        {
            int bossDiamond = Mathf.Max(1, GameManager.Instance.dungeonIndex) * 5;
            GameManager.Instance.sessionEarnedDiamond += bossDiamond;
        }

        Invoke(nameof(SpawnClearFX), 1f);
        Invoke(nameof(ActivateClearPortal), 2f);
        Destroy(gameObject, 4f);
    }

    void SpawnClearFX()
    {
        if (clearFXPrefab == null) return;
        Instantiate(clearFXPrefab, transform.position, Quaternion.identity);
    }

    void ActivateClearPortal()
    {
        if (GameResultUI.Instance != null)
            GameResultUI.Instance.ShowRewardPanel();
        else if (clearPortal != null)
            clearPortal.SetActive(true);
    }

    // ── 에디터 기즈모 ─────────────────────────────────────────────────

    void OnDrawGizmosSelected()
    {
        Gizmos.color = Color.red;
        Gizmos.DrawWireSphere(transform.position, attackRange);

        Gizmos.color = new Color(1f, 0.3f, 0f, 0.4f);
        Gizmos.DrawWireSphere(transform.position, 2.5f); // 점프 공격 범위
    }
}
