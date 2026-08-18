/**
 * ClassPulse AI — Universal Production Endpoint Resolver
 * Dynamically derives API and WebSocket URLs across Local Dev, Vercel, and Railway.
 */

export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    const isLocal =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname.startsWith("192.168.");
    if (isLocal) {
      return "http://127.0.0.1:8000";
    }
  }
  return "http://127.0.0.1:8000";
}

export function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL.replace(/\/+$/, "");
  }
  // Auto-derive secure WSS from HTTPS API_URL
  const apiUrl = getApiUrl();
  if (apiUrl.startsWith("https://")) {
    return apiUrl.replace(/^https:\/\//, "wss://");
  }
  if (apiUrl.startsWith("http://")) {
    return apiUrl.replace(/^http:\/\//, "ws://");
  }
  return "ws://127.0.0.1:8000";
}

export const API_URL = getApiUrl();
export const WS_URL  = getWsUrl();
