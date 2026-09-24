import { useEffect, useState } from "react";

export function CustomCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [trailingPos, setTrailingPos] = useState({ x: -100, y: -100 });
  const [isPointer, setIsPointer] = useState(false);
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    let mouseX = -100;
    let mouseY = -100;
    let trailX = -100;
    let trailY = -100;
    let animId: number;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      setPos({ x: mouseX, y: mouseY });

      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "BUTTON" ||
        target?.tagName === "A" ||
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.getAttribute("role") === "button" ||
        target?.closest("button") ||
        target?.closest("a") ||
        target?.classList.contains("card-hover")
      ) {
        setIsPointer(true);
      } else {
        setIsPointer(false);
      }
    };

    const onMouseDown = () => setClicked(true);
    const onMouseUp = () => setClicked(false);

    const animateTrail = () => {
      trailX += (mouseX - trailX) * 0.18;
      trailY += (mouseY - trailY) * 0.18;
      setTrailingPos({ x: trailX, y: trailY });
      animId = requestAnimationFrame(animateTrail);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    animId = requestAnimationFrame(animateTrail);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <>
      {/* Outer trailing aura */}
      <div
        className="pointer-events-none fixed z-50 rounded-full transition-transform duration-75"
        style={{
          left: trailingPos.x,
          top: trailingPos.y,
          width: isPointer ? 44 : 26,
          height: isPointer ? 44 : 26,
          transform: `translate(-50%, -50%) scale(${clicked ? 0.8 : 1})`,
          border: `1.5px solid ${isPointer ? "rgba(52, 211, 153, 0.8)" : "rgba(96, 165, 250, 0.4)"}`,
          background: isPointer ? "rgba(52, 211, 153, 0.08)" : "transparent",
          boxShadow: isPointer
            ? "0 0 16px rgba(52, 211, 153, 0.4)"
            : "0 0 10px rgba(96, 165, 250, 0.2)",
          backdropFilter: isPointer ? "blur(2px)" : "none",
        }}
      />
      {/* Inner precise dot */}
      <div
        className="pointer-events-none fixed z-50 rounded-full"
        style={{
          left: pos.x,
          top: pos.y,
          width: 5,
          height: 5,
          transform: "translate(-50%, -50%)",
          background: isPointer ? "#34d399" : "#60a5fa",
          boxShadow: isPointer
            ? "0 0 8px #34d399, 0 0 14px #34d399"
            : "0 0 6px #60a5fa",
        }}
      />
    </>
  );
}
