# EPROPVIEW Native AR Mobile Bridge (Phase B)

## Overview
Provides production-grade immersive Augmented Reality (AR) on iOS and Android via native ARKit and ARCore plugins interfacing with the Next.js web application.

## Directory Structure
- `capacitor.config.ts`: Capacitor project configuration.
- `plugins/capacitor-ar-bridge/`:
  - `android/ARBridgePlugin.java`: Google ARCore bridge with horizontal/vertical plane detection and 6-DOF tracking.
  - `ios/ARBridgePlugin.swift`: Apple ARKit bridge with world alignment, feature point detection, and persistent anchoring.

## Build Instructions

### Prerequisites
- Node.js >= 20
- Xcode 15+ (for iOS)
- Android Studio Hedgehog+ (for Android)

### Android Build
```bash
npx cap add android
npx cap sync android
npx cap open android
```

### iOS Build
```bash
npx cap add ios
npx cap sync ios
npx cap open ios
```
