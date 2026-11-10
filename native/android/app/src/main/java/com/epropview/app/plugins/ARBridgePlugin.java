package com.epropview.app.plugins;

import android.Manifest;
import android.os.Handler;
import android.os.HandlerThread;
import android.view.Surface;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.google.ar.core.Anchor;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Camera;
import com.google.ar.core.Config;
import com.google.ar.core.Frame;
import com.google.ar.core.Plane;
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingState;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Native Android ARCore bridge for EPROPVIEW.
 *
 * Emits exactly one event channel: "arBridgeEvent" carrying { type, payload }.
 * It never invents planes, anchors or snapshots — if ARCore cannot track, the
 * event stream stays quiet and the call rejects.
 *
 * Camera rendering is not implemented here. This plugin provides the session,
 * tracking, plane and anchor APIs; a renderer (Sceneform/ARCore rendering) is
 * required to draw the camera feed. The WebView keeps its own camera path.
 */
@CapacitorPlugin(
    name = "CapacitorARBridge",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
    }
)
public class ARBridgePlugin extends Plugin {

    private Session arSession;
    private boolean isSessionRunning = false;
    private String activeInspectionId;
    private String activeSessionId;

    private HandlerThread trackingThread;
    private Handler trackingHandler;
    private volatile boolean trackingLoopRunning = false;
    private final Set<String> knownPlanes = new HashSet<>();
    private String lastTrackingState;

    private void dispatchBridgeEvent(String type, JSObject payload) {
        JSObject wrapped = new JSObject();
        wrapped.put("type", type);
        wrapped.put("payload", payload);
        notifyListeners("arBridgeEvent", wrapped);
    }

    @PluginMethod
    public void requestCameraPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        } else {
            requestPermissionForAlias("camera", call, "cameraPermsCallback");
        }
    }

    @PermissionCallback
    private void cameraPermsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("camera") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        ArCoreApk.Availability availability = ArCoreApk.getInstance().checkAvailability(getContext());
        boolean isSupported = availability.isSupported();

        JSObject ret = new JSObject();
        ret.put("available", isSupported);
        ret.put("platform", "android");
        ret.put("engine", isSupported ? "ARCore" : "mock");
        ret.put("hasCameraPermission", getPermissionState("camera") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void startSession(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("Camera permission is required to start ARCore.");
            return;
        }

        try {
            if (arSession == null) {
                arSession = new Session(getContext());
                Config config = new Config(arSession);
                config.setPlaneFindingMode(Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL);
                config.setLightEstimationMode(Config.LightEstimationMode.ENVIRONMENTAL_HDR);
                arSession.configure(config);
            }

            this.activeInspectionId = call.getString("inspectionId");
            this.activeSessionId = UUID.randomUUID().toString();
            arSession.resume();
            isSessionRunning = true;
            knownPlanes.clear();
            lastTrackingState = null;
            startTrackingLoop();

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("sessionId", activeSessionId);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to start ARCore session: " + e.getMessage());
        }
    }

    private void startTrackingLoop() {
        if (trackingLoopRunning) return;
        trackingLoopRunning = true;

        trackingThread = new HandlerThread("EPROPVIEW-ARCore");
        trackingThread.start();
        trackingHandler = new Handler(trackingThread.getLooper());

        trackingHandler.post(new Runnable() {
            @Override
            public void run() {
                if (!trackingLoopRunning || arSession == null) return;

                try {
                    int rotation = Surface.ROTATION_0;
                    if (getActivity() != null && getActivity().getWindowManager() != null) {
                        rotation = getActivity().getWindowManager().getDefaultDisplay().getRotation();
                    }
                    // A display geometry is required for update(); the renderer,
                    // when present, replaces these dimensions with the surface size.
                    arSession.setDisplayGeometry(rotation, 1080, 1920);
                    Frame frame = arSession.update();

                    Camera camera = frame != null ? frame.getCamera() : null;
                    if (camera != null) {
                        String state = camera.getTrackingState().name();
                        if (!state.equals(lastTrackingState)) {
                            lastTrackingState = state;
                            JSObject payload = new JSObject();
                            payload.put("status", state);
                            dispatchBridgeEvent("trackingChanged", payload);
                        }
                    }

                    for (Plane plane : arSession.getAllTrackables(Plane.class)) {
                        if (plane.getTrackingState() != TrackingState.TRACKING) continue;

                        String planeId = "arcore_plane_" + System.identityHashCode(plane);
                        if (!knownPlanes.add(planeId)) continue;

                        JSObject payload = new JSObject();
                        payload.put("id", planeId);
                        payload.put(
                            "alignment",
                            plane.getType() == Plane.Type.VERTICAL ? "vertical" : "horizontal"
                        );
                        payload.put("extentWidth", plane.getExtentX());
                        payload.put("extentHeight", plane.getExtentZ());
                        dispatchBridgeEvent("planeDetected", payload);
                    }
                } catch (Exception e) {
                    JSObject payload = new JSObject();
                    payload.put("message", "ARCore tracking update failed: " + e.getMessage());
                    dispatchBridgeEvent("error", payload);
                    trackingLoopRunning = false;
                    return;
                }

                trackingHandler.postDelayed(this, 66);
            }
        });
    }

    private void stopTrackingLoop() {
        trackingLoopRunning = false;
        if (trackingHandler != null) {
            trackingHandler.removeCallbacksAndMessages(null);
            trackingHandler = null;
        }
        if (trackingThread != null) {
            trackingThread.quitSafely();
            try {
                trackingThread.join(500);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            trackingThread = null;
        }
    }

    @PluginMethod
    public void placeAnchor(PluginCall call) {
        if (!isSessionRunning || arSession == null) {
            call.reject("AR session is not running.");
            return;
        }

        try {
            JSObject poseObj = call.getObject("pose");
            JSObject pos = poseObj != null ? poseObj.getJSObject("position") : null;
            float x = pos != null ? (float) pos.getDouble("x") : 0f;
            float y = pos != null ? (float) pos.getDouble("y") : 0f;
            float z = pos != null ? (float) pos.getDouble("z") : 0f;

            Pose pose = new Pose(new float[]{x, y, z}, new float[]{0, 0, 0, 1});
            Anchor anchor = arSession.createAnchor(pose);

            String nativeId = "arcore_" + UUID.randomUUID().toString();

            JSObject eventData = new JSObject();
            eventData.put("nativeId", nativeId);
            dispatchBridgeEvent("anchorPlaced", eventData);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("nativeId", nativeId);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to place ARCore anchor: " + e.getMessage());
        }
    }

    @PluginMethod
    public void captureSnapshot(PluginCall call) {
        try {
            android.app.Activity activity = getActivity();
            if (activity == null || activity.getWindow() == null) {
                call.reject("Android activity window is unavailable for AR snapshot.");
                return;
            }

            android.view.View decorView = activity.getWindow().getDecorView();
            int width = Math.max(1, decorView.getWidth());
            int height = Math.max(1, decorView.getHeight());
            android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(
                width,
                height,
                android.graphics.Bitmap.Config.ARGB_8888
            );

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                android.view.PixelCopy.request(
                    activity.getWindow(),
                    bitmap,
                    copyResult -> {
                        if (copyResult == android.view.PixelCopy.SUCCESS) {
                            java.io.ByteArrayOutputStream stream = new java.io.ByteArrayOutputStream();
                            bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, stream);
                            String base64 =
                                "data:image/jpeg;base64," +
                                android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP);
                            JSObject ret = new JSObject();
                            ret.put("dataUrl", base64);
                            call.resolve(ret);
                        } else {
                            call.reject("PixelCopy failed with status code: " + copyResult);
                        }
                    },
                    new android.os.Handler(android.os.Looper.getMainLooper())
                );
            } else {
                android.graphics.Canvas canvas = new android.graphics.Canvas(bitmap);
                decorView.draw(canvas);
                java.io.ByteArrayOutputStream stream = new java.io.ByteArrayOutputStream();
                bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, stream);
                String base64 =
                    "data:image/jpeg;base64," +
                    android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP);
                JSObject ret = new JSObject();
                ret.put("dataUrl", base64);
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject("Failed to capture Android viewfinder snapshot: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        stopTrackingLoop();

        if (arSession != null && isSessionRunning) {
            arSession.pause();
            isSessionRunning = false;
        }

        JSObject ret = new JSObject();
        ret.put("timestamp", String.valueOf(System.currentTimeMillis()));
        dispatchBridgeEvent("sessionEnded", ret);

        JSObject res = new JSObject();
        res.put("success", true);
        call.resolve(res);
    }

    @Override
    protected void handleOnDestroy() {
        stopTrackingLoop();
        if (arSession != null) {
            try {
                arSession.pause();
                arSession.close();
            } catch (Exception ignored) {
                // Session already released.
            }
            arSession = null;
        }
        isSessionRunning = false;
        super.handleOnDestroy();
    }
}
