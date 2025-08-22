// place files you want to import through the `$lib` alias in this folder.

/**
 * Generate a safe filename from the prompt and a random number.
 * Uses the first two words of the prompt, lowercased, joined by underscore, and appends a random 5-digit number.
 * Removes unsafe characters.
 */
export function generateImageFilename(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 2);
  let base = words
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, "");
  if (!base) base = "image";
  const rand = Math.floor(10000 + Math.random() * 90000); // 5-digit random
  return `${base}_${rand}`;
}
