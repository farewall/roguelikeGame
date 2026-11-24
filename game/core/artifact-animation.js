'use strict';
// Per direction: neutral, planted step, two alternating strides, gather and release.
const ARTIFACT_COLUMNS = {
  idle: [0, 0, 0, 0, 0, 0], move: [2, 1, 0, 3, 1, 0], attack: [4, 4, 5, 5, 4, 0],
  hurt: [4, 4, 0, 0, 0, 0], awaken: [4, 5, 5, 4, 5, 0], death: [0, 0, 0, 0, 0, 0]
};
module.exports = { ARTIFACT_COLUMNS };
