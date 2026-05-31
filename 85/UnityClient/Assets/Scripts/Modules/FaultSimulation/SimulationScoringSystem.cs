using System;
using System.Collections.Generic;
using System.Linq;
using IndustrialSimulation.Database;
using IndustrialSimulation.Shared.Models;
using IndustrialSimulation.Shared.Utils;
using UnityEngine;

namespace IndustrialSimulation.FaultSimulation
{
    public class SimulationScoringSystem : MonoBehaviour
    {
        private static SimulationScoringSystem _instance;
        public static SimulationScoringSystem Instance => _instance;

        [Header("评分权重")]
        public float ResponseTimeWeight = 30f;
        public float ResolutionRateWeight = 30f;
        public float SeverityHandlingWeight = 20f;
        public float CascadePreventionWeight = 20f;

        [Header("时间评分")]
        public float ExcellentResponseSeconds = 10f;
        public float GoodResponseSeconds = 30f;
        public float AcceptableResponseSeconds = 60f;

        [Header("严重度处理加分")]
        public int LowFaultPoints = 5;
        public int MediumFaultPoints = 15;
        public int HighFaultPoints = 30;
        public int CriticalFaultPoints = 50;

        private readonly Dictionary<string, FaultResponseRecord> _faultResponses = new Dictionary<string, FaultResponseRecord>();
        private int _totalFaultsInjected;
        private int _totalFaultsResolved;
        private int _cascadeEventsPrevented;
        private int _cascadeEventsOccurred;
        private float _simulationStartTime;

        public event Action<SimulationScore> OnScoreUpdated;
        public event Action<FaultResponseRecord> OnFaultResponseRecorded;

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

        public void OnSimulationStarted()
        {
            _faultResponses.Clear();
            _totalFaultsInjected = 0;
            _totalFaultsResolved = 0;
            _cascadeEventsPrevented = 0;
            _cascadeEventsOccurred = 0;
            _simulationStartTime = Time.time;
        }

        public void OnFaultInjected(FaultInstance fault)
        {
            _totalFaultsInjected++;
            _faultResponses[fault.Id] = new FaultResponseRecord
            {
                FaultInstanceId = fault.Id,
                FaultCode = fault.FaultCode,
                EquipmentId = fault.EquipmentId,
                Severity = fault.Severity,
                OccurredTime = DateTime.Now,
                IsResolved = false
            };
        }

        public void OnFaultResolved(FaultInstance fault)
        {
            _totalFaultsResolved++;

            if (_faultResponses.TryGetValue(fault.Id, out var record))
            {
                record.IsResolved = true;
                record.ResolvedTime = fault.ResolvedTime ?? DateTime.Now;
                record.ResolvedBy = fault.ResolvedBy;
                record.ResponseTimeSeconds = (record.ResolvedTime - record.OccurredTime).TotalSeconds;
                record.Score = CalculateFaultScore(record);

                OnFaultResponseRecorded?.Invoke(record);
            }

            UpdateScore();
        }

        public void OnCascadeEvent(bool prevented)
        {
            if (prevented)
            {
                _cascadeEventsPrevented++;
            }
            else
            {
                _cascadeEventsOccurred++;
            }
            UpdateScore();
        }

        private float CalculateFaultScore(FaultResponseRecord record)
        {
            var severityScore = record.Severity switch
            {
                FaultSeverity.Low => LowFaultPoints,
                FaultSeverity.Medium => MediumFaultPoints,
                FaultSeverity.High => HighFaultPoints,
                FaultSeverity.Critical => CriticalFaultPoints,
                _ => LowFaultPoints
            };

            var responseTimeScore = CalculateResponseTimeScore(record.ResponseTimeSeconds);

            var bonusMultiplier = record.Severity switch
            {
                FaultSeverity.Low => 1.0f,
                FaultSeverity.Medium => 1.2f,
                FaultSeverity.High => 1.5f,
                FaultSeverity.Critical => 2.0f,
                _ => 1.0f
            };

            return severityScore * responseTimeScore * bonusMultiplier;
        }

        private float CalculateResponseTimeScore(double responseSeconds)
        {
            if (responseSeconds <= ExcellentResponseSeconds) return 1.0f;
            if (responseSeconds <= GoodResponseSeconds) return 0.8f;
            if (responseSeconds <= AcceptableResponseSeconds) return 0.6f;
            return Mathf.Max(0.1f, 1.0f - (float)(responseSeconds / 300f));
        }

        private void UpdateScore()
        {
            var score = CalculateCurrentScore();
            OnScoreUpdated?.Invoke(score);
        }

        public SimulationScore CalculateCurrentScore()
        {
            var score = new SimulationScore();

            var resolvedRecords = _faultResponses.Values.Where(r => r.IsResolved).ToList();
            var unresolvedRecords = _faultResponses.Values.Where(r => !r.IsResolved).ToList();

            score.TotalFaults = _totalFaultsInjected;
            score.ResolvedFaults = _totalFaultsResolved;
            score.UnresolvedFaults = unresolvedRecords.Count;
            score.CascadeEventsOccurred = _cascadeEventsOccurred;
            score.CascadeEventsPrevented = _cascadeEventsPrevented;

            score.ResolutionRate = _totalFaultsInjected > 0
                ? (float)_totalFaultsResolved / _totalFaultsInjected
                : 1f;

            if (resolvedRecords.Count > 0)
            {
                score.AverageResponseTime = resolvedRecords.Average(r => r.ResponseTimeSeconds);
                score.FastestResponse = resolvedRecords.Min(r => r.ResponseTimeSeconds);
                score.SlowestResponse = resolvedRecords.Max(r => r.ResponseTimeSeconds);
            }

            var totalFaultPoints = 0f;
            foreach (var record in resolvedRecords)
            {
                totalFaultPoints += record.Score;
            }
            score.FaultPoints = totalFaultPoints;

            var avgResponseScore = score.AverageResponseTime > 0
                ? CalculateResponseTimeScore(score.AverageResponseTime)
                : 1f;

            score.ResponseTimeScore = avgResponseScore * ResponseTimeWeight;
            score.ResolutionRateScore = score.ResolutionRate * ResolutionRateWeight;

            var severityDistribution = new Dictionary<FaultSeverity, int>();
            foreach (var record in resolvedRecords)
            {
                if (!severityDistribution.ContainsKey(record.Severity))
                    severityDistribution[record.Severity] = 0;
                severityDistribution[record.Severity]++;
            }
            score.SeverityDistribution = severityDistribution;

            var highSeverityResolved = severityDistribution
                .Where(kvp => kvp.Key >= FaultSeverity.High)
                .Sum(kvp => kvp.Value);
            score.SeverityHandlingScore = resolvedRecords.Count > 0
                ? ((float)highSeverityResolved / resolvedRecords.Count) * SeverityHandlingWeight
                : 0f;

            var totalCascade = _cascadeEventsOccurred + _cascadeEventsPrevented;
            score.CascadePreventionScore = totalCascade > 0
                ? ((float)_cascadeEventsPrevented / totalCascade) * CascadePreventionWeight
                : CascadePreventionWeight;

            score.TotalScore = score.ResponseTimeScore + score.ResolutionRateScore +
                               score.SeverityHandlingScore + score.CascadePreventionScore + totalFaultPoints;

            score.Grade = CalculateGrade(score.TotalScore);

            score.SimulationDuration = Time.time - _simulationStartTime;

            return score;
        }

        private string CalculateGrade(float totalScore)
        {
            if (totalScore >= 90) return "S";
            if (totalScore >= 80) return "A";
            if (totalScore >= 70) return "B";
            if (totalScore >= 60) return "C";
            if (totalScore >= 50) return "D";
            return "F";
        }

        public SimulationAnalysisReport GenerateAnalysisReport()
        {
            var score = CalculateCurrentScore();
            var report = new SimulationAnalysisReport
            {
                GeneratedTime = DateTime.Now,
                Score = score,
                FaultResponses = new List<FaultResponseRecord>(_faultResponses.Values),
                Recommendations = GenerateRecommendations(score)
            };

            SaveReportToDatabase(report);
            return report;
        }

        private List<string> GenerateRecommendations(SimulationScore score)
        {
            var recommendations = new List<string>();

            if (score.ResolutionRate < 0.8f)
            {
                recommendations.Add("故障解决率偏低，建议加强对设备故障的快速响应训练");
            }

            if (score.AverageResponseTime > GoodResponseSeconds)
            {
                recommendations.Add("平均响应时间较长，建议优化故障检测和通报流程");
            }

            if (score.CascadeEventsOccurred > 0)
            {
                recommendations.Add($"发生了 {score.CascadeEventsOccurred} 次级联故障，建议建立更完善的设备隔离机制");
            }

            if (score.UnresolvedFaults > 0)
            {
                recommendations.Add($"有 {score.UnresolvedFaults} 个未解决的故障，请确保推演结束前处理所有故障");
            }

            if (score.SeverityDistribution.ContainsKey(FaultSeverity.Critical) &&
                score.SeverityDistribution[FaultSeverity.Critical] > 2)
            {
                recommendations.Add("严重故障频发，建议加强预防性维护策略");
            }

            if (recommendations.Count == 0)
            {
                recommendations.Add("表现优秀！继续保持高效的故障响应能力");
            }

            return recommendations;
        }

        private void SaveReportToDatabase(SimulationAnalysisReport report)
        {
            try
            {
                var db = SQLiteManager.Instance;
                if (db == null || !db.IsConnected) return;

                db.ExecuteNonQuery(@"
                    CREATE TABLE IF NOT EXISTS simulation_scores (
                        id TEXT PRIMARY KEY,
                        simulation_id TEXT,
                        total_score REAL,
                        grade TEXT,
                        resolution_rate REAL,
                        avg_response_time REAL,
                        fault_points REAL,
                        cascade_occurred INTEGER,
                        cascade_prevented INTEGER,
                        generated_time INTEGER
                    )");

                db.ExecuteNonQuery(@"
                    INSERT INTO simulation_scores (id, simulation_id, total_score, grade, resolution_rate, 
                        avg_response_time, fault_points, cascade_occurred, cascade_prevented, generated_time)
                    VALUES (@id, @simId, @score, @grade, @rate, @avgTime, @points, @cascadeOcc, @cascadePrev, @time)",
                    new System.Data.SQLite.SQLiteParameter("@id", IdGenerator.GenerateId()),
                    new System.Data.SQLite.SQLiteParameter("@simId", FaultSimulationManager.Instance.CurrentSimulationId ?? ""),
                    new System.Data.SQLite.SQLiteParameter("@score", report.Score.TotalScore),
                    new System.Data.SQLite.SQLiteParameter("@grade", report.Score.Grade),
                    new System.Data.SQLite.SQLiteParameter("@rate", report.Score.ResolutionRate),
                    new System.Data.SQLite.SQLiteParameter("@avgTime", report.Score.AverageResponseTime),
                    new System.Data.SQLite.SQLiteParameter("@points", report.Score.FaultPoints),
                    new System.Data.SQLite.SQLiteParameter("@cascadeOcc", report.Score.CascadeEventsOccurred),
                    new System.Data.SQLite.SQLiteParameter("@cascadePrev", report.Score.CascadeEventsPrevented),
                    new System.Data.SQLite.SQLiteParameter("@time", TimestampHelper.DateTimeToTimestamp(report.GeneratedTime)));
            }
            catch (Exception ex)
            {
                Debug.LogError($"保存评分报告失败: {ex.Message}");
            }
        }
    }

    [Serializable]
    public class FaultResponseRecord
    {
        public string FaultInstanceId;
        public string FaultCode;
        public string EquipmentId;
        public FaultSeverity Severity;
        public DateTime OccurredTime;
        public DateTime ResolvedTime;
        public string ResolvedBy;
        public double ResponseTimeSeconds;
        public float Score;
        public bool IsResolved;
    }

    [Serializable]
    public class SimulationScore
    {
        public float TotalScore;
        public string Grade;
        public int TotalFaults;
        public int ResolvedFaults;
        public int UnresolvedFaults;
        public float ResolutionRate;
        public double AverageResponseTime;
        public double FastestResponse;
        public double SlowestResponse;
        public float FaultPoints;
        public float ResponseTimeScore;
        public float ResolutionRateScore;
        public float SeverityHandlingScore;
        public float CascadePreventionScore;
        public int CascadeEventsOccurred;
        public int CascadeEventsPrevented;
        public Dictionary<FaultSeverity, int> SeverityDistribution = new Dictionary<FaultSeverity, int>();
        public float SimulationDuration;
    }

    [Serializable]
    public class SimulationAnalysisReport
    {
        public DateTime GeneratedTime;
        public SimulationScore Score;
        public List<FaultResponseRecord> FaultResponses = new List<FaultResponseRecord>();
        public List<string> Recommendations = new List<string>();
    }
}
