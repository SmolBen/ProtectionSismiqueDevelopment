import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.protectionsismique.ps2000',
  appName: 'PS 2000',
  webDir: 'frontend',
  server: {
    // Allow loading from the app's origin and external APIs
    allowNavigation: [
      'o2ji337dna.execute-api.us-east-1.amazonaws.com',
      'script.google.com',
      'cognito-idp.us-east-1.amazonaws.com',
    ],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false, // We'll hide it manually after app init
      backgroundColor: '#2563eb',
      showSpinner: true,
      spinnerColor: '#ffffff',
      launchShowDuration: 0,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'LIGHT', // Light text on dark background
      backgroundColor: '#2563eb',
    },
  },
  ios: {
    contentInset: 'automatic',
    scheme: 'PS2000',
    preferredContentMode: 'mobile',
  },
};

export default config;
