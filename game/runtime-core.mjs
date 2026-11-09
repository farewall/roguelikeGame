// Canonical gameplay sources, bundled as a Creator-compatible ES module.
import controller from './src/controller.js';
import nativeInput from './src/input.js';
import animation from './core/artifact-animation.js';
import enemyAnimation from './core/enemy-animation.js';
export const createController = controller.createController;
export const NativeInput = nativeInput.NativeInput;
export const ARTIFACT_COLUMNS = animation.ARTIFACT_COLUMNS;
export const enemyFrame = enemyAnimation.enemyFrame;
export const bossFrame = enemyAnimation.bossFrame;

import vines from './core/vines.js';
export const vineGrowth = vines.vineGrowth;
export const vineRadius = vines.vineRadius;
export const vinePaths = vines.vinePaths;

import meteor from './core/meteor.js';
export const METEOR = meteor.METEOR;
export const meteorPhase = meteor.meteorPhase;

import bossPatterns from './core/boss-patterns.js';
export const attackLine = bossPatterns.attackLine;
export const waveBand = bossPatterns.waveBand;
export const sectorAngle = bossPatterns.sectorAngle;
export const inAngleGap = bossPatterns.inAngleGap;
