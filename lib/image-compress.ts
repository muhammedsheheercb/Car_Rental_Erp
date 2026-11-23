const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type CompressOptions = {
  maxDimension?: number;
  quality?: number;
  maxInputBytes?: number;
  maxOutputBytes?: number;
  preserveTransparency?: boolean;
};

type CompressedImage = {
  file: File;
  width: number;
  height: number;
};

function renameExtension(name: string, mimeType: string) {
  const ext = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
  if (!name) return `image${ext}`;
  const lower = name.toLowerCase();
  if (lower.endsWith(ext) || (ext === ".jpg" && lower.endsWith(".jpeg"))) return name;
  return `${name.replace(/\.[^.]+$/, "")}${ext}`;
}

export async function compressImageFile(
  file: File,
  options: CompressOptions = {},
): Promise<CompressedImage> {
  const {
    maxDimension = 1800,
    quality = 0.82,
    maxInputBytes = 10 * 1024 * 1024,
    maxOutputBytes = 5 * 1024 * 1024,
    preserveTransparency = false,
  } = options;

  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Use a PNG, JPEG or WebP image up to 5 MB.");
  }
  if (file.size < 1 || file.size > maxInputBytes) {
    throw new Error(`Image must be ${Math.round(maxInputBytes / (1024 * 1024))} MB or smaller.`);
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This image could not be read."));
      element.src = url;
    });

    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    if (!naturalWidth || !naturalHeight) {
      throw new Error("This image could not be read.");
    }

    const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (file.size > maxOutputBytes) throw new Error("Use a PNG, JPEG or WebP image up to 5 MB.");
      return { file, width: naturalWidth, height: naturalHeight };
    }

    const outputType =
      preserveTransparency && file.type === "image/png"
        ? "image/png"
        : file.type === "image/webp"
          ? "image/webp"
          : "image/jpeg";

    if (outputType === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outputType, outputType === "image/png" ? undefined : quality),
    );

    if (!blob) {
      if (file.size > maxOutputBytes) throw new Error("Use a PNG, JPEG or WebP image up to 5 MB.");
      return { file, width: naturalWidth, height: naturalHeight };
    }

    // Keep the original file when no resizing occurred and re-encoding increased size.
    if (scale === 1 && blob.size >= file.size && file.size <= maxOutputBytes) {
      return { file, width: naturalWidth, height: naturalHeight };
    }

    if (blob.size > maxOutputBytes) {
      throw new Error("Compressed image exceeds 5 MB. Use a smaller image.");
    }

    const optimized = new File([blob], renameExtension(file.name, outputType), {
      type: outputType,
      lastModified: Date.now(),
    });
    return { file: optimized, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
