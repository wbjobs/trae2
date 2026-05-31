using System;
using System.Collections.Generic;
using IndustrialSimulation.Shared.Models;

namespace IndustrialSimulation.Server.Core
{
    public static class ServerConfig
    {
        public const int DefaultPort = 8888;
        public const int MaxConnections = 100;
        public const int HeartbeatInterval = 30000;
        public const int ConnectionTimeout = 60000;
    }

    public class ServerState
    {
        public Dictionary<string, SimulationSession> ActiveSessions { get; } = new Dictionary<string, SimulationSession>();
        public Dictionary<string, ClientSession> ConnectedClients { get; } = new Dictionary<string, ClientSession>();
        public List<WorkshopModel> Workshops { get; } = new List<WorkshopModel>();
        public Dictionary<string, EquipmentModel> Equipment { get; } = new Dictionary<string, EquipmentModel>();
        public Dictionary<string, FaultDefinition> FaultDefinitions { get; } = new Dictionary<string, FaultDefinition>();
    }

    public class SimulationSession
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string WorkshopId { get; set; }
        public string HostId { get; set; }
        public List<string> ParticipantIds { get; } = new List<string>();
        public Dictionary<string, EquipmentModel> EquipmentState { get; } = new Dictionary<string, EquipmentModel>();
        public List<FaultInstance> ActiveFaults { get; } = new List<FaultInstance>();
        public List<FaultInstance> ResolvedFaults { get; } = new List<FaultInstance>();
        public List<string> PendingFaultCodes { get; } = new List<string>();
        public DateTime StartTime { get; set; }
        public DateTime? EndTime { get; set; }
        public bool IsActive { get; set; }
        public double SimulationSpeed { get; set; } = 1.0;
        public DateTime LastUpdateTime { get; set; }
    }

    public class ClientSession
    {
        public string SessionId { get; set; }
        public string PlayerId { get; set; }
        public string PlayerName { get; set; }
        public System.Net.Sockets.TcpClient TcpClient { get; set; }
        public NetworkStream Stream { get; set; }
        public string CurrentSimulationId { get; set; }
        public bool IsHost { get; set; }
        public DateTime LastHeartbeatTime { get; set; }
        public DateTime ConnectedTime { get; set; }
    }
}
