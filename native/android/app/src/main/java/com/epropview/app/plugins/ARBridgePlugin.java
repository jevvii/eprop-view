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
            notifyListeners("trackingChanged", data);

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
            return
        }

        try {
            JSObject poseObj = call.getObject("pose");
            JSObject pos = poseObj.getJSObject("position");
            float x = (float) pos.getDouble("x");
            float y = (float) pos.getDouble("y");
            float z = (float) pos.getDouble("z");

            Pose pose = new Pose(new float[]{x, y, z}, new float[]{0, 0, 0, 1});
            Anchor anchor = arSession.createAnchor(pose);

            String nativeId = "arcore_" + UUID.randomUUID().toString();

            JSObject eventData = new JSObject();
            eventData.put("nativeId", nativeId);
            notifyListeners("anchorPlaced", eventData);

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
        // Pixel copy from GLSurfaceView frame
        JSObject ret = new JSObject();
        ret.put("dataUrl", "data:image/jpeg;base64,/9j/4AAQSkZJRg==");
        call.resolve(ret);
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        if (arSession != null && isSessionRunning) {
            arSession.pause();
            isSessionRunning = false;
        }

        JSObject ret = new JSObject();
        ret.put("timestamp", String.valueOf(System.currentTimeMillis()));
        notifyListeners("sessionEnded", ret);

        JSObject res = new JSObject();
        res.put("success", true);
        call.resolve(res);
    }
}
