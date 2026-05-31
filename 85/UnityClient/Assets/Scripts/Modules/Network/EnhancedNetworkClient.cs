using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using IndustrialSimulation.Shared.Protocols;
using IndustrialSimulation.Shared.Utils;
using UnityEngine;

namespace IndustrialSimulation.Network
{
    public class EnhancedNetworkClient : MonoBehaviour
    {
        private static EnhancedNetworkClient _instance;
        public static EnhancedNetworkClient Instance => _instance;

        private TcpClient _client;
        private NetworkStream _stream;
        private Thread _receiveThread;
        private Thread _heartbeatThread;
        private bool _isRunning;

        [Header("连接设置")]
        public string ServerAddress = "127.0.0.1";
        public int ServerPort = 8888;
        public string PlayerId { get; private set; }
        public string PlayerName { get; private set; }
        public string SessionId { get; private set; }
        public bool IsConnected => _client != null && _client.Connected;

        [Header("重连设置")]
        public bool AutoReconnect = true;
        public float ReconnectInterval = 5f;
        public int MaxReconnectAttempts = 5;
        private int _reconnectAttempts;
        private float _lastReconnectTime;
        private bool _isReconnecting;

        [Header("心跳设置")]
        public float HeartbeatInterval = 15f;
        private float _lastHeartbeatSent;

        [Header("消息帧设置")]
        public int MaxMessageSize = 1024 * 1024;

        private readonly Queue<NetworkMessage> _messageQueue = new Queue<NetworkMessage>();
        private readonly object _queueLock = new object();

        private readonly Dictionary<MessageType, List<MessageHandler>> _messageHandlers =
            new Dictionary<MessageType, List<MessageHandler>>();

        public delegate void MessageHandler(NetworkMessage message);

        public event Action OnConnected;
        public event Action OnDisconnected;
        public event Action OnReconnecting;
        public event Action OnReconnectFailed;
        public event Action<string> OnError;

        private readonly List<PlayerNetworkInfo> _knownPlayers = new List<PlayerNetworkInfo>();

        public List<PlayerNetworkInfo> KnownPlayers => new List<PlayerNetworkInfo>(_knownPlayers);

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

        public bool Connect(string address, int port, string playerName = "")
        {
            try
            {
                ServerAddress = address;
                ServerPort = port;
                PlayerName = string.IsNullOrEmpty(playerName) ? $"Player_{PlayerId.Substring(0, 4)}" : playerName;

                _client = new TcpClient();
                _client.NoDelay = true;
                _client.SendTimeout = 5000;
                _client.ReceiveTimeout = 0;
                _client.Connect(address, port);
                _stream = _client.GetStream();
                _isRunning = true;
                _reconnectAttempts = 0;
                _isReconnecting = false;

                _receiveThread = new Thread(ReceiveLoop) { IsBackground = true };
                _receiveThread.Start();

                _heartbeatThread = new Thread(HeartbeatLoop) { IsBackground = true };
                _heartbeatThread.Start();

                _lastHeartbeatSent = Time.time;

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
            _isRunning = false;
            _isReconnecting = false;

            try
            {
                _stream?.Close();
                _client?.Close();
            }
            catch { }

            SessionId = null;
            _knownPlayers.Clear();
            OnDisconnected?.Invoke();
            Debug.Log("已断开连接");
        }

        private void ReceiveLoop()
        {
            while (_isRunning && _client.Connected)
            {
                try
                {
                    var message = ReadMessage();
                    if (message == null)
                    {
                        if (_isRunning)
                        {
                            UnityMainThreadDispatcher.Instance.Enqueue(() =>
                            {
                                HandleDisconnection();
                            });
                        }
                        break;
                    }

                    lock (_queueLock)
                    {
                        _messageQueue.Enqueue(message);
                    }
                }
                catch (Exception ex)
                {
                    if (_isRunning)
                    {
                        Debug.LogError($"接收消息失败: {ex.Message}");
                        UnityMainThreadDispatcher.Instance.Enqueue(() =>
                        {
                            HandleDisconnection();
                        });
                    }
                    break;
                }
            }
        }

        private NetworkMessage ReadMessage()
        {
            var lengthBytes = new byte[4];
            var bytesRead = ReadExact(lengthBytes, 0, 4);
            if (bytesRead < 4) return null;

            var messageLength = BitConverter.ToInt32(lengthBytes, 0);
            if (messageLength <= 0 || messageLength > MaxMessageSize)
            {
                Debug.LogError($"无效消息长度: {messageLength}");
                return null;
            }

            var flagBytes = new byte[1];
            bytesRead = ReadExact(flagBytes, 0, 1);
            if (bytesRead < 1) return null;

            var isCompressed = flagBytes[0] == 1;

            var messageBytes = new byte[messageLength];
            bytesRead = ReadExact(messageBytes, 0, messageLength);
            if (bytesRead < messageLength) return null;

            var json = isCompressed ? Decompress(messageBytes) : Encoding.UTF8.GetString(messageBytes);
            return JsonHelper.Deserialize<NetworkMessage>(json);
        }

        private int ReadExact(byte[] buffer, int offset, int count)
        {
            var totalRead = 0;
            while (totalRead < count)
            {
                var read = _stream.Read(buffer, offset + totalRead, count - totalRead);
                if (read == 0) return totalRead;
                totalRead += read;
            }
            return totalRead;
        }

        public void SendMessage(NetworkMessage message, bool compress = false)
        {
            if (!IsConnected)
            {
                Debug.LogWarning("未连接到服务器");
                return;
            }

            try
            {
                message.SenderId = PlayerId;
                var json = JsonHelper.Serialize(message);
                var data = Encoding.UTF8.GetBytes(json);

                byte[] payloadData;
                byte flag;

                if (compress && data.Length > 256)
                {
                    payloadData = Compress(data);
                    flag = 1;
                }
                else
                {
                    payloadData = data;
                    flag = 0;
                }

                var lengthBytes = BitConverter.GetBytes(payloadData.Length);

                _stream.Write(lengthBytes, 0, 4);
                _stream.WriteByte(flag);
                _stream.Write(payloadData, 0, payloadData.Length);
                _stream.Flush();
            }
            catch (Exception ex)
            {
                Debug.LogError($"发送消息失败: {ex.Message}");
                HandleDisconnection();
            }
        }

        public void SendRawMessage(byte[] data, byte compressionMethod)
        {
            if (!IsConnected) return;

            try
            {
                var lengthBytes = BitConverter.GetBytes(data.Length);
                _stream.Write(lengthBytes, 0, 4);
                _stream.WriteByte(compressionMethod);
                _stream.Write(data, 0, data.Length);
                _stream.Flush();
            }
            catch (Exception ex)
            {
                Debug.LogError($"发送原始消息失败: {ex.Message}");
                HandleDisconnection();
            }
        }

        private byte[] Compress(byte[] data)
        {
            using var outputStream = new MemoryStream();
            using (var gzipStream = new GZipStream(outputStream, CompressionLevel.Fastest))
            {
                gzipStream.Write(data, 0, data.Length);
            }
            return outputStream.ToArray();
        }

        private string Decompress(byte[] data)
        {
            using var inputStream = new MemoryStream(data);
            using var gzipStream = new GZipStream(inputStream, CompressionMode.Decompress);
            using var reader = new StreamReader(gzipStream, Encoding.UTF8);
            return reader.ReadToEnd();
        }

        private void HeartbeatLoop()
        {
            while (_isRunning && _client.Connected)
            {
                Thread.Sleep((int)(HeartbeatInterval * 1000));
                if (!_isRunning || !_client.Connected) break;

                try
                {
                    SendMessage(new NetworkMessage(MessageType.Heartbeat));
                }
                catch
                {
                    break;
                }
            }
        }

        private void HandleDisconnection()
        {
            if (!_isRunning) return;

            Debug.LogWarning("与服务器的连接已断开");

            if (AutoReconnect && _reconnectAttempts < MaxReconnectAttempts)
            {
                _isReconnecting = true;
                OnReconnecting?.Invoke();
                TryReconnect();
            }
            else
            {
                Disconnect();
            }
        }

        private void TryReconnect()
        {
            _reconnectAttempts++;
            Debug.Log($"尝试重连 ({_reconnectAttempts}/{MaxReconnectAttempts})...");

            UnityMainThreadDispatcher.Instance.Enqueue(() =>
            {
                if (Connect(ServerAddress, ServerPort, PlayerName))
                {
                    SendConnectRequest(PlayerName);
                    _isReconnecting = false;
                    Debug.Log("重连成功");
                }
                else
                {
                    if (_reconnectAttempts >= MaxReconnectAttempts)
                    {
                        _isReconnecting = false;
                        OnReconnectFailed?.Invoke();
                        Debug.LogError("重连失败，已达最大重试次数");
                    }
                    else
                    {
                        UnityMainThreadDispatcher.Instance.Enqueue(() =>
                        {
                            var delay = ReconnectInterval * _reconnectAttempts;
                            Thread.Sleep((int)(delay * 1000));
                            TryReconnect();
                        });
                    }
                }
            });
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
                    break;
                case MessageType.PlayerJoinNotify:
                    HandlePlayerJoin(message);
                    break;
                case MessageType.PlayerLeaveNotify:
                    HandlePlayerLeave(message);
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

        private void HandlePlayerJoin(NetworkMessage message)
        {
            var playerInfo = JsonHelper.Deserialize<PlayerNetworkInfo>(message.Payload);
            if (playerInfo != null)
            {
                _knownPlayers.Add(playerInfo);
                Debug.Log($"玩家加入: {playerInfo.PlayerName}");
            }
        }

        private void HandlePlayerLeave(NetworkMessage message)
        {
            var playerId = message.Payload;
            _knownPlayers.RemoveAll(p => p.PlayerId == playerId);
            Debug.Log($"玩家离开: {playerId}");
        }

        public void SendConnectRequest(string playerName)
        {
            var request = new ConnectRequest
            {
                PlayerId = PlayerId,
                PlayerName = playerName,
                Version = "2.0.0"
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

        public void SendSimulationJoinRequest(string simulationId)
        {
            var request = new SimulationJoinRequest
            {
                SimulationId = simulationId,
                PlayerId = PlayerId,
                PlayerName = PlayerName
            };
            SendMessage(new NetworkMessage(MessageType.SimulationJoinRequest, JsonHelper.Serialize(request)));
        }

        private void OnDestroy()
        {
            Disconnect();
        }
    }

    [Serializable]
    public class PlayerNetworkInfo
    {
        public string PlayerId;
        public string PlayerName;
        public string Role;
        public string CurrentSimulationId;
        public bool IsOnline;
    }

    [Serializable]
    public class SimulationJoinRequest
    {
        public string SimulationId;
        public string PlayerId;
        public string PlayerName;
    }
}
