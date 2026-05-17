using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
using TMPro;

/// <summary>
/// 스테이지 클리어(Clear) 씬 UI를 관리한다.
/// 씬 진입 시 자동으로 보상 골드를 지급하고 결과를 표시한다.
///
/// [씬 구성 가이드]
/// ┌─ Canvas
/// │  ├─ TitleText         (TMP) — "STAGE CLEAR!" 등
/// │  ├─ GoldEarnedText    (TMP) — 이번 스테이지 획득 골드
/// │  ├─ TotalGoldText     (TMP) — 누적 보유 골드
/// │  ├─ StatSummaryText   (TMP) — 현재 스탯 요약
/// │  └─ ReturnLobbyButton — 로비로 복귀
/// </summary>
public class StageResultManager : MonoBehaviour
{
    [Header("결과 UI")]
    [SerializeField] private TextMeshProUGUI titleText;
    [SerializeField] private TextMeshProUGUI goldEarnedText;
    [SerializeField] private TextMeshProUGUI totalGoldText;
    [SerializeField] private TextMeshProUGUI statSummaryText;
    [SerializeField] private Button returnLobbyButton;

    [Header("스테이지 보상 골드")]
    [SerializeField] private int rewardGold = 500;

    [Header("클리어 메시지")]
    [SerializeField] private string clearMessage = "STAGE CLEAR!";

    // ─────────────────────────────────────────────────────────────

    void Start()
    {
        // 보상 지급 (씬 진입 시 1회)
        GameManager.Instance?.AddGold(rewardGold);

        RefreshUI();

        returnLobbyButton?.onClick.AddListener(OnClickReturnLobby);
    }

    void RefreshUI()
    {
        if (titleText     != null) titleText.text     = clearMessage;
        if (goldEarnedText != null) goldEarnedText.text = $"보상 골드  +{rewardGold:N0} G";

        if (GameManager.Instance != null)
        {
            var gm = GameManager.Instance;
            if (totalGoldText  != null) totalGoldText.text  = $"보유 Gold  {gm.gold:N0}";
            if (statSummaryText != null)
                statSummaryText.text = $"ATK {gm.attackPower}  |  DEF {gm.defense}  |  CRIT {gm.critChance}%";
        }
    }

    void OnClickReturnLobby()
    {
        SceneManager.LoadScene(GameManager.SceneLobby);
    }
}
