import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // load .env files and VITE_* variables
  const env = loadEnv(mode, (process as any).cwd(), "VITE_");

  // Allow configuring the proxy path (e.g. "/api") and the target (backend URL)
  // Environment variables:
  // - VITE_API_PROXY_PATH (default: "/api")
  // - VITE_API_TARGET (default: "http://localhost:3000")
  let proxyPath = env.VITE_API_PROXY_PATH || "/api";
  const apiTarget = env.VITE_API_TARGET || "http://localhost:3000";

  // Ensure proxyPath starts with a leading slash
  if (!proxyPath.startsWith("/")) {
    proxyPath = `/${proxyPath}`;
  }

  return {
    plugins: [sveltekit()],
    server: {
      port: 3002,
      proxy: {
        // dynamically set the key using the configured proxyPath
        [proxyPath]: {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
