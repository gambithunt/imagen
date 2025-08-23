const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const upload = multer();
const axios = require("axios");
// Mirror the backend flag for local writes. Default false.
const ENABLE_LOCAL_STORAGE =
  (process.env.ENABLE_LOCAL_STORAGE || "false").toLowerCase() === "true";

// UUID v4 regex for RunwayML task validation
const UUID_V4_REGEX =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/;

// Simple in-memory store for task metadata
const taskMetadata = new Map();

// Minimal proxy to fetch R2-hosted objects server-side and return them
// with CORS headers so the browser won't attempt to fetch the R2 URL directly.
// GET /api/video/proxy?url=<encoded-url>
router.get("/proxy", async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: "missing url" });

  try {
    // Basic safety: only allow R2 / cloudflare storage domains or local savedUrl
    const allowedHosts = [
      "r2.cloudflarestorage.com",
      // allow explicitly configured base if set
      ...(process.env.R2_BASE_URL
        ? [new URL(process.env.R2_BASE_URL).host]
        : []),
      ...(process.env.R2_ENDPOINT
        ? [new URL(process.env.R2_ENDPOINT).host]
        : []),
    ].filter(Boolean);

    let parsed;
    try {
      parsed = new URL(target);
    } catch (e) {
      return res.status(400).json({ error: "invalid url" });
    }

    const hostAllowed = allowedHosts.some((h) => parsed.host.includes(h));
    if (!hostAllowed) {
      // allow local backend savedUrl paths that begin with /generated/
      if (
        !(
          parsed.origin === "null" &&
          parsed.pathname &&
          parsed.pathname.startsWith("/generated/")
        ) &&
        !parsed.pathname.startsWith("/generated/")
      ) {
        return res.status(403).json({ error: "url not allowed" });
      }
    }

    // Fetch the resource server-side
    const resp = await axios.get(target, { responseType: "stream" });

    // Propagate content-type and content-length when available
    if (resp.headers["content-type"])
      res.setHeader("Content-Type", resp.headers["content-type"]);
    if (resp.headers["content-length"])
      res.setHeader("Content-Length", resp.headers["content-length"]);
    // CORS header to allow browser requests
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");

    resp.data.pipe(res);
  } catch (e) {
    console.error("/api/video/proxy fetch error", e?.message || e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// Return a signed R2 URL for a given object key.
// GET /api/video/sign?key=<object-key>
router.get("/sign", async (req, res) => {
  const key = req.query.key;
  if (!key) return res.status(400).json({ error: "missing key" });
  try {
    if (
      !process.env.R2_BUCKET ||
      !(process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
    ) {
      return res.status(500).json({ error: "R2 not configured" });
    }
    const r2 = require("../lib/r2");
    const expires = parseInt(process.env.R2_SIGNED_EXPIRES || "900", 10);
    const signed = await r2.getSignedUrl(key, expires);
    return res.json({ signedUrl: signed });
  } catch (e) {
    console.error("/api/video/sign error", e?.message || e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// Helper: convert buffer to data URI
function bufferToDataUri(buffer, mimetype = "image/png") {
  return `data:${mimetype};base64,${buffer.toString("base64")}`;
}

// Helper: simple poll helper
async function poll(fn, { interval = 2000, timeout = 120000 } = {}) {
  const start = Date.now();
  while (true) {
    const res = await fn();
    if (res && res.done) return res;
    if (Date.now() - start > timeout) throw new Error("poll timeout");
    await new Promise((r) => setTimeout(r, interval));
  }
}

// POST /api/video/create
// Accepts multipart form with fields: promptText, model, ratio, duration, seed, image
router.post("/create", upload.single("image"), async (req, res) => {
  try {
    const { promptText, model, ratio, duration, seed } = req.body;
    const file = req.file;

    // Allow overriding Runway API base URL (some keys require api.dev.runwayml.com)
    let RUNWAY_BASE =
      process.env.RUNWAY_API_BASE || "https://api.dev.runwayml.com";
    // Normalize: if user provided hostname without scheme, add https://
    if (
      !RUNWAY_BASE.startsWith("http://") &&
      !RUNWAY_BASE.startsWith("https://")
    ) {
      RUNWAY_BASE = `https://${RUNWAY_BASE}`;
    }
    // Remove trailing slash if present
    RUNWAY_BASE = RUNWAY_BASE.replace(/\/$/, "");
    // Debug log to confirm which base is being used
    console.log(`/api/video/create using RUNWAY_BASE=${RUNWAY_BASE}`);
    // Ensure output dir (only when local storage enabled)
    const outDir = path.join(__dirname, "..", "generated", "video_inputs");
    if (ENABLE_LOCAL_STORAGE && !fs.existsSync(outDir))
      fs.mkdirSync(outDir, { recursive: true });

    let savedPath = null;
    if (file) {
      const filename = `input_${Date.now()}_${file.originalname}`.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );
      const absPath = path.join(outDir, filename);
      if (ENABLE_LOCAL_STORAGE) {
        fs.writeFileSync(absPath, file.buffer);
        savedPath = `/generated/video_inputs/${filename}`;
      }
      // compute a full URL that points to the backend static serve so the frontend
      // can open the saved image directly (avoids hitting the Vite dev server)
      const BACKEND_BASE = process.env.BACKEND_BASE || "http://localhost:3000";
      const savedUrl = `${BACKEND_BASE}${savedPath}`;
      // Confirm the file was written
      const savedExists = ENABLE_LOCAL_STORAGE ? fs.existsSync(absPath) : false;
      if (ENABLE_LOCAL_STORAGE) {
        if (!savedExists) {
          console.warn(
            `/api/video/create warning: saved file not found at ${absPath}`
          );
        } else {
          console.log(`/api/video/create saved input at ${absPath}`);
        }
      }
      // expose absPath and savedExists for debugging later in the response
      req._savedInput = { filename, absPath, savedExists, savedUrl };
      // Try uploading input image to R2 (best-effort)
      try {
        if (
          process.env.R2_BUCKET &&
          (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
        ) {
          const key = `video_inputs/${filename}`;
          const r2 = require("../lib/r2");
          const r2url = await r2.uploadBuffer(
            file.buffer,
            key,
            file.mimetype || "image/png"
          );
          req._savedInput.savedR2Url = r2url;
        }
      } catch (e) {
        console.warn("R2 upload failed for video input", e.message || e);
      }
    }

    // If RUNWAY_API_KEY is configured, proxy the request to RunwayML's image_to_video endpoint
    const RUNWAY_KEY = process.env.RUNWAY_API_KEY;
    if (RUNWAY_KEY) {
      try {
        // Get a signed R2 URL for the prompt image. RunwayML expects promptImage to be a URL, not a data URI.
        let promptImageUrl = null;

        if (file && req._savedInput && req._savedInput.savedR2Url) {
          // Convert the R2 public URL to a signed URL for RunwayML
          try {
            const u = new URL(req._savedInput.savedR2Url);
            const key = u.pathname.replace(/^\/+/, "");
            const r2 = require("../lib/r2");
            promptImageUrl = await r2.getSignedUrl(key, 3600);
            console.log(`Using signed URL from saved R2 upload`);
          } catch (e) {
            console.warn(
              "Failed to create signed URL from saved R2 upload:",
              e.message
            );
            promptImageUrl = req._savedInput.savedR2Url; // fallback to original
          }
        } else if (req.body.imageUrl) {
          // Handle URL from gallery - convert to unsigned R2 public URL if possible
          try {
            const imageUrl = req.body.imageUrl;
            const u = new URL(imageUrl);

            // If it's an R2 URL (signed or unsigned), extract the key and get signed URL
            const isR2Host = /\br2\.cloudflarestorage\.com\b/i.test(u.host);
            if (isR2Host) {
              const key = u.pathname.replace(/^\/+/, "");
              const r2 = require("../lib/r2");
              // Use signed URL for RunwayML access (expires in 1 hour)
              promptImageUrl = await r2.getSignedUrl(key, 3600);
              console.log(
                `Using R2 signed URL for RunwayML: ${
                  promptImageUrl.split("?")[0]
                }?...`
              );
            } else if (
              imageUrl.startsWith(
                `${
                  process.env.BACKEND_BASE || "http://localhost:3000"
                }/generated/`
              )
            ) {
              // If it's a local backend URL, try to upload to R2 for RunwayML access
              try {
                const fetchResp = await axios.get(imageUrl, {
                  responseType: "arraybuffer",
                });
                const buf = Buffer.from(fetchResp.data);
                const filename = `input_${Date.now()}_from_gallery.png`;
                const key = `video_inputs/${filename}`;
                const r2 = require("../lib/r2");
                await r2.uploadBuffer(buf, key, "image/png");
                // Get signed URL for RunwayML access
                promptImageUrl = await r2.getSignedUrl(key, 3600);
                console.log(`Uploaded gallery image to R2 with signed URL`);
              } catch (uploadErr) {
                console.warn(
                  "Failed to upload gallery image to R2:",
                  uploadErr.message
                );
                promptImageUrl = imageUrl; // fallback to original URL
              }
            } else {
              // Use external URL directly
              promptImageUrl = imageUrl;
            }
          } catch (urlError) {
            console.warn("Failed to parse imageUrl:", urlError.message);
            promptImageUrl = req.body.imageUrl; // fallback to original
          }
        } else if (file) {
          // Fallback: try to upload to R2 now if we have a file but no R2 URL
          try {
            if (
              process.env.R2_BUCKET &&
              (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
            ) {
              const filename = `input_${Date.now()}_${
                file.originalname
              }`.replace(/[^a-zA-Z0-9._-]/g, "_");
              const key = `video_inputs/${filename}`;
              const r2 = require("../lib/r2");
              await r2.uploadBuffer(
                file.buffer,
                key,
                file.mimetype || "image/png"
              );
              // Get signed URL for RunwayML access
              promptImageUrl = await r2.getSignedUrl(key, 3600);
              console.log(`Uploaded file to R2 with signed URL`);
            }
          } catch (e) {
            console.warn(
              "Failed to upload image to R2 for RunwayML:",
              e.message || e
            );
          }
        }

        if (!promptImageUrl) {
          return res.status(400).json({
            error:
              "No image provided or failed to upload to R2. RunwayML requires a valid image URL.",
          });
        }

        // Allowlist of supported runway models. We removed `gen3a_aleph` as a
        // selectable option and added `gen4_turbo` and `gen4_aleph`.
        const allowedModels = ["gen3a_turbo", "gen4_turbo", "gen4_aleph"];

        // Use provided model if allowed, otherwise fall back to gen3a_turbo.
        const finalModel = allowedModels.includes(model)
          ? model
          : "gen3a_turbo";

        // RunwayML accepted ratios per model (keep in sync with Runway docs).
        // Make this model-aware so we send the correct allowed ratios for each
        // model family. This prevents sending a ratio that the chosen model
        // doesn't accept (which resulted in the Runway error).
        const MODEL_VALID_RATIOS = {
          gen4_turbo: [
            "1280:720",
            "720:1280",
            "1104:832",
            "832:1104",
            "960:960",
            "1584:672",
          ],
          gen4_aleph: [
            "1280:720",
            "720:1280",
            "1104:832",
            "832:1104",
            "960:960",
            "1584:672",
          ],
          // gen3a_turbo supports these two ratios only
          gen3a_turbo: ["768:1280", "1280:768"],
        };

        const allowedRatios =
          MODEL_VALID_RATIOS[finalModel] || MODEL_VALID_RATIOS.gen4_turbo;
        const finalRatio =
          ratio && allowedRatios.includes(ratio) ? ratio : allowedRatios[0];

        const body = {
          model: finalModel,
          promptImage: promptImageUrl,
          promptText: promptText || "",
          ratio: finalRatio,
          duration: Number(duration) || 5,
        };
        if (seed) body.seed = Number(seed);

        console.log(`Sending to RunwayML with promptImage: ${promptImageUrl}`);
        console.log(
          `Runway payload preview: model=${finalModel}, ratio=${finalRatio}, duration=${
            Number(duration) || 5
          }`
        );

        const headers = {
          Authorization: `Bearer ${RUNWAY_KEY}`,
          "X-Runway-Version": "2024-11-06",
        };

        const createResp = await axios.post(
          `${RUNWAY_BASE}/v1/image_to_video`,
          body,
          { headers }
        );

        // If Runway returns a task or immediate output, try to extract video URL
        const createData = createResp.data || {};
        console.log(
          "/api/video/create Runway createResp status=",
          createResp.status
        );
        try {
          console.log(
            "/api/video/create createData=",
            JSON.stringify(createData).slice(0, 2000)
          );
        } catch (e) {
          // ignore stringify errors
        }

        // If an output URL is present immediately, return it
        if (
          createData.output &&
          createData.output[0] &&
          createData.output[0].uri
        ) {
          return res.json({
            id: createData.id || null,
            videoUrl: createData.output[0].uri,
            savedImage: savedPath,
            savedImageUrl: req._savedInput ? req._savedInput.savedUrl : null,
            promptText,
            model,
            ratio,
            duration,
            seed,
            savedInfo: req._savedInput || null,
            raw: createData,
          });
        }

        // If a valid RunwayML task id is provided, return immediately with the task id and raw payload
        const taskId = createData.id || (createData.task && createData.task.id);
        if (taskId && UUID_V4_REGEX.test(taskId)) {
          // Generate a unique identifier for this video creation session
          const sessionId = `session_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;

          // Store task metadata for later use in status endpoint. Save a
          // pointer to the input image that RunwayML will use. Prefer the
          // signed/uploaded URL we generated for Runway (`promptImageUrl`) if
          // available; otherwise fall back to any saved R2 URL or local saved
          // URL captured on the request object.
          const savedInputUrl =
            promptImageUrl ||
            (req._savedInput &&
              (req._savedInput.savedR2Url || req._savedInput.savedUrl)) ||
            null;

          taskMetadata.set(taskId, {
            model: finalModel,
            promptText,
            ratio: finalRatio,
            duration: Number(duration) || 5,
            seed,
            sessionId,
            // Persistent pointers to the image used for this Runway task.
            // `inputImagePath` is the canonical field; we also keep raw
            // sources for debugging and fallback.
            inputImagePath: savedInputUrl,
            promptImageUrl: promptImageUrl || null,
            savedR2Url: req._savedInput
              ? req._savedInput.savedR2Url || null
              : null,
            savedUrl: req._savedInput ? req._savedInput.savedUrl || null : null,
            createdAt: Date.now(),
          });

          return res.json({
            id: taskId,
            videoUrl: null,
            savedImage: savedPath,
            savedImageUrl: req._savedInput ? req._savedInput.savedUrl : null,
            promptText,
            model,
            ratio,
            duration,
            seed,
            savedInfo: req._savedInput || null,
            raw: createData,
            note: "task created",
          });
        }

        // Fallback: return the create response raw, but do NOT provide a fake id for polling
        return res.json({
          id: null,
          videoUrl: null,
          savedImage: savedPath,
          savedImageUrl: req._savedInput ? req._savedInput.savedUrl : null,
          promptText,
          model,
          ratio,
          duration,
          seed,
          savedInfo: req._savedInput || null,
          raw: createData,
        });
      } catch (e) {
        console.error(
          "/api/video/create Runway error",
          e?.response?.data || e.message || e
        );
        // fallback to stubbed response on error
        const fakeId = `task_${Date.now()}`;
        return res.json({
          id: fakeId,
          videoUrl: null,
          savedImage: savedPath,
          promptText,
          model,
          ratio,
          duration,
          seed,
          error: String(e?.response?.data || e.message || e),
        });
      }
    }

    // No RUNWAY_KEY configured — return stubbed response
    const fakeId = `task_${Date.now()}`;
    const placeholderVideo = null; // or a static video path if you add one under static/

    res.json({
      id: fakeId,
      videoUrl: placeholderVideo,
      savedImage: savedPath,
      savedImageUrl: req._savedInput ? req._savedInput.savedUrl : null,
      promptText,
      model,
      ratio,
      duration,
      seed,
    });
  } catch (err) {
    console.error("/api/video/create error", err);
    res.status(500).json({ error: String(err) });
  }
});

// Debug: list saved input files
router.get("/inputs", async (req, res) => {
  const dir = path.join(__dirname, "..", "generated", "video_inputs");
  // If R2 configured, list R2 objects under video_inputs/
  if (
    process.env.R2_BUCKET &&
    (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
  ) {
    try {
      const r2 = require("../lib/r2");
      const items = await r2.listObjects("video_inputs/");
      const files = items.map((it) => ({
        key: it.Key,
        size: it.Size,
        url: r2.getObjectPublicUrl(it.Key),
      }));
      return res.json({ dir: "r2://video_inputs/", files });
    } catch (e) {
      console.warn("R2 listObjects failed for video_inputs", e.message || e);
      // fallback to local
    }
  }
  try {
    if (!ENABLE_LOCAL_STORAGE) {
      return res.json({
        dir: "local-disabled",
        files: [],
        note: "Local storage disabled",
      });
    }
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    return res.json({ dir, files });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// Debug: list saved videos
router.get("/videos", async (req, res) => {
  if (
    process.env.R2_BUCKET &&
    (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
  ) {
    try {
      const r2 = require("../lib/r2");
      const items = await r2.listObjects("runway_video/");
      const files = items.map((it) => ({
        key: it.Key,
        size: it.Size,
        url: r2.getObjectPublicUrl(it.Key),
        isVideo: it.Key.endsWith(".mp4"),
        isMetadata: it.Key.endsWith(".json"),
      }));
      return res.json({ dir: "r2://runway_video/", files });
    } catch (e) {
      console.warn("R2 listObjects failed for runway_video", e.message || e);
      return res.status(500).json({ error: String(e.message || e) });
    }
  }
  return res.json({ dir: "local", files: [], note: "R2 not configured" });
});

module.exports = router;

// GET /api/video/status/:id - query Runway task status
router.get("/status/:id", async (req, res) => {
  const taskId = req.params.id;
  if (!UUID_V4_REGEX.test(taskId)) {
    return res.status(400).json({
      error:
        "Invalid UUID: Only real RunwayML task IDs are allowed for status polling.",
    });
  }
  let RUNWAY_BASE =
    process.env.RUNWAY_API_BASE || "https://api.dev.runwayml.com";
  if (
    !RUNWAY_BASE.startsWith("http://") &&
    !RUNWAY_BASE.startsWith("https://")
  ) {
    RUNWAY_BASE = `https://${RUNWAY_BASE}`;
  }
  RUNWAY_BASE = RUNWAY_BASE.replace(/\/$/, "");
  const RUNWAY_KEY = process.env.RUNWAY_API_KEY;
  if (!RUNWAY_KEY)
    return res.status(400).json({ error: "RUNWAY_API_KEY not configured" });
  const headers = {
    Authorization: `Bearer ${RUNWAY_KEY}`,
    "X-Runway-Version": "2024-11-06",
  };
  try {
    const statusResp = await axios.get(`${RUNWAY_BASE}/v1/tasks/${taskId}`, {
      headers,
    });
    const d = statusResp.data || {};
    const out = d.output || d.outputs || d.result || null;
    // RunwayML returns output as array of strings, not objects with uri property
    const uri =
      out && out[0] ? (typeof out[0] === "string" ? out[0] : out[0].uri) : null;

    console.log(`Status check for task ${taskId}:`, {
      status: d.status,
      done: d.done,
      hasOutput: !!out,
      hasUri: !!uri,
      outputType: out ? typeof out[0] : "none",
      rawData: JSON.stringify(d).slice(0, 500),
    });

    let savedVideoUrl = null;
    let savedVideoPath = null;

    // If video is completed and we have a URI, download and save to R2
    if (
      uri &&
      (d.status === "SUCCEEDED" ||
        d.status === "succeeded" ||
        d.status === "completed")
    ) {
      try {
        // Get model and session info from stored metadata
        const metadata = taskMetadata.get(taskId);
        const model = metadata ? metadata.model : "gen3a_turbo";
        const sessionId = metadata
          ? metadata.sessionId
          : `fallback_${Date.now()}`;

        // Download the video
        const videoResp = await axios.get(uri, { responseType: "arraybuffer" });
        const videoBuffer = Buffer.from(videoResp.data);

        // Generate filename and R2 keys
        const timestamp = Date.now();
        const videoFilename = `video_${taskId}_${timestamp}.mp4`;

        // Create directory structure: runway_video/{sessionId}/
        const videoR2Key = `runway_video/${sessionId}/${videoFilename}`;

        // Also save metadata file linking to input
        const metadataFilename = `metadata_${taskId}.json`;
        const metadataR2Key = `runway_video/${sessionId}/${metadataFilename}`;
        const metadataContent = JSON.stringify(
          {
            taskId,
            sessionId,
            model,
            promptText: metadata ? metadata.promptText : "",
            // Include a canonical input image path that points to the
            // resource Runway used (signed R2 URL when available). This
            // ensures metadata consumers can display the reference image.
            inputImagePath: metadata ? metadata.inputImagePath : null,
            // Keep an explicit `referenceImage` field for clarity in UI
            referenceImage: metadata ? metadata.inputImagePath : null,
            // Also include raw saved values for debugging/fallback
            savedR2Url: metadata ? metadata.savedR2Url || null : null,
            savedUrl: metadata ? metadata.savedUrl || null : null,
            createdAt: metadata ? metadata.createdAt : timestamp,
            completedAt: timestamp,
            videoPath: videoR2Key,
          },
          null,
          2
        );

        // Upload to R2
        if (
          process.env.R2_BUCKET &&
          (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
        ) {
          const r2 = require("../lib/r2");

          // Upload video
          savedVideoUrl = await r2.uploadBuffer(
            videoBuffer,
            videoR2Key,
            "video/mp4"
          );
          savedVideoPath = videoR2Key;

          // Upload metadata
          await r2.uploadBuffer(
            Buffer.from(metadataContent),
            metadataR2Key,
            "application/json"
          );

          console.log(`Saved RunwayML video to R2: ${savedVideoUrl}`);
          console.log(
            `Saved metadata to R2: runway_video/${sessionId}/${metadataFilename}`
          );

          // Clean up metadata after successful save
          taskMetadata.delete(taskId);
        }
      } catch (saveError) {
        console.warn(
          "Failed to save video to R2:",
          saveError.message || saveError
        );
      }
    }

    return res.json({
      id: taskId,
      status: d.status || (d.done ? "done" : "unknown"),
      done: !!(
        d.status === "SUCCEEDED" ||
        d.status === "succeeded" ||
        d.status === "completed" ||
        d.done
      ),
      outputUri: uri,
      savedVideoUrl,
      savedVideoPath,
      raw: d,
    });
  } catch (e) {
    console.error(
      "/api/video/status error",
      e?.response?.data || e.message || e
    );
    return res
      .status(500)
      .json({ error: String(e?.response?.data || e.message || e) });
  }
});
