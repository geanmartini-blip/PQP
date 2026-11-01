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
  ['66daec64-86f5-41c6-9349-bd52c0b944b2', 'madeira', 'parede'],
  ['5fe3ab74-5bac-4d6d-aadd-8c4564bc59fd', 'grama', 'parede'],
  ['564f4d00-ee0d-4dea-a33a-19fcf8286ce4', 'terra', 'parede'],
  // margens
  ['d804bfe7-27d0-44c1-9888-e8ff3b9e26d4', 'rasa', 'concreto'],
  ['181c2fd1-1b88-411d-b708-6d0716264be7', 'grama', 'parede_esq'],
  ['9ea5e511-01f5-4bc5-9b45-18b5461fbe74', 'asfalto', 'concreto'],
  ['310ecc07-49cd-4d9b-a843-0514e4f787f0', 'concreto', 'pisoneon'],
  ['c61d7d65-0c30-4234-a327-b154494ba6e5', 'concreto', 'parede_dir'],
  ['1d46afab-9e66-4fbb-a8a7-a57b1d982e73', 'pisoneon', 'parede_dir'],
  ['5b423d31-9530-480d-a5b1-9b49e568e9c9', 'madeira', 'parede_esq'],
  ['a21970e3-f3c1-4d66-b39a-eac5a266e38a', 'terra', 'parede_esq'],
  ['7df543fd-006e-4290-bedc-9f0eac61b0cd', 'funda', 'concreto'],
  // usina
  ['6b797261-dfcf-4d68-befa-9b4b3f5ca80b', 'grama', 'parede_dir'],
  ['fcfe826d-25a5-4162-8435-908353786b3d', 'madeira', 'parede_dir'],
  ['32b672a7-a4ba-4b57-9123-eddf3c792048', 'funda', 'grama'],
  ['8b89f87f-0247-47e5-a418-29b08525ab8c', 'grama', 'concreto'],
  ['83c8e217-7427-4c72-a4c4-e313780963be', 'concreto', 'madeira'],
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
