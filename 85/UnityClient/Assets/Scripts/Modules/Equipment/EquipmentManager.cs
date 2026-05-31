using System;
using System.Collections.Generic;
using IndustrialSimulation.Database;
using IndustrialSimulation.Shared.Models;
using UnityEngine;

namespace IndustrialSimulation.Equipment
{
    public class EquipmentManager : MonoBehaviour
    {
        private static EquipmentManager _instance;
        public static EquipmentManager Instance => _instance;

        [SerializeField] private Transform _equipmentRoot;

        private readonly Dictionary<string, EquipmentBase> _equipmentMap = new Dictionary<string, EquipmentBase>();
        private readonly Dictionary<EquipmentType, GameObject> _equipmentPrefabs = new Dictionary<EquipmentType, GameObject>();

        public event Action<EquipmentBase> OnEquipmentAdded;
        public event Action<EquipmentBase> OnEquipmentRemoved;

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

        public void InitializeEquipmentPrefabs()
        {
            foreach (EquipmentType type in Enum.GetValues(typeof(EquipmentType)))
            {
                var prefab = Resources.Load<GameObject>($"Equipment/{type}");
                if (prefab != null)
                {
                    _equipmentPrefabs[type] = prefab;
                }
            }
        }

        public EquipmentBase CreateEquipment(EquipmentModel model)
        {
            if (_equipmentMap.ContainsKey(model.Id))
            {
                return _equipmentMap[model.Id];
            }

            if (!_equipmentPrefabs.TryGetValue(model.Type, out var prefab))
            {
                Debug.LogWarning($"未找到设备类型 {model.Type} 的预制体");
                prefab = CreateDefaultEquipment(model.Type);
            }

            var equipmentObj = Instantiate(prefab, _equipmentRoot);
            var equipment = equipmentObj.GetComponent<EquipmentBase>();
            if (equipment == null)
            {
                equipment = AddEquipmentComponent(equipmentObj, model.Type);
            }

            equipment.FromModel(model);
            _equipmentMap[model.Id] = equipment;

            equipment.OnStatusChanged += OnEquipmentStatusChanged;
            equipment.OnParameterChanged += OnEquipmentParameterChanged;
            equipment.OnFaultOccurred += OnEquipmentFaultOccurred;
            equipment.OnFaultResolved += OnEquipmentFaultResolved;

            OnEquipmentAdded?.Invoke(equipment);

            return equipment;
        }

        private GameObject CreateDefaultEquipment(EquipmentType type)
        {
            var container = new GameObject($"{type}_Equipment");
            EquipmentVisualBuilder.BuildEquipmentVisual(type, container.transform);
            return container;
        }

        private EquipmentBase AddEquipmentComponent(GameObject obj, EquipmentType type)
        {
            return type switch
            {
                EquipmentType.Pump => obj.AddComponent<PumpEquipment>(),
                EquipmentType.Motor => obj.AddComponent<MotorEquipment>(),
                EquipmentType.Compressor => obj.AddComponent<CompressorEquipment>(),
                EquipmentType.Conveyor => obj.AddComponent<ConveyorEquipment>(),
                EquipmentType.Boiler => obj.AddComponent<BoilerEquipment>(),
                EquipmentType.Valve => obj.AddComponent<ValveEquipment>(),
                EquipmentType.Sensor => obj.AddComponent<SensorEquipment>(),
                _ => null
            };
        }

        public void RemoveEquipment(string equipmentId)
        {
            if (_equipmentMap.TryGetValue(equipmentId, out var equipment))
            {
                equipment.OnStatusChanged -= OnEquipmentStatusChanged;
                equipment.OnParameterChanged -= OnEquipmentParameterChanged;
                equipment.OnFaultOccurred -= OnEquipmentFaultOccurred;
                equipment.OnFaultResolved -= OnEquipmentFaultResolved;

                _equipmentMap.Remove(equipmentId);
                Destroy(equipment.gameObject);

                OnEquipmentRemoved?.Invoke(equipment);
            }
        }

        public EquipmentBase GetEquipment(string equipmentId)
        {
            _equipmentMap.TryGetValue(equipmentId, out var equipment);
            return equipment;
        }

        public List<EquipmentBase> GetAllEquipment()
        {
            return new List<EquipmentBase>(_equipmentMap.Values);
        }

        public List<EquipmentBase> GetEquipmentByType(EquipmentType type)
        {
            var result = new List<EquipmentBase>();
            foreach (var equipment in _equipmentMap.Values)
            {
                if (equipment.EquipmentType == type)
                {
                    result.Add(equipment);
                }
            }
            return result;
        }

        public List<EquipmentBase> GetEquipmentByStatus(EquipmentStatus status)
        {
            var result = new List<EquipmentBase>();
            foreach (var equipment in _equipmentMap.Values)
            {
                if (equipment.CurrentStatus == status)
                {
                    result.Add(equipment);
                }
            }
            return result;
        }

        public void StartAllEquipment()
        {
            foreach (var equipment in _equipmentMap.Values)
            {
                equipment.StartEquipment();
            }
        }

        public void StopAllEquipment()
        {
            foreach (var equipment in _equipmentMap.Values)
            {
                equipment.StopEquipment();
            }
        }

        public void LoadEquipmentFromDatabase(string workshopId)
        {
            ClearAllEquipment();

            var equipmentList = SQLiteManager.Instance.GetEquipmentByWorkshop(workshopId);
            foreach (var model in equipmentList)
            {
                CreateEquipment(model);
            }
        }

        public void ClearAllEquipment()
        {
            var equipmentIds = new List<string>(_equipmentMap.Keys);
            foreach (var id in equipmentIds)
            {
                RemoveEquipment(id);
            }
        }

        public void SaveEquipmentToDatabase()
        {
            foreach (var equipment in _equipmentMap.Values)
            {
                var model = equipment.ToModel();
                SQLiteManager.Instance.UpdateEquipment(model);
            }
        }

        public void UpdateEquipmentFromModel(EquipmentModel model)
        {
            if (_equipmentMap.TryGetValue(model.Id, out var equipment))
            {
                equipment.FromModel(model);
            }
            else
            {
                CreateEquipment(model);
            }
        }

        private void OnEquipmentStatusChanged(EquipmentBase equipment)
        {
            Debug.Log($"设备 {equipment.EquipmentName} 状态变更为: {equipment.CurrentStatus}");

            if (GameManager.Instance != null && GameManager.Instance.IsNetworkMode)
            {
                var model = equipment.ToModel();
                NetworkClient.Instance.SendMessage(new NetworkMessage(
                    MessageType.EquipmentStatusUpdate,
                    JsonHelper.Serialize(model)));
            }

            OnEquipmentUpdated?.Invoke(equipment);
        }

        private void OnEquipmentParameterChanged(EquipmentBase equipment, string paramName, double value)
        {
        }

        private void OnEquipmentFaultOccurred(EquipmentBase equipment, FaultInstance fault)
        {
            Debug.Log($"设备 {equipment.EquipmentName} 发生故障: {fault.FaultCode}");
        }

        private void OnEquipmentFaultResolved(EquipmentBase equipment, FaultInstance fault)
        {
            Debug.Log($"设备 {equipment.EquipmentName} 故障已解决: {fault.FaultCode}");
        }
    }
}
