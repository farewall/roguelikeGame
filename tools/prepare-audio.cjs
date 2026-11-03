'use strict';
// Original, short synthesized cues; no external recordings or runtime synthesis.
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '../miniprogram/audio');
fs.mkdirSync(root, { recursive: true });
const rate = 11025;
const cues = { attack: [0.10, 185, 540], hurt: [0.10, 88, 120], upgrade: [0.24, 440, 660], victory: [0.32, 330, 660], death: [0.28, 130, 65] };
for (const [name, [duration, start, end]] of Object.entries(cues)) {
  const count = Math.round(rate * duration), data = Buffer.alloc(44 + count * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + count * 2, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(count * 2, 40);
  let phase = 0;
  for (let i = 0; i < count; i++) {
    const t = i / count, frequency = start + (end - start) * t;
    phase += 2 * Math.PI * frequency / rate;
    const envelope = Math.min(1, t * 45) * Math.pow(1 - t, 2.5);
    const sample = (Math.sin(phase) + 0.22 * Math.sin(phase * 2.76)) * envelope * 0.4;
    data.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(root, name + '.wav'), data);
}
