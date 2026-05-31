using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using IndustrialSimulation.Server.Core;
using IndustrialSimulation.Shared.Protocols;
using IndustrialSimulation.Shared.Utils;

namespace IndustrialSimulation.Server.Network
{
    public class NetworkServer
    {
        private readonly TcpListener _listener;
        private readonly ServerState _serverState;
        private readonly MessageHandler _messageHandler;
        private Thread _listenThread;
        private Thread _maintenanceThread;
        private bool _isRunning;

        public int Port { get; }
        public bool IsRunning => _isRunning;

        public event Action<string, ClientSession> OnClientConnected;
        public event Action<string, ClientSession> OnClientDisconnected;
        public event Action<ClientSession, NetworkMessage> OnMessageReceived;

        public NetworkServer(int port, ServerState serverState)
        {
            Port = port;
            _serverState = serverState;
            _messageHandler = new MessageHandler(serverState, this);
            _listener = new TcpListener(IPAddress.Any, port);
        }

        public void Start()
        {
            if (_isRunning) return;

            _listener.Start();
            _isRunning = true;

            _listenThread = new Thread(ListenForClients) { IsBackground = true };
            _listenThread.Start();

            _maintenanceThread = new Thread(MaintenanceLoop) { IsBackground = true };
            _maintenanceThread.Start();

            Console.WriteLine($"服务器已启动，监听端口: {Port}");
        }

        public void Stop()
        {
            _isRunning = false;
            _listener.Stop();

            lock (_serverState.ConnectedClients)
            {
                foreach (var client in _serverState.ConnectedClients.Values)
                {
                    try
                    {
                        client.TcpClient.Close();
                    }
                    catch { /* ignore */ }
                }
                _serverState.ConnectedClients.Clear();
            }

            Console.WriteLine("服务器已停止");
        }

        private void ListenForClients()
        {
            while (_isRunning)
            {
                try
                {
                    var tcpClient = _listener.AcceptTcpClient();

                    if (_serverState.ConnectedClients.Count >= ServerConfig.MaxConnections)
                    {
                        Console.WriteLine("连接数已达上限，拒绝新连接");
                        tcpClient.Close();
                        continue;
                    }

                    var clientSession = new ClientSession
                    {
                        SessionId = IdGenerator.GenerateId(),
                        TcpClient = tcpClient,
                        Stream = tcpClient.GetStream(),
                        ConnectedTime = DateTime.Now,
                        LastHeartbeatTime = DateTime.Now
                    };

                    lock (_serverState.ConnectedClients)
                    {
                        _serverState.ConnectedClients[clientSession.SessionId] = clientSession;
                    }

                    var clientThread = new Thread(HandleClient)
                    {
                        IsBackground = true
                    };
                    clientThread.Start(clientSession);

                    OnClientConnected?.Invoke(clientSession.SessionId, clientSession);
                    Console.WriteLine($"新客户端连接: {clientSession.SessionId}");
                }
                catch (SocketException) when (!_isRunning)
                {
                    break;
                }
                catch (Exception ex)
                {
                    if (_isRunning)
                    {
                        Console.WriteLine($"接受客户端连接失败: {ex.Message}");
                    }
                }
            }
        }

        private void HandleClient(object state)
        {
            var clientSession = (ClientSession)state;
            var buffer = new byte[8192];
            var messageBuffer = new StringBuilder();

            while (_isRunning && clientSession.TcpClient.Connected)
            {
                try
                {
                    var bytesRead = clientSession.Stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead == 0) break;

                    messageBuffer.Append(Encoding.UTF8.GetString(buffer, 0, bytesRead));

                    string messageText;
                    while ((messageText = ExtractMessage(messageBuffer)) != null)
                    {
                        var message = JsonHelper.Deserialize<NetworkMessage>(messageText);
                        if (message != null)
                        {
                            _messageHandler.HandleMessage(clientSession, message);
                            OnMessageReceived?.Invoke(clientSession, message);
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"处理客户端消息失败: {ex.Message}");
                    break;
                }
            }

            DisconnectClient(clientSession.SessionId);
        }

        private string ExtractMessage(StringBuilder buffer)
        {
            var content = buffer.ToString();
            var separatorIndex = content.IndexOf("\n", StringComparison.Ordinal);

            if (separatorIndex >= 0)
            {
                var message = content.Substring(0, separatorIndex);
                buffer.Remove(0, separatorIndex + 1);
                return message;
            }

            return null;
        }

        public void SendMessage(ClientSession client, NetworkMessage message)
        {
            if (!client.TcpClient.Connected) return;

            try
            {
                var json = JsonHelper.Serialize(message) + "\n";
                var data = Encoding.UTF8.GetBytes(json);
                client.Stream.Write(data, 0, data.Length);
                client.Stream.Flush();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"发送消息失败: {ex.Message}");
                DisconnectClient(client.SessionId);
            }
        }

        public void BroadcastMessage(NetworkMessage message, string excludeSessionId = null)
        {
            List<ClientSession> clients;
            lock (_serverState.ConnectedClients)
            {
                clients = _serverState.ConnectedClients.Values
                    .Where(c => c.SessionId != excludeSessionId)
                    .ToList();
            }

            foreach (var client in clients)
            {
                SendMessage(client, message);
            }
        }

        public void BroadcastToSimulation(string simulationId, NetworkMessage message, string excludeSessionId = null)
        {
            List<ClientSession> clients;
            lock (_serverState.ConnectedClients)
            {
                clients = _serverState.ConnectedClients.Values
                    .Where(c => c.CurrentSimulationId == simulationId && c.SessionId != excludeSessionId)
                    .ToList();
            }

            foreach (var client in clients)
            {
                SendMessage(client, message);
            }
        }

        public void DisconnectClient(string sessionId)
        {
            ClientSession clientSession = null;
            lock (_serverState.ConnectedClients)
            {
                if (_serverState.ConnectedClients.TryGetValue(sessionId, out clientSession))
                {
                    _serverState.ConnectedClients.Remove(sessionId);
                }
            }

            if (clientSession != null)
            {
                try
                {
                    clientSession.TcpClient.Close();
                }
                catch { /* ignore */ }

                if (!string.IsNullOrEmpty(clientSession.CurrentSimulationId))
                {
                    RemoveClientFromSimulation(clientSession);
                }

                OnClientDisconnected?.Invoke(sessionId, clientSession);
                Console.WriteLine($"客户端已断开: {clientSession.PlayerName ?? sessionId}");
            }
        }

        private void RemoveClientFromSimulation(ClientSession client)
        {
            lock (_serverState.ActiveSessions)
            {
                if (_serverState.ActiveSessions.TryGetValue(client.CurrentSimulationId, out var session))
                {
                    session.ParticipantIds.Remove(client.PlayerId);

                    if (client.IsHost && session.ParticipantIds.Count > 0)
                    {
                        var newHost = session.ParticipantIds[0];
                        session.HostId = newHost;
                        var newHostClient = _serverState.ConnectedClients.Values.FirstOrDefault(c => c.PlayerId == newHost);
                        if (newHostClient != null)
                        {
                            newHostClient.IsHost = true;
                        }
                    }

                    if (session.ParticipantIds.Count == 0)
                    {
                        session.IsActive = false;
                        session.EndTime = DateTime.Now;
                    }
                }
            }

            var notifyMsg = new NetworkMessage(MessageType.PlayerLeaveNotify, client.PlayerId);
            BroadcastToSimulation(client.CurrentSimulationId, notifyMsg);
        }

        private void MaintenanceLoop()
        {
            while (_isRunning)
            {
                try
                {
                    Thread.Sleep(ServerConfig.HeartbeatInterval);

                    var now = DateTime.Now;
                    List<ClientSession> clientsToDisconnect;

                    lock (_serverState.ConnectedClients)
                    {
                        clientsToDisconnect = _serverState.ConnectedClients.Values
                            .Where(c => (now - c.LastHeartbeatTime).TotalMilliseconds > ServerConfig.ConnectionTimeout)
                            .ToList();
                    }

                    foreach (var client in clientsToDisconnect)
                    {
                        Console.WriteLine($"客户端超时，断开连接: {client.PlayerId}");
                        DisconnectClient(client.SessionId);
                    }

                    BroadcastMessage(new NetworkMessage(MessageType.Heartbeat));
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"维护任务错误: {ex.Message}");
                }
            }
        }
    }
}
