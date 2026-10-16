/* Google Drive backup for Building Outline. No client secret is used. */
(() => {
'use strict';
const FILE = 'building-survey-backup.json';
const CLIENT_KEY = 'building-survey-google-client-id';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
let tokenClient, token, selectedFileId, busy=false;
const el = id => document.getElementById(id);
const report = message => { el('driveStatus').textContent=message; };
function clientId(){ return el('driveClientId').value.trim(); }
function validClient(id){return /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(id);}
function loadGoogleScript(){
 return new Promise((resolve,reject)=>{
  if(window.google?.accounts?.oauth2) return resolve();
  const script=document.createElement('script');
  script.src='https://accounts.google.com/gsi/client';
  script.onload=resolve;script.onerror=()=>reject(Error('Google認証ライブラリを読み込めません'));
  document.head.appendChild(script);
 });
}
async function authorize(){
 const id=clientId();
 if(!validClient(id)) throw Error('Google Cloudのウェブ用OAuthクライアントIDを入力してください');
 localStorage.setItem(CLIENT_KEY,id);
 if(token) return token;
 await loadGoogleScript();
 return await new Promise((resolve,reject)=>{
  tokenClient=google.accounts.oauth2.initTokenClient({
   client_id:id,scope:SCOPE,
   callback:response=>{
    if(response.error) reject(Error(response.error));
    else {token=response.access_token; report('Googleに接続しました');resolve(token);}
   },
   error_callback:()=>reject(Error('Google認証がキャンセルされました'))
  });
  tokenClient.requestAccessToken({prompt:'consent'});
 });
}
async function request(url,options={}){
 const response=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,...options.headers}});
 if(response.status===401){token=null;throw Error('認証が切れました。もう一度Googleに接続してください');}
 if(!response.ok){let data;try{data=await response.json()}catch{}throw Error(data?.error?.message||'Google Drive通信エラー '+response.status);}
 return response.status===204?null:response.json();
}
async function findBackup(){
 const q=encodeURIComponent("name = '"+FILE+"' and trashed = false");
 const data=await request('https://www.googleapis.com/drive/v3/files?q='+q+'&spaces=drive&fields=nextPageToken,files(id,name,modifiedTime)&page_size=100');
 const matches=data.files||[];
 matches.sort((a,b)=>b.modifiedTime.localeCompare(a.modifiedTime));
 return matches[0]||null;
}
function localData(){
 persist();
 const raw=localStorage.getItem('building-survey-v2');
 if(!raw)throw Error('保存する案件データがありません');
 const obj=JSON.parse(raw); if(obj.version!==2||!Array.isArray(obj.cases))throw Error('ローカルの案件形式が不正です');
 return JSON.stringify({...obj,driveBackupVersion:1,backupTime:new Date().toISOString()},null,2);
}
function checkRemote(data){
 if(data.version!==2||!Array.isArray(data.cases)||!data.cases.length||data.cases.length>1000)throw Error('Google Driveにあるファイルは対応する案件データではありません');
 data.cases.forEach(validateCase);
 return data;
}
async function upload(){
 const existing=await findBackup(),body=localData();
 if(existing && !confirm('Googleドライブ上の既存バックアップを、今の端末の全案件で上書きします。別端末の変更が消える場合があります。続けますか？'))return;
 if(existing){
  const response=await fetch('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(existing.id)+'?uploadType=media&fields=id,modifiedTime',{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json; charset=UTF-8'},body});
  if(!response.ok)throw Error('バックアップ更新失敗（'+response.status+'）');
  selectedFileId=existing.id;
 }else{
  const meta={name:FILE,mimeType:'application/json'};
  const boundary='buildingsurvey'+Date.now();
  const multipart='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+body+'\r\n--'+boundary+'--';
  const response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'multipart/related; boundary='+boundary},body:multipart});
  if(!response.ok)throw Error('バックアップ作成失敗（'+response.status+'）');
  selectedFileId=(await response.json()).id;
 }
 report('Googleドライブへ全案件を保存しました（'+new Date().toLocaleString('ja-JP')+'）');
}
async function restore(){
 const file=await findBackup();
 if(!file)throw Error('このGoogleアカウントにはバックアップがありません');
 const response=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media',{headers:{Authorization:'Bearer '+token}});
 if(!response.ok)throw Error('バックアップ取得失敗（'+response.status+'）');
 const data=checkRemote(await response.json());
 if(!confirm('Googleドライブから'+data.cases.length+'件の案件を復元します。今の端末の案件は置き換わります。先に「案件を保存 JSON」で必要なデータを控えてください。続けますか？'))return;
 // Snapshot the current state before replacing it, allowing recovery if needed.
 persist();
 localStorage.setItem('building-survey-before-drive-restore',localStorage.getItem('building-survey-v2')||'');
 cases=data.cases;
 activate(data.activeCaseId,data.activeBuildingId,data.activeFloorId);
 persist();
 selectedFileId=file.id;
 report('復元しました：'+data.cases.length+'件（'+new Date().toLocaleString('ja-JP')+'）');
}
async function run(fn){
 if(busy)return;
 busy=true;
 for(const id of ['driveConnect','driveUpload','driveRestore'])el(id).disabled=true;
 try{await authorize();await fn();}
 catch(e){report('エラー：'+e.message);}
 finally{busy=false;for(const id of ['driveConnect','driveUpload','driveRestore'])el(id).disabled=false;}
}
el('driveClientId').value=localStorage.getItem(CLIENT_KEY)||'';
el('driveConnect').addEventListener('click',()=>run(async()=>{report('Googleアカウントに接続しました');}));
el('driveUpload').addEventListener('click',()=>run(upload));
el('driveRestore').addEventListener('click',()=>run(restore));
})();