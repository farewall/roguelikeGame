'use strict';
const { Game, System } = require('@eva/eva.js');
const { RendererSystem, RENDERER_TYPE } = require('@eva/plugin-renderer');
const { GraphicsSystem } = require('@eva/plugin-renderer-graphics');
const { createController } = require('./controller');
const { Presentation } = require('./presentation');
const { loadAssets } = require('./assets');
const { NativeInput } = require('./input');

class GameplaySystem extends System {
  static systemName = 'KaitianGameplay';
  init(params) { this.controller = params.controller; }
  update(event) {
    this.controller.frame(Math.min(0.05, Math.max(0, event.deltaTime / 1000)));
    if (this.presentation) this.presentation.render();
  }
}
async function boot(api, canvas, createImage) {
  const viewport = api.getWindowInfo ? api.getWindowInfo() : api.getSystemInfoSync();
  const controller = createController(api, { viewport });
  const resolution = Math.min(2, viewport.pixelRatio || 1);
  const renderer = new RendererSystem({ canvas, width: viewport.windowWidth, height: viewport.windowHeight, resolution, autoResize: true, renderType: RENDERER_TYPE.CANVAS, backgroundColor: 0x101c24, antialias: true });
  const system = new GameplaySystem({ controller });
  const game = new Game({ autoStart: false, frameRate: 60, systems: [renderer, new GraphicsSystem(), system] });
  const presentation = new Presentation(game, controller); system.presentation = presentation;
  const input = new NativeInput(api, controller, presentation);
  const onHide = () => { input.hidden = true; input.cancel(); controller.onHide(); game.pause(); };
  const onShow = () => { input.hidden = false; controller.onShow(); game.resume(); };
  const onResize = size => {
    const fresh = api.getWindowInfo ? api.getWindowInfo() : api.getSystemInfoSync();
    controller.resize({ ...fresh, ...size }); renderer.resize(controller.viewport.windowWidth, controller.viewport.windowHeight); input.cancel();
  };
  if (api.onHide) api.onHide(onHide); if (api.onShow) api.onShow(onShow); if (api.onWindowResize) api.onWindowResize(onResize);
  game.start();
  const runtime = { game, controller, presentation, input, renderer,
    destroy() {
      input.destroy(); controller.onUnload(); game.destroy();
      if (api.offHide) api.offHide(onHide); if (api.offShow) api.offShow(onShow); if (api.offWindowResize) api.offWindowResize(onResize);
    }
  };
  try { presentation.assets = await loadAssets(createImage, value => { presentation.progress = value; }); presentation.ready = true; }
  catch (error) { presentation.error = error.message; throw error; }
  return runtime;
}
module.exports = { boot, GameplaySystem };
