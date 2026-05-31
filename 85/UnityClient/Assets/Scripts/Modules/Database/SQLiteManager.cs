using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SQLite;
using System.IO;
using IndustrialSimulation.Shared.Models;
using IndustrialSimulation.Shared.Utils;
using UnityEngine;

namespace IndustrialSimulation.Database
{
    public class SQLiteManager : MonoBehaviour
    {
        private static SQLiteManager _instance;
        public static SQLiteManager Instance => _instance;

        private SQLiteConnection _connection;
        private string _dbPath;

        public bool IsConnected { get; private set; }

        private void Awake()
        {
            if (_instance == null)
            {
                _instance = this;
                DontDestroyOnLoad(gameObject);
                InitializeDatabase();
            }
            else
            {
                Destroy(gameObject);
            }
        }

        private void InitializeDatabase()
        {
            try
            {
                _dbPath = Path.Combine(Application.persistentDataPath, "IndustrialSimulation.db");
                Debug.Log($"数据库路径: {_dbPath}");

                if (!File.Exists(_dbPath))
                {
                    SQLiteConnection.CreateFile(_dbPath);
                }

                _connection = new SQLiteConnection($"Data Source={_dbPath};Version=3;");
                _connection.Open();
                IsConnected = true;

                CreateTables();
                InitializeDefaultData();
            }
            catch (Exception ex)
            {
                Debug.LogError($"数据库初始化失败: {ex.Message}");
                IsConnected = false;
            }
        }

        private void CreateTables()
        {
            ExecuteNonQuery(@"
                CREATE TABLE IF NOT EXISTS workshops (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_time INTEGER
                )");

            ExecuteNonQuery(@"
                CREATE TABLE IF NOT EXISTS equipment (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type INTEGER NOT NULL,
                    status INTEGER NOT NULL,
                    workshop_id TEXT,
                    pos_x REAL,
                    pos_y REAL,
                    pos_z REAL,
                    parameters TEXT,
                    created_time INTEGER,
                    last_update_time INTEGER,
                    FOREIGN KEY (workshop_id) REFERENCES workshops(id)
                )");

            ExecuteNonQuery(@"
                CREATE TABLE IF NOT EXISTS fault_definitions (
                    fault_code TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    severity INTEGER NOT NULL,
                    equipment_type INTEGER NOT NULL,
                    affected_parameters TEXT,
                    probability REAL,
                    resolution_steps TEXT
                )");

            ExecuteNonQuery(@"
                CREATE TABLE IF NOT EXISTS simulation_records (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    workshop_id TEXT,
                    creator_id TEXT,
                    start_time INTEGER,
                    end_time INTEGER,
                    is_active INTEGER,
                    simulation_speed REAL,
                    participants TEXT,
                    faults TEXT,
                    snapshots TEXT,
                    FOREIGN KEY (workshop_id) REFERENCES workshops(id)
                )");

            ExecuteNonQuery(@"
                CREATE TABLE IF NOT EXISTS fault_instances (
                    id TEXT PRIMARY KEY,
                    fault_code TEXT,
                    equipment_id TEXT,
                    simulation_id TEXT,
                    status INTEGER,
                    severity INTEGER,
                    occurred_time INTEGER,
                    resolved_time INTEGER,
                    resolved_by TEXT,
                    deviations TEXT,
                    FOREIGN KEY (fault_code) REFERENCES fault_definitions(fault_code),
                    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
                    FOREIGN KEY (simulation_id) REFERENCES simulation_records(id)
                )");
        }

        private void InitializeDefaultData()
        {
            var workshopCount = ExecuteScalar<long>("SELECT COUNT(*) FROM workshops");
            if (workshopCount == 0)
            {
                InsertWorkshop(new WorkshopModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "一号车间",
                    Description = "主要生产车间，包含泵、电机、压缩机等设备"
                });

                InsertWorkshop(new WorkshopModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "二号车间",
                    Description = "辅助车间，包含传送带、锅炉、阀门等设备"
                });
            }

            var faultCount = ExecuteScalar<long>("SELECT COUNT(*) FROM fault_definitions");
            if (faultCount == 0)
            {
                InsertDefaultFaultDefinitions();
            }

            var equipmentCount = ExecuteScalar<long>("SELECT COUNT(*) FROM equipment");
            if (equipmentCount == 0)
            {
                InsertDefaultEquipment();
            }

            CleanupStaleRecords();
        }

        public void CleanupStaleRecords()
        {
            try
            {
                var oneWeekAgo = TimestampHelper.DateTimeToTimestamp(DateTime.Now.AddDays(-7));

                var oldRecords = ExecuteQuery(
                    "SELECT id FROM simulation_records WHERE end_time > 0 AND end_time < @oneWeekAgo",
                    new SQLiteParameter("@oneWeekAgo", oneWeekAgo));

                var deletedCount = 0;
                if (oldRecords != null)
                {
                    foreach (DataRow row in oldRecords.Rows)
                    {
                        var simId = row["id"].ToString();
                        ExecuteNonQuery("DELETE FROM fault_instances WHERE simulation_id = @simId",
                            new SQLiteParameter("@simId", simId));
                        ExecuteNonQuery("DELETE FROM simulation_records WHERE id = @simId",
                            new SQLiteParameter("@simId", simId));
                        deletedCount++;
                    }
                }

                if (deletedCount > 0)
                {
                    Debug.Log($"清理了 {deletedCount} 条超过7天的历史推演记录");
                }

                var orphanFaults = ExecuteScalar<long>(
                    "SELECT COUNT(*) FROM fault_instances WHERE simulation_id NOT IN (SELECT id FROM simulation_records)");
                if (orphanFaults > 0)
                {
                    ExecuteNonQuery("DELETE FROM fault_instances WHERE simulation_id NOT IN (SELECT id FROM simulation_records)");
                    Debug.Log($"清理了 {orphanFaults} 条孤立的故障实例记录");
                }

                var emptyFaults = ExecuteScalar<long>(
                    "SELECT COUNT(*) FROM fault_instances WHERE fault_code IS NULL OR fault_code = ''");
                if (emptyFaults > 0)
                {
                    ExecuteNonQuery("DELETE FROM fault_instances WHERE fault_code IS NULL OR fault_code = ''");
                    Debug.Log($"清理了 {emptyFaults} 条无效的故障实例记录");
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"清理旧数据时出错: {ex.Message}");
            }
        }

        public void VacuumDatabase()
        {
            try
            {
                ExecuteNonQuery("VACUUM");
                Debug.Log("数据库碎片整理完成");
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"整理数据库失败: {ex.Message}");
            }
        }

        private void InsertDefaultFaultDefinitions()
        {
            var faults = new List<FaultDefinition>
            {
                new FaultDefinition
                {
                    FaultCode = "PUMP_001",
                    Name = "泵轴承故障",
                    Description = "泵轴承磨损导致振动增大",
                    Severity = FaultSeverity.Medium,
                    ApplicableEquipmentType = EquipmentType.Pump,
                    AffectedParameters = { "vibration", "temperature" },
                    Probability = 0.3,
                    ResolutionSteps = "1. 停机检查轴承 2. 更换磨损部件 3. 加注润滑油"
                },
                new FaultDefinition
                {
                    FaultCode = "MOTOR_001",
                    Name = "电机过载",
                    Description = "电机负载过大导致电流异常",
                    Severity = FaultSeverity.High,
                    ApplicableEquipmentType = EquipmentType.Motor,
                    AffectedParameters = { "current", "temperature" },
                    Probability = 0.25,
                    ResolutionSteps = "1. 降低负载 2. 检查机械卡阻 3. 必要时更换大功率电机"
                },
                new FaultDefinition
                {
                    FaultCode = "COMP_001",
                    Name = "压缩机压力异常",
                    Description = "压缩机出口压力偏离正常值",
                    Severity = FaultSeverity.Medium,
                    ApplicableEquipmentType = EquipmentType.Compressor,
                    AffectedParameters = { "pressure", "flow" },
                    Probability = 0.2,
                    ResolutionSteps = "1. 检查压力传感器 2. 清理过滤器 3. 调整压力调节阀"
                },
                new FaultDefinition
                {
                    FaultCode = "VALVE_001",
                    Name = "阀门泄漏",
                    Description = "阀门密封不良导致泄漏",
                    Severity = FaultSeverity.Low,
                    ApplicableEquipmentType = EquipmentType.Valve,
                    AffectedParameters = { "flow", "pressure" },
                    Probability = 0.35,
                    ResolutionSteps = "1. 紧固阀门 2. 更换密封垫 3. 必要时更换阀门"
                },
                new FaultDefinition
                {
                    FaultCode = "SENSOR_001",
                    Name = "传感器漂移",
                    Description = "传感器读数偏离真实值",
                    Severity = FaultSeverity.Low,
                    ApplicableEquipmentType = EquipmentType.Sensor,
                    AffectedParameters = { "reading_accuracy" },
                    Probability = 0.4,
                    ResolutionSteps = "1. 重新校准传感器 2. 检查接线 3. 更换传感器"
                },
                new FaultDefinition
                {
                    FaultCode = "BOILER_001",
                    Name = "锅炉超温",
                    Description = "锅炉温度超过安全阈值",
                    Severity = FaultSeverity.Critical,
                    ApplicableEquipmentType = EquipmentType.Boiler,
                    AffectedParameters = { "temperature", "pressure" },
                    Probability = 0.15,
                    ResolutionSteps = "1. 紧急停机 2. 检查水位 3. 清理水垢 4. 检查燃烧器"
                },
                new FaultDefinition
                {
                    FaultCode = "CONV_001",
                    Name = "传送带卡顿",
                    Description = "传送带负载过大或机械卡阻",
                    Severity = FaultSeverity.High,
                    ApplicableEquipmentType = EquipmentType.Conveyor,
                    AffectedParameters = { "load", "speed", "belt_tension" },
                    Probability = 0.2,
                    ResolutionSteps = "1. 清除障碍物 2. 检查张紧度 3. 降低负载"
                }
            };

            foreach (var fault in faults)
            {
                InsertFaultDefinition(fault);
            }
        }

        private void InsertDefaultEquipment()
        {
            var workshops = GetAllWorkshops();
            if (workshops.Count == 0) return;

            var workshop1 = workshops[0];
            var workshop2 = workshops[1];

            var equipmentList = new List<EquipmentModel>
            {
                new EquipmentModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "主水泵-01",
                    Type = EquipmentType.Pump,
                    Status = EquipmentStatus.Running,
                    WorkshopId = workshop1.Id,
                    PositionX = -5, PositionY = 0, PositionZ = -5,
                    Parameters =
                    {
                        ["flow"] = 100.0,
                        ["pressure"] = 2.5,
                        ["temperature"] = 45.0,
                        ["vibration"] = 2.1,
                        ["efficiency"] = 85.0
                    }
                },
                new EquipmentModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "驱动电机-01",
                    Type = EquipmentType.Motor,
                    Status = EquipmentStatus.Running,
                    WorkshopId = workshop1.Id,
                    PositionX = 0, PositionY = 0, PositionZ = -5,
                    Parameters =
                    {
                        ["current"] = 25.5,
                        ["voltage"] = 380.0,
                        ["power"] = 15.0,
                        ["temperature"] = 60.0,
                        ["rpm"] = 1480.0
                    }
                },
                new EquipmentModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "空压机-01",
                    Type = EquipmentType.Compressor,
                    Status = EquipmentStatus.Running,
                    WorkshopId = workshop1.Id,
                    PositionX = 5, PositionY = 0, PositionZ = -5,
                    Parameters =
                    {
                        ["pressure"] = 0.8,
                        ["flow"] = 50.0,
                        ["temperature"] = 70.0,
                        ["power"] = 22.0
                    }
                },
                new EquipmentModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "传送带-A线",
                    Type = EquipmentType.Conveyor,
                    Status = EquipmentStatus.Running,
                    WorkshopId = workshop2.Id,
                    PositionX = -5, PositionY = 0, PositionZ = 5,
                    Parameters =
                    {
                        ["speed"] = 2.0,
                        ["load"] = 500.0,
                        ["belt_tension"] = 80.0
                    }
                },
                new EquipmentModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "蒸汽锅炉-01",
                    Type = EquipmentType.Boiler,
                    Status = EquipmentStatus.Running,
                    WorkshopId = workshop2.Id,
                    PositionX = 0, PositionY = 0, PositionZ = 5,
                    Parameters =
                    {
                        ["temperature"] = 180.0,
                        ["pressure"] = 1.0,
                        ["water_level"] = 75.0,
                        ["fuel_rate"] = 50.0
                    }
                },
                new EquipmentModel
                {
                    Id = IdGenerator.GenerateId(),
                    Name = "控制阀组-01",
                    Type = EquipmentType.Valve,
                    Status = EquipmentStatus.Running,
                    WorkshopId = workshop2.Id,
                    PositionX = 5, PositionY = 0, PositionZ = 5,
                    Parameters =
                    {
                        ["opening"] = 60.0,
                        ["flow"] = 30.0,
                        ["pressure_in"] = 2.0,
                        ["pressure_out"] = 1.5
                    }
                }
            };

            foreach (var equipment in equipmentList)
            {
                InsertEquipment(equipment);
            }
        }

        public int ExecuteNonQuery(string sql, params SQLiteParameter[] parameters)
        {
            if (_connection == null || _connection.State != ConnectionState.Open)
            {
                Debug.LogError("数据库未连接");
                return -1;
            }

            using (var cmd = new SQLiteCommand(sql, _connection))
            {
                cmd.Parameters.AddRange(parameters);
                return cmd.ExecuteNonQuery();
            }
        }

        public T ExecuteScalar<T>(string sql, params SQLiteParameter[] parameters)
        {
            if (_connection == null || _connection.State != ConnectionState.Open)
            {
                Debug.LogError("数据库未连接");
                return default;
            }

            using (var cmd = new SQLiteCommand(sql, _connection))
            {
                cmd.Parameters.AddRange(parameters);
                var result = cmd.ExecuteScalar();
                if (result == null || result == DBNull.Value)
                    return default;
                return (T)Convert.ChangeType(result, typeof(T));
            }
        }

        public DataTable ExecuteQuery(string sql, params SQLiteParameter[] parameters)
        {
            if (_connection == null || _connection.State != ConnectionState.Open)
            {
                Debug.LogError("数据库未连接");
                return null;
            }

            var dt = new DataTable();
            using (var cmd = new SQLiteCommand(sql, _connection))
            {
                cmd.Parameters.AddRange(parameters);
                using (var reader = cmd.ExecuteReader())
                {
                    dt.Load(reader);
                }
            }
            return dt;
        }

        public bool InsertWorkshop(WorkshopModel workshop)
        {
            try
            {
                var existing = ExecuteScalar<long>(
                    "SELECT COUNT(*) FROM workshops WHERE id = @id",
                    new SQLiteParameter("@id", workshop.Id));
                if (existing > 0) return false;

                var sql = @"
                    INSERT INTO workshops (id, name, description, created_time)
                    VALUES (@id, @name, @description, @created_time)";
                ExecuteNonQuery(sql,
                    new SQLiteParameter("@id", workshop.Id),
                    new SQLiteParameter("@name", workshop.Name),
                    new SQLiteParameter("@description", workshop.Description ?? ""),
                    new SQLiteParameter("@created_time", TimestampHelper.DateTimeToTimestamp(workshop.CreatedTime)));
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"插入车间失败: {ex.Message}");
                return false;
            }
        }

        public List<WorkshopModel> GetAllWorkshops()
        {
            var workshops = new List<WorkshopModel>();
            var dt = ExecuteQuery("SELECT * FROM workshops");
            if (dt == null) return workshops;

            foreach (DataRow row in dt.Rows)
            {
                workshops.Add(new WorkshopModel
                {
                    Id = row["id"].ToString(),
                    Name = row["name"].ToString(),
                    Description = row["description"].ToString(),
                    CreatedTime = TimestampHelper.TimestampToDateTime(Convert.ToInt64(row["created_time"]))
                });
            }
            return workshops;
        }

        public bool InsertEquipment(EquipmentModel equipment)
        {
            try
            {
                var existing = ExecuteScalar<long>(
                    "SELECT COUNT(*) FROM equipment WHERE id = @id",
                    new SQLiteParameter("@id", equipment.Id));
                if (existing > 0) return UpdateEquipment(equipment);

                var sql = @"
                    INSERT INTO equipment (id, name, type, status, workshop_id, pos_x, pos_y, pos_z, parameters, created_time, last_update_time)
                    VALUES (@id, @name, @type, @status, @workshop_id, @pos_x, @pos_y, @pos_z, @parameters, @created_time, @last_update_time)";
                ExecuteNonQuery(sql,
                    new SQLiteParameter("@id", equipment.Id),
                    new SQLiteParameter("@name", equipment.Name),
                    new SQLiteParameter("@type", (int)equipment.Type),
                    new SQLiteParameter("@status", (int)equipment.Status),
                    new SQLiteParameter("@workshop_id", equipment.WorkshopId ?? ""),
                    new SQLiteParameter("@pos_x", equipment.PositionX),
                    new SQLiteParameter("@pos_y", equipment.PositionY),
                    new SQLiteParameter("@pos_z", equipment.PositionZ),
                    new SQLiteParameter("@parameters", JsonHelper.Serialize(equipment.Parameters)),
                    new SQLiteParameter("@created_time", TimestampHelper.DateTimeToTimestamp(equipment.CreatedTime)),
                    new SQLiteParameter("@last_update_time", TimestampHelper.DateTimeToTimestamp(equipment.LastUpdateTime)));
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"插入设备失败: {ex.Message}");
                return false;
            }
        }

        public bool UpdateEquipment(EquipmentModel equipment)
        {
            try
            {
                equipment.LastUpdateTime = DateTime.Now;
                var sql = @"
                    UPDATE equipment 
                    SET name = @name, status = @status, pos_x = @pos_x, pos_y = @pos_y, pos_z = @pos_z, 
                        parameters = @parameters, last_update_time = @last_update_time
                    WHERE id = @id";
                ExecuteNonQuery(sql,
                    new SQLiteParameter("@name", equipment.Name),
                    new SQLiteParameter("@status", (int)equipment.Status),
                    new SQLiteParameter("@pos_x", equipment.PositionX),
                    new SQLiteParameter("@pos_y", equipment.PositionY),
                    new SQLiteParameter("@pos_z", equipment.PositionZ),
                    new SQLiteParameter("@parameters", JsonHelper.Serialize(equipment.Parameters)),
                    new SQLiteParameter("@last_update_time", TimestampHelper.DateTimeToTimestamp(equipment.LastUpdateTime)),
                    new SQLiteParameter("@id", equipment.Id));
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"更新设备失败: {ex.Message}");
                return false;
            }
        }

        public List<EquipmentModel> GetEquipmentByWorkshop(string workshopId)
        {
            var equipmentList = new List<EquipmentModel>();
            var dt = ExecuteQuery("SELECT * FROM equipment WHERE workshop_id = @workshopId",
                new SQLiteParameter("@workshopId", workshopId));
            if (dt == null) return equipmentList;

            foreach (DataRow row in dt.Rows)
            {
                equipmentList.Add(ParseEquipmentFromRow(row));
            }
            return equipmentList;
        }

        public EquipmentModel GetEquipmentById(string id)
        {
            var dt = ExecuteQuery("SELECT * FROM equipment WHERE id = @id",
                new SQLiteParameter("@id", id));
            if (dt == null || dt.Rows.Count == 0) return null;

            return ParseEquipmentFromRow(dt.Rows[0]);
        }

        private EquipmentModel ParseEquipmentFromRow(DataRow row)
        {
            return new EquipmentModel
            {
                Id = row["id"].ToString(),
                Name = row["name"].ToString(),
                Type = (EquipmentType)Convert.ToInt32(row["type"]),
                Status = (EquipmentStatus)Convert.ToInt32(row["status"]),
                WorkshopId = row["workshop_id"].ToString(),
                PositionX = Convert.ToSingle(row["pos_x"]),
                PositionY = Convert.ToSingle(row["pos_y"]),
                PositionZ = Convert.ToSingle(row["pos_z"]),
                Parameters = JsonHelper.Deserialize<Dictionary<string, double>>(row["parameters"].ToString()) ?? new Dictionary<string, double>(),
                CreatedTime = TimestampHelper.TimestampToDateTime(Convert.ToInt64(row["created_time"])),
                LastUpdateTime = TimestampHelper.TimestampToDateTime(Convert.ToInt64(row["last_update_time"]))
            };
        }

        public bool InsertFaultDefinition(FaultDefinition fault)
        {
            try
            {
                var existing = ExecuteScalar<long>(
                    "SELECT COUNT(*) FROM fault_definitions WHERE fault_code = @faultCode",
                    new SQLiteParameter("@faultCode", fault.FaultCode));
                if (existing > 0) return false;

                var sql = @"
                    INSERT INTO fault_definitions (fault_code, name, description, severity, equipment_type, affected_parameters, probability, resolution_steps)
                    VALUES (@fault_code, @name, @description, @severity, @equipment_type, @affected_parameters, @probability, @resolution_steps)";
                ExecuteNonQuery(sql,
                    new SQLiteParameter("@fault_code", fault.FaultCode),
                    new SQLiteParameter("@name", fault.Name),
                    new SQLiteParameter("@description", fault.Description ?? ""),
                    new SQLiteParameter("@severity", (int)fault.Severity),
                    new SQLiteParameter("@equipment_type", (int)fault.ApplicableEquipmentType),
                    new SQLiteParameter("@affected_parameters", JsonHelper.Serialize(fault.AffectedParameters)),
                    new SQLiteParameter("@probability", fault.Probability),
                    new SQLiteParameter("@resolution_steps", fault.ResolutionSteps ?? ""));
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"插入故障定义失败: {ex.Message}");
                return false;
            }
        }

        public List<FaultDefinition> GetAllFaultDefinitions()
        {
            var faults = new List<FaultDefinition>();
            var dt = ExecuteQuery("SELECT * FROM fault_definitions");
            if (dt == null) return faults;

            foreach (DataRow row in dt.Rows)
            {
                faults.Add(new FaultDefinition
                {
                    FaultCode = row["fault_code"].ToString(),
                    Name = row["name"].ToString(),
                    Description = row["description"].ToString(),
                    Severity = (FaultSeverity)Convert.ToInt32(row["severity"]),
                    ApplicableEquipmentType = (EquipmentType)Convert.ToInt32(row["equipment_type"]),
                    AffectedParameters = JsonHelper.Deserialize<List<string>>(row["affected_parameters"].ToString()) ?? new List<string>(),
                    Probability = Convert.ToDouble(row["probability"]),
                    ResolutionSteps = row["resolution_steps"].ToString()
                });
            }
            return faults;
        }

        public bool InsertSimulationRecord(SimulationRecord record)
        {
            try
            {
                var sql = @"
                    INSERT INTO simulation_records (id, name, workshop_id, creator_id, start_time, end_time, is_active, simulation_speed, participants, faults, snapshots)
                    VALUES (@id, @name, @workshop_id, @creator_id, @start_time, @end_time, @is_active, @simulation_speed, @participants, @faults, @snapshots)";
                ExecuteNonQuery(sql,
                    new SQLiteParameter("@id", record.Id),
                    new SQLiteParameter("@name", record.Name),
                    new SQLiteParameter("@workshop_id", record.WorkshopId ?? ""),
                    new SQLiteParameter("@creator_id", record.CreatorId ?? ""),
                    new SQLiteParameter("@start_time", TimestampHelper.DateTimeToTimestamp(record.StartTime)),
                    new SQLiteParameter("@end_time", record.EndTime.HasValue ? TimestampHelper.DateTimeToTimestamp(record.EndTime.Value) : 0),
                    new SQLiteParameter("@is_active", record.IsActive ? 1 : 0),
                    new SQLiteParameter("@simulation_speed", record.SimulationSpeed),
                    new SQLiteParameter("@participants", JsonHelper.Serialize(record.ParticipantIds)),
                    new SQLiteParameter("@faults", JsonHelper.Serialize(record.FaultInstanceIds)),
                    new SQLiteParameter("@snapshots", JsonHelper.Serialize(record.EquipmentSnapshots)));
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"插入推演记录失败: {ex.Message}");
                return false;
            }
        }

        public bool UpdateSimulationRecord(SimulationRecord record)
        {
            try
            {
                var sql = @"
                    UPDATE simulation_records 
                    SET end_time = @end_time, is_active = @is_active, participants = @participants, faults = @faults, snapshots = @snapshots
                    WHERE id = @id";
                ExecuteNonQuery(sql,
                    new SQLiteParameter("@end_time", record.EndTime.HasValue ? TimestampHelper.DateTimeToTimestamp(record.EndTime.Value) : 0),
                    new SQLiteParameter("@is_active", record.IsActive ? 1 : 0),
                    new SQLiteParameter("@participants", JsonHelper.Serialize(record.ParticipantIds)),
                    new SQLiteParameter("@faults", JsonHelper.Serialize(record.FaultInstanceIds)),
                    new SQLiteParameter("@snapshots", JsonHelper.Serialize(record.EquipmentSnapshots)),
                    new SQLiteParameter("@id", record.Id));
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"更新推演记录失败: {ex.Message}");
                return false;
            }
        }

        public List<SimulationRecord> GetSimulationRecords(int limit = 50)
        {
            var records = new List<SimulationRecord>();
            var dt = ExecuteQuery($"SELECT * FROM simulation_records ORDER BY start_time DESC LIMIT {limit}");
            if (dt == null) return records;

            foreach (DataRow row in dt.Rows)
            {
                records.Add(new SimulationRecord
                {
                    Id = row["id"].ToString(),
                    Name = row["name"].ToString(),
                    WorkshopId = row["workshop_id"].ToString(),
                    CreatorId = row["creator_id"].ToString(),
                    StartTime = TimestampHelper.TimestampToDateTime(Convert.ToInt64(row["start_time"])),
                    EndTime = Convert.ToInt64(row["end_time"]) > 0 ? (DateTime?)TimestampHelper.TimestampToDateTime(Convert.ToInt64(row["end_time"])) : null,
                    IsActive = Convert.ToInt32(row["is_active"]) == 1,
                    SimulationSpeed = Convert.ToDouble(row["simulation_speed"]),
                    ParticipantIds = JsonHelper.Deserialize<List<string>>(row["participants"].ToString()) ?? new List<string>(),
                    FaultInstanceIds = JsonHelper.Deserialize<List<string>>(row["faults"].ToString()) ?? new List<string>(),
                    EquipmentSnapshots = JsonHelper.Deserialize<Dictionary<string, string>>(row["snapshots"].ToString()) ?? new Dictionary<string, string>()
                });
            }
            return records;
        }

        public bool InsertFaultInstance(FaultInstance instance)
        {
            try
            {
                var sql = @"
                    INSERT INTO fault_instances (id, fault_code, equipment_id, simulation_id, status, severity, occurred_time, resolved_time, resolved_by, deviations)
                    VALUES (@id, @fault_code, @equipment_id, @simulation_id, @status, @severity, @occurred_time, @resolved_time, @resolved_by, @deviations)";
                ExecuteNonQuery(sql,
                    new SQLiteParameter("@id", instance.Id),
                    new SQLiteParameter("@fault_code", instance.FaultCode),
                    new SQLiteParameter("@equipment_id", instance.EquipmentId),
                    new SQLiteParameter("@simulation_id", instance.SimulationId ?? ""),
                    new SQLiteParameter("@status", (int)instance.Status),
                    new SQLiteParameter("@severity", (int)instance.Severity),
                    new SQLiteParameter("@occurred_time", TimestampHelper.DateTimeToTimestamp(instance.OccurredTime)),
                    new SQLiteParameter("@resolved_time", instance.ResolvedTime.HasValue ? TimestampHelper.DateTimeToTimestamp(instance.ResolvedTime.Value) : 0),
                    new SQLiteParameter("@resolved_by", instance.ResolvedBy ?? ""),
                    new SQLiteParameter("@deviations", JsonHelper.Serialize(instance.ParameterDeviations)));
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"插入故障实例失败: {ex.Message}");
                return false;
            }
        }

        public bool UpdateFaultInstance(FaultInstance instance)
        {
            try
            {
                var sql = @"
                    UPDATE fault_instances 
                    SET status = @status, resolved_time = @resolved_time, resolved_by = @resolved_by
                    WHERE id = @id";
                ExecuteNonQuery(sql,
                    new SQLiteParameter("@status", (int)instance.Status),
                    new SQLiteParameter("@resolved_time", instance.ResolvedTime.HasValue ? TimestampHelper.DateTimeToTimestamp(instance.ResolvedTime.Value) : 0),
                    new SQLiteParameter("@resolved_by", instance.ResolvedBy ?? ""),
                    new SQLiteParameter("@id", instance.Id));
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"更新故障实例失败: {ex.Message}");
                return false;
            }
        }

        private void OnDestroy()
        {
            _connection?.Close();
            _connection?.Dispose();
        }
    }
}
