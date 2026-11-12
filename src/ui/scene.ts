/** three.js view of the arm, the panel and the workspace. Also answers "which control is under the pointer". */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOUNDS, type World, type Controller } from '../sim/world';
import { PANEL_Z, BUTTON_COLORS, BUTTON_POS, BUTTON_RADIUS, SWITCH_POS, SWITCH_HALF, KNOB_POS, KNOB_RADIUS, knobAngle, sliderPos, SLIDER_X0, SLIDER_X1, SLIDER_Y, type ButtonColor } from '../sim/panel';
import type { V3 } from '../sim/vec';

export const COLOR_HEX: Record<ButtonColor, number> = { red: 0xff3b3b, green: 0x3bff7a, blue: 0x3b8bff, yellow: 0xffd23b };
const POLICY = 0x19d3ff, HUMAN = 0xff3bd4, ZONE = 0xffa02e;

const V = (p: V3) => new THREE.Vector3(p.x, p.y, p.z);
const UP = new THREE.Vector3(0, 1, 0);

function alignCylinder(mesh: THREE.Object3D, a: V3, b: V3): void {
  const va = V(a), vb = V(b);
  const dir = vb.sub(va);
  const l = dir.length();
  mesh.position.copy(va).add(dir.clone().multiplyScalar(0.5));
  mesh.scale.set(1, l, 1);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
}

export class Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private links: THREE.Mesh[] = [];
  private joints: THREE.Mesh[] = [];
  private tool: THREE.Mesh;
  private fingers: THREE.Mesh[] = [];
  private buttons = {} as Record<ButtonColor, THREE.Mesh>;
  private lever: THREE.Mesh;
  private knob: THREE.Group;
  private handle: THREE.Mesh;
  private ghost: THREE.Mesh;
  private ghostLine: THREE.Line;
  private zoneRing: THREE.Mesh;
  private modules: THREE.Object3D[] = [];
  private ray = new THREE.Raycaster();
  private hovered: THREE.Mesh | null = null;
  private hoverBase = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.Fog(0x0b0e14, 0.9, 1.8);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.02, 10);
    this.camera.position.set(0.34, 0.36, 0.3);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.15, -0.14);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 0.2; this.controls.maxDistance = 1.2;
    this.controls.update();

    this.scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x1a2230, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(0.5, 0.9, 0.6); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x6fb3ff, 0.5); fill.position.set(-0.6, 0.3, -0.2); this.scene.add(fill);

    const grid = new THREE.GridHelper(1.2, 24, 0x27334a, 0x1a2230); grid.position.y = -0.001; this.scene.add(grid);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshStandardMaterial({ color: 0x0f141d, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; this.scene.add(floor);

    // workspace bounds
    const size = new THREE.Vector3(BOUNDS.max.x - BOUNDS.min.x, BOUNDS.max.y - BOUNDS.min.y, BOUNDS.max.z - BOUNDS.min.z);
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)), new THREE.LineBasicMaterial({ color: 0x2a3a55 }));
    box.position.set((BOUNDS.max.x + BOUNDS.min.x) / 2, (BOUNDS.max.y + BOUNDS.min.y) / 2, (BOUNDS.max.z + BOUNDS.min.z) / 2);
    this.scene.add(box);

    // arm
    const metal = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.35, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: 0.2, roughness: 0.7 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.02, 32), dark); base.position.y = 0.01; this.scene.add(base);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.04, 24), metal); column.position.y = 0.04; this.scene.add(column);
    for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(i === 0 ? 0.013 : 0.011, i === 0 ? 0.013 : 0.011, 1, 20), metal); this.links.push(m); this.scene.add(m); }
    for (let i = 0; i < 3; i++) { const j = new THREE.Mesh(new THREE.SphereGeometry(i === 2 ? 0.012 : 0.016, 20, 16), dark); this.joints.push(j); this.scene.add(j); }
    this.tool = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 1, 16), dark); this.scene.add(this.tool);
    for (let i = 0; i < 2; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.018), metal); this.fingers.push(f); this.scene.add(f); }
    this.zoneRing = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.085, 48), new THREE.MeshBasicMaterial({ color: ZONE, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    this.zoneRing.rotation.x = -Math.PI / 2; this.zoneRing.position.y = 0.001; this.scene.add(this.zoneRing);

    // panel
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.27, 0.02), new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.85 }));
    plate.position.set(0, 0.175, PANEL_Z - 0.01); this.scene.add(plate);
    const trim = new THREE.LineSegments(new THREE.EdgesGeometry(plate.geometry), new THREE.LineBasicMaterial({ color: 0x3a4a66 })); trim.position.copy(plate.position); this.scene.add(trim);
    for (const c of BUTTON_COLORS) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(BUTTON_RADIUS, BUTTON_RADIUS, 0.012, 32), new THREE.MeshStandardMaterial({ color: COLOR_HEX[c], emissive: COLOR_HEX[c], emissiveIntensity: 0.08, roughness: 0.4 }));
      b.rotation.x = Math.PI / 2; const p = BUTTON_POS[c]; b.position.set(p.x, p.y, p.z + 0.006);
      b.userData.key = `button:${c}`; this.buttons[c] = b; this.modules.push(b); this.scene.add(b);
      const bezel = new THREE.Mesh(new THREE.RingGeometry(BUTTON_RADIUS + 0.002, BUTTON_RADIUS + 0.006, 32), new THREE.MeshBasicMaterial({ color: 0x3a4a66 })); bezel.position.set(p.x, p.y, p.z + 0.0005); this.scene.add(bezel);
    }
    const swBase = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.006), new THREE.MeshStandardMaterial({ color: 0x2b3446 })); swBase.position.set(SWITCH_POS.x, SWITCH_POS.y, PANEL_Z + 0.003); swBase.userData.key = 'switch'; this.modules.push(swBase); this.scene.add(swBase);
    this.lever = new THREE.Mesh(new THREE.BoxGeometry(0.01, SWITCH_HALF * 2, 0.01), new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 0.4, roughness: 0.3 }));
    this.lever.geometry.translate(0, 0, 0.012); this.lever.position.set(SWITCH_POS.x, SWITCH_POS.y, PANEL_Z + 0.006); this.lever.userData.key = 'switch'; this.modules.push(this.lever); this.scene.add(this.lever);
    this.knob = new THREE.Group(); this.knob.position.set(KNOB_POS.x, KNOB_POS.y, PANEL_Z + 0.007);
    const kb = new THREE.Mesh(new THREE.CylinderGeometry(KNOB_RADIUS, KNOB_RADIUS, 0.014, 40), new THREE.MeshStandardMaterial({ color: 0x334055, metalness: 0.3, roughness: 0.5 })); kb.rotation.x = Math.PI / 2; kb.userData.key = 'knob'; this.knob.add(kb); this.modules.push(kb);
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.004, KNOB_RADIUS * 0.8, 0.004), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 })); ind.position.set(0, KNOB_RADIUS * 0.5, 0.008); this.knob.add(ind);
    this.scene.add(this.knob);
    for (let i = 0; i < 6; i++) { const a = Math.PI / 2 - knobAngle(i); const tick = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.006, 0.002), new THREE.MeshBasicMaterial({ color: 0x8aa0c8 })); tick.position.set(KNOB_POS.x + Math.cos(a) * (KNOB_RADIUS + 0.008), KNOB_POS.y + Math.sin(a) * (KNOB_RADIUS + 0.008), PANEL_Z + 0.001); tick.rotation.z = a - Math.PI / 2; this.scene.add(tick); }
    const track = new THREE.Mesh(new THREE.BoxGeometry(SLIDER_X1 - SLIDER_X0 + 0.02, 0.012, 0.004), new THREE.MeshStandardMaterial({ color: 0x2b3446 })); track.position.set((SLIDER_X0 + SLIDER_X1) / 2, SLIDER_Y, PANEL_Z + 0.002); track.userData.key = 'slider'; this.modules.push(track); this.scene.add(track);
    this.handle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.024, 0.014), new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 0.4, roughness: 0.3 })); this.handle.position.z = PANEL_Z + 0.007; this.handle.userData.key = 'slider'; this.modules.push(this.handle); this.scene.add(this.handle);

    // commanded target
    this.ghost = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), new THREE.MeshBasicMaterial({ color: POLICY, wireframe: true, transparent: true, opacity: 0.9 })); this.scene.add(this.ghost);
    this.ghostLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: POLICY, transparent: true, opacity: 0.6 })); this.scene.add(this.ghostLine);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  /** control under a pointer position (client coords), e.g. "button:red", "switch", "knob", "slider:0.63" */
  pick(clientX: number, clientY: number): string | null {
    const r = this.canvas.getBoundingClientRect();
    const nd = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(nd, this.camera);
    const hits = this.ray.intersectObjects(this.modules, false);
    const hit = hits[0];
    if (!hit) return null;
    const key = String(hit.object.userData.key ?? '');
    if (key === 'slider') { const v = (hit.point.x - SLIDER_X0) / (SLIDER_X1 - SLIDER_X0); return `slider:${Math.max(0, Math.min(1, v)).toFixed(2)}`; }
    return key || null;
  }

  setHover(key: string | null): void {
    const base = key?.split(':')[0] ?? null;
    const target = base === 'button' ? this.buttons[key!.split(':')[1] as ButtonColor] : base === 'switch' ? this.lever : base === 'knob' ? (this.knob.children[0] as THREE.Mesh) : base === 'slider' ? this.handle : null;
    if (this.hovered && this.hovered !== target) { (this.hovered.material as THREE.MeshStandardMaterial).emissiveIntensity = this.hoverBase; this.hovered = null; }
    if (target && this.hovered !== target) { const m = target.material as THREE.MeshStandardMaterial; this.hoverBase = m.emissiveIntensity; m.emissive = m.emissive ?? new THREE.Color(0xffffff); if (m.emissive.getHex() === 0) m.emissive.setHex(0x88aaff); m.emissiveIntensity = 0.7; this.hovered = target; }
  }

  update(world: World, ctrl: Controller, zone: boolean, dwellProgress: number): void {
    const fk = world.arm.pose;
    alignCylinder(this.links[0], fk.shoulder, fk.elbow);
    alignCylinder(this.links[1], fk.elbow, fk.wrist);
    alignCylinder(this.tool, fk.wrist, fk.tip);
    this.joints[0].position.copy(V(fk.shoulder)); this.joints[1].position.copy(V(fk.elbow)); this.joints[2].position.copy(V(fk.wrist));
    const dir = V(fk.tip).sub(V(fk.wrist)).normalize();
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    const open = ctrl === 'human' ? 0.011 : 0.008;
    for (let i = 0; i < 2; i++) { const f = this.fingers[i]; f.position.copy(V(fk.tip)).add(side.clone().multiplyScalar(i ? open : -open)).add(dir.clone().multiplyScalar(-0.006)); f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir); }

    const s = world.panel.state;
    for (const c of BUTTON_COLORS) { const m = this.buttons[c].material as THREE.MeshStandardMaterial; if (this.hovered !== this.buttons[c]) m.emissiveIntensity = s.buttons[c] ? 1.4 : 0.08; this.buttons[c].position.z = BUTTON_POS[c].z + 0.006; }
    this.lever.rotation.x = s.switchUp ? -0.55 : 0.55;
    this.knob.rotation.z = -knobAngle(s.knob);
    const h = sliderPos(s.slider); this.handle.position.set(h.x, h.y, PANEL_Z + 0.007);

    const color = ctrl === 'human' ? HUMAN : POLICY;
    (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(color);
    (this.ghostLine.material as THREE.LineBasicMaterial).color.setHex(color);
    this.ghost.position.copy(V(world.target));
    this.ghost.visible = ctrl !== 'idle';
    this.ghostLine.visible = ctrl !== 'idle';
    const pos = this.ghostLine.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, fk.tip.x, fk.tip.y, fk.tip.z); pos.setXYZ(1, world.target.x, world.target.y, world.target.z); pos.needsUpdate = true;
    this.ghost.scale.setScalar(1 + dwellProgress * 0.8);

    const zm = this.zoneRing.material as THREE.MeshBasicMaterial;
    zm.opacity += ((zone ? 0.75 : 0) - zm.opacity) * 0.15;
    this.zoneRing.scale.setScalar(zone ? 1 + Math.sin(performance.now() / 180) * 0.06 : 1);
  }

  render(): void { this.controls.update(); this.renderer.render(this.scene, this.camera); }
}
