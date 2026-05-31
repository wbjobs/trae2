using System;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using IndustrialSimulation.Shared.Protocols;
using IndustrialSimulation.Shared.Utils;
using UnityEngine;

namespace IndustrialSimulation.Network
{
    public class NetworkClient : MonoBehaviour
    {
        private static NetworkClient _instance;
        public static NetworkClient Instance => _instance;

        private TcpClient _client;
        private NetworkStream _stream;
        private Thread _receiveThread;
        private bool _isRunning;

        public string ServerAddress = "127.0.0.1";
        public int ServerPort = 8888;
        public string PlayerId { get; private set; }
        public string SessionId { get; private set; }
        public bool IsConnected => _client != null && _client.Connected;

        private readonly Queue<NetworkMessage> _messageQueue = new Queue<NetworkMessage>();
        private readonly object _queueLock = new object();

        public delegate void MessageHandler(NetworkMessage message);
        private readonly Dictionary<MessageType, List<MessageHandler>> _messageHandlers = new Dictionary<MessageType, List<MessageHandler>>();

        public event Action OnConnected;
        public event Action OnDisconnected;
        public event Action<string> OnError;

        private void Awake()
        {
            if (_instance == null)
            {
                _instance = this;
                DontDestroyOnLoad(gameObject);
                PlayerId = IdGenerator.GenerateId();
            }
            else
            {
                Destroy(gameObject);
            }
        }

        public bool Connect(string address, int port)
        {
            try
            {
                ServerAddress = address;
                ServerPort = port;
                _client = new TcpClient();
                _client.Connect(address, port);
                _stream = _client.GetStream();
                _isRunning = true;

                _receiveThread = new Thread(ReceiveLoop)
                {
                    IsBackground = true
                };
                _receiveThread.Start();

                Debug.Log($"连接到服务器 {address}:{port}");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"连接失败: {ex.Message}");
                OnError?.Invoke(ex.Message);
                return false;
            }
        }

        public void Disconnect()
        {
            try
            {
                _isRunning = false;
                _receiveThread?.Join(1000);
                _stream?.Close();
                _client?.Close();
                SessionId = null;
                OnDisconnected?.Invoke();
                Debug.Log("已断开连接");
            }
            catch (Exception ex)
            {
                Debug.LogError($"断开连接失败: {ex.Message}");
            }
        }

        private void ReceiveLoop()
        {
            var buffer = new byte[4096];
            var messageBuffer = new StringBuilder();

            while (_isRunning && _client.Connected)
            {
                try
                {
                    var bytesRead = _stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead == 0)
                    {
                        break;
                    }

                    messageBuffer.Append(Encoding.UTF8.GetString(buffer, 0, bytesRead));

                    string messageText;
                    while ((messageText = ExtractMessage(messageBuffer)) != null)
                    {
                        var message = JsonHelper.Deserialize<NetworkMessage>(messageText);
                        if (message != null)
                        {
                            lock (_queueLock)
                            {
                                _messageQueue.Enqueue(message);
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    if (_isRunning)
                    {
                        Debug.LogError($"接收消息失败: {ex.Message}");
                    }
                    break;
                }
            }

            if (_isRunning)
            {
                UnityMainThreadDispatcher.Instance().Enqueue(() =>
                {
                    OnDisconnected?.Invoke();
                });
            }
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

        public void SendMessage(NetworkMessage message)
        {
            if (!IsConnected)
            {
                Debug.LogWarning("未连接到服务器");
                return;
            }

            try
            {
                message.SenderId = PlayerId;
                var json = JsonHelper.Serialize(message) + "\n";
                var data = Encoding.UTF8.GetBytes(json);
                _stream.Write(data, 0, data.Length);
                _stream.Flush();
            }
            catch (Exception ex)
            {
                Debug.LogError($"发送消息失败: {ex.Message}");
            }
        }

        public void RegisterHandler(MessageType type, MessageHandler handler)
        {
            if (!_messageHandlers.ContainsKey(type))
            {
                _messageHandlers[type] = new List<MessageHandler>();
            }
            _messageHandlers[type].Add(handler);
        }

        public void UnregisterHandler(MessageType type, MessageHandler handler)
        {
            if (_messageHandlers.ContainsKey(type))
            {
                _messageHandlers[type].Remove(handler);
            }
        }

        private void Update()
        {
            ProcessMessageQueue();
        }

        private void ProcessMessageQueue()
        {
            while (true)
            {
                NetworkMessage message = null;
                lock (_queueLock)
                {
                    if (_messageQueue.Count > 0)
                    {
                        message = _messageQueue.Dequeue();
                    }
                }

                if (message == null) break;

                ProcessMessage(message);
            }
        }

        private void ProcessMessage(NetworkMessage message)
        {
            switch (message.Type)
            {
                case MessageType.ConnectResponse:
                    HandleConnectResponse(message);
                    break;
                case MessageType.Heartbeat:
                    SendMessage(new NetworkMessage(MessageType.Heartbeat));
                    break;
            }

            if (_messageHandlers.TryGetValue(message.Type, out var handlers))
            {
                foreach (var handler in handlers)
                {
                    handler?.Invoke(message);
                }
            }
        }

        private void HandleConnectResponse(NetworkMessage message)
        {
            var response = JsonHelper.Deserialize<ConnectResponse>(message.Payload);
            if (response != null && response.Success)
            {
                SessionId = response.SessionId;
                OnConnected?.Invoke();
                Debug.Log($"连接成功，会话ID: {SessionId}");
            }
            else
            {
                OnError?.Invoke(response?.Message ?? "连接失败");
                Disconnect();
            }
        }

        public void SendConnectRequest(string playerName)
        {
            var request = new ConnectRequest
            {
                PlayerId = PlayerId,
                PlayerName = playerName,
                Version = "1.0.0"
            };

            SendMessage(new NetworkMessage(MessageType.ConnectRequest, JsonHelper.Serialize(request)));
        }

        public void SendSimulationStartRequest(string workshopId, string simulationName, double speed = 1.0)
        {
            var request = new SimulationStartRequest
            {
                WorkshopId = workshopId,
                SimulationName = simulationName,
                SimulationSpeed = speed
            };

            SendMessage(new NetworkMessage(MessageType.SimulationStartRequest, JsonHelper.Serialize(request)));
        }

        public void SendSimulationStopRequest(string simulationId)
        {
            SendMessage(new NetworkMessage(MessageType.SimulationStopRequest, simulationId));
        }

        public void SendFaultInjectRequest(string simulationId, string equipmentId, string faultCode, double delay = 0)
        {
            var request = new FaultInjectRequest
            {
                SimulationId = simulationId,
                EquipmentId = equipmentId,
                FaultCode = faultCode,
                DelaySeconds = delay
            };

            SendMessage(new NetworkMessage(MessageType.FaultInjectRequest, JsonHelper.Serialize(request)));
        }

        public void SendFaultResolveRequest(string simulationId, string faultInstanceId, string method)
        {
            var request = new FaultResolveRequest
            {
                SimulationId = simulationId,
                FaultInstanceId = faultInstanceId,
                ResolutionMethod = method
            };

            SendMessage(new NetworkMessage(MessageType.FaultResolveRequest, JsonHelper.Serialize(request)));
        }

        public void SendEquipmentListRequest()
        {
            SendMessage(new NetworkMessage(MessageType.EquipmentListRequest));
        }

        public void SendWorkshopDataRequest()
        {
            SendMessage(new NetworkMessage(MessageType.WorkshopDataRequest));
        }

        private void OnDestroy()
        {
            Disconnect();
        }
    }
}
