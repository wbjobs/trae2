using System;
using System.Collections.Generic;
using IndustrialSimulation.Database;
using IndustrialSimulation.Shared.Models;
using UnityEngine;

namespace IndustrialSimulation.Scene
{
    public class WorkshopManager : MonoBehaviour
    {
        private static WorkshopManager _instance;
        public static WorkshopManager Instance => _instance;

        [Header("场景设置")]
        public Transform WorkshopRoot;
        public Material FloorMaterial;
        public Material WallMaterial;

        private readonly Dictionary<string, WorkshopModel> _workshopMap = new Dictionary<string, WorkshopModel>();
        private WorkshopModel _currentWorkshop;
        private GameObject _workshopSceneObj;

        public event Action<WorkshopModel> OnWorkshopChanged;
        public event Action<WorkshopModel> OnWorkshopLoaded;

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
            LoadAllWorkshops();
        }

        private void LoadAllWorkshops()
        {
            var workshops = SQLiteManager.Instance.GetAllWorkshops();
            foreach (var workshop in workshops)
            {
                _workshopMap[workshop.Id] = workshop;
            }
        }

        public List<WorkshopModel> GetAllWorkshops()
        {
            return new List<WorkshopModel>(_workshopMap.Values);
        }

        public WorkshopModel GetCurrentWorkshop()
        {
            return _currentWorkshop;
        }

        public void LoadWorkshop(string workshopId)
        {
            if (!_workshopMap.TryGetValue(workshopId, out var workshop))
            {
                Debug.LogError($"未找到车间: {workshopId}");
                return;
            }

            UnloadCurrentWorkshop();

            _currentWorkshop = workshop;
            CreateWorkshopScene(workshop);

            OnWorkshopChanged?.Invoke(workshop);
            OnWorkshopLoaded?.Invoke(workshop);

            Debug.Log($"已加载车间: {workshop.Name}");
        }

        private void UnloadCurrentWorkshop()
        {
            if (_workshopSceneObj != null)
            {
                Destroy(_workshopSceneObj);
                _workshopSceneObj = null;
            }
            _currentWorkshop = null;
        }

        private void CreateWorkshopScene(WorkshopModel workshop)
        {
            _workshopSceneObj = new GameObject($"Workshop_{workshop.Name}");
            _workshopSceneObj.transform.SetParent(WorkshopRoot ?? transform);

            CreateFloor(_workshopSceneObj.transform);
            CreateWalls(_workshopSceneObj.transform);
            CreateCeiling(_workshopSceneObj.transform);
            CreateLights(_workshopSceneObj.transform);
        }

        private void CreateFloor(Transform parent)
        {
            var floor = GameObject.CreatePrimitive(PrimitiveType.Plane);
            floor.name = "Floor";
            floor.transform.SetParent(parent);
            floor.transform.localPosition = Vector3.zero;
            floor.transform.localScale = new Vector3(5, 1, 5);

            if (FloorMaterial != null)
            {
                floor.GetComponent<Renderer>().material = FloorMaterial;
            }
            else
            {
                floor.GetComponent<Renderer>().material.color = new Color(0.6f, 0.6f, 0.6f);
            }
        }

        private void CreateWalls(Transform parent)
        {
            var wallThickness = 0.5f;
            var wallHeight = 6f;
            var roomSize = 25f;

            var backWall = GameObject.CreatePrimitive(PrimitiveType.Cube);
            backWall.name = "Wall_Back";
            backWall.transform.SetParent(parent);
            backWall.transform.localPosition = new Vector3(0, wallHeight / 2, -roomSize / 2);
            backWall.transform.localScale = new Vector3(roomSize, wallHeight, wallThickness);
            ApplyWallMaterial(backWall);

            var frontWall = GameObject.CreatePrimitive(PrimitiveType.Cube);
            frontWall.name = "Wall_Front";
            frontWall.transform.SetParent(parent);
            frontWall.transform.localPosition = new Vector3(0, wallHeight / 2, roomSize / 2);
            frontWall.transform.localScale = new Vector3(roomSize, wallHeight, wallThickness);
            ApplyWallMaterial(frontWall);

            var leftWall = GameObject.CreatePrimitive(PrimitiveType.Cube);
            leftWall.name = "Wall_Left";
            leftWall.transform.SetParent(parent);
            leftWall.transform.localPosition = new Vector3(-roomSize / 2, wallHeight / 2, 0);
            leftWall.transform.localScale = new Vector3(wallThickness, wallHeight, roomSize);
            ApplyWallMaterial(leftWall);

            var rightWall = GameObject.CreatePrimitive(PrimitiveType.Cube);
            rightWall.name = "Wall_Right";
            rightWall.transform.SetParent(parent);
            rightWall.transform.localPosition = new Vector3(roomSize / 2, wallHeight / 2, 0);
            rightWall.transform.localScale = new Vector3(wallThickness, wallHeight, roomSize);
            ApplyWallMaterial(rightWall);
        }

        private void CreateCeiling(Transform parent)
        {
            var ceiling = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ceiling.name = "Ceiling";
            ceiling.transform.SetParent(parent);
            ceiling.transform.localPosition = new Vector3(0, 6f, 0);
            ceiling.transform.localRotation = Quaternion.Euler(180, 0, 0);
            ceiling.transform.localScale = new Vector3(5, 1, 5);
            ceiling.GetComponent<Renderer>().material.color = new Color(0.8f, 0.8f, 0.8f);
        }

        private void CreateLights(Transform parent)
        {
            for (var i = -1; i <= 1; i++)
            {
                for (var j = -1; j <= 1; j++)
                {
                    var lightObj = new GameObject($"Light_{i}_{j}");
                    lightObj.transform.SetParent(parent);
                    lightObj.transform.localPosition = new Vector3(i * 8, 5.5f, j * 8);

                    var light = lightObj.AddComponent<Light>();
                    light.type = LightType.Point;
                    light.range = 15f;
                    light.intensity = 1.5f;
                    light.color = Color.white;
                }
            }

            var ambientLight = new GameObject("AmbientLight");
            ambientLight.transform.SetParent(parent);
            var dirLight = ambientLight.AddComponent<Light>();
            dirLight.type = LightType.Directional;
            dirLight.intensity = 0.5f;
            dirLight.transform.rotation = Quaternion.Euler(50, 30, 0);
        }

        private void ApplyWallMaterial(GameObject wall)
        {
            if (WallMaterial != null)
            {
                wall.GetComponent<Renderer>().material = WallMaterial;
            }
            else
            {
                wall.GetComponent<Renderer>().material.color = new Color(0.7f, 0.7f, 0.75f);
            }
        }

        public void AddWorkshop(WorkshopModel workshop)
        {
            _workshopMap[workshop.Id] = workshop;
            SQLiteManager.Instance.InsertWorkshop(workshop);
        }

        public void RemoveWorkshop(string workshopId)
        {
            if (_workshopMap.Remove(workshopId))
            {
                if (_currentWorkshop?.Id == workshopId)
                {
                    UnloadCurrentWorkshop();
                }
            }
        }
    }
}
