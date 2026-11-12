/** three.js view of the cell: arm, tray, parts, box, stack light, selection rings. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { World } from '../sim/world';
import type { Cycle, Mode } from '../sim/cycle';
import { PART, TRAY, BOX, type Part, type PartColor } from '../sim/cell';
import type { V3 } from '../sim/vec';

export const COLOR_HEX: Record<PartColor, number> = { red: 0xff3b3b, green: 0x3bff7a, blue: 0x3b8bff, yellow: 0xffd23b };
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
  private partMeshes = new Map<number, THREE.Mesh>();
  private partsGroup = new THREE.Group();
  private lamps: Record<'red' | 'amber' | 'green', THREE.Mesh>;
  private ringCandidate: THREE.Mesh;
  private ringSelected: THREE.Mesh;
  private ghost: THREE.Mesh;
  private haloRing: THREE.Mesh;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.Fog(0x0b0e14, 1.0, 2.0);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.02, 10);
    this.camera.position.set(0.0, 0.5, 0.6);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0.0, 0.02, -0.16);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 0.25; this.controls.maxDistance = 1.4;
    this.controls.update();

    this.scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x1a2230, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(0.4, 0.9, 0.5); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x6fb3ff, 0.45); fill.position.set(-0.6, 0.3, -0.3); this.scene.add(fill);

    const grid = new THREE.GridHelper(1.4, 28, 0x27334a, 0x1a2230); grid.position.y = -0.001; this.scene.add(grid);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.7, 48), new THREE.MeshStandardMaterial({ color: 0x0f141d, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; this.scene.add(floor);
    // a strip of safety yellow around the cell
    const strip = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.345, 64), new THREE.MeshBasicMaterial({ color: 0x8a7a1e, side: THREE.DoubleSide }));
    strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0.0005, -0.1); this.scene.add(strip);

    // arm
    const metal = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.35, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: 0.2, roughness: 0.7 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.02, 32), dark); base.position.y = 0.01; this.scene.add(base);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.04, 24), metal); column.position.y = 0.04; this.scene.add(column);
    for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(i === 0 ? 0.014 : 0.012, i === 0 ? 0.014 : 0.012, 1, 20), metal); this.links.push(m); this.scene.add(m); }
    for (let i = 0; i < 3; i++) { const j = new THREE.Mesh(new THREE.SphereGeometry(i === 2 ? 0.013 : 0.017, 20, 16), dark); this.joints.push(j); this.scene.add(j); }
    this.tool = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 1, 16), dark); this.scene.add(this.tool);
    for (let i = 0; i < 2; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.024, 0.016), metal); this.fingers.push(f); this.scene.add(f); }
    this.haloRing = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.09, 48), new THREE.MeshBasicMaterial({ color: 0x3bff7a, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    this.haloRing.rotation.x = -Math.PI / 2; this.haloRing.position.y = 0.001; this.scene.add(this.haloRing);

    // tray and box
    const trayMat = new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.9 });
    const tray = new THREE.Mesh(new THREE.BoxGeometry(TRAY.size, TRAY.top, TRAY.size), trayMat); tray.position.set(TRAY.center.x, TRAY.top / 2, TRAY.center.z); this.scene.add(tray);
    const trayEdge = new THREE.LineSegments(new THREE.EdgesGeometry(tray.geometry), new THREE.LineBasicMaterial({ color: 0x3a4a66 })); trayEdge.position.copy(tray.position); this.scene.add(trayEdge);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.95 });
    const outer = BOX.inner + 2 * BOX.wall;
    const floorB = new THREE.Mesh(new THREE.BoxGeometry(outer, BOX.floor, outer), boxMat); floorB.position.set(BOX.center.x, BOX.floor / 2, BOX.center.z); this.scene.add(floorB);
    for (const [dx, dz, w, d] of [[0, -1, outer, BOX.wall], [0, 1, outer, BOX.wall], [-1, 0, BOX.wall, outer], [1, 0, BOX.wall, outer]] as const) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, BOX.height, d), boxMat);
      wall.position.set(BOX.center.x + dx * (outer / 2 - BOX.wall / 2), BOX.height / 2, BOX.center.z + dz * (outer / 2 - BOX.wall / 2));
      this.scene.add(wall);
    }
    this.scene.add(this.partsGroup);

    // stack light
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.13, 12), dark); pole.position.set(0.0, 0.065, -0.36); this.scene.add(pole);
    const lamp = (color: number, y: number) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.028, 24), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.05, roughness: 0.3 })); m.position.set(0.0, y, -0.36); this.scene.add(m); return m; };
    this.lamps = { green: lamp(0x3bff7a, 0.145), amber: lamp(0xffa02e, 0.175), red: lamp(0xff3b3b, 0.205) };

    // rings
    this.ringCandidate = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.026, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    this.ringCandidate.rotation.x = -Math.PI / 2; this.ringCandidate.visible = false; this.scene.add(this.ringCandidate);
    this.ringSelected = new THREE.Mesh(new THREE.RingGeometry(0.024, 0.03, 32), new THREE.MeshBasicMaterial({ color: 0x19d3ff, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
    this.ringSelected.rotation.x = -Math.PI / 2; this.ringSelected.visible = false; this.scene.add(this.ringSelected);
    this.ghost = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 10), new THREE.MeshBasicMaterial({ color: 0x19d3ff, wireframe: true, transparent: true, opacity: 0.5 })); this.scene.add(this.ghost);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  private syncParts(parts: Part[]): void {
    const seen = new Set<number>();
    for (const p of parts) {
      seen.add(p.id);
      let m = this.partMeshes.get(p.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.BoxGeometry(PART, PART, PART), new THREE.MeshStandardMaterial({ color: COLOR_HEX[p.color], roughness: 0.5, emissive: COLOR_HEX[p.color], emissiveIntensity: 0.12 }));
        this.partMeshes.set(p.id, m); this.partsGroup.add(m);
      }
      m.position.copy(V(p.pos));
    }
    for (const [id, m] of this.partMeshes) if (!seen.has(id)) { this.partsGroup.remove(m); this.partMeshes.delete(id); }
  }

  update(world: World, cycle: Cycle, mode: Mode, candidate: Part | null, selected: Part | null): void {
    const fk = world.arm.pose;
    alignCylinder(this.links[0], fk.shoulder, fk.elbow);
    alignCylinder(this.links[1], fk.elbow, fk.wrist);
    alignCylinder(this.tool, fk.wrist, fk.tip);
    this.joints[0].position.copy(V(fk.shoulder)); this.joints[1].position.copy(V(fk.elbow)); this.joints[2].position.copy(V(fk.wrist));
    const yaw = world.arm.joints[0];
    const lateral = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const open = cycle.gripperClosed ? PART / 2 + 0.003 : PART / 2 + 0.014;
    for (let i = 0; i < 2; i++) {
      const f = this.fingers[i];
      f.position.copy(V(fk.tip)).add(lateral.clone().multiplyScalar(i ? open : -open)); f.position.y += 0.008;
      f.rotation.set(0, -yaw, 0);
    }
    this.syncParts(world.cell.parts);

    const L = this.lamps;
    (L.green.material as THREE.MeshStandardMaterial).emissiveIntensity = mode === 'running' ? 1.6 : mode === 'slow' ? 0.5 : 0.05;
    (L.amber.material as THREE.MeshStandardMaterial).emissiveIntensity = mode === 'slow' ? 1.6 : 0.05;
    (L.red.material as THREE.MeshStandardMaterial).emissiveIntensity = mode === 'stopped' ? 2.0 : 0.05;
    const halo = this.haloRing.material as THREE.MeshBasicMaterial;
    halo.color.setHex(mode === 'stopped' ? 0xff3b3b : mode === 'running' ? 0x3bff7a : 0xffa02e);
    halo.opacity = 0.5;

    this.ringCandidate.visible = !!candidate && candidate !== selected;
    if (candidate) this.ringCandidate.position.set(candidate.pos.x, 0.0075, candidate.pos.z);
    this.ringSelected.visible = !!selected;
    if (selected) this.ringSelected.position.set(selected.pos.x, 0.0075, selected.pos.z);
    this.ghost.position.copy(V(world.target));
    this.ghost.visible = mode === 'running' || mode === 'slow';
  }

  render(): void { this.controls.update(); this.renderer.render(this.scene, this.camera); }
}
