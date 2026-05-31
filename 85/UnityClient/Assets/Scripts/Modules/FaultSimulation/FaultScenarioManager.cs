using System;
using System.Collections.Generic;
using IndustrialSimulation.Database;
using IndustrialSimulation.Shared.Models;
using IndustrialSimulation.Shared.Utils;
using UnityEngine;

namespace IndustrialSimulation.FaultSimulation
{
    [Serializable]
    public class FaultScenario
    {
        public string Id;
        public string Name;
        public string Description;
        public ScenarioDifficulty Difficulty;
        public int EstimatedTimeSeconds;
        public int BaseScore;
        public List<ScenarioEvent> Events = new List<ScenarioEvent>();
        public List<string> ObjectiveDescriptions = new List<string>();
        public bool IsEnabled = true;
        public string Author;
        public DateTime CreatedTime;
    }

    [Serializable]
    public enum ScenarioDifficulty
    {
        Beginner = 1,
        Easy = 2,
        Medium = 3,
        Hard = 4,
        Expert = 5
    }

    [Serializable]
    public class ScenarioEvent
    {
        public string Id;
        public string EventName;
        public double TriggerTimeSeconds;
        public string EquipmentId;
        public string EquipmentName;
        public EquipmentType EquipmentType;
        public string FaultCode;
        public List<string> Hints = new List<string>();
        public bool IsTriggered;
        public double ActualTriggerTime;
        public ScenarioEventType EventType = ScenarioEventType.FaultInjection;
    }

    [Serializable]
    public enum ScenarioEventType
    {
        FaultInjection,
        ParameterChange,
        EquipmentStart,
        EquipmentStop,
        AlertOnly
    }

    [Serializable]
    public class ScenarioProgress
    {
        public string ScenarioId;
        public List<string> TriggeredEventIds = new List<string>();
        public List<string> ResolvedEventIds = new List<string>();
        public double ElapsedTime;
        public bool IsCompleted;
        public int ScoreEarned;
        public string Grade;
    }

    public class FaultScenarioManager : MonoBehaviour
    {
        private static FaultScenarioManager _instance;
        public static FaultScenarioManager Instance => _instance;

        private readonly List<FaultScenario> _scenarios = new List<FaultScenario>();
        private FaultScenario _activeScenario;
        private ScenarioProgress _activeProgress;
        private double _scenarioStartTime;
        private bool _isScenarioRunning;

        public IReadOnlyList<FaultScenario> Scenarios => _scenarios;
        public FaultScenario ActiveScenario => _activeScenario;
        public ScenarioProgress ActiveProgress => _activeProgress;
        public bool IsScenarioRunning => _isScenarioRunning;

        public event Action<FaultScenario> OnScenarioSelected;
        public event Action<FaultScenario> OnScenarioStarted;
        public event Action<FaultScenario, ScenarioProgress> OnScenarioCompleted;
        public event Action<ScenarioEvent> OnScenarioEventTriggered;
        public event Action<ScenarioEvent> OnScenarioEventResolved;

        private void Awake()
        {
            if (_instance == null)
            {
                _instance = this;
                DontDestroyOnLoad(gameObject);
            }
            else
            {
                Destroy(gameObject);
            }
        }

        private void Start()
        {
            LoadBuiltInScenarios();
            LoadCustomScenarios();
        }

        private void LoadBuiltInScenarios()
        {
            var scenarios = new List<FaultScenario>
            {
                new FaultScenario
                {
                    Id = "SCENARIO_001",
                    Name = "新手入门：泵故障排查",
                    Description = "学习基本的故障排查流程。主水泵出现异常，需要找出问题并解决。",
                    Difficulty = ScenarioDifficulty.Beginner,
                    EstimatedTimeSeconds = 180,
                    BaseScore = 100,
                    Author = "System",
                    CreatedTime = DateTime.Now,
                    ObjectiveDescriptions =
                    {
                        "识别泵设备异常",
                        "分析故障原因",
                        "执行故障解决操作"
                    },
                    Events =
                    {
                        new ScenarioEvent
                        {
                            Id = "EVENT_001_1",
                            EventName = "水泵压力下降",
                            TriggerTimeSeconds = 10,
                            EquipmentType = EquipmentType.Pump,
                            FaultCode = "PUMP_001",
                            EventType = ScenarioEventType.FaultInjection,
                            Hints =
                            {
                                "检查泵的振动参数",
                                "检查泵的温度",
                                "可能是轴承故障"
                            }
                        }
                    }
                },
                new FaultScenario
                {
                    Id = "SCENARIO_002",
                    Name = "连锁反应：多故障排除",
                    Description = "多个设备出现关联故障，考验系统思维能力。",
                    Difficulty = ScenarioDifficulty.Medium,
                    EstimatedTimeSeconds = 300,
                    BaseScore = 200,
                    Author = "System",
                    CreatedTime = DateTime.Now,
                    ObjectiveDescriptions =
                    {
                        "处理电机过载故障",
                        "处理连锁的泵故障",
                        "恢复所有设备正常运行"
                    },
                    Events =
                    {
                        new ScenarioEvent
                        {
                            Id = "EVENT_002_1",
                            EventName = "电机过载",
                            TriggerTimeSeconds = 15,
                            EquipmentType = EquipmentType.Motor,
                            FaultCode = "MOTOR_001",
                            EventType = ScenarioEventType.FaultInjection,
                            Hints =
                            {
                                "检查电流异常升高",
                                "检查温度变化",
                                "可能需要降低负载"
                            }
                        },
                        new ScenarioEvent
                        {
                            Id = "EVENT_002_2",
                            EventName = "泵压力异常",
                            TriggerTimeSeconds = 45,
                            EquipmentType = EquipmentType.Pump,
                            FaultCode = "PUMP_001",
                            EventType = ScenarioEventType.FaultInjection,
                            Hints =
                            {
                                "此故障可能与电机有关",
                                "检查联动设备状态"
                            }
                        }
                    }
                },
                new FaultScenario
                {
                    Id = "SCENARIO_003",
                    Name = "紧急响应：锅炉安全",
                    Description = "锅炉设备出现严重异常，需要快速响应防止事故扩大。",
                    Difficulty = ScenarioDifficulty.Hard,
                    EstimatedTimeSeconds = 240,
                    BaseScore = 350,
                    Author = "System",
                    CreatedTime = DateTime.Now,
                    ObjectiveDescriptions =
                    {
                        "快速识别锅炉异常",
                        "执行紧急停机程序",
                        "确保安全后重启设备"
                    },
                    Events =
                    {
                        new ScenarioEvent
                        {
                            Id = "EVENT_003_1",
                            EventName = "锅炉超温",
                            TriggerTimeSeconds = 8,
                            EquipmentType = EquipmentType.Boiler,
                            FaultCode = "BOILER_001",
                            EventType = ScenarioEventType.FaultInjection,
                            Hints =
                            {
                                "温度正在快速上升！",
                                "考虑紧急停机",
                                "检查水位是否正常"
                            }
                        },
                        new ScenarioEvent
                        {
                            Id = "EVENT_003_2",
                            EventName = "阀门泄漏",
                            TriggerTimeSeconds = 25,
                            EquipmentType = EquipmentType.Valve,
                            FaultCode = "VALVE_001",
                            EventType = ScenarioEventType.FaultInjection,
                            Hints =
                            {
                                "可能是压力过高导致",
                                "需要同时修复"
                            }
                        }
                    }
                },
                new FaultScenario
                {
                    Id = "SCENARIO_004",
                    Name = "级联危机：全系统故障",
                    Description = "多个设备同时发生故障，模拟真实工业事故场景。",
                    Difficulty = ScenarioDifficulty.Expert,
                    EstimatedTimeSeconds = 600,
                    BaseScore = 500,
                    Author = "System",
                    CreatedTime = DateTime.Now,
                    ObjectiveDescriptions =
                    {
                        "优先级排序：先处理严重故障",
                        "切断故障传播路径",
                        "逐个恢复设备",
                        "确保系统稳定运行"
                    },
                    Events =
                    {
                        new ScenarioEvent
                        {
                            Id = "EVENT_004_1",
                            EventName = "压缩机故障",
                            TriggerTimeSeconds = 5,
                            EquipmentType = EquipmentType.Compressor,
                            FaultCode = "COMP_001",
                            EventType = ScenarioEventType.FaultInjection,
                            Hints = { "这是级联起点，优先处理" }
                        },
                        new ScenarioEvent
                        {
                            Id = "EVENT_004_2",
                            EventName = "阀门泄漏",
                            TriggerTimeSeconds = 20,
                            EquipmentType = EquipmentType.Valve,
                            FaultCode = "VALVE_001",
                            EventType = ScenarioEventType.FaultInjection,
                            Hints = { "可能由压缩机压力异常导致" }
                        },
                        new ScenarioEvent
                        {
                            Id = "EVENT_004_3",
                            EventName = "传感器漂移",
                            TriggerTimeSeconds = 35,
                            EquipmentType = EquipmentType.Sensor,
                            FaultCode = "SENSOR_001",
                            EventType = ScenarioEventType.FaultInjection,
                            Hints = { "读数可能不准，注意交叉验证" }
                        },
                        new ScenarioEvent
                        {
                            Id = "EVENT_004_4",
                            EventName = "传送带卡顿",
                            TriggerTimeSeconds = 50,
                            EquipmentType = EquipmentType.Conveyor,
                            FaultCode = "CONV_001",
                            EventType = ScenarioEventType.FaultInjection,
                            Hints = { "检查负载是否异常" }
                        }
                    }
                }
            };

            foreach (var scenario in scenarios)
            {
                RegisterScenario(scenario);
            }

            Debug.Log($"已加载 {scenarios.Count} 个内置故障预案");
        }

        private void LoadCustomScenarios()
        {
            try
            {
                var db = SQLiteManager.Instance;
                if (db == null || !db.IsConnected) return;

                var dt = db.ExecuteQuery("SELECT * FROM custom_scenarios");
                if (dt == null) return;

                foreach (System.Data.DataRow row in dt.Rows)
                {
                    try
                    {
                        var json = row["scenario_data"].ToString();
                        var scenario = JsonHelper.Deserialize<FaultScenario>(json);
                        if (scenario != null)
                        {
                            RegisterScenario(scenario);
                        }
                    }
                    catch { }
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"加载自定义场景失败: {ex.Message}");
            }
        }

        public void RegisterScenario(FaultScenario scenario)
        {
            if (string.IsNullOrEmpty(scenario.Id))
            {
                scenario.Id = IdGenerator.GenerateId();
            }

            _scenarios.Add(scenario);
        }

        public FaultScenario GetScenario(string scenarioId)
        {
            return _scenarios.Find(s => s.Id == scenarioId);
        }

        public List<FaultScenario> GetScenariosByDifficulty(ScenarioDifficulty minDifficulty)
        {
            var result = new List<FaultScenario>();
            foreach (var s in _scenarios)
            {
                if (s.Difficulty >= minDifficulty)
                {
                    result.Add(s);
                }
            }
            return result;
        }

        public void SelectScenario(string scenarioId)
        {
            var scenario = GetScenario(scenarioId);
            if (scenario == null)
            {
                Debug.LogError($"场景不存在: {scenarioId}");
                return;
            }

            _activeScenario = scenario;
            OnScenarioSelected?.Invoke(scenario);
            Debug.Log($"已选择场景: {scenario.Name}");
        }

        public void StartScenario(string scenarioId)
        {
            var scenario = GetScenario(scenarioId);
            if (scenario == null)
            {
                Debug.LogError($"场景不存在: {scenarioId}");
                return;
            }

            _activeScenario = scenario;
            _activeProgress = new ScenarioProgress { ScenarioId = scenarioId };
            _scenarioStartTime = Time.time;
            _isScenarioRunning = true;

            foreach (var evt in scenario.Events)
            {
                evt.IsTriggered = false;
                evt.ActualTriggerTime = 0;
            }

            OnScenarioStarted?.Invoke(scenario);
            Debug.Log($"场景开始: {scenario.Name}");
        }

        private void Update()
        {
            if (!_isScenarioRunning || _activeScenario == null) return;

            _activeProgress.ElapsedTime = Time.time - (float)_scenarioStartTime;

            foreach (var evt in _activeScenario.Events)
            {
                if (evt.IsTriggered) continue;
                if (_activeProgress.ElapsedTime >= evt.TriggerTimeSeconds)
                {
                    TriggerScenarioEvent(evt);
                }
            }

            CheckScenarioCompletion();
        }

        private void TriggerScenarioEvent(ScenarioEvent evt)
        {
            evt.IsTriggered = true;
            evt.ActualTriggerTime = _activeProgress.ElapsedTime;
            _activeProgress.TriggeredEventIds.Add(evt.Id);

            var equipment = Equipment.EquipmentManager.Instance.GetEquipmentByType(evt.EquipmentType);
            if (equipment.Count > 0)
            {
                var target = equipment[0];
                evt.EquipmentId = target.EquipmentId;
                evt.EquipmentName = target.EquipmentName;

                switch (evt.EventType)
                {
                    case ScenarioEventType.FaultInjection:
                        GameManager.Instance.InjectFault(target.EquipmentId, evt.FaultCode);
                        break;
                    case ScenarioEventType.EquipmentStart:
                        target.StartEquipment();
                        break;
                    case ScenarioEventType.EquipmentStop:
                        target.StopEquipment();
                        break;
                }
            }

            OnScenarioEventTriggered?.Invoke(evt);
            Debug.Log($"场景事件触发: {evt.EventName}");
        }

        public void MarkEventResolved(string eventId)
        {
            if (_activeProgress == null) return;
            if (_activeProgress.ResolvedEventIds.Contains(eventId)) return;

            _activeProgress.ResolvedEventIds.Add(eventId);

            var evt = _activeScenario?.Events.Find(e => e.Id == eventId);
            if (evt != null)
            {
                OnScenarioEventResolved?.Invoke(evt);
                Debug.Log($"场景事件已解决: {evt.EventName}");
            }
        }

        public void MarkFaultAsScenarioEvent(string faultInstanceId, string equipmentId)
        {
            if (_activeScenario == null || !_isScenarioRunning) return;

            foreach (var evt in _activeScenario.Events)
            {
                if (evt.IsTriggered &&
                    evt.EquipmentId == equipmentId &&
                    !_activeProgress.ResolvedEventIds.Contains(evt.Id))
                {
                    MarkEventResolved(evt.Id);
                    break;
                }
            }
        }

        private void CheckScenarioCompletion()
        {
            if (_activeScenario == null || _activeProgress == null) return;
            if (_activeProgress.IsCompleted) return;

            var totalEvents = _activeScenario.Events.Count;
            var resolvedEvents = _activeProgress.ResolvedEventIds.Count;

            if (resolvedEvents >= totalEvents && totalEvents > 0)
            {
                CompleteScenario();
            }
        }

        private void CompleteScenario()
        {
            if (_activeProgress == null || _activeScenario == null) return;

            _activeProgress.IsCompleted = true;

            var timeBonus = Mathf.Max(0,
                1 - (float)(_activeProgress.ElapsedTime / _activeScenario.EstimatedTimeSeconds));
            _activeProgress.ScoreEarned = (int)(_activeScenario.BaseScore * (0.5f + 0.5f * timeBonus));

            _activeProgress.Grade = CalculateGrade(_activeProgress.ScoreEarned, _activeScenario.BaseScore);

            SaveScenarioResult();

            _isScenarioRunning = false;
            OnScenarioCompleted?.Invoke(_activeScenario, _activeProgress);

            Debug.Log($"场景完成! 得分: {_activeProgress.ScoreEarned}/{_activeScenario.BaseScore} 评级: {_activeProgress.Grade}");
        }

        private string CalculateGrade(int scoreEarned, int baseScore)
        {
            var ratio = (float)scoreEarned / baseScore;
            if (ratio >= 0.95f) return "S";
            if (ratio >= 0.85f) return "A";
            if (ratio >= 0.70f) return "B";
            if (ratio >= 0.55f) return "C";
            if (ratio >= 0.40f) return "D";
            return "F";
        }

        private void SaveScenarioResult()
        {
            try
            {
                var db = SQLiteManager.Instance;
                if (db == null || !db.IsConnected) return;

                db.ExecuteNonQuery(@"
                    CREATE TABLE IF NOT EXISTS scenario_results (
                        id TEXT PRIMARY KEY,
                        scenario_id TEXT,
                        scenario_name TEXT,
                        difficulty INTEGER,
                        score_earned INTEGER,
                        base_score INTEGER,
                        grade TEXT,
                        elapsed_time REAL,
                        completed_time INTEGER,
                        events_triggered INTEGER,
                        events_resolved INTEGER
                    )");

                db.ExecuteNonQuery(@"
                    INSERT INTO scenario_results 
                    (id, scenario_id, scenario_name, difficulty, score_earned, base_score, grade, elapsed_time, completed_time, events_triggered, events_resolved)
                    VALUES (@id, @scId, @scName, @diff, @score, @base, @grade, @time, @cTime, @triggered, @resolved)",
                    new System.Data.SQLite.SQLiteParameter("@id", IdGenerator.GenerateId()),
                    new System.Data.SQLite.SQLiteParameter("@scId", _activeProgress.ScenarioId),
                    new System.Data.SQLite.SQLiteParameter("@scName", _activeScenario.Name),
                    new System.Data.SQLite.SQLiteParameter("@diff", (int)_activeScenario.Difficulty),
                    new System.Data.SQLite.SQLiteParameter("@score", _activeProgress.ScoreEarned),
                    new System.Data.SQLite.SQLiteParameter("@base", _activeScenario.BaseScore),
                    new System.Data.SQLite.SQLiteParameter("@grade", _activeProgress.Grade),
                    new System.Data.SQLite.SQLiteParameter("@time", _activeProgress.ElapsedTime),
                    new System.Data.SQLite.SQLiteParameter("@cTime", TimestampHelper.GetCurrentTimestamp()),
                    new System.Data.SQLite.SQLiteParameter("@triggered", _activeProgress.TriggeredEventIds.Count),
                    new System.Data.SQLite.SQLiteParameter("@resolved", _activeProgress.ResolvedEventIds.Count));
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"保存场景结果失败: {ex.Message}");
            }
        }

        public void StopScenario()
        {
            _isScenarioRunning = false;
            _activeScenario = null;
            _activeProgress = null;
        }

        public List<string> GetAvailableHints(string eventId, int maxHints = 3)
        {
            var evt = _activeScenario?.Events.Find(e => e.Id == eventId);
            if (evt == null) return new List<string>();

            var count = Mathf.Min(maxHints, evt.Hints.Count);
            return evt.Hints.GetRange(0, count);
        }
    }
}
