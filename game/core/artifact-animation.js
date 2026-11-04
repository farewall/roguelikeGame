'use strict';
// The unarmed atlas has four directions and six poses per row: two idle, two walk, gather, release.
const ARTIFACT_COLUMNS = {
  idle: [0, 1, 0, 1, 0, 1], move: [2, 0, 3, 1, 2, 3], attack: [4, 4, 5, 5, 5, 0],
  hurt: [1, 1, 1, 0, 0, 0], awaken: [4, 5, 5, 4, 5, 0], death: [0, 0, 0, 0, 0, 0]
};
module.exports = { ARTIFACT_COLUMNS };
