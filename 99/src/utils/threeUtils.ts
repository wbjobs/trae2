import * as THREE from 'three';
import type { OrbitControls } from 'three-stdlib';

export function createLineGeometry(
  points: [number, number, number][],
  color: string = '#e87c3e',
  lineWidth: number = 2
): THREE.Line {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array(points.length * 3);
  
  points.forEach((point, i) => {
    vertices[i * 3] = point[0];
    vertices[i * 3 + 1] = point[1];
    vertices[i * 3 + 2] = point[2];
  });
  
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    linewidth: lineWidth,
    transparent: true,
    opacity: 0.9,
  });
  
  const line = new THREE.Line(geometry, material);
  line.userData.isMeasurement = true;
  return line;
}

export function createDashLineGeometry(
  points: [number, number, number][],
  color: string = '#e87c3e',
  dashSize: number = 0.3,
  gapSize: number = 0.2
): THREE.Line {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array(points.length * 3);
  
  points.forEach((point, i) => {
    vertices[i * 3] = point[0];
    vertices[i * 3 + 1] = point[1];
    vertices[i * 3 + 2] = point[2];
  });
  
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  
  const material = new THREE.LineDashedMaterial({
    color: new THREE.Color(color),
    dashSize,
    gapSize,
    transparent: true,
    opacity: 0.8,
  });
  
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  line.userData.isMeasurement = true;
  return line;
}

export function createPointMarker(
  position: [number, number, number],
  color: string = '#e87c3e',
  size: number = 0.15
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(size, 16, 16);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.9,
  });
  
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.set(position[0], position[1], position[2]);
  sphere.userData.isMeasurement = true;
  return sphere;
}

export function createTextSprite(
  text: string,
  position: [number, number, number],
  color: string = '#ffffff',
  fontSize: number = 16,
  backgroundColor: string = 'rgba(26, 35, 50, 0.85)'
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  
  const font = `${fontSize}px 'Source Sans 3', sans-serif`;
  context.font = font;
  
  const textMetrics = context.measureText(text);
  const textWidth = textMetrics.width;
  const padding = 8;
  
  canvas.width = textWidth + padding * 2;
  canvas.height = fontSize + padding * 2;
  
  const newContext = canvas.getContext('2d')!;
  newContext.fillStyle = backgroundColor;
  newContext.fillRect(0, 0, canvas.width, canvas.height);
  newContext.strokeStyle = color;
  newContext.lineWidth = 1;
  newContext.strokeRect(0, 0, canvas.width, canvas.height);
  newContext.font = font;
  newContext.fillStyle = color;
  newContext.textBaseline = 'middle';
  newContext.fillText(text, padding, canvas.height / 2);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  
  const sprite = new THREE.Sprite(material);
  sprite.position.set(position[0], position[1] + 0.5, position[2]);
  sprite.scale.set(canvas.width / 100, canvas.height / 100, 1);
  sprite.userData.isAnnotation = true;
  
  return sprite;
}

export function createPinMarker(
  position: [number, number, number],
  color: string = '#e87c3e'
): THREE.Group {
  const group = new THREE.Group();
  
  const coneGeometry = new THREE.ConeGeometry(0.1, 0.4, 8);
  const coneMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.9,
  });
  const cone = new THREE.Mesh(coneGeometry, coneMaterial);
  cone.position.y = 0.6;
  cone.rotation.x = Math.PI;
  
  const sphereGeometry = new THREE.SphereGeometry(0.12, 16, 16);
  const sphereMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.9,
  });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.y = 0.85;
  
  group.add(cone);
  group.add(sphere);
  group.position.set(position[0], position[1], position[2]);
  group.userData.isAnnotation = true;
  group.userData.type = 'pin';
  
  return group;
}

export function rayIntersectPlane(
  raycaster: THREE.Raycaster,
  planePoint: [number, number, number],
  planeNormal: [number, number, number] = [0, 1, 0]
): THREE.Vector3 | null {
  const plane = new THREE.Plane(
    new THREE.Vector3(planeNormal[0], planeNormal[1], planeNormal[2]),
    -new THREE.Vector3(planePoint[0], planePoint[1], planePoint[2]).dot(
      new THREE.Vector3(planeNormal[0], planeNormal[1], planeNormal[2])
    )
  );
  
  const intersection = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersection);
  
  return intersection.length() > 0 ? intersection : null;
}

export function rayIntersectTerrain(
  raycaster: THREE.Raycaster,
  terrainMesh: THREE.Mesh
): THREE.Intersection | null {
  const intersects = raycaster.intersectObject(terrainMesh, false);
  return intersects.length > 0 ? intersects[0] : null;
}

export function calculateSpatialDistance(
  p1: [number, number, number],
  p2: [number, number, number]
): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function calculateHorizontalDistance(
  p1: [number, number, number],
  p2: [number, number, number]
): number {
  const dx = p2[0] - p1[0];
  const dz = p2[2] - p1[2];
  return Math.sqrt(dx * dx + dz * dz);
}

export function calculateVerticalDistance(
  p1: [number, number, number],
  p2: [number, number, number]
): number {
  return Math.abs(p2[1] - p1[1]);
}

export function calculateNormalFromPoints(
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number]
): [number, number, number] {
  const v1 = new THREE.Vector3(
    p2[0] - p1[0],
    p2[1] - p1[1],
    p2[2] - p1[2]
  );
  const v2 = new THREE.Vector3(
    p3[0] - p1[0],
    p3[1] - p1[1],
    p3[2] - p1[2]
  );
  
  const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
  return [normal.x, normal.y, normal.z];
}

export function calculatePointToPlaneDistance(
  point: [number, number, number],
  planePoint: [number, number, number],
  planeNormal: [number, number, number]
): number {
  const normal = new THREE.Vector3(planeNormal[0], planeNormal[1], planeNormal[2]);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    normal,
    new THREE.Vector3(planePoint[0], planePoint[1], planePoint[2])
  );
  const pointVec = new THREE.Vector3(point[0], point[1], point[2]);
  return Math.abs(plane.distanceToPoint(pointVec));
}

export function smoothCameraMove(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  targetPosition: [number, number, number],
  targetLookAt: [number, number, number],
  duration: number = 1000
): Promise<void> {
  return new Promise((resolve) => {
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const endPosition = new THREE.Vector3(
      targetPosition[0],
      targetPosition[1],
      targetPosition[2]
    );
    const endTarget = new THREE.Vector3(
      targetLookAt[0],
      targetLookAt[1],
      targetLookAt[2]
    );
    
    const startTime = performance.now();
    
    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easeProgress = easeInOutCubic(progress);
      
      camera.position.lerpVectors(startPosition, endPosition, easeProgress);
      controls.target.lerpVectors(startTarget, endTarget, easeProgress);
      controls.update();
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        resolve();
      }
    }
    
    requestAnimationFrame(animate);
  });
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function focusOnFeature(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  featurePosition: [number, number, number],
  distance: number = 10,
  duration: number = 1000
): Promise<void> {
  const cameraOffset = new THREE.Vector3(
    distance * Math.cos(Math.PI / 4),
    distance * Math.sin(Math.PI / 3),
    distance * Math.sin(Math.PI / 4)
  );
  
  const targetPosition: [number, number, number] = [
    featurePosition[0] + cameraOffset.x,
    featurePosition[1] + cameraOffset.y,
    featurePosition[2] + cameraOffset.z,
  ];
  
  return smoothCameraMove(camera, controls, targetPosition, featurePosition, duration);
}

export function createHighlightMaterial(
  originalColor: string,
  highlightColor: string = '#ffffff',
  intensity: number = 0.5
): THREE.MeshStandardMaterial {
  const color = new THREE.Color(originalColor);
  const highlight = new THREE.Color(highlightColor);
  color.lerp(highlight, intensity);
  
  return new THREE.MeshStandardMaterial({
    color,
    emissive: highlight,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.9,
  });
}

export function getWorldPositionFromScreen(
  clientX: number,
  clientY: number,
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  planeY: number = 0
): THREE.Vector3 | null {
  const rect = domElement.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
  const intersection = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersection);
  
  return intersection;
}
