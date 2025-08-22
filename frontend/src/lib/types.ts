export interface GalleryImage {
  name: string;
  category: string;
  thumbUrl: string;
  fullUrl: string;
  type?: "image";
}

export interface GalleryVideo {
  name: string;
  category: string;
  model: string;
  thumbUrl: string;
  fullUrl: string;
  videoUrl: string;
  sessionId: string;
  taskId: string;
  promptText: string;
  inputImagePath?: string;
  createdAt: number;
  completedAt: number;
  type: "video";
}

export type GalleryItem = GalleryImage | GalleryVideo;
