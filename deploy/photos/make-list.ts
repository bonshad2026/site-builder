// Writes template-photos.txt: every photo the business templates use, with its download link.
//   npx tsx deploy/photos/make-list.ts
import { existsSync, writeFileSync } from 'node:fs';
import { SITE_TEMPLATES } from '../../apps/api/src/modules/platform/templates/catalog.js';

const rows = new Map<string, string>();
for (const t of SITE_TEMPLATES) for (const ref of [t.hero.image, t.about.image, ...t.products.map((p) => p.image)]) if (!rows.has(ref)) rows.set(ref, t.key);

const url = (ref: string) =>
  /^\d{9,}-[0-9a-f]+$/.test(ref) ? `https://images.unsplash.com/photo-${ref}?auto=format&fm=jpg&q=78&w=1800` : `https://unsplash.com/photos/${ref}/download?force=true&w=1800`;

const lines = ['# Template photos (Unsplash licence). Each is saved as var/demo-images/<id>.jpg', '# id\ttemplate\turl', ...[...rows].map(([ref, key]) => `${ref}\t${key}\t${url(ref)}`)];
writeFileSync(new URL('./template-photos.txt', import.meta.url), lines.join('\n') + '\n');
const have = [...rows.keys()].filter((r) => existsSync(new URL(`../../var/demo-images/${r}.jpg`, import.meta.url))).length;
console.log(`${rows.size} photos listed, ${have} already in var/demo-images`);
