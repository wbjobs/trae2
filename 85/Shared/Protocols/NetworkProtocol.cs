using System;

namespace IndustrialSimulation.Shared.Protocols
{
    public enum MessageType
    {
        Heartbeat,
        ConnectRequest,
        ConnectResponse,
        DisconnectNotify,
        EquipmentStatusUpdate,
        EquipmentStatusNotify,
        FaultInjectRequest,
        FaultInjectResponse,
        FaultOccurredNotify,
        FaultResolveRequest,
        FaultResolveResponse,
        SimulationStartRequest,
        SimulationStartResponse,
        SimulationStopRequest,
        SimulationStopResponse,
        SimulationSyncNotify,
        PlayerJoinNotify,
        PlayerLeaveNotify,
        WorkshopDataRequest,
        WorkshopDataResponse,
        EquipmentListRequest,
        EquipmentListResponse,
        SimulationListRequest,
        SimulationListResponse,
        SimulationRecordRequest,
        SimulationRecordResponse,
        ParameterUpdateRequest,
        ParameterUpdateResponse,
        SimulationJoinRequest,
        SimulationJoinResponse,
        SimulationJoinNotify,
        PlayerListRequest,
        PlayerListResponse,
        EquipmentDependencyUpdate,
        FaultCascadeNotify,
        BatchedMessages,
        MessageAck,
        ErrorResponse
    }

    [Serializable]
    public class NetworkMessage
    {
        public MessageType Type { get; set; }
        public string RequestId { get; set; }
        public string SenderId { get; set; }
        public string TargetId { get; set; }
        public long Timestamp { get; set; }
        public string Payload { get; set; }

        public NetworkMessage()
        {
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            RequestId = Guid.NewGuid().ToString("N");
        }

        public NetworkMessage(MessageType type) : this()
        {
            Type = type;
        }

        public NetworkMessage(MessageType type, string payload) : this(type)
        {
            Payload = payload;
        }
    }

    [Serializable]
    public class ConnectRequest
    {
        public string PlayerId { get; set; }
        public string PlayerName { get; set; }
        public string Version { get; set; }
    }

    [Serializable]
    public class ConnectResponse
    {
        public bool Success { get; set; }
        public string SessionId { get; set; }
        public string Message { get; set; }
        public string[] WorkshopIds { get; set; }
    }

    [Serializable]
    public class PlayerInfo
    {
        public string PlayerId { get; set; }
        public string PlayerName { get; set; }
        public bool IsHost { get; set; }
    }

    [Serializable]
    public class SimulationStartRequest
    {
        public string WorkshopId { get; set; }
        public string SimulationName { get; set; }
        public double SimulationSpeed { get; set; }
        public string[] PredefinedFaults { get; set; }
    }

    [Serializable]
    public class SimulationStartResponse
    {
        public bool Success { get; set; }
        public string SimulationId { get; set; }
        public string Message { get; set; }
    }

    [Serializable]
    public class FaultInjectRequest
    {
        public string SimulationId { get; set; }
        public string EquipmentId { get; set; }
        public string FaultCode { get; set; }
        public double DelaySeconds { get; set; }
    }

    [Serializable]
    public class FaultResolveRequest
    {
        public string SimulationId { get; set; }
        public string FaultInstanceId { get; set; }
        public string ResolutionMethod { get; set; }
    }

    [Serializable]
    public class EquipmentParameterUpdate
    {
        public string EquipmentId { get; set; }
        public string ParameterName { get; set; }
        public double Value { get; set; }
    }

    [Serializable]
    public class ErrorResponse
    {
        public int ErrorCode { get; set; }
        public string ErrorMessage { get; set; }
        public string OriginalRequestId { get; set; }
    }
}
