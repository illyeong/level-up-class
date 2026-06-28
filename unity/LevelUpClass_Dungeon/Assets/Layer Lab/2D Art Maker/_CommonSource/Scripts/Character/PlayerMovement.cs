using System.Collections;
using UnityEngine;
using Spine.Unity;

namespace LayerLab.ArtMaker
{
    public class PlayerMovement : MonoBehaviour
    {
        [Header("이동 및 점프 설정")]
        public float moveSpeed = 5f; 
        public float jumpForce = 8f; 
        public Transform groundCheck; 
        public float groundCheckRadius = 0.1f;
        public LayerMask groundLayer; 

        [Header("모바일 조이스틱")]
        [SerializeField] private Joystick joystick;

        [Header("애니메이션 이름")]
        public string idleAnimName = "Idle";
        public string runAnimName = "Walk";
        public string jumpAnimName = "Idle";

        private Rigidbody2D rb;
        private SkeletonAnimation skeletonAnim;
        private SkeletonGraphic skeletonGraphic;
        
        // 🔥 에러의 원인! 이 선언부가 있어야 컴뱃 스크립트를 인식합니다.
        private PlayerCombat playerCombat; 
        
        private bool isGrounded;
        private string currentAnim = "";
        private float baseMoveSpeed;
        private Coroutine moveSpeedModifierRoutine;

        public void ResetAnimState() { currentAnim = ""; }

        void Start()
        {
            rb = GetComponent<Rigidbody2D>();
            skeletonAnim = GetComponent<SkeletonAnimation>();
            skeletonGraphic = GetComponent<SkeletonGraphic>();
            playerCombat = GetComponent<PlayerCombat>();
            baseMoveSpeed = moveSpeed;

            // Inspector에서 연결 안 됐으면 씬에서 자동 탐색
            // 씬 전환 직후엔 1프레임 뒤 재탐색으로 타이밍 문제 방지
            if (joystick == null)
                joystick = UnityEngine.Object.FindFirstObjectByType<Joystick>();
            if (joystick == null)
                StartCoroutine(FindJoystickNextFrame());
        }

        System.Collections.IEnumerator FindJoystickNextFrame()
        {
            yield return null;
            if (joystick == null)
                joystick = UnityEngine.Object.FindFirstObjectByType<Joystick>();
        }

        void Update()
        {
            // 피격 중에는 이동 완전 차단, 공격 중에는 이동 허용
            if (playerCombat != null && playerCombat.isHit)
            {
                rb.linearVelocity = new Vector2(0f, rb.linearVelocity.y);
                return;
            }

            // 1. 발밑에 바닥이 있는지 체크
            isGrounded = Physics2D.OverlapCircle(groundCheck.position, groundCheckRadius, groundLayer);

            // 2. 좌우 이동 (키보드 → 조이스틱 → 모바일 버튼 순 우선순위)
            float moveX = Input.GetAxisRaw("Horizontal");
            if (Mathf.Approximately(moveX, 0f) && joystick != null)
                moveX = joystick.Horizontal;
            if (Mathf.Approximately(moveX, 0f))
                moveX = MobileInput.horizontal;
            rb.linearVelocity = new Vector2(moveX * moveSpeed, rb.linearVelocity.y);

            // 3. 점프
            if (Input.GetButtonDown("Jump") && isGrounded)
            {
                rb.linearVelocity = new Vector2(rb.linearVelocity.x, jumpForce);
            }

            // 4. 방향 쳐다보기
            if (moveX > 0) transform.localScale = new Vector3(-1, 1, 1); 
            else if (moveX < 0) transform.localScale = new Vector3(1, 1, 1); 

            // 5. 상황별 애니메이션 재생 (공격 중에는 Movement가 덮어쓰지 않음)
            bool isAttacking = playerCombat != null && playerCombat.isAttacking;
            if (!isAttacking)
            {
                if (!isGrounded)
                    PlayAnim(jumpAnimName, false);
                else if (moveX != 0)
                    PlayAnim(runAnimName, true);
                else
                    PlayAnim(idleAnimName, true);
            }
            else if (moveX != 0)
            {
                // 공격 중 이동 방향만 전환 (애니메이션은 PlayerCombat이 관리)
                // 방향 전환은 이미 위에서 처리됨
            }
        }

        void PlayAnim(string animName, bool loop)
        {
            if (currentAnim == animName) return;

            if (skeletonGraphic != null && skeletonGraphic.AnimationState != null)
                skeletonGraphic.AnimationState.SetAnimation(0, animName, loop);
            else if (skeletonAnim != null && skeletonAnim.AnimationState != null)
                skeletonAnim.AnimationState.SetAnimation(0, animName, loop);
                
            currentAnim = animName;
        }

        public void ApplyMoveSpeedMultiplier(float multiplier, float duration)
        {
            if (duration <= 0f) return;

            if (moveSpeedModifierRoutine != null)
                StopCoroutine(moveSpeedModifierRoutine);

            moveSpeedModifierRoutine = StartCoroutine(MoveSpeedModifierRoutine(multiplier, duration));
        }

        private IEnumerator MoveSpeedModifierRoutine(float multiplier, float duration)
        {
            moveSpeed = baseMoveSpeed * Mathf.Clamp(multiplier, 0.1f, 2f);
            yield return new WaitForSeconds(duration);
            moveSpeed = baseMoveSpeed;
            moveSpeedModifierRoutine = null;
        }

        void OnDrawGizmosSelected()
        {
            if (groundCheck == null) return;
            Gizmos.color = Color.green;
            Gizmos.DrawWireSphere(groundCheck.position, groundCheckRadius);
        }
    }
}
