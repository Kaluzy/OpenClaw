const $=s=>document.querySelector(s);
const el=(tag,attrs={},children=[])=>{const n=document.createElement(tag); for(const [k,v] of Object.entries(attrs)){ if(k==='class') n.className=v; else if(k==='text') n.textContent=v; else n.setAttribute(k,v);} children.forEach(c=>n.appendChild(c)); return n;};

let DATA=null;
let SHORT=new Map();

function norm(s){return (s||'').toString().toLowerCase();}

function optionize(sel, values){
  const cur = sel.value;
  for(const v of values){ sel.appendChild(el('option',{value:v,text:v})); }
  sel.value = cur;
}

function match(item,q,industry,framework){
  if(industry && item.industry!==industry) return false;
  if(framework && item.framework!==framework) return false;
  if(!q) return true;
  const n = q.split(/\s+/).filter(Boolean);
  const hay = norm(item.title+' '+item.description+' '+item.industry+' '+item.framework);
  return n.every(t=>hay.includes(t));
}

function render(){
  const q = norm($('#q').value.trim());
  const industry = $('#industry').value;
  const framework = $('#framework').value;

  const items = DATA.items.filter(it=>match(it,q,industry,framework));
  $('#counts').textContent = items.length.toLocaleString()+' results • '+SHORT.size+' shortlisted • source: '+DATA.source.owner+'/'+DATA.source.repo;

  const res = $('#results');
  res.innerHTML='';
  for(const it of items.slice(0,200)){
    res.appendChild(renderItem(it,false));
  }
  if(items.length>200){
    res.appendChild(el('div',{class:'hint',text:'Showing first 200 results. Refine your search/filters.'}));
  }

  const sl = $('#shortlist');
  sl.innerHTML='';
  for(const it of SHORT.values()) sl.appendChild(renderItem(it,true));

  $('#copy').disabled = SHORT.size===0;
}

function renderItem(it,inShort){
  const badges = el('div',{class:'badges'},[
    it.industry?el('span',{class:'badge',text:it.industry}):null,
    it.framework?el('span',{class:'badge',text:it.framework}):null,
  ].filter(Boolean));

  const btn = el('button',{class: inShort?'secondary':'', text: inShort?'Remove':'Shortlist'});
  btn.addEventListener('click',()=>{
    if(inShort) SHORT.delete(it.url||it.title);
    else SHORT.set(it.url||it.title,it);
    render();
  });

  return el('div',{class:'item'},[
    el('h3',{text:it.title||'(untitled)'}),
    badges,
    it.description?el('div',{class:'desc',text:it.description}):el('div',{class:'desc',text:'(no description)'}),
    el('div',{class:'row'},[
      it.url?el('a',{href:it.url,target:'_blank',rel:'noreferrer',text:'Source link'}):el('span',{class:'hint',text:'No URL'}),
      el('span',{class:'hint',text:'•'}),
      btn
    ])
  ]);
}

async function init(){
  const r = await fetch('./data.json',{cache:'no-store'});
  DATA = await r.json();
  optionize($('#industry'), DATA.industries);
  optionize($('#framework'), DATA.frameworks);

  $('#q').addEventListener('input',render);
  $('#industry').addEventListener('change',render);
  $('#framework').addEventListener('change',render);
  $('#clear').addEventListener('click',()=>{ $('#q').value=''; $('#industry').value=''; $('#framework').value=''; render(); });
  $('#copy').addEventListener('click', async ()=>{
    const lines = Array.from(SHORT.values()).map(it=>{
      let s='- '+it.title;
      if(it.industry) s+=' ('+it.industry+')';
      if(it.framework) s+=' ['+it.framework+']';
      if(it.url) s+=' — '+it.url;
      return s;
    });
    await navigator.clipboard.writeText(lines.join('\n'));
    $('#copy').textContent='Copied';
    setTimeout(()=> $('#copy').textContent='Copy shortlist', 900);
  });

  render();
}

init().catch(err=>{ $('#counts').textContent = 'Failed to load data.json'; console.error(err); });
