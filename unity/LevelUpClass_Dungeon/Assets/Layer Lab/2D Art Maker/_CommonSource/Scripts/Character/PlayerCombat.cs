using UnityEngine;
using Spine.Unity;
using StudioNAP;

namespace LayerLab.ArtMaker
{
    public class PlayerCombat : MonoBehaviour
    {
        public static PlayerCombat FindMainPlayerCombat()
        {
            var combats = FindObjectsByType<PlayerCombat>(FindObjectsSortMode.None);
            foreach (var combat in combats)
            {
                if (combat != null && combat.GetComponent<PlayerMovement>() != null)
                    return combat;
            }
            return null;
        }
        [Header("플레이어 스탯")]
        public int maxHealth = 100;
        public int currentHealth = 100;
        public int maxMana = 100;
        public int currentMana = 100;
        public int attackPower = 10;
        public int defense = 5;
        [Range(0, 100)] public int critChance = 20;
        public float critDamageMultiplier = 1.5f;

        [Header("공격 설정")]
        public Transform attackPoint; 
        public float attackRange = 1.5f; 
        public LayerMask monsterLayer; 

        [Header("피격 및 무적 설정")]
        public Vector3 hitBoxOffset = new Vector3(0, 0.5f, 0); 
        public float hitBoxRadius = 0.8f; 
        public float invincibleTime = 1.5f;
        public float knockbackForce = 5f; 
        public string hitAnimName = "Hit"; 

        [Header("애니메이션 설정")]
        public string attackAnimName = "Attack";
        public string idleAnimName = "Idle";
        public string deadAnimName = "Dead";

        private SkeletonAnimation skeletonAnim;
        private SkeletonGraphic skeletonGraphic;
        private float nextAttackTime = 0f;
        public float attackCooldown = 0.5f; 

        [HideInInspector] public bool isHit = false;
        [HideInInspector] public bool isAttacking = false;
        public float attackAnimDuration = 0.4f;
        private bool isInvincible = false;

        void Start()
        {
            // 씬 실수로 AttackPoint 등에 붙어 있으면 가짜 사망 판정이 발생하므로 차단
            if (GetComponent<PlayerMovement>() == null)
            {
                Debug.LogWarning($"[PlayerCombat] Disabled on '{name}' because PlayerMovement is missing.");
                enabled = false;
                return;
            }

            skeletonAnim = GetComponent<SkeletonAnimation>();
            skeletonGraphic = GetComponent<SkeletonGraphic>();

            // GameManager가 있으면 저장된 스탯/체력을 불러온다
            if (GameManager.Instance != null)
            {
                var gm = GameManager.Instance;
                maxHealth            = gm.maxHealth;
                currentHealth        = gm.currentHealth;
                maxMana              = gm.maxMana;
                currentMana          = gm.currentMana;
                attackPower          = gm.attackPower;
                defense              = gm.defense;
                critChance           = gm.critChance;
                critDamageMultiplier = gm.critDamageMultiplier;
            }
            else
            {
                currentHealth = maxHealth;
                currentMana   = maxMana;
            }
        }

        void Update()
        {
            if (isHit) return;

            if (!isInvincible)
            {
                Vector3 checkPos = transform.position + hitBoxOffset;
                Collider2D[] hitMonsters = Physics2D.OverlapCircleAll(checkPos, hitBoxRadius, monsterLayer);
                
                foreach (Collider2D hitMonster in hitMonsters)
                {
                    MonsterFSM monster = hitMonster.GetComponent<MonsterFSM>();
                    if (monster != null && !monster.isDead)
                    {
                        TakePlayerDamage(monster.attackPower, hitMonster.transform.position);
                        break; 
                    }
                }
            }

            // 화면 우측 절반 탭 = 공격 / 좌측 = 조이스틱 영역 (FloatingJoystick 충돌 방지)
            bool attackInput = MobileInput.isAttackPressed
                            || (Input.GetMouseButtonDown(0) && Input.mousePosition.x > Screen.width * 0.45f);
            if (attackInput && Time.time >= nextAttackTime)
            {
                Attack();
                nextAttackTime = Time.time + attackCooldown;
            }
        }

        public void TakePlayerDamage(int damage, Vector3 monsterPos)
        {
            int finalDamage = Mathf.Max(1, damage - (defense / 2));
            currentHealth -= finalDamage;

            // 체력을 GameManager에 즉시 동기화
            GameManager.Instance?.SyncHealth(currentHealth);

            if (currentHealth <= 0)
            {
                Die();
                return;
            }
            
            // 🔥 에러 나는 에셋 대신, 유니티 기본 기능으로 완전히 다른 느낌의 폰트 생성!
            Vector3 textPos = transform.position + new Vector3(0, 1.5f, 0);
            
            GameObject dmgObj = new GameObject("PlayerDamageText");
            dmgObj.transform.position = textPos;
            
            TextMesh tm = dmgObj.AddComponent<TextMesh>();
            tm.text = finalDamage.ToString();
            tm.color = Color.red;             // 강렬한 빨간색
            tm.fontSize = 60;                 // 큼직하고 뚜렷하게
            tm.characterSize = 0.1f;
            tm.anchor = TextAnchor.MiddleCenter;
            tm.fontStyle = FontStyle.Bold;    // 폰트 굵게
            
            // 글씨가 캐릭터나 몬스터에 안 가려지도록 맨 앞으로 당기기
            MeshRenderer mr = dmgObj.GetComponent<MeshRenderer>();
            mr.sortingOrder = 9999;
            
            // 둥둥 뜨는 효과와 검은색 테두리(그림자) 추가 스크립트
            dmgObj.AddComponent<PlayerDamageFloater>();

            isInvincible = true;
            isHit = true;

            if (skeletonGraphic != null && skeletonGraphic.AnimationState != null)
                skeletonGraphic.AnimationState.SetAnimation(0, hitAnimName, false);
            else if (skeletonAnim != null && skeletonAnim.AnimationState != null)
                skeletonAnim.AnimationState.SetAnimation(0, hitAnimName, false);

            Rigidbody2D rb = GetComponent<Rigidbody2D>();
            if (rb != null)
            {
                rb.linearVelocity = Vector2.zero; 
                float dir = transform.position.x < monsterPos.x ? -1f : 1f; 
                rb.AddForce(new Vector2(dir * knockbackForce, knockbackForce), ForceMode2D.Impulse);
            }

            Invoke("ResetHitState", 0.5f);
            Invoke("ResetInvincibility", invincibleTime);
        }

        void ResetAttacking()
        {
            isAttacking = false;
        }

        void ResetHitState()
        {
            isHit = false;
            // PlayerMovement가 currentAnim을 다시 평가하도록 리셋
            GetComponent<PlayerMovement>()?.ResetAnimState();

            if (skeletonGraphic != null && skeletonGraphic.AnimationState != null)
                skeletonGraphic.AnimationState.SetAnimation(0, idleAnimName, true);
            else if (skeletonAnim != null && skeletonAnim.AnimationState != null)
                skeletonAnim.AnimationState.SetAnimation(0, idleAnimName, true);
        }

        void ResetInvincibility()
        {
            isInvincible = false;
        }

        void Die()
        {
            // 이동 및 전투 입력 중단
            var movement = GetComponent<PlayerMovement>();
            if (movement != null) movement.enabled = false;
            enabled = false;

            Rigidbody2D rb = GetComponent<Rigidbody2D>();
            if (rb) rb.linearVelocity = Vector2.zero;

            // 사망 애니메이션 재생
            if (skeletonGraphic != null && skeletonGraphic.AnimationState != null)
                skeletonGraphic.AnimationState.SetAnimation(0, deadAnimName, false);
            else if (skeletonAnim != null && skeletonAnim.AnimationState != null)
                skeletonAnim.AnimationState.SetAnimation(0, deadAnimName, false);

            // enabled = false여도 Invoke는 취소되지 않음
            Invoke(nameof(ReturnToLobby), 2f);
        }

        void ReturnToLobby()
        {
            if (GameResultUI.Instance != null)
                GameResultUI.Instance.ShowDeathPanel();
            else if (GameManager.Instance != null)
                GameManager.Instance.GoToScene(GameManager.SceneLobby);
            else
                UnityEngine.SceneManagement.SceneManager.LoadScene("Lobby");
        }

        void Attack()
        {
            isAttacking = true;
            Invoke(nameof(ResetAttacking), attackAnimDuration);

            if (skeletonGraphic != null && skeletonGraphic.AnimationState != null)
            {
                skeletonGraphic.AnimationState.SetAnimation(0, attackAnimName, false);
                skeletonGraphic.AnimationState.AddAnimation(0, idleAnimName, true, 0f);
            }
            else if (skeletonAnim != null && skeletonAnim.AnimationState != null)
            {
                skeletonAnim.AnimationState.SetAnimation(0, attackAnimName, false);
                skeletonAnim.AnimationState.AddAnimation(0, idleAnimName, true, 0f);
            }

            if (attackPoint != null)
            {
                Collider2D[] hitMonsters = Physics2D.OverlapCircleAll(attackPoint.position, attackRange, monsterLayer);
                foreach (Collider2D monster in hitMonsters)
                {
                    bool isCrit = Random.Range(0, 100) < critChance;
                    int finalDamage = isCrit
                        ? Mathf.RoundToInt(attackPower * critDamageMultiplier)
                        : attackPower;

                    BossFSM boss = monster.GetComponent<BossFSM>();
                    if (boss != null && !boss.isDead)
                    {
                        boss.TakeDamage(finalDamage, isCrit);
                        continue;
                    }

                    MonsterFSM target = monster.GetComponent<MonsterFSM>();
                    if (target != null)
                        target.TakeDamage(finalDamage, isCrit);
                }
            }
        }

        void OnDrawGizmosSelected()
        {
            if (attackPoint != null)
            {
                Gizmos.color = Color.red;
                Gizmos.DrawWireSphere(attackPoint.position, attackRange);
            }
            Gizmos.color = Color.blue;
            Gizmos.DrawWireSphere(transform.position + hitBoxOffset, hitBoxRadius);
        }
    }

    // 🔥 유니티 기본 폰트에 '검은색 굵은 테두리'를 입히고 위로 날아가는 클래스
    public class PlayerDamageFloater : MonoBehaviour
    {
        public float moveSpeed = 2f;
        public float lifeTime = 1f;

        void Start()
        {
            TextMesh tm = GetComponent<TextMesh>();
            if (tm != null)
            {
                // 검은색 테두리를 만들기 위해 십자(4방향)로 배경 글씨를 깔아줍니다.
                CreateOutline(tm, new Vector3(0.02f, 0.02f, 0));
                CreateOutline(tm, new Vector3(-0.02f, 0.02f, 0));
                CreateOutline(tm, new Vector3(0.02f, -0.02f, 0));
                CreateOutline(tm, new Vector3(-0.02f, -0.02f, 0));
            }

            // 1초 뒤에 깔끔하게 삭제
            Destroy(gameObject, lifeTime);
        }

        void CreateOutline(TextMesh baseMesh, Vector3 offset)
        {
            GameObject outlineObj = new GameObject("Outline");
            outlineObj.transform.SetParent(transform);
            outlineObj.transform.localPosition = offset;
            
            TextMesh outTM = outlineObj.AddComponent<TextMesh>();
            outTM.text = baseMesh.text;
            outTM.color = Color.black; // 테두리는 검은색!
            outTM.fontSize = baseMesh.fontSize;
            outTM.characterSize = baseMesh.characterSize;
            outTM.anchor = baseMesh.anchor;
            outTM.fontStyle = baseMesh.fontStyle;
            
            // 메인 글씨(빨간색)보다 무조건 뒤에 깔리도록 순서 조절
            MeshRenderer mr = outlineObj.GetComponent<MeshRenderer>();
            mr.sortingOrder = baseMesh.GetComponent<MeshRenderer>().sortingOrder - 1;
        }

        void Update()
        {
            transform.Translate(Vector3.up * moveSpeed * Time.deltaTime);
        }
    }
}
