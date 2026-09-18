'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, MeshWobbleMaterial } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

const ACCENT_DARK = new THREE.Color('#C8A882');
const ACCENT_LIGHT = new THREE.Color('#8B7355');
const DANGER = new THREE.Color('#C06060');
const MUTED_DARK = new THREE.Color('#333333');
const MUTED_LIGHT = new THREE.Color('#cccccc');

interface ShapeProps {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  speed: number;
  wobble: number;
  type: 'ico' | 'box' | 'torus' | 'octa' | 'cone';
  color: THREE.Color;
}

function FloatingShape({ position, rotation, scale, speed, wobble, type, color }: ShapeProps) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * speed;
    ref.current.rotation.x = rotation[0] + t * 0.3;
    ref.current.rotation.y = rotation[1] + t * 0.2;
    ref.current.rotation.z = rotation[2] + Math.sin(t * 0.5) * wobble;
    ref.current.position.y = position[1] + Math.sin(t * 0.8) * 0.3;
    ref.current.position.x = position[0] + Math.cos(t * 0.4) * 0.15;
  });

  const geometry = useMemo(() => {
    switch (type) {
      case 'ico': return new THREE.IcosahedronGeometry(1, 0);
      case 'box': return new THREE.BoxGeometry(1, 1, 1);
      case 'torus': return new THREE.TorusGeometry(0.8, 0.3, 8, 16);
      case 'octa': return new THREE.OctahedronGeometry(1, 0);
      case 'cone': return new THREE.ConeGeometry(0.7, 1.2, 4);
      default: return new THREE.IcosahedronGeometry(1, 0);
    }
  }, [type]);

  return (
    <mesh ref={ref} position={position} rotation={rotation} scale={scale} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        wireframe
        transparent
        opacity={0.35}
        emissive={color}
        emissiveIntensity={0.15}
      />
    </mesh>
  );
}

interface FloatingSolidProps {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  speed: number;
  color: THREE.Color;
}

function FloatingSolid({ position, rotation, scale, speed, color }: FloatingSolidProps) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * speed;
    ref.current.rotation.x = rotation[0] + t * 0.15;
    ref.current.rotation.y = rotation[1] + t * 0.25;
    ref.current.position.y = position[1] + Math.sin(t * 0.6) * 0.5;
  });

  return (
    <mesh ref={ref} position={position} rotation={rotation} scale={scale}>
      <icosahedronGeometry args={[1, 1]} />
      <MeshDistortMaterial
        color={color}
        wireframe
        transparent
        opacity={0.12}
        distort={0.3}
        speed={2}
        emissive={color}
        emissiveIntensity={0.05}
      />
    </mesh>
  );
}

function FloatingWobble({ position, rotation, scale, speed, color }: FloatingSolidProps) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * speed;
    ref.current.rotation.x = rotation[0] + t * 0.1;
    ref.current.rotation.z = rotation[2] + t * 0.2;
    ref.current.position.x = position[0] + Math.sin(t * 0.3) * 0.4;
  });

  return (
    <mesh ref={ref} position={position} rotation={rotation} scale={scale}>
      <torusKnotGeometry args={[0.8, 0.25, 64, 8]} />
      <MeshWobbleMaterial
        color={color}
        wireframe
        transparent
        opacity={0.15}
        factor={0.4}
        speed={1.5}
        emissive={color}
        emissiveIntensity={0.08}
      />
    </mesh>
  );
}

function makeParticlePositions(count: number): Float32Array {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = (i * 0.618033988749895 * 30) % 30 - 15;
    arr[i * 3 + 1] = (i * 0.786151377757 * 30) % 30 - 15;
    arr[i * 3 + 2] = (i * 0.432167890123 * 30) % 30 - 15;
  }
  return arr;
}

const PARTICLE_POSITIONS = makeParticlePositions(200);

function Particles({ count, dark }: { count: number; dark: boolean }) {
  const ref = useRef<THREE.Points>(null);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.02;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.01) * 0.1;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[PARTICLE_POSITIONS, 3]} count={count} />
      </bufferGeometry>
      <pointsMaterial
        color={dark ? '#ffffff' : '#000000'}
        size={0.04}
        transparent
        opacity={dark ? 0.4 : 0.3}
        sizeAttenuation
      />
    </points>
  );
}

function GridPlane({ dark }: { dark: boolean }) {
  const ref = useRef<THREE.GridHelper>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.z = -5 + Math.sin(state.clock.elapsedTime * 0.1) * 2;
  });
  return (
    <gridHelper
      ref={ref}
      args={[40, 40, dark ? '#1a1a1a' : '#e0e0e0', dark ? '#111111' : '#f0f0f0']}
      position={[0, -4, -5]}
      rotation={[0, 0, 0]}
    />
  );
}

interface SceneProps {
  dark: boolean;
  phase: string;
  className?: string;
}

function SceneContent({ dark, phase }: SceneProps) {
  const accent = dark ? ACCENT_DARK : ACCENT_LIGHT;
  const muted = dark ? MUTED_DARK : MUTED_LIGHT;
  const danger = DANGER;

  const shapes = useMemo(() => [
    { pos: [-3, 1.5, -2] as [number, number, number], rot: [0.5, 0.3, 0] as [number, number, number], scale: 0.7, speed: 0.3, wobble: 0.5, type: 'ico' as const, color: accent },
    { pos: [3.5, -0.5, -3] as [number, number, number], rot: [0.2, 0.8, 0.1] as [number, number, number], scale: 0.9, speed: 0.2, wobble: 0.3, type: 'box' as const, color: muted },
    { pos: [-2, -1.5, -4] as [number, number, number], rot: [0.7, 0.1, 0.4] as [number, number, number], scale: 0.5, speed: 0.4, wobble: 0.7, type: 'torus' as const, color: accent },
    { pos: [2, 2, -5] as [number, number, number], rot: [0.1, 0.6, 0.2] as [number, number, number], scale: 1.1, speed: 0.15, wobble: 0.2, type: 'octa' as const, color: muted },
    { pos: [-4, 0, -6] as [number, number, number], rot: [0.3, 0.4, 0.6] as [number, number, number], scale: 0.6, speed: 0.25, wobble: 0.4, type: 'cone' as const, color: phase === 'capturing' || phase === 'refused' ? danger : accent },
    { pos: [4, 1, -3.5] as [number, number, number], rot: [0.8, 0.2, 0.3] as [number, number, number], scale: 0.4, speed: 0.35, wobble: 0.6, type: 'ico' as const, color: muted },
    { pos: [0, -2, -7] as [number, number, number], rot: [0.4, 0.7, 0.1] as [number, number, number], scale: 1.3, speed: 0.1, wobble: 0.15, type: 'box' as const, color: accent },
    { pos: [-1, 3, -4.5] as [number, number, number], rot: [0.6, 0.3, 0.5] as [number, number, number], scale: 0.35, speed: 0.45, wobble: 0.8, type: 'torus' as const, color: muted },
  ], [accent, muted, danger, phase]);

  const solids = useMemo(() => [
    { pos: [1.5, 0.5, -3] as [number, number, number], rot: [0.2, 0.5, 0] as [number, number, number], scale: 0.5, speed: 0.2, color: accent },
    { pos: [-2.5, -1, -5] as [number, number, number], rot: [0.6, 0.1, 0.3] as [number, number, number], scale: 0.7, speed: 0.15, color: muted },
    { pos: [3, -1.5, -6] as [number, number, number], rot: [0.1, 0.8, 0.5] as [number, number, number], scale: 0.4, speed: 0.3, color: accent },
  ], [accent, muted]);

  return (
    <>
      <color attach="background" args={[dark ? '#050505' : '#f5f3f0']} />
      <fog attach="fog" args={[dark ? '#050505' : '#f5f3f0', 8, 25]} />

      <ambientLight intensity={dark ? 0.15 : 0.3} />
      <directionalLight position={[5, 5, 5]} intensity={dark ? 0.3 : 0.5} color={dark ? '#C8A882' : '#8B7355'} />
      <pointLight position={[-3, 2, -2]} intensity={dark ? 0.4 : 0.3} color={dark ? '#C8A882' : '#8B7355'} distance={15} />
      <pointLight position={[3, -2, -4]} intensity={dark ? 0.2 : 0.15} color={phase === 'capturing' ? '#C06060' : (dark ? '#C8A882' : '#8B7355')} distance={12} />

      {shapes.map((s, i) => (
        <FloatingShape key={`s${i}`} position={s.pos} rotation={s.rot} scale={s.scale} speed={s.speed} wobble={s.wobble} type={s.type} color={s.color} />
      ))}

      {solids.map((s, i) => (
        <FloatingSolid key={`sol${i}`} position={s.pos} rotation={s.rot} scale={s.scale} speed={s.speed} color={s.color} />
      ))}

      <FloatingWobble position={[0, 0, -4]} rotation={[0.3, 0.5, 0.1]} scale={0.3} speed={0.12} color={accent} />

      <Particles count={200} dark={dark} />
      <GridPlane dark={dark} />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          intensity={dark ? 0.8 : 0.4}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

export function Scene3D({ dark, phase, className }: SceneProps) {
  return (
    <div className={`fixed inset-0 ${className || ''}`} style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false }}
      >
        <SceneContent dark={dark} phase={phase} />
      </Canvas>
    </div>
  );
}
