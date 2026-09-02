import Foundation
import Capacitor
import ARKit
import SceneKit

/**
 * Native iOS ARKit Bridge Plugin for EPROPVIEW.
 * Provides high-frequency camera pose tracking, horizontal and vertical plane detection,
 * persistent 3D anchor positioning, and snapshot frame capture.
 */
@objc(CapacitorARBridgePlugin)
public class ARBridgePlugin: CAPPlugin, ARSCNViewDelegate, ARSessionDelegate {

    private var arView: ARSCNView?
    private var isSessionRunning = false
    private var activeInspectionId: String?

    @objc func isAvailable(_ call: CAPPluginCall) {
        let isSupported = ARWorldTrackingConfiguration.isSupported
        call.resolve([
            "available": isSupported,
            "platform": "ios",
            "engine": isSupported ? "ARKit" : "mock",
            "features": [
                "planeDetection": isSupported,
                "meshReconstruction": ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh),
                "depthData": true
            ]
        ])
    }

    @objc func startSession(_ call: CAPPluginCall) {
        guard ARWorldTrackingConfiguration.isSupported else {
            call.reject("ARKit is not supported on this Apple device.")
            return
        }

        self.activeInspectionId = call.getString("inspectionId")
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        config.isLightEstimationEnabled = true

        DispatchQueue.main.async {
            if self.arView == nil {
                self.arView = ARSCNView(frame: self.bridge?.viewController?.view.bounds ?? .zero)
                self.arView?.delegate = self
                self.arView?.session.delegate = self
            }
            self.arView?.session.run(config, options: [.resetTracking, .removeExistingAnchors])
            self.isSessionRunning = true

            self.notifyListeners("trackingChanged", data: [
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

        let anchor = ARAnchor(name: call.getString("label") ?? "DefectAnchor", transform: transform)
        arView.session.add(anchor: anchor)

        let nativeId = "arkit_\(anchor.identifier.uuidString)"
        self.notifyListeners("anchorPlaced", data: [
            "nativeId": nativeId,
            "position": ["x": x, "y": y, "z": z]
        ])

        call.resolve([
            "success": true,
            "nativeId": nativeId
        ])
    }

    @objc func captureSnapshot(_ call: CAPPluginCall) {
        guard let arView = self.arView else {
            call.reject("AR viewfinder is not active.")
            return
        }

        DispatchQueue.main.async {
            let image = arView.snapshot()
            if let jpegData = image.jpegData(compressionQuality: 0.85) {
                let base64 = "data:image/jpeg;base64," + jpegData.base64EncodedString()
                call.resolve(["dataUrl": base64])
            } else {
                call.reject("Failed to serialize camera frame.")
            }
        }
    }

    @objc func stopSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.arView?.session.pause()
            self.isSessionRunning = false
            self.notifyListeners("sessionEnded", data: [
                "timestamp": ISO8601DateFormatter().string(from: Date())
            ])
            call.resolve(["success": true])
        }
    }

    // ARSCNViewDelegate Plane Detection
    public func renderer(_ renderer: SCNSceneRenderer, didAdd node: SCNNode, for anchor: ARAnchor) {
        if let planeAnchor = anchor as? ARPlaneAnchor {
            self.notifyListeners("planeDetected", data: [
                "id": planeAnchor.identifier.uuidString,
                "alignment": planeAnchor.alignment == .horizontal ? "horizontal" : "vertical",
                "center": [
                    "x": planeAnchor.center.x,
                    "y": planeAnchor.center.y,
                    "z": planeAnchor.center.z
                ]
            ])
        }
    }
}
