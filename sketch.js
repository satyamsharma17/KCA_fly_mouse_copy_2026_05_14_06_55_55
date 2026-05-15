const VIRTUAL_W = 500;
const VIRTUAL_H = 700;

const PIECE_DEFS = [
  { key: 'leftleg',    file: 'leftleg.svg',    tx:  -40, ty:  100, nw:  65.79, nh: 100.89, order: 0 },
  { key: 'rightleg',   file: 'rightleg.svg',   tx:   40, ty:  100, nw:  65.79, nh: 100.89, order: 0 },
  { key: 'body',       file: 'body.svg',       tx:    0, ty:  -35, nw: 231.85, nh: 187.58, order: 1 },
  { key: 'arm1',       file: 'arm1.svg',       tx: -142, ty: -102, nw:  53.80, nh:  53.80, order: 1 },
  { key: 'arm1_1',     file: 'arm1_1.svg',     tx: -142, ty:  -50, nw:  53.80, nh:  53.80, order: 1 },
  { key: 'armright',   file: 'armright.svg',   tx:  142, ty: -102, nw:  53.80, nh:  53.80, order: 1 },
  { key: 'armright_1', file: 'armright_1.svg', tx:  142, ty:  -50, nw:  53.30, nh:  53.80, order: 1 },
  { key: 'hair',       file: 'hair.svg',       tx:    0, ty: -190, nw: 145.09, nh: 128.86, order: 2 },
  { key: 'face',       file: 'face.svg',       tx:    0, ty: -170, nw: 118.51, nh: 117.66, order: 3 },
  { key: 'bangs',      file: 'bangs.svg',      tx:    0, ty: -220, nw: 105.84, nh:  40.04, order: 4 },
  { key: 'hairclip',   file: 'hairclip.svg',   tx:  -40, ty: -215, nw:  70.09, nh:  68.33, order: 5 },
];

// Cape colors as RGB
const CAPE_COLORS = [
  [17, 97, 245],  // #1161f5
];

let imgs = {};
let pieces = [];
let scl;
let headOffsetY = 0;

let cx, cy;
let vx = 0, vy = 0;
let dragX = 0, dragY = 0;

const dragStrength = 0.05;
const damping = 0.82;

let bodyAngle = 0;
let bodyAngVel = 0;

let legPhase = 0;
let smoothSpeed = 0;

let showMirror = false;

let sizeMult = 1.0;
const SIZE_MIN  = 0.05;
const SIZE_MAX  = 10.0;

let sizeSpeed = 0;
const SIZE_ACCEL = 0.004;
const SIZE_MAX_SPEED = 0.12;
const SIZE_FRICTION = 0.85;

let trailEnabled = false;

let trailPoints = [];
const TRAIL_CAPACITY = 300;
const TRAIL_LIFE = 30;

function preload() {
  for (let p of PIECE_DEFS) imgs[p.key] = loadImage(p.file);
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  imageMode(CENTER);
  recalc();
  cx = width / 2;
  cy = height / 2;
}

function recalc() {
  scl = min(width / VIRTUAL_W, height / VIRTUAL_H) * 0.32;
  pieces = PIECE_DEFS.map(d => ({
    ...d,
    tx: d.tx * scl,
    ty: d.ty * scl,
    w:  d.nw * scl,
    h:  d.nh * scl,
  }));
  headOffsetY = -170 * scl;
}

function updateSize() {
  if (keyIsDown(UP_ARROW)) {
    sizeSpeed = min(sizeSpeed + SIZE_ACCEL, SIZE_MAX_SPEED);
  } else if (keyIsDown(DOWN_ARROW)) {
    sizeSpeed = max(sizeSpeed - SIZE_ACCEL, -SIZE_MAX_SPEED);
  } else {
    sizeSpeed *= SIZE_FRICTION;
  }
  sizeMult = constrain(sizeMult + sizeSpeed, SIZE_MIN, SIZE_MAX);
}

function draw() {
  background(255);
  updateSize();
  updateCharacter();

  if (trailEnabled) {
    // Anchor fixed to neck/back
    let neckLocal = -120 * scl * sizeMult;
    let originX = cx + dragX;
    let originY = cy + dragY - headOffsetY * sizeMult;
    let feetX = originX - sin(bodyAngle) * neckLocal;
    let feetY = originY + cos(bodyAngle) * neckLocal;

    let last = trailPoints[trailPoints.length - 1];
    if (!last || dist(feetX, feetY, last.x, last.y) > 4) {
      trailPoints.push({ x: feetX, y: feetY, born: frameCount });
      if (trailPoints.length > TRAIL_CAPACITY) trailPoints.shift();
    }

    trailPoints = trailPoints.filter(p => (frameCount - p.born) < TRAIL_LIFE);

    if (trailPoints.length >= 4) drawRainbowTrail();
  } else {
    trailPoints = [];
  }

  if (showMirror) drawCharacterMirrored(cx, cy, bodyAngle, legPhase, smoothSpeed, 255);
  drawCharacter(cx, cy, bodyAngle, legPhase, smoothSpeed, 255);
}

function catmullRom(p0, p1, p2, p3, t) {
  let t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
  };
}

function drawRainbowTrail() {
  if (trailPoints.length < 4) return;

  let n = trailPoints.length;

  let narrowW = 80  * scl * sizeMult;
  let wideW   = 320 * scl * sizeMult;

  // Moving-average smooth
  let smooth = trailPoints.map((p, i) => {
    let r = 3, sx = 0, sy = 0, c = 0;
    for (let j = max(0, i-r); j <= min(n-1, i+r); j++) {
      sx += trailPoints[j].x; sy += trailPoints[j].y; c++;
    }
    return { x: sx/c, y: sy/c, born: trailPoints[i].born };
  });

  // Catmull-Rom subdivide — t=0 oldest/tail, t=1 newest/neck
  const STEPS = 8;
  let dense = [];
  for (let i = 0; i < smooth.length - 1; i++) {
    let p0 = smooth[max(0, i-1)];
    let p1 = smooth[i];
    let p2 = smooth[i+1];
    let p3 = smooth[min(smooth.length-1, i+2)];
    for (let s = 0; s < STEPS; s++) {
      let pt  = catmullRom(p0, p1, p2, p3, s / STEPS);
      pt.t    = (i * STEPS + s) / ((smooth.length - 1) * STEPS);
      pt.born = lerp(p1.born, p2.born, s / STEPS);
      dense.push(pt);
    }
  }
  dense.push({ ...smooth[smooth.length-1], t: 1, born: smooth[smooth.length-1].born });

  // Perpendicular normals
  let normals = dense.map((pt, i) => {
    let a = dense[max(i-1, 0)];
    let b = dense[min(i+1, dense.length-1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    let len = sqrt(dx*dx + dy*dy) || 1;
    return { nx: -dy/len, ny: dx/len };
  });

  colorMode(RGB, 255);
  noStroke();

  let nc = CAPE_COLORS.length;
  for (let b = 0; b < nc; b++) {
    let col = CAPE_COLORS[b];
    let fL  = (b     / nc) - 0.5;
    let fR  = ((b+1) / nc) - 0.5;

    for (let i = 0; i < dense.length - 1; i++) {
      let t     = dense[i].t;
      let alpha = t >= 0.7 ? 255 : pow(t / 0.7, 3) * 255;
      if (alpha <= 0) continue;

      let c0 = pow(1 - dense[i].t,   2);
      let c1 = pow(1 - dense[i+1].t, 2);
      let w0 = lerp(narrowW, wideW, c0);
      let w1 = lerp(narrowW, wideW, c1);

      let n0 = normals[i], n1 = normals[i+1];

      let x1 = dense[i].x   + n0.nx * fL * w0,  y1 = dense[i].y   + n0.ny * fL * w0;
      let x2 = dense[i].x   + n0.nx * fR * w0,  y2 = dense[i].y   + n0.ny * fR * w0;
      let x3 = dense[i+1].x + n1.nx * fR * w1,  y3 = dense[i+1].y + n1.ny * fR * w1;
      let x4 = dense[i+1].x + n1.nx * fL * w1,  y4 = dense[i+1].y + n1.ny * fL * w1;

      fill(col[0], col[1], col[2], alpha);
      quad(x1, y1, x2, y2, x3, y3, x4, y4);
    }
  }

  noFill();
}

function updateCharacter() {
  let dx = mouseX - cx;
  let dy = mouseY - cy;

  vx += dx * dragStrength;
  vy += dy * dragStrength;
  vx *= damping;
  vy *= damping;

  cx += vx;
  cy += vy;

  dragX = -vx * 0.12;
  dragY = -vy * 0.12;

  let speed = sqrt(vx * vx + vy * vy);
  smoothSpeed += (speed - smoothSpeed) * 0.1;
  legPhase += smoothSpeed * 0.015;

  let targetAngle = 0;
  if (speed > 0.1) {
    let tiltMag = min(speed * 0.055, 0.45);
    targetAngle = (vx / speed) * tiltMag;
  }
  bodyAngVel += (targetAngle - bodyAngle) * 0.12;
  bodyAngVel *= 0.72;
  bodyAngle += bodyAngVel;
}

function drawCharacter(x, y, angle, lPhase, spd, alpha) {
  let sorted = [...pieces].sort((a, b) => a.order - b.order);
  let speedFactor = constrain(spd / 4, 0, 1);

  push();
  translate(x + dragX, y + dragY - headOffsetY * sizeMult);
  rotate(angle);
  scale(sizeMult);

  for (let p of sorted) {
    push();

    if (p.key === 'leftleg' || p.key === 'rightleg') {
      let phase = p.key === 'leftleg' ? lPhase : lPhase + PI;
      let swing = sin(phase) * 0.38 * speedFactor;
      translate(p.tx, p.ty - p.h / 2);
      rotate(swing);
      tint(255, alpha);
      image(imgs[p.key], 0, p.h / 2, p.w, p.h);

    } else if (p.key === 'arm1' || p.key === 'arm1_1' ||
               p.key === 'armright' || p.key === 'armright_1') {
      let isLeft  = p.key === 'arm1' || p.key === 'arm1_1';
      let isLower = p.key === 'arm1_1' || p.key === 'armright_1';
      let phase   = isLeft ? lPhase + PI : lPhase;
      let swing   = sin(phase) * 0.28 * speedFactor;
      let upper   = pieces.find(q => q.key === (isLeft ? 'arm1' : 'armright'));
      translate(p.tx, upper.ty - upper.h / 2);
      rotate(swing);
      tint(255, alpha);
      let offsetY = isLower ? upper.h + p.h / 2 : p.h / 2;
      image(imgs[p.key], 0, offsetY, p.w, p.h);

    } else {
      translate(p.tx, p.ty);
      let flail = sin(frameCount * 0.12 + p.tx * 0.05) * 0.12 * speedFactor;
      flail += vx * 0.006 * speedFactor;
      if (p.key === 'face') flail *= 0.25;
      rotate(flail);
      tint(255, alpha);
      image(imgs[p.key], 0, 0, p.w, p.h);
    }

    pop();
  }

  pop();
}

function drawCharacterMirrored(x, y, angle, lPhase, spd, alpha) {
  push();
  translate(width, 0);
  scale(-1, 1);
  drawCharacter(x, y, angle, lPhase, spd, alpha);
  pop();
}

function keyPressed() {
  if (key === 'z' || key === 'Z') showMirror = !showMirror;

  if (key === 't' || key === 'T') {
    trailEnabled = !trailEnabled;
    if (!trailEnabled) trailPoints = [];
  }

  if (keyCode === UP_ARROW || keyCode === DOWN_ARROW) return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  recalc();
}
