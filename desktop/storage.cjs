'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const { validateState, validatePrepared, choosePrepared, clone, MAX_BYTES } = require('./validation.cjs');
const FORMAT = 'seaton-seatplan';
const AAD = Buffer.from('seaton-vault-v1');
function validPin(pin) { return typeof pin === 'string' && /^\d{6,12}$/.test(pin); }
function validateVault(value) {
  if (!value || value.version !== 1 || value.kdf !== 'scrypt' || value.cipher !== 'aes-256-gcm') throw new Error('보호된 자료의 형식을 확인해 주세요.');
  for (const [key, size] of [['salt', 16], ['iv', 12], ['tag', 16]]) {
    if (typeof value[key] !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value[key]) || Buffer.from(value[key], 'base64').length !== size) throw new Error('보호된 자료가 손상되었습니다.');
  }
  if (typeof value.data !== 'string' || value.data.length > MAX_BYTES || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)) throw new Error('보호된 자료가 손상되었습니다.');
  return {version:1,kdf:'scrypt',cipher:'aes-256-gcm',salt:value.salt,iv:value.iv,tag:value.tag,data:value.data};
}
async function derive(pin, salt) { return scrypt(pin, salt, 32, {N:16384,r:8,p:1,maxmem:64*1024*1024}); }
function encrypt(key, salt, prepared) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(JSON.stringify({marker:FORMAT,prepared}),'utf8'),cipher.final()]);
  return {version:1,kdf:'scrypt',cipher:'aes-256-gcm',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
function decrypt(key, vault) {
  validateVault(vault);
  const decipher = crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(vault.iv,'base64'));
  decipher.setAAD(AAD);decipher.setAuthTag(Buffer.from(vault.tag,'base64'));
  const decoded = JSON.parse(Buffer.concat([decipher.update(Buffer.from(vault.data,'base64')),decipher.final()]).toString('utf8'));
  if(decoded.marker!==FORMAT) throw new Error('보호된 자료가 손상되었습니다.');
  return decoded.prepared === null ? null : validatePrepared(decoded.prepared);
}
function validateDocument(value) {
  if (!value || value.format !== FORMAT || value.version !== 1) throw new Error('지원하지 않는 자리표 파일입니다.');
  return {format:FORMAT,version:1,state:value.state===null?null:validateState(value.state),vault:value.vault===null?null:validateVault(value.vault)};
}
async function atomicWrite(file, data, backup = true) {
  await fs.mkdir(path.dirname(file), {recursive:true});
  const temporary = file + '.tmp-' + process.pid + '-' + crypto.randomBytes(5).toString('hex');
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(data, 'utf8');await handle.sync();await handle.close();handle=null;
    if(backup) {
      try { await fs.copyFile(file,file+'.bak'); } catch(error) { if(error.code!=='ENOENT')throw error; }
    }
    await fs.rename(temporary,file);
  } finally { if(handle)await handle.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{}); }
}
class SeatingStore {
  constructor(directory) {
    this.file = path.join(directory,'classroom.json');
    this.document = {format:FORMAT,version:1,state:null,vault:null};
    this.key=null;this.unlocked=false;this.queue=Promise.resolve();this.failedAttempts=0;this.nextAttempt=0;this.recoveryNotice='';this.recovered=false;
  }
  async init() {
    let firstError;
    for (const candidate of [this.file,this.file+'.bak']) {
      try {
        const stat = await fs.stat(candidate);if(stat.size>MAX_BYTES*2)throw new Error('저장 파일이 너무 큽니다.');
        this.document=validateDocument(JSON.parse(await fs.readFile(candidate,'utf8')));
        if(candidate!==this.file){this.recoveryNotice='자동 저장 자료를 백업에서 복구했습니다.';this.recovered=true;}
        return this;
      } catch(error) { if(error.code!=='ENOENT')firstError=firstError||error; }
    }
    if(firstError)throw new Error('자동 저장 자료와 백업을 읽지 못했습니다. 원본 파일은 유지됩니다.');
    return this;
  }
  get state(){return this.document.state?clone(this.document.state):null;}
  get pinExists(){return Boolean(this.document.vault);}
  requireUnlocked(){if(!this.unlocked)throw new Error('설정 잠금을 먼저 해제해 주세요.');}
  async commit(update) {
    const operation = this.queue.then(async()=>{
      const next=validateDocument(typeof update==='function'?update(this.document):update);
      await atomicWrite(this.file,JSON.stringify(next),!this.recovered);
      this.document=next;this.recovered=false;
    });
    this.queue=operation.catch(()=>{});await operation;
  }
  async saveState(state) {
    const checked=validateState(state);
    await this.commit(current=>({...current,state:checked}));return this.state;
  }
  async unlock({pin,confirm}={}) {
    if(Date.now()<this.nextAttempt)throw new Error('잠시 후 PIN을 다시 입력해 주세요.');
    if(!validPin(pin))throw new Error('숫자 6~12자리 PIN을 입력해 주세요.');
    await this.queue;
    if(!this.pinExists) {
      if(pin!==confirm)throw new Error('두 PIN이 일치하지 않습니다.');
      const salt=crypto.randomBytes(16),key=await derive(pin,salt);
      try {await this.commit(current=>{if(current.vault)throw new Error('PIN이 이미 설정되었습니다. 다시 입력해 주세요.');return {...current,vault:encrypt(key,salt,null)};});}catch(error){key.fill(0);throw error;}
      if(this.key)this.key.fill(0);this.key=key;
    } else {
      const key=await derive(pin,Buffer.from(this.document.vault.salt,'base64'));
      try {decrypt(key,this.document.vault);}catch {key.fill(0);this.failedAttempts++;this.nextAttempt=Date.now()+Math.min(30000,500*Math.pow(2,Math.min(this.failedAttempts-1,6)));throw new Error('PIN이 일치하지 않거나 보호된 자료가 손상되었습니다.');}
      if(this.key)this.key.fill(0);this.key=key;
    }
    this.failedAttempts=0;this.nextAttempt=0;this.unlocked=true;
    return this.getPrepared();
  }
  lock(){this.unlocked=false;}
  destroy(){this.lock();if(this.key)this.key.fill(0);this.key=null;}
  getPrepared(){this.requireUnlocked();return this.document.vault&&this.key?decrypt(this.key,this.document.vault):null;}
  async savePrepared(prepared) {
    this.requireUnlocked();let checked;
    await this.commit(current=>{
      if(!current.state)throw new Error('명단과 책상을 먼저 저장해 주세요.');
      checked=validatePrepared(prepared,current.state);
      return {...current,vault:encrypt(this.key,Buffer.from(current.vault.salt,'base64'),checked)};
    });
    return checked;
  }
  async clearPrepared(){this.requireUnlocked();await this.commit(current=>({...current,vault:encrypt(this.key,Buffer.from(current.vault.salt,'base64'),null)}));}
  choosePrepared(current) {
    // Locked controller may consume the final result, but cannot retrieve the hidden plan.
    if(!this.key||!this.document.vault)throw new Error('발표 준비를 확인해 주세요.');
    const prepared=decrypt(this.key,this.document.vault);
    if(!prepared)throw new Error('발표 준비를 확인해 주세요.');
    return choosePrepared(current,prepared);
  }
  async exportDocument(state){this.requireUnlocked();await this.saveState(state);return JSON.stringify(this.document,null,2);}
  async importDocument(raw){this.requireUnlocked();if(typeof raw!=='string'||Buffer.byteLength(raw)>MAX_BYTES*2)throw new Error('자리표 파일이 너무 큽니다.');const next=validateDocument(JSON.parse(raw));if(!next.state)throw new Error('자리표가 없는 파일입니다.');await this.commit(next);this.destroy();return this.state;}
  async flush(){await this.queue;}
}
module.exports={SeatingStore,atomicWrite,validateDocument,validateVault,validPin,derive,encrypt,decrypt,FORMAT};
