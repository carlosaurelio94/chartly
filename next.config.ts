import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Sirve el APK con MIME correcto y como descarga (no inline) para WhatsApp / browsers
  async headers() {
    return [
      {
        source: "/chartly.apk",
        headers: [
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
          { key: "Content-Disposition", value: 'attachment; filename="chartly.apk"' },
          { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
