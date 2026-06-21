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

        cameraFollow.smoothSpeed = 2.2f;
        cameraFollow.target = boss.transform;
        yield return new WaitForSeconds(boss.introCameraMoveDuration);

        string introAnimation = string.IsNullOrEmpty(boss.rageAnimName)
            ? boss.skillAnimName
            : boss.rageAnimName;
        boss.PlayCinematicAnimation(introAnimation, false);
        CameraFollow.Instance?.Shake(boss.introBossShowDuration, boss.introShakeMagnitude);

        float mouthDelay = Mathf.Clamp(boss.introMouthOpenDelay, 0f, boss.introBossShowDuration);
        yield return new WaitForSeconds(mouthDelay);
        boss.HoldCinematicAnimation(introAnimation, boss.introMouthOpenNormalizedTime);

        yield return new WaitForSeconds(Mathf.Max(0f, boss.introBossShowDuration - mouthDelay));

        boss.ResetCinematicPose(boss.idleAnimName);

        cameraFollow.smoothSpeed = 3.2f;
        cameraFollow.target = player;
        yield return new WaitForSeconds(boss.introCameraReturnDuration);

        cameraFollow.target = originalCameraTarget != null ? originalCameraTarget : player;
        cameraFollow.smoothSpeed = originalSmoothSpeed;
        if (playerMovement != null) playerMovement.enabled = movementWasEnabled;
        playerCombat.enabled = combatWasEnabled;
        boss.SetCinematicLock(false);
    }

}
