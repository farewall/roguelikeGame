// Usage: node tools/prepare-art.cjs <arena-atlas.png> <creature-atlas.png>
// Sharp is a development-only image tool; the miniprogram has no runtime dependencies.
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, '../cocos-project/assets/game-content/images');
async function split(file, names, size, transparent) {
  const {width, height} = await sharp(file).metadata();
  for (let i=0; i<names.length; i++) {
    const left=Math.round(i%3*width/3), top=Math.round(Math.floor(i/3)*height/2);
    const w=Math.round((i%3+1)*width/3)-left, h=Math.round((Math.floor(i/3)+1)*height/2)-top;
    let img=sharp(file).extract({left,top,width:w,height:h}).resize(size,size,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}});
    if (transparent) await img.png({palette:true,colours:128,effort:10}).toFile(path.join(out,names[i]+'.png'));
    else await img.flatten({background:'#141d25'}).jpeg({quality:78,mozjpeg:true}).toFile(path.join(out,names[i]+'.jpg'));
  }
}
const paths={
 power:'M14 8L27 21M21 4L13 12L21 20L29 12ZM11 25L24 12M7 29L11 25',
 haste:'M5 12H22C30 12 30 4 25 5M5 18H28C35 18 33 28 27 27M9 24H18',
 health:'M18 3L29 8V19Q27 27 18 32Q9 27 7 19V8ZM18 11V23M12 17H24',
 fire:'M20 3Q22 13 28 17Q33 28 20 32Q6 32 7 22Q7 15 13 12Q12 20 16 20Q22 16 20 3Z',
 water:'M18 3Q13 13 8 20Q3 32 18 32Q33 32 28 20ZM12 23Q12 28 18 28',
 earth:'M3 29L13 9L19 19L24 12L33 29ZM10 29L17 23L22 29'
};
(async()=>{
 if(process.argv[2]) await split(process.argv[2],['arena-1','arena-2','arena-3','arena-4','arena-5','ending-dawn'],512,false);
 if(process.argv[3]) await split(process.argv[3],['boss-1','boss-2','boss-3','boss-4','boss-5','enemy-wraith'],256,true);
 for(const [name,d] of Object.entries(paths)) {
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#152b30" stroke="#8e8059" stroke-width=".7"/><g transform="translate(2 2)" fill="none" stroke="#ebd49a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></g></svg>`;
 await sharp(Buffer.from(svg)).png().toFile(path.join(out,'upgrade-'+name+'.png'));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
