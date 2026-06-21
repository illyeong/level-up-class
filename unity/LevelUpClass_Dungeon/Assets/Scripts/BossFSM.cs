using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Rendering;
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
        PoisonPool,
        Smash,
        StoneGolem,
        MeadowDragon
    }

    public UnityEngine.UI.Slider bossHpBar;
    [Header("보스 기본 설정")]
    public string bossName = "다크 슬라임 킹";
    public int maxHealth = 300;
    public int attackPower = 15;
    public int goldDrop = 200;
    [Min(0)] public int fixedChestDiamondReward = 0;
    [Min(0)] public int fixedChestExpReward = 0;

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

    [Header("Normal Attack Effect")]
    public GameObject normalAttackEffectPrefab;
    public Vector3 normalAttackEffectOffset = new Vector3(1.5f, 0.8f, 0f);
    [Min(0.1f)] public float normalAttackEffectScale = 1f;
    [Min(0.1f)] public float normalAttackEffectLifetime = 2f;
    public bool flipNormalAttackEffectWithFacing = true;

    [Header("Charge Attack")]
    [Min(0.1f)] public float chargeDuration = 0.3f;
    [Min(0.1f)] public float chargeDamageMultiplier = 1.8f;

    [Header("Jump Attack")]
    public float jumpPower = 8f;
    public float jumpMoveSpeed = 5f;
    public float jumpSlamVelocity = 15f;
    public float jumpImpactRadius = 2.5f;
    public float jumpDamageMultiplier = 2f;
    [Min(1f)] public float phase2JumpSpeedMultiplier = 1f;
    [Range(0.2f, 1f)] public float phase2JumpTimingMultiplier = 1f;

    [Header("Poison Pool Attack (Phase 2)")]
    public GameObject poisonPoolEffectPrefab;
    public float poisonPoolCooldown = 10f;
    public float poisonPoolRadius = 2.5f;
    public float poisonPoolDuration = 3f;
    public float poisonTickInterval = 0.5f;
    public float poisonTickDamageMultiplier = 0.35f;
    public float poisonCastDelay = 0.35f;

    [Header("Smash Attack (Phase 2)")]
    public GameObject smashWarningEffectPrefab;
    public GameObject smashEffectPrefab;
    public float smashCooldown = 9f;
    public float smashTriggerRange = 5f;
    public float smashCastDelay = 0.45f;
    public float smashRadius = 3.2f;
    public float smashDamageMultiplier = 2.1f;

    [Header("Stone Golem Attacks (Phase 2)")]
    public StoneGolemFallingRock fallingRockPrefab;
    public GameObject rockWarningEffectPrefab;
    public GameObject rockImpactEffectPrefab;
    public float stoneSkillCooldown = 8f;
    public float rockFallCastDelay = 0.45f;
    public float rockFallInterval = 0.3f;
    public float rockFallHeight = 7f;
    public float rockFallDuration = 0.8f;
    public float rockFallRadius = 1.5f;
    public float rockFallDamageMultiplier = 1.25f;
    public int rockFallCount = 3;
    public int phase2RockFallCount = 5;
    public float rockFallSpread = 2.2f;
    public int firstRockFallHitThreshold = 2;
    public float stoneJumpPower = 7f;
    public float stoneJumpMoveSpeed = 4f;
    public float stoneJumpTrackDuration = 0.8f;
    public float stoneJumpRadius = 3.5f;
    public float stoneJumpDamageMultiplier = 1.8f;

    [Header("Meadow Dragon Combined Patterns")]
    public bool dragonPatternsStartInPhase1 = true;
    public float dragonSpecialCooldown = 6.5f;
    public float dragonPhase2CooldownMultiplier = 0.7f;
    public float dragonSkillTriggerRange = 8f;

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

    [Header("점프 착지 이펙트 (일반/Rage 공용)")]
    public GameObject landingEffectPrefab;
    [Min(0.1f)] public float landingEffectScale = 1f;
    [Min(0.1f)] public float landingEffectLifetime = 2f;
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
    public string skillAnimName  = "";
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
    [HideInInspector] public bool frozen = false;
    private bool isHit           = false;
    private bool isAttacking     = false;
    private bool isCharging      = false;
    private bool isPhase2        = false;
    private bool phase2Triggered = false;

    private float lastNormalAttackTime = 0f;
    private float lastChargeAttackTime = 0f;
    private float lastJumpAttackTime   = 0f;
    private float lastPoisonAttackTime = 0f;
    private float lastStoneSkillTime   = 0f;
    private bool useStoneJumpNext      = true;
    private int stoneGolemHitCount     = 0;
    private bool firstStoneRockTriggered = false;
    private bool firstStoneRockPending = false;
    private float lastDragonSpecialTime = 0f;
    private int nextDragonPattern = 0;

    void Start()
    {
        currentHealth   = maxHealth;
        rb              = GetComponent<Rigidbody2D>();
        bossCollider    = FindCombatCollider();
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
        if (frozen) { if (rb) rb.linearVelocity = Vector2.zero; return; }
        if (playerTarget == null) return;

        if (phase2Skill == Phase2SkillType.StoneGolem && firstStoneRockPending)
        {
            StartCoroutine(StoneGolemSkill(true));
            return;
        }

        // Phase 2 전환 감지
        if (!phase2Triggered && currentHealth <= maxHealth / 2)
        {
            StartCoroutine(TriggerPhase2());
            return;
        }

        float dist = GetDistanceToPlayer();
        float currentChaseSpeed = isPhase2 ? chaseSpeed * phase2SpeedMultiplier : chaseSpeed;

        // Meadow Dragon cycles jump, poison, and falling rocks. Charge remains
        // part of the normal boss loop, so all four patterns appear in battle.
        if (phase2Skill == Phase2SkillType.MeadowDragon &&
            (dragonPatternsStartInPhase1 || isPhase2) &&
            dist <= dragonSkillTriggerRange &&
            Time.time >= lastDragonSpecialTime + GetDragonSpecialCooldown())
        {
            StartNextDragonPattern();
            return;
        }

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

        if (isPhase2 && phase2Skill == Phase2SkillType.Smash &&
            dist <= smashTriggerRange && Time.time >= lastJumpAttackTime + smashCooldown)
        {
            StartCoroutine(SmashAttack());
            return;
        }

        if (phase2Skill == Phase2SkillType.StoneGolem && firstStoneRockTriggered &&
            dist <= 9f && Time.time >= lastStoneSkillTime + stoneSkillCooldown)
        {
            StartCoroutine(StoneGolemSkill(false));
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
        if (animName == currentAnimName && IsAnimatorPlaying(animName)) return;
        currentAnimName = animName;

        if (skeletonGraphic != null && skeletonGraphic.AnimationState != null)
            skeletonGraphic.AnimationState.SetAnimation(0, animName, loop);
        else if (skeletonAnim != null && skeletonAnim.AnimationState != null)
            skeletonAnim.AnimationState.SetAnimation(0, animName, loop);
        else if (animator != null)
        {
            bool isAttackState = animName == "Attack" || animName == "AttackAlt";
            if (!isAttackState)
                ApplyAnimatorParams(animName);

            int stateHash = Animator.StringToHash(animName);
            int fullPathHash = Animator.StringToHash("Base Layer." + animName);
            if (animator.HasState(0, stateHash))
                animator.Play(stateHash, 0, 0f);
            else if (animator.HasState(0, fullPathHash))
                animator.Play(fullPathHash, 0, 0f);
            else
                ApplyAnimatorParams(animName);
        }
    }

    public void PlayCinematicAnimation(string animName, bool loop = false)
    {
        PlayAnim(animName, loop);
    }

    public void SetCinematicLock(bool locked)
    {
        frozen = locked;
        if (locked && rb != null)
            rb.linearVelocity = Vector2.zero;
    }

    public void HoldCinematicAnimation(string animName, float normalizedTime)
    {
        float time = Mathf.Clamp01(normalizedTime);

        if (animator != null)
        {
            int stateHash = Animator.StringToHash(animName);
            int fullPathHash = Animator.StringToHash("Base Layer." + animName);
            if (animator.HasState(0, stateHash))
                animator.Play(stateHash, 0, time);
            else if (animator.HasState(0, fullPathHash))
                animator.Play(fullPathHash, 0, time);

            animator.Update(0f);
            animator.speed = 0f;
            return;
        }

        Spine.TrackEntry entry = null;
        if (skeletonGraphic != null && skeletonGraphic.AnimationState != null)
            entry = skeletonGraphic.AnimationState.GetCurrent(0);
        else if (skeletonAnim != null && skeletonAnim.AnimationState != null)
            entry = skeletonAnim.AnimationState.GetCurrent(0);

        if (entry != null && entry.Animation != null)
        {
            entry.TrackTime = entry.Animation.Duration * time;
            entry.TimeScale = 0f;
        }
    }

    public void ReleaseCinematicAnimationHold()
    {
        if (animator != null)
            animator.speed = 1f;

        Spine.TrackEntry entry = null;
        if (skeletonGraphic != null && skeletonGraphic.AnimationState != null)
            entry = skeletonGraphic.AnimationState.GetCurrent(0);
        else if (skeletonAnim != null && skeletonAnim.AnimationState != null)
            entry = skeletonAnim.AnimationState.GetCurrent(0);

        if (entry != null)
            entry.TimeScale = 1f;
    }

    public void ResetCinematicPose(string idleAnimationName)
    {
        ReleaseCinematicAnimationHold();
        currentAnimName = "";

        if (animator != null)
        {
            animator.Rebind();
            animator.Update(0f);
        }
        else if (skeletonGraphic != null && skeletonGraphic.AnimationState != null)
        {
            skeletonGraphic.AnimationState.ClearTrack(0);
            skeletonGraphic.Skeleton.SetToSetupPose();
        }
        else if (skeletonAnim != null && skeletonAnim.AnimationState != null)
        {
            skeletonAnim.AnimationState.ClearTrack(0);
            skeletonAnim.Skeleton.SetToSetupPose();
        }

        PlayAnim(idleAnimationName, true);
        if (animator != null)
            animator.Update(0f);

        var fantasyMonster = GetComponent<Assets.FantasyMonsters.Common.Scripts.Monster>();
        fantasyMonster?.SetHead(0);
    }

    bool IsAnimatorPlaying(string animName)
    {
        if (animator == null) return true;

        AnimatorStateInfo state = animator.GetCurrentAnimatorStateInfo(0);
        return state.IsName(animName) || state.IsName("Base Layer." + animName);
    }

    void ApplyAnimatorParams(string animName)
    {
        if (animator == null || string.IsNullOrEmpty(animName)) return;

        if (animName == "Idle") animator.SetInteger("State", 0);
        else if (animName == "Ready") animator.SetInteger("State", 1);
        else if (animName == "Walk") animator.SetInteger("State", 2);
        else if (animName == "Run") animator.SetInteger("State", 3);
        else if (animName == "Death" || animName == "Die") animator.SetInteger("State", 9);

        if (animName == "Attack") animator.SetTrigger("Attack");
        else if (animName == "AttackAlt") animator.SetTrigger("AttackAlt");
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

        SpawnNormalAttackEffect();
        DealDamageToPlayer(attackPower);

        yield return new WaitForSeconds(0.5f);
        isAttacking = false;
    }

    void SpawnNormalAttackEffect()
    {
        if (normalAttackEffectPrefab == null) return;

        int facingDirection = movingDir;
        if (playerTarget != null)
            facingDirection = playerTarget.position.x >= transform.position.x ? 1 : -1;

        Vector3 offset = normalAttackEffectOffset;
        offset.x *= facingDirection;
        GameObject effect = Instantiate(normalAttackEffectPrefab, transform.position + offset, Quaternion.identity);
        effect.transform.localScale *= normalAttackEffectScale;

        if (flipNormalAttackEffectWithFacing && facingDirection < 0)
        {
            Vector3 scale = effect.transform.localScale;
            scale.x *= -1f;
            effect.transform.localScale = scale;
        }

        BringEffectToFront(effect, 8);
        Destroy(effect, normalAttackEffectLifetime);
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
        float elapsed = 0f;
        bool damageDealt = false;
        while (elapsed < chargeDuration)
        {
            rb.linearVelocity = new Vector2(chargeSpeed * chargeDir, rb.linearVelocity.y);

            if (!damageDealt && GetDistanceToPlayer() <= attackRange + 0.75f)
            {
                DealDamageToPlayer(Mathf.RoundToInt(attackPower * chargeDamageMultiplier));
                damageDealt = true;
            }

            elapsed += Time.fixedDeltaTime;
            yield return new WaitForFixedUpdate();
        }

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

        float jumpSpeedMultiplier = isPhase2 ? phase2JumpSpeedMultiplier : 1f;
        float jumpTimingMultiplier = isPhase2 ? phase2JumpTimingMultiplier : 1f;

        // 위로 점프
        rb.AddForce(Vector2.up * jumpPower * jumpSpeedMultiplier, ForceMode2D.Impulse);
        yield return new WaitForSeconds(0.5f * jumpTimingMultiplier);

        // 플레이어 방향으로 수평 이동
        if (playerTarget != null)
        {
            float dir = (playerTarget.position.x > transform.position.x) ? 1f : -1f;
            rb.linearVelocity = new Vector2(dir * jumpMoveSpeed * jumpSpeedMultiplier, rb.linearVelocity.y);
        }
        yield return new WaitForSeconds(0.3f * jumpTimingMultiplier);

        // 낙하
        rb.linearVelocity = new Vector2(0f, -jumpSlamVelocity * jumpSpeedMultiplier);
        yield return WaitForLanding();

        // ── 착지 연출 ─────────────────────────────────────────
        SpawnLandingEffect();

        // 카메라 흔들림
        CameraFollow.Instance?.Shake(shakeDuration, shakeMagnitude);

        // 착지 충격 — Player 레이어만 감지
        Collider2D[] hits = Physics2D.OverlapCircleAll(transform.position, jumpImpactRadius, LayerMask.GetMask("Player"));
        foreach (var hit in hits)
        {
            var pc = hit.GetComponent<LayerLab.ArtMaker.PlayerCombat>();
            if (pc != null)
                pc.TakePlayerDamage(Mathf.RoundToInt(attackPower * jumpDamageMultiplier), transform.position);
        }

        yield return new WaitForSeconds(0.5f);
        isAttacking = false;
    }

    IEnumerator PoisonPoolAttack()
    {
        isAttacking = true;
        lastPoisonAttackTime = Time.time;
        rb.linearVelocity = Vector2.zero;

        PlayAnim(string.IsNullOrEmpty(skillAnimName) ? attackAnimName : skillAnimName, false);
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

    IEnumerator SmashAttack()
    {
        isAttacking = true;
        lastJumpAttackTime = Time.time;
        rb.linearVelocity = Vector2.zero;

        PlayAnim(string.IsNullOrEmpty(skillAnimName) ? attackAnimName : skillAnimName, false);
        yield return new WaitForSeconds(smashCastDelay);

        Vector3 center = (playerTarget != null) ? playerTarget.position : transform.position;
        center.z = transform.position.z;
        if (playerTarget != null)
        {
            float dir = (playerTarget.position.x > transform.position.x) ? 1f : -1f;
            transform.localScale = new Vector3(-dir, 1, 1);
        }

        if (smashEffectPrefab != null)
        {
            var fx = Instantiate(smashEffectPrefab, center, Quaternion.identity);
            Destroy(fx, 2f);
        }

        CameraFollow.Instance?.Shake(shakeDuration, shakeMagnitude);

        Collider2D[] hits = Physics2D.OverlapCircleAll(center, smashRadius, LayerMask.GetMask("Player"));
        foreach (var hit in hits)
        {
            var pc = hit.GetComponent<LayerLab.ArtMaker.PlayerCombat>();
            if (pc != null)
                pc.TakePlayerDamage(Mathf.RoundToInt(attackPower * smashDamageMultiplier), center);
        }

        yield return new WaitForSeconds(0.45f);
        isAttacking = false;
    }

    IEnumerator StoneGolemSkill(bool forceRockFall)
    {
        isAttacking = true;
        lastStoneSkillTime = Time.time;
        rb.linearVelocity = Vector2.zero;

        PlayAnim(attackAnimName, false);

        if (!forceRockFall && useStoneJumpNext)
        {
            rb.AddForce(Vector2.up * stoneJumpPower, ForceMode2D.Impulse);
            float trackElapsed = 0f;
            while (trackElapsed < stoneJumpTrackDuration)
            {
                trackElapsed += Time.fixedDeltaTime;

                if (playerTarget != null)
                {
                    float horizontalDelta = playerTarget.position.x - transform.position.x;
                    float dir = Mathf.Sign(horizontalDelta);
                    float trackingSpeed = Mathf.Min(stoneJumpMoveSpeed, Mathf.Abs(horizontalDelta) * 4f);

                    if (Mathf.Abs(horizontalDelta) > 0.15f)
                    {
                        transform.localScale = new Vector3(-dir, 1f, 1f);
                        rb.linearVelocity = new Vector2(dir * trackingSpeed, rb.linearVelocity.y);
                    }
                    else
                    {
                        rb.linearVelocity = new Vector2(0f, rb.linearVelocity.y);
                    }
                }

                yield return new WaitForFixedUpdate();
            }

            rb.linearVelocity = new Vector2(0f, -12f);
            yield return WaitForLanding();

            Vector3 center = transform.position;
            SpawnLandingEffect();

            CameraFollow.Instance?.Shake(shakeDuration, shakeMagnitude);
            DamagePlayersInRadius(center, stoneJumpRadius, Mathf.RoundToInt(attackPower * stoneJumpDamageMultiplier));
            yield return new WaitForSeconds(0.45f);
        }
        else
        {
            yield return new WaitForSeconds(rockFallCastDelay);

            int count = isPhase2 ? phase2RockFallCount : rockFallCount;
            for (int i = 0; i < count; i++)
            {
                Vector3 center = playerTarget != null ? playerTarget.position : transform.position;
                float offset = Random.Range(-rockFallSpread, rockFallSpread);
                Vector3 target = new Vector3(center.x + offset, center.y, transform.position.z);
                SpawnFallingRock(target);
                yield return new WaitForSeconds(rockFallInterval);
            }
        }

        if (forceRockFall)
        {
            firstStoneRockPending = false;
            firstStoneRockTriggered = true;
            useStoneJumpNext = true;
        }
        else
        {
            useStoneJumpNext = !useStoneJumpNext;
        }

        yield return new WaitForSeconds(0.35f);
        isAttacking = false;
    }

    IEnumerator WaitForLanding()
    {
        yield return new WaitForFixedUpdate();

        float elapsed = 0f;
        while (elapsed < 1.2f)
        {
            if (IsOnGround()) yield break;

            elapsed += Time.fixedDeltaTime;
            yield return new WaitForFixedUpdate();
        }
    }

    bool IsOnGround()
    {
        if (bossCollider == null)
            bossCollider = FindCombatCollider();
        if (bossCollider == null || groundLayer.value == 0) return false;

        Bounds bounds = bossCollider.bounds;
        RaycastHit2D hit = Physics2D.Raycast(
            bounds.center,
            Vector2.down,
            bounds.extents.y + 0.18f,
            groundLayer
        );
        return hit.collider != null;
    }

    void SpawnLandingEffect()
    {
        if (landingEffectPrefab == null) return;

        Vector3 position = transform.position;
        if (bossCollider != null)
            position.y = bossCollider.bounds.min.y + 0.05f;

        GameObject effect = Instantiate(landingEffectPrefab, position, Quaternion.identity);
        effect.transform.localScale *= landingEffectScale;
        BringEffectToFront(effect, 15);
        Destroy(effect, landingEffectLifetime);
    }

    float GetDragonSpecialCooldown()
    {
        float multiplier = isPhase2 ? dragonPhase2CooldownMultiplier : 1f;
        return Mathf.Max(1f, dragonSpecialCooldown * multiplier);
    }

    void StartNextDragonPattern()
    {
        lastDragonSpecialTime = Time.time;

        switch (nextDragonPattern)
        {
            case 0:
                StartCoroutine(JumpAttack());
                break;
            case 1:
                StartCoroutine(PoisonPoolAttack());
                break;
            default:
                StartCoroutine(StoneGolemSkill(true));
                break;
        }

        nextDragonPattern = (nextDragonPattern + 1) % 3;
    }

    void SpawnFallingRock(Vector3 target)
    {
        if (fallingRockPrefab != null)
        {
            StoneGolemFallingRock rock = Instantiate(
                fallingRockPrefab,
                target + Vector3.up * rockFallHeight,
                Quaternion.identity
            );
            rock.Initialize(
                target,
                rockFallDuration,
                rockFallRadius,
                Mathf.RoundToInt(attackPower * rockFallDamageMultiplier),
                rockWarningEffectPrefab,
                rockImpactEffectPrefab
            );
            return;
        }

        StartCoroutine(FallbackRockImpact(target));
    }

    IEnumerator FallbackRockImpact(Vector3 target)
    {
        GameObject warning = null;
        if (rockWarningEffectPrefab != null)
            warning = Instantiate(rockWarningEffectPrefab, target, Quaternion.identity);

        yield return new WaitForSeconds(rockFallDuration);

        if (warning != null) Destroy(warning);
        if (rockImpactEffectPrefab != null)
        {
            var fx = Instantiate(rockImpactEffectPrefab, target, Quaternion.identity);
            Destroy(fx, 2f);
        }

        CameraFollow.Instance?.Shake(shakeDuration * 0.65f, shakeMagnitude * 0.65f);
        DamagePlayersInRadius(target, rockFallRadius, Mathf.RoundToInt(attackPower * rockFallDamageMultiplier));
    }

    void DamagePlayersInRadius(Vector3 center, float radius, int damage)
    {
        Collider2D[] hits = Physics2D.OverlapCircleAll(center, radius, LayerMask.GetMask("Player"));
        foreach (var hit in hits)
        {
            var pc = hit.GetComponent<LayerLab.ArtMaker.PlayerCombat>();
            if (pc != null)
                pc.TakePlayerDamage(damage, center);
        }
    }

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

        if (phase2Skill == Phase2SkillType.StoneGolem)
        {
            lastStoneSkillTime = Time.time - stoneSkillCooldown;
            firstStoneRockPending = true;
        }

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

    Collider2D FindCombatCollider()
    {
        Collider2D selected = null;
        float smallestArea = float.PositiveInfinity;

        foreach (Collider2D candidate in GetComponents<Collider2D>())
        {
            if (!candidate.enabled || candidate.isTrigger) continue;

            Vector2 size = candidate.bounds.size;
            float area = size.x * size.y;
            if (area < smallestArea)
            {
                selected = candidate;
                smallestArea = area;
            }
        }

        return selected;
    }

    [HideInInspector] public bool suppressDeath = false;

    public void TakeDamage(int damage, bool isCritical = false, bool countsAsBasicAttack = false)
    {
        if (isDead) return;
        currentHealth -= damage;

        Vector3 textPos = GetDamageTextPosition();
        Transform damageText = SpriteFont.ShowDamage(damage.ToString(), textPos, FontType.Rainbow);
        SetEffectSorting(damageText != null ? damageText.gameObject : null, 32000);
        if (damageText != null)
            damageText.position = new Vector3(damageText.position.x, damageText.position.y, transform.position.z - 0.1f);

        GetComponentInChildren<MonsterHpBar>(true)?.Show();
        if (bossHpFillImage != null)
            bossHpFillImage.fillAmount = Mathf.Clamp01((float)currentHealth / maxHealth);

        GameObject effectToSpawn = (isCritical && critHitEffectPrefab != null)
            ? critHitEffectPrefab : hitEffectPrefab;
        if (effectToSpawn != null)
        {
            var fx = Instantiate(effectToSpawn, transform.position, Quaternion.identity);
            BringEffectToFront(fx, 5);
            Destroy(fx, 2f);
        }

        if (isCritical && critBoomEffectPrefab != null)
        {
            Vector3 boomPos = transform.position + new Vector3(0, 2.5f, 0);
            var boom = Instantiate(critBoomEffectPrefab, boomPos, Quaternion.identity);
            BringEffectToFront(boom, 10);
            Destroy(boom, 2f);
        }

        if (currentHealth <= 0 && !suppressDeath) { Die(); return; }

        if (countsAsBasicAttack && phase2Skill == Phase2SkillType.StoneGolem && !firstStoneRockTriggered)
        {
            stoneGolemHitCount++;
            if (stoneGolemHitCount >= Mathf.Max(1, firstRockFallHitThreshold))
                firstStoneRockPending = true;
        }

    }

    void BringEffectToFront(GameObject target, int orderOffset)
    {
        if (target == null) return;

        SortingGroup bossSortingGroup = GetComponentInChildren<SortingGroup>(true);
        int baseOrder = bossSortingGroup != null ? bossSortingGroup.sortingOrder : 0;
        string layerName = bossSortingGroup != null ? bossSortingGroup.sortingLayerName : "Default";

        if (bossSortingGroup == null)
        {
            foreach (Renderer bossRenderer in GetComponentsInChildren<Renderer>(true))
            {
                if (bossRenderer.sortingOrder >= baseOrder)
                {
                    baseOrder = bossRenderer.sortingOrder;
                    layerName = bossRenderer.sortingLayerName;
                }
            }
        }

        SetEffectSorting(target, Mathf.Min(30000, baseOrder + orderOffset), layerName);
    }

    void SetEffectSorting(GameObject target, int sortingOrder, string layerName = null)
    {
        if (target == null) return;
        if (string.IsNullOrEmpty(layerName))
        {
            SortingGroup bossSortingGroup = GetComponentInChildren<SortingGroup>(true);
            layerName = bossSortingGroup != null ? bossSortingGroup.sortingLayerName : "Default";
        }

        foreach (SortingGroup effectGroup in target.GetComponentsInChildren<SortingGroup>(true))
        {
            effectGroup.sortingLayerName = layerName;
            effectGroup.sortingOrder = sortingOrder;
        }

        SpriteFont spriteFont = target.GetComponent<SpriteFont>();
        if (spriteFont != null)
        {
            SortingGroup fontSortingGroup = target.GetComponent<SortingGroup>();
            if (fontSortingGroup == null)
                fontSortingGroup = target.AddComponent<SortingGroup>();

            fontSortingGroup.sortingLayerName = layerName;
            fontSortingGroup.sortingOrder = sortingOrder;
            spriteFont.SetSorting(layerName, sortingOrder);
        }

        foreach (Renderer effectRenderer in target.GetComponentsInChildren<Renderer>(true))
        {
            effectRenderer.sortingLayerName = layerName;
            effectRenderer.sortingOrder = sortingOrder;
        }
    }

    Vector3 GetDamageTextPosition()
    {
        if (bossCollider == null)
            bossCollider = GetComponent<Collider2D>();

        float y = bossCollider != null
            ? bossCollider.bounds.max.y + 0.6f
            : transform.position.y + 2.5f;

        return new Vector3(transform.position.x, y, transform.position.z);
    }

    public void ReleaseSuppressDeath()
    {
        suppressDeath = false;
        if (!isDead && currentHealth <= 0)
            Die();
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
        if (GameManager.Instance != null && fixedChestDiamondReward <= 0)
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
            GameResultUI.Instance.ShowRewardPanel(fixedChestDiamondReward, fixedChestExpReward);
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
