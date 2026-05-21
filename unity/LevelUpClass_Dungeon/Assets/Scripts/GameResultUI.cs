using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Spine.Unity;

/// <summary>
/// 보스 클리어 보상 선택창 + 사망 화면.
///
/// 보상창: IronChest 프리팹을 월드에 3개 스폰 → 클릭 → Open 애니 → 보상 표시
/// 사망창: Canvas 패널로 통계 표시
/// </summary>
public class GameResultUI : MonoBehaviour
{
    public static GameResultUI Instance { get; private set; }

    // ── 보상 선택 ─────────────────────────────────────────────
    [Header("보상 선택 패널 (Canvas)")]
    public GameObject       rewardPanel;        // Canvas 안의 배경 패널 (dim overlay)
    public TextMeshProUGUI  rewardTitleText;
    public GameObject       confirmArea;
    public TextMeshProUGUI  confirmText;

    [Header("상자 스폰 설정 (World Space)")]
    public GameObject   chestPrefab;            // IronChest 프리팹
    public Transform    chestSpawnCenter;        // 상자 3개의 중심 위치
    public float        chestSpacing = 4f;       // 상자 간격
    public string       openAnimName = "Open";
    public string       idleAnimName = "Idle";

    [Header("보상 텍스트 (World Space)")]
    public GameObject   rewardTextPrefab;       // 월드에 띄울 텍스트 프리팹 (TMP 포함)

    // ── 사망 패널 ─────────────────────────────────────────────
    [Header("사망 패널 (Canvas)")]
    public GameObject       deathPanel;
    public TextMeshProUGUI  killCountText;
    public TextMeshProUGUI  earnedGoldText;

    [Header("월드 스페이스 오버레이")]
    public int dimSortingOrder   = 100; // 게임 배경보다 위
    public int chestSortingOrder = 200; // 오버레이보다 위

    // ── 내부 상태 ─────────────────────────────────────────────
    private RewardData[]        _rewards    = new RewardData[3];
    private ChestClickHandler[] _handlers   = new ChestClickHandler[3];
    private int                 _selected   = -1;
    private GameObject          _dimOverlay;
    private List<GameObject>    _spawnedChests = new();

    void Awake()
    {
        Instance = this;
        rewardPanel?.SetActive(false);
        deathPanel?.SetActive(false);
        confirmArea?.SetActive(false);
    }

    // ────────────────────────────────────────────────────────
    // 보스 클리어 → 보상창 표시
    // ────────────────────────────────────────────────────────

    public void ShowRewardPanel()
    {
        _selected = -1;
        SpawnChests();

        if (rewardTitleText != null)
            rewardTitleText.text = "보스 클리어!\n상자를 하나 선택하세요";

        CreateDimOverlay();
        rewardPanel?.SetActive(true);
        confirmArea?.SetActive(false);
    }

    void SpawnChests()
    {
        // 이전 상자 제거
        foreach (var obj in _spawnedChests)
            if (obj) Destroy(obj);
        _spawnedChests.Clear();

        if (chestPrefab == null) return;

        // 카메라 화면 중앙 기준 상자 배치
        Camera cam = Camera.main;
        Vector3 center;
        if (chestSpawnCenter != null)
        {
            center = chestSpawnCenter.position;
        }
        else
        {
            // 2D 직교 카메라 기준: 화면 가로 중앙, 카메라 Y에서 약간 아래
            center = new Vector3(cam.transform.position.x, cam.transform.position.y - 1.5f, 0f);
        }

        for (int i = 0; i < 3; i++)
        {
            float offsetX = (i - 1) * chestSpacing; // -1, 0, +1
            var pos   = center + new Vector3(offsetX, 0f, 0f);
            var chest = Instantiate(chestPrefab, pos, Quaternion.identity);
            _spawnedChests.Add(chest);

            // 오버레이보다 위에 렌더링
            foreach (var sr in chest.GetComponentsInChildren<SpriteRenderer>())
                sr.sortingOrder = chestSortingOrder;

            // 클릭 핸들러 추가
            var handler = chest.AddComponent<ChestClickHandler>();
            handler.chestIndex = i;
            _handlers[i] = handler;

            // 보상 배정 및 Idle 재생
            _rewards[i] = GenerateReward();
            PlayChestAnim(chest, idleAnimName);
        }
    }

    // ChestClickHandler에서 호출
    public void OnChestClick(int index)
    {
        if (_selected != -1) return;
        _selected = index;

        for (int i = 0; i < 3; i++)
        {
            _handlers[i].opened = true;
            var anim = _spawnedChests[i].GetComponent<Animator>();

            if (i == index)
            {
                // Spine 우선, 없으면 Animator 사용
                PlayChestAnim(_spawnedChests[i], openAnimName);
                if (rewardTextPrefab != null)
                    ShowRewardText(_spawnedChests[i].transform.position + Vector3.up * 1.5f, _rewards[i].DisplayText);
            }
            else
            {
                // 나머지 상자 흐리게
                var renderers = _spawnedChests[i].GetComponentsInChildren<SpriteRenderer>();
                foreach (var r in renderers)
                    r.color = new Color(1f, 1f, 1f, 0.35f);
            }
        }

        if (confirmText != null)
            confirmText.text = $"{_rewards[index].DisplayText}\n획득하기";
        confirmArea?.SetActive(true);
    }

    [Header("애니메이션 속도 (작을수록 느림)")]
    public float chestOpenSpeed = 0.4f;

    void CreateDimOverlay()
    {
        if (_dimOverlay) Destroy(_dimOverlay);

        _dimOverlay = new GameObject("DimOverlay");
        var sr = _dimOverlay.AddComponent<SpriteRenderer>();

        // 1x1 흰 텍스처로 단색 스프라이트 생성
        var tex = new Texture2D(1, 1);
        tex.SetPixel(0, 0, Color.white);
        tex.Apply();
        sr.sprite = Sprite.Create(tex, new Rect(0, 0, 1, 1), new Vector2(0.5f, 0.5f));
        sr.color = new Color(0f, 0f, 0f, 0.75f);
        sr.sortingOrder = dimSortingOrder;

        var cam = Camera.main;
        float dist = Mathf.Abs(cam.transform.position.z);
        float h, w;
        if (cam.orthographic)
        {
            h = cam.orthographicSize * 2f;
            w = h * cam.aspect;
        }
        else
        {
            h = 2f * dist * Mathf.Tan(cam.fieldOfView * 0.5f * Mathf.Deg2Rad);
            w = h * cam.aspect;
        }
        _dimOverlay.transform.localScale = new Vector3(w, h, 1f);
        _dimOverlay.transform.position   = new Vector3(
            cam.transform.position.x,
            cam.transform.position.y,
            cam.transform.position.z + (cam.orthographic ? 1f : dist - 1f)
        );
    }

    void PlayChestAnim(GameObject chest, string animName)
    {
        // Monster 스크립트 비활성화 (Animator 간섭 방지)
        foreach (var mb in chest.GetComponents<MonoBehaviour>())
        {
            if (mb.GetType().Name == "Monster") { mb.enabled = false; break; }
        }

        var anim = chest.GetComponentInChildren<Animator>();
        if (anim == null) return;

        bool isOpen = animName == openAnimName;
        anim.speed = isOpen ? chestOpenSpeed : 1f;
        anim.Play(animName, 0, 0f);

        if (isOpen)
            StartCoroutine(FreezeAtEnd(anim, animName));
    }

    System.Collections.IEnumerator FreezeAtEnd(Animator anim, string stateName)
    {
        // 애니메이션 시작 대기 (1프레임)
        yield return null;
        yield return null;

        // 재생 완료까지 대기
        while (true)
        {
            var info = anim.GetCurrentAnimatorStateInfo(0);
            if (info.IsName(stateName) && info.normalizedTime >= 0.95f) break;
            // 혹시 다른 상태로 넘어갔으면 중단
            if (!info.IsName(stateName)) break;
            yield return null;
        }

        // 마지막 프레임에서 정지
        if (anim != null)
        {
            anim.Play(stateName, 0, 1f);
            anim.speed = 0f;
        }
    }

    void ShowRewardText(Vector3 worldPos, string text)
    {
        if (rewardTextPrefab == null) return;
        var obj = Instantiate(rewardTextPrefab, worldPos, Quaternion.identity);
        var tmp = obj.GetComponentInChildren<TextMeshProUGUI>();
        if (tmp != null) tmp.text = text;
        Destroy(obj, 4f);
    }

    // Inspector 버튼에 연결
    public void OnConfirm()
    {
        if (_selected < 0) return;

        var r = _rewards[_selected];
        if (GameManager.Instance != null)
        {
            GameManager.Instance.AddGold(r.gold);
            // 다이아는 GameManager에 diamond 필드 추가 후 처리 가능
        }

        // 상자 정리
        foreach (var obj in _spawnedChests)
            if (obj) Destroy(obj);
        _spawnedChests.Clear();

        if (_dimOverlay) Destroy(_dimOverlay);
        rewardPanel?.SetActive(false);
        GameManager.Instance?.GoToScene(GameManager.SceneLobby);
    }

    // ────────────────────────────────────────────────────────
    // 사망 화면
    // ────────────────────────────────────────────────────────

    public void ShowDeathPanel()
    {
        int kills = GameManager.Instance?.sessionKillCount  ?? 0;
        int gold  = GameManager.Instance?.sessionEarnedGold ?? 0;

        if (killCountText  != null) killCountText.text  = $"처치한 몬스터  {kills}마리";
        if (earnedGoldText != null) earnedGoldText.text = $"획득한 골드  {gold} G";

        deathPanel?.SetActive(true);
        Time.timeScale = 0f;
    }

    // Inspector 버튼에 연결
    public void OnReturnToLobby()
    {
        Time.timeScale = 1f;
        GameManager.Instance?.GoToScene(GameManager.SceneLobby);
    }

    // ────────────────────────────────────────────────────────
    // 보상 생성
    // ────────────────────────────────────────────────────────

    RewardData GenerateReward()
    {
        int roll = Random.Range(0, 100);
        if (roll < 50)  return new RewardData { gold = Random.Range(150, 301) };
        if (roll < 85)  return Random.Range(0, 2) == 0
                            ? new RewardData { diamond = Random.Range(5, 11) }
                            : new RewardData { exp = 200 };
        return new RewardData { gold = 500, diamond = 5 };
    }

    struct RewardData
    {
        public int gold, diamond, exp;
        public string DisplayText
        {
            get
            {
                var parts = new List<string>();
                if (gold    > 0) parts.Add($"골드 +{gold}");
                if (diamond > 0) parts.Add($"다이아 +{diamond}");
                if (exp     > 0) parts.Add($"EXP +{exp}");
                return string.Join("  ", parts);
            }
        }
    }
}
