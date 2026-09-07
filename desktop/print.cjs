'use strict';
const fs = require('node:fs/promises');
const { validateState } = require('./validation.cjs');
const escape = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function labelFor(state, student) {
  const matches = state.students.filter(s=>s.name===student.name);
  return student.name+(matches.length>1?' · '+(matches.findIndex(s=>s.id===student.id)+1):'');
}
function seatingSVG(input, teacher=false) {
  const state=validateState(input),height=state.worldHeight;
  const point=(x,y)=>teacher?{x:1000-x,y:height-y}:{x,y};
  const block=(x,y,w,h,label,kind='seat')=>{
    const p=point(x,y),size=kind==='seat'?Math.max(11,Math.min(23,w/Math.max(4,[...label].length)*1.7)):20;
    return `<g class="${kind}"><rect x="${p.x-w/2}" y="${p.y-h/2}" width="${w}" height="${h}" rx="8"/><text x="${p.x}" y="${p.y+size*.34}" text-anchor="middle" font-size="${size}">${escape(label)}</text></g>`;
  };
  const groups=[...new Set(state.seats.map(s=>s.groupId).filter(Boolean))].map(groupId=>{
    const members=state.seats.filter(s=>s.groupId===groupId),xs=members.map(s=>s.x),ys=members.map(s=>s.y),p=point((Math.min(...xs)+Math.max(...xs))/2,Math.min(...ys)-43);
    return `<text class="group-label" x="${p.x}" y="${p.y+6}" text-anchor="middle">${escape(groupId.replace(/^g/,''))}모둠</text>`;
  }).join('');
  const seats=state.seats.filter(s=>!s.temporary||s.studentId).map(s=>{
    const student=state.students.find(p=>p.id===s.studentId);
    return block(s.x,s.y,s.temporary?130:state.deskWidth,54,student?labelFor(state,student):'',student?'seat':'empty');
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ${height}" role="img" aria-label="${teacher?'교탁용':'학생용'} 자리표"><style>text{font-family:'Malgun Gothic','Noto Sans CJK KR',sans-serif;fill:#172134}rect{fill:#fff;stroke:#718096;stroke-width:1.4}.board rect{fill:#e8eef4;stroke:#8896a7}.podium rect{fill:#edf0f3;stroke:#8896a7}.group-label{font-size:17px;fill:#42536a}.empty rect{stroke:#bbc3cd;stroke-dasharray:4 4}.seat text{font-weight:600}</style>${block(500,31,370,40,'칠판','board')}${block(500,101,165,48,'교탁','podium')}${groups}${seats}</svg>`;
}
function printHTML({state:input,type='both',landscape=true}={}) {
  const state=validateState(input);
  if(!['both','student','teacher'].includes(type))throw new Error('인쇄 방향을 확인해 주세요.');
  const views=type==='both'?[false,true]:[type==='teacher'];
  const title=state.className||'우리 반 자리표';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"><title>${escape(title)}</title><style>@page{size:A4 ${landscape?'landscape':'portrait'};margin:12mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:#172134;font-family:'Malgun Gothic','Noto Sans CJK KR',sans-serif}.page{width:${landscape?'273':'186'}mm;height:${landscape?'185':'272'}mm;display:flex;flex-direction:column;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}.heading{display:flex;justify-content:space-between;align-items:baseline;gap:12px;height:13mm;flex-shrink:0}.heading h1{font-size:18pt;margin:0}.heading span{font-size:10pt;color:#536172}.map{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}.map svg{height:100%;max-height:100%;max-width:100%;width:100%}.footer{font-size:9pt;text-align:center;height:7mm;padding-top:3mm;flex-shrink:0;color:#536172}@media screen{body{background:#e9edf2}.page{margin:20px auto;padding:0;background:white;box-shadow:0 3px 20px #0002}}</style></head><body>${views.map(teacher=>`<section class="page"><header class="heading"><h1>${escape(title)}</h1><span>${teacher?'교탁용 · 교사가 학생을 보는 방향':'학생용 · 학생이 칠판을 보는 방향'}</span></header><div class="map">${seatingSVG(state,teacher)}</div><footer class="footer">${state.students.length}명 · ${teacher?'교탁용':'학생용'}</footer></section>`).join('')}</body></html>`;
}
async function withPrintWindow(BrowserWindow,options,action) {
  const win=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  try {
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(printHTML(options)));
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    return await action(win);
  } finally {if(!win.isDestroyed())win.destroy();}
}
async function exportPDF({BrowserWindow,dialog,parent,options}) {
  const result=await dialog.showSaveDialog(parent,{title:'자리표 PDF 저장',defaultPath:'자리표.pdf',filters:[{name:'PDF 문서',extensions:['pdf']}]});
  if(result.canceled||!result.filePath)return {ok:false,canceled:true};
  return withPrintWindow(BrowserWindow,options,async win=>{
    const bytes=await win.webContents.printToPDF({printBackground:true,pageSize:'A4',landscape:Boolean(options.landscape),preferCSSPageSize:true,margins:{top:0,bottom:0,left:0,right:0}});
    await fs.writeFile(result.filePath,bytes);return {ok:true};
  });
}
async function print({BrowserWindow,dialog,parent,options}) {
  return withPrintWindow(BrowserWindow,options,async win=>new Promise((resolve,reject)=>{
    win.webContents.print({silent:false,printBackground:true,pageSize:'A4',landscape:Boolean(options.landscape),margins:{marginType:'none'}},(success,reason)=>success?resolve({ok:true}):reason&&/cancel/i.test(reason)?resolve({ok:false,canceled:true}):reject(new Error(reason||'인쇄하지 못했습니다. 프린터 설정을 확인해 주세요.')));
  }));
}
async function exportPNG({BrowserWindow,dialog,parent,options}) {
  if(options.type==='both')throw new Error('이미지는 학생용 또는 교탁용 중 하나를 선택해 주세요.');
  const result=await dialog.showSaveDialog(parent,{title:'자리표 이미지 저장',defaultPath:'자리표.png',filters:[{name:'PNG 이미지',extensions:['png']}]});
  if(result.canceled||!result.filePath)return {ok:false,canceled:true};
  return withPrintWindow(BrowserWindow,options,async win=>{
    await win.webContents.executeJavaScript("document.head.insertAdjacentHTML('beforeend','<style>body{background:white}.page{margin:0;box-shadow:none}</style>')");
    const size=await win.webContents.executeJavaScript('({width:Math.ceil(document.querySelector(".page").getBoundingClientRect().width),height:Math.ceil(document.querySelector(".page").getBoundingClientRect().height)})');
    win.setContentSize(size.width,size.height);const image=await win.webContents.capturePage();await fs.writeFile(result.filePath,image.toPNG());return {ok:true};
  });
}
module.exports={escape,seatingSVG,printHTML,exportPDF,print,exportPNG};
