export const SERVER_ICON_SIZE = 64;

/**
 * Center-crops an image to a square and scales it to 64x64, the only size Minecraft accepts for
 * `server-icon.png`. Resolves with a PNG data URL.
 */
export function resizeToServerIcon(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const sx = (image.naturalWidth - side) / 2;
      const sy = (image.naturalHeight - side) / 2;

      const canvas = document.createElement('canvas');
      canvas.width = SERVER_ICON_SIZE;
      canvas.height = SERVER_ICON_SIZE;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas is not available'));
        return;
      }
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, sx, sy, side, side, 0, 0, SERVER_ICON_SIZE, SERVER_ICON_SIZE);
      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The selected file is not a valid image'));
    };

    image.src = url;
  });
}
