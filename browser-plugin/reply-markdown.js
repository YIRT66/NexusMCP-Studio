(function(root){
  function markdown(node){
    let budget=200000,visited=0;
    function walk(element,depth=0){
      if(!element||budget<=0||++visited>20000||depth>40)return '';
      if(element.nodeType===3){const text=(element.textContent||'').slice(0,budget);budget-=text.length;return text;}
      const tag=element.tagName?.toLowerCase();
      if(['script','style','button','svg','noscript'].includes(tag))return '';
      if(tag==='pre') {const code=element.querySelector('code')||element;const text=(code.textContent||'').slice(0,budget);budget-=text.length;const language=/language-([\w-]+)/.exec(code.className||'')?.[1]||'';const fence='`'.repeat(Math.max(3,...Array.from(text.matchAll(/`+/g),m=>m[0].length+1)));return '\n\n'+fence+language+'\n'+text+'\n'+fence+'\n\n';}
      const text=Array.from(element.childNodes||[],child=>walk(child,depth+1)).join('');
      if(tag==='br')return '\n';
      if(tag==='strong'||tag==='b')return '**'+text+'**';
      if(tag==='em'||tag==='i')return '*'+text+'*';
      if(tag==='a'){const href=element.getAttribute('href')||'';if(/^(?:https?:|mailto:)/i.test(href))return '['+text+']('+href.replace(/\)/g,'%29')+')';}
      if(tag==='code')return '`'+text+'`';
      if(/^h[1-6]$/.test(tag))return '\n\n'+'#'.repeat(Number(tag[1]))+' '+text+'\n\n';
      if(tag==='li')return '\n- '+text.trim();
      if(['p','div','section','ul','ol','blockquote'].includes(tag))return '\n'+text+'\n';
      if(tag==='tr'){const cells=Array.from(element.children||[],cell=>(cell.textContent||'').replace(/\|/g,'\\|').replace(/\n/g,' ').trim());const row='| '+cells.join(' | ')+' |\n';return row+(element.querySelector('th')?'| '+cells.map(()=> '---').join(' | ')+' |\n':'');}
      if(tag==='table')return '\n\n'+text+'\n\n';
      return text;
    }
    return walk(node).replace(/\n{3,}/g,'\n\n').trim().slice(0,200000);
  }
  root.NexusReplyMarkdown=markdown;
})(globalThis);
