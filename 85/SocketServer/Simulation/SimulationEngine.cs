using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using IndustrialSimulation.Server.Core;
using IndustrialSimulation.Server.Network;
using IndustrialSimulation.Shared.Models;
using IndustrialSimulation.Shared.Utils;

namespace IndustrialSimulation.Server.Simulation
{
    public class SimulationEngine
    {
        private readonly ServerState _serverState;
        private readonly NetworkServer _networkServer;
        private readonly Thread _simulationThread;
        private bool _isRunning;
        private readonly Random _random = new Random();

        public SimulationEngine(ServerState serverState, NetworkServer networkServer)
        {
            _serverState = serverState;
            _networkServer = networkServer;
            _isRunning = true;

            _simulationThread = new Thread(SimulationLoop)
            {
                IsBackground = true
            };
            _simulationThread.Start();

            InitializeDefaultData();
        }

        private void InitializeDefaultData()
        {
            var workshop1 = new WorkshopModel
            {
                Id = IdGenerator.GenerateId(),
                Name = "一号车间",
                Description = "主要生产车间"
            };

            var workshop2 = new WorkshopModel
            {
                Id = IdGenerator.GenerateId(),
                Name = "二号车间",
                Description = "辅助生产车间"
            };

            _serverState.Workshops.Add(workshop1);
            _serverState.Workshops.Add(workshop2);

            var equipmentList = new List<EquipmentModel>
            {
                new EquipmentModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "主水泵-01",
                    Type = EquipmentType.Pump,
                    Status = EquipmentStatus.Running,
                    WorkshopId = workshop1.Id,
                    PositionX = -5, PositionY = 0, PositionZ = -5,
                    Parameters = { ["flow"] = 100.0, ["pressure"] = 2.5, ["temperature"] = 45.0, ["vibration"] = 2.1, ["efficiency"] = 85.0 }
                },
                new EquipmentModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "驱动电机-01",
                    Type = EquipmentType.Motor,
                    Status = EquipmentStatus.Running,
                    WorkshopId = workshop1.Id,
                    PositionX = 0, PositionY = 0, PositionZ = -5,
                    Parameters = { ["current"] = 25.5, ["voltage"] = 380.0, ["power"] = 15.0, ["temperature"] = 60.0, ["rpm"] = 1480.0 }
                },
                new EquipmentModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "空压机-01",
                    Type = EquipmentType.Compressor,
                    Status = EquipmentStatus.Running,
                    WorkshopId = workshop1.Id,
                    PositionX = 5, PositionY = 0, PositionZ = -5,
                    Parameters = { ["pressure"] = 0.8, ["flow"] = 50.0, ["temperature"] = 70.0, ["power"] = 22.0 }
                },
                new EquipmentModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "传送带-A线",
                    Type = EquipmentType.Conveyor,
                    Status = EquipmentStatus.Running,
                    WorkshopId = workshop2.Id,
                    PositionX = -5, PositionY = 0, PositionZ = 5,
                    Parameters = { ["speed"] = 2.0, ["load"] = 500.0, ["belt_tension"] = 80.0 }
                },
                new EquipmentModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "蒸汽锅炉-01",
                    Type = EquipmentType.Boiler,
                    Status = EquipmentStatus.Running,
                    WorkshopId = workshop2.Id,
                    PositionX = 0, PositionY = 0, PositionZ = 5,
                    Parameters = { ["temperature"] = 180.0, ["pressure"] = 1.0, ["water_level"] = 75.0, ["fuel_rate"] = 50.0 }
                },
                new EquipmentModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "控制阀组-01",
                    Type = EquipmentType.Valve,
                    Status = EquipmentStatus.Running,
                    WorkshopId = workshop2.Id,
                    PositionX = 5, PositionY = 0, PositionZ = 5,
                    Parameters = { ["opening"] = 60.0, ["flow"] = 30.0, ["pressure_in"] = 2.0, ["pressure_out"] = 1.5 }
                }
            };

            foreach (var eq in equipmentList)
            {
                _serverState.Equipment[eq.Id] = eq;
            }

            var faults = new List<FaultDefinition>
            {
                new FaultDefinition
                {
                    FaultCode = "PUMP_001",
                    Name = "泵轴承故障",
                    Description = "泵轴承磨损导致振动增大",
                    Severity = FaultSeverity.Medium,
                    ApplicableEquipmentType = EquipmentType.Pump,
                    AffectedParameters = { "vibration", "temperature" },
                    Probability = 0.3
                },
                new FaultDefinition
                {
                    FaultCode = "MOTOR_001",
                    Name = "电机过载",
                    Description = "电机负载过大导致电流异常",
                    Severity = FaultSeverity.High,
                    ApplicableEquipmentType = EquipmentType.Motor,
                    AffectedParameters = { "current", "temperature" },
                    Probability = 0.25
                },
                new FaultDefinition
                {
                    FaultCode = "COMP_001",
                    Name = "压缩机压力异常",
                    Description = "压缩机出口压力偏离正常值",
                    Severity = FaultSeverity.Medium,
                    ApplicableEquipmentType = EquipmentType.Compressor,
                    AffectedParameters = { "pressure", "flow" },
                    Probability = 0.2
                },
                new FaultDefinition
                {
                    FaultCode = "VALVE_001",
                    Name = "阀门泄漏",
                    Description = "阀门密封不良导致泄漏",
                    Severity = FaultSeverity.Low,
                    ApplicableEquipmentType = EquipmentType.Valve,
                    AffectedParameters = { "flow", "pressure" },
                    Probability = 0.35
                }
            };

            foreach (var fault in faults)
            {
                _serverState.FaultDefinitions[fault.FaultCode] = fault;
            }
        }

        public SimulationSession CreateSimulation(ClientSession host, SimulationStartRequest request)
        {
            var session = new SimulationSession
            {
                Id = IdGenerator.GenerateId(),
                Name = request.SimulationName,
                WorkshopId = request.WorkshopId,
                HostId = host.PlayerId,
                SimulationSpeed = request.SimulationSpeed,
                IsActive = true,
                StartTime = DateTime.Now,
                LastUpdateTime = DateTime.Now
            };

            session.ParticipantIds.Add(host.PlayerId);

            var workshopEquipment = _serverState.Equipment.Values
                .Where(e => e.WorkshopId == request.WorkshopId);

            foreach (var eq in workshopEquipment)
            {
                session.EquipmentState[eq.Id] = eq.Clone();
            }

            lock (_serverState.ActiveSessions)
            {
                _serverState.ActiveSessions[session.Id] = session;
            }

            return session;
        }

        public void StopSimulation(string simulationId)
        {
            lock (_serverState.ActiveSessions)
            {
                if (_serverState.ActiveSessions.TryGetValue(simulationId, out var session))
                {
                    session.IsActive = false;
                    session.EndTime = DateTime.Now;
                }
            }
        }

        public FaultInstance InjectFault(string simulationId, string equipmentId, string faultCode, double delaySeconds)
        {
            if (!_serverState.ActiveSessions.TryGetValue(simulationId, out var session))
            {
                return null;
            }

            if (!_serverState.FaultDefinitions.TryGetValue(faultCode, out var faultDef))
            {
                return null;
            }

            if (!session.EquipmentState.TryGetValue(equipmentId, out var equipment))
            {
                return null;
            }

            var faultInstance = new FaultInstance
            {
                Id = IdGenerator.GenerateId(),
                FaultCode = faultCode,
                EquipmentId = equipmentId,
                SimulationId = simulationId,
                Status = FaultStatus.Active,
                Severity = faultDef.Severity
            };

            var random = new Random();
            foreach (var param in faultDef.AffectedParameters)
            {
                var deviation = (0.2 + (_random.NextDouble() * 0.3)) * (_random.NextDouble() > 0.5 ? 1 : -1);
                faultInstance.ParameterDeviations[param] = deviation;

                if (equipment.Parameters.ContainsKey(param))
                {
                    equipment.Parameters[param] *= (1 + deviation);
                }
            }

            equipment.Status = EquipmentStatus.Fault;

            session.ActiveFaults.Add(faultInstance);
            session.LastUpdateTime = DateTime.Now;

            return faultInstance;
        }

        public void ResolveFault(string simulationId, string faultInstanceId, string resolvedBy)
        {
            if (!_serverState.ActiveSessions.TryGetValue(simulationId, out var session))
            {
                return;
            }

            var fault = session.ActiveFaults.FirstOrDefault(f => f.Id == faultInstanceId);
            if (fault == null) return;

            fault.Status = FaultStatus.Resolved;
            fault.ResolvedTime = DateTime.Now;
            fault.ResolvedBy = resolvedBy;

            session.ActiveFaults.Remove(fault);
            session.ResolvedFaults.Add(fault);

            if (session.EquipmentState.TryGetValue(fault.EquipmentId, out var equipment))
            {
                var hasOtherFaults = session.ActiveFaults.Any(f => f.EquipmentId == fault.EquipmentId);
                if (!hasOtherFaults)
                {
                    equipment.Status = EquipmentStatus.Running;
                }
            }

            session.LastUpdateTime = DateTime.Now;
        }

        public void UpdateEquipmentState(string simulationId, EquipmentModel equipment)
        {
            if (!_serverState.ActiveSessions.TryGetValue(simulationId, out var session))
            {
                return;
            }

            session.EquipmentState[equipment.Id] = equipment;
            session.LastUpdateTime = DateTime.Now;
        }

        public void UpdateEquipmentParameter(string simulationId, string equipmentId, string paramName, double value)
        {
            if (!_serverState.ActiveSessions.TryGetValue(simulationId, out var session))
            {
                return;
            }

            if (session.EquipmentState.TryGetValue(equipmentId, out var equipment))
            {
                equipment.Parameters[paramName] = value;
                equipment.LastUpdateTime = DateTime.Now;
                session.LastUpdateTime = DateTime.Now;
            }
        }

        private void SimulationLoop()
        {
            while (_isRunning)
            {
                try
                {
                    Thread.Sleep(1000);

                    List<SimulationSession> activeSessions;
                    lock (_serverState.ActiveSessions)
                    {
                        activeSessions = _serverState.ActiveSessions.Values.Where(s => s.IsActive).ToList();
                    }

                    foreach (var session in activeSessions)
                    {
                        UpdateSimulation(session);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"模拟循环错误: {ex.Message}");
                }
            }
        }

        private void UpdateSimulation(SimulationSession session)
        {
            var deltaTime = (DateTime.Now - session.LastUpdateTime).TotalSeconds * session.SimulationSpeed;
            session.LastUpdateTime = DateTime.Now;

            foreach (var equipment in session.EquipmentState.Values)
            {
                if (equipment.Status != EquipmentStatus.Running && equipment.Status != EquipmentStatus.Warning)
                {
                    continue;
                }

                foreach (var param in equipment.Parameters.Keys.ToList())
                {
                    var noise = (_random.NextDouble() - 0.5) * 0.02;
                    equipment.Parameters[param] *= (1 + noise);
                }

                equipment.LastUpdateTime = DateTime.Now;

                if (_random.NextDouble() < 0.01)
                {
                    var hasActiveFault = session.ActiveFaults.Any(f => f.EquipmentId == equipment.Id);
                    if (!hasActiveFault)
                    {
                        var availableFaults = _serverState.FaultDefinitions.Values
                            .Where(f => f.ApplicableEquipmentType == equipment.Type)
                            .ToList();

                        if (availableFaults.Count > 0)
                        {
                            var faultDef = availableFaults[_random.Next(availableFaults.Count)];
                            InjectFault(session.Id, equipment.Id, faultDef.FaultCode, 0);

                            var fault = session.ActiveFaults.LastOrDefault();
                            if (fault != null)
                            {
                                var notifyMsg = new NetworkMessage(MessageType.FaultOccurredNotify, JsonHelper.Serialize(fault));
                                _networkServer.BroadcastToSimulation(session.Id, notifyMsg);
                            }
                        }
                    }
                }
            }

            var syncData = new
            {
                Timestamp = TimestampHelper.GetCurrentTimestamp(),
                Equipment = session.EquipmentState.Values.ToList(),
                ActiveFaults = session.ActiveFaults.ToList()
            };

            var syncMsg = new NetworkMessage(MessageType.SimulationSyncNotify, JsonHelper.Serialize(syncData));
            _networkServer.BroadcastToSimulation(session.Id, syncMsg);
        }

        public void Stop()
        {
            _isRunning = false;
            _simulationThread?.Join(1000);
        }
    }
}
