using System.Collections.Generic;
using IndustrialSimulation.Equipment;
using IndustrialSimulation.FaultSimulation;
using IndustrialSimulation.Shared.Models;
using UnityEngine;

namespace IndustrialSimulation.Scene
{
    public class FaultVisualEffectSystem : MonoBehaviour
    {
        private static FaultVisualEffectSystem _instance;
        public static FaultVisualEffectSystem Instance => _instance;

        [Header("告警图标设置")]
        public float WarningIconHeight = 3.5f;
        public float WarningIconScale = 0.5f;
        public float WarningIconBobSpeed = 2f;
        public float WarningIconBobAmount = 0.2f;

        [Header("闪烁设置")]
        public float FlashSpeed = 3f;
        public Color FlashColorLow = Color.yellow;
        public Color FlashColorMedium = new Color(1f, 0.5f, 0f);
        public Color FlashColorHigh = Color.red;
        public Color FlashColorCritical = new Color(1f, 0f, 0.5f);

        [Header("粒子效果设置")]
        public int SmokeParticleCount = 20;
        public int SparkParticleCount = 15;
        public float ParticleHeight = 1.5f;

        private readonly Dictionary<string, GameObject> _warningIcons = new Dictionary<string, GameObject>();
        private readonly Dictionary<string, ParticleSystem> _smokeEffects = new Dictionary<string, ParticleSystem>();
        private readonly Dictionary<string, ParticleSystem> _sparkEffects = new Dictionary<string, ParticleSystem>();
        private readonly Dictionary<string, Material> _originalMaterials = new Dictionary<string, Material>();
        private readonly Dictionary<string, List<Renderer>> _equipmentRenderers = new Dictionary<string, List<Renderer>>();

        public event Action<string, FaultSeverity> OnFaultEffectStarted;
        public event Action<string> OnFaultEffectStopped;

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

        private void Update()
        {
            UpdateWarningIcons();
            UpdateFlashingEffects();
        }

        public void ShowFaultEffect(EquipmentBase equipment, FaultInstance fault)
        {
            var id = equipment.EquipmentId;

            CreateWarningIcon(equipment, fault);
            CreateSmokeEffect(equipment, fault);
            CreateSparkEffect(equipment, fault);
            StoreOriginalMaterials(equipment);
            StartFlashing(id, fault.Severity);

            OnFaultEffectStarted?.Invoke(id, fault.Severity);
        }

        public void HideFaultEffect(EquipmentBase equipment, string faultInstanceId)
        {
            var id = equipment.EquipmentId;

            var hasOtherFaults = equipment.GetActiveFaults().Exists(f => f.Id != faultInstanceId);

            if (!hasOtherFaults)
            {
                RemoveWarningIcon(id);
                RemoveSmokeEffect(id);
                RemoveSparkEffect(id);
                StopFlashing(id);
                RestoreOriginalMaterials(id);
                OnFaultEffectStopped?.Invoke(id);
            }
            else
            {
                var remainingFault = equipment.GetActiveFaults().Find(f => f.Id != faultInstanceId);
                if (remainingFault != null)
                {
                    RemoveWarningIcon(id);
                    CreateWarningIcon(equipment, remainingFault);
                }
            }
        }

        private void CreateWarningIcon(EquipmentBase equipment, FaultInstance fault)
        {
            var id = equipment.EquipmentId;

            if (_warningIcons.ContainsKey(id))
            {
                Destroy(_warningIcons[id]);
            }

            var iconObj = new GameObject($"WarningIcon_{id}");
            iconObj.transform.SetParent(equipment.transform);
            iconObj.transform.localPosition = new Vector3(0, WarningIconHeight, 0);
            iconObj.transform.localScale = Vector3.one * WarningIconScale;

            var iconQuad = GameObject.CreatePrimitive(PrimitiveType.Quad);
            iconQuad.transform.SetParent(iconObj.transform, false);
            iconQuad.transform.localPosition = Vector3.zero;
            iconQuad.transform.localRotation = Quaternion.Euler(90, 0, 0);

            var iconRenderer = iconQuad.GetComponent<Renderer>();
            var iconMat = new Material(Shader.Find("Unlit/Transparent"))
            {
                color = GetSeverityColor(fault.Severity)
            };
            iconRenderer.material = iconMat;

            var iconCollider = iconQuad.GetComponent<Collider>();
            if (iconCollider != null) Destroy(iconCollider);

            var labelObj = new GameObject("Label");
            labelObj.transform.SetParent(iconObj.transform, false);
            labelObj.transform.localPosition = new Vector3(0, -0.6f, 0);
            labelObj.transform.localRotation = Quaternion.Euler(90, 0, 0);

            var textMesh = labelObj.AddComponent<TextMesh>();
            textMesh.text = fault.FaultCode;
            textMesh.fontSize = 24;
            textMesh.color = Color.white;
            textMesh.anchor = TextAnchor.MiddleCenter;
            textMesh.alignment = TextAlignment.Center;

            _warningIcons[id] = iconObj;
        }

        private void CreateSmokeEffect(EquipmentBase equipment, FaultInstance fault)
        {
            var id = equipment.EquipmentId;

            if (fault.Severity < FaultSeverity.Medium) return;

            if (_smokeEffects.ContainsKey(id))
            {
                Destroy(_smokeEffects[id].gameObject);
            }

            var smokeObj = new GameObject($"Smoke_{id}");
            smokeObj.transform.SetParent(equipment.transform);
            smokeObj.transform.localPosition = new Vector3(0, ParticleHeight, 0);

            var ps = smokeObj.AddComponent<ParticleSystem>();
            var main = ps.main;
            main.startColor = new Color(0.5f, 0.5f, 0.5f, 0.3f);
            main.startSize = 0.5f;
            main.startSpeed = 1f;
            main.maxParticles = SmokeParticleCount;
            main.startLifetime = 2f;
            main.simulationSpace = ParticleSystemSimulationSpace.World;

            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 15f;
            shape.radius = 0.3f;

            var emission = ps.emission;
            emission.rateOverTime = fault.Severity == FaultSeverity.High ? 10f : 5f;
            emission.rateOverTime = fault.Severity == FaultSeverity.Critical ? 20f : emission.rateOverTime.constant;

            ps.Play();
            _smokeEffects[id] = ps;
        }

        private void CreateSparkEffect(EquipmentBase equipment, FaultInstance fault)
        {
            var id = equipment.EquipmentId;

            if (fault.Severity < FaultSeverity.High) return;

            if (_sparkEffects.ContainsKey(id))
            {
                Destroy(_sparkEffects[id].gameObject);
            }

            var sparkObj = new GameObject($"Spark_{id}");
            sparkObj.transform.SetParent(equipment.transform);
            sparkObj.transform.localPosition = new Vector3(0, ParticleHeight * 0.5f, 0);

            var ps = sparkObj.AddComponent<ParticleSystem>();
            var main = ps.main;
            main.startColor = new Color(1f, 0.8f, 0.2f, 1f);
            main.startSize = 0.1f;
            main.startSpeed = 3f;
            main.maxParticles = SparkParticleCount;
            main.startLifetime = 0.5f;
            main.simulationSpace = ParticleSystemSimulationSpace.World;

            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Sphere;
            shape.radius = 0.2f;

            var emission = ps.emission;
            emission.rateOverTime = fault.Severity == FaultSeverity.Critical ? 15f : 8f;

            var velocity = ps.velocityOverLifetime;
            velocity.enabled = true;
            velocity.speedModifier = 2f;

            ps.Play();
            _sparkEffects[id] = ps;
        }

        private void StoreOriginalMaterials(EquipmentBase equipment)
        {
            var id = equipment.EquipmentId;
            if (_originalMaterials.ContainsKey(id)) return;

            var renderers = new List<Renderer>(equipment.GetComponentsInChildren<Renderer>());
            _equipmentRenderers[id] = renderers;

            if (renderers.Count > 0)
            {
                _originalMaterials[id] = renderers[0].material;
            }
        }

        private void RestoreOriginalMaterials(string equipmentId)
        {
            if (!_originalMaterials.TryGetValue(equipmentId, out var originalMat)) return;
            if (!_equipmentRenderers.TryGetValue(equipmentId, out var renderers)) return;

            foreach (var rend in renderers)
            {
                if (rend != null)
                {
                    rend.material = originalMat;
                }
            }

            _originalMaterials.Remove(equipmentId);
            _equipmentRenderers.Remove(equipmentId);
        }

        private readonly HashSet<string> _flashingEquipments = new HashSet<string>();
        private readonly Dictionary<string, FaultSeverity> _flashSeverities = new Dictionary<string, FaultSeverity>();

        private void StartFlashing(string equipmentId, FaultSeverity severity)
        {
            _flashingEquipments.Add(equipmentId);
            _flashSeverities[equipmentId] = severity;
        }

        private void StopFlashing(string equipmentId)
        {
            _flashingEquipments.Remove(equipmentId);
            _flashSeverities.Remove(equipmentId);
        }

        private void UpdateFlashingEffects()
        {
            foreach (var equipmentId in _flashingEquipments)
            {
                if (!_flashSeverities.TryGetValue(equipmentId, out var severity)) continue;
                if (!_equipmentRenderers.TryGetValue(equipmentId, out var renderers)) continue;

                var flashColor = GetSeverityColor(severity);
                var pulse = (Mathf.Sin(Time.time * FlashSpeed * (int)severity) + 1f) * 0.5f;
                var lerpedColor = Color.Lerp(Color.black, flashColor, pulse);

                foreach (var rend in renderers)
                {
                    if (rend != null && rend.material != null)
                    {
                        rend.material.SetColor("_EmissionColor", lerpedColor);
                        rend.material.EnableKeyword("_EMISSION");
                    }
                }
            }
        }

        private void UpdateWarningIcons()
        {
            foreach (var kvp in _warningIcons)
            {
                var icon = kvp.Value;
                if (icon == null) continue;

                var basePos = icon.transform.localPosition;
                var bobOffset = Mathf.Sin(Time.time * WarningIconBobSpeed) * WarningIconBobAmount;
                icon.transform.localPosition = new Vector3(basePos.x, WarningIconHeight + bobOffset, basePos.z);

                if (Camera.main != null)
                {
                    icon.transform.LookAt(Camera.main.transform);
                    icon.transform.Rotate(0, 180, 0);
                }
            }
        }

        private void RemoveWarningIcon(string equipmentId)
        {
            if (_warningIcons.TryGetValue(equipmentId, out var icon))
            {
                Destroy(icon);
                _warningIcons.Remove(equipmentId);
            }
        }

        private void RemoveSmokeEffect(string equipmentId)
        {
            if (_smokeEffects.TryGetValue(equipmentId, out var ps))
            {
                ps.Stop();
                Destroy(ps.gameObject, 2f);
                _smokeEffects.Remove(equipmentId);
            }
        }

        private void RemoveSparkEffect(string equipmentId)
        {
            if (_sparkEffects.TryGetValue(equipmentId, out var ps))
            {
                ps.Stop();
                Destroy(ps.gameObject, 1f);
                _sparkEffects.Remove(equipmentId);
            }
        }

        private Color GetSeverityColor(FaultSeverity severity)
        {
            return severity switch
            {
                FaultSeverity.Low => FlashColorLow,
                FaultSeverity.Medium => FlashColorMedium,
                FaultSeverity.High => FlashColorHigh,
                FaultSeverity.Critical => FlashColorCritical,
                _ => FlashColorLow
            };
        }

        public void ClearAllEffects()
        {
            foreach (var icon in _warningIcons.Values)
            {
                if (icon != null) Destroy(icon);
            }
            _warningIcons.Clear();

            foreach (var ps in _smokeEffects.Values)
            {
                if (ps != null) Destroy(ps.gameObject);
            }
            _smokeEffects.Clear();

            foreach (var ps in _sparkEffects.Values)
            {
                if (ps != null) Destroy(ps.gameObject);
            }
            _sparkEffects.Clear();

            foreach (var equipmentId in _flashingEquipments)
            {
                RestoreOriginalMaterials(equipmentId);
            }
            _flashingEquipments.Clear();
            _flashSeverities.Clear();
        }
    }
}
