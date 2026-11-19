import { _decorator, Component, ResolutionPolicy, screen, view } from 'cc';
import { createController, NativeInput } from './generated/game-core';
import { CocosPresentation } from './Presentation';
import { createPlatform } from './Platform';
import { GameAssets, realmGroups, visualGroups } from './GameAssets';
const { ccclass } = _decorator;
@ccclass('KaitianGame')
export class KaitianGame extends Component {
  controller: any; presentation: CocosPresentation; input: any; api: any;
  resources = new GameAssets();
  private assetKey = '';
  private warmKey = '';
  private requestId = 0;
  private activeRequest: Promise<void>;
  onLoad() {
    this.api = createPlatform(() => this.controller, this.node);
    this.controller = createController(this.api);
    this.resize(); this.presentation = new CocosPresentation(this.node, this.controller);
    this.input = new NativeInput(this.api, this.controller, this.presentation);
    this.api.onHide(() => { this.input.hidden = true; this.input.cancel(); this.controller.onHide(); });
    this.api.onShow(() => { this.input.hidden = false; this.controller.onShow(); });
    this.controller.retryAssets = () => { this.assetKey = ''; this.syncAssets(); };
    screen.on('window-resize', this.resize, this);
    (globalThis as any).kaitian = this;
    this.syncAssets();
  }

  syncAssets() {
    const names = visualGroups(this.controller), key = names.join('/');
    if (key === this.assetKey) return this.activeRequest;
    const id = ++this.requestId;
    this.assetKey = key;
    this.warmKey = '';
    this.controller.visualLoading = true;
    this.input.cancel();
    this.presentation.regions = [];
    this.presentation.ready = false;
    this.presentation.error = '';
    this.presentation.progress = 0;
    this.activeRequest = this.resources.request(names,value=>{
      if (id === this.requestId) this.presentation.progress = value;
    }).then(()=>{
      if (!this.isValid || id !== this.requestId) return;
      this.presentation.assets = this.resources.mount(names,textures=>this.presentation.detachTextures(textures));
      this.api.setAudioClips(this.presentation.assets.audio);
      this.controller.visualLoading = false;
      this.controller.startLoops();
      this.presentation.ready = true;
    }).catch(error=>{
      if (!this.isValid || id !== this.requestId) return;
      this.presentation.error = '山河资源未载入，请重试';
      console.error(error);
    });
    return this.activeRequest;
  }

  resize() {
    if (!this.controller) return;
    const info = this.api.getWindowInfo(), scale = Math.min(info.windowWidth, info.windowHeight) / 750;
    view.setDesignResolutionSize(info.windowWidth / scale, info.windowHeight / scale, ResolutionPolicy.EXACT_FIT);
    this.controller.resize(info); if (this.input) this.input.cancel();
  }

  update(dt: number) {
    if (!this.presentation) return;
    this.syncAssets();
    if (this.presentation.ready) {
      this.controller.frame(Math.min(0.05, Math.max(0, dt)));
      const {data,combat} = this.controller;
      if (data.view === 'game' && !data.ended && combat.stage < 5 && combat.stageTime >= 6) {
        const next = realmGroups(combat.stage + 1), key = next.join('/');
        if (key !== this.warmKey) {
          this.warmKey = key;
          this.resources.prefetch(next);
        }
      }
    }
    this.presentation.render();
  }

  onDestroy() {
    this.requestId++;
    screen.off('window-resize', this.resize, this);
    this.input?.destroy();
    this.controller?.onUnload();
    this.api?.destroy();
    this.presentation?.root.destroy();
    this.resources.destroy();
  }
}
