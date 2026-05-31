using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SQLite;
using IndustrialSimulation.Server.Core;
using IndustrialSimulation.Shared.Models;
using IndustrialSimulation.Shared.Utils;

namespace IndustrialSimulation.Server.Simulation
{
    public class ServerDatabase : IDisposable
    {
        private static ServerDatabase _instance;
        public static ServerDatabase Instance => _instance;

        private SQLiteConnection _connection;
        private readonly object _dbLock = new object();

        public static void Initialize(string dbPath = null)
        {
            if (_instance != null) return;

            dbPath ??= "IndustrialSimulationServer.db";
            _instance = new ServerDatabase(dbPath);
        }

        public static void Shutdown()
        {
            _instance?.Dispose();
            _instance = null;
        }

        private ServerDatabase(string dbPath)
        {
            if (!System.IO.File.Exists(dbPath))
            {
                SQLiteConnection.CreateFile(dbPath);
            }

            _connection = new SQLiteConnection($"Data Source={dbPath};Version=3;");
            _connection.Open();
            CreateTables();
        }

        private void CreateTables()
        {
            ExecuteNonQuery(@"
                CREATE TABLE IF NOT EXISTS server_sessions (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    workshop_id TEXT,
                    host_id TEXT,
                    start_time INTEGER,
                    end_time INTEGER,
                    is_active INTEGER,
                    simulation_speed REAL,
                    participants TEXT,
                    snapshot TEXT
                )");

            ExecuteNonQuery(@"
                CREATE TABLE IF NOT EXISTS server_fault_records (
                    id TEXT PRIMARY KEY,
                    session_id TEXT,
                    fault_code TEXT,
                    equipment_id TEXT,
                    severity INTEGER,
                    occurred_time INTEGER,
                    resolved_time INTEGER,
                    resolved_by TEXT,
                    deviations TEXT,
                    FOREIGN KEY (session_id) REFERENCES server_sessions(id)
                )");

            ExecuteNonQuery(@"
                CREATE TABLE IF NOT EXISTS server_snapshots (
                    id TEXT PRIMARY KEY,
                    session_id TEXT,
                    timestamp INTEGER,
                    equipment_states TEXT,
                    active_faults TEXT,
                    resolved_faults TEXT,
                    FOREIGN KEY (session_id) REFERENCES server_sessions(id)
                )");

            ExecuteNonQuery(@"
                CREATE TABLE IF NOT EXISTS server_connection_log (
                    id TEXT PRIMARY KEY,
                    player_id TEXT,
                    player_name TEXT,
                    session_id TEXT,
                    connect_time INTEGER,
                    disconnect_time INTEGER,
                    ip_address TEXT
                )");
        }

        public void SaveSession(SimulationSession session)
        {
            lock (_dbLock)
            {
                try
                {
                    var sql = @"
                        INSERT OR REPLACE INTO server_sessions (id, name, workshop_id, host_id, start_time, end_time, is_active, simulation_speed, participants, snapshot)
                        VALUES (@id, @name, @workshop_id, @host_id, @start_time, @end_time, @is_active, @speed, @participants, @snapshot)";
                    ExecuteNonQuery(sql,
                        new SQLiteParameter("@id", session.Id),
                        new SQLiteParameter("@name", session.Name),
                        new SQLiteParameter("@workshop_id", session.WorkshopId ?? ""),
                        new SQLiteParameter("@host_id", session.HostId ?? ""),
                        new SQLiteParameter("@start_time", TimestampHelper.DateTimeToTimestamp(session.StartTime)),
                        new SQLiteParameter("@end_time", session.EndTime.HasValue ? TimestampHelper.DateTimeToTimestamp(session.EndTime.Value) : 0),
                        new SQLiteParameter("@is_active", session.IsActive ? 1 : 0),
                        new SQLiteParameter("@speed", session.SimulationSpeed),
                        new SQLiteParameter("@participants", JsonHelper.Serialize(session.ParticipantIds)),
                        new SQLiteParameter("@snapshot", ""));
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"保存会话失败: {ex.Message}");
                }
            }
        }

        public void UpdateSession(SimulationSession session)
        {
            SaveSession(session);
        }

        public void SaveSnapshot(SessionSnapshot snapshot)
        {
            lock (_dbLock)
            {
                try
                {
                    var sql = @"
                        INSERT INTO server_snapshots (id, session_id, timestamp, equipment_states, active_faults, resolved_faults)
                        VALUES (@id, @session_id, @timestamp, @equipment_states, @active_faults, @resolved_faults)";
                    ExecuteNonQuery(sql,
                        new SQLiteParameter("@id", IdGenerator.GenerateId()),
                        new SQLiteParameter("@session_id", snapshot.SessionId),
                        new SQLiteParameter("@timestamp", TimestampHelper.DateTimeToTimestamp(snapshot.Timestamp)),
                        new SQLiteParameter("@equipment_states", JsonHelper.Serialize(snapshot.EquipmentStates)),
                        new SQLiteParameter("@active_faults", JsonHelper.Serialize(snapshot.ActiveFaults)),
                        new SQLiteParameter("@resolved_faults", JsonHelper.Serialize(snapshot.ResolvedFaults)));
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"保存快照失败: {ex.Message}");
                }
            }
        }

        public void LogConnection(string playerId, string playerName, string ipAddress)
        {
            lock (_dbLock)
            {
                try
                {
                    var sql = @"
                        INSERT INTO server_connection_log (id, player_id, player_name, connect_time, ip_address)
                        VALUES (@id, @player_id, @player_name, @connect_time, @ip_address)";
                    ExecuteNonQuery(sql,
                        new SQLiteParameter("@id", IdGenerator.GenerateId()),
                        new SQLiteParameter("@player_id", playerId),
                        new SQLiteParameter("@player_name", playerName),
                        new SQLiteParameter("@connect_time", TimestampHelper.GetCurrentTimestamp()),
                        new SQLiteParameter("@ip_address", ipAddress));
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"记录连接日志失败: {ex.Message}");
                }
            }
        }

        public void UpdateDisconnectLog(string playerId)
        {
            lock (_dbLock)
            {
                try
                {
                    var sql = @"
                        UPDATE server_connection_log 
                        SET disconnect_time = @disconnect_time 
                        WHERE player_id = @player_id AND disconnect_time = 0
                        ORDER BY connect_time DESC LIMIT 1";
                    ExecuteNonQuery(sql,
                        new SQLiteParameter("@disconnect_time", TimestampHelper.GetCurrentTimestamp()),
                        new SQLiteParameter("@player_id", playerId));
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"更新断开日志失败: {ex.Message}");
                }
            }
        }

        public List<Dictionary<string, object>> GetSessionHistory(int limit = 20)
        {
            var result = new List<Dictionary<string, object>>();
            lock (_dbLock)
            {
                try
                {
                    var dt = ExecuteQuery($"SELECT * FROM server_sessions ORDER BY start_time DESC LIMIT {limit}");
                    if (dt == null) return result;

                    foreach (DataRow row in dt.Rows)
                    {
                        var dict = new Dictionary<string, object>();
                        foreach (DataColumn col in dt.Columns)
                        {
                            dict[col.ColumnName] = row[col];
                        }
                        result.Add(dict);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"查询会话历史失败: {ex.Message}");
                }
            }
            return result;
        }

        public SessionSnapshot GetSnapshot(string sessionId)
        {
            lock (_dbLock)
            {
                try
                {
                    var dt = ExecuteQuery("SELECT * FROM server_snapshots WHERE session_id = @sessionId ORDER BY timestamp DESC LIMIT 1",
                        new SQLiteParameter("@sessionId", sessionId));
                    if (dt == null || dt.Rows.Count == 0) return null;

                    var row = dt.Rows[0];
                    return new SessionSnapshot
                    {
                        SessionId = row["session_id"].ToString(),
                        Timestamp = TimestampHelper.TimestampToDateTime(Convert.ToInt64(row["timestamp"])),
                        EquipmentStates = JsonHelper.Deserialize<Dictionary<string, string>>(row["equipment_states"].ToString()) ?? new Dictionary<string, string>(),
                        ActiveFaults = JsonHelper.Deserialize<List<string>>(row["active_faults"].ToString()) ?? new List<string>(),
                        ResolvedFaults = JsonHelper.Deserialize<List<string>>(row["resolved_faults"].ToString()) ?? new List<string>()
                    };
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"获取快照失败: {ex.Message}");
                    return null;
                }
            }
        }

        private int ExecuteNonQuery(string sql, params SQLiteParameter[] parameters)
        {
            using var cmd = new SQLiteCommand(sql, _connection);
            cmd.Parameters.AddRange(parameters);
            return cmd.ExecuteNonQuery();
        }

        private DataTable ExecuteQuery(string sql, params SQLiteParameter[] parameters)
        {
            var dt = new DataTable();
            using var cmd = new SQLiteCommand(sql, _connection);
            cmd.Parameters.AddRange(parameters);
            using var reader = cmd.ExecuteReader();
            dt.Load(reader);
            return dt;
        }

        public void Dispose()
        {
            _connection?.Close();
            _connection?.Dispose();
        }
    }
}
