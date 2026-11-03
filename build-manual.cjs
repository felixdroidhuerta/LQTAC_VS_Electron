const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
app.whenReady().then(async()=>{
  try {
    const text=fs.readFileSync(path.join(__dirname,'assets/manual-local.md'),'utf8');
    const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    const content=text.split('\n').map(line=>/^#{1,6} /.test(line)?'<h2>'+escape(line.replace(/^#+ /,''))+'</h2>':'<div>'+escape(line||' ')+'</div>').join('');
    const win=new BrowserWindow({show:false});
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<meta charset="utf-8"><style>body{font:11px Arial;line-height:1.5;color:#14213b}h2{font-size:17px;break-after:avoid}div{white-space:pre-wrap;overflow-wrap:anywhere} @page{margin:18mm}</style>'+content));
    fs.writeFileSync(path.join(__dirname,'assets/manual-local.pdf'),await win.webContents.printToPDF({printBackground:true,pageSize:'A4'}));
    console.log('PDF local creado'); app.quit();
  } catch(error){console.error(error);app.exit(1);}
});
