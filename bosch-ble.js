'use strict';
// Bosch MT connectivity protocol (LONG frames): CRC-8 polynomial 0xA6,
// initial 0xAA, payload fields little-endian. No remote laser commands.
const BOSCH_BLE_PROFILES=[
  {service:'00005301-0000-0041-5253-534f46540000',characteristic:'00004301-0000-0041-5253-534f46540000'},
  {service:'02a6c0d0-0451-4000-b000-fb3210111989',characteristic:'02a6c0d1-0451-4000-b000-fb3210111989'}
];
function boschCrc8(bytes){let crc=0xaa;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc&0x80)?((crc<<1)^0xa6)&255:(crc<<1)&255}return crc}
function boschSyncCommand(enabled){const b=Uint8Array.of(0xc0,0x55,2,enabled?1:0,0);return Uint8Array.of(...b,boschCrc8(b))}
class BoschFrameReader{
  constructor(onFrame,onIssue){this.onFrame=onFrame;this.onIssue=onIssue;this.buffer=[];this.lastTime=0}
  reset(){this.buffer=[];this.lastTime=0}
  push(view){
    const now=Date.now();if(now-this.lastTime>1500)this.buffer=[];this.lastTime=now;
    const bytes=new Uint8Array(view.buffer,view.byteOffset,view.byteLength);this.buffer.push(...bytes);
    if(this.buffer.length>1024){this.reset();this.onIssue('受信バッファが上限を超えました');return}
    while(this.buffer.length){
      const mode=this.buffer[0];let header,total;
      if(mode===0xc0){if(this.buffer.length<3)return;header=3;total=4+this.buffer[2]}
      else if((mode&0xc0)===0&&(mode&0x30)===0&&(mode&7)!==7){if(this.buffer.length<2)return;header=2;total=3+this.buffer[1]}
      else{this.buffer.shift();continue}
      if(this.buffer.length<total)return;
      const frame=Uint8Array.from(this.buffer.slice(0,total));
      if(boschCrc8(frame.subarray(0,-1))!==frame[frame.length-1]){this.buffer.splice(0,total);this.onIssue('受信データのチェックサムが一致しません');continue}
      this.buffer.splice(0,total);this.onFrame({kind:header===3?'event':'response',command:header===3?frame[1]:null,status:header===2?frame[0]:null,payload:frame.subarray(header,-1)});
    }
  }
}
function boschDistancePayload(bytes){
  if(bytes.length!==16)return {issue:'未対応の測定データ形式です'};
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),mode=bytes[0]>>>2,reference=bytes[0]&3,id=v.getUint16(2,true);
  if(mode===0)return {ignored:true};
  if(mode===63)return {issue:'距離計から測定エラーが通知されました'};
  // Mode 11 is the calculated-length packet observed in the supplied GLM log.
  // Offset 4 is the result; the other floats are supporting measurements.
  // Do not accept arbitrary modes: area, volume and angle are not edge lengths.
  if(mode!==1&&mode!==11)return {issue:'この測定モードは辺長への取込に未対応です（mode '+mode+'）。ログを保存してください'};
  const metres=v.getFloat32(4,true);
  if(!Number.isFinite(metres)||metres<(mode===11?0.000499:0.079999)||metres>150.001)return {issue:'有効な距離を受信できませんでした'};
  // A laser-on status may carry a previous result. Wait for a completed shot.
  if(bytes[1]&1)return {ignored:true};
  return {metres,id,reference,mode,measurementLabel:mode===11?'間接測定の計算結果（試験対応）':'通常距離',batteryLow:!!(bytes[1]&4),temperatureWarning:!!(bytes[1]&2)};
}
class BoschDistanceLink{
  constructor({onState,onDistance,onLog,bluetooth=navigator.bluetooth,secure=window.isSecureContext}){
    this.bluetooth=bluetooth;this.secure=secure;this.onState=onState;this.onDistance=onDistance;this.onLog=onLog;
    this.device=null;this.characteristic=null;this.busy=false;this.ready=false;this.lastKey=null;this.syncAck=null;this.connectionSerial=0;
    this.reader=new BoschFrameReader(frame=>this.handleFrame(frame),issue=>this.onLog(issue));
    this.notification=e=>{const v=e.target.value;this.onLog('受信 '+Array.from(new Uint8Array(v.buffer,v.byteOffset,v.byteLength),b=>b.toString(16).padStart(2,'0')).join(' '));this.reader.push(v)};
    this.dropped=()=>{this.cleanup();this.onState('disconnected','接続が切れました。「距離計を接続」で再接続できます。')};
  }
  handleFrame(frame){
    if(frame.kind==='response'){
      if(this.syncAck){const cb=this.syncAck;this.syncAck=null;cb(frame.status&7)}return;
    }
    if(frame.command!==0x55){this.onLog('未対応イベント command=0x'+frame.command.toString(16)+' payload='+Array.from(frame.payload,b=>b.toString(16).padStart(2,'0')).join(' '));return;}
    if(frame.payload.length)this.onLog('測定データ mode='+ (frame.payload[0]>>>2)+' / '+frame.payload.length+' bytes');
    const result=boschDistancePayload(frame.payload);
    if(result.ignored)return;
    if(result.issue){this.onState(this.ready?'connected':'connecting',result.issue);this.onLog(result.issue);return}
    if(!this.ready){this.onLog('接続準備中の測定値は入力しません');return}
    const key=result.mode+':'+result.id+':'+result.metres;if(key===this.lastKey)return;this.lastKey=key;this.onDistance(result);
  }
  async write(bytes){const c=this.characteristic;if(!c)throw Error('距離計が接続されていません');if(c.properties.write&&c.writeValueWithResponse)return c.writeValueWithResponse(bytes);if(c.properties.writeWithoutResponse&&c.writeValueWithoutResponse)return c.writeValueWithoutResponse(bytes);if(c.writeValue)return c.writeValue(bytes);throw Error('距離計への送信に対応していません')}
  async connect(){
    if(this.busy||this.ready)return;
    if(!this.bluetooth){this.onState('unsupported','このブラウザは距離計接続に未対応です。AndroidのChromeで開いてください。');return}
    if(!this.secure){this.onState('unsupported','HTTPSのアプリURLをAndroidのChromeで開いてください。');return}
    this.busy=true;this.onState('connecting','距離計を選択してください。');const serial=++this.connectionSerial;
    try{
      const services=BOSCH_BLE_PROFILES.map(p=>p.service);
      const device=await this.bluetooth.requestDevice({filters:[{namePrefix:'Bosch'},{namePrefix:'GLM'},...services.map(s=>({services:[s]}))],optionalServices:services});
      if(serial!==this.connectionSerial)return;this.device=device;device.addEventListener('gattserverdisconnected',this.dropped);
      this.onLog('機器 '+(device.name||'名称なし'));this.onState('connecting',(device.name||'距離計')+' に接続中…');
      if(!device.gatt)throw Error('この機器ではBluetooth接続を開始できません');
      const server=await device.gatt.connect();let found=false;
      for(const profile of BOSCH_BLE_PROFILES){
        try{const service=await server.getPrimaryService(profile.service);this.characteristic=await service.getCharacteristic(profile.characteristic);this.onLog('通信サービス '+profile.service);found=true;break}
        catch(error){if(error.name!=='NotFoundError')throw error;this.onLog('通信サービス未検出 '+profile.service)}
      }
      if(!found)throw Error('この距離計の通信方式にはまだ対応していません。接続ログを保存して知らせてください。');
      const c=this.characteristic;if(!c.properties.notify&&!c.properties.indicate)throw Error('測定値の自動受信に対応していません');
      this.reader.reset();this.lastKey=null;c.addEventListener('characteristicvaluechanged',this.notification);await c.startNotifications();
      let timer;const ack=new Promise((resolve,reject)=>{this.syncAck=status=>{clearTimeout(timer);status===0?resolve():reject(Error('距離計が受信開始を拒否しました（応答 '+status+'）'))};timer=setTimeout(()=>{this.syncAck=null;reject(Error('距離計から受信開始の応答がありません。距離計のBluetoothと他アプリの接続を確認してください。'))},15000)});
      // Attach rejection handling before awaiting the write to avoid unhandled
      // timeouts when an Android pairing prompt delays completion.
      ack.catch(()=>{});
      try{this.onLog('送信 '+Array.from(boschSyncCommand(true),b=>b.toString(16).padStart(2,'0')).join(' '));await this.write(boschSyncCommand(true));await ack}
      finally{clearTimeout(timer);this.syncAck=null}
      if(serial!==this.connectionSerial||!device.gatt.connected)throw Error('接続が切れました。もう一度接続してください。');
      this.ready=true;this.onState('connected',(device.name||'距離計')+' 接続済み。本体で距離または間接測定をしてください。');
    }catch(error){this.onLog(error.name+': '+error.message);this.cleanup();this.onState('error',error.name==='NotFoundError'?'機器選択をキャンセルしたか、距離計が見つかりませんでした。Bluetoothをオンにして再接続してください。':error.name==='SecurityError'?'Bluetooth接続が制限されています。ChatGPT内からではなくAndroidのChromeで直接開いてください。':error.message||'接続できませんでした。')}
    finally{this.busy=false}
  }
  cleanup(){
    this.ready=false;this.lastKey=null;this.reader.reset();
    if(this.characteristic)this.characteristic.removeEventListener('characteristicvaluechanged',this.notification);
    if(this.device){this.device.removeEventListener('gattserverdisconnected',this.dropped);if(this.device.gatt&&this.device.gatt.connected)this.device.gatt.disconnect()}
    this.characteristic=null;this.device=null;
  }
  async disconnect(){
    if(this.busy)return;this.busy=true;this.ready=false;
    try{if(this.device?.gatt?.connected)await this.write(boschSyncCommand(false))}catch(e){this.onLog('切断前の受信停止：'+e.message)}
    finally{this.cleanup();this.busy=false;this.onState('disconnected','距離計を切断しました。')}
  }
}