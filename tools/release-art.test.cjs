'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
function spriteAlpha(file='pangu/artifact-cast.png'){
  const png=fs.readFileSync(path.join(__dirname,'../cocos-project/assets/game-content/images',file)),chunks=[];
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
test('high-resolution pool materials stay inside the physical shoreline rather than covering walkable land',()=>{
  const {alpha,width,height}=spriteAlpha('world-pools.png');assert.equal(width,768);assert.equal(height,768);
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){
    assert.ok(alpha(col*384+192,row*384+192)>=240);
    for(let y=0;y<384;y++)for(let x=0;x<384;x++)if(alpha(col*384+x,row*384+y)>=128)assert.ok(Math.hypot(x-191.5,y-191.5)<176.64,'Material must fit the minimum physical radius');
  }
});
test('the runtime keeps one consistent hero atlas for combat and the ending',()=>{
  const dir=path.join(__dirname,'../cocos-project/assets/game-content/images/pangu');
  assert.deepEqual(fs.readdirSync(dir).filter(n=>n.endsWith('.png')),['artifact-cast.png']);
  const presentation=fs.readFileSync(path.join(__dirname,'../cocos-project/assets/scripts/Presentation.ts'),'utf8');
  assert.ok(presentation.includes("atlas = this.assets.frames.artifact[frame.action || 'idle']"));
});
test('physical airborne shadows soften and spread without changing an actor or predicting its landing',()=>{
  const bundled=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../cocos-project/assets/scripts/ReleaseArt.ts')],bundle:true,format:'cjs',write:false,logLevel:'silent'});
  const module={exports:{}};require('node:vm').runInNewContext(bundled.outputFiles[0].text,{module,exports:module.exports});
  const {shadowShape,drawGroundContact}=module.exports,e={boss:true,tigerHunt:{phase:'pounce-flight'},tigerAir:.5,x:40,y:50},before=JSON.stringify(e);
  const air=shadowShape(e,302),ground=shadowShape({...e,tigerAir:0},302);assert.ok(air.width>ground.width&&air.alpha<ground.alpha);assert.equal(JSON.stringify(e),before);
  let args;const sprite={tint:0};drawGroundContact({assets:{frames:{worldStyle:Array(6).fill({})}},image(...a){args=a;return sprite;}},{},'boss',{x:200,y:100},e,302,72);
  assert.ok(Math.abs(args[4]+args[6]/2-172)<1e-6,'Shadow remains beneath current body ground contact');assert.equal(sprite.tint,0x12171a);
});
