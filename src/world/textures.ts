// Canvas-generated textures for things no photoscan covers: foliage cards, signage,
// whiteboards, book spines, noticeboards, blood, chain-link, the flashlight cookie.
import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let seed = 1337;
/** Deterministic random so procedural textures look the same every run. */
export function rand(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

/** Palm frond: a midrib with drooping leaflets, on transparent background. */
export function frondTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 1024);
  g.translate(128, 1024);
  for (let i = 0; i < 70; i++) {
    const y = -40 - i * 13;
    const len = 110 * Math.sin((i / 70) * Math.PI) + 20;
    for (const side of [-1, 1]) {
      const hue = 85 + rand() * 25;
      g.strokeStyle = `hsl(${hue}, ${40 + rand() * 20}%, ${18 + rand() * 18}%)`;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(0, y);
      g.quadraticCurveTo(side * len * 0.6, y - 10, side * len, y + 25 + rand() * 15);
      g.stroke();
    }
  }
  g.strokeStyle = '#5b5a2e';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -1000);
  g.stroke();
  return tex(c);
}

/** Dense broadleaf/pine foliage clump. */
export function foliageTexture(pine = false): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  for (let i = 0; i < (pine ? 2600 : 1400); i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 230;
    const x = 256 + Math.cos(a) * r;
    const y = 256 + Math.sin(a) * r;
    g.fillStyle = `hsl(${pine ? 95 + rand() * 20 : 80 + rand() * 40}, ${35 + rand() * 25}%, ${12 + rand() * 22}%)`;
    g.save();
    g.translate(x, y);
    g.rotate(rand() * Math.PI);
    if (pine) g.fillRect(-1, -9, 2, 18);
    else {
      g.beginPath();
      g.ellipse(0, 0, 9, 4, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  return tex(c);
}

export function signTexture(lines: { text: string; size: number; color?: string; font?: string }[], bg: string, w = 1024, h = 256, border?: string): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = 10;
    g.strokeRect(12, 12, w - 24, h - 24);
  }
  const total = lines.reduce((s, l) => s + l.size * 1.25, 0);
  let y = (h - total) / 2;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (const l of lines) {
    g.fillStyle = l.color ?? '#fff';
    g.font = `${l.font ?? '600'} ${l.size}px "Georgia", serif`;
    g.fillText(l.text, w / 2, y);
    y += l.size * 1.25;
  }
  return tex(c);
}

/** Whiteboard with handwritten-ish marker text. */
export function whiteboardTexture(lines: string[], color = '#1d3b8a'): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = '#f4f5f2';
  g.fillRect(0, 0, 1024, 512);
  // Faint ghosting from old wiped writing.
  g.globalAlpha = 0.06;
  g.fillStyle = '#333';
  for (let i = 0; i < 40; i++) g.fillRect(rand() * 1024, rand() * 512, rand() * 200, 3);
  g.globalAlpha = 1;
  g.fillStyle = color;
  g.font = 'italic 46px "Comic Sans MS", "Segoe Print", cursive';
  lines.forEach((l, i) => g.fillText(l, 50, 90 + i * 70));
  return tex(c);
}

export function booksTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = '#2a2018';
  g.fillRect(0, 0, 1024, 256);
  for (let shelf = 0; shelf < 2; shelf++) {
    let x = 0;
    while (x < 1024) {
      const w = 10 + rand() * 22;
      const h = 90 + rand() * 30;
      const y = shelf * 128 + 124 - h;
      g.fillStyle = `hsl(${rand() * 360}, ${25 + rand() * 40}%, ${18 + rand() * 30}%)`;
      g.fillRect(x, y, w - 1.5, h);
      g.fillStyle = 'rgba(255,240,200,0.5)';
      g.fillRect(x + 2, y + 12, w - 6, 3);
      g.fillRect(x + 2, y + h - 18, w - 6, 2);
      x += w + (rand() < 0.08 ? 20 : 0);
    }
  }
  return tex(c);
}

/** Noticeboard: cork with pinned posters and student photos. */
export function noticeboardTexture(opts: { title: string; erased?: boolean; wet?: number }): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = '#a77b4f';
  g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(${60 + rand() * 60},${40 + rand() * 30},20,0.25)`;
    g.fillRect(rand() * 1024, rand() * 512, 2, 2);
  }
  const paper = (x: number, y: number, w: number, h: number, col: string, rot: number, draw?: () => void) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(-w / 2 + 4, -h / 2 + 5, w, h);
    g.fillStyle = col;
    g.fillRect(-w / 2, -h / 2, w, h);
    draw?.();
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.arc(0, -h / 2 + 8, 6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  paper(200, 140, 300, 200, '#fff7d6', -0.03, () => {
    g.fillStyle = '#123f6b';
    g.font = 'bold 34px Georgia';
    g.textAlign = 'center';
    g.fillText(opts.title, 0, -40);
    g.font = '20px Georgia';
    g.fillText('Clubs fair · Friday · Courtyard', 0, 10);
    g.fillText('Smoothies at the café!', 0, 45);
  });
  paper(560, 130, 220, 160, '#d9f0ff', 0.05, () => {
    g.fillStyle = '#0b3b2e';
    g.font = 'bold 26px Georgia';
    g.textAlign = 'center';
    g.fillText('FOOTBALL TRIALS', 0, -20);
    g.font = '18px Georgia';
    g.fillText('5G pitch · after lunch', 0, 15);
  });
  // Student photo strip: Amara is the second photo.
  const names = ['Theo C.', 'Amara K.', 'Kai R.', 'Jada M.'];
  names.forEach((n, i) => {
    paper(130 + i * 200, 380, 150, 170, '#fafafa', (rand() - 0.5) * 0.12, () => {
      const isAmara = i === 1;
      if (isAmara && opts.erased) {
        g.fillStyle = '#e8e8e8';
        g.fillRect(-60, -70, 120, 110);
        g.strokeStyle = '#111';
        g.lineWidth = 6;
        for (let k = 0; k < 14; k++) {
          g.beginPath();
          g.moveTo(-60 + rand() * 120, -70 + rand() * 110);
          g.lineTo(-60 + rand() * 120, -70 + rand() * 110);
          g.stroke();
        }
      } else {
        const grad = g.createLinearGradient(0, -70, 0, 40);
        grad.addColorStop(0, '#87b5d8');
        grad.addColorStop(1, '#f2e6c9');
        g.fillStyle = grad;
        g.fillRect(-60, -70, 120, 110);
        g.fillStyle = ['#3b2418', '#4a2c1c', '#2c1a10', '#5a3a24'][i];
        g.beginPath();
        g.arc(0, -25, 22, 0, Math.PI * 2);
        g.fill();
        g.fillRect(-30, 0, 60, 40);
      }
      g.fillStyle = '#222';
      g.font = '18px Georgia';
      g.textAlign = 'center';
      g.fillText(isAmara && opts.erased ? '' : n, 0, 65);
    });
  });
  if (opts.wet) {
    g.globalAlpha = 0.35 * opts.wet;
    g.fillStyle = '#3a2a1a';
    for (let i = 0; i < 18; i++) g.fillRect(rand() * 1024, 0, 4 + rand() * 10, 200 + rand() * 300);
    g.globalAlpha = 1;
  }
  return tex(c);
}

/** Sepia photograph of the 1840s school, with one face smudged out. */
export function oldPhotoTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 384);
  g.fillStyle = '#b89a6a';
  g.fillRect(0, 0, 512, 384);
  g.fillStyle = '#d8c39a';
  g.fillRect(20, 20, 472, 300);
  g.fillStyle = '#8f7650';
  g.fillRect(20, 200, 472, 120);
  g.fillStyle = '#6b5638';
  g.fillRect(150, 60, 220, 140);
  for (let i = 0; i < 14; i++) {
    const x = 50 + i * 31;
    g.fillStyle = '#3d2e1c';
    g.beginPath();
    g.arc(x, 235, 10, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x - 10, 245, 20, 50);
  }
  g.fillStyle = 'rgba(30,20,10,0.9)';
  g.beginPath();
  g.arc(50 + 6 * 31, 235, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3a2a18';
  g.font = 'italic 22px Georgia';
  g.textAlign = 'center';
  g.fillText("King's College School, Nassau — 1846", 256, 355);
  return tex(c);
}

export function bloodSplatTexture(kind: 'splat' | 'pool' | 'drip' | 'smear'): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const red = () => `rgba(${70 + rand() * 50}, ${rand() * 8}, ${rand() * 8}, ${0.75 + rand() * 0.25})`;
  g.translate(256, 256);
  if (kind === 'pool') {
    // Thick and dark in the middle, thinner (lighter, drying) at the rim.
    const grad = g.createRadialGradient(0, 0, 20, 0, 0, 200);
    grad.addColorStop(0, 'rgba(45, 0, 0, 1)');
    grad.addColorStop(0.7, 'rgba(70, 2, 2, 0.97)');
    grad.addColorStop(1, 'rgba(110, 10, 8, 0.85)');
    g.fillStyle = grad;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) {
      const r = 160 + Math.sin(a * 3) * 30 + rand() * 30;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.fill();
  } else if (kind === 'drip') {
    for (let i = 0; i < 12; i++) {
      const x = -150 + rand() * 300;
      const w = 6 + rand() * 18;
      const len = 120 + rand() * 300;
      g.fillStyle = red();
      g.fillRect(x - w / 2, -240, w, len);
      g.beginPath();
      g.arc(x, -240 + len, w * 0.7, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = red();
    g.beginPath();
    g.ellipse(0, -220, 200, 40, 0, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'smear') {
    for (let i = 0; i < 40; i++) {
      g.fillStyle = red();
      g.fillRect(-220 + i * 10, -40 + (rand() - 0.5) * 40, 14, 60 + rand() * 30);
    }
  } else {
    g.fillStyle = red();
    g.beginPath();
    g.arc(0, 0, 70 + rand() * 30, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 60; i++) {
      const a = rand() * Math.PI * 2;
      const r = 60 + rand() * 180;
      g.fillStyle = red();
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 3 + rand() * 16 * (1 - r / 260), 0, Math.PI * 2);
      g.fill();
    }
  }
  return tex(c);
}

export function chainLinkTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = '#b8bcbf';
  g.lineWidth = 3;
  for (let i = -128; i < 256; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 128, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(i + 128, 0);
    g.lineTo(i, 128);
    g.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function waterStainTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.translate(256, 256);
  for (let ring = 6; ring > 0; ring--) {
    g.fillStyle = `rgba(${90 - ring * 6}, ${70 - ring * 5}, 40, ${0.08 + (6 - ring) * 0.03})`;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.15) {
      const r = ring * 38 + Math.sin(a * 5 + ring) * 12 + rand() * 8;
      if (a === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
  }
  return tex(c);
}

/** Flashlight gobo: hot centre, soft rings, a little lens dirt. */
export function cookieTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, '#f2f2f2');
  grad.addColorStop(0.45, '#bdbdbd');
  grad.addColorStop(0.55, '#d8d8d8');
  grad.addColorStop(0.8, '#3a3a3a');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // Lens dirt: a few large, very faint smudges (sharp dots read as polka dots on walls).
  for (let i = 0; i < 6; i++) {
    const x = 70 + rand() * 116;
    const y = 70 + rand() * 116;
    const r = 18 + rand() * 30;
    const s = g.createRadialGradient(x, y, 0, x, y, r);
    s.addColorStop(0, 'rgba(0,0,0,0.07)');
    s.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = s;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return tex(c);
}

/** Wet tissue/muscle albedo for gore meshes. */
export function fleshTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#5a0a0a';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = `rgba(${120 + rand() * 80}, ${10 + rand() * 30}, ${15 + rand() * 25}, 0.5)`;
    g.lineWidth = 1 + rand() * 3;
    const x = rand() * 512;
    const y = rand() * 512;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 60, y + rand() * 30);
    g.stroke();
  }
  for (let i = 0; i < 80; i++) {
    g.fillStyle = `rgba(230, 210, 170, ${rand() * 0.4})`;
    g.beginPath();
    g.ellipse(rand() * 512, rand() * 512, 4 + rand() * 12, 2 + rand() * 5, rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Pitch/court line overlay is drawn with geometry; this is the goal net. */
export function netTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = 'rgba(245,245,245,0.9)';
  g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function lockerTexture(color: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 512);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 40; y < 110; y += 12) g.fillRect(70, y, 116, 5);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(0, 0, 4, 512);
  g.fillRect(252, 0, 4, 512);
  g.fillStyle = '#c9c9c9';
  g.fillRect(200, 240, 16, 50);
  return tex(c);
}

export function clockTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#fafafa';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#222';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.fillRect(128 + Math.sin(a) * 100 - 3, 128 - Math.cos(a) * 100 - 10, 6, 20);
  }
  return tex(c);
}

/** Tileable ripple normal map (sum of integer-frequency waves so it wraps seamlessly). */
export function waterNormalTexture(size = 256): THREE.CanvasTexture {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  const waves: [number, number, number, number][] = [];
  for (let i = 0; i < 14; i++) {
    const kx = Math.round((rand() - 0.5) * 16);
    const ky = Math.round((rand() - 0.5) * 16) || 1;
    waves.push([kx, ky, 0.6 / Math.hypot(kx, ky), rand() * Math.PI * 2]);
  }
  const h = (x: number, y: number) => {
    let s = 0;
    for (const [kx, ky, a, ph] of waves) s += a * Math.sin(((kx * x + ky * y) / size) * Math.PI * 2 + ph);
    return s;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const n = new THREE.Vector3(-dx * 6, -dy * 6, 1).normalize();
      const k = (y * size + x) * 4;
      img.data[k] = (n.x * 0.5 + 0.5) * 255;
      img.data[k + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[k + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Vertical ribbed pink cladding (1 tile = 1 m wide). */
export function ribbedCladdingTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const ribs = 8;
  for (let i = 0; i < ribs; i++) {
    const x = (i * 256) / ribs;
    const w = 256 / ribs;
    const grad = g.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#e2aba0');
    grad.addColorStop(0.5, '#efc2b6');
    grad.addColorStop(1, '#c98f84');
    g.fillStyle = grad;
    g.fillRect(x, 0, w, 256);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Black-and-white Portuguese wave mosaic paving (1 tile = 2 m). */
export function waveMosaicTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#e9e6df';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#26262a';
  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    g.beginPath();
    g.moveTo(0, y + 16);
    for (let x = 0; x <= 256; x += 4) g.lineTo(x, y + 16 + Math.sin(((x + (row % 2) * 64) / 256) * Math.PI * 4) * 9);
    for (let x = 256; x >= 0; x -= 4) g.lineTo(x, y + 28 + Math.sin(((x + (row % 2) * 64) / 256) * Math.PI * 4) * 9);
    g.closePath();
    g.fill();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
