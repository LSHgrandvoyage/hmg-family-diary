/* Read-only visual lines from the actual recognition text; no generated words. */
(() => {
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ko',{granularity:'grapheme'}):null;
  function lines(text,width,font) {
    ctx.font=font;
    const result=[];
    for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')) {
      let line='';
      const chars=segmenter?[...segmenter.segment(paragraph)].map(x=>x.segment):Array.from(paragraph);
      for(const char of chars) {
        if(line && ctx.measureText(line+char).width>width){result.push(line);line='';}
        line+=char;
      }
      if(line)result.push(line);
    }
    return result;
  }
  function render(node,text) {
    const css=getComputedStyle(node),width=node.clientWidth;
    const font=`${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
    const key=JSON.stringify([text,width,font,document.fonts.status]);
    if(node.dataset.captionKey===key)return;
    node.dataset.captionKey=key;
    const all=lines(text.trim(),Math.max(1,width-2),font),last=all.slice(-2);
    node.replaceChildren();
    last.forEach((line,index)=>{const p=document.createElement('span');p.dataset.captionLine=index===last.length-1?'current':'previous';p.textContent=line;node.append(p)});
    if(!last.length){const p=document.createElement('span');p.dataset.captionEmpty='true';p.textContent='이야기를 시작하면 인식된 문장이 여기에 보여요';node.append(p);}
  }
  window.DiaryLiveCaption={render};
})();
