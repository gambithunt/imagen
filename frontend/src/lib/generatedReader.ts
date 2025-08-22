// Modular generated images reader
// Default implementation uses the backend API endpoint `/api/gallery` which
// the express server already exposes. In the future this module can provide
// alternative implementations (S3, R2, direct filesystem) and export the
// same `GalleryStore` interface.
import type { GalleryImage, GalleryVideo } from "./types";

export interface GalleryStore {
  listImages(): Promise<GalleryImage[]>;
  listVideos(): Promise<GalleryVideo[]>;
}

// Default store: fetch from backend api
class ApiGalleryStore implements GalleryStore {
  apiPath: string;
  // Default to backend dev server where express serves /api/gallery
  constructor(apiPath = "http://localhost:3000/api/gallery") {
    this.apiPath = apiPath;
  }

  async listImages(): Promise<GalleryImage[]> {
    // Try the configured apiPath first (e.g. http://localhost:3000/api/gallery).
    // If that fails (network error) fall back to a relative `/api/gallery`
    // which may be proxied by the frontend dev server in some setups.
    try {
      let res: Response;
      try {
        res = await fetch(this.apiPath, { mode: "cors" });
      } catch (e) {
        // If absolute backend fetch fails (e.g. different dev setup), fall back
        // to relative path which may be proxied by the frontend dev server.
        res = await fetch("/api/gallery");
      }
      if (!res.ok) return [];
      const json = await res.json();
      return json as GalleryImage[];
    } catch (e) {
      console.error("ApiGalleryStore.listImages error:", e);
      return [];
    }
  }

  async listVideos(): Promise<GalleryVideo[]> {
    try {
      let res: Response;
      try {
        res = await fetch(this.apiPath + "/videos", { mode: "cors" });
      } catch (e) {
        // Fallback to relative path
        res = await fetch("/api/gallery/videos");
      }
      if (!res.ok) return [];
      const json = await res.json();
      return json as GalleryVideo[];
    } catch (e) {
      console.error("ApiGalleryStore.listVideos error:", e);
      return [];
    }
  }
}

// Export a single default store instance which can be swapped in tests or
// app initialization to another implementation (e.g. S3GalleryStore).
export const defaultGalleryStore: GalleryStore = new ApiGalleryStore();

// For convenience export the default instance as `defaultStore` as well
export const defaultStore = defaultGalleryStore;
