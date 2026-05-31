using System;
using System.Collections.Generic;
using IndustrialSimulation.Shared.Protocols;
using IndustrialSimulation.Shared.Utils;
using UnityEngine;

namespace IndustrialSimulation.Network
{
    public enum MessagePriority : byte
    {
        Low = 0,
        Normal = 1,
        High = 2,
        Critical = 3
    }

    [Serializable]
    public class QueuedMessage
    {
        public NetworkMessage Message;
        public MessagePriority Priority;
        public DateTime EnqueueTime;
        public int RetryCount;
        public int MaxRetries;
        public bool RequiresAck;
        public Action<bool> OnComplete;
        public long MessageId;
        public float TimeoutSeconds;
    }

    public class NetworkReliabilityLayer : MonoBehaviour
    {
        private static NetworkReliabilityLayer _instance;
        public static NetworkReliabilityLayer Instance => _instance;

        [Header("重传设置")]
        public int MaxRetries = 3;
        public float BaseRetryInterval = 1.0f;
        public float RetryBackoffMultiplier = 1.5f;
        public float AckTimeout = 3.0f;

        [Header("拥塞控制")]
        public float CongestionThreshold = 0.8f;
        public int MaxConcurrentMessages = 32;
        public float BandwidthEstimate = 1024 * 1024;

        [Header("RTT估算")]
        public float SmoothedRtt = 0.1f;
        public float RttVariance = 0.05f;
        public bool AdaptiveCompression = true;

        private readonly SortedList<int, Queue<QueuedMessage>> _priorityQueues =
            new SortedList<int, Queue<QueuedMessage>>
            {
                { (int)MessagePriority.Critical, new Queue<QueuedMessage>() },
                { (int)MessagePriority.High, new Queue<QueuedMessage>() },
                { (int)MessagePriority.Normal, new Queue<QueuedMessage>() },
                { (int)MessagePriority.Low, new Queue<QueuedMessage>() }
            };

        private readonly Dictionary<long, QueuedMessage> _pendingAckMessages = new Dictionary<long, QueuedMessage>();
        private readonly HashSet<long> _recentAcks = new HashSet<long>();
        private readonly List<long> _ackHistory = new List<long>();
        private long _messageIdCounter;
        private int _concurrentCount;
        private float _congestionLevel;
        private DateTime _lastCongestionUpdate;

        private MessageBatcher _messageBatcher;
        private IncrementalSyncManager _incrementalSync;

        public float CurrentRtt => SmoothedRtt;
        public float CongestionLevel => _congestionLevel;
        public int PendingMessagesCount
        {
            get
            {
                var count = 0;
                foreach (var q in _priorityQueues.Values) count += q.Count;
                return count;
            }
        }

        private void Awake()
        {
            if (_instance == null)
            {
                _instance = this;
                DontDestroyOnLoad(gameObject);
                _messageBatcher = new MessageBatcher(0.05f, 32);
                _incrementalSync = new IncrementalSyncManager();
            }
            else
            {
                Destroy(gameObject);
            }
        }

        public void SendMessage(
            NetworkMessage message,
            MessagePriority priority = MessagePriority.Normal,
            bool requiresAck = false,
            Action<bool> onComplete = null,
            int maxRetries = -1)
        {
            if (string.IsNullOrEmpty(message.RequestId))
            {
                message.RequestId = IdGenerator.GenerateId();
            }

            var queued = new QueuedMessage
            {
                Message = message,
                Priority = priority,
                EnqueueTime = DateTime.Now,
                RetryCount = 0,
                MaxRetries = maxRetries >= 0 ? maxRetries : MaxRetries,
                RequiresAck = requiresAck,
                OnComplete = onComplete,
                TimeoutSeconds = AckTimeout
            };

            EnqueueMessage(queued);
        }

        public void SendHighPriority(NetworkMessage message, Action<bool> onComplete = null)
        {
            SendMessage(message, MessagePriority.High, true, onComplete);
        }

        public void SendCritical(NetworkMessage message, Action<bool> onComplete = null)
        {
            SendMessage(message, MessagePriority.Critical, true, onComplete, 5);
        }

        public void SendLowPriority(NetworkMessage message)
        {
            SendMessage(message, MessagePriority.Low, false);
        }

        private void EnqueueMessage(QueuedMessage message)
        {
            var priorityKey = (int)message.Priority;
            if (_priorityQueues.TryGetValue(priorityKey, out var queue))
            {
                queue.Enqueue(message);
            }
        }

        private void Update()
        {
            ProcessMessageQueues();
            ProcessPendingAcks();
            UpdateCongestionControl();
        }

        private void ProcessMessageQueues()
        {
            foreach (var kvp in _priorityQueues)
            {
                var queue = kvp.Value;
                while (queue.Count > 0 && _concurrentCount < GetMaxConcurrentForPriority((MessagePriority)kvp.Key))
                {
                    var message = queue.Dequeue();
                    DispatchMessage(message);
                }
            }
        }

        private int GetMaxConcurrentForPriority(MessagePriority priority)
        {
            var baseMax = MaxConcurrentMessages;
            return priority switch
            {
                MessagePriority.Critical => baseMax,
                MessagePriority.High => (int)(baseMax * 0.75f),
                MessagePriority.Normal => (int)(baseMax * 0.5f),
                MessagePriority.Low => (int)(baseMax * 0.25f),
                _ => baseMax
            };
        }

        private void DispatchMessage(QueuedMessage queued)
        {
            _concurrentCount++;

            queued.MessageId = ++_messageIdCounter;
            queued.Message.Headers["MessageId"] = queued.MessageId.ToString();
            queued.Message.Headers["Priority"] = ((int)queued.Priority).ToString();

            if (queued.RequiresAck)
            {
                _pendingAckMessages[queued.MessageId] = queued;
            }

            var method = AdaptiveCompression
                ? NetworkCompression.SelectCompressionMethod(
                    System.Text.Encoding.UTF8.GetByteCount(queued.Message.Payload ?? ""),
                    SmoothedRtt * 1000)
                : CompressionMethod.LZ4;

            var json = JsonHelper.Serialize(queued.Message);
            var data = NetworkCompression.Compress(System.Text.Encoding.UTF8.GetBytes(json), method);

            EnhancedNetworkClient.Instance?.SendRawMessage(data, (byte)method);

            _concurrentCount--;
        }

        public void OnAckReceived(long messageId)
        {
            if (_recentAcks.Contains(messageId)) return;

            _recentAcks.Add(messageId);
            _ackHistory.Add(messageId);

            if (_pendingAckMessages.TryGetValue(messageId, out var message))
            {
                _pendingAckMessages.Remove(messageId);

                var rtt = (float)(DateTime.Now - message.EnqueueTime).TotalSeconds;
                UpdateRttEstimate(rtt);

                message.OnComplete?.Invoke(true);
            }

            if (_recentAcks.Count > 1000)
            {
                _recentAcks.Clear();
            }
        }

        private void ProcessPendingAcks()
        {
            var now = DateTime.Now;
            var toRetry = new List<QueuedMessage>();
            var toRemove = new List<long>();

            foreach (var kvp in _pendingAckMessages)
            {
                var msg = kvp.Value;
                var elapsed = (now - msg.EnqueueTime).TotalSeconds;
                var timeout = msg.TimeoutSeconds * Mathf.Pow(RetryBackoffMultiplier, msg.RetryCount);

                if (elapsed >= timeout)
                {
                    msg.RetryCount++;
                    if (msg.RetryCount < msg.MaxRetries)
                    {
                        msg.EnqueueTime = now;
                        toRetry.Add(msg);
                    }
                    else
                    {
                        msg.OnComplete?.Invoke(false);
                        toRemove.Add(kvp.Key);
                        Debug.LogWarning($"消息超时失败，已达最大重试次数: {msg.Message.Type}");
                    }
                }
            }

            foreach (var id in toRemove)
            {
                _pendingAckMessages.Remove(id);
            }

            foreach (var msg in toRetry)
            {
                _pendingAckMessages.Remove(msg.MessageId);
                EnqueueMessage(msg);

                TriggerCongestionEvent();
            }
        }

        private void UpdateRttEstimate(float newRtt)
        {
            var alpha = 0.125f;
            var beta = 0.25f;

            var rttDiff = newRtt - SmoothedRtt;
            SmoothedRtt = SmoothedRtt + alpha * rttDiff;
            RttVariance = RttVariance + beta * (Mathf.Abs(rttDiff) - RttVariance);

            AckTimeout = SmoothedRtt + 4 * RttVariance;
            AckTimeout = Mathf.Max(AckTimeout, 0.5f);
        }

        private void UpdateCongestionControl()
        {
            var updateInterval = Mathf.Max(0.5f, SmoothedRtt * 4);
            if ((DateTime.Now - _lastCongestionUpdate).TotalSeconds < updateInterval) return;

            _lastCongestionUpdate = DateTime.Now;

            if (SmoothedRtt < 0.05f)
            {
                _congestionLevel = 0.2f;
            }
            else if (SmoothedRtt < 0.1f)
            {
                _congestionLevel = 0.4f;
            }
            else if (SmoothedRtt < 0.3f)
            {
                _congestionLevel = 0.6f;
            }
            else if (SmoothedRtt < 0.5f)
            {
                _congestionLevel = 0.8f;
            }
            else
            {
                _congestionLevel = 1.0f;
            }

            MaxConcurrentMessages = _congestionLevel switch
            {
                < 0.5f => 32,
                < 0.75f => 16,
                < 0.9f => 8,
                _ => 4
            };
        }

        private void TriggerCongestionEvent()
        {
            _congestionLevel = Mathf.Min(1.0f, _congestionLevel + 0.1f);
        }

        public void Flush()
        {
            foreach (var queue in _priorityQueues.Values)
            {
                while (queue.Count > 0)
                {
                    var msg = queue.Dequeue();
                    DispatchMessage(msg);
                }
            }
        }

        public void ClearAll()
        {
            foreach (var queue in _priorityQueues.Values)
            {
                queue.Clear();
            }

            foreach (var msg in _pendingAckMessages.Values)
            {
                msg.OnComplete?.Invoke(false);
            }
            _pendingAckMessages.Clear();
            _recentAcks.Clear();
            _concurrentCount = 0;
        }

        public void Reset()
        {
            ClearAll();
            _incrementalSync?.Reset();
            SmoothedRtt = 0.1f;
            RttVariance = 0.05f;
            _congestionLevel = 0f;
        }

        public CompressionMethod GetRecommendedCompression()
        {
            return AdaptiveCompression
                ? NetworkCompression.SelectCompressionMethod(1024, SmoothedRtt * 1000)
                : CompressionMethod.LZ4;
        }
    }
}
