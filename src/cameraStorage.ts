import { z } from 'zod';
import type { Vec3 } from './scene/coords';

// Orbit pose kept in localStorage so a reload resumes the same framing.
// Writes fire on interaction end, so no debounce is needed.
const KEY = 'gothicFolly.cameraView';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const cameraView = z.object({ position: vec3, target: vec3 });

export interface CameraView {
  position: Vec3;
  target: Vec3;
}

export function loadCameraView(): CameraView | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = cameraView.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    console.warn(`[sim] ignoring malformed ${KEY}: ${parsed.error.message}`);
  } catch (err) {
    console.warn(`[sim] could not read ${KEY}:`, err);
  }
  return null;
}

export function saveCameraView(view: CameraView): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(view));
  } catch (err) {
    console.warn(`[sim] ${KEY} not persisted:`, err);
  }
}

export function clearCameraView(): void {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.warn(`[sim] ${KEY} not cleared:`, err);
  }
}
