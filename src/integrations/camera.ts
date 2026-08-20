// SPDX-License-Identifier: GPL-3.0-or-later
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export interface CapturedPhoto {
  base64: string;
  mimeType: string;
}

export type CapturePhotoResult =
  | { status: 'ok'; photo: CapturedPhoto }
  | { status: 'cancelled' }
  | { status: 'permission-denied' }
  | { status: 'error'; message: string };

// Capacitor's own rejection message when the user backs out of the camera app — the one
// case that must stay silent. Anything else (permission denial, plugin failure) has to
// reach the screen, or a failed capture looks exactly like nothing happened.
const ERROR_USER_CANCELLED = 'User cancelled photos app';

// getPhoto() is deprecated in favor of takePhoto()+Filesystem, but it's the only API that
// does resize (width) + quality + base64 output in one call — simpler and sufficient here.
// Generic capture, not plate-specific — shared by PhotoScanScreen's plate and receipt flows.
export async function captureFoodPhoto(): Promise<CapturePhotoResult> {
  try {
    const checked = await Camera.checkPermissions();
    let cameraPerm = checked.camera;
    if (cameraPerm !== 'granted' && cameraPerm !== 'limited') {
      const requested = await Camera.requestPermissions({ permissions: ['camera'] });
      cameraPerm = requested.camera;
    }
    if (cameraPerm !== 'granted' && cameraPerm !== 'limited') {
      return { status: 'permission-denied' };
    }

    const photo = await Camera.getPhoto({
      quality: 70,
      width: 1024,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      correctOrientation: true,
    });
    if (!photo.base64String) return { status: 'error', message: 'Photo vide.' };
    return { status: 'ok', photo: { base64: photo.base64String, mimeType: `image/${photo.format || 'jpeg'}` } };
  } catch (e) {
    const message = (e as Error)?.message ?? '';
    if (message === ERROR_USER_CANCELLED) return { status: 'cancelled' };
    return { status: 'error', message: message || 'Erreur inconnue de l’appareil photo.' };
  }
}
