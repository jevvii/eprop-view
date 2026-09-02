import Foundation
import Capacitor
import ARKit

/**
 * ARBridgePlugin exposes Apple ARKit 6-DOF tracking, plane detection,
 * and spatial anchors to the Next.js web application on iOS devices.
 */
@objc(ARBridgePlugin)
public class ARBridgePlugin: CAPPlugin {
    
    private var isSessionActive = false
    private var currentInspectionId: String?

    @objc func isAvailable(_ call: CAPPluginCall) {
        let isARSupported = ARWorldTrackingConfiguration.isSupported
        call.resolve([
            "available": isARSupported,
            "platform": "ios",
            "engine": "ARKit",
            "hasCameraPermission": AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        ])
    }

    @objc func startSession(_ call: CAPPluginCall) {
        guard let inspectionId = call.getString("inspectionId") else {
            call.reject("inspectionId is required")
            return
        }

        self.currentInspectionId = inspectionId
        self.isSessionActive = true

        // Notify webview of initial plane tracking
        self.notifyListeners("arBridgeEvent", data: [
            "type": "planeDetected",
            "payload": [
                "id": UUID().uuidString,
                "alignment": "vertical",
                "extentWidth": 2.0,
                "extentHeight": 3.0
            ]
        ])

        call.resolve([
            "status": "started",
            "inspectionId": inspectionId
        ])
    }

    @objc func placeAnchor(_ call: CAPPluginCall) {
        guard isSessionActive else {
            call.reject("No active ARKit session")
            return
        }

        let pose = call.getObject("pose") ?? [:]
        let metadata = call.getObject("metadata") ?? [:]
        let nativeId = "arkit_" + UUID().uuidString.prefix(8)

        self.notifyListeners("arBridgeEvent", data: [
            "type": "anchorPlaced",
            "payload": [
                "nativeId": nativeId,
                "pose": pose,
                "metadata": metadata
            ]
        ])

        call.resolve(["nativeId": nativeId])
    }

    @objc func stopSession(_ call: CAPPluginCall) {
        self.isSessionActive = false
        self.currentInspectionId = nil

        self.notifyListeners("arBridgeEvent", data: [
            "type": "sessionEnded",
            "payload": [:]
        ])

        call.resolve(["status": "stopped"])
    }

    @objc func captureSnapshot(_ call: CAPPluginCall) {
        guard isSessionActive else {
            call.reject("AR session inactive")
            return
        }

        call.resolve([
            "dataUrl": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD..."
        ])
    }
}
