using System.Collections.Generic;
using IndustrialSimulation.Core;
using IndustrialSimulation.Equipment;
using IndustrialSimulation.Shared.Models;
using UnityEngine;
using UnityEngine.UI;

namespace IndustrialSimulation.UI
{
    public class MainUIController : MonoBehaviour
    {
        [Header("面板引用")]
        public GameObject MainPanel;
        public GameObject WorkshopPanel;
        public GameObject SimulationPanel;
        public GameObject EquipmentPanel;
        public GameObject FaultPanel;

        [Header("按钮引用")]
        public Button ConnectServerBtn;
        public Button WorkshopSelectBtn;
        public Button StartSimulationBtn;
        public Button StopSimulationBtn;
        public Button ToggleFaultPanelBtn;

        [Header("文本引用")]
        public Text StatusText;
        public Text SimulationStatusText;
        public Text ActiveFaultCountText;

        [Header("列表内容")]
        public Transform WorkshopListContent;
        public Transform EquipmentListContent;
        public Transform FaultListContent;
        public GameObject WorkshopItemPrefab;
        public GameObject EquipmentItemPrefab;
        public GameObject FaultItemPrefab;

        [Header("输入字段")]
        public InputField ServerAddressInput;
        public InputField ServerPortInput;
        public InputField PlayerNameInput;
        public InputField SimulationNameInput;
        public Dropdown SimulationSpeedDropdown;

        private List<WorkshopModel> _workshopList;
        private WorkshopModel _selectedWorkshop;

        private void Start()
        {
            InitializeUI();
            RegisterButtonEvents();
        }

        private void InitializeUI()
        {
            MainPanel.SetActive(true);
            WorkshopPanel.SetActive(false);
            SimulationPanel.SetActive(false);
            EquipmentPanel.SetActive(false);
            FaultPanel.SetActive(false);

            UpdateStatus("就绪 - 本地模式");
            SimulationStatusText.text = "未开始推演";
            ActiveFaultCountText.text = "0";

            if (ServerAddressInput != null)
                ServerAddressInput.text = GameManager.Instance.ServerAddress;
            if (ServerPortInput != null)
                ServerPortInput.text = GameManager.Instance.ServerPort.ToString();
            if (PlayerNameInput != null)
                PlayerNameInput.text = GameManager.Instance.PlayerName;

            RefreshWorkshopList();
        }

        private void RegisterButtonEvents()
        {
            if (ConnectServerBtn != null)
                ConnectServerBtn.onClick.AddListener(OnConnectServer);
            if (WorkshopSelectBtn != null)
                WorkshopSelectBtn.onClick.AddListener(ShowWorkshopPanel);
            if (StartSimulationBtn != null)
                StartSimulationBtn.onClick.AddListener(OnStartSimulation);
            if (StopSimulationBtn != null)
                StopSimulationBtn.onClick.AddListener(OnStopSimulation);
            if (ToggleFaultPanelBtn != null)
                ToggleFaultPanelBtn.onClick.AddListener(ToggleFaultPanel);
        }

        private void OnConnectServer()
        {
            if (GameManager.Instance.IsNetworkMode)
            {
                GameManager.Instance.DisconnectFromServer();
                ConnectServerBtn.GetComponentInChildren<Text>().text = "连接服务器";
                UpdateStatus("已断开 - 本地模式");
            }
            else
            {
                var address = ServerAddressInput.text;
                var port = int.Parse(ServerPortInput.text);
                var playerName = PlayerNameInput.text;

                GameManager.Instance.ServerAddress = address;
                GameManager.Instance.ServerPort = port;
                GameManager.Instance.PlayerName = playerName;
                GameManager.Instance.UseLocalMode = false;

                if (GameManager.Instance.ConnectToServer())
                {
                    ConnectServerBtn.GetComponentInChildren<Text>().text = "断开连接";
                    UpdateStatus($"已连接 - {address}:{port}");
                }
                else
                {
                    UpdateStatus("连接失败");
                }
            }
        }

        private void ShowWorkshopPanel()
        {
            WorkshopPanel.SetActive(true);
            RefreshWorkshopList();
        }

        private void RefreshWorkshopList()
        {
            foreach (Transform child in WorkshopListContent)
            {
                Destroy(child.gameObject);
            }

            _workshopList = GameManager.Instance.GetAvailableWorkshops();

            foreach (var workshop in _workshopList)
            {
                var item = Instantiate(WorkshopItemPrefab, WorkshopListContent);
                var itemText = item.GetComponentInChildren<Text>();
                var itemBtn = item.GetComponent<Button>();

                itemText.text = workshop.Name;
                itemBtn.onClick.AddListener(() => OnSelectWorkshop(workshop));
            }
        }

        private void OnSelectWorkshop(WorkshopModel workshop)
        {
            _selectedWorkshop = workshop;
            WorkshopPanel.SetActive(false);
            GameManager.Instance.LoadWorkshop(workshop.Id);

            UpdateStatus($"已加载车间: {workshop.Name}");
            RefreshEquipmentList();
        }

        private void OnStartSimulation()
        {
            var simName = string.IsNullOrEmpty(SimulationNameInput.text)
                ? $"推演_{System.DateTime.Now:yyyyMMdd_HHmmss}"
                : SimulationNameInput.text;

            var speeds = new[] { 0.5, 1.0, 2.0, 5.0 };
            var speed = speeds[SimulationSpeedDropdown.value];

            GameManager.Instance.StartSimulation(simName, speed);

            SimulationStatusText.text = $"推演中 - {simName} ({speed}x)";
            StartSimulationBtn.gameObject.SetActive(false);
            StopSimulationBtn.gameObject.SetActive(true);

            InvokeRepeating(nameof(RefreshFaultList), 1f, 1f);
        }

        private void OnStopSimulation()
        {
            GameManager.Instance.StopSimulation();

            SimulationStatusText.text = "推演已结束";
            StartSimulationBtn.gameObject.SetActive(true);
            StopSimulationBtn.gameObject.SetActive(false);

            CancelInvoke(nameof(RefreshFaultList));
        }

        private void RefreshEquipmentList()
        {
            foreach (Transform child in EquipmentListContent)
            {
                Destroy(child.gameObject);
            }

            var equipmentList = GameManager.Instance.GetCurrentEquipment();

            foreach (var equipment in equipmentList)
            {
                var item = Instantiate(EquipmentItemPrefab, EquipmentListContent);
                var texts = item.GetComponentsInChildren<Text>();

                if (texts.Length >= 2)
                {
                    texts[0].text = equipment.EquipmentName;
                    texts[1].text = $"[{equipment.CurrentStatus}]";

                    var statusColor = equipment.CurrentStatus switch
                    {
                        EquipmentStatus.Running => Color.green,
                        EquipmentStatus.Warning => Color.yellow,
                        EquipmentStatus.Fault => Color.red,
                        _ => Color.gray
                    };
                    texts[1].color = statusColor;
                }
            }
        }

        private void RefreshFaultList()
        {
            foreach (Transform child in FaultListContent)
            {
                Destroy(child.gameObject);
            }

            var faultList = GameManager.Instance.GetActiveFaults();
            ActiveFaultCountText.text = faultList.Count.ToString();

            foreach (var fault in faultList)
            {
                var item = Instantiate(FaultItemPrefab, FaultListContent);
                var texts = item.GetComponentsInChildren<Text>();
                var resolveBtn = item.GetComponentInChildren<Button>();

                if (texts.Length >= 2)
                {
                    texts[0].text = fault.FaultCode;
                    texts[1].text = $"设备: {fault.EquipmentId}\n时间: {fault.OccurredTime:HH:mm:ss}";
                }

                resolveBtn?.onClick.AddListener(() =>
                {
                    GameManager.Instance.ResolveFault(fault.Id);
                    RefreshFaultList();
                });
            }
        }

        private void ToggleFaultPanel()
        {
            FaultPanel.SetActive(!FaultPanel.activeSelf);
            if (FaultPanel.activeSelf)
            {
                RefreshFaultList();
            }
        }

        private void UpdateStatus(string message)
        {
            if (StatusText != null)
            {
                StatusText.text = $"状态: {message}";
            }
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.Space))
            {
                var equipmentList = GameManager.Instance.GetCurrentEquipment();
                if (equipmentList.Count > 0)
                {
                    var eq = equipmentList[0];
                    var faults = GameManager.Instance.GetFaultDefinitions();
                    if (faults.Count > 0)
                    {
                        var applicableFault = faults.Find(f => f.ApplicableEquipmentType == eq.EquipmentType);
                        if (applicableFault != null)
                        {
                            GameManager.Instance.InjectFault(eq.EquipmentId, applicableFault.FaultCode);
                        }
                    }
                }
            }
        }
    }
}
