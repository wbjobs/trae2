using System;
using System.Collections.Generic;
using IndustrialSimulation.Database;
using IndustrialSimulation.Equipment;
using IndustrialSimulation.FaultSimulation;
using IndustrialSimulation.Network;
using IndustrialSimulation.Scene;
using IndustrialSimulation.Shared.Models;
using IndustrialSimulation.Shared.Protocols;
using IndustrialSimulation.Shared.Utils;
using UnityEngine;

namespace IndustrialSimulation.Core
{
    public class GameManager : MonoBehaviour
    {
        private static GameManager _instance;
        public static GameManager Instance => _instance;

        [Header("网络设置")]
        public string ServerAddress = "127.0.0.1";
        public int ServerPort = 8888;
        public string PlayerName = "Player";

        [Header("本地模式")]
        public bool UseLocalMode = true;

        public bool IsNetworkMode => !UseLocalMode && NetworkClient.Instance.IsConnected;

        private WorkshopModel _currentWorkshop;

        private void Awake()
        {
            if (_instance == null)
            {
                _instance = this;
                DontDestroyOnLoad(gameObject);
                InitializeCoreSystems();
            }
            else
            {
                Destroy(gameObject);
            }
        }

        private void Start()
        {
            EnsureManagersCreated();
        }

        private void InitializeCoreSystems()
        {
            if (UnityMainThreadDispatcher.Instance == null)
            {
                var dispatcherObj = new GameObject("UnityMainThreadDispatcher");
                dispatcherObj.AddComponent<UnityMainThreadDispatcher>();
                DontDestroyOnLoad(dispatcherObj);
            }

            if (SQLiteManager.Instance == null)
            {
                var dbObj = new GameObject("SQLiteManager");
                dbObj.AddComponent<SQLiteManager>();
                DontDestroyOnLoad(dbObj);
            }

            if (NetworkClient.Instance == null)
            {
                var netObj = new GameObject("NetworkClient");
                netObj.AddComponent<NetworkClient>();
                DontDestroyOnLoad(netObj);
            }

            if (WorkshopManager.Instance == null)
            {
                var sceneObj = new GameObject("WorkshopManager");
                sceneObj.AddComponent<WorkshopManager>();
                DontDestroyOnLoad(sceneObj);
            }

            if (EquipmentManager.Instance == null)
            {
                var eqObj = new GameObject("EquipmentManager");
                eqObj.AddComponent<EquipmentManager>();
                DontDestroyOnLoad(eqObj);
            }

            if (FaultSimulationManager.Instance == null)
            {
                var faultObj = new GameObject("FaultSimulationManager");
                faultObj.AddComponent<FaultSimulationManager>();
                DontDestroyOnLoad(faultObj);
            }
        }

        private void EnsureManagersCreated()
        {
            var _ = SQLiteManager.Instance;
            _ = WorkshopManager.Instance;
            _ = EquipmentManager.Instance;
            _ = FaultSimulationManager.Instance;
        }

        public bool ConnectToServer()
        {
            if (UseLocalMode)
            {
                Debug.Log("本地模式，跳过网络连接");
                return true;
            }

            var success = NetworkClient.Instance.Connect(ServerAddress, ServerPort);
            if (success)
            {
                NetworkClient.Instance.SendConnectRequest(PlayerName);
                RegisterNetworkHandlers();
            }
            return success;
        }

        public void DisconnectFromServer()
        {
            NetworkClient.Instance.Disconnect();
        }

        private void RegisterNetworkHandlers()
        {
            NetworkClient.Instance.RegisterHandler(MessageType.SimulationSyncNotify, OnSimulationSync);
            NetworkClient.Instance.RegisterHandler(MessageType.EquipmentStatusNotify, OnEquipmentStatusNotify);
            NetworkClient.Instance.RegisterHandler(MessageType.FaultOccurredNotify, OnFaultOccurredNotify);
            NetworkClient.Instance.RegisterHandler(MessageType.FaultResolveResponse, OnFaultResolvedNotify);
            NetworkClient.Instance.RegisterHandler(MessageType.FaultCascadeNotify, OnFaultCascadeNotify);
            NetworkClient.Instance.RegisterHandler(MessageType.PlayerJoinNotify, OnPlayerJoin);
            NetworkClient.Instance.RegisterHandler(MessageType.PlayerLeaveNotify, OnPlayerLeave);
        }

        public void LoadWorkshop(string workshopId)
        {
            WorkshopManager.Instance.LoadWorkshop(workshopId);
            EquipmentManager.Instance.LoadEquipmentFromDatabase(workshopId);
            _currentWorkshop = WorkshopManager.Instance.GetCurrentWorkshop();
            EquipmentManager.Instance.StartAllEquipment();
        }

        public void StartSimulation(string simulationName, double speed = 1.0)
        {
            if (_currentWorkshop == null)
            {
                Debug.LogWarning("请先加载车间");
                return;
            }

            if (IsNetworkMode)
            {
                NetworkClient.Instance.SendSimulationStartRequest(_currentWorkshop.Id, simulationName, speed);
            }
            else
            {
                FaultSimulationManager.Instance.StartSimulation(_currentWorkshop.Id, simulationName, speed);
            }
        }

        public void StopSimulation()
        {
            if (IsNetworkMode)
            {
                NetworkClient.Instance.SendSimulationStopRequest(FaultSimulationManager.Instance.CurrentSimulationId);
            }
            else
            {
                FaultSimulationManager.Instance.StopSimulation();
            }
        }

        public void InjectFault(string equipmentId, string faultCode, double delay = 0)
        {
            if (IsNetworkMode)
            {
                NetworkClient.Instance.SendFaultInjectRequest(
                    FaultSimulationManager.Instance.CurrentSimulationId,
                    equipmentId,
                    faultCode,
                    delay);
            }
            else
            {
                FaultSimulationManager.Instance.InjectFault(equipmentId, faultCode, delay);
            }
        }

        public void ResolveFault(string faultInstanceId)
        {
            if (IsNetworkMode)
            {
                NetworkClient.Instance.SendFaultResolveRequest(
                    FaultSimulationManager.Instance.CurrentSimulationId,
                    faultInstanceId,
                    PlayerName);
            }
            else
            {
                FaultSimulationManager.Instance.ResolveFault(faultInstanceId, PlayerName);
            }
        }

        private void OnSimulationSync(NetworkMessage message)
        {
            var syncData = JsonHelper.Deserialize<Dictionary<string, object>>(message.Payload);
            if (syncData == null) return;

            if (syncData.TryGetValue("Equipment", out var equipmentObj))
            {
                var equipmentList = JsonHelper.Deserialize<List<EquipmentModel>>(equipmentObj.ToString());
                foreach (var model in equipmentList)
                {
                    EquipmentManager.Instance.UpdateEquipmentFromModel(model);
                }
            }

            if (syncData.TryGetValue("ActiveFaults", out var faultsObj))
            {
                var serverFaults = JsonHelper.Deserialize<List<FaultInstance>>(faultsObj.ToString());
                if (serverFaults != null)
                {
                    FaultSimulationManager.Instance.SyncActiveFaults(serverFaults);
                }
            }
        }

        private void OnEquipmentStatusNotify(NetworkMessage message)
        {
            var equipment = JsonHelper.Deserialize<EquipmentModel>(message.Payload);
            if (equipment != null)
            {
                EquipmentManager.Instance.UpdateEquipmentFromModel(equipment);
            }
        }

        private void OnFaultOccurredNotify(NetworkMessage message)
        {
            var fault = JsonHelper.Deserialize<FaultInstance>(message.Payload);
            if (fault == null) return;

            var equipment = EquipmentManager.Instance.GetEquipment(fault.EquipmentId);
            if (equipment == null) return;

            if (!equipment.HasFault || equipment.GetActiveFaults().Find(f => f.Id == fault.Id) == null)
            {
                equipment.ApplyFault(fault);
                FaultSimulationManager.Instance.RegisterRemoteFault(fault);

                if (FaultVisualEffectSystem.Instance != null)
                {
                    FaultVisualEffectSystem.Instance.ShowFaultEffect(equipment, fault);
                }
            }
        }

        private void OnFaultResolvedNotify(NetworkMessage message)
        {
            var payload = message.Payload;
            var faultInstanceId = payload;

            var resolvedFault = FaultSimulationManager.Instance.GetActiveFaultById(faultInstanceId);
            if (resolvedFault == null) return;

            var equipment = EquipmentManager.Instance.GetEquipment(resolvedFault.EquipmentId);
            if (equipment == null) return;

            equipment.ResolveFault(faultInstanceId);
            FaultSimulationManager.Instance.UnregisterRemoteFault(faultInstanceId);

            if (FaultVisualEffectSystem.Instance != null)
            {
                FaultVisualEffectSystem.Instance.HideFaultEffect(equipment, faultInstanceId);
            }
        }

        private void OnFaultCascadeNotify(NetworkMessage message)
        {
            var cascadeEvent = JsonHelper.Deserialize<FaultCascadeNotifyPayload>(message.Payload);
            if (cascadeEvent == null) return;

            Debug.Log($"级联故障通知: {cascadeEvent.SourceFaultCode} -> {cascadeEvent.ResultingFaultCode}");
        }

        private void OnPlayerJoin(NetworkMessage message)
        {
            Debug.Log($"玩家加入: {message.Payload}");
        }

        private void OnPlayerLeave(NetworkMessage message)
        {
            Debug.Log($"玩家离开: {message.Payload}");
        }

        public List<WorkshopModel> GetAvailableWorkshops()
        {
            return WorkshopManager.Instance.GetAllWorkshops();
        }

        public List<EquipmentBase> GetCurrentEquipment()
        {
            return EquipmentManager.Instance.GetAllEquipment();
        }

        public List<FaultInstance> GetActiveFaults()
        {
            return FaultSimulationManager.Instance.GetActiveFaults();
        }

        public List<FaultDefinition> GetFaultDefinitions()
        {
            return FaultSimulationManager.Instance.GetFaultDefinitions();
        }

        private void OnDestroy()
        {
            if (!UseLocalMode)
            {
                NetworkClient.Instance.Disconnect();
            }
        }
    }

    [Serializable]
    public class FaultCascadeNotifyPayload
    {
        public string SourceEquipmentId;
        public string TargetEquipmentId;
        public string SourceFaultCode;
        public string ResultingFaultCode;
    }
}
