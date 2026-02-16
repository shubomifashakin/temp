export function makeFileCacheKey(fileId: string) {
  return `file:${fileId}`;
}

export function makePresignedUrlCacheKey(shareId: string) {
  return `presigned-url:${shareId}`;
}
