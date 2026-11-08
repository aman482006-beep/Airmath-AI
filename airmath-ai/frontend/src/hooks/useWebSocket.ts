import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerMessage } from "../types/airmath";

const wsUrl = () => {
  const envUrl = import.meta.env.VITE_AIRMATH_WS_URL as string | undefined;
  if (envUrl) return envUrl;
  // In dev, Vite proxies /ws to the backend, so use a same-origin URL
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/solve`;
};

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8000;

export function useAirMathSocket(onMessage: (message: ServerMessage) => void) {
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    mountedRef.current = true;
    let attempt = 0;

    function connect() {
      // Close any lingering previous socket
      if (socketRef.current) {
        socketRef.current.onopen = null;
        socketRef.current.onclose = null;
        socketRef.current.onerror = null;
        socketRef.current.onmessage = null;
        if (socketRef.current.readyState < WebSocket.CLOSING) {
          socketRef.current.close();
        }
        socketRef.current = null;
      }

      const socket = new WebSocket(wsUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        if (!mountedRef.current) return;
        attempt = 0; // reset backoff on success
        setConnected(true);
      };

      socket.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        scheduleReconnect();
      };

      socket.onerror = () => {
        // The socket will fire onclose after onerror; reconnect is handled there.
      };

      socket.onmessage = (event) => {
        try {
          onMessageRef.current(JSON.parse(event.data) as ServerMessage);
        } catch {
          console.warn("[WS] Ignoring malformed message:", event.data);
        }
      };
    }

    function scheduleReconnect() {
      if (!mountedRef.current) return;
      if (retryRef.current) clearTimeout(retryRef.current);
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
      attempt += 1;
      retryRef.current = setTimeout(connect, delay);
    }

    // Delay connection slightly so React StrictMode's cleanup runs before
    // any WebSocket is created, preventing the "closed before established" error.
    const connectTimer = setTimeout(connect, 50);

    return () => {
      mountedRef.current = false;
      clearTimeout(connectTimer);
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.onopen = null;
        socketRef.current.onclose = null;
        socketRef.current.onerror = null;
        socketRef.current.onmessage = null;
        if (socketRef.current.readyState < WebSocket.CLOSING) {
          socketRef.current.close();
        }
        socketRef.current = null;
      }
    };
  }, []);

  const send = useCallback((payload: unknown) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  return { connected, send };
}
