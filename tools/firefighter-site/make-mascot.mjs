// Generates the Atashyar mascot (a salamander firefighter) with a GapGPT image model; run inside the
// studio-api container (it has GAPGPT_API_KEY): node make-mascot.mjs [model=gpt-image-2] [count=1]. Saves /tmp/atashyar-*.png.
// The chosen result is tools/firefighter-site/atashyar-mascot.png.
import { writeFileSync } from 'node:fs';
const model = process.argv[2] || 'gpt-image-2';
const prompt = [
  'A cute, friendly cartoon mascot: a baby fire salamander character named Atashyar, the mascot of a fire-safety training website.',
  'Smooth, clean orange skin with a few soft golden-yellow spots, a creamy yellow belly, big round shiny dark eyes, rosy cheeks, a warm confident smile.',
  'Wearing a glossy yellow firefighter helmet with a small red shield badge showing a flame, and a tiny red firefighter jacket with reflective yellow stripes.',
  'Waving one hand, standing upright, full body, curled tail. Polished 3D animated-film style, soft studio lighting, appealing and adorable, not slimy, not scary, not realistic.',
  'Plain warm cream background, centered, generous space around the character so it fits inside a circle. No text, no letters, no logo.',
].join(' ');
for (let n = 1; n <= Number(process.argv[3] || 1); n++) {
  const res = await fetch(`${process.env.GAPGPT_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.GAPGPT_API_KEY}` },
    body: JSON.stringify({ model, prompt, size: '1024x1024', n: 1 }),
    signal: AbortSignal.timeout(240_000),
  });
  const j = await res.json().catch(() => ({}));
  const item = j.data?.[0];
  if (!res.ok || !item) {
    console.log(`#${n} failed: HTTP ${res.status} ${JSON.stringify(j).slice(0, 300)}`);
    continue;
  }
  const bytes = item.b64_json ? Buffer.from(item.b64_json, 'base64') : Buffer.from(await (await fetch(item.url)).arrayBuffer());
  writeFileSync(`/tmp/atashyar-${model.replace(/\W+/g, '-')}-${n}.png`, bytes);
  console.log(`#${n} saved ${bytes.length} bytes`);
}
