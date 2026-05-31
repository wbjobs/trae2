import * as THREE from 'three';

interface MaterialKey {
  color: string;
  opacity: number;
  transparent: boolean;
  roughness: number;
  metalness: number;
  side: number;
  vertexColors: boolean;
  wireframe: boolean;
  emissive: string;
  emissiveIntensity: number;
}

class MaterialPool {
  private pool: Map<string, THREE.MeshStandardMaterial> = new Map();

  private generateKey(params: Partial<MaterialKey>): string {
    const defaultKey: MaterialKey = {
      color: '#ffffff',
      opacity: 1,
      transparent: false,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.FrontSide,
      vertexColors: false,
      wireframe: false,
      emissive: '#000000',
      emissiveIntensity: 0,
    };

    const merged = { ...defaultKey, ...params };
    return Object.values(merged).join('|');
  }

  getMaterial(params: Partial<MaterialKey> = {}): THREE.MeshStandardMaterial {
    const key = this.generateKey(params);

    if (this.pool.has(key)) {
      return this.pool.get(key)!;
    }

    const material = new THREE.MeshStandardMaterial({
      color: params.color || '#ffffff',
      transparent: params.opacity !== undefined ? params.opacity < 1 : false,
      opacity: params.opacity ?? 1,
      roughness: params.roughness ?? 0.5,
      metalness: params.metalness ?? 0.1,
      side: (params.side as THREE.Side) ?? THREE.FrontSide,
      vertexColors: params.vertexColors ?? false,
      wireframe: params.wireframe ?? false,
      emissive: params.emissive || '#000000',
      emissiveIntensity: params.emissiveIntensity ?? 0,
    });

    this.pool.set(key, material);
    return material;
  }

  getColorMaterial(color: string | THREE.Color, opacity = 1): THREE.MeshStandardMaterial {
    const colorStr = color instanceof THREE.Color ? '#' + color.getHexString() : color;
    return this.getMaterial({
      color: colorStr,
      opacity,
      transparent: opacity < 1,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
  }

  getBoreholeMaterial(color: string | THREE.Color, isSelected: boolean, opacity = 1): THREE.MeshStandardMaterial {
    const colorStr = color instanceof THREE.Color ? '#' + color.getHexString() : color;
    return this.getMaterial({
      color: colorStr,
      opacity,
      transparent: opacity < 1,
      roughness: 0.7,
      metalness: 0.05,
      emissive: isSelected ? colorStr : '#000000',
      emissiveIntensity: isSelected ? 0.3 : 0,
    });
  }

  getTerrainMaterial(vertexColors = true, wireframe = false): THREE.MeshStandardMaterial {
    return this.getMaterial({
      vertexColors,
      wireframe,
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
  }

  getStratumMaterial(color: string | THREE.Color, isSelected: boolean, opacity = 0.7): THREE.MeshStandardMaterial {
    const colorStr = color instanceof THREE.Color ? '#' + color.getHexString() : color;
    return this.getMaterial({
      color: colorStr,
      opacity,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.6,
      metalness: 0.1,
      emissive: isSelected ? colorStr : '#000000',
      emissiveIntensity: isSelected ? 0.2 : 0,
    });
  }

  clear(): void {
    this.pool.forEach((material) => material.dispose());
    this.pool.clear();
  }

  get size(): number {
    return this.pool.size;
  }
}

export const materialPool = new MaterialPool();
