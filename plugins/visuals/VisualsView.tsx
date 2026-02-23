import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { usePluginAPI } from '../../context/PluginContext';

type VisualMode = 'oscilloscope' | 'flowfield' | 'network' | 'tunnel';

interface ModeInfo {
  id: VisualMode;
  name: string;
  description: string;
}

const MODES: ModeInfo[] = [
  { id: 'oscilloscope', name: 'Oscilloscope', description: '3D ribbon waveforms' },
  { id: 'flowfield', name: 'Flow Field', description: 'Particle trails' },
  { id: 'network', name: 'Network', description: 'Connected constellation' },
  { id: 'tunnel', name: 'Tunnel', description: 'Geometric wireframe' },
];

// Musical audio simulation — punchier transients, wider dynamic range
function useMusicalAudio(isPlaying: boolean) {
  const [data, setData] = useState({
    bass: 0, mid: 0, high: 0,
    waveform: new Float32Array(128).fill(0),
    spectrum: new Float32Array(64).fill(0),
    energy: 0,
    kick: false,
    snare: false,
    hihat: false,
    beatPhase: 0,
    barPhase: 0,
  });

  const frameRef = useRef<number>(0);
  const seedRef = useRef(Math.random() * 1000);

  useEffect(() => {
    if (!isPlaying) {
      setData(d => ({ ...d, bass: 0.05, mid: 0.05, high: 0.05, energy: 0.05, kick: false, snare: false, hihat: false }));
      return;
    }

    seedRef.current = Math.random() * 1000;

    const animate = () => {
      const time = performance.now() * 0.001;
      const seed = seedRef.current;

      const bpm = 118 + (seed % 20);
      const swingAmount = (seed % 100) / 500;
      const bassiness = 0.6 + (seed % 50) / 100;
      const brightness = 0.35 + (seed % 40) / 100;

      const beatDuration = 60 / bpm;
      const barDuration = beatDuration * 4;

      const rawBeatPhase = (time % beatDuration) / beatDuration;
      const beatNumber = Math.floor(time / beatDuration) % 4;
      const barPhase = (time % barDuration) / barDuration;

      let beatPhase = rawBeatPhase;
      if (beatNumber % 2 === 1) {
        beatPhase = rawBeatPhase * (1 - swingAmount);
      }

      // Kick — sharper transient
      const fourOnFloor = seed % 100 > 40;
      const kickBeats = fourOnFloor ? [0, 1, 2, 3] : [0, 2];
      const isKickBeat = kickBeats.includes(beatNumber);
      const kickEnvelope = isKickBeat ? Math.exp(-beatPhase * 10) : 0;
      const kick = beatPhase < 0.12 && isKickBeat;

      // Snare — snappier
      const snareBeats = [1, 3];
      const isSnare = snareBeats.includes(beatNumber);
      const snareEnvelope = isSnare ? Math.exp(-beatPhase * 12) : 0;
      const snare = beatPhase < 0.08 && isSnare;

      // Hi-hat
      const hihatSpeed = seed % 100 > 60 ? 0.25 : 0.5;
      const hihatPhase = (time % (beatDuration * hihatSpeed)) / (beatDuration * hihatSpeed);
      const hihatEnvelope = Math.exp(-hihatPhase * 12) * brightness;
      const hihat = hihatPhase < 0.1;

      // Bass — more punch
      const bassBase = kickEnvelope * bassiness * 1.3;
      const bassSustain = Math.sin(barPhase * Math.PI * 2) * 0.12 + 0.18;
      const bass = Math.max(bassBase, bassSustain);

      // Mid
      const melodyPhase = time * (0.5 + (seed % 30) / 60);
      const midBase = 0.25 + Math.sin(melodyPhase) * 0.18;
      const midAccent = snareEnvelope * 0.35;
      const mid = midBase + midAccent;

      // High
      const high = hihatEnvelope * 0.7 + 0.12;

      // Waveform — richer harmonics
      const waveform = new Float32Array(128);
      const waveFreq1 = 2 + (seed % 4);
      const waveFreq2 = 4 + (seed % 6);
      const waveFreq3 = 8 + (seed % 8);
      for (let i = 0; i < 128; i++) {
        const t = i / 128;
        const mainWave = Math.sin(t * Math.PI * waveFreq1 + time * 3) * bass * 0.7;
        const harmonic = Math.sin(t * Math.PI * waveFreq2 + time * 5) * mid * 0.35;
        const detail = Math.sin(t * Math.PI * waveFreq3 + time * 9) * high * 0.2;
        const subBass = Math.sin(t * Math.PI + time * 1.5) * bass * 0.25;
        waveform[i] = mainWave + harmonic + detail + subBass;
      }

      // Spectrum — sharper peaks
      const spectrum = new Float32Array(64);
      const bassWidth = 8 + (seed % 8);
      const midPeak = 20 + (seed % 15);
      for (let i = 0; i < 64; i++) {
        if (i < bassWidth) {
          spectrum[i] = bass * (1 - i / bassWidth) * 1.4;
        } else if (i < 40) {
          const distFromPeak = Math.abs(i - midPeak) / 20;
          spectrum[i] = mid * (1 - distFromPeak * 0.6);
        } else {
          spectrum[i] = high * (1 - (i - 40) / 28);
        }
        spectrum[i] = Math.max(0, Math.min(1, spectrum[i]));
      }

      const energy = bass * 0.45 + mid * 0.35 + high * 0.2;

      setData({
        bass: Math.max(0, Math.min(1, bass)),
        mid: Math.max(0, Math.min(1, mid)),
        high: Math.max(0, Math.min(1, high)),
        waveform,
        spectrum,
        energy: Math.max(0, Math.min(1, energy)),
        kick, snare, hihat,
        beatPhase, barPhase,
      });

      frameRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(frameRef.current);
  }, [isPlaying]);

  return data;
}

type AudioData = ReturnType<typeof useMusicalAudio>;

// ============================================================================
// OSCILLOSCOPE — Layered Spectral Ribbons with Bloom
// ============================================================================
class OscilloscopeVisualizer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bands: {
    lines: THREE.Line[];
    history: Float32Array[];
    hue: number;
    yOffset: number;
    ampScale: number;
  }[] = [];
  private historyLength = 8;
  private pointCount = 128;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030308);

    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 1.5, 6);
    this.camera.lookAt(0, 0, -1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight), 1.8, 0.7, 0.3
    ));
    this.composer.addPass(new OutputPass());

    const bandConfigs = [
      { hue: 0.05, yOffset: -1.0, ampScale: 2.2 }, // Bass — warm orange-red
      { hue: 0.55, yOffset: 0.0, ampScale: 1.5 },  // Mid — cyan
      { hue: 0.85, yOffset: 1.0, ampScale: 0.8 },  // High — pink
    ];

    for (const cfg of bandConfigs) {
      const band = { lines: [] as THREE.Line[], history: [] as Float32Array[], ...cfg };

      for (let h = 0; h < this.historyLength; h++) {
        band.history.push(new Float32Array(this.pointCount).fill(0));

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pointCount * 3), 3));

        const material = new THREE.LineBasicMaterial({
          color: new THREE.Color().setHSL(cfg.hue, 0.9, 0.55),
          transparent: true,
          opacity: 0.9 - (h / this.historyLength) * 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

        const line = new THREE.Line(geometry, material);
        band.lines.push(line);
        this.scene.add(line);
      }

      this.bands.push(band);
    }
  }

  update(audioData: AudioData) {
    const time = performance.now() * 0.001;
    const amps = [audioData.bass, audioData.mid, audioData.high];
    const freqMults = [1, 2, 4];

    for (let b = 0; b < this.bands.length; b++) {
      const band = this.bands[b];
      const amp = amps[b];
      const fm = freqMults[b];

      for (let i = band.history.length - 1; i > 0; i--) band.history[i].set(band.history[i - 1]);

      const cur = band.history[0];
      for (let i = 0; i < this.pointCount; i++) {
        const t = i / this.pointCount;
        cur[i] = audioData.waveform[i] * amp * band.ampScale
          + Math.sin(t * Math.PI * fm * 2 + time * (1 + b * 2)) * amp * 0.3;
      }

      const kickMult = b === 0 && audioData.kick ? 2.5 : 1.0;
      const snareMult = b === 1 && audioData.snare ? 1.8 : 1.0;
      const breathe = Math.sin(audioData.barPhase * Math.PI * 2) * 0.04;

      for (let h = 0; h < band.lines.length; h++) {
        const line = band.lines[h];
        const positions = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
        const wave = band.history[h];
        const zOff = h * 0.15;

        for (let i = 0; i < this.pointCount; i++) {
          const t = (i / (this.pointCount - 1)) - 0.5;
          positions[i * 3] = t * 8;
          positions[i * 3 + 1] = wave[i] * 1.8 * kickMult * snareMult + band.yOffset + breathe;
          positions[i * 3 + 2] = -zOff;
        }
        line.geometry.attributes.position.needsUpdate = true;

        const lightness = 0.35 + audioData.energy * 0.3 + (h === 0 ? 0.1 : 0);
        (line.material as THREE.LineBasicMaterial).color.setHSL(band.hue + time * 0.01, 0.85 + audioData.energy * 0.1, lightness);
      }
    }

    const ca = time * 0.08;
    this.camera.position.x = Math.sin(ca) * 0.8;
    this.camera.position.y = 1.2 + Math.sin(time * 0.06) * 0.3;
    this.camera.position.z = 5.5 + Math.cos(ca) * 0.5;
    this.camera.lookAt(0, 0, -1);

    this.composer.render();
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  dispose() {
    this.bands.forEach(b => b.lines.forEach(l => { l.geometry.dispose(); (l.material as THREE.Material).dispose(); }));
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ============================================================================
// FLOW FIELD — Particle Aurora with Bloom
// ============================================================================
class FlowFieldVisualizer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private particles: { pos: THREE.Vector3; vel: THREE.Vector3; trail: THREE.Vector3[]; seed: number }[] = [];
  private trailLines: THREE.Line[] = [];
  private headPoints: THREE.Points;
  private headGeometry: THREE.BufferGeometry;
  private particleCount = 200;
  private trailLength = 22;
  private flowSeed: number;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030206);
    this.scene.fog = new THREE.FogExp2(0x030206, 0.05);
    this.flowSeed = Math.random() * 100;

    this.camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 7);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight), 2.0, 0.9, 0.2
    ));
    this.composer.addPass(new OutputPass());

    for (let i = 0; i < this.particleCount; i++) {
      const angle = (i / this.particleCount) * Math.PI * 2;
      const radius = 1.5 + Math.random() * 4;
      const particle = {
        pos: new THREE.Vector3(
          Math.cos(angle) * radius + (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 3
        ),
        vel: new THREE.Vector3(0, 0, 0),
        trail: [] as THREE.Vector3[],
        seed: Math.random(),
      };
      this.particles.push(particle);

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trailLength * 3), 3));

      const material = new THREE.LineBasicMaterial({
        color: 0xffcc44,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const line = new THREE.Line(geometry, material);
      this.trailLines.push(line);
      this.scene.add(line);
    }

    // Bright particle heads
    this.headGeometry = new THREE.BufferGeometry();
    const hp = new Float32Array(this.particleCount * 3);
    const hc = new Float32Array(this.particleCount * 3);
    this.headGeometry.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    this.headGeometry.setAttribute('color', new THREE.BufferAttribute(hc, 3));

    this.headPoints = new THREE.Points(this.headGeometry, new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }));
    this.scene.add(this.headPoints);
  }

  private flowField(x: number, y: number, z: number, time: number): THREE.Vector3 {
    const s = this.flowSeed;
    const angle = Math.sin(x * 0.3 + s) * Math.PI + Math.cos(y * 0.2 + time * 0.3) * Math.PI * 0.5;
    const lift = Math.sin(y * 0.5 + x * 0.3 + time * 0.2) * 0.3;
    const twist = Math.cos(z * 0.4 + time * 0.15) * 0.2;
    return new THREE.Vector3(Math.cos(angle) * 0.8 + twist, lift + Math.sin(time * 0.5 + x) * 0.2, Math.sin(angle) * 0.35);
  }

  update(audioData: AudioData) {
    const time = performance.now() * 0.001;
    const baseSpeed = 0.018 + audioData.energy * 0.025;
    const headPos = (this.headGeometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const headCol = (this.headGeometry.attributes.color as THREE.BufferAttribute).array as Float32Array;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const line = this.trailLines[i];
      const flow = this.flowField(p.pos.x, p.pos.y, p.pos.z, time);

      if (audioData.kick) {
        const outward = p.pos.clone().normalize().multiplyScalar(0.06 * audioData.bass);
        flow.add(outward);
      }

      p.vel.lerp(flow, 0.08);
      p.vel.multiplyScalar(0.96);
      p.pos.add(p.vel.clone().multiplyScalar(baseSpeed));

      p.trail.unshift(p.pos.clone());
      if (p.trail.length > this.trailLength) p.trail.pop();

      if (p.pos.x > 7) p.pos.x = -7;
      if (p.pos.x < -7) p.pos.x = 7;
      if (p.pos.y > 5) p.pos.y = -5;
      if (p.pos.y < -5) p.pos.y = 5;

      const positions = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let j = 0; j < this.trailLength; j++) {
        if (j < p.trail.length) {
          positions[j * 3] = p.trail[j].x;
          positions[j * 3 + 1] = p.trail[j].y;
          positions[j * 3 + 2] = p.trail[j].z;
        }
      }
      line.geometry.attributes.position.needsUpdate = true;
      line.geometry.setDrawRange(0, Math.min(p.trail.length, this.trailLength));

      // Color gradient: warm at bottom, cool at top
      const heightNorm = (p.pos.y + 5) / 10;
      const hue = 0.05 + heightNorm * 0.5;
      const sat = 0.8 + audioData.energy * 0.15;
      const light = 0.4 + audioData.energy * 0.2;
      (line.material as THREE.LineBasicMaterial).color.setHSL(hue, sat, light);
      (line.material as THREE.LineBasicMaterial).opacity = 0.3 + audioData.energy * 0.4;

      headPos[i * 3] = p.pos.x;
      headPos[i * 3 + 1] = p.pos.y;
      headPos[i * 3 + 2] = p.pos.z;

      const c = new THREE.Color().setHSL(hue, sat, Math.min(1, light + 0.2));
      headCol[i * 3] = c.r;
      headCol[i * 3 + 1] = c.g;
      headCol[i * 3 + 2] = c.b;
    }

    this.headGeometry.attributes.position.needsUpdate = true;
    this.headGeometry.attributes.color.needsUpdate = true;
    (this.headPoints.material as THREE.PointsMaterial).size = 0.1 + audioData.energy * 0.08;

    this.composer.render();
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  dispose() {
    this.trailLines.forEach(l => { l.geometry.dispose(); (l.material as THREE.Material).dispose(); });
    this.headGeometry.dispose();
    (this.headPoints.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ============================================================================
// NETWORK — Neural Cosmos with Bloom
// ============================================================================
class NetworkVisualizer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private nodes: { pos: THREE.Vector3; basePos: THREE.Vector3; mesh: THREE.Mesh; seed: number; isHub: boolean; freqIndex: number }[] = [];
  private connections: THREE.Line[] = [];
  private nodeCount = 70;
  private baseHue: number;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040308);
    this.baseHue = 0.7 + Math.random() * 0.2;

    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 11);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight), 1.6, 0.6, 0.3
    ));
    this.composer.addPass(new OutputPass());

    const clusterCenters = [
      new THREE.Vector3(-3, 2, 0),
      new THREE.Vector3(3, 1.5, -1),
      new THREE.Vector3(-2, -2, 1),
      new THREE.Vector3(2.5, -1.5, 0),
      new THREE.Vector3(0, 0, -1),
    ];

    const hubGeom = new THREE.IcosahedronGeometry(0.12, 2);
    const nodeGeom = new THREE.IcosahedronGeometry(0.06, 1);

    for (let i = 0; i < this.nodeCount; i++) {
      const isHub = i < 5;
      const cluster = isHub ? i : Math.floor(Math.random() * clusterCenters.length);
      const center = clusterCenters[cluster];
      const spread = isHub ? 0.3 : 1;

      const pos = center.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 4 * spread,
        (Math.random() - 0.5) * 3 * spread,
        (Math.random() - 0.5) * 3 * spread,
      ));

      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(this.baseHue, 0.6, isHub ? 0.7 : 0.5),
        transparent: true,
        opacity: isHub ? 1.0 : 0.8,
      });

      const mesh = new THREE.Mesh(isHub ? hubGeom : nodeGeom, material);
      mesh.position.copy(pos);

      this.nodes.push({ pos: pos.clone(), basePos: pos.clone(), mesh, seed: Math.random(), isHub, freqIndex: Math.floor(Math.random() * 40) });
      this.scene.add(mesh);
    }

    for (let i = 0; i < 400; i++) {
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      line.visible = false;
      this.connections.push(line);
      this.scene.add(line);
    }
  }

  update(audioData: AudioData) {
    const time = performance.now() * 0.001;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];

      const breathePhase = audioData.barPhase * Math.PI * 2 + node.seed * Math.PI * 2;
      const breatheAmount = 0.2 + audioData.energy * 0.15;
      const breatheDir = node.basePos.clone().normalize();
      const breatheOff = breatheDir.multiplyScalar(Math.sin(breathePhase) * breatheAmount);

      node.pos.copy(node.basePos).add(breatheOff);
      node.pos.y += Math.sin(time * 0.5 + node.seed * 10) * 0.12;
      node.pos.x += Math.cos(time * 0.3 + node.seed * 10) * 0.08;
      node.mesh.position.copy(node.pos);

      const freqVal = audioData.spectrum[node.freqIndex] || 0;
      const kickPulse = audioData.kick ? 1.8 : 1;
      const freqPulse = 1 + freqVal * 0.8;
      const baseScale = node.isHub ? 1.5 : 0.8 + node.seed * 0.4;
      node.mesh.scale.setScalar(baseScale * kickPulse * freqPulse);

      const hue = (this.baseHue + node.seed * 0.12) % 1;
      const brightness = (node.isHub ? 0.55 : 0.35) + freqVal * 0.4 + audioData.energy * 0.15;
      (node.mesh.material as THREE.MeshBasicMaterial).color.setHSL(hue, 0.65, brightness);
    }

    let connIdx = 0;
    const connectionDist = 2.8 + audioData.energy * 1.5;

    for (let i = 0; i < this.nodes.length && connIdx < this.connections.length; i++) {
      for (let j = i + 1; j < this.nodes.length && connIdx < this.connections.length; j++) {
        const dist = this.nodes[i].pos.distanceTo(this.nodes[j].pos);
        if (dist < connectionDist) {
          const line = this.connections[connIdx];
          const positions = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
          positions[0] = this.nodes[i].pos.x; positions[1] = this.nodes[i].pos.y; positions[2] = this.nodes[i].pos.z;
          positions[3] = this.nodes[j].pos.x; positions[4] = this.nodes[j].pos.y; positions[5] = this.nodes[j].pos.z;
          line.geometry.attributes.position.needsUpdate = true;

          (line.material as THREE.LineBasicMaterial).opacity = (1 - dist / connectionDist) * 0.35 * (0.4 + audioData.energy * 0.6);
          (line.material as THREE.LineBasicMaterial).color.setHSL((this.baseHue + 0.05) % 1, 0.5, 0.5 + audioData.energy * 0.2);
          line.visible = true;
          connIdx++;
        }
      }
    }

    for (let i = connIdx; i < this.connections.length; i++) this.connections[i].visible = false;

    const ca = time * 0.04;
    this.camera.position.x = Math.sin(ca) * 1.0;
    this.camera.position.y = Math.cos(ca * 0.7) * 0.6;
    this.camera.position.z = 11;
    this.camera.lookAt(0, 0, 0);

    this.composer.render();
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  dispose() {
    const geoms = new Set<THREE.BufferGeometry>();
    this.nodes.forEach(n => { geoms.add(n.mesh.geometry); (n.mesh.material as THREE.Material).dispose(); });
    geoms.forEach(g => g.dispose());
    this.connections.forEach(c => { c.geometry.dispose(); (c.material as THREE.Material).dispose(); });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ============================================================================
// TUNNEL — Hyperspace Corridor with Bloom + Dust
// ============================================================================
class TunnelVisualizer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private rings: THREE.LineLoop[] = [];
  private ringCount = 50;
  private longitudinalLines: THREE.Line[] = [];
  private segments = 8;
  private baseHue: number;
  private dust: THREE.Points;
  private dustGeometry: THREE.BufferGeometry;
  private dustPositions: Float32Array;
  private dustVelocities: Float32Array;
  private dustCount = 300;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030002);
    this.baseHue = Math.random() * 0.15;

    this.camera = new THREE.PerspectiveCamera(80, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 3);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight), 2.2, 0.7, 0.2
    ));
    this.composer.addPass(new OutputPass());

    // Rings
    for (let i = 0; i < this.ringCount; i++) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array((this.segments + 1) * 3);
      for (let j = 0; j <= this.segments; j++) {
        const angle = (j / this.segments) * Math.PI * 2;
        positions[j * 3] = Math.cos(angle);
        positions[j * 3 + 1] = Math.sin(angle);
        positions[j * 3 + 2] = 0;
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const ring = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      ring.position.z = -i * 2;
      this.rings.push(ring);
      this.scene.add(ring);
    }

    // Longitudinal spines
    for (let s = 0; s < this.segments; s++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.ringCount * 3), 3));

      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      this.longitudinalLines.push(line);
      this.scene.add(line);
    }

    // Speed dust particles
    this.dustGeometry = new THREE.BufferGeometry();
    this.dustPositions = new Float32Array(this.dustCount * 3);
    this.dustVelocities = new Float32Array(this.dustCount);
    const tunnelEnd = -this.ringCount * 2;

    for (let i = 0; i < this.dustCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.5 + Math.random() * 3;
      this.dustPositions[i * 3] = Math.cos(angle) * radius;
      this.dustPositions[i * 3 + 1] = Math.sin(angle) * radius;
      this.dustPositions[i * 3 + 2] = tunnelEnd * Math.random();
      this.dustVelocities[i] = 0.5 + Math.random() * 0.5;
    }

    this.dustGeometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));

    this.dust = new THREE.Points(this.dustGeometry, new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.04,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }));
    this.scene.add(this.dust);
  }

  update(audioData: AudioData) {
    const time = performance.now() * 0.001;
    const tunnelEnd = -this.ringCount * 2;

    const baseSpeed = 3 + audioData.energy * 5;
    const kickBoost = audioData.kick ? audioData.bass * 8 : 0;
    const speed = baseSpeed + kickBoost;

    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      ring.position.z += speed * 0.016;
      if (ring.position.z > 3) ring.position.z = tunnelEnd + 3;

      const depth = (ring.position.z - tunnelEnd) / (-tunnelEnd + 3);

      const baseScale = 0.5 + depth * 3.5;
      const kickPulse = audioData.kick ? 1 + audioData.bass * 0.5 : 1;
      ring.scale.setScalar(baseScale * kickPulse);
      ring.rotation.z = audioData.barPhase * Math.PI * 0.3 + i * 0.04;

      const hue = (this.baseHue + depth * 0.15 + audioData.beatPhase * 0.03) % 1;
      const lightness = 0.3 + audioData.energy * 0.3 + depth * 0.15;
      (ring.material as THREE.LineBasicMaterial).color.setHSL(hue, 0.9, lightness);
      (ring.material as THREE.LineBasicMaterial).opacity = 0.2 + depth * 0.5;

      const positions = (ring.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let j = 0; j <= this.segments; j++) {
        const angle = (j / this.segments) * Math.PI * 2;
        const specIdx = j % audioData.spectrum.length;
        const deform = audioData.spectrum[specIdx] * 0.3;
        positions[j * 3] = Math.cos(angle) * (1 + deform);
        positions[j * 3 + 1] = Math.sin(angle) * (1 + deform);
      }
      ring.geometry.attributes.position.needsUpdate = true;
    }

    // Longitudinal spines
    for (let s = 0; s < this.segments; s++) {
      const line = this.longitudinalLines[s];
      const positions = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const baseAngle = (s / this.segments) * Math.PI * 2;

      for (let i = 0; i < this.rings.length; i++) {
        const ring = this.rings[i];
        const scale = ring.scale.x;
        const angle = baseAngle + ring.rotation.z;
        const specIdx = s % audioData.spectrum.length;
        const deform = audioData.spectrum[specIdx] * 0.3;
        const radius = (1 + deform) * scale;

        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = Math.sin(angle) * radius;
        positions[i * 3 + 2] = ring.position.z;
      }
      line.geometry.attributes.position.needsUpdate = true;

      const hue = (this.baseHue + s / this.segments * 0.1) % 1;
      (line.material as THREE.LineBasicMaterial).color.setHSL(hue, 0.85, 0.4 + audioData.energy * 0.15);
    }

    // Dust
    for (let i = 0; i < this.dustCount; i++) {
      this.dustPositions[i * 3 + 2] += speed * 0.016 * this.dustVelocities[i];
      if (this.dustPositions[i * 3 + 2] > 3) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.5 + Math.random() * 3;
        this.dustPositions[i * 3] = Math.cos(angle) * radius;
        this.dustPositions[i * 3 + 1] = Math.sin(angle) * radius;
        this.dustPositions[i * 3 + 2] = tunnelEnd;
      }
    }
    this.dustGeometry.attributes.position.needsUpdate = true;
    (this.dust.material as THREE.PointsMaterial).opacity = 0.2 + audioData.energy * 0.3;

    this.composer.render();
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  dispose() {
    this.rings.forEach(r => { r.geometry.dispose(); (r.material as THREE.Material).dispose(); });
    this.longitudinalLines.forEach(l => { l.geometry.dispose(); (l.material as THREE.Material).dispose(); });
    this.dustGeometry.dispose();
    (this.dust.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ============================================================================
// MAIN VIEW COMPONENT
// ============================================================================
export const VisualsView: React.FC = () => {
  const api = usePluginAPI();
  const containerRef = useRef<HTMLDivElement>(null);
  const visualizerRef = useRef<OscilloscopeVisualizer | FlowFieldVisualizer | NetworkVisualizer | TunnelVisualizer | null>(null);
  const animationRef = useRef<number>(0);

  const [mode, setMode] = useState<VisualMode>('tunnel');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const audioState = api.audio.state;
  const audioData = useMusicalAudio(audioState.isPlaying);

  // Initialize visualizer
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Clear existing
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    switch (mode) {
      case 'oscilloscope':
        visualizerRef.current = new OscilloscopeVisualizer(container);
        break;
      case 'flowfield':
        visualizerRef.current = new FlowFieldVisualizer(container);
        break;
      case 'network':
        visualizerRef.current = new NetworkVisualizer(container);
        break;
      case 'tunnel':
        visualizerRef.current = new TunnelVisualizer(container);
        break;
    }

    const handleResize = () => {
      if (visualizerRef.current && containerRef.current) {
        visualizerRef.current.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationRef.current);
      if (visualizerRef.current) {
        visualizerRef.current.dispose();
        visualizerRef.current = null;
      }
    };
  }, [mode]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      if (visualizerRef.current) {
        visualizerRef.current.update(audioData);
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [audioData]);

  // Fullscreen
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div className="pb-40 h-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase mb-2">Plugin</h2>
        <h1 className="text-4xl font-bold tracking-tight">Visuals</h1>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === m.id
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>

        <button
          onClick={toggleFullscreen}
          className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.08] transition-all text-xs font-semibold"
        >
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>

      {/* Subtle audio indicators */}
      <div className="flex gap-6 mb-6 items-center">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-all duration-100 ${audioData.kick ? 'bg-red-400 scale-150' : 'bg-white/10 scale-100'}`} />
          <span className="text-[10px] text-white/20 uppercase">Kick</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-all duration-100 ${audioData.snare ? 'bg-yellow-400 scale-150' : 'bg-white/10 scale-100'}`} />
          <span className="text-[10px] text-white/20 uppercase">Snare</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-all duration-75 ${audioData.hihat ? 'bg-cyan-400 scale-125' : 'bg-white/10 scale-100'}`} />
          <span className="text-[10px] text-white/20 uppercase">Hi-hat</span>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <div className={`w-2 h-2 rounded-full ${audioState.isPlaying ? 'bg-green-500' : 'bg-white/20'}`} />
          <span className="text-[10px] text-white/30">{audioState.isPlaying ? 'Playing' : 'Paused'}</span>
        </div>
      </div>

      {/* Visualization container */}
      <div
        ref={containerRef}
        className="w-full aspect-video rounded-2xl overflow-hidden border border-white/[0.08] bg-black relative"
        style={{ minHeight: '450px' }}
      >
        {isFullscreen && (
          <div className="absolute top-4 left-4 z-10 pointer-events-none">
            <div className="text-white/20 text-xs font-medium bg-black/50 px-3 py-1 rounded-full">
              {MODES.find(m => m.id === mode)?.name} • ESC to exit
            </div>
          </div>
        )}

        {audioState.currentTrack && (
          <div className={`absolute bottom-4 left-4 z-10 pointer-events-none transition-opacity duration-500 ${isFullscreen ? 'opacity-60' : 'opacity-0'}`}>
            <div className="flex items-center gap-3 bg-black/60 backdrop-blur-xl rounded-xl px-4 py-3 border border-white/10">
              {audioState.currentTrack.cover && (
                <img src={audioState.currentTrack.cover} alt="" className="w-10 h-10 rounded-lg object-cover" />
              )}
              <div>
                <div className="text-sm font-semibold text-white">{audioState.currentTrack.title}</div>
                <div className="text-xs text-white/50">{audioState.currentTrack.artist}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
