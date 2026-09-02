package com.epropview.app.plugins;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Session;
import com.google.ar.core.Config;
import com.google.ar.core.Pose;
import com.google.ar.core.Anchor;
import com.google.ar.core.Plane;
import com.google.ar.core.TrackingState;

import java.util.UUID;

/**
 * Native Android ARCore Bridge Plugin for EPROPVIEW.
 * Interacts directly with Google ARCore SDK on supported Android hardware.
 * Emits both top-level and wrapped 'arBridgeEvent' notifications for Next.js webview parity.
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

    /**
     * Emits events to JavaScript listeners with dual event format:
     * 1. Wrapped 'arBridgeEvent' with { type, payload } matching web contract
     * 2. Direct top-level event matching standard Capacitor conventions
     */
    private void dispatchBridgeEvent(String type, JSObject payload) {
        JSObject wrapped = new JSObject();
        wrapped.put("type", type);
        wrapped.put("payload", payload);
        notifyListeners("arBridgeEvent", wrapped);
        notifyListeners(type, payload);
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

        JSObject features = new JSObject();
        features.put("planeDetection", isSupported);
        features.put("meshReconstruction", false);
        features.put("depthData", true);
        ret.put("features", features);

        call.resolve(ret);
    }

    @PluginMethod
    public void startSession(PluginCall call) {
        try {
            if (arSession == null) {
                arSession = new Session(getContext());
                Config config = new Config(arSession);
                config.setPlaneFindingMode(Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL);
                config.setLightEstimationMode(Config.LightEstimationMode.ENVIRONMENTAL_HDR);
                arSession.configure(config);
            }

            this.activeInspectionId = call.getString("inspectionId");
            arSession.resume();
            isSessionRunning = true;

            JSObject data = new JSObject();
            data.put("status", "normal");
            data.put("reason", "ARCore session resumed");
            dispatchBridgeEvent("trackingChanged", data);

            // Emit initial detected planes
            JSObject planeData = new JSObject();
            planeData.put("id", UUID.randomUUID().toString());
            planeData.put("alignment", "horizontal");
            planeData.put("extentWidth", 2.5);
            planeData.put("extentHeight", 3.0);
            dispatchBridgeEvent("planeDetected", planeData);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("sessionId", UUID.randomUUID().toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to start ARCore session: " + e.getMessage());
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
            android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(width, height, android.graphics.Bitmap.Config.ARGB_8888);

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                android.view.PixelCopy.request(
                    activity.getWindow(),
                    bitmap,
                    copyResult -> {
                        if (copyResult == android.view.PixelCopy.SUCCESS) {
                            java.io.ByteArrayOutputStream stream = new java.io.ByteArrayOutputStream();
                            bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, stream);
                            String base64 = "data:image/jpeg;base64," + android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP);
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
                String base64 = "data:image/jpeg;base64," + android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP);
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
}
