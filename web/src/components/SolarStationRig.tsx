import { Float, Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef, useState } from "react";
import * as THREE from "three";

interface SolarStationRigProps {
  windSpeed?: number;
  windDir?: number;
  solarFlux?: number;
  temp?: number;
  humidity?: number;
  rain1?: number;
  rain2?: number;
  viewMode?: "standard" | "exploded" | "thermal" | "wireframe";
  showAnnotations?: boolean;
  onSelectSensor?: (sensor: string) => void;
}

// ─── Rain Particles for Light Theme ───
function RainEffect({ count = 100 }: { count?: number }) {
  const rainGeo = useMemo(() => {
    const positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 3.2;
      const y = Math.random() * 2.5 + 0.2;
      const z = (Math.random() - 0.5) * 3.2;
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x - 0.03;
      positions[i * 6 + 4] = y - 0.16;
      positions[i * 6 + 5] = z - 0.03;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  const linesRef = useRef<THREE.LineSegments>(null);

  useFrame((_, delta) => {
    if (linesRef.current) {
      const pos = linesRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        pos[i * 6 + 1] -= delta * 4;
        pos[i * 6 + 4] -= delta * 4;
        if (pos[i * 6 + 1] < -1.1) {
          pos[i * 6 + 1] = 2.4;
          pos[i * 6 + 4] = 2.24;
        }
      }
      linesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <lineSegments ref={linesRef} geometry={rainGeo}>
      <lineBasicMaterial color="#0284c7" transparent opacity={0.7} />
    </lineSegments>
  );
}

function RigModel({
  windSpeed = 2.4,
  windDir = 45,
  solarFlux = 420,
  temp = 22.8,
  humidity = 66,
  rain1 = 0,
  rain2 = 0,
  viewMode = "standard",
  showAnnotations = true,
  onSelectSensor,
}: SolarStationRigProps) {
  const anemometerRef = useRef<THREE.Group>(null);
  const vaneRef = useRef<THREE.Group>(null);
  const isExploded = viewMode === "exploded";
  const explodedOffset = isExploded ? 0.42 : 0.0;
  const isWireframe = viewMode === "wireframe";
  const isThermal = viewMode === "thermal";

  // Dynamic colors (SunVault / 24SOLAR daylight palette)
  const solarFrameColor = isThermal ? "#ef4444" : "#facc15"; // Vibrant architectural yellow (24SOLAR)
  const mastColor = isThermal ? "#3b82f6" : "#475569";
  const panelColor = isThermal ? "#1e1b4b" : "#0f172a";

  // Anemometer spin based on live wind speed
  const rotSpeed = Math.max(0.6, windSpeed * 1.6);
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

  // Photovoltaic cell busbars
  const gridLines = useMemo(() => {
    const lines: [number, number, number][] = [];
    for (let i = -0.38; i <= 0.38; i += 0.12) {
      lines.push([i, 0.01, 0]);
    }
    return lines;
  }, []);

  return (
    <group position={[0, -0.15, 0]}>
      {/* ─── Ground Architectural Pedestal (Clean Concrete Plinth) ─── */}
      <group position={[0, -1.15, 0]}>
        {/* Main light concrete plinth */}
        <mesh receiveShadow position={[0, 0, 0]}>
          <boxGeometry args={[2.8, 0.1, 2.0]} />
          <meshStandardMaterial
            color="#e2e8f0"
            roughness={0.7}
            metalness={0.1}
            wireframe={isWireframe}
          />
        </mesh>

        {/* Clean architectural border line */}
        <mesh position={[0, 0.052, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.74, 1.94]} />
          <meshBasicMaterial color="#94a3b8" wireframe />
        </mesh>

        {/* Center alignment circle */}
        <mesh position={[0, 0.051, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.35, 0.72, 36]} />
          <meshBasicMaterial color="#cbd5e1" side={THREE.DoubleSide} />
        </mesh>

        {/* Corner anchor blocks */}
        {[-0.95, 0.95].map((x, xi) =>
          [-0.65, 0.65].map((z, zi) => (
            <mesh key={`${xi}-${zi}`} position={[x, 0.065, z]}>
              <boxGeometry args={[0.15, 0.08, 0.15]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.3} />
            </mesh>
          ))
        )}
      </group>

      {/* ─── 24SOLAR Architectural Pavilion Wing (Vibrant Yellow Frame) ─── */}
      <group position={[0.7, -0.45, -0.1]}>
        {/* Support Steel Frame */}
        <mesh position={[0, 0.25, 0]} rotation={[0, 0, -Math.PI / 6]}>
          <boxGeometry args={[0.045, 0.88, 0.045]} />
          <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} wireframe={isWireframe} />
        </mesh>
        <mesh position={[-0.34, 0.1, 0.22]}>
          <boxGeometry args={[0.035, 0.44, 0.035]} />
          <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
        </mesh>

        {/* Main Angled Solar Array Frame */}
        <group position={[0.1, 0.45, 0]} rotation={[-0.2, 0.35, -0.35]}>
          {/* Base Solid Yellow Pavilion Trim (24SOLAR signature) */}
          <mesh position={[0, 0, 0]} castShadow>
            <boxGeometry args={[1.02, 0.055, 1.3]} />
            <meshStandardMaterial
              color={solarFrameColor}
              metalness={0.4}
              roughness={0.3}
              wireframe={isWireframe}
            />
          </mesh>

          {/* Photovoltaic Cells Surface */}
          <mesh position={[0, 0.03, 0]}>
            <boxGeometry args={[0.94, 0.005, 1.2]} />
            <meshStandardMaterial
              color={panelColor}
              metalness={0.92}
              roughness={0.12}
              wireframe={isWireframe}
            />
          </mesh>

          {/* Solar cell busbars */}
          {gridLines.map((pos, idx) => (
            <mesh key={idx} position={[pos[0], 0.034, 0]}>
              <boxGeometry args={[0.004, 0.002, 1.18]} />
              <meshBasicMaterial color="#94a3b8" />
            </mesh>
          ))}

          {/* Exploded / Hovering Glass Layer (24SOLAR inspired) */}
          <group position={[0, 0.08 + explodedOffset, 0]}>
            <mesh>
              <boxGeometry args={[0.96, 0.01, 1.24]} />
              <meshPhysicalMaterial
                color="#f8fafc"
                transmission={0.94}
                opacity={0.88}
                transparent
                roughness={0.05}
                ior={1.5}
                reflectivity={0.9}
                wireframe={isWireframe}
              />
            </mesh>

            {/* Brass Standoff Pins */}
            {[
              [-0.45, -0.58],
              [0.45, -0.58],
              [-0.45, 0.58],
              [0.45, 0.58],
            ].map(([cx, cz], ci) => (
              <mesh key={ci} position={[cx, -0.04 - explodedOffset / 2, cz]}>
                <cylinderGeometry args={[0.01, 0.01, 0.08 + explodedOffset, 12]} />
                <meshStandardMaterial color="#eab308" metalness={0.9} roughness={0.2} />
              </mesh>
            ))}

            {/* Apple Frosted Glass Annotation Pin */}
            {showAnnotations && (
              <Html position={[0.2, 0.18, -0.4]} center distanceFactor={5.2}>
                <div
                  onClick={() => onSelectSensor?.("si1145_visible")}
                  className="cursor-pointer select-none px-2.5 py-1 text-[11px] font-bold tracking-wider transition-transform hover:scale-105"
                  style={{
                    background: "rgba(255, 255, 255, 0.88)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: "1px solid rgba(0, 0, 0, 0.12)",
                    borderRadius: 6,
                    color: "#1d1d1f",
                    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.08)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ color: "#b25e02", fontWeight: 800 }}>SOLAR FLUX:</span> {solarFlux.toFixed(0)} W/m²
                  {isExploded && (
                    <span style={{ marginLeft: 6, color: "#86868b", fontSize: 9 }}>[OPTICAL FLUX]</span>
                  )}
                </div>
              </Html>
            )}
          </group>
        </group>
      </group>

      {/* ─── Central Titanium Meteorological Mast ─── */}
      <group position={[-0.38, 0, 0]}>
        {/* Mast Main Pole */}
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.048, 0.068, 2.35, 16]} />
          <meshStandardMaterial
            color={mastColor}
            metalness={0.88}
            roughness={0.25}
            wireframe={isWireframe}
          />
        </mesh>

        {/* Mast Base Flange */}
        <mesh position={[0, -1.02, 0]}>
          <cylinderGeometry args={[0.19, 0.25, 0.08, 12]} />
          <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
        </mesh>

        {/* Weatherproof IP68 Enclosure */}
        <group position={[0.08, -0.4, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.19, 0.29, 0.15]} />
            <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Status LEDs */}
          <mesh position={[0.096, 0.08, 0.03]}>
            <sphereGeometry args={[0.012, 12, 12]} />
            <meshBasicMaterial color="#16a34a" />
          </mesh>
          <mesh position={[0.096, 0.04, 0.03]}>
            <sphereGeometry args={[0.012, 12, 12]} />
            <meshBasicMaterial color={rain1 > 0 ? "#0284c7" : "#eab308"} />
          </mesh>
        </group>

        {/* ─── Top Anemometer with Spinning 3 Cups ─── */}
        <group position={[0, 1.28 + (isExploded ? 0.2 : 0), 0]}>
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.12, 12]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.1} />
          </mesh>

          {/* Rotating 3-Cup Head */}
          <group ref={anemometerRef} position={[0, 0.06, 0]}>
            <mesh>
              <cylinderGeometry args={[0.035, 0.035, 0.04, 16]} />
              <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
            </mesh>
            {[0, 120, 240].map((deg, i) => {
              const rad = (deg * Math.PI) / 180;
              const armLen = 0.25;
              const x = Math.cos(rad) * armLen;
              const z = Math.sin(rad) * armLen;
              return (
                <group key={i}>
                  <mesh position={[x / 2, 0, z / 2]} rotation={[0, -rad, 0]}>
                    <boxGeometry args={[armLen, 0.012, 0.012]} />
                    <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
                  </mesh>
                  {/* Hemispherical Cup */}
                  <mesh position={[x, 0, z]} rotation={[0, -rad + Math.PI / 2, Math.PI / 2]}>
                    <sphereGeometry args={[0.05, 16, 16, 0, Math.PI]} />
                    <meshStandardMaterial
                      color={i === 0 ? "#eab308" : "#ffffff"}
                      metalness={0.5}
                      roughness={0.3}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                </group>
              );
            })}
          </group>

          {/* Wind Speed Pin */}
          {showAnnotations && (
            <Html position={[0, 0.32, 0]} center distanceFactor={5.2}>
              <div
                onClick={() => onSelectSensor?.("wind_speed_ms")}
                className="cursor-pointer select-none px-2.5 py-1 text-[11px] font-bold tracking-wider transition-transform hover:scale-105"
                style={{
                  background: "rgba(255, 255, 255, 0.88)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  borderRadius: 6,
                  color: "#1d1d1f",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: "#475569", fontWeight: 800 }}>WIND:</span> {windSpeed.toFixed(1)} m/s
              </div>
            </Html>
          )}
        </group>

        {/* ─── Wind Vane ─── */}
        <group position={[0, 0.98, 0]}>
          <group ref={vaneRef}>
            <mesh>
              <cylinderGeometry args={[0.026, 0.026, 0.06, 16]} />
              <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[-0.16, 0, 0]}>
              <boxGeometry args={[0.28, 0.01, 0.01]} />
              <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[-0.3, 0.04, 0]}>
              <boxGeometry args={[0.1, 0.13, 0.005]} />
              <meshStandardMaterial color="#0284c7" metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[0.17, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <coneGeometry args={[0.042, 0.13, 16]} />
              <meshStandardMaterial color="#eab308" metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        </group>

        {/* ─── Dual Rain Gauges ─── */}
        <group position={[-0.34, 0.25 - (isExploded ? 0.25 : 0), 0]}>
          <mesh position={[0.17, 0, 0]}>
            <boxGeometry args={[0.34, 0.02, 0.02]} />
            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Gauge 1 */}
          <group position={[-0.05, 0.08, -0.09]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.075, 0.075, 0.19, 24]} />
              <meshStandardMaterial color="#0284c7" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.08 + (isExploded ? 0.12 : 0), 0]}>
              <coneGeometry args={[0.072, 0.08, 24]} />
              <meshStandardMaterial color="#0369a1" metalness={0.8} roughness={0.2} />
            </mesh>
          </group>

          {/* Gauge 2 */}
          <group position={[-0.05, 0.08, 0.09]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.075, 0.075, 0.19, 24]} />
              <meshStandardMaterial color="#0369a1" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.08 + (isExploded ? 0.12 : 0), 0]}>
              <coneGeometry args={[0.072, 0.08, 24]} />
              <meshStandardMaterial color="#075985" metalness={0.8} roughness={0.2} />
            </mesh>
          </group>

          {showAnnotations && (
            <Html position={[-0.05, 0.28, 0]} center distanceFactor={5.2}>
              <div
                onClick={() => onSelectSensor?.("rain_gauge_1_mm")}
                className="cursor-pointer select-none px-2.5 py-1 text-[11px] font-bold tracking-wider transition-transform hover:scale-105"
                style={{
                  background: "rgba(255, 255, 255, 0.88)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  borderRadius: 6,
                  color: "#1d1d1f",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.08)",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: "#0071e3", fontWeight: 800 }}>DUAL GAUGES:</span> {rain1.toFixed(1)} / {rain2.toFixed(1)} mm
              </div>
            </Html>
          )}
        </group>

        {/* ─── SHT Louvered Radiation Shield ─── */}
        <group position={[0.28, 0.15, 0]}>
          <mesh position={[-0.14, 0, 0]}>
            <boxGeometry args={[0.28, 0.02, 0.02]} />
            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
          </mesh>

          {[0, 0.038, 0.076, 0.114, 0.152, 0.19].map((y, i) => (
            <mesh key={i} position={[0, y + (isExploded ? i * 0.06 : 0), 0]}>
              <coneGeometry args={[0.115, 0.026, 24]} />
              <meshStandardMaterial
                color="#ffffff"
                roughness={0.25}
                wireframe={isWireframe}
              />
            </mesh>
          ))}

          <mesh position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.016, 0.016, 0.13, 12]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.1} />
          </mesh>

          {showAnnotations && (
            <Html position={[0, 0.28, 0]} center distanceFactor={5.2}>
              <div
                onClick={() => onSelectSensor?.("temp_sht_c")}
                className="cursor-pointer select-none px-2.5 py-1 text-[11px] font-bold tracking-wider transition-transform hover:scale-105"
                style={{
                  background: "rgba(255, 255, 255, 0.88)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  borderRadius: 6,
                  color: "#1d1d1f",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.08)",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: "#248a3d", fontWeight: 800 }}>SHT31:</span> {temp.toFixed(1)}°C | {humidity.toFixed(0)}%
              </div>
            </Html>
          )}
        </group>
      </group>
    </group>
  );
}

export function SolarStationRig(props: SolarStationRigProps) {
  const [controlsHovered, setControlsHovered] = useState(false);
  const isRaining = (props.rain1 ?? 0) > 0 || props.viewMode === "exploded";

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [2.8, 1.6, 2.8], fov: 42 }}
        gl={{ antialias: true, alpha: true, toneMappingExposure: 1.0 }}
        shadows
      >
        {/* Bright Natural Daylight Lighting */}
        <ambientLight intensity={1.1} />
        <directionalLight
          position={[6, 10, 5]}
          intensity={1.7}
          color="#ffffff"
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-5, 4, -4]} intensity={0.6} color="#e0f2fe" />

        <Suspense fallback={null}>
          <Float
            speed={1.0}
            rotationIntensity={controlsHovered ? 0 : 0.04}
            floatIntensity={controlsHovered ? 0 : 0.05}
          >
            <RigModel {...props} />
            {isRaining && <RainEffect count={120} />}
          </Float>

          <OrbitControls
            enableZoom={true}
            minDistance={1.8}
            maxDistance={5.5}
            enablePan={false}
            autoRotate={!controlsHovered}
            autoRotateSpeed={0.8}
            maxPolarAngle={Math.PI / 2 + 0.02}
            minPolarAngle={Math.PI / 8}
            onStart={() => setControlsHovered(true)}
            onEnd={() => setControlsHovered(false)}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
