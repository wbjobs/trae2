using UnityEngine;

namespace IndustrialSimulation.Equipment
{
    public class PumpEquipment : EquipmentBase
    {
        [Header("泵设备参数阈值")]
        public double MaxFlow = 150.0;
        public double MinFlow = 50.0;
        public double MaxPressure = 4.0;
        public double MaxTemperature = 80.0;
        public double MaxVibration = 5.0;

        protected override void InitializeParameters()
        {
            EquipmentType = Shared.Models.EquipmentType.Pump;
            AddNormalParameter("flow", 100.0);
            AddNormalParameter("pressure", 2.5);
            AddNormalParameter("temperature", 45.0);
            AddNormalParameter("vibration", 2.1);
            AddNormalParameter("efficiency", 85.0);
        }

        protected override void SimulateParameters()
        {
            AddParameterNoise("flow", 2.0);
            AddParameterNoise("pressure", 0.1);
            AddParameterNoise("temperature", 0.5);
            AddParameterNoise("vibration", 0.2);
            AddParameterNoise("efficiency", 0.5);
        }

        protected override void CheckParameterThresholds(string key, double value)
        {
            base.CheckParameterThresholds(key, value);

            bool hasWarning = false;
            switch (key)
            {
                case "flow":
                    hasWarning = value > MaxFlow || value < MinFlow;
                    break;
                case "pressure":
                    hasWarning = value > MaxPressure;
                    break;
                case "temperature":
                    hasWarning = value > MaxTemperature;
                    break;
                case "vibration":
                    hasWarning = value > MaxVibration;
                    break;
            }

            if (hasWarning && CurrentStatus == Shared.Models.EquipmentStatus.Running)
            {
                CurrentStatus = Shared.Models.EquipmentStatus.Warning;
                OnStatusChanged?.Invoke(this);
                UpdateVisualStatus();
            }
        }
    }

    public class MotorEquipment : EquipmentBase
    {
        [Header("电机设备参数阈值")]
        public double MaxCurrent = 50.0;
        public double MaxTemperature = 90.0;
        public double MaxRpmDeviation = 100.0;
        private double _nominalRpm = 1500.0;

        protected override void InitializeParameters()
        {
            EquipmentType = Shared.Models.EquipmentType.Motor;
            AddNormalParameter("current", 25.5);
            AddNormalParameter("voltage", 380.0);
            AddNormalParameter("power", 15.0);
            AddNormalParameter("temperature", 60.0);
            AddNormalParameter("rpm", 1480.0);
        }

        protected override void SimulateParameters()
        {
            AddParameterNoise("current", 1.0);
            AddParameterNoise("voltage", 5.0);
            AddParameterNoise("power", 0.5);
            AddParameterNoise("temperature", 1.0);
            AddParameterNoise("rpm", 5.0);
        }

        protected override void CheckParameterThresholds(string key, double value)
        {
            base.CheckParameterThresholds(key, value);

            bool hasWarning = false;
            switch (key)
            {
                case "current":
                    hasWarning = value > MaxCurrent;
                    break;
                case "temperature":
                    hasWarning = value > MaxTemperature;
                    break;
                case "rpm":
                    hasWarning = Mathf.Abs((float)(value - _nominalRpm)) > MaxRpmDeviation;
                    break;
            }

            if (hasWarning && CurrentStatus == Shared.Models.EquipmentStatus.Running)
            {
                CurrentStatus = Shared.Models.EquipmentStatus.Warning;
                OnStatusChanged?.Invoke(this);
                UpdateVisualStatus();
            }
        }
    }

    public class CompressorEquipment : EquipmentBase
    {
        [Header("压缩机参数阈值")]
        public double MaxPressure = 1.2;
        public double MinPressure = 0.5;
        public double MaxTemperature = 100.0;

        protected override void InitializeParameters()
        {
            EquipmentType = Shared.Models.EquipmentType.Compressor;
            AddNormalParameter("pressure", 0.8);
            AddNormalParameter("flow", 50.0);
            AddNormalParameter("temperature", 70.0);
            AddNormalParameter("power", 22.0);
        }

        protected override void SimulateParameters()
        {
            AddParameterNoise("pressure", 0.05);
            AddParameterNoise("flow", 2.0);
            AddParameterNoise("temperature", 2.0);
            AddParameterNoise("power", 1.0);
        }

        protected override void CheckParameterThresholds(string key, double value)
        {
            base.CheckParameterThresholds(key, value);

            bool hasWarning = false;
            switch (key)
            {
                case "pressure":
                    hasWarning = value > MaxPressure || value < MinPressure;
                    break;
                case "temperature":
                    hasWarning = value > MaxTemperature;
                    break;
            }

            if (hasWarning && CurrentStatus == Shared.Models.EquipmentStatus.Running)
            {
                CurrentStatus = Shared.Models.EquipmentStatus.Warning;
                OnStatusChanged?.Invoke(this);
                UpdateVisualStatus();
            }
        }
    }

    public class ConveyorEquipment : EquipmentBase
    {
        [Header("传送带参数阈值")]
        public double MaxSpeed = 3.0;
        public double MaxLoad = 1000.0;
        public double MinTension = 50.0;
        public double MaxTension = 100.0;

        protected override void InitializeParameters()
        {
            EquipmentType = Shared.Models.EquipmentType.Conveyor;
            AddNormalParameter("speed", 2.0);
            AddNormalParameter("load", 500.0);
            AddNormalParameter("belt_tension", 80.0);
        }

        protected override void SimulateParameters()
        {
            AddParameterNoise("speed", 0.1);
            AddParameterNoise("load", 20.0);
            AddParameterNoise("belt_tension", 2.0);
        }

        protected override void CheckParameterThresholds(string key, double value)
        {
            base.CheckParameterThresholds(key, value);

            bool hasWarning = false;
            switch (key)
            {
                case "speed":
                    hasWarning = value > MaxSpeed;
                    break;
                case "load":
                    hasWarning = value > MaxLoad;
                    break;
                case "belt_tension":
                    hasWarning = value < MinTension || value > MaxTension;
                    break;
            }

            if (hasWarning && CurrentStatus == Shared.Models.EquipmentStatus.Running)
            {
                CurrentStatus = Shared.Models.EquipmentStatus.Warning;
                OnStatusChanged?.Invoke(this);
                UpdateVisualStatus();
            }
        }
    }

    public class BoilerEquipment : EquipmentBase
    {
        [Header("锅炉参数阈值")]
        public double MaxTemperature = 220.0;
        public double MaxPressure = 1.5;
        public double MinWaterLevel = 30.0;
        public double MaxWaterLevel = 90.0;

        protected override void InitializeParameters()
        {
            EquipmentType = Shared.Models.EquipmentType.Boiler;
            AddNormalParameter("temperature", 180.0);
            AddNormalParameter("pressure", 1.0);
            AddNormalParameter("water_level", 75.0);
            AddNormalParameter("fuel_rate", 50.0);
        }

        protected override void SimulateParameters()
        {
            AddParameterNoise("temperature", 3.0);
            AddParameterNoise("pressure", 0.05);
            AddParameterNoise("water_level", 2.0);
            AddParameterNoise("fuel_rate", 3.0);
        }

        protected override void CheckParameterThresholds(string key, double value)
        {
            base.CheckParameterThresholds(key, value);

            bool hasWarning = false;
            switch (key)
            {
                case "temperature":
                    hasWarning = value > MaxTemperature;
                    break;
                case "pressure":
                    hasWarning = value > MaxPressure;
                    break;
                case "water_level":
                    hasWarning = value < MinWaterLevel || value > MaxWaterLevel;
                    break;
            }

            if (hasWarning && CurrentStatus == Shared.Models.EquipmentStatus.Running)
            {
                CurrentStatus = Shared.Models.EquipmentStatus.Warning;
                OnStatusChanged?.Invoke(this);
                UpdateVisualStatus();
            }
        }
    }

    public class ValveEquipment : EquipmentBase
    {
        [Header("阀门参数阈值")]
        public double MaxPressureDiff = 1.0;
        public double MaxOpening = 100.0;

        protected override void InitializeParameters()
        {
            EquipmentType = Shared.Models.EquipmentType.Valve;
            AddNormalParameter("opening", 60.0);
            AddNormalParameter("flow", 30.0);
            AddNormalParameter("pressure_in", 2.0);
            AddNormalParameter("pressure_out", 1.5);
        }

        protected override void SimulateParameters()
        {
            AddParameterNoise("opening", 1.0);
            AddParameterNoise("flow", 1.0);
            AddParameterNoise("pressure_in", 0.05);
            AddParameterNoise("pressure_out", 0.05);
        }

        protected override void CheckParameterThresholds(string key, double value)
        {
            base.CheckParameterThresholds(key, value);

            if (key == "pressure_in" || key == "pressure_out")
            {
                var pressureDiff = GetParameter("pressure_in") - GetParameter("pressure_out");
                if (pressureDiff > MaxPressureDiff && CurrentStatus == Shared.Models.EquipmentStatus.Running)
                {
                    CurrentStatus = Shared.Models.EquipmentStatus.Warning;
                    OnStatusChanged?.Invoke(this);
                    UpdateVisualStatus();
                }
            }
        }
    }

    public class SensorEquipment : EquipmentBase
    {
        [Header("传感器参数阈值")]
        public double MaxDriftPercent = 5.0;

        protected override void InitializeParameters()
        {
            EquipmentType = Shared.Models.EquipmentType.Sensor;
            AddNormalParameter("reading_accuracy", 99.0);
            AddNormalParameter("signal_strength", 85.0);
            AddNormalParameter("response_time", 0.1);
        }

        protected override void SimulateParameters()
        {
            AddParameterNoise("reading_accuracy", 0.5);
            AddParameterNoise("signal_strength", 3.0);
            AddParameterNoise("response_time", 0.01);
        }

        protected override void CheckParameterThresholds(string key, double value)
        {
            base.CheckParameterThresholds(key, value);

            bool hasWarning = false;
            switch (key)
            {
                case "reading_accuracy":
                    hasWarning = value < (100 - MaxDriftPercent);
                    break;
                case "signal_strength":
                    hasWarning = value < 50.0;
                    break;
            }

            if (hasWarning && CurrentStatus == Shared.Models.EquipmentStatus.Running)
            {
                CurrentStatus = Shared.Models.EquipmentStatus.Warning;
                OnStatusChanged?.Invoke(this);
                UpdateVisualStatus();
            }
        }
    }
}
