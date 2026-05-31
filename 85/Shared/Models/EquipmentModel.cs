using System;
using System.Collections.Generic;

namespace IndustrialSimulation.Shared.Models
{
    [Serializable]
    public enum EquipmentType
    {
        Pump,
        Motor,
        Compressor,
        Conveyor,
        Boiler,
        Valve,
        Sensor
    }

    [Serializable]
    public enum EquipmentStatus
    {
        Stopped,
        Running,
        Warning,
        Fault,
        Maintenance
    }

    [Serializable]
    public class EquipmentModel
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public EquipmentType Type { get; set; }
        public EquipmentStatus Status { get; set; }
        public string WorkshopId { get; set; }
        public float PositionX { get; set; }
        public float PositionY { get; set; }
        public float PositionZ { get; set; }
        public Dictionary<string, double> Parameters { get; set; }
        public DateTime CreatedTime { get; set; }
        public DateTime LastUpdateTime { get; set; }

        public EquipmentModel()
        {
            Parameters = new Dictionary<string, double>();
            CreatedTime = DateTime.Now;
            LastUpdateTime = DateTime.Now;
        }

        public EquipmentModel Clone()
        {
            return new EquipmentModel
            {
                Id = Id,
                Name = Name,
                Type = Type,
                Status = Status,
                WorkshopId = WorkshopId,
                PositionX = PositionX,
                PositionY = PositionY,
                PositionZ = PositionZ,
                Parameters = new Dictionary<string, double>(Parameters),
                CreatedTime = CreatedTime,
                LastUpdateTime = LastUpdateTime
            };
        }
    }

    [Serializable]
    public class WorkshopModel
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public List<string> EquipmentIds { get; set; }
        public DateTime CreatedTime { get; set; }

        public WorkshopModel()
        {
            EquipmentIds = new List<string>();
            CreatedTime = DateTime.Now;
        }
    }
}
