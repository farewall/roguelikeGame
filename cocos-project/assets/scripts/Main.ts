import { _decorator, Component, ResolutionPolicy, screen, view } from 'cc';
import { createController, NativeInput } from './generated/game-core';
import { CocosPresentation } from './Presentation';
import { createPlatform } from './Platform';
import { loadAssets } from './GameAssets';
const { ccclass } = _decorator;
@ccclass('KaitianGame')
export class KaitianGame extends Component {
  controller: any; presentation: CocosPresentation; input: any; api: any;
  private loading = false;
  onLoad() {
    this.api = createPlatform(() => this.controller, this.node);
    this.controller = createController(this.api);
    this.resize(); this.presentation = new CocosPresentation(this.node, this.controller);
    this.input = new NativeInput(this.api, this.controller, this.presentation);
    this.api.onHide(() => { this.input.hidden = true; this.input.cancel(); this.controller.onHide(); });
    this.api.onShow(() => { this.input.hidden = false; this.controller.onShow(); });
    this.controller.retryAssets = () => this.loadContent();
    screen.on('window-resize', this.resize, this);
    (globalThis as any).kaitian = this;
    this.loadContent();
  }
  async loadContent() {
    if (this.loading) return; this.loading = true; this.presentation.error = ''; this.presentation.progress = 0;
    try {
      const assets = await loadAssets(progress => { if (this.isValid) this.presentation.progress = progress; });
      if (!this.isValid) return; this.api.setAudioClips(assets.audio); this.presentation.assets = assets; this.presentation.ready = true;
    } catch (error) { if (this.isValid) { this.presentation.error = '山河资源未载入，请重试'; console.error(error); } }
    finally { this.loading = false; }
  }
  resize() {
    if (!this.controller) return; const info = this.api.getWindowInfo(), scale = Math.min(info.windowWidth, info.windowHeight) / 750;
    view.setDesignResolutionSize(info.windowWidth / scale, info.windowHeight / scale, ResolutionPolicy.EXACT_FIT);
    this.controller.resize(info); if (this.input) this.input.cancel();
  }
  update(dt: number) {
    if (!this.presentation) return;
    this.controller.frame(Math.min(0.05, Math.max(0, dt))); this.presentation.render();
  }
  onDestroy() {
    screen.off('window-resize', this.resize, this); if (this.input) this.input.destroy();
    if (this.controller) this.controller.onUnload(); if (this.api) this.api.destroy();
  }
}
