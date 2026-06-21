using System.Collections;
using UnityEngine;

[DisallowMultipleComponent]
public class StoneGolemFallingRock : MonoBehaviour
{
    private Vector3 targetPosition;
    private float fallDuration;
    private float damageRadius;
    private int damage;
    private GameObject impactEffectPrefab;
    private GameObject warningEffect;
    private bool initialized;

    public void Initialize(
        Vector3 target,
        float duration,
        float radius,
        int damageAmount,
        GameObject warningPrefab,
        GameObject impactPrefab)
    {
        targetPosition = target;
        fallDuration = Mathf.Max(0.1f, duration);
        damageRadius = Mathf.Max(0.1f, radius);
        damage = Mathf.Max(1, damageAmount);
        impactEffectPrefab = impactPrefab;
        initialized = true;

        if (warningPrefab != null)
            warningEffect = Instantiate(warningPrefab, targetPosition, Quaternion.identity);

        StartCoroutine(FallAndImpact());
    }

    private IEnumerator FallAndImpact()
    {
        Vector3 startPosition = transform.position;
        float elapsed = 0f;

        while (elapsed < fallDuration)
        {
            elapsed += Time.deltaTime;
            float t = Mathf.Clamp01(elapsed / fallDuration);
            transform.position = Vector3.Lerp(startPosition, targetPosition, t * t);
            yield return null;
        }

        Impact();
    }

    private void Impact()
    {
        if (warningEffect != null)
            Destroy(warningEffect);

        if (impactEffectPrefab != null)
        {
            var fx = Instantiate(impactEffectPrefab, targetPosition, Quaternion.identity);
            Destroy(fx, 2f);
        }

        CameraFollow.Instance?.Shake(0.22f, 0.25f);

        Collider2D[] hits = Physics2D.OverlapCircleAll(targetPosition, damageRadius, LayerMask.GetMask("Player"));
        foreach (var hit in hits)
        {
            var player = hit.GetComponent<LayerLab.ArtMaker.PlayerCombat>();
            if (player != null)
                player.TakePlayerDamage(damage, targetPosition);
        }

        Destroy(gameObject);
    }

    private void OnDestroy()
    {
        if (warningEffect != null)
            Destroy(warningEffect);
    }

    private void OnDrawGizmosSelected()
    {
        if (!initialized) return;
        Gizmos.color = new Color(1f, 0.45f, 0f, 0.8f);
        Gizmos.DrawWireSphere(targetPosition, damageRadius);
    }
}
