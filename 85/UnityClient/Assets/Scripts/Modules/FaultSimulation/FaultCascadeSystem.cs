using System;
using System.Collections.Generic;
using IndustrialSimulation.Shared.Models;
using IndustrialSimulation.Shared.Utils;
using UnityEngine;

namespace IndustrialSimulation.FaultSimulation
{
    [Serializable]
    public class EquipmentDependency
    {
        public string SourceId;
        public string TargetId;
        public DependencyType Type;
        public float PropagationChance = 0.5f;
        public float PropagationDelayMin = 2f;
        public float PropagationDelayMax = 10f;
        public List<string> PropagatedFaultCodes = new List<string>();

        public enum DependencyType
        {
            PowerSupply,
            FluidFlow,
            ControlSignal,
            MechanicalCoupling,
            ThermalLink,
            DataLink
        }
    }

    [Serializable]
    public class CascadeEvent
    {
        public string Id;
        public string SourceEquipmentId;
        public string TargetEquipmentId;
        public string SourceFaultCode;
        public string ResultingFaultCode;
        public EquipmentDependency.DependencyType DependencyType;
        public float Delay;
        public float Elapsed;
        public bool HasFired;
        public DateTime Timestamp;

        public CascadeEvent()
        {
            Id = IdGenerator.GenerateId();
            Timestamp = DateTime.Now;
        }
    }

    public class FaultCascadeSystem : MonoBehaviour
    {
        private static FaultCascadeSystem _instance;
        public static FaultCascadeSystem Instance => _instance;

        [Header("级联设置")]
        public bool EnableCascade = true;
        public float CascadeCheckInterval = 1f;
        public bool EnableSeverityEscalation = true;
        public float SeverityEscalationInterval = 30f;
        public float SeverityEscalationChance = 0.1f;

        private readonly List<EquipmentDependency> _dependencies = new List<EquipmentDependency>();
        private readonly List<CascadeEvent> _pendingCascades = new List<CascadeEvent>();
        private readonly List<CascadeEvent> _cascadeHistory = new List<CascadeEvent>();
        private readonly HashSet<string> _recentlyCascadedTargets = new HashSet<string>();
        private float _lastCascadeCheckTime;

        public event Action<CascadeEvent> OnCascadeTriggered;
        public event Action<EquipmentDependency> OnDependencyAdded;
        public event Action<FaultInstance> OnSeverityEscalated;

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
            InitializeDefaultDependencies();
        }

        private void InitializeDefaultDependencies()
        {
            var equipmentList = IndustrialSimulation.Equipment.EquipmentManager.Instance.GetAllEquipment();
            var pumpEquipment = equipmentList.Find(e => e.EquipmentType == EquipmentType.Pump);
            var motorEquipment = equipmentList.Find(e => e.EquipmentType == EquipmentType.Motor);
            var compressorEquipment = equipmentList.Find(e => e.EquipmentType == EquipmentType.Compressor);
            var boilerEquipment = equipmentList.Find(e => e.EquipmentType == EquipmentType.Boiler);
            var valveEquipment = equipmentList.Find(e => e.EquipmentType == EquipmentType.Valve);
            var sensorEquipment = equipmentList.Find(e => e.EquipmentType == EquipmentType.Sensor);

            if (motorEquipment != null && pumpEquipment != null)
            {
                AddDependency(new EquipmentDependency
                {
                    SourceId = motorEquipment.EquipmentId,
                    TargetId = pumpEquipment.EquipmentId,
                    Type = EquipmentDependency.DependencyType.MechanicalCoupling,
                    PropagationChance = 0.7f,
                    PropagationDelayMin = 3f,
                    PropagationDelayMax = 8f,
                    PropagatedFaultCodes = { "PUMP_001" }
                });
            }

            if (boilerEquipment != null && valveEquipment != null)
            {
                AddDependency(new EquipmentDependency
                {
                    SourceId = boilerEquipment.EquipmentId,
                    TargetId = valveEquipment.EquipmentId,
                    Type = EquipmentDependency.DependencyType.FluidFlow,
                    PropagationChance = 0.5f,
                    PropagationDelayMin = 5f,
                    PropagationDelayMax = 15f,
                    PropagatedFaultCodes = { "VALVE_001" }
                });
            }

            if (compressorEquipment != null && valveEquipment != null)
            {
                AddDependency(new EquipmentDependency
                {
                    SourceId = compressorEquipment.EquipmentId,
                    TargetId = valveEquipment.EquipmentId,
                    Type = EquipmentDependency.DependencyType.FluidFlow,
                    PropagationChance = 0.4f,
                    PropagationDelayMin = 4f,
                    PropagationDelayMax = 12f,
                    PropagatedFaultCodes = { "VALVE_001" }
                });
            }

            if (pumpEquipment != null && sensorEquipment != null)
            {
                AddDependency(new EquipmentDependency
                {
                    SourceId = pumpEquipment.EquipmentId,
                    TargetId = sensorEquipment.EquipmentId,
                    Type = EquipmentDependency.DependencyType.DataLink,
                    PropagationChance = 0.3f,
                    PropagationDelayMin = 2f,
                    PropagationDelayMax = 6f,
                    PropagatedFaultCodes = { "SENSOR_001" }
                });
            }
        }

        public void AddDependency(EquipmentDependency dependency)
        {
            _dependencies.Add(dependency);
            OnDependencyAdded?.Invoke(dependency);
        }

        public void RemoveDependency(string sourceId, string targetId)
        {
            _dependencies.RemoveAll(d => d.SourceId == sourceId && d.TargetId == targetId);
        }

        public void SetupEquipmentDependencies(string sourceEquipmentId, string targetEquipmentId,
            EquipmentDependency.DependencyType type, float chance, float delayMin, float delayMax,
            List<string> faultCodes)
        {
            var dep = new EquipmentDependency
            {
                SourceId = sourceEquipmentId,
                TargetId = targetEquipmentId,
                Type = type,
                PropagationChance = chance,
                PropagationDelayMin = delayMin,
                PropagationDelayMax = delayMax,
                PropagatedFaultCodes = faultCodes ?? new List<string>()
            };
            AddDependency(dep);
        }

        public List<EquipmentDependency> GetDependencies()
        {
            return new List<EquipmentDependency>(_dependencies);
        }

        public List<EquipmentDependency> GetDependenciesForEquipment(string equipmentId)
        {
            var result = new List<EquipmentDependency>();
            foreach (var dep in _dependencies)
            {
                if (dep.SourceId == equipmentId || dep.TargetId == equipmentId)
                {
                    result.Add(dep);
                }
            }
            return result;
        }

        public List<EquipmentDependency> GetDownstreamDependencies(string equipmentId)
        {
            var result = new List<EquipmentDependency>();
            foreach (var dep in _dependencies)
            {
                if (dep.SourceId == equipmentId)
                {
                    result.Add(dep);
                }
            }
            return result;
        }

        public void OnFaultOccurred(FaultInstance faultInstance)
        {
            if (!EnableCascade) return;

            var downstream = GetDownstreamDependencies(faultInstance.EquipmentId);
            foreach (var dep in downstream)
            {
                if (UnityEngine.Random.value > dep.PropagationChance) continue;
                if (dep.PropagatedFaultCodes.Count == 0) continue;

                var faultCode = dep.PropagatedFaultCodes[UnityEngine.Random.Range(0, dep.PropagatedFaultCodes.Count)];
                var delay = UnityEngine.Random.Range(dep.PropagationDelayMin, dep.PropagationDelayMax);

                var cascadeEvent = new CascadeEvent
                {
                    SourceEquipmentId = faultInstance.EquipmentId,
                    TargetEquipmentId = dep.TargetId,
                    SourceFaultCode = faultInstance.FaultCode,
                    ResultingFaultCode = faultCode,
                    DependencyType = dep.Type,
                    Delay = delay,
                    Elapsed = 0f,
                    HasFired = false
                };

                _pendingCascades.Add(cascadeEvent);
                Debug.Log($"级联事件已排定: {faultInstance.FaultCode} -> {dep.TargetId} ({dep.Type}), 延迟 {delay:F1}s");
            }
        }

        private void Update()
        {
            if (!EnableCascade) return;

            UpdatePendingCascades();

            if (EnableSeverityEscalation && FaultSimulationManager.Instance.IsSimulationActive)
            {
                if (Time.time - _lastCascadeCheckTime >= CascadeCheckInterval)
                {
                    _lastCascadeCheckTime = Time.time;
                    CheckSeverityEscalation();
                }
            }
        }

        private void UpdatePendingCascades()
        {
            var toRemove = new List<CascadeEvent>();

            foreach (var cascade in _pendingCascades)
            {
                if (cascade.HasFired)
                {
                    toRemove.Add(cascade);
                    continue;
                }

                cascade.Elapsed += Time.deltaTime * FaultSimulationManager.Instance.SimulationSpeed;

                if (cascade.Elapsed >= cascade.Delay)
                {
                    FireCascadeEvent(cascade);
                    cascade.HasFired = true;
                    toRemove.Add(cascade);
                }
            }

            foreach (var evt in toRemove)
            {
                _pendingCascades.Remove(evt);
            }
        }

        private void FireCascadeEvent(CascadeEvent cascade)
        {
            if (!FaultSimulationManager.Instance.IsSimulationActive) return;

            var targetEquipment = IndustrialSimulation.Equipment.EquipmentManager.Instance.GetEquipment(cascade.TargetEquipmentId);
            if (targetEquipment == null)
            {
                Debug.LogWarning($"级联目标设备不存在: {cascade.TargetEquipmentId}");
                return;
            }

            if (targetEquipment.HasFault)
            {
                Debug.Log($"级联跳过 - 目标设备已有故障: {cascade.TargetEquipmentId}");
                return;
            }

            if (_recentlyCascadedTargets.Contains(cascade.TargetEquipmentId))
            {
                Debug.Log($"级联跳过 - 目标设备近期已被级联影响: {cascade.TargetEquipmentId}");
                return;
            }

            GameManager.Instance.InjectFault(cascade.TargetEquipmentId, cascade.ResultingFaultCode);
            _cascadeHistory.Add(cascade);
            _recentlyCascadedTargets.Add(cascade.TargetEquipmentId);

            OnCascadeTriggered?.Invoke(cascade);

            Debug.Log($"级联故障触发: {cascade.SourceFaultCode}({cascade.SourceEquipmentId}) -> {cascade.ResultingFaultCode}({cascade.TargetEquipmentId}) [{cascade.DependencyType}]");
        }

        private void CheckSeverityEscalation()
        {
            var activeFaults = FaultSimulationManager.Instance.GetActiveFaults();
            foreach (var fault in activeFaults)
            {
                var timeSinceOccurrence = (DateTime.Now - fault.OccurredTime).TotalSeconds;
                if (timeSinceOccurrence < SeverityEscalationInterval) continue;

                var intervals = (int)(timeSinceOccurrence / SeverityEscalationInterval);
                var chance = Mathf.Min(0.8f, SeverityEscalationChance * intervals);

                if (UnityEngine.Random.value < chance)
                {
                    EscalateFaultSeverity(fault);
                }
            }
        }

        private void EscalateFaultSeverity(FaultInstance fault)
        {
            var oldSeverity = fault.Severity;
            var newSeverity = fault.Severity switch
            {
                FaultSeverity.Low => FaultSeverity.Medium,
                FaultSeverity.Medium => FaultSeverity.High,
                FaultSeverity.High => FaultSeverity.Critical,
                _ => fault.Severity
            };

            if (newSeverity != oldSeverity)
            {
                fault.Severity = newSeverity;
                OnSeverityEscalated?.Invoke(fault);
                Debug.Log($"故障严重度升级: {fault.FaultCode} {oldSeverity} -> {newSeverity}");

                if (newSeverity == FaultSeverity.Critical)
                {
                    var downstream = GetDownstreamDependencies(fault.EquipmentId);
                    foreach (var dep in downstream)
                    {
                        if (_recentlyCascadedTargets.Contains(dep.TargetId)) continue;

                        var targetEquipment = IndustrialSimulation.Equipment.EquipmentManager.Instance.GetEquipment(dep.TargetId);
                        if (targetEquipment != null && targetEquipment.HasFault) continue;

                        if (dep.PropagatedFaultCodes.Count > 0)
                        {
                            var fc = dep.PropagatedFaultCodes[0];
                            var cascadeEvent = new CascadeEvent
                            {
                                SourceEquipmentId = fault.EquipmentId,
                                TargetEquipmentId = dep.TargetId,
                                SourceFaultCode = fault.FaultCode,
                                ResultingFaultCode = fc,
                                DependencyType = dep.Type,
                                Delay = UnityEngine.Random.Range(2f, 5f),
                                Elapsed = 0f,
                                HasFired = false
                            };
                            _pendingCascades.Add(cascadeEvent);
                            _recentlyCascadedTargets.Add(dep.TargetId);
                        }
                    }
                }
            }
        }

        public List<CascadeEvent> GetPendingCascades()
        {
            return new List<CascadeEvent>(_pendingCascades);
        }

        public void ClearAllCascades()
        {
            _pendingCascades.Clear();
            _recentlyCascadedTargets.Clear();
        }

        public List<CascadeEvent> GetCascadeHistory()
        {
            var history = new List<CascadeEvent>(_cascadeHistory);
            return history;
        }
    }
}
