using System;
using System.Collections.Generic;
using IndustrialSimulation.Server.Core;
using IndustrialSimulation.Server.Network;
using IndustrialSimulation.Shared.Models;
using IndustrialSimulation.Shared.Protocols;
using IndustrialSimulation.Shared.Utils;

namespace IndustrialSimulation.Server.Simulation
{
    public class SessionManager
    {
        private readonly ServerState _serverState;
        private readonly NetworkServer _networkServer;

        public SessionManager(ServerState serverState, NetworkServer networkServer)
        {
            _serverState = serverState;
            _networkServer = networkServer;
        }

        public SimulationSession CreateSession(ClientSession host, SimulationStartRequest request)
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

            if (request.PredefinedFaults != null)
            {
                foreach (var faultCode in request.PredefinedFaults)
                {
                    session.PendingFaultCodes.Add(faultCode);
                }
            }

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

            ServerDatabase.Instance?.SaveSession(session);

            return session;
        }

        public bool JoinSession(string simulationId, ClientSession client)
        {
            SimulationSession session;
            lock (_serverState.ActiveSessions)
            {
                if (!_serverState.ActiveSessions.TryGetValue(simulationId, out session))
                    return false;
            }

            if (!session.IsActive) return false;

            lock (session)
            {
                if (session.ParticipantIds.Contains(client.PlayerId)) return true;

                session.ParticipantIds.Add(client.PlayerId);
                client.CurrentSimulationId = simulationId;
            }

            var joinNotify = new NetworkMessage(MessageType.SimulationJoinNotify,
                JsonHelper.Serialize(new { PlayerId = client.PlayerId, PlayerName = client.PlayerName }));
            _networkServer.BroadcastToSimulation(simulationId, joinNotify, client.SessionId);

            var syncMsg = BuildSessionSyncMessage(session);
            _networkServer.SendMessage(client, syncMsg);

            ServerDatabase.Instance?.UpdateSession(session);

            return true;
        }

        public void LeaveSession(ClientSession client)
        {
            if (string.IsNullOrEmpty(client.CurrentSimulationId)) return;

            SimulationSession session;
            lock (_serverState.ActiveSessions)
            {
                if (!_serverState.ActiveSessions.TryGetValue(client.CurrentSimulationId, out session))
                    return;
            }

            lock (session)
            {
                session.ParticipantIds.Remove(client.PlayerId);

                if (client.IsHost)
                {
                    if (session.ParticipantIds.Count > 0)
                    {
                        var newHostId = session.ParticipantIds[0];
                        session.HostId = newHostId;

                        var newHostClient = FindClientByPlayerId(newHostId);
                        if (newHostClient != null) newHostClient.IsHost = true;
                    }
                }

                if (session.ParticipantIds.Count == 0)
                {
                    session.IsActive = false;
                    session.EndTime = DateTime.Now;
                    SaveSessionSnapshot(session);
                }
            }

            var leaveNotify = new NetworkMessage(MessageType.PlayerLeaveNotify, client.PlayerId);
            _networkServer.BroadcastToSimulation(client.CurrentSimulationId, leaveNotify);

            client.CurrentSimulationId = null;
            client.IsHost = false;

            ServerDatabase.Instance?.UpdateSession(session);
        }

        public void StopSession(string simulationId, string requesterId)
        {
            SimulationSession session;
            lock (_serverState.ActiveSessions)
            {
                if (!_serverState.ActiveSessions.TryGetValue(simulationId, out session))
                    return;
            }

            session.IsActive = false;
            session.EndTime = DateTime.Now;

            SaveSessionSnapshot(session);

            var stopNotify = new NetworkMessage(MessageType.SimulationStopResponse);
            _networkServer.BroadcastToSimulation(simulationId, stopNotify);

            ServerDatabase.Instance?.UpdateSession(session);
        }

        public List<object> GetActiveSessionsList()
        {
            var result = new List<object>();
            lock (_serverState.ActiveSessions)
            {
                foreach (var session in _serverState.ActiveSessions.Values)
                {
                    if (!session.IsActive) continue;
                    result.Add(new
                    {
                        session.Id,
                        session.Name,
                        session.HostId,
                        ParticipantCount = session.ParticipantIds.Count,
                        session.StartTime,
                        session.SimulationSpeed,
                        session.WorkshopId,
                        ActiveFaultCount = session.ActiveFaults.Count
                    });
                }
            }
            return result;
        }

        private void SaveSessionSnapshot(SimulationSession session)
        {
            var snapshot = new SessionSnapshot
            {
                SessionId = session.Id,
                Timestamp = DateTime.Now,
                EquipmentStates = new Dictionary<string, string>(),
                ActiveFaults = new List<string>(),
                ResolvedFaults = new List<string>()
            };

            foreach (var eq in session.EquipmentState.Values)
            {
                snapshot.EquipmentStates[eq.Id] = JsonHelper.Serialize(eq);
            }

            foreach (var fault in session.ActiveFaults)
            {
                snapshot.ActiveFaults.Add(JsonHelper.Serialize(fault));
            }

            foreach (var fault in session.ResolvedFaults)
            {
                snapshot.ResolvedFaults.Add(JsonHelper.Serialize(fault));
            }

            ServerDatabase.Instance?.SaveSnapshot(snapshot);
        }

        private NetworkMessage BuildSessionSyncMessage(SimulationSession session)
        {
            var syncData = new
            {
                session.Id,
                session.Name,
                session.WorkshopId,
                session.HostId,
                session.SimulationSpeed,
                Equipment = session.EquipmentState.Values,
                ActiveFaults = session.ActiveFaults,
                Participants = session.ParticipantIds
            };

            return new NetworkMessage(MessageType.SimulationSyncNotify, JsonHelper.Serialize(syncData));
        }

        private ClientSession FindClientByPlayerId(string playerId)
        {
            lock (_serverState.ConnectedClients)
            {
                foreach (var client in _serverState.ConnectedClients.Values)
                {
                    if (client.PlayerId == playerId) return client;
                }
            }
            return null;
        }
    }

    public class SessionSnapshot
    {
        public string SessionId;
        public DateTime Timestamp;
        public Dictionary<string, string> EquipmentStates;
        public List<string> ActiveFaults;
        public List<string> ResolvedFaults;
    }

    public static class EnumerableExtensions
    {
        public static IEnumerable<T> Where<T>(this IEnumerable<T> source, Func<T, bool> predicate)
        {
            foreach (var item in source)
            {
                if (predicate(item)) yield return item;
            }
        }
    }
}
