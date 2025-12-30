import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tableflowpro.app',
  appName: 'TableFlow Pro',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
