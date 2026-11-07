import "server-only";

const MAX_PDF_SIZE = 10 * 1024 * 1024;

function storageConfig() {
  const projectUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!projectUrl || !serviceRoleKey || !bucket) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET are required for PDF storage");
  }
  const base = new URL(projectUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("SUPABASE_URL must use HTTPS");
  }
  return { base: base.origin, serviceRoleKey, bucket };
}

function privateStorageConfig(bucket: string) {
  const projectUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!projectUrl || !serviceRoleKey || !bucket.trim()) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and a private bucket are required");
  }
  const base = new URL(projectUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("SUPABASE_URL must use HTTPS");
  }
  return { base: base.origin, serviceRoleKey, bucket };
}

function storageObjectUrl(base: string, bucket: string, objectKey: string): string {
  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = objectKey.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/${encodedBucket}/${encodedPath}`;
}

function storageObjectUrlFor(bucket: string, objectKey: string): string {
  const config = privateStorageConfig(bucket);
  return storageObjectUrl(config.base, config.bucket, objectKey);
}

function storageHeaders(key: string, contentType?: string): HeadersInit {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

export async function uploadPrivatePdf(objectKey: string, file: File): Promise<void> {
  if (file.size <= 0 || file.size > MAX_PDF_SIZE) throw new Error("PDF must be between 1 byte and 10 MB");
  if (file.type !== "application/pdf") throw new Error("Only PDF files are allowed");
  const config = storageConfig();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("The uploaded file is not a valid PDF");

  const response = await fetch(storageObjectUrl(config.base, config.bucket, objectKey), {
    method: "POST",
    headers: {
      ...storageHeaders(config.serviceRoleKey, "application/pdf"),
      "x-upsert": "false",
      "cache-control": "private, max-age=0",
    },
    body: bytes,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase Storage upload failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}

export async function createPrivatePdfSignedUrl(objectKey: string): Promise<string> {
  const config = storageConfig();
  const encodedBucket = encodeURIComponent(config.bucket);
  const encodedPath = objectKey.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${config.base}/storage/v1/object/sign/${encodedBucket}/${encodedPath}`, {
    method: "POST",
    headers: storageHeaders(config.serviceRoleKey, "application/json"),
    body: JSON.stringify({ expiresIn: 300 }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase Storage signed URL failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null || !("signedURL" in data) || typeof data.signedURL !== "string") {
    throw new Error("Supabase Storage returned an invalid signed URL response");
  }
  const signedUrl = new URL(data.signedURL, config.base);
  if (signedUrl.origin !== config.base) throw new Error("Supabase Storage returned a URL with an unexpected origin");
  return signedUrl.toString();
}

export async function deletePrivateObject(objectKey: string): Promise<void> {
  const { bucket } = storageConfig();
  await deletePrivateObjectFromBucket(bucket, objectKey);
}

export async function uploadPrivateObject(bucket: string, objectKey: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const config = privateStorageConfig(bucket);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const response = await fetch(storageObjectUrlFor(bucket, objectKey), {
    method: "POST",
    headers: {
      ...storageHeaders(config.serviceRoleKey, contentType),
      "x-upsert": "false",
      "cache-control": "private, max-age=0",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Supabase Storage upload failed (${response.status})`);
  }
}

export async function downloadPrivateObject(bucket: string, objectKey: string): Promise<Uint8Array> {
  const config = privateStorageConfig(bucket);
  const response = await fetch(storageObjectUrlFor(bucket, objectKey), {
    headers: storageHeaders(config.serviceRoleKey),
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Supabase Storage download failed (${response.status})`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > 250 * 1024 * 1024) {
    await response.body?.cancel();
    throw new Error("Stored backup exceeds the 250 MB verification limit");
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function deletePrivateObjectFromBucket(bucket: string, objectKey: string): Promise<void> {
  const config = privateStorageConfig(bucket);
  const encodedBucket = encodeURIComponent(config.bucket);
  const encodedPath = objectKey.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${config.base}/storage/v1/object/${encodedBucket}/${encodedPath}`, {
    method: "DELETE",
    headers: storageHeaders(config.serviceRoleKey, "application/json"),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok && response.status !== 404) {
    await response.body?.cancel();
    throw new Error(`Supabase Storage delete failed (${response.status})`);
  }
}
