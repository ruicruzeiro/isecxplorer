// useCompassBearing.js
import { useEffect, useRef } from "react";
import { computeBearing, shortestAngle } from "../utils";

export function useCompassBearing({
  target,
  lastGeo,
  deviceHeading,
  arrowRef,
}) {
  const displayAngleRef = useRef(null);
  const targetAngleRef = useRef(null);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);

  // Smoothing: tempo em ms para percorrer ~63% da distância (constante de tempo)
  // Valores menores = mais rápido. Experimenta entre 80–150.
  const TIME_CONSTANT_MS = 100;
  const SNAP_THRESHOLD_DEG = 0.5;

  useEffect(() => {
    if (!target || !lastGeo) return;

    const bearing = computeBearing(
      lastGeo.latitude,
      lastGeo.longitude,
      target.lat,
      target.lon,
    );

    const hasGpsHeading =
      lastGeo.heading !== null &&
      lastGeo.heading !== undefined &&
      !Number.isNaN(lastGeo.heading) &&
      lastGeo.speed !== null &&
      lastGeo.speed > 0.8;

    const effectiveHeading = hasGpsHeading ? lastGeo.heading : deviceHeading;
    targetAngleRef.current = bearing - effectiveHeading;
  }, [target, lastGeo, deviceHeading]);

  useEffect(() => {
    const tick = (timestamp) => {
      if (targetAngleRef.current !== null && arrowRef.current) {
        // Calcular deltaTime real para suavização frame-rate independent
        const dt = lastTimeRef.current ? timestamp - lastTimeRef.current : 16;
        lastTimeRef.current = timestamp;

        if (displayAngleRef.current === null) {
          displayAngleRef.current = targetAngleRef.current;
        } else {
          const current = ((displayAngleRef.current % 360) + 360) % 360;
          const targetNorm = ((targetAngleRef.current % 360) + 360) % 360;
          const delta = shortestAngle(current, targetNorm);

          if (Math.abs(delta) < SNAP_THRESHOLD_DEG) {
            // Snap direto quando já está perto — elimina micro-tremido
            displayAngleRef.current = targetAngleRef.current;
          } else {
            // Exponential decay: alpha = 1 - e^(-dt / τ)
            // τ = TIME_CONSTANT_MS → responsivo mas suave
            const alpha = 1 - Math.exp(-dt / TIME_CONSTANT_MS);
            displayAngleRef.current += delta * alpha;
          }
        }

        arrowRef.current.style.transform = `rotate(${displayAngleRef.current}deg)`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = null;
    };
  }, [arrowRef]);
}
