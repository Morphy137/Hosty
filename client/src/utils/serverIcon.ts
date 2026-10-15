import type { GameDriverSummary } from '../types/daemon';

/** Size used when the game has no icon of its own (only shown inside Hosty). */
export const APP_ICON_SIZE = 128;

/** Pixel size the icon is stored at: the game's required size when it declares a `serverIcon`. */
export const iconSizeFor = (game: Pick<GameDriverSummary, 'serverIcon'> | undefined): number =>
  game?.serverIcon?.size ?? APP_ICON_SIZE;

/**
 * Center-crops an image (file or data URL) to a square and scales it to `size`×`size`, the format games
 * such as Minecraft require for their server icon. Resolves with a PNG data URL.
 */
export function resizeToServerIcon(source: Blob | string, size: number = APP_ICON_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const release = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
    };
    const image = new Image();

    image.onload = () => {
      release();
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const sx = (image.naturalWidth - side) / 2;
      const sy = (image.naturalHeight - side) / 2;

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas is not available'));
        return;
      }
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => {
      release();
      reject(new Error('The selected file is not a valid image'));
    };

    image.src = url;
  });
}
