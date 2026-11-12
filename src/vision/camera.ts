/** Webcam access and a per-video-frame loop (every decoded frame, not just every paint). */

export interface CameraOptions { width?: number; height?: number; fps?: number }

export async function startCamera(video: HTMLVideoElement, opts: CameraOptions = {}): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera API (getUserMedia).');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: opts.width ?? 1280 },
      height: { ideal: opts.height ?? 720 },
      frameRate: { ideal: opts.fps ?? 60 },
    },
  });
  video.srcObject = stream;
  await new Promise<void>((resolve) => {
    if (video.readyState >= 2 && video.videoWidth > 0) resolve();
    else video.addEventListener('loadeddata', () => resolve(), { once: true });
  });
  await video.play();
  return stream;
}

export function stopCamera(video: HTMLVideoElement): void {
  const s = video.srcObject as MediaStream | null;
  s?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

type FrameCb = (nowMs: number, mediaTimeMs: number) => void;

/**
 * Calls cb once per presented video frame. Uses requestVideoFrameCallback where available
 * (fires for every decoded frame, typically 30 or 60 per second, with the frame's own timestamp)
 * and falls back to requestAnimationFrame. Returns a stop function.
 */
export function onEveryVideoFrame(video: HTMLVideoElement, cb: FrameCb): () => void {
  let stopped = false;
  const rvfc = (video as any).requestVideoFrameCallback?.bind(video) as
    | ((cb: (now: number, meta: { mediaTime: number }) => void) => number)
    | undefined;

  if (rvfc) {
    const loop = (now: number, meta: { mediaTime: number }) => {
      if (stopped) return;
      cb(now, meta.mediaTime * 1000);
      rvfc(loop);
    };
    rvfc(loop);
  } else {
    let lastTime = -1;
    const loop = (now: number) => {
      if (stopped) return;
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        cb(now, video.currentTime * 1000);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  return () => { stopped = true; };
}
