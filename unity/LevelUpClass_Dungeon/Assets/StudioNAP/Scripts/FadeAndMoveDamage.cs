using UnityEngine;
using System.Collections;

namespace StudioNAP
{

    public class FadeAndMoveDamage : MonoBehaviour
    {
        [SerializeField] private float delay = 1f;
        [SerializeField] private float moveDelay = 0.5f;
        [SerializeField] private float fadeDuration = 1f;
        [SerializeField] private float moveDuration = 2f;
        [SerializeField] private float speed = 2f;

        public bool DestroyOnComplete = true;

        Coroutine _fadeAndMoveCoroutine;
        Coroutine _moveUpCoroutine;
        Coroutine _scaleToOneCoroutine;
        private void Start()
        {
            StartAllSchedules();
        }
        private void OnEnable()
        {
            StartAllSchedules();
        }
        private void OnDisable()
        {
            StopAllSchedules();
        }
        public void StartAllSchedules()
        {
            StopAllSchedules();

            SpriteRenderer[] spriteRenderers = GetComponentsInChildren<SpriteRenderer>();

            foreach (SpriteRenderer renderer in spriteRenderers)
            {
                Color color = renderer.color;
                color.a = 1;
                renderer.color = color;
            }

            _fadeAndMoveCoroutine = StartCoroutine(FadeAndMoveCoroutine());
            _moveUpCoroutine = StartCoroutine(MoveUpCoroutine());
            _scaleToOneCoroutine = StartCoroutine(ScaleToOneCoroutine());
        }
        public void StopAllSchedules()
        {
            if (_fadeAndMoveCoroutine != null) StopCoroutine(_fadeAndMoveCoroutine);
            if (_moveUpCoroutine != null) StopCoroutine(_moveUpCoroutine);
            if (_scaleToOneCoroutine != null) StopCoroutine(_scaleToOneCoroutine);
        }
        IEnumerator ScaleToOneCoroutine()
        {
            float scaleSpeed = 0.03f;
            while (transform.localScale.x > 1f)
            {
                float scaleChange = scaleSpeed * Time.deltaTime;
                transform.localScale = new Vector3(transform.localScale.x - scaleChange, transform.localScale.y - scaleChange, transform.localScale.z - scaleChange);
                yield return null;
            }
        }
        IEnumerator MoveUpCoroutine()
        {
            yield return new WaitForSeconds(moveDelay / 3);
            float shakeDuration = moveDelay / 3;
            float shakeMagnitude = 0.1f;

            float elapsed = 0.0f;

            while (elapsed < shakeDuration)
            {
                float x = Random.Range(-0.5f, 0.5f) * shakeMagnitude;
                float y = Random.Range(-0.5f, 0.5f) * shakeMagnitude;

                transform.position = new Vector3(transform.position.x + x, transform.position.y + y, transform.position.z);

                elapsed += Time.deltaTime;

                yield return null;
            }
            yield return new WaitForSeconds(moveDelay / 3);

            float elapsedTime = 0f;

            while (elapsedTime < moveDuration)
            {
                elapsedTime += Time.deltaTime;
                float newY = transform.position.y + (speed * Time.deltaTime);

                transform.position = new Vector3(transform.position.x, newY, transform.position.z);
                yield return null;
            }
        }

        private IEnumerator FadeAndMoveCoroutine()
        {
            yield return new WaitForSeconds(delay);

            SpriteRenderer[] spriteRenderers = GetComponentsInChildren<SpriteRenderer>();
            float elapsedTime = 0f;

            while (elapsedTime < fadeDuration)
            {
                elapsedTime += Time.deltaTime;
                float alpha = 1f - (elapsedTime / fadeDuration);

                foreach (SpriteRenderer renderer in spriteRenderers)
                {
                    Color color = renderer.color;
                    color.a = alpha;
                    renderer.color = color;
                }

                yield return null;
            }

            if (DestroyOnComplete)
            {
                Destroy(gameObject);
            }
        }
    }
}