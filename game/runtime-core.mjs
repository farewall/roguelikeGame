// Canonical gameplay sources, bundled as a Creator-compatible ES module.
import controller from './src/controller.js';
import nativeInput from './src/input.js';
import animation from './core/artifact-animation.js';
import enemyAnimation from './core/enemy-animation.js';
export const createController = controller.createController;
export const NativeInput = nativeInput.NativeInput;
export const ARTIFACT_COLUMNS = animation.ARTIFACT_COLUMNS;
export const enemyFrame = enemyAnimation.enemyFrame;
