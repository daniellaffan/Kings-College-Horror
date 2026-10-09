// Pool water: a glossy physical surface that reflects the HDRI environment, with two
// scrolling ripple normal maps blended in the shader. `blood` (0..1) turns the water red and
// opaque for the blood-tide set piece; `disturb` adds churn when the Lusca is moving.
import * as THREE from 'three';
import * as T from './textures';

export interface Water {
  mesh: THREE.Mesh;
  uniforms: { time: { value: number }; blood: { value: number }; disturb: { value: number } };
  update(dt: number): void;
}

export function makeWater(width: number, length: number): Water {
  const normal = T.waterNormalTexture();
  const uniforms = { time: { value: 0 }, blood: { value: 0 }, disturb: { value: 0 } };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x3fa7c4,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: 0.72,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.3,
    depthWrite: false,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { wTime: uniforms.time, wBlood: uniforms.blood, wDisturb: uniforms.disturb });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float wTime;\nuniform float wBlood;\nuniform float wDisturb;')
      .replace(
        '#include <normal_fragment_maps>',
        `vec2 nuv = vNormalMapUv;
        vec3 n1 = texture2D(normalMap, nuv + vec2(wTime * 0.02, wTime * 0.013)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, nuv * 1.7 - vec2(wTime * 0.017, -wTime * 0.025)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3((n1.xy + n2.xy) * (1.0 + wDisturb * 3.0), n1.z * n2.z));
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.015, 0.01), wBlood);
        diffuseColor.a = mix(diffuseColor.a, 0.97, wBlood);`,
      );
  };
  const geo = new THREE.PlaneGeometry(width, length);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * width) / 4, (uv.getY(i) * length) / 4);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  return {
    mesh,
    uniforms,
    update(dt) {
      uniforms.time.value += dt * (1 + uniforms.disturb.value * 4);
      mat.roughness = 0.04 + uniforms.blood.value * 0.1;
    },
  };
}
