using UnityEngine;

namespace IndustrialSimulation.Scene
{
    public enum CameraMode
    {
        Orbit,
        FreeRoam,
        Follow,
        TopDown
    }

    public class WorkshopCameraController : MonoBehaviour
    {
        [Header("目标设置")]
        public Transform Target;
        public Vector3 TargetOffset = new Vector3(0, 2, 0);

        [Header("轨道模式参数")]
        public float OrbitDistance = 15f;
        public float OrbitMinDistance = 3f;
        public float OrbitMaxDistance = 50f;
        public float OrbitRotateSpeed = 200f;
        public float OrbitPanSpeed = 20f;
        public float OrbitZoomSpeed = 30f;

        [Header("漫游模式参数")]
        public float MoveSpeed = 10f;
        public float LookSpeed = 200f;
        public float SprintMultiplier = 2.5f;

        [Header("跟随模式参数")]
        public float FollowDistance = 8f;
        public float FollowHeight = 5f;
        public float FollowDamping = 5f;

        [Header("俯视模式参数")]
        public float TopDownHeight = 30f;

        [Header("聚焦动画")]
        public float FocusDuration = 0.8f;
        public AnimationCurve FocusCurve = AnimationCurve.EaseInOut(0, 0, 1, 1);

        [Header("边界限制")]
        public bool UseBounds = true;
        public Vector3 BoundsMin = new Vector3(-20, 1, -20);
        public Vector3 BoundsMax = new Vector3(20, 30, 20);

        private CameraMode _currentMode = CameraMode.Orbit;
        private float _orbitAngleX = 30f;
        private float _orbitAngleY = 45f;
        private Vector3 _orbitTarget = Vector3.zero;
        private bool _isFocusing;
        private Vector3 _focusStartPos;
        private Quaternion _focusStartRot;
        private Vector3 _focusEndPos;
        private Quaternion _focusEndRot;
        private float _focusProgress;
        private Transform _focusTarget;

        private float _freeRotX;
        private float _freeRotY;

        public CameraMode CurrentMode => _currentMode;

        private void Start()
        {
            _orbitTarget = Target != null ? Target.position + TargetOffset : Vector3.zero;
            UpdateOrbitPosition();
        }

        private void Update()
        {
            HandleModeSwitch();
            HandleFocusAnimation();

            switch (_currentMode)
            {
                case CameraMode.Orbit:
                    HandleOrbitMode();
                    break;
                case CameraMode.FreeRoam:
                    HandleFreeRoamMode();
                    break;
                case CameraMode.Follow:
                    HandleFollowMode();
                    break;
                case CameraMode.TopDown:
                    HandleTopDownMode();
                    break;
            }

            ClampPosition();
        }

        private void HandleModeSwitch()
        {
            if (Input.GetKeyDown(KeyCode.F1)) SetCameraMode(CameraMode.Orbit);
            if (Input.GetKeyDown(KeyCode.F2)) SetCameraMode(CameraMode.FreeRoam);
            if (Input.GetKeyDown(KeyCode.F3)) SetCameraMode(CameraMode.Follow);
            if (Input.GetKeyDown(KeyCode.F4)) SetCameraMode(CameraMode.TopDown);
        }

        public void SetCameraMode(CameraMode mode)
        {
            _currentMode = mode;

            if (mode == CameraMode.FreeRoam)
            {
                _freeRotX = transform.eulerAngles.x;
                _freeRotY = transform.eulerAngles.y;
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
            else
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
        }

        private void HandleOrbitMode()
        {
            if (Input.GetMouseButton(1))
            {
                var deltaX = Input.GetAxis("Mouse X") * OrbitRotateSpeed * Time.deltaTime;
                var deltaY = Input.GetAxis("Mouse Y") * OrbitRotateSpeed * Time.deltaTime;

                _orbitAngleY += deltaX;
                _orbitAngleX -= deltaY;
                _orbitAngleX = Mathf.Clamp(_orbitAngleX, -10f, 85f);
            }

            if (Input.GetMouseButton(2))
            {
                var panX = -Input.GetAxis("Mouse X") * OrbitPanSpeed * Time.deltaTime;
                var panY = -Input.GetAxis("Mouse Y") * OrbitPanSpeed * Time.deltaTime;

                var right = transform.right;
                var up = transform.up;
                _orbitTarget += right * panX + up * panY;
            }

            var scroll = Input.GetAxis("Mouse ScrollWheel");
            OrbitDistance -= scroll * OrbitZoomSpeed * Time.deltaTime;
            OrbitDistance = Mathf.Clamp(OrbitDistance, OrbitMinDistance, OrbitMaxDistance);

            UpdateOrbitPosition();
        }

        private void UpdateOrbitPosition()
        {
            var rot = Quaternion.Euler(_orbitAngleX, _orbitAngleY, 0);
            var pos = _orbitTarget + rot * Vector3.back * OrbitDistance;
            transform.position = pos;
            transform.LookAt(_orbitTarget);
        }

        private void HandleFreeRoamMode()
        {
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                SetCameraMode(CameraMode.Orbit);
                return;
            }

            _freeRotX -= Input.GetAxis("Mouse Y") * LookSpeed * Time.deltaTime;
            _freeRotY += Input.GetAxis("Mouse X") * LookSpeed * Time.deltaTime;
            _freeRotX = Mathf.Clamp(_freeRotX, -85f, 85f);

            transform.rotation = Quaternion.Euler(_freeRotX, _freeRotY, 0);

            var moveDir = Vector3.zero;
            if (Input.GetKey(KeyCode.W)) moveDir += transform.forward;
            if (Input.GetKey(KeyCode.S)) moveDir -= transform.forward;
            if (Input.GetKey(KeyCode.A)) moveDir -= transform.right;
            if (Input.GetKey(KeyCode.D)) moveDir += transform.right;
            if (Input.GetKey(KeyCode.Q)) moveDir += Vector3.down;
            if (Input.GetKey(KeyCode.E)) moveDir += Vector3.up;

            var speed = MoveSpeed;
            if (Input.GetKey(KeyCode.LeftShift)) speed *= SprintMultiplier;

            transform.position += moveDir.normalized * speed * Time.deltaTime;
        }

        private void HandleFollowMode()
        {
            if (Target == null) return;

            var targetPos = Target.position + TargetOffset;
            var desiredPos = targetPos - Target.forward * FollowDistance + Vector3.up * FollowHeight;
            transform.position = Vector3.Lerp(transform.position, desiredPos, FollowDamping * Time.deltaTime);

            var lookTarget = targetPos;
            var rot = Quaternion.LookRotation(lookTarget - transform.position);
            transform.rotation = Quaternion.Slerp(transform.rotation, rot, FollowDamping * Time.deltaTime);
        }

        private void HandleTopDownMode()
        {
            if (Target != null)
            {
                var targetPos = Target.position + TargetOffset;
                var desiredPos = new Vector3(targetPos.x, TopDownHeight, targetPos.z);
                transform.position = Vector3.Lerp(transform.position, desiredPos, 5f * Time.deltaTime);
            }
            else
            {
                var desiredPos = new Vector3(_orbitTarget.x, TopDownHeight, _orbitTarget.z);
                transform.position = Vector3.Lerp(transform.position, desiredPos, 5f * Time.deltaTime);
            }

            var scroll = Input.GetAxis("Mouse ScrollWheel");
            TopDownHeight -= scroll * OrbitZoomSpeed * Time.deltaTime;
            TopDownHeight = Mathf.Clamp(TopDownHeight, 5f, 60f);

            if (Input.GetMouseButton(1))
            {
                var panX = -Input.GetAxis("Mouse X") * OrbitPanSpeed * Time.deltaTime;
                var panZ = -Input.GetAxis("Mouse Y") * OrbitPanSpeed * Time.deltaTime;
                _orbitTarget += new Vector3(panX, 0, panZ);
            }

            transform.rotation = Quaternion.Euler(90f, 0, 0);
        }

        public void FocusOnTarget(Transform target, float distance = 8f)
        {
            _focusTarget = target;
            _isFocusing = true;
            _focusProgress = 0f;
            _focusStartPos = transform.position;
            _focusStartRot = transform.rotation;

            var targetPos = target.position + Vector3.up * 2f;
            _focusEndPos = targetPos - transform.forward * distance + Vector3.up * 3f;
            _focusEndRot = Quaternion.LookRotation(targetPos - _focusEndPos);
        }

        public void FocusOnPosition(Vector3 position, float distance = 8f)
        {
            _isFocusing = true;
            _focusProgress = 0f;
            _focusStartPos = transform.position;
            _focusStartRot = transform.rotation;

            _focusEndPos = position + new Vector3(0, distance * 0.4f, -distance);
            _focusEndRot = Quaternion.LookRotation(position - _focusEndPos);
        }

        private void HandleFocusAnimation()
        {
            if (!_isFocusing) return;

            _focusProgress += Time.deltaTime / FocusDuration;
            if (_focusProgress >= 1f)
            {
                _focusProgress = 1f;
                _isFocusing = false;
            }

            var t = FocusCurve.Evaluate(_focusProgress);
            transform.position = Vector3.Lerp(_focusStartPos, _focusEndPos, t);
            transform.rotation = Quaternion.Slerp(_focusStartRot, _focusEndRot, t);
        }

        private void ClampPosition()
        {
            if (!UseBounds) return;

            var pos = transform.position;
            pos.x = Mathf.Clamp(pos.x, BoundsMin.x, BoundsMax.x);
            pos.y = Mathf.Clamp(pos.y, BoundsMin.y, BoundsMax.y);
            pos.z = Mathf.Clamp(pos.z, BoundsMin.z, BoundsMax.z);
            transform.position = pos;
        }

        public void SetOrbitTarget(Vector3 target)
        {
            _orbitTarget = target;
        }

        public void ResetCamera()
        {
            _orbitAngleX = 30f;
            _orbitAngleY = 45f;
            OrbitDistance = 15f;
            _orbitTarget = Target != null ? Target.position + TargetOffset : Vector3.zero;
            SetCameraMode(CameraMode.Orbit);
        }
    }
}
