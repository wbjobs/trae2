using System;
using System.Text.Json;

namespace IndustrialSimulation.Shared.Utils
{
    public static class JsonHelper
    {
        private static readonly JsonSerializerOptions _options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = null,
            WriteIndented = false
        };

        public static string Serialize<T>(T obj)
        {
            try
            {
                return JsonSerializer.Serialize(obj, _options);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"序列化失败: {ex.Message}");
                return null;
            }
        }

        public static T Deserialize<T>(string json)
        {
            try
            {
                return JsonSerializer.Deserialize<T>(json, _options);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"反序列化失败: {ex.Message}");
                return default;
            }
        }

        public static object Deserialize(string json, Type type)
        {
            try
            {
                return JsonSerializer.Deserialize(json, type, _options);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"反序列化失败: {ex.Message}");
                return null;
            }
        }
    }

    public static class IdGenerator
    {
        public static string GenerateId()
        {
            return Guid.NewGuid().ToString("N");
        }

        public static string GenerateShortId()
        {
            return Guid.NewGuid().ToString("N").Substring(0, 8);
        }
    }

    public static class TimestampHelper
    {
        public static long GetCurrentTimestamp()
        {
            return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }

        public static DateTime TimestampToDateTime(long timestamp)
        {
            return DateTimeOffset.FromUnixTimeMilliseconds(timestamp).LocalDateTime;
        }

        public static long DateTimeToTimestamp(DateTime dateTime)
        {
            return new DateTimeOffset(dateTime).ToUnixTimeMilliseconds();
        }
    }
}
