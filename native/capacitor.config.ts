export interface CapacitorConfig {
  appId: string
  appName: string
  webDir: string
  bundledWebRuntime?: boolean
  server?: Record<string, unknown>
  plugins?: Record<string, unknown>
}

const config: CapacitorConfig = {
  appId: 'com.epropview.app',
  appName: 'EPROPVIEW Structural Inspection',
  webDir: 'public',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    CapacitorARBridge: {
      enablePlaneDetection: true,
      enableLightEstimation: true,
      worldAlignment: 'gravityAndHeading',
    },
  },
}

export default config
