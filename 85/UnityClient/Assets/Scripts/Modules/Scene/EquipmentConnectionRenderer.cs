using System.Collections.Generic;
using IndustrialSimulation.Equipment;
using IndustrialSimulation.FaultSimulation;
using IndustrialSimulation.Shared.Models;
using UnityEngine;

namespace IndustrialSimulation.Scene
{
    public class EquipmentConnectionRenderer : MonoBehaviour
    {
        private static EquipmentConnectionRenderer _instance;
        public static EquipmentConnectionRenderer Instance => _instance;

        [Header("连接线样式")]
        public float PipeRadius = 0.08f;
        public int PipeSegments = 8;
        public float CableRadius = 0.04f;
        public int CableSegments = 6;
        public float ConnectionHeightOffset = 0.5f;

        [Header("流向动画")]
        public float FlowSpeed = 2f;
        public float FlowParticleSpacing = 1f;
        public float FlowParticleScale = 0.06f;

        [Header("颜色")]
        public Color FluidColor = new Color(0.2f, 0.5f, 1f);
        public Color PowerColor = new Color(1f, 0.8f, 0.1f);
        public Color SignalColor = new Color(0.1f, 1f, 0.4f);
        public Color MechanicalColor = new Color(0.6f, 0.6f, 0.6f);
        public Color ThermalColor = new Color(1f, 0.3f, 0.1f);
        public Color DataColor = new Color(0.5f, 0.2f, 1f);

        private readonly List<ConnectionVisual> _connections = new List<ConnectionVisual>();
        private readonly Dictionary<string, List<FlowParticle>> _flowParticles = new Dictionary<string, List<FlowParticle>>();
        private bool _showConnections = true;
        private bool _showFlow = true;

        public bool ShowConnections => _showConnections;
        public bool ShowFlow => _showFlow;

        public event System.Action OnConnectionsUpdated;

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
            if (_showFlow)
            {
                UpdateFlowParticles();
            }
        }

        public void RebuildConnections()
        {
            ClearAllConnections();

            var cascadeSystem = FaultCascadeSystem.Instance;
            if (cascadeSystem == null) return;

            var dependencies = cascadeSystem.GetDependencies();
            var eqManager = IndustrialSimulation.Equipment.EquipmentManager.Instance;

            foreach (var dep in dependencies)
            {
                var sourceEq = eqManager.GetEquipment(dep.SourceId);
                var targetEq = eqManager.GetEquipment(dep.TargetId);

                if (sourceEq == null || targetEq == null) continue;

                CreateConnection(sourceEq, targetEq, dep.Type);
            }

            OnConnectionsUpdated?.Invoke();
        }

        public void CreateConnection(EquipmentBase source, EquipmentBase target, EquipmentDependency.DependencyType type)
        {
            var connectionId = $"{source.EquipmentId}_{target.EquipmentId}";

            var existing = _connections.Find(c => c.Id == connectionId);
            if (existing != null) return;

            var connectionObj = new GameObject($"Connection_{connectionId}");
            connectionObj.transform.SetParent(transform);

            var lineRenderer = connectionObj.AddComponent<LineRenderer>();
            lineRenderer.startWidth = type == EquipmentDependency.DependencyType.FluidFlow ? PipeRadius * 2 : CableRadius * 2;
            lineRenderer.endWidth = lineRenderer.startWidth;
            lineRenderer.material = new Material(Shader.Find("Unlit/Color")) { color = GetDependencyColor(type) };
            lineRenderer.positionCount = 2;

            var startPos = source.transform.position + Vector3.up * ConnectionHeightOffset;
            var endPos = target.transform.position + Vector3.up * ConnectionHeightOffset;
            lineRenderer.SetPosition(0, startPos);
            lineRenderer.SetPosition(1, endPos);

            var visual = new ConnectionVisual
            {
                Id = connectionId,
                SourceEquipment = source,
                TargetEquipment = target,
                DependencyType = type,
                LineRenderer = lineRenderer,
                GameObject = connectionObj
            };

            _connections.Add(visual);

            if (_showFlow)
            {
                CreateFlowParticles(visual);
            }
        }

        private void CreateFlowParticles(ConnectionVisual connection)
        {
            var particles = new List<FlowParticle>();
            var startPos = connection.SourceEquipment.transform.position + Vector3.up * ConnectionHeightOffset;
            var endPos = connection.TargetEquipment.transform.position + Vector3.up * ConnectionHeightOffset;
            var distance = Vector3.Distance(startPos, endPos);
            var particleCount = Mathf.Max(2, (int)(distance / FlowParticleSpacing));

            for (var i = 0; i < particleCount; i++)
            {
                var particleObj = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                particleObj.name = $"FlowParticle_{connection.Id}_{i}";
                particleObj.transform.SetParent(connection.GameObject.transform);
                particleObj.transform.localScale = Vector3.one * FlowParticleScale;

                var renderer = particleObj.GetComponent<Renderer>();
                renderer.material = new Material(Shader.Find("Unlit/Color"))
                {
                    color = GetDependencyColor(connection.DependencyType)
                };

                var collider = particleObj.GetComponent<Collider>();
                if (collider != null) Destroy(collider);

                var particle = new FlowParticle
                {
                    GameObject = particleObj,
                    Progress = (float)i / particleCount,
                    Speed = FlowSpeed
                };

                particles.Add(particle);
            }

            _flowParticles[connection.Id] = particles;
        }

        private void UpdateFlowParticles()
        {
            foreach (var connection in _connections)
            {
                if (!_flowParticles.TryGetValue(connection.Id, out var particles)) continue;
                if (connection.SourceEquipment == null || connection.TargetEquipment == null) continue;

                var sourceActive = connection.SourceEquipment.IsRunning;
                var startPos = connection.SourceEquipment.transform.position + Vector3.up * ConnectionHeightOffset;
                var endPos = connection.TargetEquipment.transform.position + Vector3.up * ConnectionHeightOffset;

                foreach (var particle in particles)
                {
                    if (sourceActive)
                    {
                        particle.Progress += particle.Speed * Time.deltaTime / Vector3.Distance(startPos, endPos);
                        if (particle.Progress > 1f) particle.Progress -= 1f;
                    }

                    var pos = Vector3.Lerp(startPos, endPos, particle.Progress);
                    if (particle.GameObject != null)
                    {
                        particle.GameObject.transform.position = pos;
                        particle.GameObject.SetActive(sourceActive && _showFlow);
                    }
                }

                if (connection.LineRenderer != null)
                {
                    connection.LineRenderer.SetPosition(0, startPos);
                    connection.LineRenderer.SetPosition(1, endPos);
                }
            }
        }

        public void ToggleConnections()
        {
            _showConnections = !_showConnections;
            foreach (var connection in _connections)
            {
                if (connection.GameObject != null)
                {
                    connection.GameObject.SetActive(_showConnections);
                }
            }
        }

        public void ToggleFlow()
        {
            _showFlow = !_showFlow;
            foreach (var particles in _flowParticles.Values)
            {
                foreach (var particle in particles)
                {
                    if (particle.GameObject != null)
                    {
                        particle.GameObject.SetActive(_showFlow);
                    }
                }
            }
        }

        public void ClearAllConnections()
        {
            foreach (var connection in _connections)
            {
                if (connection.GameObject != null)
                {
                    Destroy(connection.GameObject);
                }
            }
            _connections.Clear();
            _flowParticles.Clear();
        }

        private Color GetDependencyColor(EquipmentDependency.DependencyType type)
        {
            return type switch
            {
                EquipmentDependency.DependencyType.FluidFlow => FluidColor,
                EquipmentDependency.DependencyType.PowerSupply => PowerColor,
                EquipmentDependency.DependencyType.ControlSignal => SignalColor,
                EquipmentDependency.DependencyType.MechanicalCoupling => MechanicalColor,
                EquipmentDependency.DependencyType.ThermalLink => ThermalColor,
                EquipmentDependency.DependencyType.DataLink => DataColor,
                _ => Color.white
            };
        }

        public List<ConnectionVisual> GetConnections()
        {
            return new List<ConnectionVisual>(_connections);
        }

        public class ConnectionVisual
        {
            public string Id;
            public EquipmentBase SourceEquipment;
            public EquipmentBase TargetEquipment;
            public EquipmentDependency.DependencyType DependencyType;
            public LineRenderer LineRenderer;
            public GameObject GameObject;
        }

        private class FlowParticle
        {
            public GameObject GameObject;
            public float Progress;
            public float Speed;
        }
    }
}
