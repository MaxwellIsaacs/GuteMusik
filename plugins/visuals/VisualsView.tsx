import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { PluginViewProps } from '../../types';
import { useAudio } from '../../context/AudioContext';

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

// Musical audio simulation - groovy, not chaotic
function useMusicalAudio(isPlaying: boolean) {
  const [data, setData] = useState({
    bass: 0, mid: 0, high: 0,
    waveform: new Float32Array(128).fill(0),
    spectrum: new Float32Array(64).fill(0),
    energy: 0,
    kick: false,
    snare: false,
    hihat: false,
    beatPhase: 0, // 0-1 within current beat
    barPhase: 0,  // 0-1 within current bar (4 beats)
  });

  const frameRef = useRef<number>(0);
  const seedRef = useRef(Math.random() * 1000); // Unique seed per "song"

  useEffect(() => {
    if (!isPlaying) {
      setData(d => ({ ...d, bass: 0.05, mid: 0.05, high: 0.05, energy: 0.05, kick: false, snare: false, hihat: false }));
      return;
    }

    // New "song" = new seed for unique character
    seedRef.current = Math.random() * 1000;

    const animate = () => {
      const time = performance.now() * 0.001;
      const seed = seedRef.current;

      // Song characteristics derived from seed
      const bpm = 118 + (seed % 20); // 118-138 BPM range
      const swingAmount = (seed % 100) / 500; // 0-0.2 swing
      const bassiness = 0.5 + (seed % 50) / 100; // How punchy the bass is
      const brightness = 0.3 + (seed % 40) / 100; // How bright the highs are

      const beatDuration = 60 / bpm;
      const barDuration = beatDuration * 4;

      // Calculate phase within beat and bar
      const rawBeatPhase = (time % beatDuration) / beatDuration;
      const beatNumber = Math.floor(time / beatDuration) % 4;
      const barPhase = (time % barDuration) / barDuration;

      // Apply swing to off-beats
      let beatPhase = rawBeatPhase;
      if (beatNumber % 2 === 1) {
        beatPhase = rawBeatPhase * (1 - swingAmount);
      }

      // Kick drum - beats 1 and 3 (or every beat for four-on-floor)
      const fourOnFloor = seed % 100 > 40;
      const kickBeats = fourOnFloor ? [0, 1, 2, 3] : [0, 2];
      const isKickBeat = kickBeats.includes(beatNumber);
      const kickEnvelope = isKickBeat ? Math.exp(-beatPhase * 6) : 0;
      const kick = beatPhase < 0.15 && isKickBeat;

      // Snare - beats 2 and 4
      const snareBeats = [1, 3];
      const isSnare = snareBeats.includes(beatNumber);
      const snareEnvelope = isSnare ? Math.exp(-beatPhase * 8) : 0;
      const snare = beatPhase < 0.1 && isSnare;

      // Hi-hat - 8th notes or 16th notes
      const hihatSpeed = seed % 100 > 60 ? 0.25 : 0.5;
      const hihatPhase = (time % (beatDuration * hihatSpeed)) / (beatDuration * hihatSpeed);
      const hihatEnvelope = Math.exp(-hihatPhase * 12) * brightness;
      const hihat = hihatPhase < 0.1;

      // Bass - follows kick with body
      const bassBase = kickEnvelope * bassiness;
      const bassSustain = Math.sin(barPhase * Math.PI * 2) * 0.1 + 0.15;
      const bass = Math.max(bassBase, bassSustain);

      // Mid - melodic content, changes per bar with seed influence
      const melodyPhase = time * (0.5 + (seed % 30) / 60);
      const midBase = 0.2 + Math.sin(melodyPhase) * 0.15;
      const midAccent = snareEnvelope * 0.3;
      const mid = midBase + midAccent;

      // High - hi-hats and air
      const high = hihatEnvelope * 0.6 + 0.1;

      // Generate waveform - smooth, musical oscillation
      const waveform = new Float32Array(128);
      const waveFreq1 = 2 + (seed % 4); // Unique wave shape per song
      const waveFreq2 = 4 + (seed % 6);
      for (let i = 0; i < 128; i++) {
        const t = i / 128;
        // Main wave follows bass
        const mainWave = Math.sin(t * Math.PI * waveFreq1 + time * 3) * bass * 0.6;
        // Harmonic follows mid
        const harmonic = Math.sin(t * Math.PI * waveFreq2 + time * 5) * mid * 0.3;
        // High frequency detail
        const detail = Math.sin(t * Math.PI * 16 + time * 12) * high * 0.15;
        waveform[i] = mainWave + harmonic + detail;
      }

      // Generate spectrum - frequency distribution unique to song
      const spectrum = new Float32Array(64);
      const bassWidth = 8 + (seed % 8); // How wide the bass band is
      const midPeak = 20 + (seed % 15); // Where the mid peak is
      for (let i = 0; i < 64; i++) {
        if (i < bassWidth) {
          // Bass region
          spectrum[i] = bass * (1 - i / bassWidth) * 1.2;
        } else if (i < 40) {
          // Mid region with peak
          const distFromPeak = Math.abs(i - midPeak) / 20;
          spectrum[i] = mid * (1 - distFromPeak * 0.7);
        } else {
          // High region
          spectrum[i] = high * (1 - (i - 40) / 30);
        }
        spectrum[i] = Math.max(0, Math.min(1, spectrum[i]));
      }

      const energy = bass * 0.4 + mid * 0.35 + high * 0.25;

      setData({
        bass: Math.max(0, Math.min(1, bass)),
        mid: Math.max(0, Math.min(1, mid)),
        high: Math.max(0, Math.min(1, high)),
        waveform,
        spectrum,
        energy: Math.max(0, Math.min(1, energy)),
        kick,
        snare,
        hihat,
        beatPhase,
        barPhase,
      });

      frameRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(frameRef.current);
  }, [isPlaying]);

  return data;
}

// ============================================================================
// OSCILLOSCOPE - Smooth 3D Ribbon Waveforms
// ============================================================================
class OscilloscopeVisualizer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private lines: THREE.Line[] = [];
  private history: Float32Array[] = [];
  private historyLength = 40;
  private baseHue: number;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080808);
    this.baseHue = Math.random(); // Unique color per session

    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 0.5, 5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Initialize history with smooth lines
    for (let i = 0; i < this.historyLength; i++) {
      this.history.push(new Float32Array(128).fill(0));

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(128 * 3);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8 - (i / this.historyLength) * 0.7,
      });

      const line = new THREE.Line(geometry, material);
      this.lines.push(line);
      this.scene.add(line);
    }
  }

  update(audioData: ReturnType<typeof useMusicalAudio>) {
    // Shift history smoothly
    for (let i = this.history.length - 1; i > 0; i--) {
      this.history[i].set(this.history[i - 1]);
    }
    this.history[0].set(audioData.waveform);

    const time = performance.now() * 0.001;

    // Update line positions
    for (let h = 0; h < this.history.length; h++) {
      const line = this.lines[h];
      const positions = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const waveform = this.history[h];

      const zOffset = h * 0.12;
      // Gentle breathing motion synced to bar
      const breathe = Math.sin(audioData.barPhase * Math.PI * 2) * 0.05;

      for (let i = 0; i < 128; i++) {
        const t = (i / 127) - 0.5;
        const x = t * 7;
        // Amplitude scales with bass on kick
        const ampMod = 1 + (audioData.kick ? audioData.bass * 0.5 : 0);
        const y = waveform[i] * 1.5 * ampMod + breathe;
        const z = -zOffset;

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
      }

      line.geometry.attributes.position.needsUpdate = true;

      // Color: base hue shifts slowly, brightness pulses with beat
      const hue = (this.baseHue + h * 0.015 + time * 0.02) % 1;
      const lightness = 0.4 + audioData.energy * 0.2;
      (line.material as THREE.LineBasicMaterial).color.setHSL(hue, 0.6, lightness);
    }

    // Very gentle camera sway - barely noticeable
    this.camera.position.x = Math.sin(time * 0.1) * 0.2;
    this.camera.position.y = 0.5 + Math.sin(time * 0.08) * 0.1;
    this.camera.lookAt(0, 0, -2);

    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    this.lines.forEach(line => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ============================================================================
// FLOW FIELD - Graceful Particle Trails
// ============================================================================
class FlowFieldVisualizer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private particles: { pos: THREE.Vector3; vel: THREE.Vector3; trail: THREE.Vector3[]; seed: number }[] = [];
  private trailLines: THREE.Line[] = [];
  private particleCount = 150;
  private trailLength = 40;
  private baseHue: number;
  private flowSeed: number;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050508);
    this.baseHue = Math.random() * 0.3; // Warm colors: 0-0.3
    this.flowSeed = Math.random() * 100;

    this.camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Initialize particles in a curved formation
    for (let i = 0; i < this.particleCount; i++) {
      const angle = (i / this.particleCount) * Math.PI * 2;
      const radius = 2 + Math.random() * 3;
      const particle = {
        pos: new THREE.Vector3(
          Math.cos(angle) * radius + (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 3
        ),
        vel: new THREE.Vector3(0, 0, 0),
        trail: [] as THREE.Vector3[],
        seed: Math.random(),
      };
      this.particles.push(particle);

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(this.trailLength * 3);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.LineBasicMaterial({
        color: 0xffcc44,
        transparent: true,
        opacity: 0.5,
      });

      const line = new THREE.Line(geometry, material);
      this.trailLines.push(line);
      this.scene.add(line);
    }
  }

  private flowField(x: number, y: number, z: number, time: number): THREE.Vector3 {
    // Smooth, predictable flow based on seed
    const s = this.flowSeed;
    const angle = Math.sin(x * 0.3 + s) * Math.PI + Math.cos(y * 0.2 + time * 0.3) * Math.PI * 0.5;
    const lift = Math.sin(y * 0.5 + x * 0.3 + time * 0.2) * 0.3;

    return new THREE.Vector3(
      Math.cos(angle) * 0.8,
      lift + Math.sin(time * 0.5 + x) * 0.2,
      Math.sin(angle) * 0.3
    );
  }

  update(audioData: ReturnType<typeof useMusicalAudio>) {
    const time = performance.now() * 0.001;

    // Speed controlled by energy, but smooth
    const baseSpeed = 0.015 + audioData.energy * 0.02;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const line = this.trailLines[i];

      // Get flow direction
      const flow = this.flowField(p.pos.x, p.pos.y, p.pos.z, time);

      // Pulse outward on kick
      if (audioData.kick) {
        const outward = p.pos.clone().normalize().multiplyScalar(0.03 * audioData.bass);
        flow.add(outward);
      }

      // Smooth velocity update
      p.vel.lerp(flow, 0.08);
      p.vel.multiplyScalar(0.96);

      // Apply velocity
      p.pos.add(p.vel.clone().multiplyScalar(baseSpeed));

      // Store trail
      p.trail.unshift(p.pos.clone());
      if (p.trail.length > this.trailLength) p.trail.pop();

      // Wrap around smoothly
      if (p.pos.x > 6) p.pos.x = -6;
      if (p.pos.x < -6) p.pos.x = 6;
      if (p.pos.y > 4) p.pos.y = -4;
      if (p.pos.y < -4) p.pos.y = 4;

      // Update trail geometry
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

      // Color based on particle seed and audio
      const hue = (this.baseHue + p.seed * 0.15 + audioData.mid * 0.1) % 1;
      const sat = 0.7 + audioData.high * 0.2;
      const light = 0.45 + audioData.energy * 0.15;
      (line.material as THREE.LineBasicMaterial).color.setHSL(hue, sat, light);
      (line.material as THREE.LineBasicMaterial).opacity = 0.3 + audioData.energy * 0.3;
    }

    // Static camera - let the particles do the dancing
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    this.trailLines.forEach(line => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ============================================================================
// NETWORK - Breathing Constellation
// ============================================================================
class NetworkVisualizer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private nodes: { pos: THREE.Vector3; basePos: THREE.Vector3; mesh: THREE.Mesh; seed: number }[] = [];
  private connections: THREE.Line[] = [];
  private nodeCount = 60;
  private baseHue: number;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08080a);
    this.baseHue = 0.9 + Math.random() * 0.2; // Pink/magenta range

    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 10);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Create nodes in organic clusters
    const geometry = new THREE.SphereGeometry(0.08, 12, 12);

    for (let i = 0; i < this.nodeCount; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(geometry, material);

      // Cluster-based positioning
      const cluster = Math.floor(Math.random() * 4);
      const clusterCenter = [
        new THREE.Vector3(-3, 2, 0),
        new THREE.Vector3(3, 1, -1),
        new THREE.Vector3(-2, -2, 1),
        new THREE.Vector3(2, -1, 0),
      ][cluster];

      const pos = clusterCenter.clone().add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3
        )
      );

      mesh.position.copy(pos);

      this.nodes.push({
        pos: pos.clone(),
        basePos: pos.clone(),
        mesh,
        seed: Math.random(),
      });

      this.scene.add(mesh);
    }

    // Pre-create connection lines
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
    });

    for (let i = 0; i < 300; i++) {
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(lineGeometry, lineMaterial.clone());
      line.visible = false;
      this.connections.push(line);
      this.scene.add(line);
    }
  }

  update(audioData: ReturnType<typeof useMusicalAudio>) {
    const time = performance.now() * 0.001;

    // Update nodes - gentle breathing motion
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];

      // Breathe with the bar
      const breathePhase = audioData.barPhase * Math.PI * 2 + node.seed * Math.PI * 2;
      const breatheAmount = 0.15 + audioData.energy * 0.1;

      // Calculate breathing offset
      const breatheDir = node.basePos.clone().normalize();
      const breatheOffset = breatheDir.multiplyScalar(Math.sin(breathePhase) * breatheAmount);

      // Gentle float
      const floatY = Math.sin(time * 0.5 + node.seed * 10) * 0.1;
      const floatX = Math.cos(time * 0.3 + node.seed * 10) * 0.05;

      node.pos.copy(node.basePos).add(breatheOffset);
      node.pos.y += floatY;
      node.pos.x += floatX;

      node.mesh.position.copy(node.pos);

      // Scale pulse on kick
      const kickPulse = audioData.kick ? 1.5 : 1;
      const baseScale = 0.8 + node.seed * 0.4;
      node.mesh.scale.setScalar(baseScale * kickPulse);

      // Color
      const hue = (this.baseHue + node.seed * 0.1) % 1;
      const brightness = 0.5 + audioData.spectrum[Math.floor(node.seed * 30)] * 0.4;
      (node.mesh.material as THREE.MeshBasicMaterial).color.setHSL(hue, 0.5, brightness);
    }

    // Update connections
    let connIdx = 0;
    const connectionDist = 2.5 + audioData.energy * 1.0;

    for (let i = 0; i < this.nodes.length && connIdx < this.connections.length; i++) {
      for (let j = i + 1; j < this.nodes.length && connIdx < this.connections.length; j++) {
        const dist = this.nodes[i].pos.distanceTo(this.nodes[j].pos);

        if (dist < connectionDist) {
          const line = this.connections[connIdx];
          const positions = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;

          positions[0] = this.nodes[i].pos.x;
          positions[1] = this.nodes[i].pos.y;
          positions[2] = this.nodes[i].pos.z;
          positions[3] = this.nodes[j].pos.x;
          positions[4] = this.nodes[j].pos.y;
          positions[5] = this.nodes[j].pos.z;

          line.geometry.attributes.position.needsUpdate = true;

          // Opacity based on distance and audio
          const opacity = (1 - dist / connectionDist) * 0.25 * (0.5 + audioData.energy * 0.5);
          (line.material as THREE.LineBasicMaterial).opacity = opacity;
          (line.material as THREE.LineBasicMaterial).color.setHSL(this.baseHue, 0.4, 0.5);

          line.visible = true;
          connIdx++;
        }
      }
    }

    // Hide unused
    for (let i = connIdx; i < this.connections.length; i++) {
      this.connections[i].visible = false;
    }

    // Very slow camera drift
    this.camera.position.x = Math.sin(time * 0.05) * 0.5;
    this.camera.position.y = Math.cos(time * 0.04) * 0.3;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    this.nodes.forEach(n => {
      n.mesh.geometry.dispose();
      (n.mesh.material as THREE.Material).dispose();
    });
    this.connections.forEach(c => {
      c.geometry.dispose();
      (c.material as THREE.Material).dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ============================================================================
// TUNNEL - Rhythmic Geometric Tunnel
// ============================================================================
class TunnelVisualizer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private rings: THREE.LineLoop[] = [];
  private ringCount = 30;
  private longitudinalLines: THREE.Line[] = [];
  private baseHue: number;
  private segments: number;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050005);
    this.baseHue = Math.random() * 0.15; // Red/orange range
    this.segments = 6 + Math.floor(Math.random() * 4); // 6-9 sides

    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 3);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Create rings
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

      const material = new THREE.LineBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.7,
      });

      const ring = new THREE.LineLoop(geometry, material);
      ring.position.z = -i * 2;
      this.rings.push(ring);
      this.scene.add(ring);
    }

    // Create longitudinal lines connecting rings
    for (let s = 0; s < this.segments; s++) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(this.ringCount * 3);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.LineBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.3,
      });

      const line = new THREE.Line(geometry, material);
      this.longitudinalLines.push(line);
      this.scene.add(line);
    }
  }

  update(audioData: ReturnType<typeof useMusicalAudio>) {
    const time = performance.now() * 0.001;

    // Speed based on energy - but smoother, more like a cruise
    const speed = 3 + audioData.energy * 4;

    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];

      // Move forward
      ring.position.z += speed * 0.016;

      // Reset at camera
      if (ring.position.z > 3) {
        ring.position.z = -this.ringCount * 2 + 3;
      }

      // Calculate depth
      const depth = (ring.position.z + this.ringCount * 2) / (this.ringCount * 2);

      // Scale: grows as it approaches, PULSES on kick
      const baseScale = 0.5 + depth * 3;
      const kickPulse = audioData.kick ? 1 + audioData.bass * 0.4 : 1;
      ring.scale.setScalar(baseScale * kickPulse);

      // Gentle rotation - synced to bar for consistency
      ring.rotation.z = audioData.barPhase * Math.PI * 0.25 + i * 0.05;

      // Color: hue shifts with depth, brightness with audio
      const hue = (this.baseHue + depth * 0.1 + audioData.beatPhase * 0.05) % 1;
      const lightness = 0.4 + audioData.energy * 0.2 + depth * 0.1;
      (ring.material as THREE.LineBasicMaterial).color.setHSL(hue, 0.9, lightness);
      (ring.material as THREE.LineBasicMaterial).opacity = 0.3 + depth * 0.4;

      // Deform ring vertices with spectrum
      const positions = (ring.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let j = 0; j <= this.segments; j++) {
        const angle = (j / this.segments) * Math.PI * 2;
        const specIdx = j % audioData.spectrum.length;
        const deform = audioData.spectrum[specIdx] * 0.2;
        const radius = 1 + deform;
        positions[j * 3] = Math.cos(angle) * radius;
        positions[j * 3 + 1] = Math.sin(angle) * radius;
      }
      ring.geometry.attributes.position.needsUpdate = true;
    }

    // Update longitudinal lines
    for (let s = 0; s < this.segments; s++) {
      const line = this.longitudinalLines[s];
      const positions = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const baseAngle = (s / this.segments) * Math.PI * 2;

      for (let i = 0; i < this.rings.length; i++) {
        const ring = this.rings[i];
        const scale = ring.scale.x;
        const angle = baseAngle + ring.rotation.z;

        // Get ring's current deformation
        const specIdx = s % audioData.spectrum.length;
        const deform = audioData.spectrum[specIdx] * 0.2;
        const radius = (1 + deform) * scale;

        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = Math.sin(angle) * radius;
        positions[i * 3 + 2] = ring.position.z;
      }

      line.geometry.attributes.position.needsUpdate = true;

      const hue = (this.baseHue + s / this.segments * 0.1) % 1;
      (line.material as THREE.LineBasicMaterial).color.setHSL(hue, 0.8, 0.4);
    }

    // No camera shake - stability is key
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    this.rings.forEach(r => {
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    });
    this.longitudinalLines.forEach(l => {
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ============================================================================
// MAIN VIEW COMPONENT
// ============================================================================
export const VisualsView: React.FC<PluginViewProps> = ({ onToast }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const visualizerRef = useRef<OscilloscopeVisualizer | FlowFieldVisualizer | NetworkVisualizer | TunnelVisualizer | null>(null);
  const animationRef = useRef<number>(0);

  const [mode, setMode] = useState<VisualMode>('tunnel');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { state: audioState } = useAudio();
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
