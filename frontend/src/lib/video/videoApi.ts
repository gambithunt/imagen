export type VideoCreateParams = {
  promptText: string;
  model: string;
  ratio?: string;
  duration?: number;
  seed?: number;
  imageFile?: File | null;
  imageUrl?: string;
};

// Simple API client that posts to /api/video/create (backend should implement)
export async function createVideo(params: VideoCreateParams) {
  const form = new FormData();
  form.append("promptText", params.promptText);
  form.append("model", params.model);
  if (params.ratio) form.append("ratio", params.ratio);
  if (params.duration) form.append("duration", String(params.duration));
  if (typeof params.seed === "number") form.append("seed", String(params.seed));
  if (params.imageFile)
    form.append("image", params.imageFile, params.imageFile.name);
  if (params.imageUrl) form.append("imageUrl", params.imageUrl);

  // Backend URL — match other frontend pages which call http://localhost:3000
  const API_BASE =
    typeof window !== "undefined" ? (window as any).API_BASE || "" : "";
  const endpoint = API_BASE
    ? `${API_BASE}/api/video/create`
    : "http://localhost:3000/api/video/create";

  const res = await fetch(endpoint, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error: ${res.status} ${body}`);
  }
  const data = await res.json();

  // Normalize saved image URL: backend may provide `savedImageUrl`, otherwise build one
  const backendBase = API_BASE || "http://localhost:3000";
  if (!data.savedImageUrl && data.savedImage) {
    data.savedImageUrl = `${backendBase}${data.savedImage}`;
  }

  // If Runway created an async task, poll status endpoint until completion
  // Allow caller to pass a progress callback by attaching it to params as (params as any)._onProgress
  const onProgress = (params as any)._onProgress as
    | ((status: any) => void)
    | undefined;

  if (
    (data.note && data.note === "task created") ||
    (data.id && !data.videoUrl)
  ) {
    const taskId = data.id;
    const statusUrl =
      (API_BASE ? API_BASE : "http://localhost:3000") +
      `/api/video/status/${taskId}`;
    const interval = 2000;
    const timeout = 2 * 60 * 1000; // 2 minutes
    const start = Date.now();
    while (true) {
      try {
        const sres = await fetch(statusUrl);
        if (!sres.ok) {
          const body = await sres.text();
          if (onProgress)
            onProgress({ error: `status error ${sres.status} ${body}` });
        } else {
          const sdata = await sres.json();
          if (onProgress) onProgress(sdata);
          if (sdata.done && (sdata.outputUri || sdata.savedVideoUrl)) {
            // Use saved video URL if available, otherwise use original outputUri
            data.videoUrl = sdata.savedVideoUrl || sdata.outputUri;
            data.savedVideoUrl = sdata.savedVideoUrl;
            data.savedVideoPath = sdata.savedVideoPath;
            return data;
          }
        }
      } catch (e) {
        if (onProgress) onProgress({ error: String(e) });
      }
      if (Date.now() - start > timeout) {
        if (onProgress) onProgress({ error: "timeout" });
        return data;
      }
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  return data;
}
