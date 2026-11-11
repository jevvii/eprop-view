/** Browser denials need settings recovery; a web page cannot reset a saved block. */
export function inspectionStartError(cause: unknown, mode: 'camera' | 'webxr'): string {
  if (cause instanceof Error && (cause.name === 'NotAllowedError' || cause.name === 'PermissionDeniedError')) {
    return mode === 'camera'
      ? "Camera permission was not granted. In this site's browser settings, set Camera to Allow or Ask, then try again. If no prompt appears, allow camera access for your browser in device settings."
      : "AR permission was not granted. Allow camera and AR access in this site's browser settings, then try again. Check camera access for the browser in device settings, or use camera/photo inspection."
  }
  return cause instanceof Error ? cause.message : 'Could not start inspection'
}
