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

  useEffect(() => {
    if (!target || !lastGeo) return;
    const bearing = computeBearing(
      lastGeo.latitude,
      lastGeo.longitude,
      target.lat,
      target.lon,
    );
    const effectiveHeading =
      lastGeo.heading !== null &&
      lastGeo.heading !== undefined &&
      lastGeo.speed !== null &&
      lastGeo.speed > 0.5
        ? lastGeo.heading
        : deviceHeading;
    targetAngleRef.current = bearing - effectiveHeading;
  }, [target, lastGeo, deviceHeading]);

  useEffect(() => {
    const tick = () => {
      if (targetAngleRef.current !== null && arrowRef.current) {
        if (displayAngleRef.current === null) {
          displayAngleRef.current = targetAngleRef.current;
        } else {
          const raw = ((targetAngleRef.current % 360) + 360) % 360;
          const delta = shortestAngle(displayAngleRef.current % 360, raw);
          displayAngleRef.current = displayAngleRef.current + 0.25 * delta;
        }
        arrowRef.current.style.transform = `rotate(${displayAngleRef.current}deg)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [arrowRef]);
}
