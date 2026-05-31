using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using IndustrialSimulation.Database;
using IndustrialSimulation.Equipment;
using IndustrialSimulation.Shared.Models;
using IndustrialSimulation.Shared.Utils;
using UnityEngine;

namespace IndustrialSimulation.FaultSimulation
{
    [Serializable]
    public class ReplayFrame
    {
        public long Timestamp;
        public float GameTime;
        public List<EquipmentStateFrame> EquipmentStates = new List<EquipmentStateFrame>();
        public List<FaultEventFrame> FaultEvents = new List<FaultEventFrame>();
        public string ActiveFaultIdsJson;
    }

    [Serializable]
    public class EquipmentStateFrame
    {
        public string EquipmentId;
        public EquipmentStatus Status;
        public Dictionary<string, double> Parameters = new Dictionary<string, double>();
        public float PosX, PosY, PosZ;
    }

    [Serializable]
    public class FaultEventFrame
    {
        public string FaultId;
        public string FaultCode;
        public string EquipmentId;
        public FaultSeverity Severity;
        public bool IsNew;
        public bool IsResolved;
    }

    [Serializable]
    public class ReplayHeader
    {
        public string ReplayId;
        public string SimulationName;
        public string ScenarioId;
        public string WorkshopId;
        public long StartTimestamp;
        public long EndTimestamp;
        public int FrameCount;
        public float TotalDuration;
        public int TotalFaults;
        public int ResolvedFaults;
        public string PlayerName;
        public string FinalGrade;
        public int FinalScore;
        public int Version = 2;
        public bool IsCompressed;
    }

    public enum ReplayPlaybackState
    {
        Stopped,
        Playing,
        Paused,
        Seeking
    }

    public class SimulationReplaySystem : MonoBehaviour
    {
        private static SimulationReplaySystem _instance;
        public static SimulationReplaySystem Instance => _instance;

        [Header("录制设置")]
        public float RecordInterval = 0.5f;
        public int MaxFramesPerReplay = 3600;
        public bool AutoSaveOnSimulationEnd = true;
        public bool EnableRecording = true;

        [Header("回放设置")]
        public float[] PlaybackSpeeds = { 0.25f, 0.5f, 1f, 2f, 4f, 8f };

        private ReplayHeader _currentRecording;
        private readonly List<ReplayFrame> _recordedFrames = new List<ReplayFrame>();
        private float _lastRecordTime;
        private bool _isRecording;

        private ReplayHeader _loadedReplay;
        private List<ReplayFrame> _loadedFrames;
        private ReplayPlaybackState _playbackState = ReplayPlaybackState.Stopped;
        private int _currentFrameIndex;
        private float _playbackSpeed = 1f;
        private float _playbackTimer;
        private bool _wasSimulatingBeforePlayback;

        public bool IsRecording => _isRecording;
        public ReplayPlaybackState PlaybackState => _playbackState;
        public float CurrentPlaybackTime => _loadedFrames != null && _currentFrameIndex < _loadedFrames.Count
            ? _loadedFrames[_currentFrameIndex].GameTime
            : 0f;
        public float TotalPlaybackDuration => _loadedReplay?.TotalDuration ?? 0f;
        public int CurrentFrameIndex => _currentFrameIndex;
        public int TotalFrames => _loadedFrames?.Count ?? 0;
        public ReplayHeader LoadedReplay => _loadedReplay;
        public float PlaybackSpeed => _playbackSpeed;

        public event Action<ReplayFrame> OnFramePlayed;
        public event Action OnPlaybackStarted;
        public event Action OnPlaybackPaused;
        public event Action OnPlaybackStopped;
        public event Action<ReplayHeader> OnRecordingSaved;

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

        public void StartRecording(string simulationName, string workshopId, string scenarioId = null)
        {
            if (!EnableRecording) return;

            _currentRecording = new ReplayHeader
            {
                ReplayId = IdGenerator.GenerateId(),
                SimulationName = simulationName,
                WorkshopId = workshopId,
                ScenarioId = scenarioId,
                StartTimestamp = TimestampHelper.GetCurrentTimestamp(),
                PlayerName = Core.GameManager.Instance.PlayerName ?? "Unknown",
                IsCompressed = true
            };

            _recordedFrames.Clear();
            _lastRecordTime = Time.time;
            _isRecording = true;

            Debug.Log($"开始录制回放: {simulationName}");
        }

        public void StopRecording(int totalFaults = 0, int resolvedFaults = 0, string grade = "", int score = 0)
        {
            if (!_isRecording) return;

            _isRecording = false;
            _currentRecording.EndTimestamp = TimestampHelper.GetCurrentTimestamp();
            _currentRecording.FrameCount = _recordedFrames.Count;
            _currentRecording.TotalDuration = _recordedFrames.Count * RecordInterval;
            _currentRecording.TotalFaults = totalFaults;
            _currentRecording.ResolvedFaults = resolvedFaults;
            _currentRecording.FinalGrade = grade;
            _currentRecording.FinalScore = score;

            if (AutoSaveOnSimulationEnd)
            {
                SaveRecording();
            }

            Debug.Log($"录制结束，共 {_recordedFrames.Count} 帧");
        }

        private void Update()
        {
            if (_isRecording)
            {
                UpdateRecording();
            }

            if (_playbackState == ReplayPlaybackState.Playing)
            {
                UpdatePlayback();
            }
        }

        private void UpdateRecording()
        {
            if (Time.time - _lastRecordTime >= RecordInterval)
            {
                if (_recordedFrames.Count >= MaxFramesPerReplay)
                {
                    Debug.LogWarning("已达到最大回放帧数，停止录制");
                    StopRecording();
                    return;
                }

                RecordFrame();
                _lastRecordTime = Time.time;
            }
        }

        private void RecordFrame()
        {
            var frame = new ReplayFrame
            {
                Timestamp = TimestampHelper.GetCurrentTimestamp(),
                GameTime = _recordedFrames.Count * RecordInterval
            };

            var equipmentList = EquipmentManager.Instance.GetAllEquipment();
            foreach (var eq in equipmentList)
            {
                var stateFrame = new EquipmentStateFrame
                {
                    EquipmentId = eq.EquipmentId,
                    Status = eq.CurrentStatus,
                    PosX = eq.transform.position.x,
                    PosY = eq.transform.position.y,
                    PosZ = eq.transform.position.z
                };

                foreach (var param in eq.GetAllParameters())
                {
                    stateFrame.Parameters[param.Key] = param.Value;
                }

                frame.EquipmentStates.Add(stateFrame);
            }

            var activeFaults = FaultSimulationManager.Instance.GetActiveFaults();
            var activeFaultIds = new List<string>();
            foreach (var fault in activeFaults)
            {
                activeFaultIds.Add(fault.Id);

                var faultFrame = new FaultEventFrame
                {
                    FaultId = fault.Id,
                    FaultCode = fault.FaultCode,
                    EquipmentId = fault.EquipmentId,
                    Severity = fault.Severity,
                    IsNew = false,
                    IsResolved = false
                };
                frame.FaultEvents.Add(faultFrame);
            }

            frame.ActiveFaultIdsJson = JsonHelper.Serialize(activeFaultIds);

            _recordedFrames.Add(frame);
        }

        public string SaveRecording(string customPath = null)
        {
            if (_currentRecording == null || _recordedFrames.Count == 0) return null;

            try
            {
                string savePath;
                if (string.IsNullOrEmpty(customPath))
                {
                    savePath = Path.Combine(Application.persistentDataPath,
                        $"Replays/replay_{_currentRecording.ReplayId}.srr");
                    Directory.CreateDirectory(Path.GetDirectoryName(savePath));
                }
                else
                {
                    savePath = customPath;
                }

                var replayData = new
                {
                    Header = _currentRecording,
                    Frames = _recordedFrames
                };

                var json = JsonHelper.Serialize(replayData);
                byte[] data;

                if (_currentRecording.IsCompressed)
                {
                    using (var output = new MemoryStream())
                    {
                        using (var gzip = new GZipStream(output, CompressionLevel.Optimal))
                        {
                            using (var writer = new StreamWriter(gzip))
                            {
                                writer.Write(json);
                            }
                        }
                        data = output.ToArray();
                    }
                }
                else
                {
                    data = System.Text.Encoding.UTF8.GetBytes(json);
                }

                File.WriteAllBytes(savePath, data);

                SaveReplayInfoToDatabase(_currentRecording, savePath);

                OnRecordingSaved?.Invoke(_currentRecording);
                Debug.Log($"回放已保存: {savePath}, 大小: {(data.Length / 1024f):F1}KB");

                return savePath;
            }
            catch (Exception ex)
            {
                Debug.LogError($"保存回放失败: {ex.Message}");
                return null;
            }
        }

        private void SaveReplayInfoToDatabase(ReplayHeader header, string filePath)
        {
            try
            {
                var db = SQLiteManager.Instance;
                if (db == null || !db.IsConnected) return;

                db.ExecuteNonQuery(@"
                    CREATE TABLE IF NOT EXISTS replays (
                        id TEXT PRIMARY KEY,
                        simulation_name TEXT,
                        scenario_id TEXT,
                        workshop_id TEXT,
                        start_time INTEGER,
                        end_time INTEGER,
                        duration REAL,
                        frame_count INTEGER,
                        total_faults INTEGER,
                        resolved_faults INTEGER,
                        player_name TEXT,
                        final_grade TEXT,
                        final_score INTEGER,
                        file_path TEXT
                    )");

                db.ExecuteNonQuery(@"
                    INSERT INTO replays 
                    (id, simulation_name, scenario_id, workshop_id, start_time, end_time, duration, 
                     frame_count, total_faults, resolved_faults, player_name, final_grade, final_score, file_path)
                    VALUES (@id, @name, @scId, @wsId, @start, @end, @dur, @fc, @tf, @rf, @pn, @fg, @fs, @path)",
                    new System.Data.SQLite.SQLiteParameter("@id", header.ReplayId),
                    new System.Data.SQLite.SQLiteParameter("@name", header.SimulationName),
                    new System.Data.SQLite.SQLiteParameter("@scId", header.ScenarioId ?? ""),
                    new System.Data.SQLite.SQLiteParameter("@wsId", header.WorkshopId ?? ""),
                    new System.Data.SQLite.SQLiteParameter("@start", header.StartTimestamp),
                    new System.Data.SQLite.SQLiteParameter("@end", header.EndTimestamp),
                    new System.Data.SQLite.SQLiteParameter("@dur", header.TotalDuration),
                    new System.Data.SQLite.SQLiteParameter("@fc", header.FrameCount),
                    new System.Data.SQLite.SQLiteParameter("@tf", header.TotalFaults),
                    new System.Data.SQLite.SQLiteParameter("@rf", header.ResolvedFaults),
                    new System.Data.SQLite.SQLiteParameter("@pn", header.PlayerName),
                    new System.Data.SQLite.SQLiteParameter("@fg", header.FinalGrade ?? ""),
                    new System.Data.SQLite.SQLiteParameter("@fs", header.FinalScore),
                    new System.Data.SQLite.SQLiteParameter("@path", filePath));
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"保存回放元数据失败: {ex.Message}");
            }
        }

        public bool LoadReplay(string replayId)
        {
            try
            {
                var db = SQLiteManager.Instance;
                if (db == null || !db.IsConnected) return false;

                var dt = db.ExecuteQuery("SELECT file_path FROM replays WHERE id = @id",
                    new System.Data.SQLite.SQLiteParameter("@id", replayId));
                if (dt == null || dt.Rows.Count == 0) return false;

                var filePath = dt.Rows[0]["file_path"].ToString();
                return LoadReplayFromFile(filePath);
            }
            catch (Exception ex)
            {
                Debug.LogError($"加载回放失败: {ex.Message}");
                return false;
            }
        }

        public bool LoadReplayFromFile(string filePath)
        {
            try
            {
                if (!File.Exists(filePath))
                {
                    Debug.LogError($"回放文件不存在: {filePath}");
                    return false;
                }

                var data = File.ReadAllBytes(filePath);
                string json;

                if (filePath.EndsWith(".srr") || data[0] == 0x1f && data[1] == 0x8b)
                {
                    using (var input = new MemoryStream(data))
                    using (var gzip = new GZipStream(input, CompressionMode.Decompress))
                    using (var reader = new StreamReader(gzip))
                    {
                        json = reader.ReadToEnd();
                    }
                }
                else
                {
                    json = System.Text.Encoding.UTF8.GetString(data);
                }

                var replayData = JsonHelper.Deserialize<DynamicReplayData>(json);
                if (replayData == null) return false;

                _loadedReplay = replayData.Header;
                _loadedFrames = replayData.Frames;

                Debug.Log($"加载回放: {_loadedReplay.SimulationName}, 共 {_loadedFrames.Count} 帧");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"加载回放失败: {ex.Message}");
                return false;
            }
        }

        public void StartPlayback()
        {
            if (_loadedFrames == null || _loadedFrames.Count == 0)
            {
                Debug.LogWarning("没有加载的回放");
                return;
            }

            _wasSimulatingBeforePlayback = FaultSimulationManager.Instance.IsSimulationActive;

            if (_wasSimulatingBeforePlayback)
            {
                FaultSimulationManager.Instance.StopSimulation();
            }

            _playbackState = ReplayPlaybackState.Playing;
            _currentFrameIndex = 0;
            _playbackTimer = 0f;

            OnPlaybackStarted?.Invoke();
        }

        public void PausePlayback()
        {
            if (_playbackState == ReplayPlaybackState.Playing)
            {
                _playbackState = ReplayPlaybackState.Paused;
                OnPlaybackPaused?.Invoke();
            }
        }

        public void ResumePlayback()
        {
            if (_playbackState == ReplayPlaybackState.Paused)
            {
                _playbackState = ReplayPlaybackState.Playing;
            }
        }

        public void StopPlayback()
        {
            _playbackState = ReplayPlaybackState.Stopped;
            _currentFrameIndex = 0;

            EquipmentManager.Instance.StartAllEquipment();

            if (_wasSimulatingBeforePlayback)
            {
                FaultSimulationManager.Instance.StartSimulation(
                    "恢复_" + DateTime.Now.ToString("yyyyMMdd_HHmmss"));
            }

            OnPlaybackStopped?.Invoke();
        }

        public void SeekToFrame(int frameIndex)
        {
            if (_loadedFrames == null || frameIndex < 0 || frameIndex >= _loadedFrames.Count)
            {
                return;
            }

            _playbackState = ReplayPlaybackState.Seeking;
            _currentFrameIndex = frameIndex;
            ApplyFrame(_loadedFrames[frameIndex]);
            _playbackState = ReplayPlaybackState.Paused;
        }

        public void SeekToTime(float timeSeconds)
        {
            if (_loadedFrames == null || _loadedFrames.Count == 0) return;

            var frameIndex = Mathf.FloorToInt(timeSeconds / RecordInterval);
            frameIndex = Mathf.Clamp(frameIndex, 0, _loadedFrames.Count - 1);
            SeekToFrame(frameIndex);
        }

        public void SetPlaybackSpeed(int speedIndex)
        {
            if (speedIndex >= 0 && speedIndex < PlaybackSpeeds.Length)
            {
                _playbackSpeed = PlaybackSpeeds[speedIndex];
            }
        }

        public void SetPlaybackSpeed(float speed)
        {
            _playbackSpeed = Mathf.Max(0.1f, speed);
        }

        private void UpdatePlayback()
        {
            _playbackTimer += Time.deltaTime * _playbackSpeed;

            var targetFrameIndex = Mathf.FloorToInt(_playbackTimer / RecordInterval);
            if (targetFrameIndex >= _loadedFrames.Count)
            {
                StopPlayback();
                return;
            }

            if (targetFrameIndex != _currentFrameIndex)
            {
                _currentFrameIndex = targetFrameIndex;
                ApplyFrame(_loadedFrames[_currentFrameIndex]);
            }
        }

        private void ApplyFrame(ReplayFrame frame)
        {
            foreach (var stateFrame in frame.EquipmentStates)
            {
                var equipment = EquipmentManager.Instance.GetEquipment(stateFrame.EquipmentId);
                if (equipment == null) continue;

                equipment.CurrentStatus = stateFrame.Status;

                foreach (var param in stateFrame.Parameters)
                {
                    equipment.SetParameter(param.Key, param.Value);
                }
            }

            var activeFaultIds = new HashSet<string>();
            if (!string.IsNullOrEmpty(frame.ActiveFaultIdsJson))
            {
                var ids = JsonHelper.Deserialize<List<string>>(frame.ActiveFaultIdsJson);
                if (ids != null)
                {
                    activeFaultIds = new HashSet<string>(ids);
                }
            }

            foreach (var faultFrame in frame.FaultEvents)
            {
                if (faultFrame.IsNew && !faultFrame.IsResolved)
                {
                    var equipment = EquipmentManager.Instance.GetEquipment(faultFrame.EquipmentId);
                    if (equipment != null && !equipment.HasFault)
                    {
                        var fault = new FaultInstance
                        {
                            Id = faultFrame.FaultId,
                            FaultCode = faultFrame.FaultCode,
                            EquipmentId = faultFrame.EquipmentId,
                            Severity = faultFrame.Severity
                        };
                        equipment.ApplyFault(fault);
                    }
                }
                else if (faultFrame.IsResolved)
                {
                    var equipment = EquipmentManager.Instance.GetEquipment(faultFrame.EquipmentId);
                    equipment?.ResolveFault(faultFrame.FaultId);
                }
            }

            OnFramePlayed?.Invoke(frame);
        }

        public List<ReplayHeader> GetReplayList(int limit = 50)
        {
            var result = new List<ReplayHeader>();
            try
            {
                var db = SQLiteManager.Instance;
                if (db == null || !db.IsConnected) return result;

                var dt = db.ExecuteQuery($"SELECT * FROM replays ORDER BY start_time DESC LIMIT {limit}");
                if (dt == null) return result;

                foreach (System.Data.DataRow row in dt.Rows)
                {
                    result.Add(new ReplayHeader
                    {
                        ReplayId = row["id"].ToString(),
                        SimulationName = row["simulation_name"].ToString(),
                        ScenarioId = row["scenario_id"].ToString(),
                        WorkshopId = row["workshop_id"].ToString(),
                        StartTimestamp = Convert.ToInt64(row["start_time"]),
                        EndTimestamp = Convert.ToInt64(row["end_time"]),
                        TotalDuration = Convert.ToSingle(row["duration"]),
                        FrameCount = Convert.ToInt32(row["frame_count"]),
                        TotalFaults = Convert.ToInt32(row["total_faults"]),
                        ResolvedFaults = Convert.ToInt32(row["resolved_faults"]),
                        PlayerName = row["player_name"].ToString(),
                        FinalGrade = row["final_grade"].ToString(),
                        FinalScore = Convert.ToInt32(row["final_score"])
                    });
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"获取回放列表失败: {ex.Message}");
            }
            return result;
        }

        public void DeleteReplay(string replayId)
        {
            try
            {
                var db = SQLiteManager.Instance;
                if (db == null || !db.IsConnected) return;

                var dt = db.ExecuteQuery("SELECT file_path FROM replays WHERE id = @id",
                    new System.Data.SQLite.SQLiteParameter("@id", replayId));
                if (dt != null && dt.Rows.Count > 0)
                {
                    var filePath = dt.Rows[0]["file_path"].ToString();
                    if (File.Exists(filePath))
                    {
                        File.Delete(filePath);
                    }
                }

                db.ExecuteNonQuery("DELETE FROM replays WHERE id = @id",
                    new System.Data.SQLite.SQLiteParameter("@id", replayId));

                Debug.Log($"已删除回放: {replayId}");
            }
            catch (Exception ex)
            {
                Debug.LogError($"删除回放失败: {ex.Message}");
            }
        }
    }

    [Serializable]
    public class DynamicReplayData
    {
        public ReplayHeader Header;
        public List<ReplayFrame> Frames;
    }
}
