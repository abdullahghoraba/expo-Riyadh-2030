import { defineConfig } from 'vitest/config';

// @arcgis/core and Calcite import .css files from JavaScript; Node cannot load those natively,
// so these packages are processed by Vite (which stubs the CSS) instead of being externalized.
export default defineConfig({
  test: {
    server: {
      deps: {
        inline: [/@arcgis[\\/]core/, /@esri[\\/]calcite-components/]
      }
    }
  }
});
