using UnityEngine;
using StudioNAP;

public class MonsterFSM : MonoBehaviour
{
    [Header("몬스터 설정")]
    public string monsterName = "슬라임";
    public int maxHealth = 30;
    public int attackPower = 5;
    [HideInInspector] public int currentHealth;

    [Header("보상")]
    public int goldDrop = 10;

    [Header("피격 이펙트")]
    public GameObject hitEffectPrefab;
    public GameObject critHitEffectPrefab;   // 몬스터 위치에 재생되는 이펙트
    public GameObject critBoomEffectPrefab;  // 머리 위에 뜨는 Boom! 이펙트

    [Header("이동 및 공격 설정")]
    public float moveSpeed = 2f;
    public float chaseSpeed = 3.5f;
    public float attackRange = 1.2f;
    public float attackCooldown = 2.0f;

    public Transform frontCheck;
    public LayerMask groundLayer;

    private int movingRight = -1;
    private Rigidbody2D rb;
    private Transform playerTarget;

    [Header("애니메이션")]
    public Animator anim;
    public string idleAnimName   = "Slime_Idle";
    public string walkAnimName   = "Slime_Walk";
    public string attackAnimName = "Slime_Attack";
    public string hitAnimName    = "Slime_Hit";
    public string deadAnimName   = "Slime_Dead";

    public bool isDead = false;
    private bool isHit       = false;
    private bool isAttacking = false;
    private bool isAggro     = false;
    private bool isWandering = false;
    private float aiTimer       = 0f;
    private float lastAttackTime = 0f;

    void Start()
    {
        currentHealth = maxHealth;
        anim ??= GetComponent<Animator>();      // compound assignment
        rb = GetComponent<Rigidbody2D>();

        GameObject playerObj = GameObject.Find("Character");
        if (playerObj != null) playerTarget = playerObj.transform;

        SetNextAI();
    }

    void Update()
    {
        if (isDead || isHit || isAttacking) return;

        float currentSpeed = 0f;

        if (isAggro && playerTarget != null)
        {
            float distanceToPlayer = Vector2.Distance(transform.position, playerTarget.position);

            if (distanceToPlayer <= attackRange)
            {
                if (Time.time >= lastAttackTime + attackCooldown)
                {
                    StartAttack();
                    return;
                }
                else
                {
                    currentSpeed = 0f;
                    if (anim) anim.Play(idleAnimName);
                }
            }
            else
            {
                movingRight = (playerTarget.position.x > transform.position.x) ? 1 : -1;
                transform.localScale = new Vector3(-movingRight, 1, 1);
                currentSpeed = chaseSpeed;
                if (anim) anim.Play(walkAnimName);
            }
        }
        else
        {
            aiTimer -= Time.deltaTime;
            if (aiTimer <= 0) SetNextAI();

            if (isWandering)
            {
                currentSpeed = moveSpeed;
                if (anim) anim.Play(walkAnimName);
            }
            else
            {
                currentSpeed = 0f;
                if (anim) anim.Play(idleAnimName);
            }
        }

        rb.linearVelocity = new Vector2(currentSpeed * movingRight, rb.linearVelocity.y);

        if (currentSpeed > 0)
        {
            RaycastHit2D groundInfo = Physics2D.Raycast(frontCheck.position, Vector2.down, 1f, groundLayer);
            RaycastHit2D wallInfo   = Physics2D.Raycast(frontCheck.position, Vector2.right * movingRight, 0.1f, groundLayer);

            if (groundInfo.collider == false || wallInfo.collider == true)
            {
                movingRight *= -1;
                transform.localScale = new Vector3(-movingRight, 1, 1);
            }
        }
    }

    void StartAttack()
    {
        isAttacking = true;
        rb.linearVelocity = Vector2.zero;
        lastAttackTime = Time.time;

        if (anim) anim.Play(attackAnimName);

        Invoke("DealDamageToPlayer", 0.3f);
        Invoke("FinishAttack", 0.8f);
    }

    void DealDamageToPlayer()
    {
        if (isDead || playerTarget == null) return;

        float distance = Vector2.Distance(transform.position, playerTarget.position);
        if (distance <= attackRange + 0.5f)
        {
            var playerCombat = playerTarget.GetComponent<LayerLab.ArtMaker.PlayerCombat>();
            if (playerCombat != null)
            {
                int boostedDamage = Mathf.RoundToInt(attackPower * 1.5f);
                playerCombat.TakePlayerDamage(boostedDamage, transform.position);
            }
        }
    }

    void FinishAttack()
    {
        isAttacking = false;
    }

    void SetNextAI()
    {
        if (isAggro) return;
        int action = Random.Range(0, 3);
        if (action == 0)
        {
            isWandering = false;
            aiTimer = Random.Range(1f, 3f);
        }
        else
        {
            isWandering = true;
            movingRight = (action == 1) ? -1 : 1;
            transform.localScale = new Vector3(-movingRight, 1, 1);
            aiTimer = Random.Range(1.5f, 3f);
        }
    }

    // 스킬 연타 중 사망 판정 지연용 플래그
    [HideInInspector] public bool suppressDeath = false;

    public void TakeDamage(int damage, bool isCritical = false)
    {
        if (isDead) return;
        currentHealth -= damage;
        Vector3 textPos = transform.position + new Vector3(0, 1.5f, 0);

        SpriteFont.ShowDamage(damage.ToString(), textPos, FontType.Rainbow);

        // 피격 이펙트 스폰
        GameObject effectToSpawn = (isCritical && critHitEffectPrefab != null)
            ? critHitEffectPrefab : hitEffectPrefab;
        if (effectToSpawn != null)
        {
            var fx = Instantiate(effectToSpawn, transform.position, Quaternion.identity);
            Destroy(fx, 2f);
        }

        if (isCritical && critBoomEffectPrefab != null)
        {
            Vector3 boomPos = transform.position + new Vector3(0, 2f, 0);
            var boom = Instantiate(critBoomEffectPrefab, boomPos, Quaternion.identity);
            Destroy(boom, 2f);
        }

        GetComponentInChildren<MonsterHpBar>(true)?.Show();
        isAggro = true;

        if (currentHealth <= 0 && !suppressDeath)
        {
            Die();
        }
        else
        {
            // HP 0 이하여도 suppressDeath 중이면 피격모션 재생, 사망은 지연
            isHit = true;
            isAttacking = false;
            CancelInvoke("DealDamageToPlayer");
            CancelInvoke("FinishAttack");
            rb.linearVelocity = Vector2.zero;
            if (anim) anim.Play(hitAnimName, -1, 0f);
            Invoke("ResetHit", 0.5f);
        }
    }

    /// <summary>스킬 연타 완료 후 호출 — suppressDeath 해제 및 지연된 사망 처리</summary>
    public void ReleaseSuppressDeath()
    {
        suppressDeath = false;
        if (!isDead && currentHealth <= 0)
            Die();
    }

    void ResetHit()
    {
        if (isDead) return;
        isHit = false;
    }

    void Die()
    {
        isDead = true;
        rb.linearVelocity = Vector2.zero;

        if (anim) anim.Play(deadAnimName);

        Collider2D col = GetComponent<Collider2D>();
        if (col) col.enabled = false;
        if (rb)  rb.isKinematic = true;

        // 처치 보상: 던전번호만큼 다이아 획득 (던전1→1, 던전10→10, ...)
        if (GameManager.Instance != null)
        {
            int diamondDrop = Mathf.Max(1, GameManager.Instance.dungeonIndex);
            GameManager.Instance.sessionKillCount++;
            GameManager.Instance.sessionEarnedDiamond += diamondDrop;
        }

        Destroy(gameObject, 1.5f);
    }
}
