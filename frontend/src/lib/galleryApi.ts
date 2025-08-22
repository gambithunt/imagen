// Modular gallery API for local and future remote (S3, R2, etc) support
import type { GalleryImage, GalleryVideo, GalleryItem } from "./types";
import { defaultGalleryStore } from "./generatedReader";

export type { GalleryImage, GalleryVideo, GalleryItem };

// Mutable current store so consumers can swap implementations at runtime.
let currentStore = defaultGalleryStore;

// Backwards compatible wrapper that delegates to the configured store.
export async function fetchGalleryImages(): Promise<GalleryImage[]> {
  return await currentStore.listImages();
}

// New function to fetch videos
export async function fetchGalleryVideos(): Promise<GalleryVideo[]> {
  return await currentStore.listVideos();
}

// Combined function to fetch all gallery items
export async function fetchGalleryItems(): Promise<GalleryItem[]> {
  const [images, videos] = await Promise.all([
    currentStore.listImages(),
    currentStore.listVideos(),
  ]);

  // Mark images with type if not already set
  const typedImages = images.map((img: GalleryImage) => ({
    ...img,
    type: "image" as const,
  }));

  return [...typedImages, ...videos];
}

// Swap the active gallery store (useful for tests or switching to S3/R2 store)
export function setGalleryStore(store: {
  listImages(): Promise<GalleryImage[]>;
  listVideos(): Promise<GalleryVideo[]>;
}) {
  currentStore = store as any;
}
