# EPROPVIEW native AR shell

Capacitor 7 container and native AR bridge for the EPROPVIEW web app.

## Status

| Item | State |
|---|---|
| Android project | Builds with Gradle (`assembleDebug` verified) |
| Android ARCore bridge | Session, permissions, tracking loop, plane events, anchors |
| Android camera renderer | **Not included.** ARCore tracks, but no camera preview is drawn; the WebView camera path remains the visible AR mode |
| iOS project sources | `Info.plist`, `AppDelegate`, plugin — complete |
| iOS Xcode project | **Not committed.** Generate it with `npx cap add ios`, then add the files from `ios/App/App` |
| iOS compilation | Unverified — this repository was prepared on Linux without Xcode |
| Web/browser AR | `getUserMedia` camera with screen-space markers; WebXR only when `isSessionSupported('immersive-ar')` is true |

The bridge never fabricates planes, anchors or snapshots. When a capability is
missing, the call rejects and the UI reports the limitation.

## Contract

JS side: `src/app/lib/ar/native-bridge.ts`, `src/types/ar-bridge.ts`.

- Plugin name: `CapacitorARBridge`
- Methods: `isAvailable`, `requestCameraPermission`, `startSession`,
  `placeAnchor`, `captureSnapshot`, `stopSession`
- Events: exactly one channel, `arBridgeEvent`, with `{ type, payload }`.
  Types: `planeDetected`, `anchorPlaced`, `anchorUpdated`, `trackingChanged`,
  `sessionEnded`, `error`.
- `isAvailable` returns `platform`, `engine`, `available`, `hasCameraPermission`.
- `startSession` / `placeAnchor` / `stopSession` return `{ success, ... }` and
  reject with a human-readable reason.

## Android build

```bash
cd native
npm install
cd android
JAVA_HOME=/usr/lib/jvm/java-21-openjdk ./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`.

Requirements: JDK 21, Android SDK platform 35, build-tools 35, network access
for the ARCore Maven artifact. `local.properties` is machine-specific and is
gitignored; create it with `sdk.dir=/path/to/Android/Sdk` if needed.

## iOS build

```bash
cd native
npm install
npx cap add ios          # generates the Xcode project
# copy ios/App/App/AppDelegate.swift, Info.plist and Plugins/ARBridgePlugin.swift
# into the generated App target, then:
npx cap sync ios
npx cap open ios
```

`Info.plist` declares `NSCameraUsageDescription` and `NSMotionUsageDescription`.
The plugin is registered by `AppBridgeViewController.capacitorDidLoad()`.

## Why there is no camera renderer yet

ARCore needs a GL surface and a camera texture; Sceneform is archived and a
hand-written renderer is a separate project. Shipping a preview-less session
would look like AR without showing the camera, so this shell stops at the
tracking/anchor API and says so. Browser AR is unaffected.
