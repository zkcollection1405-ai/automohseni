/* =====================================================================
   اتو محسنی — نسخه وب (PWA) برای آیفون
   این فایل لایهٔ «پلتفرم» است و بعد از core.js بارگذاری می‌شود:
   ذخیره‌سازی روی دستگاه (IndexedDB)، بکاپ/بازیابی، ناوبری موبایل،
   خروجی تصویر فاکتور، قفل خودکار و ثبت Service Worker.
   منطق حسابداری در core.js همان نسخهٔ دسکتاپ (V11.2) است.
   ===================================================================== */

var FONT_STACK="-apple-system, 'Geeza Pro', 'SF Arabic', Tahoma, Arial, sans-serif";
var PAGE_IDS=['dashboard','vehicles','checks','suppliers','partners','parts','receipts','employees','expenses','accounts','notes','monthly','settlement','alerts','settings','backup'];
var TABS=[
 ['dashboard','خانه','<path d="M3 11l9-8 9 8M5 10v10h14V10"/>'],
 ['vehicles','پرونده‌ها','<path d="M5 17h14M3 13l2-6h14l2 6v4H3zM7 17v2M17 17v2"/>'],
 ['settlement','فاکتور','<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>'],
 ['checks','چک‌ها','<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 14h4M15 10h2"/>'],
 ['more','بیشتر','<path d="M4 7h16M4 12h16M4 17h16"/>']
];
var noSave=false,lastSavedStr=null,snapChecked='',saveChain=Promise.resolve(),pendingSaves=0,lastBackupTs=0,logoImg=null;

/* ---------- پیام کوتاه ---------- */
var toastTimer=null;
function showToast(msg,bad){var t=E('toast');t.textContent=msg;t.className='show'+(bad?' bad':'');clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.className=''},bad?6000:2600)}
function setSaveState(s){var e=E('saveState');if(!e)return;e.textContent=s=='saving'?'در حال ذخیره…':(s=='error'?'⚠ ذخیره نشد':'ذخیره روی گوشی ✓')}

/* ---------- حافظهٔ دستگاه: IndexedDB (با پشتیبان localStorage) ---------- */
var idbPromise=null;
function idbOpen(){
  if(idbPromise)return idbPromise;
  idbPromise=new Promise(function(res,rej){
    try{
      if(!window.indexedDB)throw new Error('no idb');
      var r=indexedDB.open('automohseni',1);
      r.onupgradeneeded=function(){r.result.createObjectStore('kv')};
      r.onsuccess=function(){res(r.result)};
      r.onerror=function(){rej(r.error)};
      r.onblocked=function(){rej(new Error('blocked'))};
    }catch(e){rej(e)}
  });
  return idbPromise;
}
var useLS=false;
function lsGet(k){try{return localStorage.getItem('am_'+k)}catch(e){return null}}
function lsSet(k,v){localStorage.setItem('am_'+k,v)}
function kvTx(mode,fn){return idbOpen().then(function(d){return new Promise(function(res,rej){var tx=d.transaction('kv',mode),st=tx.objectStore('kv'),out=fn(st);tx.oncomplete=function(){res(out&&out.result)};tx.onerror=function(){rej(tx.error)};tx.onabort=function(){rej(tx.error||new Error('abort'))}})})}
function kvGet(k){if(useLS)return Promise.resolve(lsGet(k));return kvTx('readonly',function(s){return s.get(k)})}
function kvSet(k,v){if(useLS){try{lsSet(k,v);return Promise.resolve()}catch(e){return Promise.reject(e)}}return kvTx('readwrite',function(s){s.put(v,k)})}
function kvDel(k){if(useLS){try{localStorage.removeItem('am_'+k)}catch(e){}return Promise.resolve()}return kvTx('readwrite',function(s){s.delete(k)})}
function kvKeys(){if(useLS){var a=[],i,k;try{for(i=0;i<localStorage.length;i++){k=localStorage.key(i);if(k.indexOf('am_')==0)a.push(k.substr(3))}}catch(e){}return Promise.resolve(a)}return kvTx('readonly',function(s){return s.getAllKeys()})}

function dayStamp(){var t=todayJ();return t[0]+pad2(t[1])+pad2(t[2])}
function nowStamp(){var d=new Date();return dayStamp()+'_'+pad2(d.getHours())+pad2(d.getMinutes())}
function jalaliFromStamp(st){st=String(st);return faDigits(st.substr(0,4)+'/'+st.substr(4,2)+'/'+st.substr(6,2))}
function jalaliFromTs(ts){var d=new Date(ts),j=g2j(d.getFullYear(),d.getMonth()+1,d.getDate());return faDigits(j[0]+'/'+pad2(j[1])+'/'+pad2(j[2]))}

/* ---------- ذخیره‌سازی (جایگزین saveDB فایل JSON نسخهٔ دسکتاپ) ---------- */
function persist(txt){
  var prev=lastSavedStr;lastSavedStr=txt;pendingSaves++;setSaveState('saving');
  saveChain=saveChain.then(function(){
    var day=dayStamp(),ops=[kvSet('db',txt)];
    if(prev&&prev!==txt)ops.push(kvSet('bak',prev));
    var snap=Promise.resolve();
    if(prev&&snapChecked!==day){snapChecked=day;snap=kvGet('snap_'+day).then(function(x){if(!x)return kvSet('snap_'+day,prev)})}
    return Promise.all(ops.concat([snap])).then(pruneSnaps);
  }).then(function(){pendingSaves--;setSaveState(pendingSaves?'saving':'saved')},function(e){pendingSaves--;setSaveState('error');showToast('ذخیره روی گوشی انجام نشد! همین حالا بکاپ بگیرید.',true)});
  return saveChain;
}
function pruneSnaps(){return kvKeys().then(function(ks){var s=[],i;for(i=0;i<ks.length;i++)if(String(ks[i]).indexOf('snap_')==0)s.push(ks[i]);s.sort();s.reverse();var dels=[];for(i=14;i<s.length;i++)dels.push(kvDel(s[i]));return Promise.all(dels)})}
function saveDB(noRender){
  if(noSave){alert('خواندن اطلاعات از حافظه گوشی با مشکل روبه‌رو شد و برای جلوگیری از پاک‌شدن داده‌ها ذخیره غیرفعال است. برنامه را کامل ببندید و دوباره باز کنید.');return false}
  try{ensureArrays();persist(JSON.stringify(db));if(!noRender)renderAll();return true}
  catch(ex){alert('ذخیره اطلاعات انجام نشد. اطلاعات فرم باز می‌ماند.\n'+ex.message);return false}
}
var _ensureCore=ensureArrays;
ensureArrays=function(){_ensureCore();var s=db.settings;if(s.address==null)s.address='بلوار قطب راوندی، حکمت 61 (روبروی پارک مدنی) جنب آهن آلات علوی';if(s.phone==null)s.phone='09394869183';db.version=11};

/* ---------- ناوبری ---------- */
function buildNav(){
  var m='',t='',i,id,tab;
  for(i=0;i<PAGE_IDS.length;i++){id=PAGE_IDS[i];m+='<button class="menuBtn" data-p="'+id+'" onclick="goPage(\''+id+'\')">'+pageTitles[id]+'</button>'}
  E('menu').innerHTML=m;
  for(i=0;i<TABS.length;i++){tab=TABS[i];t+='<button data-p="'+tab[0]+'" onclick="'+(tab[0]=='more'?'toggleDrawer(true)':'goPage(\''+tab[0]+'\')')+'"><svg viewBox="0 0 24 24">'+tab[2]+'</svg><span>'+tab[1]+'</span></button>'}
  E('tabbar').innerHTML=t;
}
function toggleDrawer(on){var b=document.body;if(on===undefined)on=!b.classList.contains('drawer');if(on)b.classList.add('drawer');else b.classList.remove('drawer')}
function goPage(id){
  var i,bs;if(PAGE_IDS.indexOf(id)<0)id='dashboard';
  for(i=0;i<PAGE_IDS.length;i++)E(PAGE_IDS[i]).className='page'+(PAGE_IDS[i]==id?' active':'');
  E('pageTitle').innerText=pageTitles[id]||'';
  document.body.setAttribute('data-page',id);
  bs=document.querySelectorAll('[data-p]');for(i=0;i<bs.length;i++){var p=bs[i].getAttribute('data-p');if(bs[i].parentNode.id=='menu')bs[i].className='menuBtn'+(p==id?' active':'');else bs[i].className=(p==id?'active':'')}
  toggleDrawer(false);window.scrollTo(0,0);
  if(id=='backup')refreshBackupInfo();
  try{sessionStorage.setItem('am_page',id)}catch(e){}
}
function showVehiclesPage(){goPage('vehicles')}
function openSettlement(id){goPage('settlement');renderSettlement();E('settleVehicle').value=id;renderSettlement()}

/* ---------- ظاهر جدول‌ها (کارت در موبایل) و کیبورد عددی ---------- */
function tableWrap(hd,rows){
  if(!rows.length)return'<div class="empty">اطلاعاتی ثبت نشده است.</div>';
  var h='<div class="tableBox"><table><thead><tr>',i,j;
  for(i=0;i<hd.length;i++)h+='<th>'+hd[i]+'</th>';
  h+='</tr></thead><tbody>';
  for(i=0;i<rows.length;i++){h+='<tr>';for(j=0;j<rows[i].length;j++)h+='<td data-label="'+hd[j]+'"'+(hd[j]=='عملیات'?' class="act"':'')+'>'+rows[i][j]+'</td>';h+='</tr>'}
  return h+'</tbody></table></div>';
}
var NUMERIC_FIELDS=/^(estimate|labor|discount|extra|insuranceAmount|amount|cost|charge|unitPrice|sellUnitPrice|paidInitial|customerDirect|qty|units|salaryRate|opening|paidAmount)$/;
function inputField(l,n,v,t,p,w){
  var im=NUMERIC_FIELDS.test(n)?' inputmode="decimal"':(n=='phone'?' inputmode="tel"':'');
  return'<div class="fg '+(w?'fgFull':'')+'"><label>'+l+'</label><input type="'+(t||'text')+'" name="'+n+'" value="'+esc(v||'')+'" placeholder="'+esc(p||'')+'"'+im+'/></div>';
}

/* ---------- پنجره‌ها ---------- */
var _openModal=openModal,_closeModal=closeModal;
openModal=function(t,h){_openModal(t,h);document.body.classList.add('modalOpen');E('modalBody').scrollTop=0};
closeModal=function(){_closeModal();document.body.classList.remove('modalOpen')};
document.addEventListener('keydown',function(ev){if(ev.keyCode==27){if(E('calShade').style.display=='block')closeCal();else if(E('modalShade').style.display=='block')closeModal()}});

/* ---------- فیلد جستجو/ماه: ساخت دوباره صفحه نباید فوکوس را بپراند ---------- */
(function(){
  var desc=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  function morphAround(page,live,html){
    var tmp=document.createElement('div'),path=[],n=live,i,lp,fp,lc,fc,fresh;
    desc.set.call(tmp,html);
    while(n!==page){path.unshift(Array.prototype.indexOf.call(n.parentNode.childNodes,n));n=n.parentNode}
    fresh=tmp;for(i=0;i<path.length;i++){fresh=fresh.childNodes[path[i]];if(!fresh)return false}
    if(fresh.id!==live.id||fresh.tagName!==live.tagName)return false;
    lp=page;fp=tmp;
    for(i=0;i<path.length;i++){
      lc=lp.childNodes[path[i]];fc=fp.childNodes[path[i]];
      while(lp.firstChild!==lc)lp.removeChild(lp.firstChild);
      while(lc.nextSibling)lp.removeChild(lc.nextSibling);
      while(fp.firstChild!==fc)lp.insertBefore(fp.firstChild,lc);
      while(fc.nextSibling)lp.appendChild(fc.nextSibling);
      lp=lc;fp=fc;
    }
    return true;
  }
  var ids=['notes','alerts','monthly','employees'],k;
  for(k=0;k<ids.length;k++)(function(el){
    Object.defineProperty(el,'innerHTML',{configurable:true,get:function(){return desc.get.call(this)},set:function(h){
      var a=document.activeElement;
      if(a&&a.id&&a!==this&&a.tagName=='INPUT'&&this.contains(a)){try{if(morphAround(this,a,h))return}catch(e){}}
      desc.set.call(this,h);
    }});
  })(E(ids[k]));
})();

/* ---------- ورود/قفل خودکار ---------- */
var hiddenAt=0;
document.addEventListener('visibilitychange',function(){
  if(document.hidden){hiddenAt=Date.now()}
  else if(hiddenAt&&Date.now()-hiddenAt>5*60*1000&&E('loginShade').style.display=='none'){lockApp()}
});

/* ---------- ارسال/دانلود فایل ---------- */
function downloadBlob(blob,name){
  var a=document.createElement('a'),u=URL.createObjectURL(blob);
  a.href=u;a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(u)},4000);
  return true;
}
function shareFile(blob,name,title){
  var f=null;try{f=new File([blob],name,{type:blob.type})}catch(e){}
  if(f&&navigator.canShare&&navigator.canShare({files:[f]})){
    return navigator.share({files:[f],title:title}).then(function(){return true},function(e){
      if(e&&e.name=='AbortError')return false;
      return downloadBlob(blob,name);
    });
  }
  return Promise.resolve(downloadBlob(blob,name));
}
function noteBackupDone(){lastBackupTs=Date.now();kvSet('lastBackup',lastBackupTs);renderDashboard();refreshBackupInfo()}

/* ---------- بکاپ و بازیابی ---------- */
function exportBackup(){
  ensureArrays();
  var blob=new Blob([JSON.stringify(db)],{type:'application/json'});
  shareFile(blob,'AutoMohseni_Backup_'+nowStamp()+'.json','بکاپ اتو محسنی').then(function(ok){if(ok){noteBackupDone();showToast('بکاپ ساخته شد؛ آن را در Files / iCloud نگه دارید')}});
}
function exportCSV(){
  var rows=[['کد','مشتری','موبایل','پلاک','خودرو','مبلغ نهایی','مانده']],i,v,s,j,l,csv='﻿';
  for(i=0;i<db.vehicles.length;i++){v=db.vehicles[i];s=vehicleStats(v);rows.push([v.code,v.customer,v.phone,platePlain(v),v.car,s.final,s.balance])}
  for(i=0;i<rows.length;i++){l=[];for(j=0;j<rows[i].length;j++)l.push('"'+String(rows[i][j]).replace(/"/g,'""')+'"');csv+=l.join(',')+'\r\n'}
  shareFile(new Blob([csv],{type:'text/csv'}),'AutoMohseni_Vehicles_'+nowStamp()+'.csv','خروجی خودروها');
}
function decodeBuffer(buf){
  var u=new Uint8Array(buf),t;
  if(u.length>1&&u[0]==0xFF&&u[1]==0xFE)t=new TextDecoder('utf-16le').decode(u.subarray(2));
  else if(u.length>1&&u[0]==0xFE&&u[1]==0xFF)t=new TextDecoder('utf-16be').decode(u.subarray(2));
  else t=new TextDecoder('utf-8').decode(u);
  return t.replace(/^﻿/,'');
}
function dbSummary(x){return faDigits((x.vehicles||[]).length)+' پرونده خودرو، '+faDigits((x.receipts||[]).length)+' دریافت، '+faDigits((x.employees||[]).length)+' پرسنل'}
function replaceDB(x,msg){
  var before=lastSavedStr;
  db=x;ensureArrays();
  if(before)kvSet('pre_replace',before);
  persist(JSON.stringify(db));renderAll();showToast(msg);
}
function importBackupFile(inp){
  var f=inp.files&&inp.files[0],r;if(!f)return;
  r=new FileReader();
  r.onload=function(){
    var x;
    try{x=JSON.parse(decodeBuffer(r.result))}catch(e){alert('این فایل خوانده نشد؛ مطمئن شوید فایل بکاپ (automohseni.json) را انتخاب کرده‌اید.');return}
    if(!validateDB(x)){alert('فایل انتخاب‌شده بکاپ معتبر اتومحسنی نیست.');return}
    if(!confirm('اطلاعات فعلی این گوشی با این فایل جایگزین شود؟\n\nمحتوای فایل: '+dbSummary(x)+'\n\n(نسخهٔ فعلی به‌عنوان «نسخه قبل» نگه داشته می‌شود.)'))return;
    if(noSave){alert('ذخیره غیرفعال است؛ برنامه را ببندید و دوباره باز کنید.');return}
    replaceDB(x,'بازیابی انجام شد');
  };
  r.onerror=function(){alert('خواندن فایل ممکن نشد.')};
  r.readAsArrayBuffer(f);inp.value='';
}
function restoreKey(key,label){
  kvGet(key).then(function(t){
    var x;try{x=JSON.parse(t)}catch(e){}
    if(!x||!validateDB(x)){alert('این نسخه معتبر نیست.');return}
    if(!confirm('بازگشت به «'+label+'»؟\n'+dbSummary(x)+'\n\nنسخهٔ فعلی هم برای بازگشت نگه داشته می‌شود.'))return;
    replaceDB(x,'بازیابی شد');
  });
}
function clearAll(){
  if(!confirm('تمام اطلاعات این گوشی حذف شود؟\nقبل از این کار حتماً بکاپ بگیرید.'))return;
  if(!confirm('مطمئن هستید؟ این کار پرونده‌ها و حساب‌ها را پاک می‌کند.'))return;
  var before=lastSavedStr,pass=db.settings.password,keep={workshop:db.settings.workshop,address:db.settings.address,phone:db.settings.phone};
  db=emptyDB();db.settings.password=pass;db.settings.workshop=keep.workshop;db.settings.address=keep.address;db.settings.phone=keep.phone;
  ensureArrays();if(before)kvSet('pre_replace',before);
  persist(JSON.stringify(db));renderAll();showToast('اطلاعات پاک شد. «نسخه قبل» هنوز قابل بازیابی است.');
}
function refreshBackupInfo(){
  var st=E('backupStatus'),sn=E('snapList'),du=E('diskInfo'),msg;
  if(st){
    if(!lastBackupTs)msg='<b>هنوز بکاپ نگرفته‌اید.</b> بکاپ را در Files یا iCloud Drive نگه دارید تا با گم‌شدن/تعویض گوشی اطلاعات از بین نرود.';
    else msg='آخرین بکاپ: <b>'+jalaliFromTs(lastBackupTs)+'</b> ('+faDigits(Math.floor((Date.now()-lastBackupTs)/86400000))+' روز پیش)';
    st.className='notice '+(lastBackupTs&&Date.now()-lastBackupTs<7*86400000?'okNotice':'');st.innerHTML=msg;
  }
  if(du&&navigator.storage&&navigator.storage.estimate){
    navigator.storage.estimate().then(function(e){
      var p=navigator.storage.persisted?navigator.storage.persisted():Promise.resolve(false);
      p.then(function(per){du.innerHTML='حجم اطلاعات روی گوشی: '+faDigits(Math.max(1,Math.round((lastSavedStr?lastSavedStr.length:0)/1024)))+' کیلوبایت | حافظهٔ دائمی: '+(per?'فعال ✓':'درخواست نشده (برنامه را به Home Screen اضافه کنید)')});
    });
  }
  if(sn){
    kvKeys().then(function(ks){
      var s=[],i;for(i=0;i<ks.length;i++)if(String(ks[i]).indexOf('snap_')==0)s.push(ks[i]);
      s.sort();s.reverse();
      var rows=[];
      return Promise.all(s.map(function(k){return kvGet(k).then(function(t){var x;try{x=JSON.parse(t)}catch(e){}return{k:k,x:x}})})).then(function(a){
        for(i=0;i<a.length;i++)if(a[i].x)rows.push([jalaliFromStamp(a[i].k.substr(5))+' (ابتدای روز)',dbSummary(a[i].x),'<button class="btn btnSmall btnLight" onclick="restoreKey(\''+a[i].k+'\',\'نسخه '+jalaliFromStamp(a[i].k.substr(5))+'\')">بازیابی</button>']);
        sn.innerHTML=tableWrap(['تاریخ','محتوا','عملیات'],rows);
      });
    });
  }
}
function renderBackup(){
  E('backup').innerHTML='<div class="notice okNotice"><b>اطلاعات فقط روی همین گوشی ذخیره می‌شود</b><br/>هیچ‌چیز به اینترنت یا سرور ارسال نمی‌شود و برنامه بدون اینترنت هم کار می‌کند. چون اطلاعات روی خود دستگاه است، <b>بکاپ منظم</b> تنها راه نجات در صورت گم‌شدن یا تعویض گوشی است.</div>'
  +'<div id="backupStatus" class="notice"></div>'
  +'<div class="row"><div class="col2"><div class="card"><h3>بکاپ اطلاعات</h3><p class="muted">یک فایل JSON ساخته می‌شود؛ در پنجرهٔ باز‌شده «Save to Files» را بزنید و روی iCloud Drive بگذارید (یا برای خودتان در تلگرام/واتساپ بفرستید). فرمت فایل دقیقاً همان نسخهٔ دسکتاپ است.</p><button class="btn btnGold" onclick="exportBackup()">ساخت بکاپ و ذخیره در Files</button> <button class="btn btnLight" onclick="exportCSV()">خروجی CSV خودروها</button></div></div>'
  +'<div class="col2"><div class="card"><h3>بازیابی / انتقال از نسخه دسکتاپ</h3><p class="muted">فایل <b>automohseni.json</b> از پوشهٔ data برنامهٔ ویندوزی یا هر فایل بکاپی که از همین برنامه گرفته‌اید را انتخاب کنید.</p><button class="btn" onclick="E(\'importFile\').click()">انتخاب فایل بکاپ…</button> <button class="btn btnLight" onclick="restoreKey(\'bak\',\'نسخه قبل از آخرین تغییر\')">برگشت به نسخه قبل</button></div></div></div><div class="clear"></div>'
  +'<div class="subHead">نقاط بازیابی خودکار (ابتدای هر روز، ۱۴ روز اخیر)</div><div id="snapList"></div>'
  +'<div class="card infoNotice" style="margin-top:12px"><div id="diskInfo" class="muted"></div></div>'
  +'<div class="card" style="margin-top:12px"><h3>نصب روی صفحهٔ اصلی آیفون</h3><div class="muted" style="line-height:2">۱) برنامه را در <b>Safari</b> باز کنید. ۲) دکمهٔ اشتراک‌گذاری (مربع با فلش رو به بالا) را بزنید. ۳) «<b>Add to Home Screen</b>» را انتخاب کنید. از آن به بعد مثل یک اپ کامل و بدون نوار آدرس اجرا می‌شود و اطلاعات از پاک‌شدن خودکار Safari در امان می‌ماند.</div></div>'
  +'<div class="card" style="margin-top:12px"><button class="btn btnDanger" onclick="clearAll()">پاک‌کردن کامل اطلاعات</button></div>';
}
function renderSettings(){
  var s=db.settings;
  E('settings').innerHTML='<div class="row"><div class="col2"><div class="card"><h3>مشخصات مجموعه (سربرگ فاکتور)</h3>'
  +'<div class="fg fgFull"><label>نام مجموعه</label><input id="setName" value="'+esc(s.workshop)+'"/></div>'
  +'<div class="fg fgFull"><label>آدرس</label><input id="setAddress" value="'+esc(s.address)+'"/></div>'
  +'<div class="fg fgFull"><label>شمارهٔ تماس</label><input id="setPhone" inputmode="tel" value="'+esc(s.phone)+'"/></div>'
  +'<button class="btn btnGold" onclick="saveShopInfo()">ذخیره مشخصات</button></div></div>'
  +'<div class="col2"><div class="card"><h3>تغییر رمز ورود</h3><div class="notice">رمز اولیه برنامه 3030 است. این رمز فقط قفل صفحهٔ برنامه است (برنامه پس از ۵ دقیقه خروج از صفحه، خودکار قفل می‌شود).</div>'
  +'<div class="fg fgFull"><label>رمز فعلی</label><input id="oldPass" type="password"/></div><div class="fg fgFull"><label>رمز جدید</label><input id="newPass" type="password"/></div><div class="fg fgFull"><label>تکرار رمز جدید</label><input id="repeatPass" type="password"/></div>'
  +'<button class="btn btnGold" onclick="changePassword()">تغییر رمز</button> <button class="btn" onclick="lockApp()">قفل کردن برنامه</button></div></div></div><div class="clear"></div>';
}
function saveShopInfo(){
  var n=trimS(E('setName').value);if(!n){alert('نام مجموعه را وارد کنید.');return}
  db.settings.workshop=n;db.settings.address=trimS(E('setAddress').value);db.settings.phone=trimS(E('setPhone').value);
  if(saveDB(true)){renderAll();showToast('ذخیره شد')}
}

/* ---------- داشبورد: خوش‌آمد و یادآوری بکاپ ---------- */
var _renderDashboard=renderDashboard;
renderDashboard=function(){
  _renderDashboard();
  var pre='',isEmpty=!db.vehicles.length&&!db.accounts.length&&!db.employees.length&&!db.suppliers.length;
  if(isEmpty)pre='<div class="notice infoNotice"><b>خوش آمدید 👋</b><br/>اگر قبلاً از نسخهٔ ویندوزی استفاده می‌کردید، فایل <b>data/automohseni.json</b> را به گوشی منتقل کنید (AirDrop، iCloud Drive یا تلگرام) و دکمهٔ زیر را بزنید تا تمام اطلاعات قبلی وارد شود. در غیر این صورت کار را با «پذیرش خودرو» و تعریف «صندوق و حساب‌ها» شروع کنید.<div class="noticeAct"><button class="btn btnGold" onclick="E(\'importFile\').click()">وارد کردن اطلاعات نسخه دسکتاپ</button></div></div>';
  else if(!lastBackupTs||Date.now()-lastBackupTs>7*86400000)pre='<div class="notice"><b>یادآوری بکاپ:</b> '+(lastBackupTs?'آخرین بکاپ شما '+faDigits(Math.floor((Date.now()-lastBackupTs)/86400000))+' روز پیش بوده است.':'هنوز از اطلاعات بکاپ نگرفته‌اید.')+'<div class="noticeAct"><button class="btn btnGold btnSmall" onclick="exportBackup()">همین حالا بکاپ بگیر</button></div></div>';
  if(pre)E('dashboard').insertAdjacentHTML('afterbegin',pre);
};

/* ---------- چاپ و تصویر فاکتور ---------- */
function printInvoice(id){var v=findById(db.vehicles,id);if(!v)return;E('printArea').innerHTML=invoiceHtml(v);setTimeout(function(){window.print()},250)}
function fitText(z,t,maxW){t=String(t);if(z.measureText(t).width<=maxW)return t;while(t.length>1&&z.measureText(t+'…').width>maxW)t=t.substr(0,t.length-1);return t+'…'}
function drawInvoiceCanvas(v){
  var s=vehicleStats(v),it=invoiceItems(v),W=1240,H=Math.max(1754,690+it.length*55),c=document.createElement('canvas'),z,gold='#d4a51f',black='#171717',i,y,img=logoImg;
  c.width=W;c.height=H;z=c.getContext('2d');z.direction='rtl';
  z.fillStyle='#fff';z.fillRect(0,0,W,H);
  z.fillStyle=black;z.fillRect(0,0,W,250);z.fillStyle=gold;z.fillRect(0,240,W,12);
  if(img&&img.complete&&img.naturalWidth){var sc=Math.min(230/img.naturalWidth,140/img.naturalHeight);try{z.drawImage(img,70,25,Math.round(img.naturalWidth*sc),Math.round(img.naturalHeight*sc))}catch(ex){}}
  z.textAlign='right';
  z.fillStyle=gold;z.font="bold 42px "+FONT_STACK;z.fillText(fitText(z,db.settings.workshop,880),1160,80);
  z.fillStyle='#fff';z.font="24px "+FONT_STACK;z.fillText(fitText(z,db.settings.address,880),1160,132);z.fillText(db.settings.phone,1160,176);
  z.fillStyle='#222';z.font="bold 26px "+FONT_STACK;z.fillText('صورتحساب: INV-'+v.code.replace('PDR-',''),1160,305);z.fillText('تاریخ: '+(v.deliveryDate||v.entryDate),600,305);
  z.font="22px "+FONT_STACK;z.fillText(fitText(z,'خریدار: '+v.customer,560),1160,355);z.fillText(fitText(z,'خودرو: '+v.car+'   پلاک: '+platePlain(v),520),600,355);
  y=420;z.fillStyle=black;z.fillRect(60,y,W-120,52);z.fillStyle=gold;z.font="bold 20px "+FONT_STACK;
  z.fillText('شرح کالا یا خدمات',1150,y+34);z.fillText('تعداد',640,y+34);z.fillText('قیمت واحد',500,y+34);z.fillText('قیمت کل',280,y+34);y+=52;
  for(i=0;i<it.length;i++){
    z.strokeStyle='#888';z.lineWidth=1;z.strokeRect(60,y,W-120,50);z.fillStyle='#222';z.font="19px "+FONT_STACK;
    z.fillText(fitText(z,it[i].d,470),1150,y+32);z.fillText(faDigits(it[i].q),640,y+32);z.fillText(comma(it[i].u),500,y+32);z.fillText(comma(it[i].t),280,y+32);y+=50;
  }
  y+=45;z.font="bold 24px "+FONT_STACK;z.fillStyle='#222';z.fillText('جمع کل: '+money(s.final),1160,y);z.fillText('پرداخت شده: '+money(s.received),700,y);
  z.fillStyle='#a51e16';z.fillText('مانده: '+money(Math.max(0,s.balance)),340,y);
  y+=100;z.fillStyle='#222';z.font="20px "+FONT_STACK;z.fillText('امضای خریدار: ................................',1160,y);z.fillText('مهر و امضای فروشنده: ................................',570,y);
  return c;
}
var imgBlob=null,imgName='',imgUrl='',imgBack='';
function exportInvoiceJpg(id){
  var v=findById(db.vehicles,id);if(!v)return;
  var c=drawInvoiceCanvas(v);
  c.toBlob(function(b){
    if(!b){alert('ساخت تصویر انجام نشد.');return}
    if(imgUrl)URL.revokeObjectURL(imgUrl);
    imgBlob=b;imgName='AutoMohseni_Invoice_'+v.code+'.jpg';imgUrl=URL.createObjectURL(b);imgBack=v.id;
    openModal('تصویر فاکتور '+v.code,'<div class="notice okNotice">تصویر آماده است. با «ارسال / ذخیره» می‌توانید آن را در واتساپ، تلگرام یا Photos بفرستید/ذخیره کنید.</div><img class="imgPreview" src="'+imgUrl+'" alt=""/><div class="formActions"><button class="btn btnGold" onclick="shareInvoiceImg()">ارسال / ذخیره</button><button class="btn btnLight" onclick="vehicleModal(imgBack)">برگشت به پرونده</button><button class="btn btnLight" onclick="closeModal()">بستن</button></div>');
  },'image/jpeg',.92);
}
function shareInvoiceImg(){if(imgBlob)shareFile(imgBlob,imgName,'فاکتور')}

/* ---------- خطاها ---------- */
var lastErr=0;
window.onerror=function(msg,url,line){try{if(Date.now()-lastErr>2000){lastErr=Date.now();showToast('یک خطای داخلی رخ داد؛ اطلاعات ذخیره‌شده سالم است.',true);if(window.console)console.error(msg,url,line)}}catch(e){}return true};

/* ---------- راه‌اندازی ---------- */
function installHint(){
  var ua=navigator.userAgent||'',ios=/iphone|ipad|ipod/i.test(ua)||(navigator.platform=='MacIntel'&&navigator.maxTouchPoints>1),standalone=window.navigator.standalone===true||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches),dismissed=false;
  try{dismissed=localStorage.getItem('am_hint')=='1'}catch(e){}
  if(ios&&!standalone&&!dismissed)E('installHint').innerHTML='<div class="notice infoNotice"><b>نصب روی آیفون:</b> دکمهٔ اشتراک‌گذاری (مربع با فلش) ← <b>Add to Home Screen</b>. با این کار برنامه مثل یک اپ کامل باز می‌شود و Safari اطلاعات را پاک نمی‌کند.<div class="noticeAct"><button class="btn btnSmall btnLight" onclick="hideHint()">متوجه شدم</button></div></div>';
}
function hideHint(){E('installHint').innerHTML='';try{localStorage.setItem('am_hint','1')}catch(e){}}
function registerSW(){
  if(!('serviceWorker' in navigator)||location.protocol=='file:')return;
  navigator.serviceWorker.register('sw.js').then(function(reg){
    reg.addEventListener('updatefound',function(){var w=reg.installing;if(w)w.addEventListener('statechange',function(){if(w.state=='installed'&&navigator.serviceWorker.controller)showToast('نسخهٔ جدید برنامه آماده است؛ یک‌بار برنامه را ببندید و باز کنید.')})});
  }).catch(function(){});
}
function boot(){
  var inp=document.createElement('input');inp.type='file';inp.id='importFile';inp.hidden=true;inp.onchange=function(){importBackupFile(inp)};document.body.appendChild(inp);
  logoImg=new Image();logoImg.src=LOGO;
  buildNav();
  idbOpen().catch(function(){useLS=true});
  idbOpen().then(null,function(){useLS=true}).then(function(){return Promise.all([kvGet('db'),kvGet('lastBackup'),kvGet('bak')])}).then(function(r){
    var loaded=false,x;
    if(r[0]){try{x=JSON.parse(r[0]);if(validateDB(x)){db=x;lastSavedStr=r[0];loaded=true}}catch(e){}}
    if(!loaded&&r[2]){try{x=JSON.parse(r[2]);if(validateDB(x)){db=x;lastSavedStr=r[2];loaded=true;setTimeout(function(){showToast('فایل اصلی خراب بود؛ نسخهٔ قبلی بازیابی شد.',true)},800)}}catch(e){}}
    if(!loaded){if(r[0]||r[2]){noSave=true;alert('اطلاعات ذخیره‌شده خوانده نشد. برای جلوگیری از پاک‌شدن، ذخیره موقتاً غیرفعال شد. برنامه را ببندید و دوباره باز کنید؛ اگر ادامه داشت، از بخش «بکاپ» فایل بکاپ را وارد کنید.')}db=emptyDB()}
    ensureArrays();lastBackupTs=Number(r[1])||0;
    var pg='dashboard';try{pg=sessionStorage.getItem('am_page')||'dashboard'}catch(e){}
    renderAll();goPage(pg);lockApp();setSaveState('saved');installHint();registerSW();
    if(navigator.storage&&navigator.storage.persist){try{navigator.storage.persist()}catch(e){}}
  }).catch(function(e){noSave=true;db=emptyDB();ensureArrays();renderAll();lockApp();alert('خطا در دسترسی به حافظهٔ گوشی: '+(e&&e.message?e.message:e)+'\nاگر در حالت Private مرورگر هستید، از حالت عادی Safari استفاده کنید.')});
}
boot();
