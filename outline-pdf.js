'use strict';
// PDF is built entirely on-device. Canvas rasterizes Japanese text using the
// device's fonts; the PDF embeds JPEG pages without external dependencies.
function outlinePdfPages(data, analysis) {
  const W=595.28,H=841.89;
  const boundaryRows=(data.boundaries||[]).map(b=>({dir:b.dir,mm:b.mm,point:b.point}));const allRows=[...data.edges,...boundaryRows];const chunks=[];
  chunks.push(allRows.slice(0,8));
  for(let i=8;i<allRows.length;i+=31)chunks.push(allRows.slice(i,i+31));
  let offset=0;
  return chunks.map((rows,page)=>{
    const canvas=document.createElement('canvas');canvas.width=1191;canvas.height=1684;
    const c=canvas.getContext('2d');if(!c)throw Error('PDF描画を開始できません');c.scale(canvas.width/W,canvas.height/H);
    c.fillStyle='white';c.fillRect(0,0,W,H);c.fillStyle='#17242b';
    function text(s,x,y,size=11,align='left'){c.font=`${size}px sans-serif`;c.textAlign=align;c.textBaseline='alphabetic';c.fillStyle='#17242b';c.fillText(s,x,y)}
    function line(x1,y1,x2,y2,color='#b0bac0',width=.6){c.beginPath();c.strokeStyle=color;c.lineWidth=width;c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke()}
    function wrap(s,x,y,width,size=11,maxLines=2){let row='',lineNo=0;c.font=`${size}px sans-serif`;for(const ch of s){if(c.measureText(row+ch).width>width){text(row,x,y+lineNo*(size+4),size);row=ch;lineNo++;if(lineNo>=maxLines-1)break}else row+=ch}text(row,x,y+lineNo*(size+4),size)}
    text('建物外周図',36,48,22);text('A4縦 / 用紙に合わせて表示',W-36,48,10,'right');line(36,61,W-36,61);
    wrap('案件名：'+(data.name||'名称未入力'),36,84,W-72,12);
    let tableY=124;
    if(page===0){
      const p=analysis.p;const bv={N:[0,1],E:[1,0],S:[0,-1],W:[-1,0]};const segments=boundaryRows.map(b=>{const start=p[b.point],v=bv[b.dir];return {...b,start,end:{x:start.x+v[0]*b.mm,y:start.y+v[1]*b.mm}}});const plotted=[...p,...segments.map(b=>b.end)],xs=plotted.map(q=>q.x),ys=plotted.map(q=>q.y);const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
      const scale=Math.min(405/Math.max(maxx-minx,1000),280/Math.max(maxy-miny,1000));const xy=q=>[W/2+(q.x-(minx+maxx)/2)*scale,302-(q.y-(miny+maxy)/2)*scale];
      c.strokeStyle='#aab6bd';c.lineWidth=.6;c.strokeRect(36,117,W-72,371);
      c.beginPath();p.forEach((q,i)=>{const [x,y]=xy(q);if(i)c.lineTo(x,y);else c.moveTo(x,y)});c.lineWidth=1.4;c.strokeStyle='#21382e';c.stroke();
      let signed=0;for(let i=0;i<p.length-1;i++)signed+=p[i].x*p[i+1].y-p[i+1].x*p[i].y;const orient=signed<0?-1:1;
      data.edges.forEach((e,i)=>{const a=p[i],b=p[i+1],aa=xy(a),bb=xy(b),dx=b.x-a.x,dy=b.y-a.y;const mx=(aa[0]+bb[0])/2,my=(aa[1]+bb[1])/2;const nx=dy/e.mm*orient,ny=dx/e.mm*orient;
        text((e.mm/1000).toFixed(3)+' m',mx+nx*13,my+ny*14+4,10,nx>0?'left':nx<0?'right':'center');
        c.beginPath();c.fillStyle='#21382e';c.arc(aa[0],aa[1],2.3,0,Math.PI*2);c.fill();text(String(i+1),aa[0]+5,aa[1]-5,9);
      });segments.forEach(b=>{const a=xy(b.start),z=xy(b.end);c.setLineDash([4,3]);line(a[0],a[1],z[0],z[1],'#b36521',1);c.setLineDash([]);text('境界 '+(b.mm/1000).toFixed(3)+' m',(a[0]+z[0])/2+6,(a[1]+z[1])/2-7,10);c.beginPath();c.arc(z[0],z[1],2.5,0,Math.PI*2);c.stroke()});if(!analysis.closed){const q=xy(p[p.length-1]);text(String(p.length),q[0]+5,q[1]-5,9)}const start=xy(p[0]);text('始点',start[0],start[1]+27,10,'center');
      const fmt=k=>(analysis.totals[k]/1000).toFixed(3)+' m';
      text('上の合計 '+fmt('N'),36,514,12);text('下の合計 '+fmt('S'),304,514,12);
      text('左の合計 '+fmt('W'),36,536,12);text('右の合計 '+fmt('E'),304,536,12);
      text('｜上 − 下｜ '+(analysis.verticalDiff/1000).toFixed(3)+' m',36,560,13);text('｜左 − 右｜ '+(analysis.horizontalDiff/1000).toFixed(3)+' m',304,560,13);
      text(analysis.closed&&!analysis.invalid?'外形面積 '+analysis.area.toFixed(3)+' ㎡':'外形面積：未閉合または交差のため未算出',36,586,12);
      tableY=612;
    }
    text(page===0?'寸法一覧（辺・境界距離）':'寸法一覧（続き）',36,tableY,12);
    const top=tableY+12,rh=19;const cols=[36,102,225,W-36];
    c.fillStyle='#edf1f3';c.fillRect(36,top,W-72,rh);
    [['辺 / 点番',cols[0]+5],['方向',cols[1]+10],['寸法（m）',cols[2]+10]].forEach(([s,x])=>text(s,x,top+13,10));
    rows.forEach((e,i)=>{text(e.point===undefined?String(offset+i+1):'P'+(e.point+1),cols[0]+5,top+(i+1)*rh+13,10);text({N:'上',S:'下',W:'左',E:'右'}[e.dir],cols[1]+10,top+(i+1)*rh+13,10);text((e.mm/1000).toFixed(3)+(e.point===undefined?'':'  境界まで'),cols[2]+10,top+(i+1)*rh+13,10)});
    for(let i=0;i<=rows.length+1;i++)line(36,top+i*rh,W-36,top+i*rh);cols.forEach(x=>line(x,top,x,top+(rows.length+1)*rh));offset+=rows.length;
    text('外形寸法の記録用。壁厚補正・登記床面積の計算前。',36,H-30,9);text(`${page+1} / ${chunks.length}`,W-36,H-30,9,'right');
    return {jpeg:Uint8Array.from(atob(canvas.toDataURL('image/jpeg',.94).split(',')[1]),ch=>ch.charCodeAt(0)),width:canvas.width,height:canvas.height};
  });
}
function encodeOutlinePdf(pages){
  const enc=new TextEncoder(),parts=[],offsets=[0];let length=0;const append=s=>{const b=typeof s==='string'?enc.encode(s):s;parts.push(b);length+=b.length};
  append('%PDF-1.4\n% on-device building outline\n');
  function obj(id,content){offsets[id]=length;append(`${id} 0 obj\n`);append(content);append('\nendobj\n')}
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
  pages.forEach((p,i)=>{const id=3+i*3;obj(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
    offsets[id+1]=length;append(`${id+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);append(p.jpeg);append('\nendstream\nendobj\n');
    const command='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';obj(id+2,`<< /Length ${enc.encode(command).length} >>\nstream\n${command}endstream`);
  });const start=length,count=3+pages.length*3;append(`xref\n0 ${count}\n0000000000 65535 f \n`);for(let i=1;i<count;i++)append(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
  const result=new Uint8Array(length);let at=0;for(const b of parts){result.set(b,at);at+=b.length}return result;
}

function surveySummaryPages(data){
  const rows=[];function add(label,value){const content=label+'：'+(value||'未入力');for(const paragraph of content.split('\n')){const chars=Array.from(paragraph);if(!chars.length)rows.push('');for(let i=0;i<chars.length;i+=40)rows.push(chars.slice(i,i+40).join(''))}}
  add('案件名',data.name);add('所在地',data.address);add('調査日',data.surveyDate);
  for(const b of data.buildings){rows.push('');add('建物',b.name);add('種類・用途',b.use);add('構造',b.structure);add('屋根',b.roof);add('外壁',b.wall);for(const f of b.floors){add('階',f.name);add('壁厚',f.wallThicknessMm==null?'未入力':f.wallThicknessMm+' mm');add('調査メモ',f.notes)}}
  const pages=[];for(let start=0;start<rows.length;start+=32){const canvas=document.createElement('canvas');canvas.width=1191;canvas.height=1684;const c=canvas.getContext('2d');if(!c)throw Error('PDF描画を開始できません');c.scale(canvas.width/595.28,canvas.height/841.89);c.fillStyle='white';c.fillRect(0,0,595.28,841.89);c.fillStyle='#17242b';c.font='22px sans-serif';c.fillText('建物調査・現場記録',36,48);c.font='12px sans-serif';rows.slice(start,start+32).forEach((row,i)=>c.fillText(row,36,94+i*21));c.font='9px sans-serif';c.fillText('入力した現場情報の記録。壁厚補正・登記床面積計算は未適用。',36,812);pages.push({jpeg:Uint8Array.from(atob(canvas.toDataURL('image/jpeg',.94).split(',')[1]),ch=>ch.charCodeAt(0)),width:canvas.width,height:canvas.height})}return pages;
}