using System;
using System.Collections.Generic;
using IndustrialSimulation.Shared.Models;
using UnityEngine;

namespace IndustrialSimulation.Equipment
{
    public abstract class EquipmentBase : MonoBehaviour
    {
        [Header("设备基础信息")]
        public string EquipmentId;
        public string EquipmentName;
        public EquipmentType EquipmentType;
        public EquipmentStatus CurrentStatus = EquipmentStatus.Stopped;

        [Header("可视化设置")]
        public Renderer EquipmentRenderer;
        public Color NormalColor = Color.green;
        public Color WarningColor = Color.yellow;
        public Color FaultColor = Color.red;
        public Color StoppedColor = Color.gray;

        protected Dictionary<string, double> Parameters = new Dictionary<string, double>();
        protected Dictionary<string, double> NormalParameters = new Dictionary<string, double>();
        protected List<FaultInstance> ActiveFaults = new List<FaultInstance>();
        protected EquipmentAnimationController _animationController;

        public event Action<EquipmentBase> OnStatusChanged;
        public event Action<EquipmentBase, string, double> OnParameterChanged;
        public event Action<EquipmentBase, FaultInstance> OnFaultOccurred;
        public event Action<EquipmentBase, FaultInstance> OnFaultResolved;

        public bool IsRunning => CurrentStatus == EquipmentStatus.Running || CurrentStatus == EquipmentStatus.Warning;
        public bool HasFault => CurrentStatus == EquipmentStatus.Fault || ActiveFaults.Count > 0;

        protected virtual void Start()
        {
            InitializeParameters();
            _animationController = GetComponentInChildren<EquipmentAnimationController>();
            UpdateVisualStatus();
        }

        protected abstract void InitializeParameters();

        public virtual void StartEquipment()
        {
            if (CurrentStatus == EquipmentStatus.Maintenance) return;

            CurrentStatus = EquipmentStatus.Running;
            OnStatusChanged?.Invoke(this);
            UpdateVisualStatus();
            if (_animationController != null) _animationController.StartAnimation();
        }

        public virtual void StopEquipment()
        {
            CurrentStatus = EquipmentStatus.Stopped;
            OnStatusChanged?.Invoke(this);
            UpdateVisualStatus();
            if (_animationController != null) _animationController.StopAnimation();
        }

        public virtual void SetMaintenanceMode(bool isMaintenance)
        {
            CurrentStatus = isMaintenance ? EquipmentStatus.Maintenance : EquipmentStatus.Stopped;
            OnStatusChanged?.Invoke(this);
            UpdateVisualStatus();
        }

        public virtual double GetParameter(string key)
        {
            return Parameters.TryGetValue(key, out var value) ? value : 0.0;
        }

        public virtual void SetParameter(string key, double value)
        {
            if (!Parameters.ContainsKey(key)) return;

            Parameters[key] = value;
            OnParameterChanged?.Invoke(this, key, value);
            CheckParameterThresholds(key, value);
        }

        protected virtual void CheckParameterThresholds(string key, double value)
        {
        }

        public virtual Dictionary<string, double> GetAllParameters()
        {
            return new Dictionary<string, double>(Parameters);
        }

        public virtual void ApplyFault(FaultInstance fault)
        {
            ActiveFaults.Add(fault);
            CurrentStatus = EquipmentStatus.Fault;

            foreach (var deviation in fault.ParameterDeviations)
            {
                if (Parameters.ContainsKey(deviation.Key))
                {
                    Parameters[deviation.Key] *= (1 + deviation.Value);
                }
            }

            OnFaultOccurred?.Invoke(this, fault);
            OnStatusChanged?.Invoke(this);
            UpdateVisualStatus();
        }

        public virtual void ResolveFault(string faultInstanceId)
        {
            var fault = ActiveFaults.Find(f => f.Id == faultInstanceId);
            if (fault == null) return;

            fault.Status = FaultStatus.Resolved;
            fault.ResolvedTime = DateTime.Now;
            ActiveFaults.Remove(fault);

            foreach (var deviation in fault.ParameterDeviations)
            {
                if (NormalParameters.ContainsKey(deviation.Key))
                {
                    Parameters[deviation.Key] = NormalParameters[deviation.Key];
                }
            }

            OnFaultResolved?.Invoke(this, fault);

            if (ActiveFaults.Count == 0)
            {
                CurrentStatus = EquipmentStatus.Running;
                OnStatusChanged?.Invoke(this);
            }

            UpdateVisualStatus();
        }

        public List<FaultInstance> GetActiveFaults()
        {
            return new List<FaultInstance>(ActiveFaults);
        }

        protected virtual void UpdateVisualStatus()
        {
            if (EquipmentRenderer == null) return;

            var color = CurrentStatus switch
            {
                EquipmentStatus.Running => NormalColor,
                EquipmentStatus.Warning => WarningColor,
                EquipmentStatus.Fault => FaultColor,
                _ => StoppedColor
            };

            EquipmentRenderer.material.color = Color.Lerp(EquipmentRenderer.material.color, color, 0.5f);
        }

        public virtual EquipmentModel ToModel()
        {
            return new EquipmentModel
            {
                Id = EquipmentId,
                Name = EquipmentName,
                Type = EquipmentType,
                Status = CurrentStatus,
                PositionX = transform.position.x,
                PositionY = transform.position.y,
                PositionZ = transform.position.z,
                Parameters = new Dictionary<string, double>(Parameters),
                LastUpdateTime = DateTime.Now
            };
        }

        public virtual void FromModel(EquipmentModel model)
        {
            EquipmentId = model.Id;
            EquipmentName = model.Name;
            EquipmentType = model.Type;

            var previousStatus = CurrentStatus;
            CurrentStatus = model.Status;
            Parameters = new Dictionary<string, double>(model.Parameters);

            transform.position = new Vector3(model.PositionX, model.PositionY, model.PositionZ);

            if (_animationController != null)
            {
                if (IsRunning && !previousStatus.IsRunning())
                {
                    _animationController.StartAnimation();
                }
                else if (!IsRunning && previousStatus.IsRunning())
                {
                    _animationController.StopAnimation();
                }
            }

            foreach (var param in Parameters)
            {
                CheckParameterThresholds(param.Key, param.Value);
            }

            UpdateVisualStatus();
        }

        protected virtual void Update()
        {
            if (IsRunning && !Core.GameManager.Instance.IsNetworkMode)
            {
                SimulateParameters();
            }
        }

        protected abstract void SimulateParameters();

        protected void AddNormalParameter(string key, double value)
        {
            NormalParameters[key] = value;
            Parameters[key] = value;
        }

        protected void AddParameterNoise(string key, double noiseRange)
        {
            if (Parameters.ContainsKey(key) && NormalParameters.ContainsKey(key))
            {
                var noise = UnityEngine.Random.Range(-(float)noiseRange, (float)noiseRange);
                Parameters[key] = NormalParameters[key] + noise;
            }
        }
    }

    public static class EquipmentStatusExtensions
    {
        public static bool IsRunning(this EquipmentStatus status)
        {
            return status == EquipmentStatus.Running || status == EquipmentStatus.Warning;
        }
    }
}
