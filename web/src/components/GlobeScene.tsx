import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const JKUAT_LAT = -1.0982;
const JKUAT_LON = 37.0144;

function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function JKUATBeacon({ hasRain, hasHeat }: { hasRain?: boolean; hasHeat?: boolean }) {
  const markerGroup = useRef<THREE.Group>(null);
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => latLonToVec3(JKUAT_LAT, JKUAT_LON, 1.002), []);

  const beaconColor = hasRain ? "#38bdf8" : hasHeat ? "#f97316" : "#10b981";

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ring1.current) {
      const s1 = 1 + (t % 1.5) * 1.8;
      ring1.current.scale.set(s1, s1, s1);
      (ring1.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - (t % 1.5) / 1.5);
    }
    if (ring2.current) {
      const s2 = 1 + ((t + 0.75) % 1.5) * 1.8;
      ring2.current.scale.set(s2, s2, s2);
      (ring2.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - ((t + 0.75) % 1.5) / 1.5);
    }
    if (beamRef.current) {
      beamRef.current.scale.y = 1 + 0.15 * Math.sin(t * 4);
    }
  });

  // Calculate orientation normal pointing away from globe center
  const normal = pos.clone().normalize();
  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    return q;
  }, [normal]);

  return (
    <group position={pos} quaternion={quat} ref={markerGroup}>
      {/* Base pin */}
      <mesh position={[0, 0.015, 0]}>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshBasicMaterial color={beaconColor} />
      </mesh>

      {/* Pulsing rings on globe surface */}
      <mesh ref={ring1} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.025, 0.04, 32]} />
        <meshBasicMaterial color={beaconColor} transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring2} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.025, 0.04, 32]} />
        <meshBasicMaterial color={beaconColor} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* Vertical telemetry beacon beam */}
      <mesh ref={beamRef} position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.003, 0.008, 0.35, 12]} />
        <meshBasicMaterial color={beaconColor} transparent opacity={0.65} />
      </mesh>
    </group>
  );
}

function OrbitingSatellite({ orbitRadius, speed, color, tilt }: { orbitRadius: number; speed: number; color: string; tilt: number }) {
  const satRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.LineLoop>(null);

  const ringGeo = useMemo(() => {
    const points = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(theta) * orbitRadius, 0, Math.sin(theta) * orbitRadius));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [orbitRadius]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed;
    if (satRef.current) {
      satRef.current.position.x = Math.cos(t) * orbitRadius;
      satRef.current.position.z = Math.sin(t) * orbitRadius;
      satRef.current.rotation.y = t + Math.PI / 2;
    }
  });

  return (
    <group rotation={[tilt, 0, tilt * 0.5]}>
      {/* Orbital trajectory trace */}
      <lineLoop ref={ringRef} geometry={ringGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.15} />
      </lineLoop>

      {/* Satellite body */}
      <group ref={satRef}>
        <mesh>
          <boxGeometry args={[0.035, 0.02, 0.02]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Solar panels */}
        <mesh position={[0.04, 0, 0]}>
          <boxGeometry args={[0.045, 0.002, 0.025]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[-0.04, 0, 0]}>
          <boxGeometry args={[0.045, 0.002, 0.025]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.9} roughness={0.1} />
        </mesh>
        {/* Tiny beacon light */}
        <pointLight color={color} intensity={0.5} distance={0.5} />
      </group>
    </group>
  );
}

function Clouds() {
  const cloudsRef = useRef<THREE.Mesh>(null);
  const cloudTexture = useMemo(() => new THREE.CanvasTexture(createCloudsCanvas()), []);

  useFrame((_, delta) => {
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += delta * 0.025;
      cloudsRef.current.rotation.x += delta * 0.005;
    }
  });

  return (
    <mesh ref={cloudsRef}>
      <sphereGeometry args={[1.025, 48, 48]} />
      <meshStandardMaterial
        map={cloudTexture}
        transparent
        opacity={0.35}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function EarthMesh() {
  const earthRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => new THREE.CanvasTexture(createDetailedEarthCanvas()), []);

  useFrame((_, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * 0.04;
    }
  });

  return (
    <mesh ref={earthRef}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial
        map={texture}
        roughness={0.7}
        metalness={0.15}
      />
    </mesh>
  );
}

function AtmosphereGlow() {
  return (
    <>
      <mesh>
        <sphereGeometry args={[1.12, 48, 48]} />
        <meshBasicMaterial
          color="#0ea5e9"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.22, 48, 48]} />
        <meshBasicMaterial
          color="#10b981"
          transparent
          opacity={0.05}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

function createCloudsCanvas(): HTMLCanvasElement {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Cloud bands
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * canvas.width;
    const y = canvas.height * 0.2 + Math.random() * (canvas.height * 0.6);
    const rx = 40 + Math.random() * 80;
    const ry = 10 + Math.random() * 25;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, (Math.random() - 0.5) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

function createDetailedEarthCanvas(): HTMLCanvasElement {
  const size = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext("2d")!;

  // Deep ocean gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  oceanGrad.addColorStop(0, "#030c1e");
  oceanGrad.addColorStop(0.3, "#08214d");
  oceanGrad.addColorStop(0.5, "#0b2b60");
  oceanGrad.addColorStop(0.7, "#08214d");
  oceanGrad.addColorStop(1, "#030c1e");
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Latitude and Longitude subtle coordinate grid
  ctx.strokeStyle = "rgba(56, 189, 248, 0.1)";
  ctx.lineWidth = 1;
  for (let lat = -80; lat <= 80; lat += 20) {
    const y = ((90 - lat) / 180) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  for (let lon = -180; lon <= 180; lon += 30) {
    const x = ((lon + 180) / 360) * canvas.width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // Draw continents with land gradient and vegetation
  const landGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  landGrad.addColorStop(0, "#1c382b");
  landGrad.addColorStop(0.5, "#14422e");
  landGrad.addColorStop(1, "#1c382b");
  ctx.fillStyle = landGrad;

  const w = canvas.width;
  const h = canvas.height;

  // Africa (Centered around lon 20°E - 40°E, lat -35° to 35°)
  const africaX = ((20 + 180) / 360) * w;
  const africaY = ((90 - 0) / 180) * h;
  ctx.beginPath();
  ctx.ellipse(africaX, africaY, w * 0.08, h * 0.32, 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Horn of Africa
  ctx.beginPath();
  ctx.ellipse(africaX + w * 0.05, africaY - h * 0.05, w * 0.035, h * 0.1, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Europe & Mediterranean
  ctx.beginPath();
  ctx.ellipse(africaX - w * 0.02, africaY - h * 0.28, w * 0.065, h * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Asia
  ctx.beginPath();
  ctx.ellipse(w * 0.72, h * 0.32, w * 0.16, h * 0.22, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // Americas - North
  ctx.beginPath();
  ctx.ellipse(w * 0.24, h * 0.3, w * 0.08, h * 0.2, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Americas - South
  ctx.beginPath();
  ctx.ellipse(w * 0.31, h * 0.68, w * 0.06, h * 0.22, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Australia
  ctx.beginPath();
  ctx.ellipse(w * 0.86, h * 0.7, w * 0.06, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Highlight East Africa / Kenya / JKUAT with neon agricultural aura
  const jkuatX = ((JKUAT_LON + 180) / 360) * w;
  const jkuatY = ((90 - JKUAT_LAT) / 180) * h;
  const jkuatGlow = ctx.createRadialGradient(jkuatX, jkuatY, 0, jkuatX, jkuatY, 45);
  jkuatGlow.addColorStop(0, "rgba(52, 211, 153, 0.9)");
  jkuatGlow.addColorStop(0.4, "rgba(16, 185, 129, 0.4)");
  jkuatGlow.addColorStop(1, "rgba(16, 185, 129, 0)");
  ctx.fillStyle = jkuatGlow;
  ctx.beginPath();
  ctx.arc(jkuatX, jkuatY, 45, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

export function GlobeScene({ hasRain, hasHeat }: { hasRain?: boolean; hasHeat?: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  // Parallax inertia tracking mouse
  useFrame(({ pointer }) => {
    if (groupRef.current) {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, pointer.y * 0.2, 0.05);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, -pointer.x * 0.15, 0.05);
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 4, 5]} intensity={1.8} color="#f8fafc" />
      <directionalLight position={[-6, -3, -4]} intensity={0.4} color="#0284c7" />
      <pointLight position={[0, 0, 3.5]} intensity={0.6} color="#38bdf8" />

      <AtmosphereGlow />
      <EarthMesh />
      <Clouds />
      <JKUATBeacon hasRain={hasRain} hasHeat={hasHeat} />

      {/* Orbiting Sentinel Satellites */}
      <OrbitingSatellite orbitRadius={1.38} speed={0.4} color="#38bdf8" tilt={0.45} />
      <OrbitingSatellite orbitRadius={1.55} speed={-0.3} color="#34d399" tilt={-0.35} />
    </group>
  );
}
