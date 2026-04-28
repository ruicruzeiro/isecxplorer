import { useEffect, useRef, useState } from "react";

const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

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
    if (!permitida) {
      throw new Error("Permissão de IMU negada.");
    }

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

    const orientationHandler = (event) => {
      let heading = null;

      if (event.webkitCompassHeading !== undefined) {
        heading = event.webkitCompassHeading;
      } else if (event.alpha !== null) {
        heading = 360 - event.alpha;
      }

      if (heading !== null) {
        setDeviceHeading(heading);
      }
    };

    window.addEventListener("deviceorientation", orientationHandler, true);
    window.addEventListener("devicemotion", motionHandler);

    imuCleanupRef.current = () => {
      window.removeEventListener("devicemotion", motionHandler);
      window.removeEventListener("deviceorientation", orientationHandler, true);
    };
  };

  const iniciarStream = async () => {
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
        (err) => {
          setMsg(`Erro de geolocalização: ${err.message}`);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000,
        },
      );

      sendTimerRef.current = setInterval(() => {
        if (!latestGeoRef.current) return;

        const payload = {
          timestamp: Date.now(),
          geolocation: latestGeoRef.current,
          imu: latestImuRef.current,
        };

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(payload));
        }
      }, 1000);

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
      if (wsRef.current) {
        wsRef.current.close();
      }
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
