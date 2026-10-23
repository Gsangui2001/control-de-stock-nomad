self.addEventListener('push',event=>{
 let data={};try{data=event.data.json();}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'A bordo',{body:data.body||'Tenés una novedad.',tag:data.tag||'boat-update',icon:'/icons/icon-192.png',data:{url:data.url||'/a-bordo/index.html'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const path=event.notification.data?.url||'/a-bordo/index.html';
 const url=new URL(path,self.location.origin);
 if(url.origin!==self.location.origin)return;
 event.waitUntil(clients.openWindow(url.href));
});
