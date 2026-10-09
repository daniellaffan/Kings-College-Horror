// WebGL renderer + post-processing chain (AO, bloom, AgX tone mapping, grading, grain, CA).
import * as THREE from 'three';
import {
  BloomEffect,
  BlendFunction,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export type Quality = 'low' | 'high' | 'ultra';

export interface QualitySpec {
  pixelRatio: number;
  shadowMapSize: number;
  ao: boolean;
  aoHalfRes: boolean;
  smaa: boolean;
  anisotropy: number;
}

export const QUALITY: Record<Quality, QualitySpec> = {
  low: { pixelRatio: 1, shadowMapSize: 1024, ao: false, aoHalfRes: true, smaa: false, anisotropy: 2 },
  high: { pixelRatio: Math.min(window.devicePixelRatio, 1.5), shadowMapSize: 2048, ao: true, aoHalfRes: true, smaa: true, anisotropy: 8 },
  ultra: { pixelRatio: Math.min(window.devicePixelRatio, 2), shadowMapSize: 4096, ao: true, aoHalfRes: false, smaa: true, anisotropy: 16 },
};

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900);
  readonly composer: EffectComposer;
  readonly bloom = new BloomEffect({ intensity: 0.6, luminanceThreshold: 0.85, luminanceSmoothing: 0.2, mipmapBlur: true });
  readonly vignette = new VignetteEffect({ offset: 0.3, darkness: 0.45 });
  readonly noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  readonly hueSat = new HueSaturationEffect({ saturation: 0 });
  readonly brightness = new BrightnessContrastEffect({ contrast: 0.05 });
  readonly chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0004, 0.0002), radialModulation: true, modulationOffset: 0.25 });
  readonly toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  private ao: N8AOPostPass;
  private smaaPass: EffectPass;
  quality: Quality;

  constructor(container: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.gl = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: false, stencil: false, depth: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.gl.domElement);

    this.composer = new EffectComposer(this.gl, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new N8AOPostPass(this.scene, this.camera, 1, 1);
    this.ao.configuration.aoRadius = 1.6;
    this.ao.configuration.distanceFalloff = 1;
    this.ao.configuration.intensity = 2.5;
    this.ao.configuration.gammaCorrection = false;
    this.composer.addPass(this.ao);
    this.noise.blendMode.opacity.value = 0.12;
    this.composer.addPass(
      new EffectPass(this.camera, this.bloom, this.toneMapping, this.hueSat, this.brightness, this.vignette, this.noise),
    );
    this.composer.addPass(new EffectPass(this.camera, this.chroma));
    this.smaaPass = new EffectPass(this.camera, new SMAAEffect());
    this.composer.addPass(this.smaaPass);

    this.applyQuality(quality);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get spec(): QualitySpec {
    return QUALITY[this.quality];
  }

  applyQuality(q: Quality) {
    this.quality = q;
    const s = QUALITY[q];
    this.gl.setPixelRatio(s.pixelRatio);
    this.ao.enabled = s.ao;
    this.ao.configuration.halfRes = s.aoHalfRes;
    this.ao.setQualityMode(q === 'ultra' ? 'High' : 'Medium');
    this.smaaPass.enabled = s.smaa;
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.DirectionalLight || o instanceof THREE.SpotLight)) return;
      const light = o;
      if (light.castShadow) {
        const size = light instanceof THREE.DirectionalLight ? s.shadowMapSize : Math.min(1024, s.shadowMapSize);
        light.shadow.mapSize.set(size, size);
        light.shadow.map?.dispose();
        light.shadow.map = null;
      }
    });
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
  }

  render(dt: number) {
    this.composer.render(dt);
  }
}
