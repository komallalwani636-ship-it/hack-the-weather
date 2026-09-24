import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

interface WeatherRigProps {
  windSpeed?: number;
  windDir?: number;
  solarIndex?: number;
  temp?: number;
  isRaining?: boolean;
}

export function WeatherRigScene({
  windSpeed = 2.4,
  windDir = 45,
  solarIndex = 400,
  temp = 22.0,
  isRaining = false,
}: WeatherRigProps) {
  const anemometerRef = useRef<THREE.Group>(null);
  const vaneRef = useRef<THREE.Group>(null);
  const rigGroupRef = useRef<THREE.Group>(null);

  // Speed of anemometer rotation proportional to wind speed
  const rotSpeed = Math.max(0.5, windSpeed * 1.8);

  useFrame((_, delta) => {
    if (anemometerRef.current) {
      anemometerRef.current.rotation.y += delta * rotSpeed;
    }
    if (vaneRef.current) {
      const targetRad = (windDir * Math.PI) / 180;
      vaneRef.current.rotation.y = THREE.MathUtils.lerp(
        vaneRef.current.rotation.y,
        targetRad,
        0.05
      );
    }
  });

  // Mouse tilt
  useFrame(({ pointer }) => {
    if (rigGroupRef.current) {
      rigGroupRef.current.rotation.y = THREE.MathUtils.lerp(
        rigGroupRef.current.rotation.y,
        pointer.x * 0.4,
        0.05
      );
      rigGroupRef.current.rotation.x = THREE.MathUtils.lerp(
        rigGroupRef.current.rotation.x,
        -pointer.y * 0.25,
        0.05
      );
    }
  });

  return (
    <group ref={rigGroupRef} position={[0, -0.2, 0]}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 8, 4]} intensity={1.5} color="#ffffff" />
      <pointLight position={[-3, 2, -2]} intensity={0.5} color="#38bdf8" />
      <pointLight position={[0, 1.2, 0]} intensity={0.3} color="#10b981" />

      {/* Main Mast Pole */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 2.2, 16]} />
        <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Base Tripod Mount */}
      <mesh position={[0, -1.05, 0]}>
        <cylinderGeometry args={[0.25, 0.35, 0.1, 8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.4} />
      </mesh>

      {/* Anemometer Cross Arm at Top */}
      <group position={[0, 0.95, 0]}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.15, 12]} />
          <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Spinning 3 Cups */}
        <group ref={anemometerRef} position={[0, 0.08, 0]}>
          <mesh>
            <cylinderGeometry args={[0.03, 0.03, 0.04, 16]} />
            <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
          </mesh>

          {[0, 120, 240].map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const armLen = 0.22;
            const x = Math.cos(rad) * armLen;
            const z = Math.sin(rad) * armLen;
            return (
              <group key={i}>
                {/* Arm */}
                <mesh position={[x / 2, 0, z / 2]} rotation={[0, -rad, 0]}>
                  <boxGeometry args={[armLen, 0.01, 0.01]} />
                  <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
                </mesh>
                {/* Cup Hemisphere */}
                <mesh position={[x, 0, z]} rotation={[0, -rad + Math.PI / 2, Math.PI / 2]}>
                  <sphereGeometry args={[0.045, 16, 16, 0, Math.PI]} />
                  <meshStandardMaterial
                    color={i === 0 ? "#10b981" : "#e2e8f0"}
                    metalness={0.6}
                    roughness={0.3}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              </group>
            );
          })}
        </group>
      </group>

      {/* Wind Vane Section */}
      <group position={[0, 0.65, 0]}>
        <group ref={vaneRef}>
          {/* Central bearing */}
          <mesh>
            <cylinderGeometry args={[0.025, 0.025, 0.06, 16]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Vane Tail */}
          <mesh position={[-0.14, 0, 0]}>
            <boxGeometry args={[0.24, 0.008, 0.008]} />
            <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[-0.26, 0.03, 0]}>
            <boxGeometry args={[0.08, 0.09, 0.004]} />
            <meshStandardMaterial color="#38bdf8" metalness={0.5} roughness={0.3} />
          </mesh>
          {/* Arrow Point */}
          <mesh position={[0.16, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.035, 0.1, 16]} />
            <meshStandardMaterial color="#10b981" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      </group>

      {/* Solar Radiation Sensor (Pyranometer) on Side Bracket */}
      <group position={[0.26, 0.35, 0]}>
        {/* Support arm */}
        <mesh position={[-0.13, 0, 0]}>
          <boxGeometry args={[0.26, 0.02, 0.02]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Sensor Housing */}
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.06, 0.07, 0.06, 24]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Glass Dome */}
        <mesh position={[0, 0.065, 0]}>
          <sphereGeometry args={[0.045, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial
            color="#fbbf24"
            transmission={0.8}
            opacity={1}
            roughness={0.05}
            ior={1.5}
          />
        </mesh>
      </group>

      {/* Rain Gauge Funnel on opposite side */}
      <group position={[-0.26, 0.15, 0]}>
        {/* Support arm */}
        <mesh position={[0.13, 0, 0]}>
          <boxGeometry args={[0.26, 0.02, 0.02]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Outer Cylinder */}
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.16, 24]} />
          <meshStandardMaterial color="#0284c7" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Inner Funnel */}
        <mesh position={[0, 0.12, 0]}>
          <coneGeometry args={[0.075, 0.08, 24]} />
          <meshStandardMaterial color="#0369a1" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>

      {/* SHT Temperature & Humidity Radiation Shield (Louvered Stevenson screen) */}
      <group position={[0, -0.3, 0]}>
        {[0, 0.04, 0.08, 0.12, 0.16, 0.2].map((y, i) => (
          <mesh key={i} position={[0, y, 0]}>
            <coneGeometry args={[0.12, 0.03, 24]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.2} />
          </mesh>
        ))}
      </group>

      {/* Ground Grid Base Aura */}
      <mesh position={[0, -1.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.7, 32]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.12} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
