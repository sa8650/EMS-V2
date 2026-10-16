import type { R2Bucket, R2Object, R2ObjectBody, R2PutOptions } from '@/types/cloudflare';

/** In-memory R2 bucket for tests. */
export function memoryBucket(): R2Bucket & { objects: Map<string, { data: Uint8Array<ArrayBuffer>; type?: string }> } {
  const objects = new Map<string, { data: Uint8Array<ArrayBuffer>; type?: string }>();
  const meta = (key: string, o: { data: Uint8Array<ArrayBuffer>; type?: string }): R2Object => ({ key, size: o.data.byteLength, httpMetadata: { contentType: o.type } });
  return {
    objects,
    async put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | string | Blob, options?: R2PutOptions) {
      const data = new Uint8Array(await new Response(value as BodyInit).arrayBuffer());
      objects.set(key, { data, type: options?.httpMetadata?.contentType });
      return meta(key, objects.get(key)!);
    },
    async head(key: string) {
      const o = objects.get(key);
      return o ? meta(key, o) : null;
    },
    async get(key: string) {
      const o = objects.get(key);
      if (!o) return null;
      return { ...meta(key, o), body: new Response(o.data).body!, arrayBuffer: async () => o.data.slice().buffer } as R2ObjectBody;
    },
    async delete(key: string | string[]) {
      for (const k of Array.isArray(key) ? key : [key]) objects.delete(k);
    },
  };
}
