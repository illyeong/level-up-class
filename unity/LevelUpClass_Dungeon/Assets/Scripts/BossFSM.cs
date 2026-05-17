using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using StudioNAP;

/// <summary>
/// Stage 2 보스 전투 AI.
/// Phase 1 (HP > 50%): 추적 + 일반공격 + 돌진공격
/// Phase 2 (HP <= 50%): 분노 모드 — 속도/데미지 1.5배 + 점프공격 추가
/// 사망 시 clearPortal을 활성화하여 Clear 씬으로 이동 가능.
/// </summary>
public class BossFSM : MonoBehaviour
{
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

    [Header("지형 감지")]
    public Transform frontCheck;
    public LayerMask groundLayer;

    [Header("포탈 (보스 처치 후 활성화)")]
    public GameObject clearPortal;

    [Header("보스 HP 바 UI")]
    public Image bossHpFillImage;  // Hp_Fill Image 연결
    public GameObject bossHpBarUI;

    [Header("애니메이션")]
    public Animator anim;
    public string idleAnimName   = "Boss_Idle";
    public string walkAnimName   = "Boss_Walk";
    public string attackAnimName = "Boss_Attack";
    public string chargeAnimName = "Boss_Charge";
    public string jumpAnimName   = "Boss_Jump";
    public string hitAnimName    = "Boss_Hit";
    public string deadAnimName   = "Boss_Dead";
    public string rageAnimName   = "Boss_Rage";

    private int currentHealth;
    private int movingDir = -1;
    private Rigidbody2D rb;
    private Transform playerTarget;
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

    void Start()
    {
        currentHealth  = maxHealth;
        anim         ??= GetComponent<Animator>();
        rb             = GetComponent<Rigidbody2D>();
        spriteRenderer = GetComponent<SpriteRenderer>();

        GameObject playerObj = GameObject.FindWithTag("Player");
        if (playerObj != null) playerTarget = playerObj.transform;
        else Debug.LogWarning("[BossFSM] Player 태그가 붙은 오브젝트를 찾지 못했습니다.");

        if (bossHpBar != null)
        {
            bossHpBar.maxValue = maxHealth;
            bossHpBar.value    = maxHealth;
        }
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

        float dist = Vector2.Distance(transform.position, playerTarget.position);
        float currentChaseSpeed = isPhase2 ? chaseSpeed * phase2SpeedMultiplier : chaseSpeed;

        // Phase 2 전용: 점프 공격
        if (isPhase2 && dist <= 5f && Time.time >= lastJumpAttackTime + jumpAttackCooldown)
        {
            StartCoroutine(JumpAttack());
            return;
        }

        // 돌진 공격
        if (dist > attackRange && Time.time >= lastChargeAttackTime + chargeAttackCooldown)
        {
            StartCoroutine(ChargeAttack());
            return;
        }

        // 일반 공격
        if (dist <= attackRange && Time.time >= lastNormalAttackTime + normalAttackCooldown)
        {
            StartCoroutine(NormalAttack());
            return;
        }

        // 기본 추적
        Chase(currentChaseSpeed);
    }

    void Chase(float speed)
    {
        if (playerTarget == null) return;

        movingDir = (playerTarget.position.x > transform.position.x) ? 1 : -1;
        transform.localScale = new Vector3(-movingDir, 1, 1);
        rb.linearVelocity = new Vector2(speed * movingDir, rb.linearVelocity.y);
        if (anim) anim.Play(walkAnimName);

        // 절벽 / 벽 감지 시 정지
        if (frontCheck != null)
        {
            RaycastHit2D ground = Physics2D.Raycast(frontCheck.position, Vector2.down, 1f, groundLayer);
            RaycastHit2D wall   = Physics2D.Raycast(frontCheck.position, Vector2.right * movingDir, 0.2f, groundLayer);
            if (!ground.collider || wall.collider)
            {
                rb.linearVelocity = Vector2.zero;
                if (anim) anim.Play(idleAnimName);
            }
        }
    }

    // ── 일반 공격 ─────────────────────────────────────────────────────

    IEnumerator NormalAttack()
    {
        isAttacking = true;
        lastNormalAttackTime = Time.time;
        rb.linearVelocity = Vector2.zero;

        if (anim) anim.Play(attackAnimName);
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

        if (anim) anim.Play(string.IsNullOrEmpty(chargeAnimName) ? attackAnimName : chargeAnimName);
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

        if (anim) anim.Play(string.IsNullOrEmpty(jumpAnimName) ? attackAnimName : jumpAnimName);

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

    // ── Phase 2 전환 ──────────────────────────────────────────────────

    IEnumerator TriggerPhase2()
    {
        phase2Triggered = true;
        isAttacking = true;
        rb.linearVelocity = Vector2.zero;

        if (anim) anim.Play(rageAnimName);

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
        var pc = playerTarget.GetComponent<LayerLab.ArtMaker.PlayerCombat>();
        pc?.TakePlayerDamage(damage, transform.position);
    }

    public void TakeDamage(int damage)
    {
        if (isDead) return;
        currentHealth -= damage;

        SpriteFont.ShowDamage(damage.ToString(), transform.position + new Vector3(0, 1.5f, 0), FontType.Rainbow);

        GetComponentInChildren<MonsterHpBar>(true)?.Show();
        if (bossHpFillImage != null)
            bossHpFillImage.fillAmount = Mathf.Clamp01((float)currentHealth / maxHealth);

        if (currentHealth <= 0) { Die(); return; }

        isHit        = true;
        isAttacking  = false;
        isCharging   = false;
        StopAllCoroutines();

        rb.linearVelocity = Vector2.zero;
        if (anim) anim.Play(hitAnimName, -1, 0f);
        Invoke(nameof(ResetHit), 0.5f);
    }

    void ResetHit()
    {
        if (isDead) return;
        isHit = false;
    }

    // ── 사망 ─────────────────────────────────────────────────────────

    void Die()
    {
        isDead = true;
        StopAllCoroutines();
        rb.linearVelocity = Vector2.zero;

        if (anim) anim.Play(deadAnimName);
        if (spriteRenderer) spriteRenderer.color = Color.white;

        var col = GetComponent<Collider2D>();
        if (col) col.enabled = false;
        rb.isKinematic = true;

        if (bossHpBarUI != null) bossHpBarUI.SetActive(false);

        GameManager.Instance?.AddGold(goldDrop);

        Invoke(nameof(ActivateClearPortal), 2f);
        Destroy(gameObject, 4f);
    }

    void ActivateClearPortal()
    {
        if (clearPortal != null) clearPortal.SetActive(true);
        SpriteFont.ShowDamage("BOSS CLEAR!", transform.position + new Vector3(0, 2f, 0), FontType.Rainbow);
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
