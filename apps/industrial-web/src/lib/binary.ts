export function decodeBase64ToBlob(dataBase64: string, contentType: string): Blob {
  const normalized = dataBase64.replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: contentType || "application/octet-stream" });
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
