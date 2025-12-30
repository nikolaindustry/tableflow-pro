import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tableflowpro.app',
  appName: 'Supreme Pos',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
