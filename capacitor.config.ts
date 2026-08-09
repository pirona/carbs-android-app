import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.gyozamancave.carbs',
  appName: 'Carbs',
  webDir: 'dist',
  // Routes fetch() through native HTTP, bypassing the WebView's CORS enforcement —
  // needed for OpenFoodFacts/n8n calls whose CORS headers don't target a Capacitor
  // origin (capacitor://localhost). See plan §Phase 3/7.1.
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
