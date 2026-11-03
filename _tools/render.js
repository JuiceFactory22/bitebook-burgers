// usage: node render.js <fontsDir> <outDir> <file.dc.html>...
const fs=require('fs'),path=require('path');const {chromium}=require('playwright');
const [fontsDir,outDir,...files]=process.argv.slice(2);
const ff=(fam,file,w)=>`@font-face{font-family:'${fam}';src:url('file://${path.resolve(fontsDir,file)}');font-weight:${w};}`;
const css=ff('Bricolage Grotesque','BricolageGrotesque-Variable.ttf','200 800')+
 ff('Space Mono','SpaceMono-Regular.ttf','400')+ff('Space Mono','SpaceMono-Bold.ttf','700')+'body{margin:0}';
(async()=>{const b=await chromium.launch();
for(const f of files){const src=fs.readFileSync(f,'utf8');
 let inner=src.split('<x-dc>')[1].split('</x-dc>')[0].replace(/<helmet>[\s\S]*?<\/helmet>/,'');
 const m=src.match(/"\$preview":\{"width":(\d+),"height":(\d+)\}/);const w=+m[1],h=+m[2];
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${inner}</body></html>`;
 const tmp=path.join(outDir,'_'+path.basename(f)+'.html');fs.writeFileSync(tmp,html);
 const p=await b.newPage({viewport:{width:w,height:h}});await p.goto('file://'+tmp);await p.evaluate(()=>document.fonts.ready);
 const ok=await p.evaluate(()=>[document.fonts.check("800 40px 'Bricolage Grotesque'"),document.fonts.check("700 20px 'Space Mono'")]);
 const out=path.join(outDir,path.basename(f).replace('.dc.html','.png'));await p.screenshot({path:out,clip:{x:0,y:0,width:w,height:h}});
 console.log(out,w+'x'+h,'fonts',ok.join(','));await p.close();}
await b.close();})();
