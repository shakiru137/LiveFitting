import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ─── Landmark data passed in every frame ─────────────────────────────────────
export interface TorsoLandmarks {
  leftShoulder:  { x: number; y: number };
  rightShoulder: { x: number; y: number };
  leftHip:       { x: number; y: number };
  rightHip:      { x: number; y: number };
}

/**
 * GarmentAssetRenderer
 *
 * Root cause of disappearance was:
 *   1. baseQuaternion copied from raw GLB (upside-down orientation)
 *   2. garmentShoulderWidth = boxSize.x * 0.55 → tiny denominator → explosive scale
 *   3. garmentAnchorLocal.y = box.max.y (full model height) × huge scale → targetPosition flies off-screen
 *
 * Fix:
 *   - Apply one-time upright correction (rotation.x = π) to importedModel before all measurements
 *   - Compute garment reference measurements on the CORRECTED model
 *   - Store garmentNativeScale (so world-unit measurements match pixel-space at scale=1)
 *   - Use ONLY Z-tilt rotation (never compose with a raw GLB quaternion)
 *   - Compute scale as: (shoulderWidthWorld / garmentReferenceWidth) — simple, stable ratio
 */
export class GarmentAssetRenderer {
  readonly canvas: HTMLCanvasElement;

  private scene:    THREE.Scene;
  private camera:   THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private loader:   GLTFLoader;

  private modelGroup:    THREE.Group | null = null;
  private importedModel: THREE.Group | null = null;

  // Visual debug helpers
  private shoulderSphere: THREE.Mesh;
  private hipSphere:      THREE.Mesh;
  private necklineSphere: THREE.Mesh;
  private torsoAxisLine:  THREE.Line;
  private boxHelper:      THREE.BoxHelper | null = null;
  private axesHelper:     THREE.AxesHelper | null = null;

  // ── One-time calibration (measured on corrected, unit-scale model) ─────────
  // All stored in LOCAL model space at scale=1, after upright correction applied
  private garmentTopY:          number = 0;     // local Y of neckline (top of bbox)
  private garmentCenterX:       number = 0;     // local X center of bbox
  private garmentCenterZ:       number = 0;     // local Z center of bbox
  private garmentModelH:        number = 1;     // full model height (used for heightScale denominator)
  private garmentModelW:        number = 1;     // full model width  (used for widthScale denominator)
  // Shoulder-seam and torso-span approximations as fractions of full model dimensions
  private garmentShoulderWidth: number = 0.5;   // estimated shoulder seam width (≈ 70% of full width)
  private garmentTorsoHeight:   number = 0.45;  // estimated torso span from neckline to hip (≈ 45% of full height)

  private modelLoaded: boolean = false;

  // Smooth Transform State (independent lerp per channel)
  private currentPos:   THREE.Vector3    = new THREE.Vector3(0, 0, 0);
  private currentRot:   number           = 0;   // Z-rotation radians only
  private currentScale: number           = 1.0;

  private readonly LERP_POS   = 0.18;
  private readonly LERP_ROT   = 0.15;
  private readonly LERP_SCALE = 0.15;

  private animId:     number  = 0;
  private isDisposed: boolean = false;

  // Camera virtual viewport height at Z=0 plane (world units)
  // Camera sits at Z=4; FOV is derived so that VIEWPORT_H world-units fills the canvas height
  private readonly VIEWPORT_H = 2.0;

  constructor(canvas: HTMLCanvasElement) {
    console.count('GarmentAssetRenderer Mounted');
    this.canvas = canvas;
    const width  = canvas.clientWidth  || canvas.width  || 1280;
    const height = canvas.clientHeight || canvas.height || 720;

    // ── Scene ────────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = null;

    // ── Camera ───────────────────────────────────────────────────────────────
    const Z    = 4;
    const fovR = 2 * Math.atan((this.VIEWPORT_H / 2) / Z);
    const fovD = THREE.MathUtils.radToDeg(fovR);
    this.camera = new THREE.PerspectiveCamera(fovD, width / height, 0.01, 500);
    this.camera.position.set(0, 0, Z);
    this.camera.lookAt(0, 0, 0);

    // ── Renderer ─────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // ── Lighting ─────────────────────────────────────────────────────────────
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const dir = new THREE.DirectionalLight(0xffffff, 2.0);
    dir.position.set(5, 10, 7.5);
    this.scene.add(dir);

    // ── 4 Debug Visual Helpers ───────────────────────────────────────────────
    this.shoulderSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    this.scene.add(this.shoulderSphere);

    this.hipSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    this.scene.add(this.hipSphere);

    this.necklineSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    this.scene.add(this.necklineSphere);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    this.torsoAxisLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.scene.add(this.torsoAxisLine);

    this.loader = new GLTFLoader();
    this.startLoop();
  }

  // ── GLB Loading & Calibration ──────────────────────────────────────────────
  public async loadGarmentModel(modelUrl: string = '/models/black_evening_gown.glb') {
    try {
      console.log(`[GarmentAssetRenderer] Loading: "${modelUrl}"`);
      const gltf = await this.loader.loadAsync(modelUrl);
      if (this.isDisposed) return;

      // Clean up previous model
      if (this.modelGroup) this.scene.remove(this.modelGroup);
      if (this.boxHelper)  this.scene.remove(this.boxHelper);
      if (this.axesHelper) this.scene.remove(this.axesHelper);
      this.modelLoaded = false;

      this.importedModel = gltf.scene;

      // ── STEP 1: Apply one-time upright correction ─────────────────────────
      // GLB models are often Z-up or have inverted Y. Rotate 180° around X so
      // +Y faces up and the neckline is at the TOP of the bounding box.
      this.importedModel.rotation.set(Math.PI, 0, 0);
      this.importedModel.position.set(0, 0, 0);
      this.importedModel.scale.set(1, 1, 1);
      this.importedModel.updateMatrixWorld(true);

      this.modelGroup = new THREE.Group();
      this.modelGroup.add(this.importedModel);
      this.scene.add(this.modelGroup);

      // ── STEP 2: Measure CORRECTED bounding box at scale=1 ────────────────
      const box    = new THREE.Box3().setFromObject(this.importedModel);
      const bSize  = box.getSize(new THREE.Vector3());
      const bCtr   = box.getCenter(new THREE.Vector3());

      this.garmentTopY    = box.max.y;          // neckline local Y (top after correction)
      this.garmentCenterX = bCtr.x;
      this.garmentCenterZ = bCtr.z;
      this.garmentModelH  = Math.max(bSize.y, 0.001);
      this.garmentModelW  = Math.max(bSize.x, 0.001);
      // Shoulder seam ≈ 70% of full model width; torso span ≈ 45% of full model height
      this.garmentShoulderWidth = Math.max(bSize.x * 0.70, 0.001);
      this.garmentTorsoHeight   = Math.max(bSize.y * 0.45, 0.001);

      // ── STEP 3: Force all meshes visible, disable frustum culling ─────────
      this.modelGroup.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        mesh.visible = true;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          mat.visible = true;
          mat.transparent = false;
          mat.opacity = 1.0;
        });
      });

      // BoxHelper + AxesHelper at garment root
      this.boxHelper  = new THREE.BoxHelper(this.modelGroup, 0xffff00);
      this.axesHelper = new THREE.AxesHelper(0.3);
      this.scene.add(this.boxHelper);
      this.modelGroup.add(this.axesHelper);

      this.modelLoaded = true;

      console.group('%c👗 Garment Calibration Complete', 'color:#D8B4A0;font-weight:bold');
      console.log('Corrected Box:', { min: box.min, max: box.max, size: bSize, center: bCtr });
      console.log('garmentTopY (neckline local):', this.garmentTopY);
      console.log('garmentModelH:', this.garmentModelH);
      console.log('garmentModelW:', this.garmentModelW);
      console.groupEnd();
    } catch (err) {
      console.error('[GarmentAssetRenderer] Load failed:', err);
    }
  }

  /**
   * Per-frame garment placement.
   *
   * Position: garment.position = shoulderCenter - rotated(necklineLocalOffset * scale)
   *            so the neckline sits exactly at shoulderCenter.
   *
   * Scale: uniform = shoulderWidthWorld / garmentModelW
   *        (shoulder span drives width; height follows proportionally)
   *
   * Rotation: Z-tilt only, clamped ±35°.
   */
  public attachToTorso(
    landmarks: TorsoLandmarks | null,
    canvasW: number,
    canvasH: number,
  ) {
    if (!this.modelGroup || !landmarks || !this.modelLoaded) return;

    const { leftShoulder: ls, rightShoulder: rs, leftHip: lh, rightHip: rh } = landmarks;

    // 1. Pixel-space measurements
    const shoulderCx    = (ls.x + rs.x) / 2;
    const shoulderCy    = (ls.y + rs.y) / 2;
    const hipCx         = (lh.x + rh.x) / 2;
    const hipCy         = (lh.y + rh.y) / 2;
    const torsoAngleRad = Math.atan2(rs.y - ls.y, rs.x - ls.x);

    // 2. World-space conversion
    const aspect  = canvasW / canvasH;
    const vpW     = this.VIEWPORT_H * aspect;

    const toWorldX = (px: number) => ((px / canvasW) - 0.5) * vpW;
    const toWorldY = (py: number) => -((py / canvasH) - 0.5) * this.VIEWPORT_H;

    const shoulderCenterWorld = new THREE.Vector3(toWorldX(shoulderCx), toWorldY(shoulderCy), 0);
    const hipCenterWorld      = new THREE.Vector3(toWorldX(hipCx),      toWorldY(hipCy),      0);

    // 3. Blended physical scale: 45% driven by shoulder width, 55% by torso height.
    //    Both measurements are normalised against the garment's own calibrated proportions.
    const shoulderWidthPx   = Math.hypot(rs.x - ls.x, rs.y - ls.y);
    const torsoHeightPx     = Math.hypot(hipCx - shoulderCx, hipCy - shoulderCy);
    const shoulderWidthWorld = (shoulderWidthPx / canvasW) * vpW;
    const torsoHeightWorld   = (torsoHeightPx  / canvasH) * this.VIEWPORT_H;

    const widthScale  = shoulderWidthWorld / this.garmentShoulderWidth;
    const heightScale = torsoHeightWorld   / this.garmentTorsoHeight;
    let   targetScale = 0.45 * widthScale + 0.55 * heightScale;

    // DEBUG CLAMP — remove once garment fits correctly
    targetScale = THREE.MathUtils.clamp(targetScale, 0.5, 1.3);

    // Per-frame scale diagnostics
    const cameraVisibleHeight = this.VIEWPORT_H; // 2.0 world units
    const worldDressHeight    = this.garmentModelH * targetScale;
    console.log('[Scale Diagnostic]', {
      widthScale:          widthScale.toFixed(4),
      heightScale:         heightScale.toFixed(4),
      targetScale:         targetScale.toFixed(4),
      worldDressHeight:    worldDressHeight.toFixed(4),
      cameraVisibleHeight: cameraVisibleHeight.toFixed(4),
      fitCheck:            worldDressHeight <= cameraVisibleHeight ? '✅ fits' : '⚠️ overflows',
    });

    // 4. Z-tilt clamped ±35°
    const MAX_TILT = THREE.MathUtils.degToRad(35);
    const targetRot = Math.max(-MAX_TILT, Math.min(MAX_TILT, torsoAngleRad));

    // 5. Neckline anchor in local space → rotated world-space offset
    //    The neckline is at (garmentCenterX, garmentTopY, garmentCenterZ) in local coords.
    //    We rotate that by Z-tilt so the offset follows the garment rotation.
    const necklineLocal  = new THREE.Vector3(this.garmentCenterX, this.garmentTopY, this.garmentCenterZ);
    const scaledNeckline = necklineLocal.clone().multiplyScalar(targetScale);

    // Rotate the offset around Z only
    const cosZ = Math.cos(targetRot);
    const sinZ = Math.sin(targetRot);
    const rotatedNeckOffset = new THREE.Vector3(
      cosZ * scaledNeckline.x - sinZ * scaledNeckline.y,
      sinZ * scaledNeckline.x + cosZ * scaledNeckline.y,
      scaledNeckline.z
    );

    // 6. Target position: model origin such that neckline lands on shoulderCenter
    const targetPos = shoulderCenterWorld.clone().sub(rotatedNeckOffset);

    // 7. Independent smooth interpolation
    this.currentPos.lerp(targetPos, this.LERP_POS);
    this.currentRot   = THREE.MathUtils.lerp(this.currentRot, targetRot, this.LERP_ROT);
    this.currentScale = THREE.MathUtils.lerp(this.currentScale, targetScale, this.LERP_SCALE);

    // 8. Apply transforms — Z-rotation only via Euler, no quaternion composition
    this.modelGroup.position.copy(this.currentPos);
    this.modelGroup.rotation.set(0, 0, this.currentRot);
    this.modelGroup.scale.setScalar(this.currentScale);
    this.modelGroup.updateMatrixWorld(true);

    if (this.boxHelper) this.boxHelper.update();

    // 9. Update debug helpers
    const necklineWorld = this.currentPos.clone().add(rotatedNeckOffset);
    this.shoulderSphere.position.copy(shoulderCenterWorld);
    this.hipSphere.position.copy(hipCenterWorld);
    this.necklineSphere.position.copy(necklineWorld);

    const lp = this.torsoAxisLine.geometry.attributes.position as THREE.BufferAttribute;
    lp.setXYZ(0, shoulderCenterWorld.x, shoulderCenterWorld.y, shoulderCenterWorld.z);
    lp.setXYZ(1, hipCenterWorld.x,      hipCenterWorld.y,      hipCenterWorld.z);
    lp.needsUpdate = true;
  }

  // ── Render loop ────────────────────────────────────────────────────────────
  private startLoop = () => {
    let frameCount = 0;
    const loop = () => {
      if (this.isDisposed) return;
      this.animId = requestAnimationFrame(loop);
      this.renderer.render(this.scene, this.camera);
      frameCount++;

      // Log lifecycle diagnostics every 30 frames
      if (frameCount % 30 === 0) {
        this.logLifecycleDiagnostics();
      }
    };
    loop();
  };

  private logLifecycleDiagnostics() {
    // ── Renderer info ───────────────────────────────────────────────────────
    console.group('%c🔍 Renderer Lifecycle Diagnostics', 'color:#7FDBFF;font-weight:bold');

    console.log('renderer.info.memory:', { ...this.renderer.info.memory });
    console.log('renderer.info.render:', { ...this.renderer.info.render });
    console.log('renderer.domElement.width:', this.renderer.domElement.width);
    console.log('renderer.domElement.height:', this.renderer.domElement.height);
    console.log('renderer.getPixelRatio():', this.renderer.getPixelRatio());
    console.log('scene.children.length:', this.scene.children.length);
    console.log('camera.children.length:', this.camera.children.length);
    console.log('renderer.isDisposed (flag):', this.isDisposed);

    // ── Model group flags ───────────────────────────────────────────────────
    if (this.modelGroup) {
      const mg = this.modelGroup;
      console.log('model.parent (should be scene):', mg.parent?.type ?? 'null — NOT IN SCENE!');
      console.log('model.visible:', mg.visible);
      console.log('model.matrixAutoUpdate:', mg.matrixAutoUpdate);
      console.log('model.matrixWorldNeedsUpdate:', mg.matrixWorldNeedsUpdate);
      console.log('model.frustumCulled:', mg.frustumCulled);
      console.log('model.position:', mg.position.clone());
      console.log('model.scale:', mg.scale.clone());

      // ── Mesh traversal ────────────────────────────────────────────────────
      let meshCount = 0;
      mg.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshCount++;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat, mi) => {
          console.log(`mesh[${meshCount}] (${mesh.name || 'unnamed'}) material[${mi}]:`, {
            'mesh.visible':         mesh.visible,
            'material.visible':     mat.visible,
            'material.opacity':     mat.opacity,
            'material.transparent': mat.transparent,
            'material.side':        mat.side,
            'geometry.vertex count': (mesh.geometry?.attributes?.position?.count ?? 'NO GEOMETRY'),
          });
        });
      });
      if (meshCount === 0) console.warn('⚠️ No meshes found inside modelGroup!');
    } else {
      console.warn('⚠️ modelGroup is null — model not loaded or was removed from scene!');
    }

    // ── Scene ↔ Renderer consistency check ─────────────────────────────────
    const modelInScene = this.modelGroup ? this.scene.children.includes(this.modelGroup) : false;
    console.log('modelGroup present in scene.children:', modelInScene);
    if (!modelInScene && this.modelGroup) {
      console.error('❌ modelGroup exists but is NOT in scene.children — scene was recreated or model was removed!');
    }

    console.groupEnd();
  }

  public resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  public dispose() {
    this.isDisposed = true;
    cancelAnimationFrame(this.animId);
    this.renderer.dispose();
    console.count('GarmentAssetRenderer Disposed');
  }
}
