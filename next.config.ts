import type { NextConfig } from "next";
import path from "path";

// @tailwindcss/node uses process.env.NODE_PATH to build its enhanced-resolve
// modules list. When opts.from is empty (a Turbopack behaviour), the CSS
// resolution context falls to the parent directory of cwd which has no
// node_modules. Adding the project's own node_modules here ensures tailwindcss
// is always findable regardless of the resolution context.
process.env.NODE_PATH = [
  path.join(__dirname, "node_modules"),
  ...(process.env.NODE_PATH ? [process.env.NODE_PATH] : []),
].join(path.delimiter);

const nextConfig: NextConfig = {
  reactStrictMode: false, // Disabled to better mimic production behavior in development
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
