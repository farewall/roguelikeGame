'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {assetFile}=require('./cocos/art-catalog.cjs');
function spriteAlpha(key='artifact'){
  const png=fs.readFileSync(assetFile(key)),chunks=[];
  assert.equal(png[24],8);assert.ok([3,6].includes(png[25]));const channels=png[25]===6?4:1,width=png.readUInt32BE(16),height=png.readUInt32BE(20);let transparency=Buffer.alloc(0);
  for(let at=8;at<png.length;){const size=png.readUInt32BE(at),type=png.toString('ascii',at+4,at+8);if(type==='IDAT')chunks.push(png.subarray(at+8,at+8+size));if(type==='tRNS')transparency=png.subarray(at+8,at+8+size);at+=size+12;}
  const data=zlib.inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=Buffer.alloc(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  for(let y=0;y<height;y++){
    const start=y*(stride+1),filter=data[start];assert.ok(filter<=4);
    for(let x=0;x<stride;x++){
      const a=x>=channels?pixels[y*stride+x-channels]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0;
      const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];pixels[y*stride+x]=(data[start+1+x]+predictor)&255;
    }
  }
  const alpha=(x,y)=>channels===4?pixels[(y*width+x)*4+3]:(transparency[pixels[y*width+x]]??255);
  return {alpha,width,height};
}
test('all 24 production hero poses retain clear gutters, solid bodies and one ground baseline',()=>{
  const {alpha,width,height}=spriteAlpha();assert.equal(width,768);assert.equal(height,512);
  for(let row=0;row<4;row++)for(let col=0;col<6;col++){
    let solid=0,bottom=-1,transparent=0;
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){const a=alpha(col*128+x,row*128+y);if(a>=240)solid++;if(a>=128)bottom=y;if(a===0)transparent++;}
    assert.ok(solid>1400&&transparent>5000,JSON.stringify({row,col,solid,transparent}));
    assert.ok(bottom>=116&&bottom<=120,JSON.stringify({row,col,bottom}));
    for(const x of [0,127])for(let y=0;y<128;y++)assert.equal(alpha(col*128+x,row*128+y),0);
  }
});
test('high-resolution pool materials have continuous interiors and clean transparent gutters for shoreline clipping',()=>{
  for(let index=0;index<4;index++){
    const {alpha,width,height}=spriteAlpha('pool'+index);
    assert.equal(width,384);assert.equal(height,384);
    assert.ok(alpha(192,192)>=240);
    for(const [x,y] of [[0,0],[0,383],[383,0],[383,383]])assert.equal(alpha(x,y),0);
    for(let y=128;y<256;y++)for(let x=128;x<256;x++)assert.ok(alpha(x,y)>=240,'Clipped material must remain solid through the pool interior');
  }
});
test('the runtime keeps one consistent hero atlas for combat and the ending',()=>{
  const dir=path.join(__dirname,'../cocos-project/assets/game-content/images/pangu');
  assert.deepEqual(fs.readdirSync(dir).filter(n=>n.endsWith('.png')),['artifact-cast.png']);
  const presentation=fs.readFileSync(path.join(__dirname,'../cocos-project/assets/scripts/Presentation.ts'),'utf8');
  assert.ok(presentation.includes("atlas = this.assets.frames.artifact[frame.action || 'idle']"));
});
test('large water surfaces and curled crests retain full color and alpha precision',()=>{
  for(const [name,w,h] of [['pool0',384,384],['waveRidges',512,192]]){
    const data=fs.readFileSync(assetFile(name));
    assert.equal(data[25],6);assert.equal(data.readUInt32BE(16),w);assert.equal(data.readUInt32BE(20),h);
    const image=spriteAlpha(name);assert.equal(image.alpha(0,0),0);
  }
});
test('physical airborne shadows soften and spread without changing an actor or predicting its landing',()=>{
  const bundled=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../cocos-project/assets/scripts/ReleaseArt.ts')],bundle:true,format:'cjs',write:false,logLevel:'silent'});
  const module={exports:{}};require('node:vm').runInNewContext(bundled.outputFiles[0].text,{module,exports:module.exports});
  const {shadowShape,drawGroundContact}=module.exports,e={boss:true,tigerHunt:{phase:'pounce-flight'},tigerAir:.5,x:40,y:50},before=JSON.stringify(e);
  const air=shadowShape(e,302),ground=shadowShape({...e,tigerAir:0},302);assert.ok(air.width>ground.width&&air.alpha<ground.alpha);assert.equal(JSON.stringify(e),before);
  let args;const sprite={tint:0};drawGroundContact({assets:{frames:{worldStyle:Array(6).fill({})}},image(...a){args=a;return sprite;}},{},'boss',{x:200,y:100},e,302,72);
  assert.ok(Math.abs(args[4]+args[6]/2-172)<1e-6,'Shadow remains beneath current body ground contact');assert.equal(sprite.tint,0x12171a);
});
test('the painted moving wave mask preserves the real crest, safe interior and open escape lane',()=>{
  const bundled=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../cocos-project/assets/scripts/ReleaseArt.ts')],bundle:true,format:'cjs',write:false,logLevel:'silent'});
  const module={exports:{}};require('node:vm').runInNewContext(bundled.outputFiles[0].text,{module,exports:module.exports});
  const {Combat}=require('../game/core/combat'),{waveBand}=require('../game/core/boss-patterns'),{polygonContains}=require('../game/core/world-geometry'),c=new Combat();
  const h={shape:'ring',x:50,y:50,age:1.8,delay:1.15,duration:1.55,wave:{from:66,to:340,width:42},gapAngle:1.2,gapHalf:.48},band=waveBand(h),points=module.exports.waveContour(h,band.radius,band.inner),origin=c.point(h);
  assert.ok(points.length<=194);for(let i=0;i<120;i++)for(const radius of [band.inner*.5,(band.inner+band.radius)/2,band.radius+10]){
    const a=i*Math.PI/60,p={x:Math.cos(a)*radius,y:Math.sin(a)*radius};
    assert.equal(polygonContains(p,points),c.contains(h,c.percent({x:origin.x+p.x,y:origin.y+p.y})),JSON.stringify({a,radius}));
  }
});
test('long sword trails and mixed blade volleys each use two tapered fill passes',()=>{
  const bundled=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../cocos-project/assets/scripts/AttackVfx.ts')],bundle:true,format:'cjs',write:false,logLevel:'silent'});
  const module={exports:{}};require('node:vm').runInNewContext(bundled.outputFiles[0].text,{module,exports:module.exports});
  const {drawSwordRibbon,drawBladeWakes}=module.exports,passes=[];
  const g={lineStyle(){},beginFill(){passes.push([]);},endFill(){},drawPolygon(points){passes.at(-1).push([...points]);}};
  const trail=Array.from({length:12},(_,i)=>({x:i*10,y:0,alpha:i/11}));
  drawSwordRibbon(g,trail,{x:0,y:0},0xffffff,true,false);
  assert.equal(passes.length,2);
  assert.ok(passes.every(pass=>pass.length===1&&pass[0].length===48&&pass[0].every(Number.isFinite)));
  const outer=passes[0][0];
  assert.equal(outer[1],outer.at(-1));
  assert.ok(Math.abs(outer[23]-outer[25])>10);
  passes.length=0;
  drawBladeWakes(g,Array.from({length:47},(_,i)=>({x:i,y:0,dx:1,dy:0,length:24,width:4})));
  assert.deepEqual(passes.map(pass=>pass.length),[47,47]);
});
