// Load the backend-specific env file so `node backend/index.js` picks up the
// variables in `backend/.env` regardless of the current working directory.
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const path = require("path");
const fs = require("fs");
const r2 = require("./lib/r2");

// Feature flag: enable or disable local disk storage of generated files.
// Default: disabled (false) per user request. Set ENV ENABLE_LOCAL_STORAGE=true
// to re-enable local writes during development.
const ENABLE_LOCAL_STORAGE =
  (process.env.ENABLE_LOCAL_STORAGE || "false").toLowerCase() === "true";
console.log("ENABLE_LOCAL_STORAGE:", ENABLE_LOCAL_STORAGE);

const app = express();
const port = 3000;

// Debug: log whether R2 env vars are present (don't print secrets)
console.log(
  "R2_BUCKET:",
  process.env.R2_BUCKET ? process.env.R2_BUCKET : "(missing)"
);

// Enable CORS and JSON body parsing before defining routes so all endpoints
// (including /api/gallery) have the appropriate headers and can be called
// from the frontend dev server running on a different origin.
app.use(cors({ origin: "*" }));
app.use(express.json());

// Serve generated images statically for gallery (the generated/ folder lives inside backend/)
app.use("/generated", express.static(path.join(__dirname, "generated")));

// Utility: filename generator used by multiple endpoints
function generateImageFilename(prompt) {
  const words = String(prompt || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2);
  let base = words
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, "");
  if (!base) base = "image";
  const rand = Math.floor(10000 + Math.random() * 90000); // 5-digit random
  return `${base}_${rand}.png`;
}

function generateSessionId() {
  return Date.now().toString() + "_" + Math.random().toString(36).substr(2, 9);
}

// Gallery endpoint for image sessions
app.get("/api/gallery/image-sessions", async (req, res) => {
  try {
    if (!process.env.R2_BUCKET || !process.env.R2_ENDPOINT) {
      return res.json([]);
    }

    const objects = await r2.listObjects("imagen_session/");
    const sessions = new Map();

    for (const obj of objects) {
      const pathParts = obj.Key.split("/");
      if (pathParts.length >= 2) {
        const sessionId = pathParts[1];
        const filename = pathParts[2];

        if (filename === "session.json") {
          try {
            const metadataBuffer = await r2.downloadToBuffer(obj.Key);
            const metadata = JSON.parse(metadataBuffer.toString());

            sessions.set(sessionId, {
              sessionId,
              timestamp: metadata.timestamp,
              model: metadata.model,
              prompt: metadata.prompt,
              category: `Imagen Sessions`,
              name: `${metadata.prompt.substring(0, 30)}... (${
                metadata.model
              })`,
              createdAt: metadata.timestamp,
              sessionDir: `imagen_session/${sessionId}`,
              type: "image",
            });
          } catch (e) {
            console.warn("Failed to parse session metadata:", e.message);
          }
        }
      }
    }

    const sessionArray = Array.from(sessions.values()).sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    res.json(sessionArray);
  } catch (error) {
    console.error("Error fetching image sessions:", error);
    res.status(500).json({ error: "Failed to fetch image sessions" });
  }
});

// Gallery endpoint for SD sessions
app.get("/api/gallery/sd-sessions", async (req, res) => {
  try {
    if (!process.env.R2_BUCKET || !process.env.R2_ENDPOINT) {
      return res.json([]);
    }

    const objects = await r2.listObjects("sd_session/");
    const sessions = new Map();

    for (const obj of objects) {
      const pathParts = obj.Key.split("/");
      if (pathParts.length >= 2) {
        const sessionId = pathParts[1];
        const filename = pathParts[2];

        if (filename === "session.json") {
          try {
            const metadataBuffer = await r2.downloadToBuffer(obj.Key);
            const metadata = JSON.parse(metadataBuffer.toString());

            sessions.set(sessionId, {
              sessionId,
              timestamp: metadata.timestamp,
              model: metadata.model,
              prompt: metadata.prompt,
              category: `SD Sessions`,
              name: `${metadata.prompt.substring(0, 30)}... (${
                metadata.model
              })`,
              createdAt: metadata.timestamp,
              sessionDir: `sd_session/${sessionId}`,
              type: "image",
            });
          } catch (e) {
            console.warn("Failed to parse session metadata:", e.message);
          }
        }
      }
    }

    const sessionArray = Array.from(sessions.values()).sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    res.json(sessionArray);
  } catch (error) {
    console.error("Error fetching SD sessions:", error);
    res.status(500).json({ error: "Failed to fetch SD sessions" });
  }
});

// Endpoint to get session details for images
app.get("/api/gallery/image-session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!process.env.R2_BUCKET || !process.env.R2_ENDPOINT) {
      return res.status(500).json({ error: "R2 not configured" });
    }

    // Try both imagen_session and sd_session directories
    const sessionDirs = [
      `imagen_session/${sessionId}`,
      `sd_session/${sessionId}`,
    ];

    for (const sessionDir of sessionDirs) {
      try {
        const metadataBuffer = await r2.downloadToBuffer(
          `${sessionDir}/session.json`
        );
        const metadata = JSON.parse(metadataBuffer.toString());

        // Get the image file
        const objects = await r2.listObjects(`${sessionDir}/`);
        const imageObj = objects.find(
          (obj) => obj.Key.endsWith(".png") || obj.Key.endsWith(".jpg")
        );

        let signedUrl = null;
        if (imageObj) {
          signedUrl = await r2.getSignedUrl(imageObj.Key);
        }

        res.json({
          ...metadata,
          imageUrl: signedUrl,
          sessionDir,
        });
        return;
      } catch (e) {
        // Continue to next directory
        continue;
      }
    }

    res.status(404).json({ error: "Session not found" });
  } catch (error) {
    console.error("Error fetching session details:", error);
    res.status(500).json({ error: "Failed to fetch session details" });
  }
});

// Serve image directly from session with redirect to signed URL
app.get("/api/gallery/image-session/:sessionId/image", async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!process.env.R2_BUCKET || !process.env.R2_ENDPOINT) {
      return res.status(500).json({ error: "R2 not configured" });
    }

    // Try both imagen_session and sd_session directories
    const sessionDirs = [
      `imagen_session/${sessionId}`,
      `sd_session/${sessionId}`,
    ];

    for (const sessionDir of sessionDirs) {
      try {
        // Get the image file from session directory
        const objects = await r2.listObjects(`${sessionDir}/`);
        const imageObj = objects.find(
          (obj) =>
            obj.Key.endsWith(".png") ||
            obj.Key.endsWith(".jpg") ||
            obj.Key.endsWith(".jpeg") ||
            obj.Key.endsWith(".webp")
        );

        if (imageObj) {
          const signedUrl = await r2.getSignedUrl(imageObj.Key, 900); // 15 minutes
          return res.redirect(signedUrl);
        }
      } catch (e) {
        // Continue to next directory
        continue;
      }
    }

    res.status(404).json({ error: "Image not found" });
  } catch (error) {
    console.error("Error serving image from session:", error);
    res.status(500).json({ error: "Failed to serve image" });
  }
});

// Delete image session endpoint
app.delete("/api/gallery/image-session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!process.env.R2_BUCKET || !process.env.R2_ENDPOINT) {
      return res.status(500).json({ error: "R2 not configured" });
    }

    // Try both imagen_session and sd_session directories
    const sessionDirs = [
      `imagen_session/${sessionId}`,
      `sd_session/${sessionId}`,
    ];
    let deleted = false;

    for (const sessionDir of sessionDirs) {
      try {
        const objects = await r2.listObjects(`${sessionDir}/`);

        // Delete all objects in the session directory
        for (const obj of objects) {
          await r2.deleteObject(obj.Key);
        }

        deleted = true;
        break;
      } catch (e) {
        // Continue to next directory
        continue;
      }
    }

    if (deleted) {
      res.json({ success: true, message: "Session deleted successfully" });
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  } catch (error) {
    console.error("Error deleting session:", error);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

// Gallery endpoint for images
app.get("/api/gallery/images", async (req, res) => {
  // Category mapping
  const categories = [
    { category: "Imagen 4 Fast", dir: "generated/imagen/fast" },
    { category: "Imagen 4", dir: "generated/imagen/4" },
    // Local disk uses `4_ultra`, but some R2 uploads use `imagen/ultra` as the
    // prefix. Keep both entries (same category name) so images from either
    // location are collected into the same gallery category.
    { category: "Imagen 4 Ultra", dir: "generated/imagen/4_ultra" },
    { category: "Imagen 4 Ultra", dir: "generated/imagen/ultra" },
    { category: "SD XL", dir: "generated/sd/xl" },
    { category: "Stable Core", dir: "generated/sd/core" },
    { category: "Stable Ultra", dir: "generated/sd/ultra" },
  ];
  // If R2 is configured, list objects from R2 bucket instead of local disk
  const useR2 = !!(
    process.env.R2_BUCKET &&
    (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
  );
  (async () => {
    try {
      if (useR2) {
        const images = [];
        for (const { category, dir } of categories) {
          // dir like 'generated/imagen/fast' -> prefix 'imagen/fast/'
          const prefix =
            dir.replace(/^generated\//, "") + (dir.endsWith("/") ? "" : "/");
          try {
            const items = await r2.listObjects(prefix);
            for (const it of items) {
              if (!it.Key.match(/\.(png|jpg|jpeg|webp)$/i)) continue;
              const name = path.basename(it.Key);
              // Use signed URLs if helper supports it
              let thumbUrl = r2.getObjectPublicUrl(it.Key);
              let fullUrl = thumbUrl;
              try {
                const expires = parseInt(
                  process.env.R2_SIGNED_EXPIRES || "900",
                  10
                );
                if (typeof r2.getSignedUrl === "function") {
                  const signed = await r2.getSignedUrl(it.Key, expires);
                  thumbUrl = signed;
                  fullUrl = signed;
                }
              } catch (e) {
                // fall back to public URL
                console.warn(
                  "r2.getSignedUrl failed",
                  e && e.message ? e.message : e
                );
              }
              images.push({ name, category, thumbUrl, fullUrl });
            }
          } catch (e) {
            // ignore prefix errors per-category
            console.warn("R2 listObjects error for prefix", prefix, e.message);
          }
        }
        return res.json(images);
      }

      // Fallback to local disk
      let images = [];
      for (const { category, dir } of categories) {
        try {
          // Resolve directory relative to this backend folder (match static serving path)
          const absDir = path.join(__dirname, dir);
          const files = fs.existsSync(absDir) ? fs.readdirSync(absDir) : [];
          for (const file of files) {
            if (!file.match(/\.(png|jpg|jpeg|webp)$/i)) continue;
            images.push({
              name: file,
              category,
              // URLs served by express.static are rooted at /generated
              thumbUrl: `/${dir}/${file}`,
              fullUrl: `/${dir}/${file}`,
            });
          }
        } catch (e) {
          // ignore missing dirs
        }
      }
      res.json(images);
    } catch (err) {
      console.error("/api/gallery error", err);
      res.status(500).json({ error: String(err) });
    }
  })();
});

// Video Gallery API endpoint: returns all videos grouped by model
app.get("/api/gallery/videos", (req, res) => {
  const useR2 = !!(
    process.env.R2_BUCKET &&
    (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
  );

  (async () => {
    try {
      if (!useR2) {
        return res.json([]); // No local video storage, only R2
      }

      const videos = [];

      // Check new structure: runway_video/{sessionId}/
      try {
        const newItems = await r2.listObjects("runway_video/");

        // Group by session and parse metadata
        const sessions = new Map();

        for (const it of newItems) {
          if (it.Key.match(/\/metadata_.*\.json$/)) {
            // Parse metadata file to get video info
            try {
              const metadataBuffer = await r2.downloadToBuffer(it.Key);
              const metadata = JSON.parse(metadataBuffer.toString());
              sessions.set(metadata.sessionId, {
                ...metadata,
                metadataKey: it.Key,
              });
            } catch (e) {
              console.warn("Failed to parse metadata", it.Key, e.message);
            }
          }
        }

        // Find corresponding video files in new structure
        for (const it of newItems) {
          if (it.Key.match(/\/video_.*\.mp4$/)) {
            const sessionId = it.Key.split("/")[1]; // runway_video/{sessionId}/video_...
            const session = sessions.get(sessionId);

            if (session) {
              const name = path.basename(it.Key);
              let thumbUrl = r2.getObjectPublicUrl(it.Key);
              let fullUrl = thumbUrl;

              // Get signed URLs for videos
              try {
                const expires = parseInt(
                  process.env.R2_SIGNED_EXPIRES || "900",
                  10
                );
                if (typeof r2.getSignedUrl === "function") {
                  const signed = await r2.getSignedUrl(it.Key, expires);
                  thumbUrl = signed;
                  fullUrl = signed;
                }
              } catch (e) {
                console.warn("r2.getSignedUrl failed for video", e.message);
              }

              // Map model to category
              const modelMap = {
                gen3a_turbo: "RunwayML Gen3 Turbo",
                gen4_turbo: "RunwayML Gen4 Turbo",
                gen4_aleph: "RunwayML Gen4 Aleph",
              };

              videos.push({
                name,
                category:
                  modelMap[session.model] || `RunwayML ${session.model}`,
                model: session.model,
                thumbUrl,
                fullUrl,
                videoUrl: fullUrl,
                sessionId: session.sessionId,
                taskId: session.taskId,
                promptText: session.promptText || "",
                inputImagePath: session.inputImagePath,
                createdAt: session.createdAt,
                completedAt: session.completedAt,
                type: "video",
              });
            }
          }
        }
      } catch (e) {
        console.warn("Failed to list runway_video/ objects:", e.message);
      }

      // Check old structure: runwayml/{model}/
      try {
        const oldItems = await r2.listObjects("runwayml/");

        for (const it of oldItems) {
          if (it.Key.match(/\.mp4$/)) {
            // Extract model from path: runwayml/{model}/video_...
            const pathParts = it.Key.split("/");
            const model = pathParts[1]; // runwayml/{model}/file

            if (model) {
              const name = path.basename(it.Key);
              let thumbUrl = r2.getObjectPublicUrl(it.Key);
              let fullUrl = thumbUrl;

              // Get signed URLs for videos
              try {
                const expires = parseInt(
                  process.env.R2_SIGNED_EXPIRES || "900",
                  10
                );
                if (typeof r2.getSignedUrl === "function") {
                  const signed = await r2.getSignedUrl(it.Key, expires);
                  thumbUrl = signed;
                  fullUrl = signed;
                }
              } catch (e) {
                console.warn(
                  "r2.getSignedUrl failed for old structure video",
                  e.message
                );
              }

              // Map model to category (legacy runwayml/ structure). Add gen4
              // display names and remove gen3a_aleph which is no longer used.
              const modelMap = {
                gen3a_turbo: "RunwayML Gen3 Turbo",
                gen4_turbo: "RunwayML Gen4 Turbo",
                gen4_aleph: "RunwayML Gen4 Aleph",
              };

              // Extract timestamp from filename for created date
              const timestampMatch = name.match(/_(\d+)\.mp4$/);
              const createdAt = timestampMatch
                ? parseInt(timestampMatch[1])
                : Date.now();

              videos.push({
                name,
                category: modelMap[model] || `RunwayML ${model}`,
                model: model,
                thumbUrl,
                fullUrl,
                videoUrl: fullUrl,
                sessionId: `legacy_${it.Key.replace(/[^a-zA-Z0-9]/g, "_")}`,
                taskId: name.replace(/^video_/, "").replace(/_\d+\.mp4$/, ""),
                promptText: "Legacy video (no metadata available)",
                inputImagePath: null,
                createdAt: createdAt,
                completedAt: createdAt,
                type: "video",
              });
            }
          }
        }
      } catch (e) {
        console.warn("Failed to list runwayml/ objects:", e.message);
      }

      // Sort by completion time (newest first)
      videos.sort(
        (a, b) =>
          (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt)
      );

      res.json(videos);
    } catch (err) {
      console.error("/api/gallery/videos error", err);
      res.status(500).json({ error: String(err) });
    }
  })();
});

// Delete image endpoint
app.delete("/api/gallery/image/:key(*)", async (req, res) => {
  try {
    const key = req.params.key;
    if (!key) return res.status(400).json({ error: "missing key" });

    const useR2 = !!(
      process.env.R2_BUCKET &&
      (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
    );

    if (useR2) {
      await r2.deleteObject(key);
      res.json({ success: true, message: "Image deleted" });
    } else {
      if (!ENABLE_LOCAL_STORAGE) {
        return res.status(400).json({ error: "Local storage is disabled" });
      }
      const filePath = path.join(__dirname, key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true, message: "Image deleted" });
      } else {
        res.status(404).json({ error: "Image not found" });
      }
    }
  } catch (err) {
    console.error("Delete image error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// Get video session data endpoint
app.get("/api/gallery/video/:sessionId/session", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionKey = `runway_video/${sessionId}/session.json`;
    // Try multiple possible metadata keys. Runway saving code uses
    // metadata_{taskId}.json under runway_video/{sessionId}/ but older code
    // may have used session.json. Also support legacy session ids prefixed
    // with "legacy_" which map to older paths.

    const candidateKeys = [];

    // Direct session.json
    candidateKeys.push(`runway_video/${sessionId}/session.json`);

    // metadata_*.json pattern (we'll attempt to list objects if necessary)
    candidateKeys.push(`runway_video/${sessionId}/metadata_`); // prefix marker

    // Also try as a fallback the legacy mapping where sessionId may be a
    // legacy encoded path (the code that lists legacy video entries uses
    // legacy_{sanitized_path} as sessionId). Try to detect and map back.
    if (sessionId.startsWith("legacy_")) {
      // Reconstruct a possible old path by removing the prefix and
      // replacing underscores with slashes in a best-effort way. This may not
      // exactly match every legacy key but helps recover some entries.
      const recovered = sessionId.replace(/^legacy_/, "").replace(/_/g, "/");
      candidateKeys.push(`runwayml/${recovered}/metadata_${sessionId}.json`);
    }

    let metadata = null;

    // First attempt direct keys
    for (const key of candidateKeys) {
      try {
        // If key ends with the metadata_ marker, we need to list objects in
        // that prefix and pick the first metadata_*.json file.
        if (key.endsWith("metadata_")) {
          const items = await r2.listObjects(`runway_video/${sessionId}/`);
          const metaObj = items.find((it) => /metadata_.*\.json$/.test(it.Key));
          if (metaObj) {
            const buf = await r2.downloadToBuffer(metaObj.Key);
            metadata = JSON.parse(buf.toString());
            break;
          }
          // continue to next candidate
          continue;
        }

        const buf = await r2.downloadToBuffer(key);
        if (buf) {
          metadata = JSON.parse(buf.toString());
          break;
        }
      } catch (e) {
        // Expected: object may not exist. Only warn for unexpected errors.
        if (e && e.Code === "NoSuchKey") {
          // skip to next candidate silently
          continue;
        }
        console.warn(
          "Unexpected error reading video session metadata:",
          e && e.message ? e.message : e
        );
        continue;
      }
    }

    if (metadata) {
      // Try to find an associated video file in the session directory so the
      // frontend can play it. Prefer server-proxied streaming to avoid CORS
      // and MIME issues in the browser.
      try {
        const r2 = require("./lib/r2");
        // Support legacy mapping where sessionId encodes a path
        const sessionPrefix = sessionId.startsWith("legacy_")
          ? sessionId.replace("legacy_", "").replace(/_/g, "/")
          : `runway_video/${sessionId}/`;

        const objects = await r2.listObjects(sessionPrefix);
        const videoObj = objects.find(
          (obj) =>
            obj.Key.endsWith(".mp4") ||
            obj.Key.endsWith(".mov") ||
            obj.Key.endsWith(".webm")
        );

        if (videoObj) {
          try {
            const expires = parseInt(
              process.env.R2_SIGNED_EXPIRES || "900",
              10
            );
            // Create a signed URL for the raw object and point the frontend at
            // our proxy endpoint which will stream it with proper headers.
            const signed = await r2.getSignedUrl(videoObj.Key, expires);
            // Use a relative proxy path so frontend will resolve against backend
            // and we won't leak signed URL directly to the client.
            metadata.videoUrl = `/api/video/proxy?url=${encodeURIComponent(
              signed
            )}`;
            // Also expose the signed URL for debugging if necessary
            metadata._signedVideoUrl = signed;
          } catch (e) {
            console.warn(
              "Failed to create signed URL for video:",
              e && e.message ? e.message : e
            );
          }
        }
      } catch (e) {
        console.warn(
          "Failed to attach playable video URL to metadata:",
          e && e.message ? e.message : e
        );
      }

      res.json(metadata);
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  } catch (error) {
    console.error(
      "Error fetching session data:",
      error && error.message ? error.message : error
    );
    res.status(500).json({ error: "Failed to fetch session data" });
  }
});

// Serve video directly from session with redirect to signed URL
app.get("/api/gallery/video/:sessionId/video", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionDir = `runway_video/${sessionId}`;

    if (!process.env.R2_BUCKET || !process.env.R2_ENDPOINT) {
      return res.status(500).json({ error: "R2 not configured" });
    }

    try {
      // Get the video file from session directory
      const objects = await r2.listObjects(`${sessionDir}/`);
      const videoObj = objects.find(
        (obj) =>
          obj.Key.endsWith(".mp4") ||
          obj.Key.endsWith(".mov") ||
          obj.Key.endsWith(".webm")
      );

      if (videoObj) {
        const signedUrl = await r2.getSignedUrl(videoObj.Key, 900); // 15 minutes
        return res.redirect(signedUrl);
      } else {
        res.status(404).json({ error: "Video not found" });
      }
    } catch (e) {
      res.status(404).json({ error: "Video session not found" });
    }
  } catch (error) {
    console.error("Error serving video from session:", error);
    res.status(500).json({ error: "Failed to serve video" });
  }
});

// Get image sessions endpoint
app.get("/api/gallery/image-sessions", async (req, res) => {
  try {
    let imageSessions = [];

    // Get Imagen sessions
    try {
      const imagenObjects = await r2.listObjects("imagen_session/");
      const imagenSessions = imagenObjects
        .filter((obj) => obj.Key.endsWith("/session.json"))
        .map((obj) => {
          const sessionId = obj.Key.split("/")[1];
          return {
            sessionId,
            key: obj.Key,
            lastModified: obj.LastModified,
            type: "imagen",
          };
        });
      imageSessions = imageSessions.concat(imagenSessions);
    } catch (error) {
      console.warn("No imagen sessions found:", error.message);
    }

    // Get SD sessions
    try {
      const sdObjects = await r2.listObjects("sd_session/");
      const sdSessions = sdObjects
        .filter((obj) => obj.Key.endsWith("/session.json"))
        .map((obj) => {
          const sessionId = obj.Key.split("/")[1];
          return {
            sessionId,
            key: obj.Key,
            lastModified: obj.LastModified,
            type: "sd",
          };
        });
      imageSessions = imageSessions.concat(sdSessions);
    } catch (error) {
      console.warn("No SD sessions found:", error.message);
    }

    // Sort by lastModified (newest first)
    imageSessions.sort(
      (a, b) => new Date(b.lastModified) - new Date(a.lastModified)
    );

    res.json(imageSessions);
  } catch (error) {
    console.error("Error listing image sessions:", error);
    res.status(500).json({ error: "Failed to list image sessions" });
  }
});

// Get image session data endpoint
app.get("/api/gallery/image/:sessionId/session", async (req, res) => {
  try {
    const { sessionId } = req.params;
    let sessionData = null;

    // Try imagen sessions first
    try {
      const imagenSessionKey = `imagen_session/${sessionId}/session.json`;
      sessionData = await r2.downloadToBuffer(imagenSessionKey);
    } catch (error) {
      // Try SD sessions if imagen session not found
      try {
        const sdSessionKey = `sd_session/${sessionId}/session.json`;
        sessionData = await r2.downloadToBuffer(sdSessionKey);
      } catch (sdError) {
        console.warn("Session not found in either imagen or sd sessions");
      }
    }

    if (sessionData) {
      const metadata = JSON.parse(sessionData.toString());
      res.json(metadata);
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  } catch (error) {
    console.error("Error fetching image session data:", error);
    res.status(500).json({ error: "Failed to fetch session data" });
  }
});

// Delete video endpoint
app.delete("/api/gallery/video/:sessionId", async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) return res.status(400).json({ error: "missing sessionId" });

    const useR2 = !!(
      process.env.R2_BUCKET &&
      (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
    );

    if (!useR2) {
      return res.status(400).json({ error: "R2 not configured" });
    }

    // Delete all files in the session directory
    const sessionPrefix = sessionId.startsWith("legacy_")
      ? sessionId.replace("legacy_", "").replace(/_/g, "/")
      : `runway_video/${sessionId}/`;

    const items = await r2.listObjects(sessionPrefix);
    for (const item of items) {
      await r2.deleteObject(item.Key);
    }

    res.json({ success: true, message: "Video session deleted" });
  } catch (err) {
    console.error("Delete video error:", err);
    res.status(500).json({ error: String(err) });
  }
});

const axios = require("axios");
const FormData = require("form-data");

// For parsing multipart/form-data
const multer = require("multer");
const upload = multer();
// Mount video routes
const videoRoutes = require("./routes/video");
app.use("/api/video", videoRoutes);

app.post("/api/generate", async (req, res) => {
  try {
    const {
      prompt,
      model,
      numberOfImages,
      sampleImageSize,
      aspectRatio,
      personGeneration,
    } = req.body;

    // Validate prompt early to return a clear error to the client instead of
    // letting the downstream SDK throw a generic ApiError.
    if (!prompt || !String(prompt).trim()) {
      return res
        .status(400)
        .json({ error: { code: 400, message: "Prompt text is required" } });
    }

    const ai = new GoogleGenAI(process.env.GOOGLE_API_KEY);

    const modelMapping = {
      "Imagen 4": "imagen-4.0-generate-001",
      "Imagen 4 Ultra": "imagen-4.0-ultra-generate-001",
      "Imagen 4 Fast": "imagen-4.0-fast-generate-001",
    };

    // Directory mapping
    function getOutputDir(model) {
      if (model === "Imagen 4 Fast") return "generated/imagen/fast";
      if (model === "Imagen 4") return "generated/imagen/4";
      if (model === "Imagen 4 Ultra") return "generated/imagen/4_ultra";
      return "generated/other";
    }

    // Use top-level generateImageFilename(prompt)

    const response = await ai.models.generateImages({
      model: modelMapping[model],
      prompt: prompt,
      config: {
        numberOfImages: numberOfImages,
      },
    });

    const generatedImage = response.generatedImages[0];
    const imgBytes = generatedImage.image.imageBytes;
    const buffer = Buffer.from(imgBytes, "base64");

    // Generate session ID for this image
    const sessionId = generateSessionId();

    // Save to disk (guarded by ENABLE_LOCAL_STORAGE)
    const dir = getOutputDir(model);
    const filename = generateImageFilename(prompt);
    const filepath = `${dir}/${filename}`;
    let imageUrl = `data:image/png;base64,${buffer.toString("base64")}`;
    let savedPath = null;
    if (ENABLE_LOCAL_STORAGE) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filepath, buffer);
      savedPath = filepath;
    }
    // Try to upload to R2 (best-effort)
    let savedR2Url = null;
    try {
      if (
        process.env.R2_BUCKET &&
        (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
      ) {
        // Use model-specific R2 prefixes so Imagen outputs are grouped by model
        let r2Prefix = "imagen/other";
        if (model === "Imagen 4 Fast") r2Prefix = "imagen/fast";
        else if (model === "Imagen 4") r2Prefix = "imagen/4";
        else if (model === "Imagen 4 Ultra") r2Prefix = "imagen/ultra";
        const key = `${r2Prefix}/${filename}`;
        savedR2Url = await r2.uploadBuffer(buffer, key, "image/png");

        // Save session metadata to R2
        const sessionDir = `imagen_session/${sessionId}`;
        const sessionMetadata = {
          sessionId,
          timestamp: new Date().toISOString(),
          model,
          prompt,
          numberOfImages,
          sampleImageSize,
          aspectRatio,
          personGeneration,
          imageKey: key,
          imageFilename: filename,
        };

        // Upload session metadata
        await r2.uploadBuffer(
          Buffer.from(JSON.stringify(sessionMetadata, null, 2)),
          `${sessionDir}/session.json`,
          "application/json"
        );

        // Upload original image to session directory
        await r2.uploadBuffer(buffer, `${sessionDir}/${filename}`, "image/png");
      }
    } catch (e) {
      console.warn("R2 upload failed for imagen", e.message || e);
    }

    res.json({ imageUrl, savedPath, savedR2Url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate image" });
  }
});

// SD Core endpoint
app.post("/api/sd/core", upload.none(), async (req, res) => {
  try {
    const {
      prompt,
      aspect_ratio,
      negative_prompt,
      seed,
      style_preset,
      output_format,
    } = req.body;

    const payload = {
      prompt,
      ...(aspect_ratio && { aspect_ratio }),
      ...(negative_prompt && { negative_prompt }),
      ...(seed && { seed }),
      ...(style_preset && { style_preset }),
      ...(output_format && { output_format }),
    };

    const form = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      form.append(key, value);
    });

    const response = await axios.post(
      "https://api.stability.ai/v2beta/stable-image/generate/core",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
          Accept: "image/*",
        },
        responseType: "arraybuffer",
      }
    );

    if (response.status === 200) {
      const base64 = Buffer.from(response.data).toString("base64");

      // Generate session ID for this image
      const sessionId = generateSessionId();

      // Save to disk (guarded by ENABLE_LOCAL_STORAGE)
      const dir = "generated/sd/core";
      const filename = generateImageFilename(req.body.prompt || "image");
      const filepath = `${dir}/${filename}`;
      let savedPath = null;
      if (ENABLE_LOCAL_STORAGE) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filepath, Buffer.from(base64, "base64"));
        savedPath = filepath;
      }

      // upload to R2 (best-effort)
      let savedR2Url = null;
      try {
        if (
          process.env.R2_BUCKET &&
          (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
        ) {
          const key = `sd/core/${filename}`;
          savedR2Url = await r2.uploadBuffer(
            Buffer.from(base64, "base64"),
            key,
            "image/png"
          );

          // Save session metadata to R2
          const sessionDir = `sd_session/${sessionId}`;
          const sessionMetadata = {
            sessionId,
            timestamp: new Date().toISOString(),
            model: "SD Core",
            prompt: req.body.prompt,
            aspect_ratio,
            negative_prompt,
            seed,
            style_preset,
            output_format,
            imageKey: key,
            imageFilename: filename,
          };

          // Upload session metadata
          await r2.uploadBuffer(
            Buffer.from(JSON.stringify(sessionMetadata, null, 2)),
            `${sessionDir}/session.json`,
            "application/json"
          );

          // Upload original image to session directory
          await r2.uploadBuffer(
            Buffer.from(base64, "base64"),
            `${sessionDir}/${filename}`,
            "image/png"
          );
        }
      } catch (e) {
        console.warn("R2 upload failed for sd core", e.message || e);
      }
      res.json({ image: base64, savedPath, savedR2Url });
    } else {
      res.status(response.status).json({ error: response.data.toString() });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SD Ultra endpoint
app.post("/api/sd/ultra", upload.single("image"), async (req, res) => {
  try {
    // Debug: log incoming body and file
    console.log("/api/sd/ultra req.body:", req.body);
    if (req.file) {
      console.log(
        "/api/sd/ultra req.file:",
        req.file.originalname,
        req.file.mimetype,
        req.file.size
      );
    }
    const {
      prompt,
      aspect_ratio,
      negative_prompt,
      seed,
      style_preset,
      output_format,
      strength,
    } = req.body;
    const form = new FormData();
    form.append("prompt", prompt);
    if (aspect_ratio) form.append("aspect_ratio", aspect_ratio);
    if (negative_prompt) form.append("negative_prompt", negative_prompt);
    if (seed) form.append("seed", seed);
    if (style_preset) form.append("style_preset", style_preset);
    if (output_format) form.append("output_format", output_format);
    if (strength) form.append("strength", strength);
    if (req.file) {
      form.append("image", req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });
    }

    const response = await axios.post(
      "https://api.stability.ai/v2beta/stable-image/generate/ultra",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
          Accept: "image/*",
        },
        responseType: "arraybuffer",
      }
    );

    // Debug: log response headers and first 200 bytes
    console.log(
      "/api/sd/ultra Stability API response headers:",
      response.headers
    );
    if (response.data && Buffer.isBuffer(response.data)) {
      console.log(
        "/api/sd/ultra Stability API response (buffer, first 100 bytes):",
        response.data.slice(0, 100)
      );
    }

    if (response.status === 200) {
      const base64 = Buffer.from(response.data).toString("base64");

      // Generate session ID for this image
      const sessionId = generateSessionId();

      // Save to disk (guarded by ENABLE_LOCAL_STORAGE)
      const dir = "generated/sd/ultra";
      const filename = generateImageFilename(req.body.prompt || "image");
      const filepath = `${dir}/${filename}`;
      let savedPath = null;
      if (ENABLE_LOCAL_STORAGE) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filepath, Buffer.from(base64, "base64"));
        savedPath = filepath;
      }

      let savedR2Url = null;
      try {
        if (
          process.env.R2_BUCKET &&
          (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
        ) {
          const key = `sd/ultra/${filename}`;
          savedR2Url = await r2.uploadBuffer(
            Buffer.from(base64, "base64"),
            key,
            "image/png"
          );

          // Save session metadata to R2
          const sessionDir = `sd_session/${sessionId}`;
          const sessionMetadata = {
            sessionId,
            timestamp: new Date().toISOString(),
            model: "SD Ultra",
            prompt: req.body.prompt,
            aspect_ratio,
            negative_prompt,
            seed,
            style_preset,
            output_format,
            strength,
            imageKey: key,
            imageFilename: filename,
          };

          // Upload session metadata
          await r2.uploadBuffer(
            Buffer.from(JSON.stringify(sessionMetadata, null, 2)),
            `${sessionDir}/session.json`,
            "application/json"
          );

          // Upload original image to session directory
          await r2.uploadBuffer(
            Buffer.from(base64, "base64"),
            `${sessionDir}/${filename}`,
            "image/png"
          );
        }
      } catch (e) {
        console.warn("R2 upload failed for sd ultra", e.message || e);
      }
      res.json({ image: base64, savedPath, savedR2Url });
    } else {
      res.status(response.status).json({ error: response.data.toString() });
    }
  } catch (error) {
    if (
      error.response &&
      error.response.data &&
      Buffer.isBuffer(error.response.data)
    ) {
      const decoded = error.response.data.toString("utf8");
      console.error("/api/sd/ultra error (decoded):", decoded);
      res.status(500).json({ error: decoded });
    } else {
      console.error("/api/sd/ultra error:", error);
      res.status(500).json({ error: error.message });
    }
  }
});

// SD XL endpoint
app.post("/api/sd/xl", async (req, res) => {
  try {
    // Debug: log incoming body
    console.log("/api/sd/xl req.body:", req.body);
    const {
      text_prompts,
      height,
      width,
      cfg_scale,
      clip_guidance_preset,
      sampler,
      samples,
      seed,
      steps,
      style_preset,
      extras,
    } = req.body;

    // Always send samples as an integer >= 1, default to 1
    let safeSamples = 1;
    if (samples && !isNaN(Number(samples))) {
      safeSamples = Math.max(1, parseInt(samples));
    }

    const payload = {
      text_prompts,
      ...(height && { height }),
      ...(width && { width }),
      ...(cfg_scale && { cfg_scale }),
      ...(clip_guidance_preset && { clip_guidance_preset }),
      ...(sampler && { sampler }),
      samples: safeSamples,
      ...(seed && { seed }),
      ...(steps && { steps }),
      ...(style_preset && { style_preset }),
      ...(extras && { extras }),
    };

    const response = await axios.post(
      "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        },
      }
    );

    // Debug: log response headers and first 200 chars of data
    console.log("/api/sd/xl Stability API response headers:", response.headers);
    if (typeof response.data === "string") {
      console.log(
        "/api/sd/xl Stability API response (string):",
        response.data.slice(0, 200)
      );
    } else {
      console.log(
        "/api/sd/xl Stability API response (object):",
        JSON.stringify(response.data).slice(0, 200)
      );
    }

    if (response.status === 200) {
      // Return the base64 image(s) in the same format as the other endpoints
      const images = (response.data.artifacts || []).map((img) => img.base64);

      // Generate session ID for this batch of images
      const sessionId = generateSessionId();

      // Save all images (guarded by ENABLE_LOCAL_STORAGE)
      const dir = "generated/sd/xl";
      let savedPaths = [];
      if (ENABLE_LOCAL_STORAGE) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      const prompt =
        (req.body.text_prompts &&
          req.body.text_prompts[0] &&
          req.body.text_prompts[0].text) ||
        "image";

      const imageKeys = [];
      const imageFilenames = [];

      for (let i = 0; i < images.length; i++) {
        const base64 = images[i];
        const filename = generateImageFilename(prompt);
        const filepath = `${dir}/${filename}`;
        if (ENABLE_LOCAL_STORAGE) {
          fs.writeFileSync(filepath, Buffer.from(base64, "base64"));
          savedPaths.push(filepath);
        }

        // Upload to R2 for each image
        try {
          if (
            process.env.R2_BUCKET &&
            (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
          ) {
            const key = `sd/xl/${filename}`;
            await r2.uploadBuffer(
              Buffer.from(base64, "base64"),
              key,
              "image/png"
            );
            imageKeys.push(key);
            imageFilenames.push(filename);

            // Also upload to session directory
            const sessionDir = `sd_session/${sessionId}`;
            await r2.uploadBuffer(
              Buffer.from(base64, "base64"),
              `${sessionDir}/${filename}`,
              "image/png"
            );
          }
        } catch (e) {
          console.warn("R2 upload failed for sd xl", e.message || e);
        }
      }

      // Save session metadata to R2 (after all images are processed)
      try {
        if (
          process.env.R2_BUCKET &&
          (process.env.R2_ENDPOINT || process.env.R2_BASE_URL)
        ) {
          const sessionDir = `sd_session/${sessionId}`;
          const sessionMetadata = {
            sessionId,
            timestamp: new Date().toISOString(),
            model: "SD XL",
            text_prompts,
            height,
            width,
            cfg_scale,
            clip_guidance_preset,
            sampler,
            samples: safeSamples,
            seed,
            steps,
            style_preset,
            extras,
            imageKeys,
            imageFilenames,
            imageCount: images.length,
          };

          // Upload session metadata
          await r2.uploadBuffer(
            Buffer.from(JSON.stringify(sessionMetadata, null, 2)),
            `${sessionDir}/session.json`,
            "application/json"
          );
        }
      } catch (e) {
        console.warn(
          "R2 session metadata upload failed for sd xl",
          e.message || e
        );
      }

      res.json({ images, savedPaths });
    } else {
      res.status(response.status).json({ error: response.data });
    }
    // Use top-level generateImageFilename(prompt)
  } catch (error) {
    console.error("/api/sd/xl error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
