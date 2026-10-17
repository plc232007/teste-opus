'use strict';

/* ==================================================================
   LODESTAR L-1
   The vehicle is not a model file. Hull, grid fins, landing legs,
   engine bells, fairing, payload, pad and tower are revolved and
   extruded here, the skin is painted into a canvas at runtime and
   everything is shaded by one GGX program. No meshes, no textures,
   no CDN, no 3D engine.
   ================================================================== */

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionQuery.matches;

/* ── 1. linear algebra ─────────────────────────────────────────── */

const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    const b0 = b[c*4], b1 = b[c*4+1], b2 = b[c*4+2], b3 = b[c*4+3];
    out[c*4]   = a[0]*b0 + a[4]*b1 + a[8]*b2  + a[12]*b3;
    out[c*4+1] = a[1]*b0 + a[5]*b1 + a[9]*b2  + a[13]*b3;
    out[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
    out[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
  }
  return out;
}

function translation(x, y, z) { const m = identity(); m[12] = x; m[13] = y; m[14] = z; return m; }
function rotationX(a) { const c = Math.cos(a), s = Math.sin(a), m = identity(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
function rotationY(a) { const c = Math.cos(a), s = Math.sin(a), m = identity(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
function rotationZ(a) { const c = Math.cos(a), s = Math.sin(a), m = identity(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), out = new Float32Array(16);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) / (near - far); out[11] = -1;
  out[14] = 2 * far * near / (near - far);
  return out;
}

function lookAt(eye, target) {
  const z = normalize([eye[0]-target[0], eye[1]-target[1], eye[2]-target[2]]);
  const x = normalize(cross([0,1,0], z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0]*eye[0] + x[1]*eye[1] + x[2]*eye[2]),
    -(y[0]*eye[0] + y[1]*eye[1] + y[2]*eye[2]),
    -(z[0]*eye[0] + z[1]*eye[1] + z[2]*eye[2]), 1,
  ]);
}

function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; }

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

/* ── 2. mesh primitives ────────────────────────────────────────── */

const mesh = () => ({ p: [], n: [], t: [], i: [] });

function append(target, source, matrix) {
  const base = target.p.length / 3;
  for (let k = 0; k < source.p.length; k += 3) {
    const x = source.p[k], y = source.p[k+1], z = source.p[k+2];
    const nx = source.n[k], ny = source.n[k+1], nz = source.n[k+2];
    if (matrix) {
      target.p.push(
        matrix[0]*x + matrix[4]*y + matrix[8]*z  + matrix[12],
        matrix[1]*x + matrix[5]*y + matrix[9]*z  + matrix[13],
        matrix[2]*x + matrix[6]*y + matrix[10]*z + matrix[14]);
      target.n.push(
        matrix[0]*nx + matrix[4]*ny + matrix[8]*nz,
        matrix[1]*nx + matrix[5]*ny + matrix[9]*nz,
        matrix[2]*nx + matrix[6]*ny + matrix[10]*nz);
    } else {
      target.p.push(x, y, z);
      target.n.push(nx, ny, nz);
    }
  }
  for (let k = 0; k < source.t.length; k++) target.t.push(source.t[k]);
  for (let k = 0; k < source.i.length; k++) target.i.push(source.i[k] + base);
  return target;
}

/* A profile [[radius, height], …] spun around Y. Normals come from the
   profile tangent and are averaged across soft joints, so a nozzle bell
   reads as a smooth surface while a skirt keeps its hard edge. */
function revolve(profile, segments, options) {
  const opts = options || {};
  const from = opts.from === undefined ? 0 : opts.from;
  const to = opts.to === undefined ? Math.PI * 2 : opts.to;
  const uScale = opts.uScale === undefined ? 1 : opts.uScale;
  const vFrom = opts.vFrom === undefined ? 0 : opts.vFrom;
  const vTo = opts.vTo === undefined ? 1 : opts.vTo;
  const g = mesh();

  const low = Math.min(...profile.map(p => p[1]));
  const high = Math.max(...profile.map(p => p[1]));
  const span = (high - low) || 1;
  const pts = profile.map(p => [p[0], p[1], p[2] === undefined ? mix(vFrom, vTo, (p[1] - low) / span) : p[2]]);

  const faceNormals = [];
  for (let s = 0; s < pts.length - 1; s++) {
    let dr = pts[s+1][0] - pts[s][0], dy = pts[s+1][1] - pts[s][1];
    const len = Math.hypot(dr, dy) || 1;
    dr /= len; dy /= len;
    faceNormals.push([dy, -dr]);
  }
  const startN = faceNormals.map(n => n.slice());
  const endN = faceNormals.map(n => n.slice());
  for (let s = 1; s < faceNormals.length; s++) {
    const a = faceNormals[s-1], b = faceNormals[s];
    if (a[0]*b[0] + a[1]*b[1] > 0.55) {
      const mxr = a[0] + b[0], mxy = a[1] + b[1];
      const len = Math.hypot(mxr, mxy) || 1;
      endN[s-1] = [mxr/len, mxy/len];
      startN[s] = [mxr/len, mxy/len];
    }
  }

  for (let s = 0; s < pts.length - 1; s++) {
    const base = g.p.length / 3;
    for (let ring = 0; ring < 2; ring++) {
      const point = pts[s + ring];
      const n2 = ring ? endN[s] : startN[s];
      for (let k = 0; k <= segments; k++) {
        const th = mix(from, to, k / segments);
        const c = Math.cos(th), si = Math.sin(th);
        g.p.push(point[0] * c, point[1], point[0] * si);
        g.n.push(n2[0] * c, n2[1], n2[0] * si);
        g.t.push((1 - k / segments) * uScale, point[2]);
      }
    }
    for (let k = 0; k < segments; k++) {
      const a = base + k, b = base + k + 1;
      const c = base + segments + 1 + k, d = c + 1;
      g.i.push(a, c, b, b, c, d);
    }
  }

  if (opts.capBottom) append(g, disc(pts[0][0], pts[0][1], segments, -1, from, to));
  if (opts.capTop) append(g, disc(pts[pts.length-1][0], pts[pts.length-1][1], segments, 1, from, to));
  return g;
}

function disc(radius, y, segments, dir, from, to) {
  const g = mesh();
  g.p.push(0, y, 0); g.n.push(0, dir, 0); g.t.push(.5, .5);
  for (let k = 0; k <= segments; k++) {
    const th = mix(from === undefined ? 0 : from, to === undefined ? Math.PI*2 : to, k / segments);
    g.p.push(radius * Math.cos(th), y, radius * Math.sin(th));
    g.n.push(0, dir, 0);
    g.t.push(.5 + .5 * Math.cos(th), .5 + .5 * Math.sin(th));
  }
  for (let k = 1; k <= segments; k++) {
    if (dir > 0) g.i.push(0, k, k + 1); else g.i.push(0, k + 1, k);
  }
  return g;
}

function box(w, h, d) {
  const x = w/2, y = h/2, z = d/2, g = mesh();
  const faces = [
    [[ x,-y, z],[ x,-y,-z],[ x, y,-z],[ x, y, z], [ 1, 0, 0]],
    [[-x,-y,-z],[-x,-y, z],[-x, y, z],[-x, y,-z], [-1, 0, 0]],
    [[-x, y, z],[ x, y, z],[ x, y,-z],[-x, y,-z], [ 0, 1, 0]],
    [[-x,-y,-z],[ x,-y,-z],[ x,-y, z],[-x,-y, z], [ 0,-1, 0]],
    [[-x,-y, z],[ x,-y, z],[ x, y, z],[-x, y, z], [ 0, 0, 1]],
    [[ x,-y,-z],[-x,-y,-z],[-x, y,-z],[ x, y,-z], [ 0, 0,-1]],
  ];
  for (const face of faces) {
    const base = g.p.length / 3;
    const uv = [[0,0],[1,0],[1,1],[0,1]];
    for (let k = 0; k < 4; k++) {
      g.p.push(face[k][0], face[k][1], face[k][2]);
      g.n.push(face[4][0], face[4][1], face[4][2]);
      g.t.push(uv[k][0], uv[k][1]);
    }
    g.i.push(base, base+1, base+2, base, base+2, base+3);
  }
  return g;
}

/* ── 3. the vehicle ────────────────────────────────────────────── */

const R = 2.7;            // hull radius, metres
const STAGE1 = [0, 44];
const INTER  = [44, 48];
const STAGE2 = [48, 64];
const FAIRING = [64, 74];

const MATERIAL = {
  hull:    { color: [.80,.81,.83], rough: .33, metal: .88, tex: 1 },
  carbon:  { color: [.085,.09,.10], rough: .45, metal: .35 },
  dark:    { color: [.20,.205,.22], rough: .30, metal: .95 },
  bell:    { color: [.30,.27,.25], rough: .26, metal: 1,  soot: 1 },
  amber:   { color: [.92,.63,.26], rough: .45, metal: .25, glow: .22 },
  foil:    { color: [.86,.62,.22], rough: .34, metal: .92 },
  solar:   { color: [.05,.07,.16], rough: .16, metal: .55 },
  concrete:{ color: [.085,.085,.092], rough: .95, metal: .02 },
  steel:   { color: [.30,.31,.33], rough: .42, metal: .80 },
  desert:  { color: [.075,.068,.060], rough: 1, metal: 0 },
};

function engineBell(exit, length) {
  const throat = exit * .30;
  return revolve([
    [throat * .9, 0],
    [throat, -length * .12],
    [exit * .50, -length * .42],
    [exit * .78, -length * .72],
    [exit, -length],
  ], 20, { vFrom: 0, vTo: 0 });
}

function gridFin() {
  const g = mesh();
  const W = 3.4, H = 2.6, T = .22;
  append(g, box(W, T, .34), translation(0,  H/2, 0));
  append(g, box(W, T, .34), translation(0, -H/2, 0));
  append(g, box(T, H, .34), translation( W/2, 0, 0));
  append(g, box(T, H, .34), translation(-W/2, 0, 0));
  for (let k = 1; k < 6; k++) append(g, box(.10, H, .24), translation(-W/2 + k * W/6, 0, 0));
  for (let k = 1; k < 5; k++) append(g, box(W, .10, .24), translation(0, -H/2 + k * H/5, 0));
  append(g, box(.5, .5, 1.1), translation(-W/2 - .2, 0, 0));
  return g;
}

function landingLeg() {
  const g = mesh();
  append(g, revolve([[.52, 0], [.62, 1.2], [.62, 7.4], [.30, 9.2]], 12, { vFrom: 0, vTo: 0 }));
  append(g, box(.26, 8.2, .9), translation(.52, 4.4, 0));
  return g;
}

function latticeColumn(height, width, beam) {
  const g = mesh();
  const half = width / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    append(g, box(beam, height, beam), translation(sx * half, height/2, sz * half));
  }
  const rungs = Math.max(2, Math.round(height / 6));
  const step = height / rungs;
  for (let k = 0; k <= rungs; k++) {
    const y = k * step;
    append(g, box(width, beam * .7, beam * .7), translation(0, y,  half));
    append(g, box(width, beam * .7, beam * .7), translation(0, y, -half));
    append(g, box(beam * .7, beam * .7, width), translation( half, y, 0));
    append(g, box(beam * .7, beam * .7, width), translation(-half, y, 0));
    if (k < rungs) {
      const brace = Math.hypot(width, step);
      const angle = Math.atan2(step, width);
      append(g, box(brace, beam * .55, beam * .55),
        multiply(translation(0, y + step/2, half), rotationZ(k % 2 ? angle : -angle)));
      append(g, box(beam * .55, beam * .55, brace),
        multiply(translation(half, y + step/2, 0), rotationX(k % 2 ? -angle : angle)));
    }
  }
  return g;
}

/* Each part carries its own sub-meshes so one explosion offset can move
   hull, fins, legs and engines together. */
function buildVehicle() {
  const parts = [];

  /* — first stage — */
  const hull1 = revolve([
    [R * .96, STAGE1[0]], [R, STAGE1[0] + 1.4],
    [R, STAGE1[1] - 1.2], [R * .985, STAGE1[1]],
  ], 72, { capBottom: true, vFrom: 0, vTo: .60 });

  const skirt = revolve([[R * .99, -.2], [R * .99, 3.2]], 48, { vFrom: 0, vTo: 0 });

  const engines = mesh();
  append(engines, engineBell(1.95, 3.1), translation(0, .1, 0));
  for (let k = 0; k < 8; k++) {
    const th = k / 8 * Math.PI * 2 + Math.PI / 8;
    append(engines, engineBell(1.28, 2.6), translation(Math.cos(th) * 1.72, .1, Math.sin(th) * 1.72));
  }
  append(engines, revolve([[2.68, -.4], [2.68, .4]], 48, { vFrom: 0, vTo: 0 }));

  const fins = mesh();
  for (let k = 0; k < 4; k++) {
    const th = k / 4 * Math.PI * 2 + Math.PI / 4;
    append(fins, gridFin(), multiply(multiply(
      translation(Math.cos(th) * (R + 1.5), 40.4, Math.sin(th) * (R + 1.5)),
      rotationY(-th)), rotationZ(-.26)));
  }

  const legs = mesh();
  for (let k = 0; k < 4; k++) {
    const th = k / 4 * Math.PI * 2;
    append(legs, landingLeg(), multiply(
      translation(Math.cos(th) * (R + .22), 1.1, Math.sin(th) * (R + .22)),
      rotationY(-th)));
  }

  const detail1 = mesh();
  append(detail1, box(.55, 34, .9), translation(Math.cos(.9) * (R + .3), 21, Math.sin(.9) * (R + .3)));
  append(detail1, revolve([[R + .02, 12.4], [R + .02, 12.9]], 48, { vFrom: 0, vTo: 0 }));
  append(detail1, revolve([[R + .02, 27.4], [R + .02, 27.9]], 48, { vFrom: 0, vTo: 0 }));

  parts.push({
    id: 'stage1', tags: ['hero', 'explode', 'viewer'], lateral: 0,
    subs: [
      { geo: hull1, mat: MATERIAL.hull },
      { geo: skirt, mat: MATERIAL.dark },
      { geo: engines, mat: MATERIAL.bell },
      { geo: fins, mat: MATERIAL.dark },
      { geo: legs, mat: MATERIAL.dark },
      { geo: detail1, mat: MATERIAL.steel },
    ],
  });

  /* — interstage — */
  const interHull = revolve([[R * .99, INTER[0]], [R * .99, INTER[1]]], 64, { vFrom: 0, vTo: 0 });
  const ribs = mesh();
  for (let k = 0; k < 16; k++) {
    const th = k / 16 * Math.PI * 2;
    append(ribs, box(.30, INTER[1] - INTER[0] - .5, .34),
      multiply(translation(Math.cos(th) * (R + .02), (INTER[0] + INTER[1]) / 2, Math.sin(th) * (R + .02)), rotationY(-th)));
  }
  const interBand = revolve([[R + .05, INTER[0] + .25], [R + .05, INTER[0] + .62]], 64, { vFrom: 0, vTo: 0 });
  parts.push({
    id: 'interstage', tags: ['hero', 'explode', 'viewer'], lateral: 0,
    subs: [
      { geo: interHull, mat: MATERIAL.carbon },
      { geo: ribs, mat: MATERIAL.carbon },
      { geo: interBand, mat: MATERIAL.amber },
    ],
  });

  /* — second stage — */
  const hull2 = revolve([
    [R * .97, STAGE2[0]], [R * .97, STAGE2[1] - 1.6], [R * .93, STAGE2[1]],
  ], 64, { vFrom: .62, vTo: .96 });
  const vac = mesh();
  append(vac, engineBell(2.9, 4.2), translation(0, STAGE2[0] + .3, 0));
  append(vac, revolve([[1.5, STAGE2[0] + .3], [1.5, STAGE2[0] + 1.6]], 32, { vFrom: 0, vTo: 0 }));
  const detail2 = mesh();
  append(detail2, box(.42, 11, .7), translation(Math.cos(.9) * (R - .2), STAGE2[0] + 7, Math.sin(.9) * (R - .2)));
  append(detail2, revolve([[R * .975, STAGE2[0] + 9.2], [R * .975, STAGE2[0] + 9.6]], 48, { vFrom: 0, vTo: 0 }));
  parts.push({
    id: 'stage2', tags: ['hero', 'explode', 'viewer'], lateral: 0,
    subs: [
      { geo: hull2, mat: MATERIAL.hull },
      { geo: vac, mat: MATERIAL.bell },
      { geo: detail2, mat: MATERIAL.steel },
    ],
  });

  /* — fairing, two halves — */
  const fairingProfile = [
    [R * .99, FAIRING[0]], [R * .99, FAIRING[0] + 4.2],
    [R * .86, FAIRING[0] + 6.4], [R * .58, FAIRING[0] + 8.2],
    [R * .26, FAIRING[0] + 9.4], [0, FAIRING[1]],
  ];
  for (const side of [-1, 1]) {
    const from = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    const shell = revolve(fairingProfile, 40, { from, to: from + Math.PI, vFrom: .80, vTo: .93 });
    const lip = revolve([[R * .99, FAIRING[0]], [R * .99, FAIRING[0] + .45]], 40,
      { from, to: from + Math.PI, vFrom: 0, vTo: 0 });
    parts.push({
      id: side < 0 ? 'fairingA' : 'fairingB', tags: ['hero', 'explode', 'viewer'], lateral: side * 17,
      subs: [{ geo: shell, mat: MATERIAL.hull }, { geo: lip, mat: MATERIAL.amber }],
    });
  }

  /* — payload — */
  const bus = mesh();
  append(bus, revolve([[1.55, 65.4], [1.55, 69.4]], 6, { capTop: true, capBottom: true, vFrom: 0, vTo: 0 }));
  append(bus, revolve([[.9, 69.4], [.55, 70.6]], 24, { capTop: true, vFrom: 0, vTo: 0 }));
  const dish = revolve([[0, 70.6], [1.15, 71.5]], 28, { vFrom: 0, vTo: 0 });
  const wings = [];
  for (const side of [-1, 1]) {
    wings.push({
      geo: box(5.6, .14, 2.4), mat: MATERIAL.solar,
      hinge: (t) => multiply(
        translation(side * mix(1.1, 4.3, t), mix(67.4, 68.2, t), 0),
        rotationZ(side * mix(Math.PI / 2, 0, t))),
    });
  }
  parts.push({
    id: 'payload', tags: ['hero', 'explode', 'viewer'], lateral: 0,
    subs: [{ geo: bus, mat: MATERIAL.foil }, { geo: dish, mat: MATERIAL.steel }, ...wings],
  });

  /* — pad and tower, hero only — */
  const deck = mesh();
  append(deck, box(96, 2.2, 96), translation(0, -5.2, 0));
  append(deck, box(104, .6, 104), translation(0, -6.3, 0));
  const trench = mesh();
  append(trench, box(16, 3, 62), translation(0, -5.6, 26));
  const mount = mesh();
  append(mount, revolve([[6.4, -4.1], [6.4, -1.2], [4.6, -.6]], 8, { capTop: true, vFrom: 0, vTo: 0 }));
  for (let k = 0; k < 4; k++) {
    const th = k / 4 * Math.PI * 2 + Math.PI / 4;
    append(mount, box(1.1, 3.4, 1.1), translation(Math.cos(th) * 5.4, -2.4, Math.sin(th) * 5.4));
  }
  const ground = mesh();
  append(ground, box(900, .6, 900), translation(0, -6.6, 0));
  parts.push({
    id: 'pad', tags: ['hero'], lateral: 0, static: true,
    subs: [
      { geo: ground, mat: MATERIAL.desert },
      { geo: deck, mat: MATERIAL.concrete },
      { geo: trench, mat: MATERIAL.carbon },
      { geo: mount, mat: MATERIAL.steel },
    ],
  });

  const tower = mesh();
  append(tower, latticeColumn(82, 7, .62), translation(-15.5, -4.1, -1));
  for (const y of [14, 30, 46]) {
    append(tower, box(9, .7, 1.4), translation(-8.6, y, -1));
    append(tower, box(1.2, 2.6, 1.2), translation(-4.6, y + 1.2, -1));
  }
  append(tower, box(1.1, 16, 1.1), translation(-15.5, 86, -1));
  const towerAccent = mesh();
  for (const y of [10, 34, 58, 76]) append(towerAccent, box(7.6, .45, .45), translation(-15.5, y, -4.6));
  parts.push({
    id: 'tower', tags: ['hero'], lateral: 0, static: true,
    subs: [{ geo: tower, mat: MATERIAL.steel }, { geo: towerAccent, mat: MATERIAL.amber }],
  });

  return parts;
}

const VEHICLE = buildVehicle();

/* Separation chain: every gap opens inside its own scroll band and the
   offsets accumulate upward, so no part can ever pass through another. */
const GAPS = [
  { id: 'g1', band: [.08, .30], size: 9 },
  { id: 'g2', band: [.28, .50], size: 11 },
  { id: 'g3', band: [.48, .72], size: 11 },
  { id: 'g4', band: [.70, .94], size: 9 },
];

function separation(progress) {
  const open = GAPS.map(gap => smooth(clamp01((progress - gap.band[0]) / (gap.band[1] - gap.band[0]))));
  const g = open.map((t, k) => t * GAPS[k].size);
  const lateral = open[2];
  return {
    stage1: 0,
    interstage: g[0],
    stage2: g[0] + g[1],
    fairingA: g[0] + g[1] + g[2],
    fairingB: g[0] + g[1] + g[2],
    payload: g[0] + g[1] + g[2] + g[3],
    lateral,
    deploy: open[3],
    top: g[0] + g[1] + g[2] + g[3],
  };
}

/* Fit a vertical span into the frame: the vehicle grows by 40 m as it
   comes apart, so every scene derives its distance instead of guessing. */
function frameFor(bottom, top, fov, fill) {
  const half = (top - bottom) / 2 / (fill || .86);
  return { targetY: (top + bottom) / 2, dist: half / Math.tan(fov * Math.PI / 360) };
}

/* ── 4. the skin, painted at runtime ───────────────────────────── */

function paintSkin() {
  const canvas = document.createElement('canvas');
  /* Power of two: WebGL1 refuses mipmaps and REPEAT wrapping on anything else. */
  const S = innerWidth < 900 ? 512 : 1024;
  canvas.width = canvas.height = S;
  const c = canvas.getContext('2d');

  c.scale(S / 1024, S / 1024);
  const SCALE = 1024;        // everything below is laid out in 1024-space
  const DETAIL = S / 1024;   // …and thinned out when the skin is small
  c.fillStyle = '#c9ccd0';
  c.fillRect(0, 0, SCALE, SCALE);

  /* brushed metal, running around the hull */
  for (let k = 0, streaks = Math.round(4200 * DETAIL); k < streaks; k++) {
    const x = Math.random() * SCALE, w = .5 + Math.random() * 1.8;
    const y = Math.random() * SCALE, h = 40 + Math.random() * 260;
    c.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '90,96,104'},${.015 + Math.random() * .05})`;
    c.fillRect(x, y, w, h);
  }

  /* barrel sections: a weld seam every 2.2 m of hull */
  for (let k = 0; k <= 22; k++) {
    const y = k / 22 * SCALE;
    c.fillStyle = 'rgba(70,76,84,.42)'; c.fillRect(0, y, SCALE, 2.5);
    c.fillStyle = 'rgba(255,255,255,.17)'; c.fillRect(0, y + 2.5, SCALE, 1.5);
    c.fillStyle = 'rgba(60,66,74,.30)';
    const rivets = Math.round(96 * DETAIL);
    for (let r = 0; r < rivets; r++) {
      c.beginPath(); c.ellipse(r / rivets * SCALE + 4, y + 9, 5.2, 1.3, 0, 0, 6.3); c.fill();
    }
  }

  /* vertical panel joints */
  for (let k = 0; k < 8; k++) {
    const x = k / 8 * SCALE + 18;
    c.fillStyle = 'rgba(66,72,80,.28)'; c.fillRect(x, 0, 1.8, SCALE);
  }

  /* The skin wraps 17 m of circumference across u and 73 m of hull across v,
     so one texel is 4.31× taller than it is wide. Everything that has to read
     as a circle or as type is drawn squashed by that factor. */
  const STRETCH = 4.31;
  const SQUASH = 1 / STRETCH;

  /* access hatches */
  c.lineWidth = 2.5;
  c.strokeStyle = 'rgba(58,64,72,.5)';
  for (const spot of [[250, 300, 13], [760, 520, 10], [470, 760, 9]]) {
    c.beginPath();
    c.ellipse(spot[0], spot[1], spot[2] * STRETCH, spot[2], 0, 0, 6.3);
    c.stroke();
  }

  /* Type is set on the face the default cameras look at (u ≈ 0.64). The
     texture is uploaded with FLIP_Y, so canvas-up is already hull-up and the
     only correction type needs is the horizontal stretch. */
  const markY = SCALE - .33 * SCALE;
  const MARK_X = .64 * SCALE;

  const stencil = (text, font, color, x, y) => {
    c.save();
    c.translate(x, y);
    c.scale(1, SQUASH);
    c.font = font;
    c.fillStyle = color;
    c.textAlign = 'center';
    c.fillText(text, 0, 0);
    c.restore();
  };

  stencil('LODESTAR', '700 66px Archivo, "Helvetica Neue", Arial, sans-serif', '#15181d', MARK_X, markY);
  stencil('L—1 · FULL STACK REUSE', '400 20px "IBM Plex Mono", monospace', 'rgba(30,34,40,.76)', MARK_X, markY + 24);
  stencil('SN 019 / MOJAVE', '400 22px "IBM Plex Mono", monospace', 'rgba(26,29,34,.6)', MARK_X, markY + 150);
  stencil('NO STEP', '400 20px "IBM Plex Mono", monospace', 'rgba(26,29,34,.55)', MARK_X - 300, markY - 240);

  c.fillStyle = '#e4a045';
  c.fillRect(MARK_X - 132, markY - 40, 264, 7);

  /* soot: the bottom of the first stage comes back dirty */
  const soot = c.createLinearGradient(0, SCALE, 0, SCALE * .70);
  soot.addColorStop(0, 'rgba(14,13,13,.92)');
  soot.addColorStop(.45, 'rgba(26,24,23,.52)');
  soot.addColorStop(1, 'rgba(40,36,34,0)');
  c.fillStyle = soot;
  c.fillRect(0, SCALE * .70, SCALE, SCALE * .30);
  for (let k = 0, specks = Math.round(900 * DETAIL); k < specks; k++) {
    const y = SCALE - Math.pow(Math.random(), 1.7) * SCALE * .32;
    c.fillStyle = `rgba(10,9,9,${.05 + Math.random() * .3})`;
    c.beginPath();
    c.ellipse(Math.random() * SCALE, y, 6 + Math.random() * 34, 10 + Math.random() * 60, 0, 0, 6.3);
    c.fill();
  }

  return canvas;
}

/* ── 5. renderer ───────────────────────────────────────────────── */

const VERTEX_SOURCE = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec2 aUV;
uniform mat4 uProj, uView, uModel;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUV;
varying float vLocalY;
void main(){
  vec4 world = uModel * vec4(aPos, 1.);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNor;
  vUV = aUV;
  vLocalY = aPos.y;
  gl_Position = uProj * uView * world;
}`;

const FRAGMENT_SOURCE = `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUV;
varying float vLocalY;
uniform sampler2D uTex;
uniform vec3 uCam, uBase, uKeyDir, uKeyCol, uFillDir, uFillCol, uRim, uSky, uGround;
uniform float uRough, uMetal, uUseTex, uSoot, uGlow, uExposure;

float hash(vec2 p){ return fract(sin(dot(p, vec2(41.37, 289.13))) * 43758.5453); }

vec3 shade(vec3 N, vec3 V, vec3 L, vec3 albedo, float rough, float metal, vec3 lightColor){
  vec3 H = normalize(V + L);
  float nl = max(dot(N, L), 0.);
  float nv = max(dot(N, V), 1e-4);
  float nh = max(dot(N, H), 0.);
  float vh = max(dot(V, H), 0.);
  float a = max(rough * rough, .003);
  float a2 = a * a;
  float den = nh * nh * (a2 - 1.) + 1.;
  float D = a2 / (3.14159 * den * den);
  float k = a * .5;
  float G = (nl / (nl * (1. - k) + k)) * (nv / (nv * (1. - k) + k));
  vec3 F0 = mix(vec3(.04), albedo, metal);
  vec3 F = F0 + (1. - F0) * pow(1. - vh, 5.);
  vec3 spec = D * G * F / (4. * nv * nl + 1e-4) * nl;
  vec3 diff = albedo * (1. - metal) * nl * 0.3183;
  return (diff + spec) * lightColor;
}

vec3 aces(vec3 x){
  return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.);
}

void main(){
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - vWorld);

  vec3 albedo = uBase;
  float rough = uRough;
  if (uUseTex > .5){
    vec4 texel = texture2D(uTex, vUV);
    albedo *= texel.rgb * 1.08;
    float luma = dot(texel.rgb, vec3(.299, .587, .114));
    rough = clamp(rough + (1. - luma) * .42, .04, 1.);
  }

  float streak = hash(vec2(floor(vUV.x * 820.), floor(vUV.y * 26.)));
  rough = clamp(rough + (streak - .5) * .09, .03, 1.);
  albedo *= .95 + streak * .10;

  float soot = uSoot * (1. - smoothstep(-3.2, 5.5, vLocalY));
  albedo = mix(albedo, vec3(.035, .032, .030), soot * .85);
  rough = mix(rough, .78, soot * .6);

  vec3 color = vec3(0.);
  color += shade(N, V, normalize(uKeyDir), albedo, rough, uMetal, uKeyCol);
  color += shade(N, V, normalize(uFillDir), albedo, rough, uMetal, uFillCol);
  float up = N.y * .5 + .5;
  color += albedo * mix(uGround, uSky, up) * (1. - uMetal * .55);
  color += uRim * pow(1. - max(dot(N, V), 0.), 3.5) * (.35 + .65 * up) * (1. - rough);
  color += uBase * uGlow;

  gl_FragColor = vec4(pow(aces(color * uExposure), vec3(1. / 2.2)), 1.);
}`;

const LIGHTING = {
  keyDir:  [-.52, .64, .56],
  keyCol:  [2.35, 1.62, .92],
  fillDir: [.78, .18, -.52],
  fillCol: [.22, .30, .46],
  rim:     [.26, .16, .07],
  sky:     [.10, .12, .17],
  ground:  [.045, .038, .034],
};

let skinCanvas = null;
const renderers = [];

function createRenderer(canvas, options) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: true, powerPreference: 'low-power' });
  if (!gl) return null;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SOURCE));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) {
    console.warn('Lodestar: WebGL program failed —', error.message);
    return null;
  }
  gl.useProgram(program);

  const attribs = {
    aPos: gl.getAttribLocation(program, 'aPos'),
    aNor: gl.getAttribLocation(program, 'aNor'),
    aUV: gl.getAttribLocation(program, 'aUV'),
  };
  const uniformNames = ['uProj','uView','uModel','uCam','uBase','uKeyDir','uKeyCol','uFillDir','uFillCol',
    'uRim','uSky','uGround','uRough','uMetal','uUseTex','uSoot','uGlow','uExposure','uTex'];
  const uniforms = {};
  for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name);

  const uintSupported = !!gl.getExtension('OES_element_index_uint');

  const groups = VEHICLE.filter(part => part.tags.includes(options.scene)).map(part => ({
    part,
    subs: part.subs.map(sub => {
      const buffers = {
        pos: gl.createBuffer(), nor: gl.createBuffer(), uv: gl.createBuffer(), idx: gl.createBuffer(),
      };
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.pos);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sub.geo.p), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.nor);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sub.geo.n), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.uv);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sub.geo.t), gl.STATIC_DRAW);
      const big = sub.geo.p.length / 3 > 65535;
      const indices = big && uintSupported ? new Uint32Array(sub.geo.i) : new Uint16Array(sub.geo.i);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      return {
        buffers, mat: sub.mat, hinge: sub.hinge,
        count: sub.geo.i.length,
        type: big && uintSupported ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      };
    }),
  }));

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 203, 208, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
    || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  function uploadSkin(source) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    if (aniso) {
      gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    }
  }

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.031, 0.033, 0.040, 1);

  function bind(buffer, location, size) {
    if (location < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  function resize(size) {
    let width = size && size[0], height = size && size[1];
    if (!width || !height) {
      const rect = canvas.getBoundingClientRect();
      width = rect.width; height = rect.height;
    }
    const ratio = Math.min(devicePixelRatio || 1, innerWidth < 900 ? 1.25 : 1.6);
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
    return false;
  }

  function draw(state, size) {
    resize(size);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);

    const pitch = state.pitch, yaw = state.yaw, dist = state.dist;
    const target = [0, state.targetY, 0];
    const eye = [
      target[0] + dist * Math.cos(pitch) * Math.sin(yaw),
      target[1] + dist * Math.sin(pitch),
      target[2] + dist * Math.cos(pitch) * Math.cos(yaw),
    ];
    const proj = perspective(state.fov * Math.PI / 180, canvas.width / canvas.height, 1, 2600);
    if (state.shiftX) proj[8] = -state.shiftX;
    const view = lookAt(eye, target);

    gl.uniformMatrix4fv(uniforms.uProj, false, proj);
    gl.uniformMatrix4fv(uniforms.uView, false, view);
    gl.uniform3fv(uniforms.uCam, eye);
    gl.uniform3fv(uniforms.uKeyDir, LIGHTING.keyDir);
    gl.uniform3fv(uniforms.uKeyCol, LIGHTING.keyCol);
    gl.uniform3fv(uniforms.uFillDir, LIGHTING.fillDir);
    gl.uniform3fv(uniforms.uFillCol, LIGHTING.fillCol);
    gl.uniform3fv(uniforms.uRim, LIGHTING.rim);
    gl.uniform3fv(uniforms.uSky, LIGHTING.sky);
    gl.uniform3fv(uniforms.uGround, LIGHTING.ground);
    gl.uniform1f(uniforms.uExposure, state.exposure);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.uTex, 0);

    const offsets = separation(state.progress || 0);

    for (const group of groups) {
      const id = group.part.id;
      const lift = group.part.static ? 0 : (offsets[id] || 0);
      const side = group.part.lateral * (offsets.lateral || 0);
      const base = translation(side, lift, 0);
      for (const sub of group.subs) {
        const model = sub.hinge ? multiply(base, sub.hinge(offsets.deploy || 0)) : base;
        gl.uniformMatrix4fv(uniforms.uModel, false, model);
        gl.uniform3fv(uniforms.uBase, sub.mat.color);
        gl.uniform1f(uniforms.uRough, sub.mat.rough);
        gl.uniform1f(uniforms.uMetal, sub.mat.metal);
        gl.uniform1f(uniforms.uUseTex, sub.mat.tex ? 1 : 0);
        gl.uniform1f(uniforms.uSoot, sub.mat.soot ? 1 : 0);
        gl.uniform1f(uniforms.uGlow, sub.mat.glow || 0);
        bind(sub.buffers.pos, attribs.aPos, 3);
        bind(sub.buffers.nor, attribs.aNor, 3);
        bind(sub.buffers.uv, attribs.aUV, 2);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sub.buffers.idx);
        gl.drawElements(gl.TRIANGLES, sub.count, sub.type, 0);
      }
    }
  }

  const api = { draw, uploadSkin, canvas, gl, lost: false };
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); api.lost = true; options.onLost && options.onLost(); });
  renderers.push(api);
  if (skinCanvas) uploadSkin(skinCanvas);
  return api;
}

/* The skin is painted when the first scene actually needs it, and repainted
   once Archivo has resolved so the wordmark is set in the page's own type. */
function ensureSkin() {
  if (!skinCanvas) skinCanvas = paintSkin();
  return skinCanvas;
}

/* The wordmark is set in Archivo. Waiting a moment for the face costs nothing
   visible; painting twice costs a 1024² canvas and a texture upload twice. */
function whenSkinTypeReady(callback) {
  if (!document.fonts || document.fonts.check('700 66px Archivo')) return callback();
  let done = false;
  const go = () => { if (!done) { done = true; callback(); } };
  document.fonts.ready.then(go);
  setTimeout(go, 700);
}

/* ── 6. scenes ─────────────────────────────────────────────────── */

const scenes = [];

function createScene(canvas, options) {
  const state = Object.assign({
    yaw: -.6, pitch: .06, dist: 170, targetY: 34, fov: 26, exposure: 1, progress: 0,
  }, options.state);

  let renderer = null;
  let started = false;
  let dirty = true;
  let visible = false;
  let previous = 0;
  let size = [0, 0];

  const layout = () => { if (options.layout) options.layout(state, size); };

  /* A scene pays for its context, its buffers and its share of the skin only
     when it is about to be seen. Building all three up front costs more
     blocking time on load than the rest of the page put together. */
  function build() {
    const rect = canvas.getBoundingClientRect();
    size = [rect.width, rect.height];
    ensureSkin();
    renderer = createRenderer(canvas, options);
    if (!renderer) { options.onFail && options.onFail(); return; }
    options.onReady && options.onReady();
    layout();
    requestAnimationFrame(frame);
  }

  function start() {
    if (started) return;
    started = true;
    whenSkinTypeReady(() => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(build, { timeout: 500 });
      else setTimeout(build, 0);
    });
  }

  const minFrame = options.maxFps ? 1000 / options.maxFps : 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!renderer || !visible || document.hidden || renderer.lost) return;
    if (minFrame && !dirty && now - previous < minFrame) return;
    const delta = Math.min((now - previous) / 1000, .05);
    previous = now;
    if (options.animate) dirty = options.animate(state, delta) || dirty;
    if (dirty) { layout(); renderer.draw(state, size); dirty = false; }
  }

  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) start();
    dirty = true;
  }, { rootMargin: '200px' }).observe(canvas);

  new ResizeObserver(entries => {
    const box = entries[0].contentRect;
    size = [box.width, box.height];
    dirty = true;
  }).observe(canvas);

  const scene = {
    state,
    invalidate() { dirty = true; },
    get ready() { return !!renderer; },
  };
  scenes.push(scene);
  return scene;
}

/* — hero — */
const heroCanvas = document.querySelector('#hero-canvas');
const heroStage = document.querySelector('.hero-stage');
const heroPointer = { x: 0, y: 0, moved: false };
let heroDrift = 0;
const hero = createScene(heroCanvas, {
  scene: 'hero',
  maxFps: 30,
  state: { yaw: -.72, pitch: .055, fov: 24, exposure: 1.02, shiftX: 0 },
  layout(state, size) {
    const wide = size[0] / Math.max(size[1], 1) > 1.25;
    Object.assign(state, frameFor(-7, 80, state.fov, wide ? .86 : .94));
    state.shiftX = wide ? .34 : 0;
  },
  animate(state) {
    /* A continuous drift costs a redraw every frame on every device; the hero
       is a still until the pointer actually moves it. */
    if (reduced || !heroPointer.moved) return false;
    heroPointer.moved = false;
    heroDrift += .016;
    state.yaw = -.72 + heroPointer.x * .09 + Math.sin(heroDrift) * .004;
    state.pitch = .055 + heroPointer.y * .024;
    return true;
  },
  onReady() { heroStage.classList.add('webgl-ready'); },
  onFail() { heroStage.classList.add('no-webgl'); },
  onLost() { heroStage.classList.add('no-webgl'); },
});

addEventListener('pointermove', event => {
  if (reduced || event.pointerType !== 'mouse') return;
  heroPointer.x = (event.clientX / innerWidth - .5);
  heroPointer.y = (event.clientY / innerHeight - .5);
  heroPointer.moved = true;
}, { passive: true });

/* — exploded view, driven by scroll — */
const explodeSection = document.querySelector('#stack');
const explodeCanvas = document.querySelector('#explode-canvas');
const explodeTrack = document.querySelector('.explode-track');
const stageItems = [...document.querySelectorAll('.stage-item')];
const readoutStep = document.querySelector('#readout-step');
const readoutValue = document.querySelector('#readout-value');
const stepButtons = [...document.querySelectorAll('[data-step]')];
const STEP_BANDS = [0, .19, .39, .60, .82];

const explode = createScene(explodeCanvas, {
  scene: 'explode',
  state: { yaw: -.38, pitch: .02, fov: 25, exposure: 1.02, progress: 0 },
  layout(state) {
    Object.assign(state, frameFor(-7, 80 + separation(state.progress).top, state.fov, .90));
  },
  onFail() { explodeSection.classList.add('no-webgl'); },
  onLost() { explodeSection.classList.add('no-webgl'); },
});

function applyProgress(progress) {
  const p = clamp01(progress);
  explode.state.progress = p;
  explode.state.yaw = reduced ? -.38 : mix(-.46, .20, smooth(p));
  explode.invalidate();

  let active = 0;
  for (let k = 0; k < STEP_BANDS.length; k++) if (p >= STEP_BANDS[k]) active = k;
  stageItems.forEach((item, index) => {
    const on = index === active;
    item.classList.toggle('is-active', on);
    item.setAttribute('aria-current', on ? 'step' : 'false');
  });
  stepButtons.forEach((button, index) => button.setAttribute('aria-pressed', index === active));
  if (readoutStep) readoutStep.textContent = `${String(active + 1).padStart(2, '0')} / 05`;
  if (readoutValue) readoutValue.textContent = `${Math.round(p * 100)}%`;
}

const progressBar = document.querySelector('.progress');
let scrollable = 0;
let trackVisible = false;
if (explodeTrack) {
  new IntersectionObserver(entries => { trackVisible = entries[0].isIntersecting; })
    .observe(explodeTrack);
}

function measurePage() {
  scrollable = document.documentElement.scrollHeight - innerHeight;
}

/* The observer fires after layout has settled — reading the height there is
   free, while reading it from script forces a flush. */
new ResizeObserver(() => { measurePage(); onScroll(); }).observe(document.documentElement);

let scrollPending = false;
function onScroll() {
  if (scrollPending) return;
  scrollPending = true;
  requestAnimationFrame(() => {
    scrollPending = false;
    /* reads first … */
    const offset = scrollY;
    const rect = reduced || !trackVisible ? null : explodeTrack.getBoundingClientRect();
    /* … then writes, so the frame never has to flush layout twice */
    if (progressBar) progressBar.style.width = `${scrollable > 0 ? clamp01(offset / scrollable) * 100 : 0}%`;
    if (rect) {
      const span = rect.height - innerHeight;
      applyProgress(span > 0 ? -rect.top / span : 0);
    }
  });
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => { measurePage(); onScroll(); });

stepButtons.forEach((button, index) => {
  button.addEventListener('click', () => applyProgress(index === stepButtons.length - 1 ? 1 : STEP_BANDS[index] + .02));
});

/* — interactive viewer — */
const viewerCanvas = document.querySelector('#viewer-canvas');
const viewerShell = document.querySelector('.viewer-shell');
const spinButton = document.querySelector('#viewer-spin');
const resetButton = document.querySelector('#viewer-reset');
const viewerAngle = document.querySelector('#viewer-angle');
const VIEWER_HOME = { yaw: -.65, pitch: .08, zoom: 1 };

const viewer = createScene(viewerCanvas, {
  scene: 'viewer',
  maxFps: 40,
  state: Object.assign({ fov: 26, exposure: 1.04, progress: 0 }, VIEWER_HOME),
  layout(state) {
    Object.assign(state, frameFor(-7, 80, state.fov, .90 * state.zoom));
  },
  animate(state, delta) {
    if (!viewerSpinning) return false;
    state.yaw += delta * .22;
    updateAngle();
    return true;
  },
  onFail() { viewerShell.classList.add('no-webgl'); disableViewerControls(); },
  onLost() { viewerShell.classList.add('no-webgl'); disableViewerControls(); },
});

let viewerSpinning = false;

function disableViewerControls() {
  [spinButton, resetButton].forEach(button => { if (button) button.disabled = true; });
}

function updateAngle() {
  if (!viewerAngle) return;
  const degrees = Math.round((-viewer.state.yaw * 180 / Math.PI) % 360 + 360) % 360;
  viewerAngle.textContent = `${String(degrees).padStart(3, '0')}°`;
}

function setSpin(on) {
  viewerSpinning = on;
  if (spinButton) {
    spinButton.setAttribute('aria-pressed', String(on));
    spinButton.querySelector('span').textContent = on ? 'Ⅱ' : '▷';
    spinButton.firstChild.textContent = on ? 'Pause rotation ' : 'Auto rotation ';
  }
}

{
  let dragging = false, lastX = 0, lastY = 0;

  viewerCanvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    dragging = true;
    lastX = event.clientX; lastY = event.clientY;
    viewerCanvas.setPointerCapture(event.pointerId);
    setSpin(false);
  });
  viewerCanvas.addEventListener('pointermove', event => {
    if (!dragging) return;
    event.preventDefault();
    viewer.state.yaw += (event.clientX - lastX) * .007;
    viewer.state.pitch = Math.max(-.5, Math.min(.85, viewer.state.pitch + (event.clientY - lastY) * .004));
    lastX = event.clientX; lastY = event.clientY;
    viewer.invalidate();
    updateAngle();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name =>
    viewerCanvas.addEventListener(name, () => { dragging = false; }));

  viewerCanvas.addEventListener('keydown', event => {
    const step = event.shiftKey ? .32 : .12;
    let handled = true;
    switch (event.key) {
      case 'ArrowLeft':  viewer.state.yaw -= step; break;
      case 'ArrowRight': viewer.state.yaw += step; break;
      case 'ArrowUp':    viewer.state.pitch = Math.min(.85, viewer.state.pitch + step * .5); break;
      case 'ArrowDown':  viewer.state.pitch = Math.max(-.5, viewer.state.pitch - step * .5); break;
      case 'r': case 'R': Object.assign(viewer.state, VIEWER_HOME); setSpin(false); break;
      case '+': case '=': viewer.state.zoom = Math.min(1.7, viewer.state.zoom + .12); break;
      case '-': case '_': viewer.state.zoom = Math.max(.7, viewer.state.zoom - .12); break;
      default: handled = false;
    }
    if (handled) { event.preventDefault(); setSpin(false); viewer.invalidate(); updateAngle(); }
  });

  if (spinButton) spinButton.addEventListener('click', () => setSpin(!viewerSpinning));
  if (resetButton) resetButton.addEventListener('click', () => {
    Object.assign(viewer.state, VIEWER_HOME);
    setSpin(false);
    viewer.invalidate();
    updateAngle();
  });
  updateAngle();
}

/* — reduced motion — */
function applyMotionPreference() {
  document.documentElement.classList.toggle('reduced-motion', reduced);
  if (reduced) {
    setSpin(false);
    applyProgress(0);
  } else {
    onScroll();
  }
}

motionQuery.addEventListener('change', event => {
  reduced = event.matches;
  applyMotionPreference();
});

/* — reveal on scroll, same contract as the other experiments — */
const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) { entry.target.classList.add('visible'); revealObserver.unobserve(entry.target); }
}), { threshold: .14 });
document.querySelectorAll('.reveal').forEach(element => revealObserver.observe(element));

/* — boot — */
applyMotionPreference();
