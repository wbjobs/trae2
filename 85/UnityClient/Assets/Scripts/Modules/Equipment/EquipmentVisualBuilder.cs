using System.Collections.Generic;
using IndustrialSimulation.Shared.Models;
using UnityEngine;

namespace IndustrialSimulation.Equipment
{
    public class EquipmentVisualBuilder : MonoBehaviour
    {
        private static readonly Dictionary<EquipmentType, Color> TypeColors = new Dictionary<EquipmentType, Color>
        {
            { EquipmentType.Pump, new Color(0.2f, 0.5f, 0.8f) },
            { EquipmentType.Motor, new Color(0.8f, 0.4f, 0.1f) },
            { EquipmentType.Compressor, new Color(0.5f, 0.5f, 0.6f) },
            { EquipmentType.Conveyor, new Color(0.3f, 0.6f, 0.3f) },
            { EquipmentType.Boiler, new Color(0.7f, 0.2f, 0.2f) },
            { EquipmentType.Valve, new Color(0.6f, 0.6f, 0.2f) },
            { EquipmentType.Sensor, new Color(0.4f, 0.7f, 0.8f) }
        };

        public static GameObject BuildEquipmentVisual(EquipmentType type, Transform parent)
        {
            var root = new GameObject($"{type}_Visual");
            root.transform.SetParent(parent, false);

            switch (type)
            {
                case EquipmentType.Pump:
                    BuildPumpVisual(root.transform);
                    break;
                case EquipmentType.Motor:
                    BuildMotorVisual(root.transform);
                    break;
                case EquipmentType.Compressor:
                    BuildCompressorVisual(root.transform);
                    break;
                case EquipmentType.Conveyor:
                    BuildConveyorVisual(root.transform);
                    break;
                case EquipmentType.Boiler:
                    BuildBoilerVisual(root.transform);
                    break;
                case EquipmentType.Valve:
                    BuildValveVisual(root.transform);
                    break;
                case EquipmentType.Sensor:
                    BuildSensorVisual(root.transform);
                    break;
            }

            var anim = root.AddComponent<EquipmentAnimationController>();
            anim.EquipmentType = type;

            return root;
        }

        private static void BuildPumpVisual(Transform root)
        {
            var body = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            body.name = "PumpBody";
            body.transform.SetParent(root, false);
            body.transform.localPosition = Vector3.zero;
            body.transform.localRotation = Quaternion.Euler(90, 0, 0);
            body.transform.localScale = new Vector3(1.2f, 0.6f, 1.2f);
            SetColor(body, TypeColors[EquipmentType.Pump]);

            var inlet = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            inlet.name = "InletPipe";
            inlet.transform.SetParent(root, false);
            inlet.transform.localPosition = new Vector3(-1.2f, 0, 0);
            inlet.transform.localRotation = Quaternion.Euler(0, 0, 90);
            inlet.transform.localScale = new Vector3(0.3f, 0.6f, 0.3f);
            SetColor(inlet, new Color(0.5f, 0.5f, 0.5f));

            var outlet = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            outlet.name = "OutletPipe";
            outlet.transform.SetParent(root, false);
            outlet.transform.localPosition = new Vector3(1.2f, 0.6f, 0);
            outlet.transform.localRotation = Quaternion.Euler(0, 0, 90);
            outlet.transform.localScale = new Vector3(0.3f, 0.6f, 0.3f);
            SetColor(outlet, new Color(0.5f, 0.5f, 0.5f));

            var basePlate = GameObject.CreatePrimitive(PrimitiveType.Cube);
            basePlate.name = "BasePlate";
            basePlate.transform.SetParent(root, false);
            basePlate.transform.localPosition = new Vector3(0, -0.7f, 0);
            basePlate.transform.localScale = new Vector3(1.8f, 0.15f, 1.2f);
            SetColor(basePlate, new Color(0.4f, 0.4f, 0.4f));

            var impeller = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            impeller.name = "Impeller";
            impeller.transform.SetParent(root, false);
            impeller.transform.localPosition = Vector3.zero;
            impeller.transform.localRotation = Quaternion.Euler(90, 0, 0);
            impeller.transform.localScale = new Vector3(0.8f, 0.05f, 0.8f);
            SetColor(impeller, new Color(0.9f, 0.9f, 0.9f));
        }

        private static void BuildMotorVisual(Transform root)
        {
            var body = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            body.name = "MotorBody";
            body.transform.SetParent(root, false);
            body.transform.localPosition = Vector3.zero;
            body.transform.localRotation = Quaternion.Euler(0, 0, 90);
            body.transform.localScale = new Vector3(0.8f, 1.2f, 0.8f);
            SetColor(body, TypeColors[EquipmentType.Motor]);

            var shaft = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            shaft.name = "Shaft";
            shaft.transform.SetParent(root, false);
            shaft.transform.localPosition = new Vector3(1.5f, 0, 0);
            shaft.transform.localRotation = Quaternion.Euler(0, 0, 90);
            shaft.transform.localScale = new Vector3(0.15f, 0.5f, 0.15f);
            SetColor(shaft, new Color(0.7f, 0.7f, 0.7f));

            var fan = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            fan.name = "CoolingFan";
            fan.transform.SetParent(root, false);
            fan.transform.localPosition = new Vector3(-1.3f, 0, 0);
            fan.transform.localRotation = Quaternion.Euler(0, 0, 90);
            fan.transform.localScale = new Vector3(0.9f, 0.05f, 0.9f);
            SetColor(fan, new Color(0.6f, 0.6f, 0.7f));

            var baseMount = GameObject.CreatePrimitive(PrimitiveType.Cube);
            baseMount.name = "BaseMount";
            baseMount.transform.SetParent(root, false);
            baseMount.transform.localPosition = new Vector3(0, -0.6f, 0);
            baseMount.transform.localScale = new Vector3(2.8f, 0.2f, 1.0f);
            SetColor(baseMount, new Color(0.35f, 0.35f, 0.35f));

            var terminalBox = GameObject.CreatePrimitive(PrimitiveType.Cube);
            terminalBox.name = "TerminalBox";
            terminalBox.transform.SetParent(root, false);
            terminalBox.transform.localPosition = new Vector3(0, 0.6f, 0.3f);
            terminalBox.transform.localScale = new Vector3(0.5f, 0.3f, 0.4f);
            SetColor(terminalBox, new Color(0.3f, 0.3f, 0.3f));
        }

        private static void BuildCompressorVisual(Transform root)
        {
            var tank = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            tank.name = "Tank";
            tank.transform.SetParent(root, false);
            tank.transform.localPosition = Vector3.zero;
            tank.transform.localScale = new Vector3(1.5f, 1.0f, 1.5f);
            SetColor(tank, TypeColors[EquipmentType.Compressor]);

            var dome = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            dome.name = "Dome";
            dome.transform.SetParent(root, false);
            dome.transform.localPosition = new Vector3(0, 1.0f, 0);
            dome.transform.localScale = new Vector3(1.5f, 0.6f, 1.5f);
            SetColor(dome, new Color(0.55f, 0.55f, 0.65f));

            var pipeIn = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            pipeIn.name = "InputPipe";
            pipeIn.transform.SetParent(root, false);
            pipeIn.transform.localPosition = new Vector3(-1.2f, 0, 0);
            pipeIn.transform.localRotation = Quaternion.Euler(0, 0, 90);
            pipeIn.transform.localScale = new Vector3(0.25f, 0.5f, 0.25f);
            SetColor(pipeIn, new Color(0.5f, 0.5f, 0.5f));

            var pipeOut = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            pipeOut.name = "OutputPipe";
            pipeOut.transform.SetParent(root, false);
            pipeOut.transform.localPosition = new Vector3(1.2f, 0.5f, 0);
            pipeOut.transform.localRotation = Quaternion.Euler(0, 0, 90);
            pipeOut.transform.localScale = new Vector3(0.25f, 0.5f, 0.25f);
            SetColor(pipeOut, new Color(0.5f, 0.5f, 0.5f));

            var pressureGauge = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            pressureGauge.name = "PressureGauge";
            pressureGauge.transform.SetParent(root, false);
            pressureGauge.transform.localPosition = new Vector3(0.8f, 0.8f, 0.5f);
            pressureGauge.transform.localScale = new Vector3(0.25f, 0.25f, 0.25f);
            SetColor(pressureGauge, Color.white);

            var legs = new[] { new Vector3(-0.5f, -1.2f, -0.5f), new Vector3(0.5f, -1.2f, -0.5f), new Vector3(-0.5f, -1.2f, 0.5f), new Vector3(0.5f, -1.2f, 0.5f) };
            for (var i = 0; i < legs.Length; i++)
            {
                var leg = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                leg.name = $"Leg_{i}";
                leg.transform.SetParent(root, false);
                leg.transform.localPosition = legs[i];
                leg.transform.localScale = new Vector3(0.15f, 0.4f, 0.15f);
                SetColor(leg, new Color(0.3f, 0.3f, 0.3f));
            }
        }

        private static void BuildConveyorVisual(Transform root)
        {
            var belt = GameObject.CreatePrimitive(PrimitiveType.Cube);
            belt.name = "Belt";
            belt.transform.SetParent(root, false);
            belt.transform.localPosition = Vector3.zero;
            belt.transform.localScale = new Vector3(4.0f, 0.1f, 1.0f);
            SetColor(belt, new Color(0.2f, 0.2f, 0.2f));

            var frame = GameObject.CreatePrimitive(PrimitiveType.Cube);
            frame.name = "Frame";
            frame.transform.SetParent(root, false);
            frame.transform.localPosition = new Vector3(0, -0.15f, 0);
            frame.transform.localScale = new Vector3(4.2f, 0.2f, 1.2f);
            SetColor(frame, TypeColors[EquipmentType.Conveyor]);

            var leftRail = GameObject.CreatePrimitive(PrimitiveType.Cube);
            leftRail.name = "LeftRail";
            leftRail.transform.SetParent(root, false);
            leftRail.transform.localPosition = new Vector3(0, 0.05f, -0.55f);
            leftRail.transform.localScale = new Vector3(4.0f, 0.08f, 0.08f);
            SetColor(leftRail, new Color(0.6f, 0.6f, 0.6f));

            var rightRail = GameObject.CreatePrimitive(PrimitiveType.Cube);
            rightRail.name = "RightRail";
            rightRail.transform.SetParent(root, false);
            rightRail.transform.localPosition = new Vector3(0, 0.05f, 0.55f);
            rightRail.transform.localScale = new Vector3(4.0f, 0.08f, 0.08f);
            SetColor(rightRail, new Color(0.6f, 0.6f, 0.6f));

            var rollerPositions = new float[] { -1.8f, -0.9f, 0f, 0.9f, 1.8f };
            foreach (var xPos in rollerPositions)
            {
                var roller = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                roller.name = $"Roller_{xPos:F1}";
                roller.transform.SetParent(root, false);
                roller.transform.localPosition = new Vector3(xPos, 0.05f, 0);
                roller.transform.localRotation = Quaternion.Euler(0, 0, 90);
                roller.transform.localScale = new Vector3(0.9f, 0.08f, 0.9f);
                SetColor(roller, new Color(0.5f, 0.5f, 0.5f));
            }

            var supports = new float[] { -1.8f, 0f, 1.8f };
            foreach (var xPos in supports)
            {
                var support = GameObject.CreatePrimitive(PrimitiveType.Cube);
                support.name = $"Support_{xPos:F1}";
                support.transform.SetParent(root, false);
                support.transform.localPosition = new Vector3(xPos, -0.6f, 0);
                support.transform.localScale = new Vector3(0.15f, 0.8f, 1.0f);
                SetColor(support, new Color(0.4f, 0.4f, 0.4f));
            }
        }

        private static void BuildBoilerVisual(Transform root)
        {
            var mainBody = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            mainBody.name = "MainBody";
            mainBody.transform.SetParent(root, false);
            mainBody.transform.localPosition = Vector3.zero;
            mainBody.transform.localScale = new Vector3(2.0f, 1.5f, 2.0f);
            SetColor(mainBody, TypeColors[EquipmentType.Boiler]);

            var topDome = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            topDome.name = "TopDome";
            topDome.transform.SetParent(root, false);
            topDome.transform.localPosition = new Vector3(0, 1.5f, 0);
            topDome.transform.localScale = new Vector3(2.0f, 0.8f, 2.0f);
            SetColor(topDome, new Color(0.75f, 0.25f, 0.25f));

            var chimney = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            chimney.name = "Chimney";
            chimney.transform.SetParent(root, false);
            chimney.transform.localPosition = new Vector3(0, 2.5f, 0);
            chimney.transform.localScale = new Vector3(0.4f, 0.8f, 0.4f);
            SetColor(chimney, new Color(0.3f, 0.3f, 0.3f));

            var waterPipe = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            waterPipe.name = "WaterPipe";
            waterPipe.transform.SetParent(root, false);
            waterPipe.transform.localPosition = new Vector3(-1.3f, -0.3f, 0);
            waterPipe.transform.localRotation = Quaternion.Euler(0, 0, 90);
            waterPipe.transform.localScale = new Vector3(0.2f, 0.6f, 0.2f);
            SetColor(waterPipe, new Color(0.3f, 0.3f, 0.8f));

            var steamPipe = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            steamPipe.name = "SteamPipe";
            steamPipe.transform.SetParent(root, false);
            steamPipe.transform.localPosition = new Vector3(1.3f, 0.5f, 0);
            steamPipe.transform.localRotation = Quaternion.Euler(0, 0, 90);
            steamPipe.transform.localScale = new Vector3(0.2f, 0.6f, 0.2f);
            SetColor(steamPipe, new Color(0.8f, 0.3f, 0.3f));

            var gauge = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            gauge.name = "Gauge";
            gauge.transform.SetParent(root, false);
            gauge.transform.localPosition = new Vector3(1.0f, 0.8f, 0.8f);
            gauge.transform.localScale = new Vector3(0.3f, 0.3f, 0.3f);
            SetColor(gauge, Color.white);

            var baseRing = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            baseRing.name = "BaseRing";
            baseRing.transform.SetParent(root, false);
            baseRing.transform.localPosition = new Vector3(0, -1.6f, 0);
            baseRing.transform.localScale = new Vector3(2.3f, 0.2f, 2.3f);
            SetColor(baseRing, new Color(0.35f, 0.35f, 0.35f));
        }

        private static void BuildValveVisual(Transform root)
        {
            var pipeLeft = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            pipeLeft.name = "PipeLeft";
            pipeLeft.transform.SetParent(root, false);
            pipeLeft.transform.localPosition = new Vector3(-0.8f, 0, 0);
            pipeLeft.transform.localRotation = Quaternion.Euler(0, 0, 90);
            pipeLeft.transform.localScale = new Vector3(0.35f, 0.5f, 0.35f);
            SetColor(pipeLeft, new Color(0.5f, 0.5f, 0.5f));

            var pipeRight = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            pipeRight.name = "PipeRight";
            pipeRight.transform.SetParent(root, false);
            pipeRight.transform.localPosition = new Vector3(0.8f, 0, 0);
            pipeRight.transform.localRotation = Quaternion.Euler(0, 0, 90);
            pipeRight.transform.localScale = new Vector3(0.35f, 0.5f, 0.35f);
            SetColor(pipeRight, new Color(0.5f, 0.5f, 0.5f));

            var valveBody = GameObject.CreatePrimitive(PrimitiveType.Cube);
            valveBody.name = "ValveBody";
            valveBody.transform.SetParent(root, false);
            valveBody.transform.localPosition = Vector3.zero;
            valveBody.transform.localScale = new Vector3(0.6f, 0.5f, 0.6f);
            SetColor(valveBody, TypeColors[EquipmentType.Valve]);

            var stem = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            stem.name = "Stem";
            stem.transform.SetParent(root, false);
            stem.transform.localPosition = new Vector3(0, 0.5f, 0);
            stem.transform.localScale = new Vector3(0.1f, 0.5f, 0.1f);
            SetColor(stem, new Color(0.7f, 0.7f, 0.7f));

            var handle = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            handle.name = "Handle";
            handle.transform.SetParent(root, false);
            handle.transform.localPosition = new Vector3(0, 0.9f, 0);
            handle.transform.localRotation = Quaternion.Euler(0, 0, 90);
            handle.transform.localScale = new Vector3(0.1f, 0.5f, 0.1f);
            SetColor(handle, Color.red);

            var flangeLeft = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            flangeLeft.name = "FlangeLeft";
            flangeLeft.transform.SetParent(root, false);
            flangeLeft.transform.localPosition = new Vector3(-0.4f, 0, 0);
            flangeLeft.transform.localRotation = Quaternion.Euler(0, 0, 90);
            flangeLeft.transform.localScale = new Vector3(0.55f, 0.05f, 0.55f);
            SetColor(flangeLeft, new Color(0.4f, 0.4f, 0.4f));

            var flangeRight = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            flangeRight.name = "FlangeRight";
            flangeRight.transform.SetParent(root, false);
            flangeRight.transform.localPosition = new Vector3(0.4f, 0, 0);
            flangeRight.transform.localRotation = Quaternion.Euler(0, 0, 90);
            flangeRight.transform.localScale = new Vector3(0.55f, 0.05f, 0.55f);
            SetColor(flangeRight, new Color(0.4f, 0.4f, 0.4f));
        }

        private static void BuildSensorVisual(Transform root)
        {
            var body = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            body.name = "SensorBody";
            body.transform.SetParent(root, false);
            body.transform.localPosition = Vector3.zero;
            body.transform.localScale = new Vector3(0.3f, 0.3f, 0.3f);
            SetColor(body, TypeColors[EquipmentType.Sensor]);

            var probe = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            probe.name = "Probe";
            probe.transform.SetParent(root, false);
            probe.transform.localPosition = new Vector3(0, -0.3f, 0);
            probe.transform.localScale = new Vector3(0.08f, 0.3f, 0.08f);
            SetColor(probe, new Color(0.7f, 0.7f, 0.7f));

            var lens = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            lens.name = "Lens";
            lens.transform.SetParent(root, false);
            lens.transform.localPosition = new Vector3(0, -0.5f, 0);
            lens.transform.localScale = new Vector3(0.12f, 0.12f, 0.12f);
            SetColor(lens, new Color(0.2f, 0.8f, 1.0f));

            var indicator = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            indicator.name = "IndicatorLED";
            indicator.transform.SetParent(root, false);
            indicator.transform.localPosition = new Vector3(0, 0.2f, 0.15f);
            indicator.transform.localScale = new Vector3(0.08f, 0.08f, 0.08f);
            SetColor(indicator, Color.green);

            var mount = GameObject.CreatePrimitive(PrimitiveType.Cube);
            mount.name = "Mount";
            mount.transform.SetParent(root, false);
            mount.transform.localPosition = new Vector3(0, 0.2f, 0);
            mount.transform.localScale = new Vector3(0.4f, 0.1f, 0.4f);
            SetColor(mount, new Color(0.3f, 0.3f, 0.3f));

            var cable = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            cable.name = "Cable";
            cable.transform.SetParent(root, false);
            cable.transform.localPosition = new Vector3(0.2f, 0.3f, 0);
            cable.transform.localRotation = Quaternion.Euler(0, 0, 45);
            cable.transform.localScale = new Vector3(0.04f, 0.4f, 0.04f);
            SetColor(cable, new Color(0.1f, 0.1f, 0.1f));
        }

        private static void SetColor(GameObject obj, Color color)
        {
            var renderer = obj.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material = new Material(Shader.Find("Standard")) { color = color };
            }
        }

        public static Color GetTypeColor(EquipmentType type)
        {
            return TypeColors.TryGetValue(type, out var color) ? color : Color.gray;
        }
    }

    public class EquipmentAnimationController : MonoBehaviour
    {
        public EquipmentType EquipmentType;
        public bool IsAnimating;

        private float _animationTime;
        private Transform _rotatingPart;
        private Transform _movingPart;

        private void Start()
        {
            FindAnimatableParts();
        }

        private void FindAnimatableParts()
        {
            switch (EquipmentType)
            {
                case EquipmentType.Pump:
                    _rotatingPart = transform.Find("Impeller");
                    break;
                case EquipmentType.Motor:
                    _rotatingPart = transform.Find("Shaft");
                    _movingPart = transform.Find("CoolingFan");
                    break;
                case EquipmentType.Compressor:
                    _rotatingPart = transform.Find("Dome");
                    break;
                case EquipmentType.Conveyor:
                    _rotatingPart = transform.Find("Belt");
                    break;
                case EquipmentType.Boiler:
                    _movingPart = transform.Find("Chimney");
                    break;
                case EquipmentType.Sensor:
                    _rotatingPart = transform.Find("IndicatorLED");
                    break;
            }
        }

        private void Update()
        {
            if (!IsAnimating) return;

            _animationTime += Time.deltaTime;

            switch (EquipmentType)
            {
                case EquipmentType.Pump:
                    if (_rotatingPart != null)
                        _rotatingPart.Rotate(0, 360f * Time.deltaTime * 2f, 0, Space.Self);
                    break;
                case EquipmentType.Motor:
                    if (_rotatingPart != null)
                        _rotatingPart.Rotate(0, 0, 360f * Time.deltaTime * 3f, Space.Self);
                    if (_movingPart != null)
                        _movingPart.Rotate(0, 0, 360f * Time.deltaTime * 4f, Space.Self);
                    break;
                case EquipmentType.Compressor:
                    if (_rotatingPart != null)
                        _rotatingPart.Rotate(0, 30f * Time.deltaTime, 0, Space.Self);
                    break;
                case EquipmentType.Conveyor:
                    if (_rotatingPart != null)
                    {
                        var offset = _rotatingPart.GetComponent<Renderer>()?.material.mainTextureOffset;
                        if (_rotatingPart.GetComponent<Renderer>() != null)
                        {
                            var mat = _rotatingPart.GetComponent<Renderer>().material;
                            mat.mainTextureOffset = new Vector2(mat.mainTextureOffset.x + Time.deltaTime * 0.5f, 0);
                        }
                    }
                    break;
                case EquipmentType.Boiler:
                    break;
                case EquipmentType.Sensor:
                    if (_rotatingPart != null)
                    {
                        var pulse = Mathf.PingPong(_animationTime * 2f, 1f);
                        var renderer = _rotatingPart.GetComponent<Renderer>();
                        if (renderer != null)
                        {
                            renderer.material.color = Color.Lerp(Color.green, Color.black, pulse);
                        }
                    }
                    break;
            }
        }

        public void StartAnimation()
        {
            IsAnimating = true;
        }

        public void StopAnimation()
        {
            IsAnimating = false;
        }
    }
}
