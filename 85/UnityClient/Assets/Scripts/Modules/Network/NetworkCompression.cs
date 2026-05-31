using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using IndustrialSimulation.Shared.Protocols;
using IndustrialSimulation.Shared.Utils;
using UnityEngine;

namespace IndustrialSimulation.Network
{
    public static class NetworkCompression
    {
        public static byte[] Compress(byte[] data, CompressionMethod method = CompressionMethod.LZ4)
        {
            return method switch
            {
                CompressionMethod.GZip => CompressGZip(data),
                CompressionMethod.LZ4 => CompressLZ4(data),
                CompressionMethod.None => data,
                _ => data
            };
        }

        public static byte[] Decompress(byte[] data, CompressionMethod method)
        {
            return method switch
            {
                CompressionMethod.GZip => DecompressGZip(data),
                CompressionMethod.LZ4 => DecompressLZ4(data),
                CompressionMethod.None => data,
                _ => data
            };
        }

        public static byte[] CompressGZip(byte[] data)
        {
            using var output = new MemoryStream();
            using (var gzip = new System.IO.Compression.GZipStream(output, System.IO.Compression.CompressionLevel.Optimal))
            {
                gzip.Write(data, 0, data.Length);
            }
            return output.ToArray();
        }

        public static byte[] DecompressGZip(byte[] data)
        {
            using var input = new MemoryStream(data);
            using var gzip = new System.IO.Compression.GZipStream(input, System.IO.Compression.CompressionMode.Decompress);
            using var output = new MemoryStream();
            gzip.CopyTo(output);
            return output.ToArray();
        }

        public static byte[] CompressLZ4(byte[] data)
        {
            var inputLength = data.Length;
            if (inputLength == 0) return data;

            var output = new byte[inputLength + inputLength / 255 + 16];
            var outputPos = 0;
            var inputPos = 0;

            const int minMatch = 4;
            const int maxOffset = 65535;

            while (inputPos < inputLength)
            {
                var tokenPos = outputPos++;
                var literalCount = 0;

                while (inputPos + literalCount < inputLength && literalCount < 15)
                {
                    var foundMatch = false;
                    var searchStart = Math.Max(0, inputPos - maxOffset);

                    for (var matchPos = searchStart; matchPos < inputPos - minMatch; matchPos++)
                    {
                        if (inputPos + minMatch <= inputLength &&
                            data[matchPos] == data[inputPos] &&
                            data[matchPos + 1] == data[inputPos + 1] &&
                            data[matchPos + 2] == data[inputPos + 2] &&
                            data[matchPos + 3] == data[inputPos + 3])
                        {
                            foundMatch = true;
                            break;
                        }
                    }

                    if (foundMatch) break;
                    literalCount++;
                }

                if (literalCount > 0)
                {
                    output[tokenPos] = (byte)(Math.Min(literalCount, 15) * 16);

                    if (literalCount >= 15)
                    {
                        var len = literalCount - 15;
                        while (len >= 255)
                        {
                            output[outputPos++] = 255;
                            len -= 255;
                        }
                        output[outputPos++] = (byte)len;
                    }

                    Array.Copy(data, inputPos, output, outputPos, literalCount);
                    outputPos += literalCount;
                    inputPos += literalCount;
                }

                if (inputPos >= inputLength) break;

                var matchOffset = 0;
                var matchLength = 0;
                var searchEnd = inputPos - minMatch;
                var searchStart2 = Math.Max(0, inputPos - maxOffset);

                for (var matchPos = searchStart2; matchPos < searchEnd; matchPos++)
                {
                    var length = 0;
                    while (inputPos + length < inputLength &&
                           matchPos + length < inputPos &&
                           data[matchPos + length] == data[inputPos + length])
                    {
                        length++;
                        if (length >= 65535) break;
                    }

                    if (length > matchLength && length >= minMatch)
                    {
                        matchLength = length;
                        matchOffset = inputPos - matchPos;
                    }
                }

                if (matchLength >= minMatch)
                {
                    var lenCode = Math.Min(matchLength - 4, 15);
                    output[tokenPos] |= (byte)lenCode;

                    output[outputPos++] = (byte)(matchOffset & 0xFF);
                    output[outputPos++] = (byte)(matchOffset >> 8);

                    if (matchLength >= 19)
                    {
                        var len = matchLength - 19;
                        while (len >= 255)
                        {
                            output[outputPos++] = 255;
                            len -= 255;
                        }
                        output[outputPos++] = (byte)len;
                    }

                    inputPos += matchLength;
                }
            }

            var result = new byte[outputPos];
            Array.Copy(output, result, outputPos);
            return result;
        }

        public static byte[] DecompressLZ4(byte[] data)
        {
            if (data.Length == 0) return data;

            var output = new System.Collections.Generic.List<byte>(data.Length * 2);
            var inputPos = 0;
            var inputLength = data.Length;

            while (inputPos < inputLength)
            {
                var token = data[inputPos++];
                var literalLength = token >> 4;
                var matchLength = token & 0x0F;

                if (literalLength == 15)
                {
                    while (inputPos < inputLength)
                    {
                        var next = data[inputPos++];
                        literalLength += next;
                        if (next < 255) break;
                    }
                }

                for (var i = 0; i < literalLength && inputPos < inputLength; i++)
                {
                    output.Add(data[inputPos++]);
                }

                if (inputPos >= inputLength) break;

                var offset = data[inputPos++] | (data[inputPos++] << 8);

                if (matchLength == 15)
                {
                    while (inputPos < inputLength)
                    {
                        var next = data[inputPos++];
                        matchLength += next;
                        if (next < 255) break;
                    }
                }

                matchLength += 4;

                var start = output.Count - offset;
                for (var i = 0; i < matchLength; i++)
                {
                    output.Add(output[start + i]);
                }
            }

            return output.ToArray();
        }

        public static CompressionMethod SelectCompressionMethod(int dataSize, float rttMs)
        {
            if (dataSize < 256) return CompressionMethod.None;
            if (dataSize < 1024) return CompressionMethod.LZ4;
            if (rttMs < 50) return CompressionMethod.LZ4;
            if (rttMs > 200) return CompressionMethod.GZip;
            return CompressionMethod.LZ4;
        }

        public static float GetCompressionRatio(byte[] original, byte[] compressed)
        {
            return original.Length > 0 ? (float)compressed.Length / original.Length : 1.0f;
        }
    }

    public enum CompressionMethod : byte
    {
        None = 0,
        LZ4 = 1,
        GZip = 2
    }

    public class MessageBatcher
    {
        private readonly System.Collections.Generic.List<NetworkMessage> _pendingMessages = new System.Collections.Generic.List<NetworkMessage>();
        private readonly float _batchInterval;
        private readonly int _maxBatchSize;
        private float _lastBatchTime;

        public int PendingCount => _pendingMessages.Count;

        public MessageBatcher(float batchInterval = 0.05f, int maxBatchSize = 32)
        {
            _batchInterval = batchInterval;
            _maxBatchSize = maxBatchSize;
        }

        public void Enqueue(NetworkMessage message)
        {
            _pendingMessages.Add(message);
        }

        public bool ShouldBatch(float currentTime)
        {
            return _pendingMessages.Count >= _maxBatchSize ||
                   (currentTime - _lastBatchTime >= _batchInterval && _pendingMessages.Count > 0);
        }

        public NetworkMessage GetBatch(string senderId)
        {
            if (_pendingMessages.Count == 0) return null;

            var batch = new BatchedMessages
            {
                Count = _pendingMessages.Count,
                Messages = new System.Collections.Generic.List<NetworkMessage>(_pendingMessages)
            };

            _pendingMessages.Clear();
            _lastBatchTime = Time.time;

            return new NetworkMessage(MessageType.BatchedMessages, JsonHelper.Serialize(batch))
            {
                SenderId = senderId
            };
        }

        public void Clear()
        {
            _pendingMessages.Clear();
        }
    }

    [Serializable]
    public class BatchedMessages
    {
        public int Count;
        public System.Collections.Generic.List<NetworkMessage> Messages;
    }

    public class IncrementalSyncManager
    {
        private readonly System.Collections.Generic.Dictionary<string, long> _lastEquipmentTimestamps =
            new System.Collections.Generic.Dictionary<string, long>();

        private readonly System.Collections.Generic.Dictionary<string, string> _lastEquipmentHashes =
            new System.Collections.Generic.Dictionary<string, string>();

        public bool HasEquipmentChanged(string equipmentId, EquipmentModel currentState)
        {
            var currentHash = CalculateEquipmentHash(currentState);

            if (!_lastEquipmentHashes.TryGetValue(equipmentId, out var lastHash))
            {
                _lastEquipmentHashes[equipmentId] = currentHash;
                _lastEquipmentTimestamps[equipmentId] = TimestampHelper.GetCurrentTimestamp();
                return true;
            }

            if (currentHash != lastHash)
            {
                _lastEquipmentHashes[equipmentId] = currentHash;
                _lastEquipmentTimestamps[equipmentId] = TimestampHelper.GetCurrentTimestamp();
                return true;
            }

            return false;
        }

        private string CalculateEquipmentHash(EquipmentModel model)
        {
            var keyValues = new System.Collections.Generic.List<string>();

            foreach (var kvp in model.Parameters.OrderBy(kv => kvp.Key))
            {
                keyValues.Add($"{kvp.Key}:{kvp.Value:F6}");
            }

            var combined = $"{model.Status}|{string.Join("|", keyValues)}";
            return combined.GetHashCode().ToString();
        }

        public void Reset()
        {
            _lastEquipmentTimestamps.Clear();
            _lastEquipmentHashes.Clear();
        }
    }
}
