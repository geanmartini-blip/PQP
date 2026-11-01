// Amostra do estilo (confere o cel shading antes de desenhar o resto). Uso: node tools/art/cartoon/amostra.mjs
import { blob, brilho, cel, elipse, renderizar, prancha } from './lib.mjs';

const DIR = 'tools/art/saida/amostra';
const pecas = [
  { nome: 'bolota', w: 80, h: 70, svg: cel(elipse(40, 36, 32, 28), '#e8743a') + brilho(26, 20, 6, 3) },
  { nome: 'arbusto', w: 90, h: 70, svg: cel(blob([[10, 55], [8, 35], [22, 18], [40, 10], [60, 14], [78, 28], [82, 50], [70, 62], [30, 64]]), '#4fb04a', { s: 7, l: 4 }) },
];
await renderizar(DIR, pecas);
await prancha('tools/art/saida/amostra.png', DIR, pecas.map((p) => p.nome), { zoom: 2 });
console.log('ok');
