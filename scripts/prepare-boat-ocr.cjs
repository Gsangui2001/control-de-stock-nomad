const fs=require('fs'),path=require('path');
const target=path.resolve(__dirname,'../public/a-bordo/ocr');fs.mkdirSync(target,{recursive:true});
function copy(src,name){fs.copyFileSync(require.resolve(src),path.join(target,name||path.basename(src)));}
for(const file of ['tesseract.min.js','worker.min.js','tesseract.min.js.LICENSE.txt','worker.min.js.LICENSE.txt'])copy('tesseract.js/dist/'+file);
const core=path.dirname(require.resolve('tesseract.js-core/package.json'));
for(const file of fs.readdirSync(core).filter(x=>x.endsWith('.wasm.js')))fs.copyFileSync(path.join(core,file),path.join(target,file));
copy('tesseract.js-core/LICENSE','TESSERACT-LICENSE.txt');
for(const language of ['spa','eng'])copy('@tesseract.js-data/'+language+'/4.0.0/'+language+'.traineddata.gz');
console.log('Prepared local OCR assets for Spanish and English');
