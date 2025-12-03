import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
//import { viteSingleFile } from "vite-plugin-singlefile";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  //plugins: [react(), viteSingleFile(), nodePolyfills({ include: ["crypto"] })],
  plugins: [react(), nodePolyfills({ include: ["crypto"] })],
  /*   build: {
    rollupOptions: {
      output: {
        // Put everything into the main entry chunk
        manualChunks: () => "everything",
      },
    },
  }, */
});
