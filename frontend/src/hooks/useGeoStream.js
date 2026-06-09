import { useEffect, useRef, useState } from "react";

const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

function shortestAngle(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function getScreenAngle() {
  if (screen.orientation?.angle !== undefined) return screen.orientation.angle;
  return window.orientation ?? 0;
}

export function useGeoStream() {
  const [msg, setMsg] = useState("A ligar WebSocket...");
  const [wsConnected, setWsConnected] = useState(false);
  const [lastGeo, setLastGeo] = useState(null);
  const [lastMessage, setLastMessage] = useState(null);
  const [target, setTarget] = useState(null);
  const [deviceHeading, setDeviceHeading] = useState(0);

  const wsRef = useRef(null);
  const watchIdRef = useRef(null);
  const imuCleanupRef = useRef(null);
  const latestImuRef = useRef(null);
  const latestGeoRef = useRef(null);
  const sendTimerRef = useRef(null);
  const smoothedHeadingRef = useRef(null);
  const SMOOTHING = 0.15;

  const pedirPermissaoIMU = async () => {
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      const response = await DeviceMotionEvent.requestPermission();
      if (response !== "granted") return false;
    }

    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response !== "granted") return false;
    }

    return true;
  };

  const connectToWebSocket = () => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setWsConnected(true);
      setMsg("WebSocket ligado");
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.target_coords) {
          setTarget({
            name: parsed.target,
            lat: parsed.target_coords.lat,
            lon: parsed.target_coords.lon,
            distance_m: parsed.target_distance,
          });
        }
        setLastMessage(parsed);
      } catch (err) {
        console.error("Erro a ler mensagem WS:", err);
      }
    };

    ws.onerror = () => {
      setWsConnected(false);
      setMsg("Erro no WebSocket");
    };

    ws.onclose = () => {
      setWsConnected(false);
      setMsg("WebSocket desligado");
    };

    wsRef.current = ws;
  };

  const iniciarIMU = async () => {
    const permitida = await pedirPermissaoIMU();
    if (!permitida) throw new Error("Permissão de IMU negada.");

    const motionHandler = (event) => {
      latestImuRef.current = {
        acceleration: event.acceleration
          ? {
              x: event.acceleration.x,
              y: event.acceleration.y,
              z: event.acceleration.z,
            }
          : null,
        accelerationIncludingGravity: event.accelerationIncludingGravity
          ? {
              x: event.accelerationIncludingGravity.x,
              y: event.accelerationIncludingGravity.y,
              z: event.accelerationIncludingGravity.z,
            }
          : null,
        rotationRate: event.rotationRate
          ? {
              alpha: event.rotationRate.alpha,
              beta: event.rotationRate.beta,
              gamma: event.rotationRate.gamma,
            }
          : null,
        interval: event.interval ?? null,
      };
    };

    const applyHeading = (rawHeading) => {
      if (smoothedHeadingRef.current === null) {
        smoothedHeadingRef.current = rawHeading;
      } else {
        const delta = shortestAngle(smoothedHeadingRef.current, rawHeading);
        smoothedHeadingRef.current =
          (smoothedHeadingRef.current + SMOOTHING * delta + 360) % 360;
      }
      setDeviceHeading(smoothedHeadingRef.current);
    };

    let usingAbsolute = false;

    const absoluteHandler = (event) => {
      if (event.alpha === null) return;
      usingAbsolute = true;
      const screenAngle = getScreenAngle();
      applyHeading((360 - event.alpha + screenAngle) % 360);
    };

    const relativeHandler = (event) => {
      // iOS — usa webkitCompassHeading directamente
      if (event.webkitCompassHeading !== undefined) {
        applyHeading(event.webkitCompassHeading);
        return;
      }
      // Android fallback — só usa se não há absolute a funcionar
      if (!usingAbsolute && event.alpha !== null) {
        const screenAngle = getScreenAngle();
        applyHeading((360 - event.alpha + screenAngle) % 360);
      }
    };

    window.addEventListener("deviceorientationabsolute", absoluteHandler, true);
    window.addEventListener("deviceorientation", relativeHandler, true);
    window.addEventListener("devicemotion", motionHandler);

    // Verifica após 1s se o absolute está a funcionar no Android
    // Se não, força o uso do relative
    setTimeout(() => {
      if (!usingAbsolute) {
        console.log(
          "[IMU] deviceorientationabsolute não disponível, a usar relative",
        );
      }
    }, 1000);

    imuCleanupRef.current = () => {
      window.removeEventListener(
        "deviceorientationabsolute",
        absoluteHandler,
        true,
      );
      window.removeEventListener("deviceorientation", relativeHandler, true);
      window.removeEventListener("devicemotion", motionHandler);
    };
  };

  const iniciarStream = async (playerAlias) => {
    if (!navigator.geolocation) {
      setMsg("Geolocalização não suportada.");
      return;
    }
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setMsg("WebSocket ainda não está ligado.");
      return;
    }

    try {
      setMsg("A iniciar stream...");
      await iniciarIMU();

      wsRef.current.send(
        JSON.stringify({
          type: "init_session",
          player_alias: playerAlias,
        }),
      );

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const geo = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
          };
          latestGeoRef.current = geo;
          setLastGeo(geo);
        },
        (err) => setMsg(`Erro de geolocalização: ${err.message}`),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 },
      );

      sendTimerRef.current = setInterval(() => {
        if (!latestGeoRef.current) return;
        const payload = {
          timestamp: Date.now(),
          player_alias: playerAlias,
          geolocation: latestGeoRef.current,
          imu: latestImuRef.current,
        };
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(payload));
        }
      }, 500);

      setMsg("Stream ativo");
    } catch (e) {
      setMsg("Erro ao iniciar stream: " + e.message);
    }
  };

  const pararStream = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (imuCleanupRef.current) {
      imuCleanupRef.current();
      imuCleanupRef.current = null;
    }
    if (sendTimerRef.current !== null) {
      clearInterval(sendTimerRef.current);
      sendTimerRef.current = null;
    }
    setMsg(wsConnected ? "Stream parado" : "WebSocket desligado");
  };

  useEffect(() => {
    connectToWebSocket();
    return () => {
      pararStream();
      wsRef.current?.close();
    };
  }, []);

  return {
    msg,
    wsConnected,
    target,
    lastGeo,
    lastMessage,
    deviceHeading,
    iniciarStream,
    pararStream,
    wsRef,
  };
}
