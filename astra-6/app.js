'use strict';
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionQuery.matches;
if (!reduced) document.documentElement.classList.add('js-motion');
const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) { entry.target.classList.add('visible'); revealObserver.unobserve(entry.target); }
}), { threshold: .12 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
let scrollPending = false;
addEventListener('scroll', () => {
  if (scrollPending) return;
  scrollPending = true;
  requestAnimationFrame(() => {
    const distance = document.documentElement.scrollHeight - innerHeight;
    document.querySelector('.progress').style.width = `${distance > 0 ? scrollY / distance * 100 : 0}%`;
    scrollPending = false;
  });
}, { passive: true });
const scene = document.querySelector('#hero-scene');
document.querySelector('.hero').addEventListener('pointermove', e => {
  if (reduced || e.pointerType !== 'mouse') return;
  scene.style.setProperty('--px', `${(e.clientX / innerWidth - .5) * 20}px`);
  scene.style.setProperty('--py', `${(e.clientY / innerHeight - .5) * 14}px`);
});
const companies = {
  spacex: { sector:'ENGENHARIA AEROESPACIAL', title:'O próximo capítulo\nnão cabe na Terra.', description:'Foguetes reutilizáveis, exploração espacial e a ambição de tornar a vida multiplanetária. A SpaceX transforma o caminho até a órbita em um problema de engenharia.', year:'2002', horizon:'Além da Terra', name:'SpaceX', url:'https://www.spacex.com/', caption:'RECUPERAR. REUTILIZAR. REPETIR.', image:'booster-landing.jpg', alt:'Primeiro estágio de um foguete em descida propulsada' },
  tesla: { sector:'ENERGIA E MOBILIDADE', title:'Uma outra forma\nde mover o mundo.', description:'Carros elétricos, baterias e armazenamento de energia. A Tesla conecta mobilidade e eletrificação em uma mesma proposta de transformação industrial.', year:'2003', horizon:'Energia elétrica', name:'Tesla', url:'https://www.tesla.com/', caption:'ENERGIA QUE ENCONTRA MOVIMENTO.', symbol:'ϟ' },
  neuralink: { sector:'INTERFACES CÉREBRO–COMPUTADOR', title:'Uma conexão\nalém do toque.', description:'A Neuralink pesquisa interfaces implantáveis entre cérebro e computador. O desafio é transformar sinais neurais em novas possibilidades de interação digital.', year:'2016', horizon:'Conexão neural', name:'Neuralink', url:'https://neuralink.com/', caption:'ENTRE O PENSAMENTO E A INTERFACE.', symbol:'∿' },
  xai: { sector:'INTELIGÊNCIA ARTIFICIAL', title:'Mais perguntas.\nNovas inteligências.', description:'Modelos de inteligência artificial e interfaces de conversação. A xAI é uma das iniciativas de Musk na disputa por novas formas de trabalhar com informação.', year:'2023', horizon:'Inteligência', name:'xAI', url:'https://x.ai/', caption:'EXPLORAR. APRENDER. QUESTIONAR.', symbol:'✳' },
  boring: { sector:'INFRAESTRUTURA E TÚNEIS', title:'Para seguir em frente,\nolhe para baixo.', description:'A The Boring Company explora a construção de túneis e sistemas de transporte subterrâneo. Uma aposta em encontrar espaço para mobilidade sob as cidades.', year:'2016', horizon:'Sob a superfície', name:'The Boring Company', url:'https://www.boringcompany.com/', caption:'UMA NOVA DIMENSÃO PARA AS CIDADES.', symbol:'↓' },
  starlink: { sector:'CONECTIVIDADE POR SATÉLITE', title:'A distância não precisa\nser uma barreira.', description:'Uma rede de satélites em órbita terrestre baixa para acesso à internet. A Starlink faz parte da SpaceX e leva a proposta de conectividade para além da infraestrutura em terra.', year:'SpaceX', label:'UMA REDE DA', horizon:'Conexão global', name:'Starlink', url:'https://www.starlink.com/', caption:'UM PLANETA. NOVAS CONEXÕES.', image:'earth-limb.jpg', alt:'Curvatura da Terra e a fina camada da atmosfera vistas do espaço' }
};
const tabs = [...document.querySelectorAll('[data-company]')];
function selectCompany(tab) {
  const key = tab.dataset.company, data = companies[key];
  tabs.forEach(button => { const selected = button === tab; button.setAttribute('aria-selected', selected); button.tabIndex = selected ? 0 : -1; });
  document.querySelector('#company-panel').setAttribute('aria-labelledby', tab.id);
  document.querySelector('.company-art').dataset.art = key;
  document.querySelector('#company-sector').textContent = data.sector;
  const title = document.querySelector('#company-title');
  title.replaceChildren(...data.title.split('\n').flatMap((line, index) => index ? [document.createElement('br'), document.createTextNode(line)] : [document.createTextNode(line)]));
  document.querySelector('#company-description').textContent = data.description;
  document.querySelector('#fact-label').textContent = data.label || 'FUNDAÇÃO';
  document.querySelector('#fact-value').textContent = data.year;
  document.querySelector('#company-horizon').textContent = data.horizon;
  const link = document.querySelector('#company-link');
  link.href = data.url;
  link.replaceChildren(document.createTextNode(`Conheça a ${data.name} `), Object.assign(document.createElement('span'), { textContent:'↗' }));
  document.querySelector('#art-caption').textContent = data.caption;
  document.querySelector('#art-number').textContent = String(tabs.indexOf(tab) + 1).padStart(2, '0');
  const photo = document.querySelector('#company-image');
  photo.hidden = !data.image;
  if (data.image) { photo.src = `../musk/img/${data.image}`; photo.alt = data.alt; }
  document.querySelector('.tech-symbol').textContent = data.symbol || 'ϟ';
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectCompany(tab));
  tab.addEventListener('keydown', e => {
    let next;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { e.preventDefault(); tabs[next].focus(); selectCompany(tabs[next]); }
  });
});
const dialog = document.querySelector('#credits');
document.querySelector('#open-credits').addEventListener('click', () => dialog.showModal());
document.querySelector('#close-credits').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });

// A ray-traced sphere: the surface, terrain, lighting and atmosphere are computed
// in the fragment shader. No models, textures, CDN or 3D engine are required.
const vertexSource = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
const fragmentSource = `
precision highp float;
uniform vec2 resolution;
uniform float rotation;
uniform float world;
uniform float grid;
uniform float hero;
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.;float a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.07+vec3(3.1,1.7,2.4);a*=.5;}return v;}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*resolution)/min(resolution.x,resolution.y);
 float radius=mix(.345,.35,hero);float d=length(uv);vec3 color=vec3(.031,.039,.035);
 float star=hash(vec3(floor(gl_FragCoord.xy/2.),8.));
 color+=vec3(.38,.44,.31)*step(.9984,star)*(.3+.7*hash(vec3(floor(gl_FragCoord.xy/2.),2.)));
 vec3 glow=world<.5?vec3(.65,.33,.13):world<1.5?vec3(.13,.4,.75):vec3(.26,.8,.48);
 if(hero>.5)glow=vec3(.45,.59,.2);
 color+=glow*exp(-max(d-radius,0.)*60.)*.17;
 if(d<radius){
  vec2 p=uv/radius;float z=sqrt(max(0.,1.-dot(p,p)));vec3 n=vec3(p,z);
  float angle=rotation;vec3 q=vec3(n.x*cos(angle)+n.z*sin(angle),n.y,-n.x*sin(angle)+n.z*cos(angle));
  float land=fbm(q*4.6);float fine=fbm(q*45.);float detail=noise(q*160.);
  vec3 albedo;
  if(world<.5){albedo=mix(vec3(.18,.065,.025),vec3(.73,.39,.18),smoothstep(.25,.72,land));albedo*=.7+fine*.55+detail*.12;}
  else if(world<1.5){float continent=smoothstep(.49,.535,land);albedo=mix(vec3(.018,.085,.19),mix(vec3(.055,.13,.055),vec3(.3,.31,.14),fine),continent);float clouds=smoothstep(.59,.73,fbm(q*8.+vec3(rotation*.15,0,0)));albedo=mix(albedo,vec3(.7,.78,.77),clouds*.8);albedo=mix(albedo,vec3(.8,.85,.86),smoothstep(.87,.97,abs(q.y)+land*.12));}
  else{albedo=mix(vec3(.04,.12,.16),vec3(.3,.68,.42),land);albedo+=vec3(.24,.1,.28)*pow(.5+.5*sin(q.y*32.+land*12.),5.)*.7;}
  if(hero>.5)albedo=mix(vec3(.08,.1,.06),vec3(.57,.55,.36),land)*(.65+fine*.65+detail*.12);
  vec3 light=normalize(vec3(-.85,.6,.8));float diffuse=max(dot(n,light),0.);
  float terrainShade=.83+noise(q*90.)*.25;
  color=albedo*(.035+1.4*pow(diffuse,1.3))*terrainShade;
  float rim=pow(1.-z,3.);color+=glow*rim*pow(diffuse,.7)*.8;
  if(grid>.5){float lon=atan(q.z,q.x);float lat=asin(q.y);float a=abs(sin(lon*12.));float b=abs(sin(lat*12.));float lines=1.-smoothstep(.015,.045,min(a,b));color=mix(color,vec3(.65,.95,.37),lines*.65);}
  color*=1.-smoothstep(radius-.003,radius,d);
 }
 gl_FragColor=vec4(color,1.);
}`;
function createPlanet(canvas, isHero) {
  const gl = canvas.getContext('webgl', { alpha:false, antialias:false, powerPreference:'low-power' });
  if (!gl) return null;
  function shader(type, source) {
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  try {
    const vs=shader(gl.VERTEX_SHADER,vertexSource), fs=shader(gl.FRAGMENT_SHADER,fragmentSource);
    const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const uniforms=Object.fromEntries(['resolution','rotation','world','grid','hero'].map(name=>[name,gl.getUniformLocation(program,name)]));
    const state={ angle:isHero ? .8 : 0, world:0, grid:0, speed:1, paused:reduced, visible:false, lost:false };
    let dirty=true;
    function resize(){const rect=canvas.getBoundingClientRect();const ratio=Math.min(devicePixelRatio||1,1.5);const w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;dirty=true;}}
    new ResizeObserver(resize).observe(canvas);
    const observer=new IntersectionObserver(entries=>{state.visible=entries[0].isIntersecting;dirty=true;});observer.observe(canvas);
    canvas.addEventListener('webglcontextlost', e=>{e.preventDefault();state.lost=true;if(isHero)scene.classList.remove('webgl-ready');else document.querySelector('.lab-fallback').hidden=false;});
    canvas.addEventListener('webglcontextrestored', ()=>location.reload());
    let previous=0;
    function tick(now){
      const dt=Math.min((now-previous)/1000,.05);previous=now;
      if(state.visible&&!document.hidden&&!state.lost){
        const moving=!state.paused&&state.speed>0;
        if(moving)state.angle+=dt*.09*state.speed;
        if(moving||dirty){resize();gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);gl.uniform1f(uniforms.rotation,state.angle);gl.uniform1f(uniforms.world,state.world);gl.uniform1f(uniforms.grid,state.grid);gl.uniform1f(uniforms.hero,isHero?1:0);gl.drawArrays(gl.TRIANGLES,0,6);dirty=false;}
      }
      requestAnimationFrame(tick);
    }
    resize();requestAnimationFrame(tick);
    if(isHero)scene.classList.add('webgl-ready');
    return {state,update(){dirty=true;}};
  } catch(error){console.warn('Visualização 3D indisponível:',error.message);return null;}
}
const heroPlanet=createPlanet(document.querySelector('#planet'),true);
const labCanvas=document.querySelector('#lab-planet');
const labPlanet=createPlanet(labCanvas,false);
const pauseButton=document.querySelector('#pause');
function updatePause(){const paused=labPlanet?labPlanet.state.paused:reduced;pauseButton.setAttribute('aria-pressed',paused);pauseButton.replaceChildren(document.createTextNode(paused?'Retomar movimento ':'Pausar movimento '),Object.assign(document.createElement('span'),{textContent:paused?'▷':'Ⅱ'}));}
if(labPlanet){
 const {state}=labPlanet;
 let dragging=false,lastX=0;
 labCanvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;lastX=e.clientX;labCanvas.setPointerCapture(e.pointerId);});
 labCanvas.addEventListener('pointermove',e=>{if(dragging){state.angle+=(e.clientX-lastX)*.008;lastX=e.clientX;labPlanet.update();}});
 ['pointerup','pointercancel','lostpointercapture'].forEach(event=>labCanvas.addEventListener(event,()=>{dragging=false;}));
 labCanvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();state.angle+=e.key==='ArrowRight'?.15:-.15;labPlanet.update();}});
 document.querySelectorAll('[data-world]').forEach(button=>button.addEventListener('click',()=>{state.world=Number(button.dataset.world);document.querySelectorAll('[data-world]').forEach(b=>b.setAttribute('aria-pressed',b===button));document.querySelector('#view-name').textContent=button.textContent.toUpperCase();labPlanet.update();}));
 document.querySelector('#rotation').addEventListener('input',e=>{state.speed=Number(e.target.value);document.querySelector('#speed-value').value=`${state.speed.toFixed(1)}×`;labPlanet.update();});
 document.querySelector('#wireframe').addEventListener('click',e=>{state.grid=state.grid?0:1;e.currentTarget.setAttribute('aria-pressed',!!state.grid);e.currentTarget.querySelector('span').textContent=state.grid?'−':'+';labPlanet.update();});
 pauseButton.addEventListener('click',()=>{state.paused=!state.paused;updatePause();});
 document.querySelector('#reset').addEventListener('click',()=>{Object.assign(state,{angle:0,world:0,grid:0,speed:1,paused:reduced});document.querySelector('[data-world="0"]').click();document.querySelector('#rotation').value='1';document.querySelector('#speed-value').value='1.0×';document.querySelector('#wireframe').setAttribute('aria-pressed','false');document.querySelector('#wireframe span').textContent='+';updatePause();labPlanet.update();});
} else {
 document.querySelector('.lab-fallback').hidden=false;
 document.querySelector('.drag-hint').hidden=true;
 labCanvas.hidden=true;
 document.querySelectorAll('.lab-controls button,.lab-controls input').forEach(control=>{control.disabled=true;});
}
updatePause();
motionQuery.addEventListener('change',e=>{reduced=e.matches;document.documentElement.classList.toggle('js-motion',!reduced);if(heroPlanet){heroPlanet.state.paused=reduced;heroPlanet.update();}if(labPlanet){labPlanet.state.paused=reduced;labPlanet.update();updatePause();}});
