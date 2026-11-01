chrome.runtime.onMessage.addListener((request,_sender,respond)=>{
  if(request?.type!=='nexus.webchat')return;
  globalThis.nexusWebchatAdapter(request.data).then(value=>respond({ok:true,value}),e=>respond({ok:false,error:e.message}));return true;
});
