// SPDX-License-Identifier: GPL-3.0-or-later
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export interface CapturedPhoto {
  base64: string;
  mimeType: string;
}

// getPhoto() is deprecated in favor of takePhoto()+Filesystem, but it's the only API that
// does resize (width) + quality + base64 output in one call — simpler and sufficient here.
export async function capturePlatePhoto(): Promise<CapturedPhoto | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 70,
      width: 1024,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      correctOrientation: true,
    });
    if (!photo.base64String) return null;
    return { base64: photo.base64String, mimeType: `image/${photo.format || 'jpeg'}` };
  } catch {
    // user cancelled the camera, or permission denied — not an error to surface
    return null;
  }
}
