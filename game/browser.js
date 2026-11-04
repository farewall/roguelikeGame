'use strict';
const { boot } = require('./src/app');
window.startKaitian = (api, canvas) => boot(api, canvas, () => new Image());
