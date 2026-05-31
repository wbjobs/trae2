using System.Collections.Generic;
using IndustrialSimulation.Equipment;
using IndustrialSimulation.FaultSimulation;
using IndustrialSimulation.Shared.Models;
using UnityEngine;

namespace IndustrialSimulation.Scene
{
    public class EquipmentInteractionSystem : MonoBehaviour
    {
        private static EquipmentInteractionSystem _instance;
        public static EquipmentInteractionSystem Instance => _instance;

        [Header("交互设置")]
        public LayerMask EquipmentLayer = -1;
        public float RaycastDistance = 100f;
        public float HighlightIntensity = 1.5f;
        public Color SelectionColor = new Color(0f, 1f, 0.5f, 0.3f);
        public Color HoverColor = new Color(1f, 1f, 0f, 0.15f);

        [Header("选择信息显示")]
        public GameObject InfoPanelPrefab;
        public float InfoPanelOffset = 3f;

        private EquipmentBase _selectedEquipment;
        private EquipmentBase _hoveredEquipment;
        private GameObject _selectionHighlight;
        private GameObject _hoverHighlight;
        private Camera _mainCamera;
        private readonly Dictionary<Collider, EquipmentBase> _colliderMap = new Dictionary<Collider, EquipmentBase>();

        public EquipmentBase SelectedEquipment => _selectedEquipment;
        public event Action<EquipmentBase> OnEquipmentSelected;
        public event Action<EquipmentBase> OnEquipmentDeselected;
        public event Action<EquipmentBase> OnEquipmentClicked;

        private void Awake()
        {
            if (_instance == null)
            {
                _instance = this;
                DontDestroyOnLoad(gameObject);
            }
            else
            {
                Destroy(gameObject);
            }
        }

        private void Start()
        {
            _mainCamera = Camera.main;
            CreateHighlightObjects();
        }

        private void CreateHighlightObjects()
        {
            _selectionHighlight = CreateHighlightSphere("SelectionHighlight", SelectionColor);
            _hoverHighlight = CreateHighlightSphere("HoverHighlight", HoverColor);
            _hoverHighlight.SetActive(false);
            _selectionHighlight.SetActive(false);
        }

        private GameObject CreateHighlightSphere(string name, Color color)
        {
            var obj = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            obj.name = name;
            obj.transform.SetParent(transform);
            obj.transform.localScale = Vector3.one * 3f;

            var renderer = obj.GetComponent<Renderer>();
            var mat = new Material(Shader.Find("Transparent/Diffuse")) { color = color };
            renderer.material = mat;

            var collider = obj.GetComponent<Collider>();
            if (collider != null) Destroy(collider);

            return obj;
        }

        public void RegisterEquipment(EquipmentBase equipment)
        {
            var colliders = equipment.GetComponentsInChildren<Collider>();
            foreach (var col in colliders)
            {
                _colliderMap[col] = equipment;
            }

            if (colliders.Length == 0)
            {
                var go = equipment.gameObject;
                if (!go.TryGetComponent<Collider>(out _))
                {
                    var boxCol = go.AddComponent<BoxCollider>();
                    boxCol.size = new Vector3(2f, 2f, 2f);
                    _colliderMap[boxCol] = equipment;
                }
            }
        }

        public void UnregisterEquipment(EquipmentBase equipment)
        {
            var colliders = equipment.GetComponentsInChildren<Collider>();
            foreach (var col in colliders)
            {
                _colliderMap.Remove(col);
            }
        }

        private void Update()
        {
            HandleHover();
            HandleClick();
            HandleKeyboardShortcuts();
        }

        private void HandleHover()
        {
            if (_mainCamera == null) return;

            var ray = _mainCamera.ScreenPointToRay(Input.mousePosition);
            EquipmentBase hovered = null;

            if (Physics.Raycast(ray, out var hit, RaycastDistance, EquipmentLayer))
            {
                if (_colliderMap.TryGetValue(hit.collider, out var eq))
                {
                    hovered = eq;
                }
                else
                {
                    var parent = hit.collider.GetComponentInParent<EquipmentBase>();
                    if (parent != null) hovered = parent;
                }
            }

            if (hovered != _hoveredEquipment)
            {
                _hoveredEquipment = hovered;
                UpdateHoverHighlight();
            }
        }

        private void HandleClick()
        {
            if (!Input.GetMouseButtonDown(0)) return;

            if (_hoveredEquipment != null)
            {
                SelectEquipment(_hoveredEquipment);
                OnEquipmentClicked?.Invoke(_hoveredEquipment);
            }
            else
            {
                DeselectEquipment();
            }
        }

        private void HandleKeyboardShortcuts()
        {
            if (_selectedEquipment == null) return;

            if (Input.GetKeyDown(KeyCode.Escape))
            {
                DeselectEquipment();
            }

            if (Input.GetKeyDown(KeyCode.F))
            {
                var cameraController = FindObjectOfType<WorkshopCameraController>();
                if (cameraController != null)
                {
                    cameraController.FocusOnTarget(_selectedEquipment.transform);
                }
            }

            if (Input.GetKeyDown(KeyCode.I))
            {
                InjectFaultToSelected();
            }

            if (Input.GetKeyDown(KeyCode.R))
            {
                ResolveFaultOnSelected();
            }
        }

        public void SelectEquipment(EquipmentBase equipment)
        {
            if (_selectedEquipment == equipment) return;

            DeselectEquipment();
            _selectedEquipment = equipment;

            UpdateSelectionHighlight();
            OnEquipmentSelected?.Invoke(equipment);

            Debug.Log($"选中设备: {equipment.EquipmentName}");
        }

        public void DeselectEquipment()
        {
            if (_selectedEquipment == null) return;

            var prev = _selectedEquipment;
            _selectedEquipment = null;
            _selectionHighlight.SetActive(false);

            OnEquipmentDeselected?.Invoke(prev);
        }

        private void UpdateHoverHighlight()
        {
            if (_hoveredEquipment != null && _hoveredEquipment != _selectedEquipment)
            {
                _hoverHighlight.transform.position = _hoveredEquipment.transform.position;
                _hoverHighlight.SetActive(true);
            }
            else
            {
                _hoverHighlight.SetActive(false);
            }
        }

        private void UpdateSelectionHighlight()
        {
            if (_selectedEquipment != null)
            {
                _selectionHighlight.transform.position = _selectedEquipment.transform.position;
                _selectionHighlight.SetActive(true);
            }
            else
            {
                _selectionHighlight.SetActive(false);
            }
        }

        private void InjectFaultToSelected()
        {
            if (_selectedEquipment == null) return;
            if (!FaultSimulationManager.Instance.IsSimulationActive) return;

            var faults = FaultSimulationManager.Instance.GetFaultDefinitionsForEquipment(_selectedEquipment.EquipmentType);
            if (faults.Count > 0)
            {
                var fault = faults[0];
                GameManager.Instance.InjectFault(_selectedEquipment.EquipmentId, fault.FaultCode);
            }
        }

        private void ResolveFaultOnSelected()
        {
            if (_selectedEquipment == null) return;
            var activeFaults = _selectedEquipment.GetActiveFaults();
            if (activeFaults.Count > 0)
            {
                GameManager.Instance.ResolveFault(activeFaults[0].Id);
            }
        }

        public string GetEquipmentInfoText(EquipmentBase equipment)
        {
            if (equipment == null) return "";

            var sb = new System.Text.StringBuilder();
            sb.AppendLine($"<b>{equipment.EquipmentName}</b>");
            sb.AppendLine($"类型: {equipment.EquipmentType}");
            sb.AppendLine($"状态: {equipment.CurrentStatus}");
            sb.AppendLine("<b>参数:</b>");

            var parameters = equipment.GetAllParameters();
            foreach (var param in parameters)
            {
                sb.AppendLine($"  {param.Key}: {param.Value:F2}");
            }

            var faults = equipment.GetActiveFaults();
            if (faults.Count > 0)
            {
                sb.AppendLine("<b>活动故障:</b>");
                foreach (var fault in faults)
                {
                    sb.AppendLine($"  [{fault.Severity}] {fault.FaultCode}");
                }
            }

            return sb.ToString();
        }

        public Dictionary<string, double> GetEquipmentParameters(EquipmentBase equipment)
        {
            return equipment?.GetAllParameters() ?? new Dictionary<string, double>();
        }

        public List<FaultDefinition> GetAvailableFaultsForSelected()
        {
            if (_selectedEquipment == null) return new List<FaultDefinition>();
            return FaultSimulationManager.Instance.GetFaultDefinitionsForEquipment(_selectedEquipment.EquipmentType);
        }
    }
}
