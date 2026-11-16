'use strict';
// Keep old tooling entry points from restoring the obsolete low-color hero.
const path = require('node:path'), {execFileSync}=require('node:child_process');
try {execFileSync(process.env.PYTHON||'python3',[path.join(__dirname,'prepare-release-art.py')],{stdio:'inherit'});}
catch(error){console.error(error.message);process.exitCode=1;}
