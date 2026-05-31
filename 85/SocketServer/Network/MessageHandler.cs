using System;
using System.Collections.Generic;
using System.Linq;
using IndustrialSimulation.Server.Core;
using IndustrialSimulation.Server.Simulation;
using IndustrialSimulation.Shared.Models;
using IndustrialSimulation.Shared.Protocols;
using IndustrialSimulation.Shared.Utils;

namespace IndustrialSimulation.Server.Network
{
    public class MessageHandler
    {
        private readonly ServerState _serverState;
        private readonly NetworkServer _networkServer;
        private readonly SimulationEngine _simulationEngine;
        private readonly SessionManager _sessionManager;

        public MessageHandler(ServerState serverState, NetworkServer networkServer)
        {
            _serverState = serverState;
            _networkServer = networkServer;
            _simulationEngine = new SimulationEngine(serverState, networkServer);
            _sessionManager = new SessionManager(serverState, networkServer);
        }

        public void HandleMessage(ClientSession client, NetworkMessage message)
        {
            client.LastHeartbeatTime = DateTime.Now;

            switch (message.Type)
            {
                case MessageType.ConnectRequest:
                    HandleConnectRequest(client, message);
                    break;
                case MessageType.Heartbeat:
                    break;
                case MessageType.SimulationStartRequest:
                    HandleSimulationStartRequest(client, message);
                    break;
                case MessageType.SimulationStopRequest:
                    HandleSimulationStopRequest(client, message);
                    break;
                case MessageType.FaultInjectRequest:
                    HandleFaultInjectRequest(client, message);
                    break;
                case MessageType.FaultResolveRequest:
                    HandleFaultResolveRequest(client, message);
                    break;
                case MessageType.EquipmentStatusUpdate:
                    HandleEquipmentStatusUpdate(client, message);
                    break;
                case MessageType.ParameterUpdateRequest:
                    HandleParameterUpdateRequest(client, message);
                    break;
                case MessageType.WorkshopDataRequest:
                    HandleWorkshopDataRequest(client);
                    break;
                case MessageType.EquipmentListRequest:
                    HandleEquipmentListRequest(client, message);
                    break;
                case MessageType.SimulationListRequest:
                    HandleSimulationListRequest(client);
                    break;
                case MessageType.SimulationJoinRequest:
                    HandleSimulationJoinRequest(client, message);
                    break;
                case MessageType.PlayerListRequest:
                    HandlePlayerListRequest(client);
                    break;
            }
        }

        private void HandleConnectRequest(ClientSession client, NetworkMessage message)
        {
            var request = JsonHelper.Deserialize<ConnectRequest>(message.Payload);
            if (request == null)
            {
                SendErrorResponse(client, message.RequestId, 400, "无效的连接请求");
                return;
            }

            client.PlayerId = request.PlayerId;
            client.PlayerName = request.PlayerName;

            var response = new ConnectResponse
            {
                Success = true,
                SessionId = client.SessionId,
                Message = "连接成功",
                WorkshopIds = _serverState.Workshops.Select(w => w.Id).ToArray()
            };

            var responseMsg = new NetworkMessage(MessageType.ConnectResponse, JsonHelper.Serialize(response))
            {
                RequestId = message.RequestId
            };

            _networkServer.SendMessage(client, responseMsg);
            Console.WriteLine($"玩家已连接: {request.PlayerName} ({request.PlayerId})");
        }

        private void HandleSimulationStartRequest(ClientSession client, NetworkMessage message)
        {
            var request = JsonHelper.Deserialize<SimulationStartRequest>(message.Payload);
            if (request == null)
            {
                SendErrorResponse(client, message.RequestId, 400, "无效的请求");
                return;
            }

            var session = _simulationEngine.CreateSimulation(client, request);
            if (session == null)
            {
                SendErrorResponse(client, message.RequestId, 500, "创建推演失败");
                return;
            }

            client.CurrentSimulationId = session.Id;
            client.IsHost = true;

            var response = new SimulationStartResponse
            {
                Success = true,
                SimulationId = session.Id,
                Message = "推演已开始"
            };

            var responseMsg = new NetworkMessage(MessageType.SimulationStartResponse, JsonHelper.Serialize(response))
            {
                RequestId = message.RequestId
            };

            _networkServer.SendMessage(client, responseMsg);
            Console.WriteLine($"推演已创建: {session.Name} by {client.PlayerName}");
        }

        private void HandleSimulationStopRequest(ClientSession client, NetworkMessage message)
        {
            var simulationId = message.Payload;
            if (string.IsNullOrEmpty(simulationId))
            {
                SendErrorResponse(client, message.RequestId, 400, "无效的推演ID");
                return;
            }

            if (!client.IsHost || client.CurrentSimulationId != simulationId)
            {
                SendErrorResponse(client, message.RequestId, 403, "无权限停止推演");
                return;
            }

            _simulationEngine.StopSimulation(simulationId);

            var responseMsg = new NetworkMessage(MessageType.SimulationStopResponse)
            {
                RequestId = message.RequestId
            };

            _networkServer.SendMessage(client, responseMsg);
            Console.WriteLine($"推演已停止: {simulationId}");
        }

        private void HandleFaultInjectRequest(ClientSession client, NetworkMessage message)
        {
            var request = JsonHelper.Deserialize<FaultInjectRequest>(message.Payload);
            if (request == null)
            {
                SendErrorResponse(client, message.RequestId, 400, "无效的请求");
                return;
            }

            var fault = _simulationEngine.InjectFault(request.SimulationId, request.EquipmentId, request.FaultCode, request.DelaySeconds);
            if (fault == null)
            {
                SendErrorResponse(client, message.RequestId, 500, "注入故障失败");
                return;
            }

            var responseMsg = new NetworkMessage(MessageType.FaultInjectResponse, JsonHelper.Serialize(fault))
            {
                RequestId = message.RequestId
            };

            _networkServer.SendMessage(client, responseMsg);

            var notifyMsg = new NetworkMessage(MessageType.FaultOccurredNotify, JsonHelper.Serialize(fault));
            _networkServer.BroadcastToSimulation(request.SimulationId, notifyMsg, client.SessionId);

            Console.WriteLine($"故障已注入: {request.FaultCode} -> {request.EquipmentId}");
        }

        private void HandleFaultResolveRequest(ClientSession client, NetworkMessage message)
        {
            var request = JsonHelper.Deserialize<FaultResolveRequest>(message.Payload);
            if (request == null)
            {
                SendErrorResponse(client, message.RequestId, 400, "无效的请求");
                return;
            }

            _simulationEngine.ResolveFault(request.SimulationId, request.FaultInstanceId, client.PlayerId);

            var responseMsg = new NetworkMessage(MessageType.FaultResolveResponse)
            {
                RequestId = message.RequestId
            };

            _networkServer.SendMessage(client, responseMsg);

            var notifyMsg = new NetworkMessage(MessageType.FaultResolveResponse, request.FaultInstanceId);
            _networkServer.BroadcastToSimulation(request.SimulationId, notifyMsg, client.SessionId);
        }

        private void HandleEquipmentStatusUpdate(ClientSession client, NetworkMessage message)
        {
            var equipment = JsonHelper.Deserialize<EquipmentModel>(message.Payload);
            if (equipment == null || string.IsNullOrEmpty(client.CurrentSimulationId))
            {
                return;
            }

            _simulationEngine.UpdateEquipmentState(client.CurrentSimulationId, equipment);

            var notifyMsg = new NetworkMessage(MessageType.EquipmentStatusNotify, message.Payload);
            _networkServer.BroadcastToSimulation(client.CurrentSimulationId, notifyMsg, client.SessionId);
        }

        private void HandleParameterUpdateRequest(ClientSession client, NetworkMessage message)
        {
            var update = JsonHelper.Deserialize<EquipmentParameterUpdate>(message.Payload);
            if (update == null || string.IsNullOrEmpty(client.CurrentSimulationId))
            {
                SendErrorResponse(client, message.RequestId, 400, "无效的请求");
                return;
            }

            _simulationEngine.UpdateEquipmentParameter(client.CurrentSimulationId, update.EquipmentId, update.ParameterName, update.Value);

            var responseMsg = new NetworkMessage(MessageType.ParameterUpdateResponse)
            {
                RequestId = message.RequestId
            };

            _networkServer.SendMessage(client, responseMsg);

            var notifyMsg = new NetworkMessage(MessageType.EquipmentStatusNotify, JsonHelper.Serialize(update));
            _networkServer.BroadcastToSimulation(client.CurrentSimulationId, notifyMsg, client.SessionId);
        }

        private void HandleWorkshopDataRequest(ClientSession client)
        {
            var response = new NetworkMessage(MessageType.WorkshopDataResponse, JsonHelper.Serialize(_serverState.Workshops));
            _networkServer.SendMessage(client, response);
        }

        private void HandleEquipmentListRequest(ClientSession client, NetworkMessage message)
        {
            var workshopId = message.Payload;
            var equipment = _serverState.Equipment.Values
                .Where(e => e.WorkshopId == workshopId)
                .ToList();

            var response = new NetworkMessage(MessageType.EquipmentListResponse, JsonHelper.Serialize(equipment))
            {
                RequestId = message.RequestId
            };

            _networkServer.SendMessage(client, response);
        }

        private void HandleSimulationListRequest(ClientSession client)
        {
            var sessions = new List<object>();
            lock (_serverState.ActiveSessions)
            {
                foreach (var session in _serverState.ActiveSessions.Values.Where(s => s.IsActive))
                {
                    sessions.Add(new
                    {
                        session.Id,
                        session.Name,
                        session.HostId,
                        ParticipantCount = session.ParticipantIds.Count,
                        session.StartTime,
                        session.SimulationSpeed
                    });
                }
            }

            var response = new NetworkMessage(MessageType.SimulationListResponse, JsonHelper.Serialize(sessions));
            _networkServer.SendMessage(client, response);
        }

        private void SendErrorResponse(ClientSession client, string requestId, int errorCode, string errorMessage)
        {
            var error = new ErrorResponse
            {
                ErrorCode = errorCode,
                ErrorMessage = errorMessage,
                OriginalRequestId = requestId
            };

            var msg = new NetworkMessage(MessageType.ErrorResponse, JsonHelper.Serialize(error));
            _networkServer.SendMessage(client, msg);
        }

        private void HandleSimulationJoinRequest(ClientSession client, NetworkMessage message)
        {
            var request = JsonHelper.Deserialize<SimulationJoinRequest>(message.Payload);
            if (request == null)
            {
                SendErrorResponse(client, message.RequestId, 400, "无效的加入请求");
                return;
            }

            var success = _sessionManager.JoinSession(request.SimulationId, client);

            var response = new SimulationStartResponse
            {
                Success = success,
                SimulationId = request.SimulationId,
                Message = success ? "加入推演成功" : "加入推演失败"
            };

            var responseMsg = new NetworkMessage(MessageType.SimulationJoinResponse, JsonHelper.Serialize(response))
            {
                RequestId = message.RequestId
            };

            _networkServer.SendMessage(client, responseMsg);

            if (success)
            {
                Console.WriteLine($"玩家 {client.PlayerName} 加入推演: {request.SimulationId}");
            }
        }

        private void HandlePlayerListRequest(ClientSession client)
        {
            var players = new List<PlayerInfo>();
            lock (_serverState.ConnectedClients)
            {
                foreach (var c in _serverState.ConnectedClients.Values)
                {
                    players.Add(new PlayerInfo
                    {
                        PlayerId = c.PlayerId,
                        PlayerName = c.PlayerName ?? "未命名",
                        IsHost = c.IsHost
                    });
                }
            }

            var response = new NetworkMessage(MessageType.PlayerListResponse, JsonHelper.Serialize(players));
            _networkServer.SendMessage(client, response);
        }
    }

    [Serializable]
    public class SimulationJoinRequest
    {
        public string SimulationId { get; set; }
        public string PlayerId { get; set; }
        public string PlayerName { get; set; }
    }
}
