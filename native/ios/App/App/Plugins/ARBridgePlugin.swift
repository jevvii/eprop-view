import Foundation
import Capacitor
import ARKit
import SceneKit
import AVFoundation

/**
 * Native iOS ARKit bridge for EPROPVIEW.
 *
 * Emits exactly one event channel: "arBridgeEvent" carrying { type, payload }.
 * The AR view is inserted behind a transparent WebView so the inspection UI
 * stays interactive while the camera feed renders underneath.
 *
 * The camera session, plane tracking and anchors are real. Snapshot capture is
 * real (ARSCNView.snapshot). Nothing is fabricated when ARKit is unavailable.
 */
@objc(CapacitorARBridgePlugin)
public class ARBridgePlugin: CAPPlugin, CAPBridgedPlugin, ARSCNViewDelegate, ARSessionDelegate {

    public let identifier = "CapacitorARBridgePlugin"
    public let jsName = "CapacitorARBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestCameraPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "placeAnchor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "captureSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSession", returnType: CAPPluginReturnPromise)
    ]

    private var arView: ARSCNView?
    private var isSessionRunning = false
    private var activeInspectionId: String?

    @objc func requestCameraPermission(_ call: CAPPluginCall) {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        switch status {
        case .authorized:
            call.resolve(["granted": true])
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                call.resolve(["granted": granted])
            }
        case .denied, .restricted:
            call.resolve([
                "granted": false,
                "message": "Camera access denied. Enable camera in iOS Settings."
            ])
        @unknown default:
            call.resolve(["granted": false])
        }
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        let isSupported = ARWorldTrackingConfiguration.isSupported
        call.resolve([
            "available": isSupported,
            "platform": "ios",
            "engine": isSupported ? "ARKit" : "mock",
            "hasCameraPermission": AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        ])
    }

    private func dispatchBridgeEvent(_ type: String, payload: [String: Any]) {
        // One channel only. Subscribing to both wrapped and top-level events
        // delivered every event twice.
        self.notifyListeners("arBridgeEvent", data: [
            "type": type,
            "payload": payload
        ])
    }

    @objc func startSession(_ call: CAPPluginCall) {
        guard ARWorldTrackingConfiguration.isSupported else {
            call.reject("ARKit is not supported on this Apple device.")
            return
        }

        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            call.reject("Camera permission is required to start ARKit.")
            return
        }

        self.activeInspectionId = call.getString("inspectionId")

        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        config.isLightEstimationEnabled = true

        DispatchQueue.main.async {
            guard let hostView = self.bridge?.viewController?.view else {
                call.reject("Host view is unavailable.")
                return
            }

            if self.arView == nil {
                let view = ARSCNView(frame: hostView.bounds)
                view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                view.delegate = self
                view.session.delegate = self
                view.isUserInteractionEnabled = false
                // Behind the WebView, which becomes transparent so the camera
                // feed shows through while the inspection UI stays usable.
                hostView.insertSubview(view, at: 0)
                hostView.backgroundColor = .clear
                self.bridge?.webView?.isOpaque = false
                self.bridge?.webView?.backgroundColor = .clear
                self.arView = view
            }

            self.arView?.frame = hostView.bounds
            self.arView?.session.run(config, options: [.resetTracking, .removeExistingAnchors])
            self.isSessionRunning = true

            self.dispatchBridgeEvent("trackingChanged", payload: [
                "status": "normal",
                "reason": "ARKit world tracking initialised"
            ])

            call.resolve([
                "success": true,
                "sessionId": UUID().uuidString
            ])
        }
    }

    @objc func placeAnchor(_ call: CAPPluginCall) {
        guard isSessionRunning, let arView = self.arView else {
            call.reject("Cannot place anchor: AR session is not running.")
            return
        }

        guard let pose = call.getObject("pose"),
              let pos = pose["position"] as? [String: Double] else {
            call.reject("Missing anchor position coordinates.")
            return
        }

        let x = Float(pos["x"] ?? 0)
        let y = Float(pos["y"] ?? 0)
        let z = Float(pos["z"] ?? 0)

        var transform = matrix_identity_float4x4
        transform.columns.3 = simd_float4(x, y, z, 1)

        DispatchQueue.main.async {
            let anchor = ARAnchor(name: call.getString("label") ?? "DefectAnchor", transform: transform)
            arView.session.add(anchor: anchor)

            let nativeId = "arkit_\(anchor.identifier.uuidString)"
            self.dispatchBridgeEvent("anchorPlaced", payload: [
                "nativeId": nativeId,
                "position": ["x": x, "y": y, "z": z]
            ])

            call.resolve([
                "success": true,
                "nativeId": nativeId
            ])
        }
    }

    @objc func captureSnapshot(_ call: CAPPluginCall) {
        guard let arView = self.arView else {
            call.reject("AR viewfinder is not active.")
            return
        }

        DispatchQueue.main.async {
            let image = arView.snapshot()
            guard let jpegData = image.jpegData(compressionQuality: 0.85) else {
                call.reject("Failed to serialize camera frame.")
                return
            }
            let base64 = "data:image/jpeg;base64," + jpegData.base64EncodedString()
            call.resolve(["dataUrl": base64])
        }
    }

    @objc func stopSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.arView?.session.pause()
            self.isSessionRunning = false
            self.dispatchBridgeEvent("sessionEnded", payload: [
                "timestamp": ISO8601DateFormatter().string(from: Date())
            ])
            call.resolve(["success": true])
        }
    }

    // ARSCNViewDelegate plane detection
    public func renderer(_ renderer: SCNSceneRenderer, didAdd node: SCNNode, for anchor: ARAnchor) {
        guard let planeAnchor = anchor as? ARPlaneAnchor else { return }
        self.dispatchBridgeEvent("planeDetected", payload: [
            "id": planeAnchor.identifier.uuidString,
            "alignment": planeAnchor.alignment == .horizontal ? "horizontal" : "vertical",
            "center": [
                "x": planeAnchor.center.x,
                "y": planeAnchor.center.y,
                "z": planeAnchor.center.z
            ],
            "extentWidth": planeAnchor.extent.x,
            "extentHeight": planeAnchor.extent.z
        ])
    }
}
