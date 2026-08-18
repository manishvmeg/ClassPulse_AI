import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClassPulse AI — Real-Time Classroom Intelligence",
    short_name: "ClassPulse AI",
    description:
      "Production-grade, real-time classroom conversation intelligence and WebRTC video conferencing platform.",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#2563eb",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
    categories: ["education", "productivity", "utilities"],
    shortcuts: [
      {
        name: "Instructor Command Center",
        url: "/",
        description: "Launch teacher dashboard and live classroom",
      },
      {
        name: "Subscription Plans",
        url: "/pricing",
        description: "View pricing and upgrade classroom capabilities",
      },
    ],
  };
}
