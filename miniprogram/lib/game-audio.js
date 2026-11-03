'use strict';
class GameAudio {
  constructor(api, settings) { this.api = api; this.contexts = {}; this.configure(settings); }
  configure(settings) {
    this.enabled = settings.soundOn;
    this.volume = Math.max(0, Math.min(100, settings.effectVolume)) / 100;
    Object.values(this.contexts).forEach(context => { context.volume = this.volume; });
    if (!this.enabled || !this.volume) this.stopAll();
  }
  play(name) {
    if (!this.enabled || !this.volume || !this.api.createInnerAudioContext) return;
    if (!['attack', 'hurt', 'upgrade', 'victory', 'death'].includes(name)) return;
    let context = this.contexts[name];
    if (!context) {
      context = this.api.createInnerAudioContext();
      context.src = '/audio/' + name + '.wav';
      context.volume = this.volume;
      this.contexts[name] = context;
    }
    context.stop(); context.play();
  }
  stopAll() { Object.values(this.contexts).forEach(context => context.stop()); }
  destroy() { this.stopAll(); Object.values(this.contexts).forEach(context => context.destroy()); this.contexts = {}; }
}
module.exports = { GameAudio };
