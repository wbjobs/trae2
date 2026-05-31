using System;
using System.Collections.Generic;
using IndustrialSimulation.Database;
using IndustrialSimulation.Equipment;
using IndustrialSimulation.Shared.Models;
using IndustrialSimulation.Shared.Utils;
using UnityEngine;
using Random = UnityEngine.Random;

namespace IndustrialSimulation.FaultSimulation
{
    public class FaultSimulationManager : MonoBehaviour
    {
        private static FaultSimulationManager _instance;
        public static FaultSimulationManager Instance => _instance;

        [Header("推演设置")]
        public float SimulationSpeed = 1.0f;
        public float FaultCheckInterval = 5.0f;
        public bool AutoInjectFaults = true;

        private SimulationRecord _currentSimulation;
        private readonly Dictionary<string, FaultDefinition> _faultDefinitions = new Dictionary<string, FaultDefinition>();
        private readonly Dictionary<string, FaultInstance> _activeFaults = new Dictionary<string, FaultInstance>();
        private readonly List<FaultInstance> _resolvedFaultHistory = new List<FaultInstance>();
        private float _lastFaultCheckTime;

        public bool IsSimulationActive => _currentSimulation != null && _currentSimulation.IsActive;
        public string CurrentSimulationId => _currentSimulation?.Id;

        public event Action<SimulationRecord> OnSimulationStarted;
        public event Action<SimulationRecord> OnSimulationStopped;
        public event Action<FaultInstance> OnFaultOccurred;
        public event Action<FaultInstance> OnFaultResolved;

        private void Awake()
        {
            if (_instance == null)
            {
                _instance = this;
                DontDestroyOnLoad(gameObject);
                LoadFaultDefinitions();
            }
            else
            {
                Destroy(gameObject);
            }
        }

        private void LoadFaultDefinitions()
        {
            var definitions = SQLiteManager.Instance.GetAllFaultDefinitions();
            foreach (var def in definitions)
            {
                _faultDefinitions[def.FaultCode] = def;
            }
        }

        public void StartSimulation(string workshopId, string simulationName, double speed = 1.0)
        {
            if (IsSimulationActive)
            {
                Debug.LogWarning("已有正在进行的推演");
                return;
            }

            _currentSimulation = new SimulationRecord
            {
                Id = IdGenerator.GenerateId(),
                Name = simulationName,
                WorkshopId = workshopId,
                CreatorId = "local",
                SimulationSpeed = speed,
                IsActive = true
            };

            SimulationSpeed = (float)speed;
            SQLiteManager.Instance.InsertSimulationRecord(_currentSimulation);

            var equipmentList = EquipmentManager.Instance.GetAllEquipment();
            foreach (var equipment in equipmentList)
            {
                var model = equipment.ToModel();
                _currentSimulation.EquipmentSnapshots[equipment.EquipmentId] = JsonHelper.Serialize(model);
            }

            _activeFaults.Clear();
            _lastFaultCheckTime = Time.time;

            if (SimulationReplaySystem.Instance != null)
            {
                var workshopId = "workshop_001";
                var scenarioId = FaultScenarioManager.Instance?.ActiveScenario?.Id;
                SimulationReplaySystem.Instance.StartRecording(simulationName, workshopId, scenarioId);
            }

            OnSimulationStarted?.Invoke(_currentSimulation);
            Debug.Log($"推演已开始: {simulationName}");
        }

        public void StopSimulation()
        {
            if (!IsSimulationActive) return;

            _currentSimulation.IsActive = false;
            _currentSimulation.EndTime = DateTime.Now;
            SQLiteManager.Instance.UpdateSimulationRecord(_currentSimulation);

            ResolveAllFaults("模拟结束");

            if (SimulationReplaySystem.Instance != null && SimulationReplaySystem.Instance.IsRecording)
            {
                var score = SimulationScoringSystem.Instance?.CalculateCurrentScore();
                SimulationReplaySystem.Instance.StopRecording(
                    _activeFaults.Count + _resolvedFaultHistory.Count,
                    _resolvedFaultHistory.Count,
                    score?.Grade ?? "",
                    (int)(score?.TotalScore ?? 0));
            }

            OnSimulationStopped?.Invoke(_currentSimulation);
            Debug.Log($"推演已结束: {_currentSimulation.Name}");

            _currentSimulation = null;
        }

        public FaultInstance InjectFault(string equipmentId, string faultCode, double delaySeconds = 0)
        {
            if (!IsSimulationActive)
            {
                Debug.LogWarning("没有正在进行的推演");
                return null;
            }

            var equipment = EquipmentManager.Instance.GetEquipment(equipmentId);
            if (equipment == null)
            {
                Debug.LogError($"未找到设备: {equipmentId}");
                return null;
            }

            if (!_faultDefinitions.TryGetValue(faultCode, out var faultDef))
            {
                Debug.LogError($"未找到故障定义: {faultCode}");
                return null;
            }

            if (delaySeconds > 0)
            {
                StartCoroutine(DelayInjectFault(equipmentId, faultCode, (float)delaySeconds));
                return null;
            }

            return CreateAndApplyFault(equipment, faultDef);
        }

        private System.Collections.IEnumerator DelayInjectFault(string equipmentId, string faultCode, float delay)
        {
            yield return new WaitForSeconds(delay);
            var equipment = EquipmentManager.Instance.GetEquipment(equipmentId);
            if (equipment != null && _faultDefinitions.TryGetValue(faultCode, out var faultDef))
            {
                CreateAndApplyFault(equipment, faultDef);
            }
        }

        private FaultInstance CreateAndApplyFault(EquipmentBase equipment, FaultDefinition faultDef)
        {
            var faultInstance = new FaultInstance
            {
                Id = IdGenerator.GenerateId(),
                FaultCode = faultDef.FaultCode,
                EquipmentId = equipment.EquipmentId,
                SimulationId = _currentSimulation.Id,
                Status = FaultStatus.Active,
                Severity = faultDef.Severity
            };

            foreach (var param in faultDef.AffectedParameters)
            {
                var deviation = (Random.value * 0.4 + 0.1) * (Random.value > 0.5 ? 1 : -1);
                faultInstance.ParameterDeviations[param] = deviation;
            }

            _activeFaults[faultInstance.Id] = faultInstance;
            _currentSimulation.FaultInstanceIds.Add(faultInstance.Id);

            equipment.ApplyFault(faultInstance);
            SQLiteManager.Instance.InsertFaultInstance(faultInstance);
            SQLiteManager.Instance.UpdateSimulationRecord(_currentSimulation);

            if (FaultCascadeSystem.Instance != null)
            {
                FaultCascadeSystem.Instance.OnFaultOccurred(faultInstance);
            }

            OnFaultOccurred?.Invoke(faultInstance);
            Debug.Log($"故障已注入: {faultDef.Name} -> {equipment.EquipmentName}");

            return faultInstance;
        }

        public void ResolveFault(string faultInstanceId, string resolvedBy = "operator")
        {
            if (!_activeFaults.TryGetValue(faultInstanceId, out var fault))
            {
                Debug.LogWarning($"未找到活动故障: {faultInstanceId}");
                return;
            }

            var equipment = EquipmentManager.Instance.GetEquipment(fault.EquipmentId);
            if (equipment != null)
            {
                equipment.ResolveFault(faultInstanceId);
            }

            fault.Status = FaultStatus.Resolved;
            fault.ResolvedTime = DateTime.Now;
            fault.ResolvedBy = resolvedBy;

            _activeFaults.Remove(faultInstanceId);
            _resolvedFaultHistory.Add(fault);
            SQLiteManager.Instance.UpdateFaultInstance(fault);

            OnFaultResolved?.Invoke(fault);
            Debug.Log($"故障已解决: {fault.FaultCode}");
        }

        private void ResolveAllFaults(string resolvedBy)
        {
            var faultIds = new List<string>(_activeFaults.Keys);
            foreach (var faultId in faultIds)
            {
                ResolveFault(faultId, resolvedBy);
            }
        }

        public List<FaultInstance> GetActiveFaults()
        {
            return new List<FaultInstance>(_activeFaults.Values);
        }

        public List<FaultDefinition> GetFaultDefinitions()
        {
            return new List<FaultDefinition>(_faultDefinitions.Values);
        }

        public List<FaultDefinition> GetFaultDefinitionsForEquipment(EquipmentType equipmentType)
        {
            var result = new List<FaultDefinition>();
            foreach (var def in _faultDefinitions.Values)
            {
                if (def.ApplicableEquipmentType == equipmentType)
                {
                    result.Add(def);
                }
            }
            return result;
        }

        private void Update()
        {
            if (!IsSimulationActive || !AutoInjectFaults) return;

            if (Time.time - _lastFaultCheckTime >= FaultCheckInterval / SimulationSpeed)
            {
                _lastFaultCheckTime = Time.time;
                CheckAndInjectRandomFaults();
            }
        }

        private void CheckAndInjectRandomFaults()
        {
            var equipmentList = EquipmentManager.Instance.GetEquipmentByStatus(EquipmentStatus.Running);
            foreach (var equipment in equipmentList)
            {
                if (equipment.HasFault) continue;

                var availableFaults = GetFaultDefinitionsForEquipment(equipment.EquipmentType);
                if (availableFaults.Count == 0) continue;

                var faultDef = availableFaults[Random.Range(0, availableFaults.Count)];
                if (Random.value < faultDef.Probability * 0.01)
                {
                    CreateAndApplyFault(equipment, faultDef);
                }
            }
        }

        public void SetSimulationSpeed(float speed)
        {
            SimulationSpeed = speed;
            if (_currentSimulation != null)
            {
                _currentSimulation.SimulationSpeed = speed;
                SQLiteManager.Instance.UpdateSimulationRecord(_currentSimulation);
            }
        }

        public SimulationRecord GetCurrentSimulation()
        {
            return _currentSimulation;
        }

        public List<SimulationRecord> GetSimulationHistory(int limit = 50)
        {
            return SQLiteManager.Instance.GetSimulationRecords(limit);
        }

        public void SyncActiveFaults(List<FaultInstance> serverFaults)
        {
            var localActiveIds = new HashSet<string>(_activeFaults.Keys);
            var serverActiveIds = new HashSet<string>();

            foreach (var fault in serverFaults)
            {
                serverActiveIds.Add(fault.Id);

                if (!localActiveIds.Contains(fault.Id))
                {
                    _activeFaults[fault.Id] = fault;

                    var equipment = EquipmentManager.Instance.GetEquipment(fault.EquipmentId);
                    if (equipment != null && equipment.GetActiveFaults().Find(f => f.Id == fault.Id) == null)
                    {
                        equipment.ApplyFault(fault);

                        if (FaultVisualEffectSystem.Instance != null)
                        {
                            FaultVisualEffectSystem.Instance.ShowFaultEffect(equipment, fault);
                        }
                    }
                }
            }

            foreach (var localId in localActiveIds)
            {
                if (!serverActiveIds.Contains(localId) && _activeFaults.TryGetValue(localId, out var removedFault))
                {
                    _activeFaults.Remove(localId);

                    var equipment = EquipmentManager.Instance.GetEquipment(removedFault.EquipmentId);
                    if (equipment != null)
                    {
                        equipment.ResolveFault(localId);

                        if (FaultVisualEffectSystem.Instance != null)
                        {
                            FaultVisualEffectSystem.Instance.HideFaultEffect(equipment, localId);
                        }
                    }
                }
            }
        }

        public void RegisterRemoteFault(FaultInstance fault)
        {
            if (!_activeFaults.ContainsKey(fault.Id))
            {
                _activeFaults[fault.Id] = fault;
            }
        }

        public void UnregisterRemoteFault(string faultInstanceId)
        {
            if (_activeFaults.TryGetValue(faultInstanceId, out var fault))
            {
                _activeFaults.Remove(faultInstanceId);
                _resolvedFaultHistory.Add(fault);
            }
        }

        public FaultInstance GetActiveFaultById(string faultInstanceId)
        {
            _activeFaults.TryGetValue(faultInstanceId, out var fault);
            return fault;
        }

        private void OnDestroy()
        {
            if (IsSimulationActive)
            {
                StopSimulation();
            }
        }
    }
}
