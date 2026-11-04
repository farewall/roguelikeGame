/* Shared four-direction animation controller; built into miniprogram/lib. */
(function(root) {
  const clips = {
    idle: { fps: 5, loop: true },
    move: { fps: 10, loop: true },
    attack: { fps: 12, loop: false },
    hurt: { fps: 16, loop: false },
    awaken: { fps: 6, loop: false },
    death: { fps: 6, loop: false }
  };
  function facing(dx, dy, fallback = 'down') {
    if (!dx && !dy) return fallback;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  class PanguAnimation {
    constructor() { this.state = 'idle'; this.direction = 'down'; this.moveDirection = 'down'; this.moving = false; this.elapsed = 0; }
    move(dx, dy) {
      this.moving = Boolean(dx || dy);
      this.moveDirection = facing(dx, dy, this.moveDirection);
      if (this.state === 'idle' || this.state === 'move') {
        this.direction = this.moveDirection;
        this.play(this.moving ? 'move' : 'idle', false);
      }
    }
    play(state, restart = true) {
      if (!clips[state]) throw new Error('Unknown animation: ' + state);
      if (restart || this.state !== state) this.elapsed = 0;
      this.state = state;
    }
    attack(dx, dy) {
      if (this.state === 'death' || this.state === 'hurt' || this.state === 'awaken') return;
      this.direction = facing(dx, dy, this.moveDirection);
      this.play('attack');
    }
    hurt() { if (this.state !== 'death') this.play('hurt'); }
    awaken() { if (this.state !== 'death') this.play('awaken'); }
    die() { this.play('death'); }
    update(dt) {
      this.elapsed += Math.max(0, dt);
      const clip = clips[this.state];
      if (!clip.loop && this.elapsed >= 6 / clip.fps && this.state !== 'death') {
        this.direction = this.moveDirection;
        this.play(this.moving ? 'move' : 'idle');
      }
      return this.frame();
    }
    frame() {
      const clip = clips[this.state], raw = Math.floor(this.elapsed * clip.fps);
      return { action: this.state, direction: this.direction, index: clip.loop ? raw % 6 : Math.min(5, raw) };
    }
  }
  const api = { PanguAnimation, facing, clips };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PanguActions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
