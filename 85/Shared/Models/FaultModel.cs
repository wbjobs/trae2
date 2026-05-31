using System;
using System.Collections.Generic;

namespace IndustrialSimulation.Shared.Models
{
    [Serializable]
    public enum FaultSeverity
    {
        Low,
        Medium,
        High,
        Critical
    }

    [Serializable]
    public enum FaultStatus
    {
        Active,
        Resolved,
        Acknowledged
    }

    [Serializable]
    public class FaultDefinition
    {
        public string FaultCode { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public FaultSeverity Severity { get; set; }
        public EquipmentType ApplicableEquipmentType { get; set; }
        public List<string> AffectedParameters { get; set; }
        public double Probability { get; set; }
        public string ResolutionSteps { get; set; }

        public FaultDefinition()
        {
            AffectedParameters = new List<string>();
        }
    }

    [Serializable]
    public class FaultInstance
    {
        public string Id { get; set; }
        public string FaultCode { get; set; }
        public string EquipmentId { get; set; }
        public string SimulationId { get; set; }
        public FaultStatus Status { get; set; }
        public FaultSeverity Severity { get; set; }
        public DateTime OccurredTime { get; set; }
        public DateTime? ResolvedTime { get; set; }
        public string ResolvedBy { get; set; }
        public Dictionary<string, double> ParameterDeviations { get; set; }

        public FaultInstance()
        {
            ParameterDeviations = new Dictionary<string, double>();
            OccurredTime = DateTime.Now;
        }
    }

    [Serializable]
    public class SimulationRecord
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string WorkshopId { get; set; }
        public string CreatorId { get; set; }
        public DateTime StartTime { get; set; }
        public DateTime? EndTime { get; set; }
        public bool IsActive { get; set; }
        public double SimulationSpeed { get; set; }
        public List<string> ParticipantIds { get; set; }
        public List<string> FaultInstanceIds { get; set; }
        public Dictionary<string, string> EquipmentSnapshots { get; set; }

        public SimulationRecord()
        {
            ParticipantIds = new List<string>();
            FaultInstanceIds = new List<string>();
            EquipmentSnapshots = new Dictionary<string, string>();
            StartTime = DateTime.Now;
            SimulationSpeed = 1.0;
            IsActive = true;
        }
    }
}
