// Records the guide videos into docs/guide/media (kept out of Git).
// Usage: node record.mjs [scene …]   (no names = every scene in scenes/)
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startRecording } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.join(root, 'docs/guide/media');
const tmpDir = path.join(outDir, '.tmp');
mkdirSync(tmpDir, { recursive: true });

const all = readdirSync(path.join(here, 'scenes')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4));
const names = process.argv.slice(2).length ? process.argv.slice(2) : all;

for (const name of names) {
  if (!all.includes(name)) throw new Error(`No scene "${name}". Scenes: ${all.join(', ')}`);
  const scene = await import(pathToFileURL(path.join(here, 'scenes', `${name}.mjs`)).href);
  // A scene with `shots` makes screenshots (media/<name>/*.png) instead of a video.
  if (scene.shots) {
    const dir = path.join(outDir, name);
    mkdirSync(dir, { recursive: true });
    const { guide, finish } = await startRecording({ root, outDir: dir, video: false, viewport: { width: 1440, height: 860 } });
    await scene.reset?.(guide.api);
    try {
      await scene.shots(guide);
    } finally {
      await scene.reset?.(guide.api);
      await (await finish()).close();
    }
    console.log(`captured ${name} → docs/guide/media/${name}/`);
    continue;
  }
  const { guide, finish } = await startRecording({ root, outDir: tmpDir });
  await scene.reset?.(guide.api);
  try {
    await scene.play(guide);
  } finally {
    const { video, close } = await finish();
    // The studio goes back to how it was, even when the scene failed.
    await scene.reset?.(guide.api);
    await close();
    renameSync(video, path.join(outDir, `${name}.webm`));
  }
  console.log(`recorded ${name} → docs/guide/media/${name}.webm`);
}
