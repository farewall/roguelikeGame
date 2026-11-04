import { AudioClip, AudioSource, EventMouse, EventTouch, Game, game, input, Input, Node, sys } from 'cc';
declare const wx: any;
export function createPlatform(controller: () => any, owner: Node) {
  const native = typeof wx === 'object' ? wx : null;
  const callbacks: Record<string, Function[]> = {}, touches = new Map<any, any>(), disposers: Function[] = [];
  let clips: Record<string, AudioClip> = {};
  const emit = (key: string, event: any) => (callbacks[key] || []).slice().forEach(fn => fn(event));
  const viewport = () => {
    if (native) return native.getWindowInfo ? native.getWindowInfo() : native.getSystemInfoSync();
    return { windowWidth: window.innerWidth, windowHeight: window.innerHeight, pixelRatio: window.devicePixelRatio || 1, safeArea: { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight } };
  };
  const point = (touch: any, id: any) => {
    const p = touch.getUILocation(), c = controller(), scale = c.rpxScale;
    return { identifier: id, clientX: p.x * scale, clientY: (c.layout.h - p.y) * scale };
  };
  for (const [type, key] of [[Input.EventType.TOUCH_START, 'TouchStart'], [Input.EventType.TOUCH_MOVE, 'TouchMove'], [Input.EventType.TOUCH_END, 'TouchEnd'], [Input.EventType.TOUCH_CANCEL, 'TouchCancel']] as const) {
    const handler = (event: EventTouch) => {
      const changed = event.getTouches().map(t => point(t, t.getID()));
      for (const t of changed) { if (key === 'TouchEnd' || key === 'TouchCancel') touches.delete(t.identifier); else touches.set(t.identifier, t); }
      emit(key, { changedTouches: changed, touches: [...touches.values()] });
    };
    input.on(type, handler); disposers.push(() => input.off(type, handler));
  }
  if (!native && !sys.isMobile) {
    let down = false;
    for (const [type, key] of [[Input.EventType.MOUSE_DOWN, 'TouchStart'], [Input.EventType.MOUSE_MOVE, 'TouchMove'], [Input.EventType.MOUSE_UP, 'TouchEnd']] as const) {
      const handler = (event: EventMouse) => {
        if (key === 'TouchStart') down = true; if (!down) return;
        const t = point(event, 'mouse'); if (key === 'TouchEnd') { down = false; touches.delete('mouse'); } else touches.set('mouse', t);
        emit(key, { changedTouches: [t], touches: [...touches.values()] });
      };
      input.on(type, handler); disposers.push(() => input.off(type, handler));
    }
  }
  const onHide = () => { touches.clear(); emit('TouchCancel', { changedTouches: [], touches: [] }); emit('Hide', {}); };
  const onShow = () => emit('Show', {});
  game.on(Game.EVENT_HIDE, onHide); game.on(Game.EVENT_SHOW, onShow);
  disposers.push(() => { game.off(Game.EVENT_HIDE, onHide); game.off(Game.EVENT_SHOW, onShow); });
  const api: any = {
    getWindowInfo: viewport,
    getStorageSync(key: string) { return native ? native.getStorageSync(key) : JSON.parse(sys.localStorage.getItem(key) || 'null'); },
    setStorageSync(key: string, value: any) { if (native) native.setStorageSync(key, value); else sys.localStorage.setItem(key, JSON.stringify(value)); },
    vibrateShort(options: any) { if (native && native.vibrateShort) native.vibrateShort(options); },
    createInnerAudioContext() {
      const node = new Node('EffectAudio'); owner.addChild(node); const audio = node.addComponent(AudioSource);
      let source = '';
      return { get src() { return source; }, set src(value: string) { source = value; const id = value.split('/').pop().replace('.wav', ''); audio.clip = clips[id] || null; },
        get volume() { return audio.volume; }, set volume(value: number) { audio.volume = value; },
        play() { if (audio.clip) audio.play(); }, stop() { audio.stop(); }, destroy() { node.destroy(); } };
    },
    setAudioClips(value: Record<string, AudioClip>) { clips = value; },
    emit, destroy() { disposers.forEach(fn => fn()); touches.clear(); }
  };
  for (const key of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show']) {
    api['on' + key] = (fn: Function) => (callbacks[key] || (callbacks[key] = [])).push(fn);
    api['off' + key] = (fn: Function) => { callbacks[key] = (callbacks[key] || []).filter(f => f !== fn); };
  }
  return api;
}
