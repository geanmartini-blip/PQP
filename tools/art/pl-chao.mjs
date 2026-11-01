// Baixa os tilesets de chão (Wang de cantos) gerados no PixelLab e grava:
// - packages/client/public/pl/chao/<lower>-<upper>.png (a folha como veio);
// - packages/client/src/art/plChao.json (para cada par, onde está cada tile e quais cantos são "upper").
// Os pares e os ids ficam na lista abaixo; o nome do terreno é o do art/plChao.ts.
// Uso: node tools/art/pl-chao.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const PARES = [
  ['54f2335f-92ba-44b0-80f4-a09a0bba6824', 'funda', 'rasa'],
  ['b15ebaa3-90d9-4733-9de0-fca5ed17b1fe', 'rasa', 'lama'],
  ['43ec83aa-1e9d-4359-b77f-3f88455089a7', 'lama', 'grama'],
  ['5867a096-d146-49f2-ba42-4c333ff01054', 'grama', 'terra'],
  ['0f4f43af-a646-47d5-964c-135f315e570a', 'grama', 'areia'],
  ['98fb889d-1aa5-4f34-bdb6-7bc850946b1b', 'rasa', 'madeira'],
  ['062b5f2c-8cfc-4e24-810a-50a1dbd74985', 'funda', 'madeira'],
  ['dc0c36ae-b5bb-4108-b529-32bc7fe7d91c', 'grama', 'madeira'],
  ['44e3245f-f110-411d-be14-345afbc3c31e', 'rasa', 'grama'],
  ['c8699f95-b4d7-46e3-9382-7d1a0ccfc896', 'rasa', 'areia'],
  ['817469a9-88d1-4751-b706-896dca547f36', 'areia', 'terra'],
  ['e2e61f08-f95e-4c3e-bdf6-5b3cd0ab2041', 'lama', 'terra'],
  ['9db0115c-7a5b-4c76-9058-20bd4ed328af', 'terra', 'madeira'],
  ['a74bc1ab-d96a-44df-8183-53e700c10c6b', 'areia', 'madeira'],
  ['343ad250-7520-41a4-ac34-8ede06e506aa', 'funda', 'areia'],
];
const API = 'https://api.pixellab.ai/mcp/tilesets';
const OUT_IMG = 'packages/client/public/pl/chao';
mkdirSync(OUT_IMG, { recursive: true });

const man = { size: 32, pares: [] };
for (const [id, lower, upper] of PARES) {
  if (!/^[0-9a-f-]{36}$/.test(id)) continue;
  const meta = await (await fetch(`${API}/${id}/metadata`)).json();
  const img = Buffer.from(await (await fetch(`${API}/${id}/image?inline=true`)).arrayBuffer());
  const file = `${lower}-${upper}.png`;
  writeFileSync(`${OUT_IMG}/${file}`, img);
  const lista = meta.tileset_data?.tiles ?? meta.tiles ?? [];
  const tiles = lista.map((t) => {
    const c = t.corners;
    const bit = (k) => (c[k] === 'upper' ? 1 : 0);
    const b = t.bounding_box;
    // bits: NW 8, NE 4, SW 2, SE 1
    return { x: b.x, y: b.y, c: bit('NW') * 8 + bit('NE') * 4 + bit('SW') * 2 + bit('SE') };
  });
  man.pares.push({ lower, upper, img: file, tiles });
  console.log(`${file}: ${tiles.length} tiles`);
}
writeFileSync('packages/client/src/art/plChao.json', JSON.stringify(man, null, 1) + '\n');
