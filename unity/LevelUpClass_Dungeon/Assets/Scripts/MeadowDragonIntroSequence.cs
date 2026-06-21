using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;
using LayerLab.ArtMaker;

[DisallowMultipleComponent]
public class MeadowDragonIntroSequence : MonoBehaviour
{
    private MeadowDragonBossFSM boss;

    public void Initialize(MeadowDragonBossFSM owner)
    {
        boss = owner;
    }

    private IEnumerator Start()
    {
        if (boss == null)
            boss = GetComponent<MeadowDragonBossFSM>();
        if (boss == null || !boss.playBattleIntro)
            yield break;
        if (SceneManager.GetActiveScene().name != boss.introSceneName)
            yield break;

        PlayerCombat playerCombat = null;
        CameraFollow cameraFollow = null;
        float findTimeout = 5f;

        while (findTimeout > 0f && (playerCombat == null || cameraFollow == null))
        {
            playerCombat = PlayerCombat.FindMainPlayerCombat();
            cameraFollow = CameraFollow.Instance;
            findTimeout -= Time.unscaledDeltaTime;
            yield return null;
        }

        if (playerCombat == null || cameraFollow == null)
            yield break;

        Transform player = playerCombat.transform;
        PlayerMovement playerMovement = player.GetComponent<PlayerMovement>();
        Rigidbody2D playerBody = player.GetComponent<Rigidbody2D>();
        bool movementWasEnabled = playerMovement != null && playerMovement.enabled;
        bool combatWasEnabled = playerCombat.enabled;
        Transform originalCameraTarget = cameraFollow.target;
        float originalSmoothSpeed = cameraFollow.smoothSpeed;

        boss.SetCinematicLock(true);
        if (playerMovement != null) playerMovement.enabled = false;
        playerCombat.enabled = false;
        if (playerBody != null)
            playerBody.linearVelocity = Vector2.zero;
        MobileInput.horizontal = 0f;
        MobileInput.isMovingButton = false;
        MobileInput.isAttackPressed = false;

        yield return null;

        float durationScale = 1f;
#if UNITY_WEBGL && !UNITY_EDITOR
        durationScale = Mathf.Clamp(boss.webGLIntroDurationScale, 0.4f, 1f);
#endif

        cameraFollow.smoothSpeed = 2.2f;
        cameraFollow.target = boss.transform;
        yield return new WaitForSecondsRealtime(boss.introCameraMoveDuration * durationScale);

        string introAnimation = string.IsNullOrEmpty(boss.rageAnimName)
            ? boss.skillAnimName
            : boss.rageAnimName;
        boss.PlayCinematicAnimation(introAnimation, false);
        float bossShowDuration = boss.introBossShowDuration * durationScale;
        CameraFollow.Instance?.Shake(bossShowDuration, boss.introShakeMagnitude, true);

        float mouthDelay = Mathf.Clamp(boss.introMouthOpenDelay * durationScale, 0f, bossShowDuration);
        yield return new WaitForSecondsRealtime(mouthDelay);
        boss.HoldCinematicAnimation(introAnimation, boss.introMouthOpenNormalizedTime);

        yield return new WaitForSecondsRealtime(Mathf.Max(0f, bossShowDuration - mouthDelay));

        boss.ResetCinematicPose(boss.idleAnimName);

        cameraFollow.smoothSpeed = 3.2f;
        cameraFollow.target = player;
        yield return new WaitForSecondsRealtime(boss.introCameraReturnDuration * durationScale);

        cameraFollow.target = originalCameraTarget != null ? originalCameraTarget : player;
        cameraFollow.smoothSpeed = originalSmoothSpeed;
        if (playerMovement != null) playerMovement.enabled = movementWasEnabled;
        playerCombat.enabled = combatWasEnabled;
        boss.SetCinematicLock(false);
    }

}
