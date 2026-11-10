'use strict';

function fits(rect, width, height) {
  return rect && [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) &&
    rect.left >= 0 && rect.top >= 0 && rect.right > rect.left && rect.bottom > rect.top && rect.right <= width && rect.bottom <= height;
}

function normalizeViewport(info) {
  const width = info.windowWidth, height = info.windowHeight, full = { left: 0, top: 0, right: width, bottom: height };
  let safe = info.safeArea;
  if (!fits(safe, width, height)) {
    if (width > height && fits(safe, height, width)) {
      // Some WeChat hosts keep portrait safe-area coordinates after rotating.
      // Reserve the larger inset on both sides, since either landscape direction
      // can put the notch on the left. Never subtract a portrait right edge.
      const x = Math.max(safe.top, width - safe.bottom), y = Math.max(safe.left, height - safe.right);
      safe = { left: x, top: y, right: width - x, bottom: height - y };
    } else safe = full;
  }
  if (!fits(safe, width, height)) safe = full;
  const safeArea = { ...safe, width: safe.right - safe.left, height: safe.bottom - safe.top };
  let menuButton = info.menuButton;
  // The WeChat capsule is anchored to the right. A portrait capsule may still
  // fit inside a wide window, but must not push the HUD into the left half.
  if (menuButton && (!Number.isFinite(menuButton.left) || menuButton.left < width / 2 || menuButton.left >= width ||
    Number.isFinite(menuButton.right) && (menuButton.right > width || menuButton.right <= menuButton.left) ||
    Number.isFinite(menuButton.bottom) && menuButton.bottom > height)) menuButton = null;
  return { ...info, safeArea, menuButton };
}

module.exports = { normalizeViewport };
