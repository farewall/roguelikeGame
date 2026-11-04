import { Color, Graphics } from 'cc';
export function rgba(hex: number, alpha = 1) { return new Color((hex >>> 16) & 255, (hex >>> 8) & 255, hex & 255, Math.round(Math.max(0, Math.min(1, alpha)) * 255)); }
// Batched geometry commands rendered by Cocos Graphics. The layout uses a top-left origin.
export class DrawList {
  private commands: Array<[string, number[]]> = [];
  private filling = false;
  private fill = rgba(0xffffff);
  private stroke = rgba(0xffffff);
  private width = 0;
  constructor(public graphics: Graphics) {}
  clear() { this.commands = []; this.filling = false; this.width = 0; this.graphics.clear(); }
  lineStyle(width: number, color?: number, alpha = 1) { if (!this.filling) this.flush(); this.width = width; if (color !== undefined) this.stroke = rgba(color, alpha); }
  beginFill(color: number, alpha = 1) { this.flush(); this.fill = rgba(color, alpha); this.filling = true; }
  endFill() { this.flush(); this.filling = false; }
  private command(name: string, args: number[], shape = false) {
    if (!this.filling && (shape || name === 'moveTo')) this.flush();
    this.commands.push([name, args]); if (shape && !this.filling) this.flush();
  }
  moveTo(x: number, y: number) { this.command('moveTo', [x, -y]); }
  lineTo(x: number, y: number) { this.command('lineTo', [x, -y]); }
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) { this.command('bezierCurveTo', [x1, -y1, x2, -y2, x, -y]); }
  closePath() { this.command('close', []); }
  drawRect(x: number, y: number, w: number, h: number) { this.command('rect', [x, -y - h, w, h], true); }
  drawRoundedRect(x: number, y: number, w: number, h: number, r: number) { this.command('roundRect', [x, -y - h, w, h, r], true); }
  drawCircle(x: number, y: number, r: number) { this.command('circle', [x, -y, Math.max(0.01, r)], true); }
  drawEllipse(x: number, y: number, rx: number, ry: number) { this.command('ellipse', [x, -y, rx, ry], true); }
  arc(x: number, y: number, r: number, from: number, to: number) { this.command('arc', [x, -y, r, -from, -to, 1]); }
  drawPolygon(points: number[]) {
    if (!points.length) return; this.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) this.lineTo(points[i], points[i + 1]); this.closePath(); if (!this.filling) this.flush();
  }
  flush() {
    if (!this.commands.length) return;
    const g: any = this.graphics;
    for (const [method, args] of this.commands) g[method](...args);
    g.fillColor = this.fill; g.strokeColor = this.stroke; g.lineWidth = this.width;
    if (this.filling) g.fill(); if (this.width > 0) g.stroke(); this.commands = [];
  }
}
