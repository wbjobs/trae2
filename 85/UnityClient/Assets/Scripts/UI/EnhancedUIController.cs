using System;
using System.Collections.Generic;
using IndustrialSimulation.Core;
using IndustrialSimulation.Equipment;
using IndustrialSimulation.FaultSimulation;
using IndustrialSimulation.Network;
using IndustrialSimulation.Scene;
using IndustrialSimulation.Shared.Models;
using UnityEngine;
using UnityEngine.UI;

namespace IndustrialSimulation.UI
{
    public class EnhancedUIController : MonoBehaviour
    {
        [Header("主面板")]
        public GameObject MainPanel;
        public Text StatusText;
        public Text TimeText;
        public Text ModeText;

        [Header("设备详情面板")]
        public GameObject EquipmentDetailPanel;
        public Text EquipmentNameText;
        public Text EquipmentTypeText;
        public Text EquipmentStatusText;
        public Transform ParameterListContent;
        public GameObject ParameterItemPrefab;
        public Button InjectFaultBtn;
        public Button ResolveFaultBtn;
        public Button FocusCameraBtn;
        public Dropdown FaultTypeDropdown;

        [Header("推演控制面板")]
        public GameObject SimulationControlPanel;
        public Text SimulationNameText;
        public Text SimulationDurationText;
        public Text SimulationSpeedText;
        public Slider SimulationSpeedSlider;
        public Button StartBtn;
        public Button StopBtn;
        public Button PauseBtn;
        public Toggle AutoFaultToggle;
        public Toggle CascadeToggle;

        [Header("故障列表面板")]
        public GameObject FaultListPanel;
        public Transform FaultListContent;
        public GameObject FaultItemPrefab;
        public Text ActiveFaultCountText;
        public Text ResolvedFaultCountText;
        public Button ShowAllFaultsBtn;

        [Header("评分面板")]
        public GameObject ScorePanel;
        public Text TotalScoreText;
        public Text GradeText;
        public Text ResolutionRateText;
        public Text AvgResponseTimeText;
        public Text FaultPointsText;
        public Text CascadeCountText;
        public Button GenerateReportBtn;

        [Header("多人联机面板")]
        public GameObject MultiplayerPanel;
        public Transform PlayerListContent;
        public GameObject PlayerItemPrefab;
        public Text OnlineCountText;

        [Header("车间选择面板")]
        public GameObject WorkshopSelectPanel;
        public Transform WorkshopListContent;
        public GameObject WorkshopItemPrefab;

        [Header("快捷栏")]
        public GameObject QuickActionBar;
        public Button QuickWorkshopBtn;
        public Button QuickSimBtn;
        public Button QuickFaultBtn;
        public Button QuickScoreBtn;
        public Button QuickMultiBtn;
        public Button QuickSettingsBtn;

        [Header("连接设置")]
        public InputField ServerAddressInput;
        public InputField ServerPortInput;
        public InputField PlayerNameInput;
        public Button ConnectBtn;

        private EquipmentBase _selectedEquipment;
        private bool _isSimulating;

        private void Start()
        {
            InitializePanels();
            RegisterEvents();
            RegisterButtonEvents();
        }

        private void InitializePanels()
        {
            EquipmentDetailPanel?.SetActive(false);
            FaultListPanel?.SetActive(false);
            ScorePanel?.SetActive(false);
            MultiplayerPanel?.SetActive(false);
            WorkshopSelectPanel?.SetActive(false);

            if (SimulationControlPanel != null)
                SimulationControlPanel.SetActive(false);

            if (StatusText != null) StatusText.text = "就绪 - 本地模式";
            if (ModeText != null) ModeText.text = "本地模式";
            if (ActiveFaultCountText != null) ActiveFaultCountText.text = "0";
            if (ResolvedFaultCountText != null) ResolvedFaultCountText.text = "0";

            if (ServerAddressInput != null) ServerAddressInput.text = "127.0.0.1";
            if (ServerPortInput != null) ServerPortInput.text = "8888";
            if (PlayerNameInput != null) PlayerNameInput.text = "Player";

            if (SimulationSpeedSlider != null)
            {
                SimulationSpeedSlider.minValue = 0.5f;
                SimulationSpeedSlider.maxValue = 5f;
                SimulationSpeedSlider.value = 1f;
            }

            RefreshWorkshopList();
        }

        private void RegisterEvents()
        {
            var interaction = EquipmentInteractionSystem.Instance;
            if (interaction != null)
            {
                interaction.OnEquipmentSelected += OnEquipmentSelected;
                interaction.OnEquipmentDeselected += OnEquipmentDeselected;
            }

            var faultSim = FaultSimulationManager.Instance;
            if (faultSim != null)
            {
                faultSim.OnFaultOccurred += OnFaultOccurred;
                faultSim.OnFaultResolved += OnFaultResolved;
                faultSim.OnSimulationStarted += OnSimulationStarted;
                faultSim.OnSimulationStopped += OnSimulationStopped;
            }

            var scoring = SimulationScoringSystem.Instance;
            if (scoring != null)
            {
                scoring.OnScoreUpdated += OnScoreUpdated;
            }
        }

        private void RegisterButtonEvents()
        {
            if (InjectFaultBtn != null) InjectFaultBtn.onClick.AddListener(OnInjectFault);
            if (ResolveFaultBtn != null) ResolveFaultBtn.onClick.AddListener(OnResolveFault);
            if (FocusCameraBtn != null) FocusCameraBtn.onClick.AddListener(OnFocusCamera);
            if (StartBtn != null) StartBtn.onClick.AddListener(OnStartSimulation);
            if (StopBtn != null) StopBtn.onClick.AddListener(OnStopSimulation);
            if (GenerateReportBtn != null) GenerateReportBtn.onClick.AddListener(OnGenerateReport);
            if (ConnectBtn != null) ConnectBtn.onClick.AddListener(OnConnect);
            if (SimulationSpeedSlider != null) SimulationSpeedSlider.onValueChanged.AddListener(OnSpeedChanged);

            if (QuickWorkshopBtn != null) QuickWorkshopBtn.onClick.AddListener(() => TogglePanel(WorkshopSelectPanel));
            if (QuickSimBtn != null) QuickSimBtn.onClick.AddListener(() => TogglePanel(SimulationControlPanel));
            if (QuickFaultBtn != null) QuickFaultBtn.onClick.AddListener(() => TogglePanel(FaultListPanel));
            if (QuickScoreBtn != null) QuickScoreBtn.onClick.AddListener(() => TogglePanel(ScorePanel));
            if (QuickMultiBtn != null) QuickMultiBtn.onClick.AddListener(() => TogglePanel(MultiplayerPanel));
            if (QuickSettingsBtn != null) QuickSettingsBtn.onClick.AddListener(() => { });
        }

        private void Update()
        {
            UpdateTimeDisplay();
            UpdateSimulationDuration();
            UpdateParameterDisplay();

            if (Input.GetKeyDown(KeyCode.Tab))
            {
                TogglePanel(EquipmentDetailPanel);
            }
        }

        private void OnEquipmentSelected(EquipmentBase equipment)
        {
            _selectedEquipment = equipment;
            ShowEquipmentDetail(equipment);
        }

        private void OnEquipmentDeselected(EquipmentBase equipment)
        {
            _selectedEquipment = null;
            if (EquipmentDetailPanel != null)
                EquipmentDetailPanel.SetActive(false);
        }

        private void ShowEquipmentDetail(EquipmentBase equipment)
        {
            if (EquipmentDetailPanel == null) return;

            EquipmentDetailPanel.SetActive(true);

            if (EquipmentNameText != null) EquipmentNameText.text = equipment.EquipmentName;
            if (EquipmentTypeText != null) EquipmentTypeText.text = equipment.EquipmentType.ToString();
            if (EquipmentStatusText != null)
            {
                EquipmentStatusText.text = equipment.CurrentStatus.ToString();
                EquipmentStatusText.color = equipment.CurrentStatus switch
                {
                    EquipmentStatus.Running => Color.green,
                    EquipmentStatus.Warning => Color.yellow,
                    EquipmentStatus.Fault => Color.red,
                    EquipmentStatus.Maintenance => Color.cyan,
                    _ => Color.gray
                };
            }

            UpdateFaultTypeDropdown(equipment);
            UpdateParameterList(equipment);
        }

        private void UpdateParameterList(EquipmentBase equipment)
        {
            if (ParameterListContent == null || ParameterItemPrefab == null) return;

            foreach (Transform child in ParameterListContent)
            {
                Destroy(child.gameObject);
            }

            var parameters = equipment.GetAllParameters();
            foreach (var param in parameters)
            {
                var item = Instantiate(ParameterItemPrefab, ParameterListContent);
                var texts = item.GetComponentsInChildren<Text>();
                if (texts.Length >= 2)
                {
                    texts[0].text = param.Key;
                    texts[1].text = param.Value.ToString("F2");
                }
            }
        }

        private void UpdateParameterDisplay()
        {
            if (_selectedEquipment == null || ParameterListContent == null) return;

            var texts = ParameterListContent.GetComponentsInChildren<Text>();
            var parameters = _selectedEquipment.GetAllParameters();
            var paramList = new List<KeyValuePair<string, double>>(parameters);

            for (var i = 0; i < texts.Length - 1 && i / 2 < paramList.Count; i += 2)
            {
                var idx = i / 2;
                if (idx < paramList.Count)
                {
                    texts[i + 1].text = paramList[idx].Value.ToString("F2");
                }
            }
        }

        private void UpdateFaultTypeDropdown(EquipmentBase equipment)
        {
            if (FaultTypeDropdown == null) return;

            FaultTypeDropdown.ClearOptions();
            var faults = FaultSimulationManager.Instance.GetFaultDefinitionsForEquipment(equipment.EquipmentType);
            var options = new List<string>();
            foreach (var fault in faults)
            {
                options.Add($"{fault.FaultCode} - {fault.Name}");
            }
            FaultTypeDropdown.AddOptions(options);
        }

        private void OnInjectFault()
        {
            if (_selectedEquipment == null) return;

            var faults = FaultSimulationManager.Instance.GetFaultDefinitionsForEquipment(_selectedEquipment.EquipmentType);
            if (faults.Count == 0 || FaultTypeDropdown == null) return;

            var idx = FaultTypeDropdown.value;
            if (idx < faults.Count)
            {
                GameManager.Instance.InjectFault(_selectedEquipment.EquipmentId, faults[idx].FaultCode);
            }
        }

        private void OnResolveFault()
        {
            if (_selectedEquipment == null) return;
            var activeFaults = _selectedEquipment.GetActiveFaults();
            if (activeFaults.Count > 0)
            {
                GameManager.Instance.ResolveFault(activeFaults[0].Id);
            }
        }

        private void OnFocusCamera()
        {
            if (_selectedEquipment == null) return;
            var cameraController = FindObjectOfType<WorkshopCameraController>();
            if (cameraController != null)
            {
                cameraController.FocusOnTarget(_selectedEquipment.transform);
            }
        }

        private void OnFaultOccurred(FaultInstance fault)
        {
            RefreshFaultList();
            UpdateFaultCounts();

            if (_selectedEquipment != null && fault.EquipmentId == _selectedEquipment.EquipmentId)
            {
                ShowEquipmentDetail(_selectedEquipment);
            }
        }

        private void OnFaultResolved(FaultInstance fault)
        {
            RefreshFaultList();
            UpdateFaultCounts();

            if (_selectedEquipment != null && fault.EquipmentId == _selectedEquipment.EquipmentId)
            {
                ShowEquipmentDetail(_selectedEquipment);
            }
        }

        private void RefreshFaultList()
        {
            if (FaultListContent == null || FaultItemPrefab == null) return;

            foreach (Transform child in FaultListContent)
            {
                Destroy(child.gameObject);
            }

            var faults = GameManager.Instance.GetActiveFaults();
            foreach (var fault in faults)
            {
                var item = Instantiate(FaultItemPrefab, FaultListContent);
                var texts = item.GetComponentsInChildren<Text>();
                var buttons = item.GetComponentsInChildren<Button>();

                if (texts.Length >= 3)
                {
                    texts[0].text = fault.FaultCode;
                    texts[1].text = fault.Severity.ToString();
                    texts[2].text = fault.OccurredTime.ToString("HH:mm:ss");

                    texts[1].color = fault.Severity switch
                    {
                        FaultSeverity.Low => Color.yellow,
                        FaultSeverity.Medium => new Color(1f, 0.5f, 0f),
                        FaultSeverity.High => Color.red,
                        FaultSeverity.Critical => new Color(1f, 0f, 0.5f),
                        _ => Color.gray
                    };
                }

                foreach (var btn in buttons)
                {
                    if (btn.name.Contains("Resolve"))
                    {
                        var faultId = fault.Id;
                        btn.onClick.AddListener(() =>
                        {
                            GameManager.Instance.ResolveFault(faultId);
                        });
                    }
                }
            }
        }

        private void UpdateFaultCounts()
        {
            var activeFaults = GameManager.Instance.GetActiveFaults();
            if (ActiveFaultCountText != null)
                ActiveFaultCountText.text = activeFaults.Count.ToString();
        }

        private void OnSimulationStarted(SimulationRecord record)
        {
            _isSimulating = true;
            if (SimulationControlPanel != null)
                SimulationControlPanel.SetActive(true);
            if (SimulationNameText != null)
                SimulationNameText.text = record.Name;
            if (StartBtn != null) StartBtn.gameObject.SetActive(false);
            if (StopBtn != null) StopBtn.gameObject.SetActive(true);
            if (StatusText != null) StatusText.text = "推演进行中";

            InvokeRepeating(nameof(RefreshFaultList), 1f, 2f);
        }

        private void OnSimulationStopped(SimulationRecord record)
        {
            _isSimulating = false;
            if (StartBtn != null) StartBtn.gameObject.SetActive(true);
            if (StopBtn != null) StopBtn.gameObject.SetActive(false);
            if (StatusText != null) StatusText.text = "推演已结束";

            CancelInvoke(nameof(RefreshFaultList));
        }

        private void OnStartSimulation()
        {
            var simName = $"推演_{DateTime.Now:yyyyMMdd_HHmmss}";
            var speed = SimulationSpeedSlider != null ? SimulationSpeedSlider.value : 1.0;
            GameManager.Instance.StartSimulation(simName, speed);
        }

        private void OnStopSimulation()
        {
            GameManager.Instance.StopSimulation();
        }

        private void OnSpeedChanged(float value)
        {
            if (SimulationSpeedText != null)
                SimulationSpeedText.text = $"{value:F1}x";
            FaultSimulationManager.Instance.SetSimulationSpeed(value);
        }

        private void OnScoreUpdated(SimulationScore score)
        {
            if (TotalScoreText != null) TotalScoreText.text = $"{score.TotalScore:F1}";
            if (GradeText != null)
            {
                GradeText.text = score.Grade;
                GradeText.color = score.Grade switch
                {
                    "S" => Color.gold,
                    "A" => Color.green,
                    "B" => Color.cyan,
                    "C" => Color.yellow,
                    _ => Color.red
                };
            }
            if (ResolutionRateText != null) ResolutionRateText.text = $"{score.ResolutionRate:P0}";
            if (AvgResponseTimeText != null) AvgResponseTimeText.text = $"{score.AverageResponseTime:F1}s";
            if (FaultPointsText != null) FaultPointsText.text = $"{score.FaultPoints:F0}";
            if (CascadeCountText != null) CascadeCountText.text = $"{score.CascadeEventsPrevented}/{score.CascadeEventsOccurred + score.CascadeEventsPrevented}";
        }

        private void OnGenerateReport()
        {
            var report = SimulationScoringSystem.Instance.GenerateAnalysisReport();
            Debug.Log($"评分报告已生成 - 总分: {report.Score.TotalScore:F1} 评级: {report.Score.Grade}");

            foreach (var rec in report.Recommendations)
            {
                Debug.Log($"建议: {rec}");
            }
        }

        private void OnConnect()
        {
            if (GameManager.Instance.IsNetworkMode)
            {
                GameManager.Instance.DisconnectFromServer();
                if (ConnectBtn != null) ConnectBtn.GetComponentInChildren<Text>().text = "连接服务器";
                if (ModeText != null) ModeText.text = "本地模式";
            }
            else
            {
                var address = ServerAddressInput?.text ?? "127.0.0.1";
                var port = int.Parse(ServerPortInput?.text ?? "8888");
                var playerName = PlayerNameInput?.text ?? "Player";

                GameManager.Instance.ServerAddress = address;
                GameManager.Instance.ServerPort = port;
                GameManager.Instance.PlayerName = playerName;
                GameManager.Instance.UseLocalMode = false;

                if (GameManager.Instance.ConnectToServer())
                {
                    if (ConnectBtn != null) ConnectBtn.GetComponentInChildren<Text>().text = "断开连接";
                    if (ModeText != null) ModeText.text = "联机模式";
                }
            }
        }

        private void RefreshWorkshopList()
        {
            if (WorkshopListContent == null || WorkshopItemPrefab == null) return;

            foreach (Transform child in WorkshopListContent)
            {
                Destroy(child.gameObject);
            }

            var workshops = GameManager.Instance.GetAvailableWorkshops();
            foreach (var workshop in workshops)
            {
                var item = Instantiate(WorkshopItemPrefab, WorkshopListContent);
                var texts = item.GetComponentsInChildren<Text>();
                var btn = item.GetComponent<Button>();

                if (texts.Length >= 2)
                {
                    texts[0].text = workshop.Name;
                    texts[1].text = workshop.Description;
                }

                var wid = workshop.Id;
                btn?.onClick.AddListener(() =>
                {
                    GameManager.Instance.LoadWorkshop(wid);
                    if (WorkshopSelectPanel != null) WorkshopSelectPanel.SetActive(false);
                    if (StatusText != null) StatusText.text = $"已加载: {workshop.Name}";
                });
            }
        }

        private void UpdateTimeDisplay()
        {
            if (TimeText != null)
            {
                TimeText.text = DateTime.Now.ToString("HH:mm:ss");
            }
        }

        private void UpdateSimulationDuration()
        {
            if (!_isSimulating || SimulationDurationText == null) return;

            var sim = FaultSimulationManager.Instance.GetCurrentSimulation();
            if (sim != null)
            {
                var duration = DateTime.Now - sim.StartTime;
                SimulationDurationText.text = $"{duration.Hours:D2}:{duration.Minutes:D2}:{duration.Seconds:D2}";
            }
        }

        private void TogglePanel(GameObject panel)
        {
            if (panel == null) return;
            panel.SetActive(!panel.activeSelf);
        }

        private void UpdatePlayerList()
        {
            if (PlayerListContent == null || PlayerItemPrefab == null) return;

            foreach (Transform child in PlayerListContent)
            {
                Destroy(child.gameObject);
            }

            var client = EnhancedNetworkClient.Instance;
            if (client == null || !client.IsConnected) return;

            var players = client.KnownPlayers;
            if (OnlineCountText != null) OnlineCountText.text = players.Count.ToString();

            foreach (var player in players)
            {
                var item = Instantiate(PlayerItemPrefab, PlayerListContent);
                var texts = item.GetComponentsInChildren<Text>();

                if (texts.Length >= 2)
                {
                    texts[0].text = player.PlayerName;
                    texts[1].text = player.Role ?? "操作员";
                }
            }
        }
    }
}
