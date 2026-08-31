import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Silence the "multiple lockfiles" workspace root warning
    root: path.resolve(__dirname),
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Force every client-side (Link/router) navigation to a dynamic route to
  // re-fetch from the server instead of reusing the Router Cache's last
  // snapshot — without this, revisiting a page like /products shows the data
  // that was true the first time it was visited, not what's true now.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  },
  images: {
    // Served as they are, straight from S3.
    //
    // Vercel's optimiser sits in front of every <Image> and re-encodes what it
    // fetches — but the backend already writes each upload at three sizes in
    // both JPEG and WebP, so it was paying to redo work that was done at upload
    // time. When the plan's optimisation quota ran out it began answering 402
    // instead of an image: anything newly uploaded broke immediately, and the
    // pictures that still worked were only the ones already in its cache, which
    // then failed one by one as those entries expired.
    //
    // Turning it off costs nothing we were getting — the files are already the
    // right size and format — and takes the quota out of the path entirely.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
      { protocol: "https", hostname: "*.githubusercontent.com" },
      { protocol: "http",  hostname: "**" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
