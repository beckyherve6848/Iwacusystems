export const isPngOrJpeg = (file: File) =>
  file.type === 'image/png' || file.type === 'image/jpeg';

export function hasExactImageDimensions(file: File, width: number, height: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image.naturalWidth === width && image.naturalHeight === height);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The selected image could not be read.'));
    };
    image.src = objectUrl;
  });
}

export function imageFileExtension(file: File): 'png' | 'jpg' {
  return file.type === 'image/png' ? 'png' : 'jpg';
}
