export async function validateEvidencePhoto(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size < 1 ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Use a JPEG, PNG or WebP image up to 5 MB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches =
    file.type === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : file.type === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
        : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
          new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (!matches) throw new Error("The photo content does not match its image format.");
}
