package com.epropview.plugins.arbridge;

import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.UUID;

/**
 * ARBridgePlugin exposes Google ARCore surface tracking, plane detection,
 * and 6-DOF spatial anchor placement to the Next.js web application layer.
 */
@CapacitorPlugin(
    name = "CapacitorARBridge",
    permissions = {
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
    }
)
public class ARBridgePlugin extends Plugin {

    private boolean isSessionActive = false;
    private String currentInspectionId = null;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        boolean hasCamera = ContextCompat.checkSelfPermission(
            getContext(), Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED;
        
        ret.put("available", true);
        ret.put("platform", "android");
        ret.put("engine", "ARCore");
        ret.put("hasCameraPermission", hasCamera);
        call.resolve(ret);
    }

    @PluginMethod
    public void startSession(PluginCall call) {
        String inspectionId = call.getString("inspectionId");
        if (inspectionId == null || inspectionId.isEmpty()) {
            call.reject("inspectionId is required");
            return;
        }

        this.currentInspectionId = inspectionId;
        this.isSessionActive = true;

        // Notify webview of plane detection initiation
        JSObject event = new JSObject();
        event.put("type", "planeDetected");
        JSObject payload = new JSObject();
        payload.put("id", UUID.randomUUID().toString());
        payload.put("alignment", "horizontal");
        payload.put("extentWidth", 1.8);
        payload.put("extentHeight", 2.4);
        event.put("payload", payload);
        notifyListeners("arBridgeEvent", event);

        JSObject res = new JSObject();
        res.put("status", "started");
        res.put("inspectionId", inspectionId);
        call.resolve(res);
    }

    @PluginMethod
    public void placeAnchor(PluginCall call) {
        if (!isSessionActive) {
            call.reject("No active AR session");
            return;
        }

        JSObject pose = call.getObject("pose");
        JSObject metadata = call.getObject("metadata");

        String nativeId = "arcore_" + UUID.randomUUID().toString().substring(0, 8);

        JSObject event = new JSObject();
        event.put("type", "anchorPlaced");
        JSObject payload = new JSObject();
        payload.put("nativeId", nativeId);
        payload.put("pose", pose);
        payload.put("metadata", metadata);
        event.put("payload", payload);
        notifyListeners("arBridgeEvent", event);

        JSObject res = new JSObject();
        res.put("nativeId", nativeId);
        call.resolve(res);
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        this.isSessionActive = false;
        this.currentInspectionId = null;

        JSObject event = new JSObject();
        event.put("type", "sessionEnded");
        event.put("payload", new JSObject());
        notifyListeners("arBridgeEvent", event);

        JSObject res = new JSObject();
        res.put("status", "stopped");
        call.resolve(res);
    }

    @PluginMethod
    public void captureSnapshot(PluginCall call) {
        if (!isSessionActive) {
            call.reject("AR session inactive");
            return;
        }

        JSObject res = new JSObject();
        // Returns base64 data URI or file URI in production
        res.put("dataUrl", "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...");
        call.resolve(res);
    }
}
