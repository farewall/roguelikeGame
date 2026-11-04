'use strict';
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
function screen(data) {
  if (data.showSettings) return 'settings:' + Boolean(data.confirmExit);
  if (data.showArchive) return 'archive:' + data.archiveTab;
  if (data.showEnding) return 'ending';
  if (data.showMemory) return 'memory:' + data.stage + ':' + data.rewardSelectedId;
  if (data.showChoice) return 'choice:' + data.choiceToken;
  if (data.showIntro) return 'intro';
  return data.view;
}
function epoch(data) { return (data.inputEpoch || 0) + ':' + screen(data); }
class NativeInput {
  constructor(api, controller, presentation) {
    this.api = api; this.controller = controller; this.presentation = presentation; this.presses = new Map(); this.joyId = null; this.skillId = null;
    this.handlers = { start: e => this.start(e), move: e => this.move(e), end: e => this.end(e), cancel: () => this.cancel() };
    api.onTouchStart(this.handlers.start); api.onTouchMove(this.handlers.move); api.onTouchEnd(this.handlers.end); api.onTouchCancel(this.handlers.cancel);
  }
  point(touch) { return { x: touch.clientX / this.controller.rpxScale, y: touch.clientY / this.controller.rpxScale }; }
  region(point) { return this.presentation.regions.slice().reverse().find(r => r.enabled !== false && inside(point, r)); }
  start(event) {
    if (this.hidden) return;
    for (const touch of event.changedTouches || event.touches || []) {
      const p = this.point(touch), region = this.region(p), c = this.controller;
      if (region) {
        if (region.type === 'skill') {
          if (this.skillId !== null || c.isBlocked() || !c.data.skillReady) continue;
          this.skillId = touch.identifier; c.aimSkill();
        }
        this.presses.set(touch.identifier, { id: region.id, epoch: epoch(c.data), x: touch.clientX, y: touch.clientY, lastY: touch.clientY, moved: false });
        if (region.type === 'volume') this.volume(p, region);
      } else if (!c.isBlocked() && this.joyId === null && inside(p, c.layout.joystick)) {
        this.joyId = touch.identifier; c.onTouchStart({ touches: [touch] });
      }
    }
  }
  move(event) {
    if (this.hidden) return;
    if (this.joyId !== null) this.controller.onTouchMove({ touches: event.touches || [] });
    for (const touch of event.changedTouches || event.touches || []) {
      const press = this.presses.get(touch.identifier); if (!press) continue;
      if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 12) press.moved = true;
      const region = this.presentation.regions.find(r => r.id === press.id);
      if (!region || press.epoch !== epoch(this.controller.data)) continue;
      if (region.type === 'scroll') this.controller.scrollArchive((press.lastY - touch.clientY) / this.controller.rpxScale);
      if (region.type === 'volume') this.volume(this.point(touch), region);
      if (region.type === 'skill' && this.controller.combat.weapon === 'banner' && press.moved) {
        press.direction = { x: touch.clientX - press.x, y: touch.clientY - press.y }; this.controller.aimSkill(press.direction);
      }
      press.lastY = touch.clientY;
    }
  }
  volume(point, region) {
    const c = this.controller, value = Math.max(0, Math.min(100, Math.round((point.x - region.x) / region.width * 20) * 5));
    c.setData({ effectVolume: value }); c.audio.configure(c.data);
  }
  end(event) {
    if (this.hidden) return;
    for (const touch of event.changedTouches || []) {
      if (touch.identifier === this.joyId) { this.controller.onTouchEnd({ touches: event.touches || [] }); this.joyId = null; }
      const press = this.presses.get(touch.identifier); this.presses.delete(touch.identifier); if (!press) continue;
      if (touch.identifier === this.skillId) {
        this.skillId = null;
        if (press.epoch === epoch(this.controller.data) && (this.controller.combat.weapon === 'banner' || !press.moved)) this.controller.castSkill(press.direction);
        this.controller.cancelSkillAim(); continue;
      }
      const region = this.region(this.point(touch));
      if (region && region.id === press.id && region.type === 'volume') { this.controller.saveSettings(); continue; }
      if (!press.moved && region && press.id === region.id && press.epoch === epoch(this.controller.data) && region.action) region.action();
    }
  }
  cancel() { this.presses.clear(); this.joyId = null; this.skillId = null; this.controller.cancelSkillAim(); this.controller.stopMovement(); }
  destroy() {
    this.cancel();
    for (const [event, key] of [['TouchStart', 'start'], ['TouchMove', 'move'], ['TouchEnd', 'end'], ['TouchCancel', 'cancel']]) {
      const off = this.api['off' + event]; if (off) off.call(this.api, this.handlers[key]);
    }
  }
}
module.exports = { NativeInput, epoch, inside };
