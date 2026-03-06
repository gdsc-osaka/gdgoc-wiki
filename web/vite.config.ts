import { reactRouter } from "@react-router/dev/vite"
import { cloudflareDevProxy } from "@react-router/dev/vite/cloudflare"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [
    cloudflareDevProxy({ remoteBindings: !process.env.CI }),
    reactRouter(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    rollupOptions: {
      external: ["cloudflare:email"],
    },
  },
})
