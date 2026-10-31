/**
 * Esqueleto do boneco 32x48 (cabeça grande, ~2,5 cabeças): posições de cabeça, tronco, braços,
 * pernas e pés para cada vista (frente, lado, costas) e pose. Tudo puro.
 *
 * Grade de outfits.gradeBoneco: cabeça 0-19, tronco 20-33, pernas 34-43, pés 44-47. O boneco fica
 * 1 px acima da última linha para o contorno de baixo caber no quadro.
 * A vista de lado é desenhada olhando para a esquerda; a direção 3 é o espelho da 1.
 */

export type View = 'front' | 'side' | 'back';

export interface Pt {
  x: number;
  y: number;
}

export interface Limb {
  a: Pt;
  b: Pt;
  w: number;
}

export type ArmPose = 'rest' | 'swingF' | 'swingB' | 'up' | 'forward' | 'wind' | 'out' | 'cross' | 'down' | 'hip';
export type Expression = 'neutro' | 'briga' | 'vitoria' | 'derrota';

export interface Pose {
  /** deslocamento vertical do tronco e da cabeça (negativo = sobe) */
  bob: number;
  /** o boneco inteiro sobe (pulo) */
  jump: number;
  /** tronco desce e as pernas dobram (derrota) */
  crouch: number;
  /** quanto cada pé sobe (andando) */
  liftA: number;
  liftB: number;
  /** balanço das pernas de lado: -1 a 1 (pé A para a frente quando positivo) */
  stride: number;
  armMain: ArmPose;
  armOff: ArmPose;
  /** deslocamento lateral da cabeça (derrota) */
  headTilt: number;
  expression: Expression;
  /** 0..1: brilho do efeito nas mãos (habilidade) */
  glow: number;
  /** aura no chão (especial) 0..1 */
  aura: number;
  /** sentado (cadeira de escritório) */
  seated: boolean;
  /** quadro e animação (para efeitos que piscam) */
  frame: number;
  anim: string;
}

export const REST_POSE: Pose = {
  bob: 0,
  jump: 0,
  crouch: 0,
  liftA: 0,
  liftB: 0,
  stride: 0,
  armMain: 'rest',
  armOff: 'rest',
  headTilt: 0,
  expression: 'neutro',
  glow: 0,
  aura: 0,
  seated: false,
  frame: 0,
  anim: 'parado',
};

export interface BodySpec {
  /** offsetCabecaPx de appearance.corpos (negativo = mais alto) */
  headOffset: number;
  /** larguraExtraPx */
  widthExtra: number;
  /** ombro largo e braço grosso (fortão) */
  buff: boolean;
  /** barriga (barrigudo) */
  belly: boolean;
  /** braço fino (magrelo) */
  thin: boolean;
}

export const BODY_MEDIO: BodySpec = { headOffset: 0, widthExtra: 0, buff: false, belly: false, thin: false };

export interface Rig {
  view: View;
  W: number;
  H: number;
  /** eixo central contínuo (16 num quadro de 32) */
  cx: number;
  headTop: number;
  headBot: number;
  headL: number;
  headR: number;
  /** linha dos olhos (2 linhas: eyeY e eyeY+1) */
  eyeY: number;
  mouthY: number;
  torsoTop: number;
  torsoBot: number;
  torsoL: number;
  torsoR: number;
  /** linha do cinto */
  waistY: number;
  /** barriga para a frente (lado) ou para os lados (frente) */
  belly: number;
  /** braço da mão principal: na frente, o da esquerda da tela; de lado, o braço da frente */
  armMain: Limb;
  armOff: Limb;
  /** perna A: esquerda da tela na frente; de lado, a de trás */
  legA: Limb;
  legB: Limb;
  /** pés: retângulos inclusivos */
  footA: { x0: number; x1: number; y0: number; y1: number };
  footB: { x0: number; x1: number; y0: number; y1: number };
  /** última linha do corpo (chão) */
  groundY: number;
  body: BodySpec;
  pose: Pose;
}

function armOffset(view: View, p: ArmPose): Pt {
  if (view === 'side') {
    switch (p) {
      case 'rest':
        return { x: 0, y: 8.5 };
      case 'swingF':
        return { x: -2.5, y: 8 };
      case 'swingB':
        return { x: 2.5, y: 8 };
      case 'up':
        return { x: -1, y: -8.5 };
      case 'forward':
        return { x: -7, y: 2.5 };
      case 'wind':
        return { x: 3, y: -4 };
      case 'out':
        return { x: -6.5, y: 0.5 };
      case 'cross':
        return { x: -3, y: 5.5 };
      case 'down':
        return { x: -1, y: 9 };
      case 'hip':
        return { x: 1.5, y: 6 };
    }
  }
  switch (p) {
    case 'rest':
      return { x: 0, y: 8.5 };
    case 'swingF':
      return { x: 0, y: 7.5 };
    case 'swingB':
      return { x: 0, y: 9 };
    case 'up':
      return { x: -1.5, y: -8.5 };
    case 'forward':
      return { x: -2.5, y: 6.5 };
    case 'wind':
      return { x: -1, y: -4 };
    case 'out':
      return { x: -6, y: 1.5 };
    case 'cross':
      return { x: 5, y: 5.5 };
    case 'down':
      return { x: -1, y: 9 };
    case 'hip':
      return { x: 1.5, y: 6.5 };
  }
}

/**
 * Calcula o esqueleto. `padX` e `padTop` deslocam tudo quando a folha é mais larga ou mais alta
 * (camadas com larguraPx e overflowTopoPx do artCatalog).
 */
export function makeRig(view: View, body: BodySpec, pose: Pose, W = 32, H = 48, padX = 0, padTop = 0): Rig {
  const o = body.headOffset;
  const e = body.widthExtra;
  const cx = 16 + padX;
  const groundY = H - 2 - pose.jump;
  // tudo é calculado como se o chão fosse a linha 46 de um quadro de 48 e depois deslocado
  const base = groundY - 46;
  const up = pose.bob + pose.crouch;
  const seatLift = pose.seated ? -2 : 0;

  const headTop = 4 + o + base + up + seatLift;
  const headBot = headTop + 14;
  const hw = view === 'side' ? 7 : 8;
  const headL = cx - hw + Math.round(pose.headTilt);
  const headR = cx + hw - 1 - (view === 'side' ? 0 : 0) + Math.round(pose.headTilt);

  const torsoTop = headBot + 1;
  const torsoBotNatural = 32 + Math.round(o / 2) + base + seatLift;
  const torsoBot = Math.max(torsoTop + 6, torsoBotNatural + up);
  let torsoL: number;
  let torsoR: number;
  if (view === 'side') {
    torsoL = cx - 4 - (body.belly ? 1 : 0);
    torsoR = cx + 4;
  } else {
    const el = Math.ceil(e / 2);
    const er = e - el;
    torsoL = cx - 6 - el;
    torsoR = cx + 5 + er;
  }
  const waistY = torsoBot - 2;

  const armW = body.buff ? 4 : body.thin ? 2.6 : 3;
  const sw = body.buff ? 0.5 : 0;
  const shoulderY = torsoTop + 1.5;
  let mainShoulder: Pt;
  let offShoulder: Pt;
  let mirrorOff = true;
  if (view === 'side') {
    mainShoulder = { x: cx + 0.5, y: shoulderY };
    offShoulder = { x: cx + 2.5, y: shoulderY };
    mirrorOff = false;
  } else if (view === 'front') {
    mainShoulder = { x: torsoL - 1.5 - sw, y: shoulderY };
    offShoulder = { x: torsoR + 2.5 + sw, y: shoulderY };
  } else {
    // de costas, a mão principal (direita do personagem) fica à direita da tela
    mainShoulder = { x: torsoR + 2.5 + sw, y: shoulderY };
    offShoulder = { x: torsoL - 1.5 - sw, y: shoulderY };
  }
  const mo = armOffset(view, pose.armMain);
  const oo = armOffset(view, pose.armOff);
  const mainSign = view === 'back' ? -1 : 1;
  const armMain: Limb = {
    a: mainShoulder,
    b: { x: mainShoulder.x + mo.x * mainSign, y: mainShoulder.y + mo.y },
    w: armW,
  };
  const offSign = mirrorOff ? (view === 'back' ? 1 : -1) : 1;
  const armOff: Limb = {
    a: offShoulder,
    b: { x: offShoulder.x + oo.x * offSign, y: offShoulder.y + oo.y },
    w: armW,
  };

  const hipY = torsoBot - 1;
  const ankleY = groundY - 3.5;
  let legA: Limb;
  let legB: Limb;
  let footA: Rig['footA'];
  let footB: Rig['footB'];
  const legW = 4;
  const seatedAnkle = (hy: number) => Math.min(ankleY, hy + 6);
  if (view === 'side') {
    const hx = cx + 0.5;
    const sA = pose.stride * 3;
    const ankleAy = (pose.seated ? seatedAnkle(hipY) : ankleY) - pose.liftA;
    const ankleBy = (pose.seated ? seatedAnkle(hipY) : ankleY) - pose.liftB;
    const spread = pose.crouch > 4 ? pose.crouch / 3 : 0;
    legA = { a: { x: hx + 0.5, y: hipY }, b: { x: hx + 0.5 - sA + spread, y: ankleAy }, w: legW };
    legB = { a: { x: hx - 0.5, y: hipY }, b: { x: hx - 0.5 + sA - spread, y: ankleBy }, w: legW };
    const fa = Math.round(legA.b.x);
    const fb = Math.round(legB.b.x);
    footA = { x0: fa - 4, x1: fa + 1, y0: Math.round(ankleAy) + 1, y1: Math.round(ankleAy) + 3 };
    footB = { x0: fb - 4, x1: fb + 1, y0: Math.round(ankleBy) + 1, y1: Math.round(ankleBy) + 3 };
  } else {
    const spread = pose.crouch > 4 ? pose.crouch / 4 : 0;
    const ax = cx - 3 - spread;
    const bx = cx + 3 + spread;
    const ankleAy = (pose.seated ? seatedAnkle(hipY) : ankleY) - pose.liftA;
    const ankleBy = (pose.seated ? seatedAnkle(hipY) : ankleY) - pose.liftB;
    legA = { a: { x: cx - 3, y: hipY }, b: { x: ax, y: ankleAy }, w: legW };
    legB = { a: { x: cx + 3, y: hipY }, b: { x: bx, y: ankleBy }, w: legW };
    const ra = Math.round(ax);
    const rb = Math.round(bx);
    footA = { x0: ra - 3, x1: ra + 1, y0: Math.round(ankleAy) + 1, y1: Math.round(ankleAy) + 3 };
    footB = { x0: rb - 2, x1: rb + 2, y0: Math.round(ankleBy) + 1, y1: Math.round(ankleBy) + 3 };
  }

  return {
    view,
    W,
    H,
    cx,
    headTop,
    headBot,
    headL,
    headR,
    eyeY: headTop + 7,
    mouthY: headTop + 11,
    torsoTop,
    torsoBot,
    torsoL,
    torsoR,
    waistY,
    belly: body.belly ? 2 : 0,
    armMain,
    armOff,
    legA,
    legB,
    footA,
    footB,
    groundY,
    body,
    pose,
  };
}

/** Meia largura da cabeça em cada linha (forma arredondada, queixo mais estreito). */
export function headSpan(rig: Rig, y: number): [number, number] | null {
  const r = y - rig.headTop;
  if (r < 0 || y > rig.headBot) return null;
  const full = rig.headR - rig.headL + 1;
  const cut = [4, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4][r] ?? 0;
  if (rig.view === 'side') {
    // nuca arredondada à direita, queixo e nariz à esquerda
    const cutL = [4, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3][r] ?? 0;
    const cutR = [3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4, 6][r] ?? 0;
    return [rig.headL + cutL, rig.headR - cutR];
  }
  const c = Math.min(cut, Math.floor(full / 2) - 1);
  return [rig.headL + c, rig.headR - c];
}

/** Meia largura do tronco por linha (ombros arredondados, barriga). */
export function torsoSpan(rig: Rig, y: number): [number, number] | null {
  if (y < rig.torsoTop || y > rig.torsoBot) return null;
  const r = y - rig.torsoTop;
  let l = rig.torsoL;
  let rr = rig.torsoR;
  if (r === 0) {
    l += 1;
    rr -= 1;
  }
  if (rig.body.buff && r <= 3 && rig.view !== 'side') {
    l -= 1;
    rr += 1;
  }
  if (rig.belly && r >= 5) {
    if (rig.view === 'side') l -= r >= 6 && y < rig.torsoBot - 1 ? 2 : 1;
    else {
      l -= 1;
      rr += 1;
    }
  }
  return [l, rr];
}

/** Ponto do fim de um membro arredondado para o pixel. */
export const px = (p: Pt) => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

/** Ponto ao longo do membro (t = 0 no ombro/quadril, 1 na mão/tornozelo). */
export function along(l: Limb, t: number): Pt {
  return { x: l.a.x + (l.b.x - l.a.x) * t, y: l.a.y + (l.b.y - l.a.y) * t };
}
