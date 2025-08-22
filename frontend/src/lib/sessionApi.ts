// Session management API for frontend
export interface ImageSession {
  sessionId: string;
  timestamp: string;
  model: string;
  prompt: string;
  category: string;
  name: string;
  createdAt: string;
  sessionDir: string;
  type: "image";
  imageUrl?: string;
  imageKey?: string;
  imageFilename?: string;
  // Additional metadata fields
  numberOfImages?: number;
  sampleImageSize?: string;
  aspectRatio?: string;
  personGeneration?: string;
  negative_prompt?: string;
  seed?: string;
  style_preset?: string;
  output_format?: string;
  strength?: number;
}

export interface VideoSession {
  sessionId: string;
  timestamp: string;
  model: string;
  promptText: string;
  taskId: string;
  inputImagePath?: string;
  createdAt: number;
  completedAt?: number;
  type: "video";
  videoUrl?: string;
  metadataKey?: string;
}

export type Session = ImageSession | VideoSession;

export type SessionDetail = Session & {
  imageUrl?: string;
  videoUrl?: string;
  fullMetadata?: any;
};

// API functions for session management
const API_BASE = import.meta.env?.DEV ? "http://localhost:3000" : "";

export async function fetchImageSessions(): Promise<ImageSession[]> {
  try {
    const response = await fetch(`${API_BASE}/api/gallery/image-sessions`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch image sessions:", error);
    return [];
  }
}

export async function fetchVideoSessions(): Promise<VideoSession[]> {
  try {
    // Get video sessions from the videos gallery endpoint and transform to session format
    const response = await fetch(`${API_BASE}/api/gallery/videos`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const videos = await response.json();

    // Transform video gallery items to session format
    return videos.map((video: any) => ({
      sessionId: video.sessionId,
      timestamp: new Date(video.createdAt).toISOString(),
      model: video.model,
      promptText: video.promptText || "",
      taskId: video.taskId || "",
      inputImagePath: video.inputImagePath,
      createdAt: video.createdAt,
      completedAt: video.completedAt,
      type: "video" as const,
      videoUrl: video.videoUrl,
    }));
  } catch (error) {
    console.error("Failed to fetch video sessions:", error);
    return [];
  }
}

export async function fetchAllSessions(): Promise<Session[]> {
  const [imageSessions, videoSessions] = await Promise.all([
    fetchImageSessions(),
    fetchVideoSessions(),
  ]);

  const allSessions = [...imageSessions, ...videoSessions];

  // Sort by timestamp (newest first)
  return allSessions.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export async function fetchSessionDetail(
  sessionId: string,
  type: "image" | "video"
): Promise<SessionDetail | null> {
  try {
    const endpoint =
      type === "image"
        ? `/api/gallery/image-session/${sessionId}`
        : `/api/gallery/video/${sessionId}/session`;

    const response = await fetch(`${API_BASE}${endpoint}`);
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const sessionData = await response.json();
    return {
      ...sessionData,
      type,
      sessionId,
    };
  } catch (error) {
    console.error(`Failed to fetch ${type} session detail:`, error);
    return null;
  }
}

export async function deleteSession(
  sessionId: string,
  type: "image" | "video"
): Promise<boolean> {
  try {
    const endpoint =
      type === "image"
        ? `/api/gallery/image-session/${sessionId}`
        : `/api/gallery/video/${sessionId}`;

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error(`Failed to delete ${type} session:`, error);
    return false;
  }
}

// Helper function to get session category display name
export function getSessionCategoryName(session: Session): string {
  if (session.type === "video") {
    const modelMap: Record<string, string> = {
      gen3a_turbo: "RunwayML Gen3 Turbo",
      gen4_turbo: "RunwayML Gen4 Turbo",
      gen4_aleph: "RunwayML Gen4 Aleph",
    };
    return modelMap[session.model] || `RunwayML ${session.model}`;
  }

  // Image session categories
  if (session.model.includes("Imagen")) {
    return session.model;
  }

  const modelMap: Record<string, string> = {
    "SD Core": "Stable Diffusion Core",
    "SD Ultra": "Stable Diffusion Ultra",
    "SD XL": "Stable Diffusion XL",
  };

  return modelMap[session.model] || session.model;
}

// Helper function to get session color theme
export function getSessionColorTheme(session: Session): string {
  if (session.type === "video") {
    return "bg-green-500";
  }

  if (session.model.includes("Imagen")) {
    if (session.model.includes("Fast")) return "bg-blue-400";
    if (session.model.includes("Ultra")) return "bg-blue-600";
    return "bg-blue-500";
  }

  // Stable Diffusion colors
  if (session.model.includes("SD") || session.model.includes("Stable")) {
    if (session.model.includes("Ultra")) return "bg-purple-600";
    if (session.model.includes("XL")) return "bg-purple-500";
    return "bg-purple-400";
  }

  return "bg-gray-500";
}
