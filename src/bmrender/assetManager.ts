// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

export class AssetManager {
    private bitmapCache: Map<number, ImageBitmap> = new Map();
    private blobCache: Map<number, string> = new Map();
    private staleBitmaps: ImageBitmap[] = [];
    private staleUrls: string[] = [];

    constructor() { }

    hasResource(id: number): boolean {
        return this.bitmapCache.has(id);
    }

    async loadResources(resources: { id: number, bitmap: Uint8Array }[]) {
        this.flushStale();

        const loaded: { id: number; bitmap: ImageBitmap; url: string }[] = [];
        await Promise.all(resources.map(async (res) => {
            if (res.bitmap.length === 0) return;
            try {
                const blob = new Blob([res.bitmap as unknown as BlobPart], { type: 'image/png' });
                const url = URL.createObjectURL(blob);
                const img = await createImageBitmap(blob);
                loaded.push({ id: res.id, bitmap: img, url });
                console.log(`[AssetManager] Loaded resource ${res.id} (${res.bitmap.length} bytes)`);
            } catch (e) {
                console.error(`[AssetManager] Failed to load resource ${res.id}`, e);
            }
        }));

        for (const item of loaded) {
            const oldBmp = this.bitmapCache.get(item.id);
            const oldUrl = this.blobCache.get(item.id);

            this.bitmapCache.set(item.id, item.bitmap);
            this.blobCache.set(item.id, item.url);

            if (oldBmp) this.staleBitmaps.push(oldBmp);
            if (oldUrl) this.staleUrls.push(oldUrl);
        }
    }

    private flushStale() {
        for (const bmp of this.staleBitmaps) bmp.close();
        for (const url of this.staleUrls) URL.revokeObjectURL(url);
        this.staleBitmaps = [];
        this.staleUrls = [];
    }

    getBitmap(id: number): ImageBitmap | undefined {
        return this.bitmapCache.get(id);
    }

    getObjectUrl(id: number): string | undefined {
        return this.blobCache.get(id);
    }

    dispose() {
        this.flushStale();
        this.bitmapCache.forEach(img => img.close());
        this.bitmapCache.clear();
        this.blobCache.forEach(url => URL.revokeObjectURL(url));
        this.blobCache.clear();
    }
}

export const assetManager = new AssetManager();
