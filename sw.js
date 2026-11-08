/* Service Worker — برنامه را کاملاً آفلاین اجرا می‌کند.
   هر وقت فایل‌های برنامه را عوض کردید، عدد VERSION را یکی بالا ببرید. */
var VERSION='am-web-v12-1';
var FILES=['./','index.html','style.css','core.js','platform.js','logo.jpg','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){return Promise.all(FILES.map(function(f){return c.add(new Request(f,{cache:'reload'}))}))}).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==VERSION}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}));
});
self.addEventListener('fetch',function(e){
  var r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(function(hit){
    var net=fetch(r).then(function(res){if(res&&res.ok){var cp=res.clone();caches.open(VERSION).then(function(c){c.put(r,cp)})}return res}).catch(function(){return hit||(r.mode==='navigate'?caches.match('index.html'):undefined)});
    return hit||net;
  }));
});
