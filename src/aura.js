/* ═══════════════════════════════════════════════════════════════════════════
   WINTER ARC · aura.js
   Today's character with a living aura around them: flames pouring upward off the body, a white-hot core, a burst of
   light behind, speed lines and dark shards flying outward, lightning crackling at the edges and sparks rising. It is
   drawn on the graphics chip (WebGL 1, no library) in the character's own colour, and the look follows Pavi's Goku
   aura picture.
   One drawing surface is kept and moved between the Home card, the Body tab and the Aura tab. It only runs while it is
   on screen, the app is open and no sheet covers it, and holds a single still frame when reduced motion is on.
   v18: drawn as fast as the screen refreshes (up to 120 times a second on a ProMotion screen), at up to twice the
   screen's resolution, with the character's high-resolution picture; the outline it is built from is kept per
   character, so moving between tabs costs nothing.
   No WebGL, or it stops: the picture is shown with a glowing aura made in CSS instead.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';
var A = { calm: false, failed: false, error: null, onFail: null, paused: false };
var X = null;
var STILL_T = 3.7; // the moment shown when reduced motion is on: a strong frame with lightning at the edges

var VS = 'attribute vec2 aP;varying vec2 vUv;void main(){vUv=aP*0.5+0.5;gl_Position=vec4(aP,0.0,1.0);}';
var FS = [
  '#ifdef GL_FRAGMENT_PRECISION_HIGH',
  'precision highp float;',
  '#else',
  'precision mediump float;',
  '#endif',
  'uniform sampler2D uChar;uniform sampler2D uMask;',
  'uniform vec2 uRes;uniform vec4 uRect;uniform vec2 uCore;',
  'uniform float uT;uniform float uBoost;uniform float uMini;uniform float uDark;uniform vec2 uBolt;',
  'uniform vec3 uBase;uniform vec3 uLight;uniform vec3 uDeep;uniform vec3 uHiA;uniform vec3 uHiB;',
  'varying vec2 vUv;',
  'float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}',
  'float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);',
  '  return mix(mix(hash12(i),hash12(i+vec2(1.0,0.0)),u.x),mix(hash12(i+vec2(0.0,1.0)),hash12(i+vec2(1.0,1.0)),u.x),u.y);}',
  'float fbm(vec2 p){float s=0.0;float a=0.5;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+vec2(1.7,9.2);a*=0.5;}return s/0.9375;}',
  'float fbm3(vec2 p){float s=0.0;float a=0.5;for(int i=0;i<3;i++){s+=a*vnoise(p);p=p*2.03+vec2(1.7,9.2);a*=0.5;}return s/0.875;}',
  'void main(){',
  '  float asp=uRes.x/uRes.y;vec2 uv=vUv;vec2 p=vec2(uv.x*asp,uv.y);float t=uT;float boost=uBoost;',
  '  float pulse=0.93+0.07*sin(t*7.0)+0.04*sin(t*17.0)+0.025*sin(t*31.0)+boost*0.3;',
  /* the flame: the body's outline, lifted upward in sharp tongues by turbulence that streams up fast */
  '  float n1=fbm3(vec2(p.x*3.0,p.y*1.4-t*1.3));',
  '  float rg=1.0-abs(2.0*fbm3(vec2(p.x*7.5+3.1,p.y*1.25-t*1.5))-1.0);rg=rg*rg;',
  '  float rg2=1.0-abs(2.0*vnoise(vec2(p.x*16.0,p.y*2.2-t*3.6))-1.0);rg2=rg2*rg2*rg2;',
  '  float rg3=1.0-abs(2.0*vnoise(vec2(p.x*28.0+7.0,p.y*3.2-t*5.2))-1.0);rg3=rg3*rg3*rg3*rg3;',
  '  float lift=0.015+(0.17*rg*rg+0.06*rg2+0.035*rg3)*(0.65+0.35*n1)*(1.0+boost*0.6);',
  '  vec2 off=vec2((n1-0.5)*0.07,-lift);',
  '  vec4 m=texture2D(uMask,uv+off);vec4 m0=texture2D(uMask,uv);',
  '  float I=(m.g*0.75+m.b*0.55+m.r*0.2)*pulse*(0.85+0.3*n1);',
  '  float edgeF=smoothstep(0.0,0.10,1.0-uv.y)*smoothstep(0.0,0.06,uv.x)*smoothstep(0.0,0.06,1.0-uv.x)*smoothstep(0.0,0.03,uv.y);',
  /* bright aura: deep at the tips, the colour itself, then light, then white-hot next to the body */
  '  vec3 cb=mix(uDeep,uBase,smoothstep(0.30,0.42,I));cb=mix(cb,uLight,smoothstep(0.50,0.85,I));cb=mix(cb,vec3(1.0),smoothstep(0.85,1.25,I)*0.92);',
  '  float shim=vnoise(vec2(p.x*5.0+11.0,p.y*3.0-t*2.0));',
  '  cb=mix(cb,uHiA,smoothstep(0.30,0.55,I)*(1.0-smoothstep(0.75,1.05,I))*smoothstep(0.35,0.75,shim)*0.6);',
  '  cb=mix(cb,uHiB,rg2*0.5*smoothstep(0.38,0.8,I))*(0.9+0.2*rg);',
  /* a crisp lighter rim along the flame's outer edge, the inked edge of a DBZ aura */
  '  float band=smoothstep(0.27,0.30,I)*(1.0-smoothstep(0.31,0.37,I));cb=mix(cb,uHiA,band*0.4);',
  /* and a touch more colour in the body of the flame */
  '  float lu=dot(cb,vec3(0.299,0.587,0.114));cb=clamp(mix(vec3(lu),cb,1.0+0.35*(1.0-smoothstep(0.8,1.1,I))),0.0,1.0);',
  '  float fa=smoothstep(0.27,0.33,I)*0.96;',
  /* dark aura: the flame keeps its own dark colour, darkest next to the body, with a bright edge of the same hue */
  '  float edge=smoothstep(0.26,0.31,I)*(1.0-smoothstep(0.33,0.42,I));',
  '  vec3 cd=mix(uBase*(1.0-0.35*smoothstep(0.6,1.2,I)),mix(uLight,uHiA,shim*0.6),edge)+mix(uLight,uHiB,0.5)*rg2*smoothstep(0.45,0.9,I)*0.2;',
  '  float fad=smoothstep(0.26,0.31,I);',
  '  vec3 fc=mix(cb,cd,uDark);float fA=mix(fa,fad,uDark)*edgeF;',
  /* the burst of light behind, and the streaks flying outward from the chest */
  '  vec2 c=vec2(uCore.x*asp,uCore.y);vec2 d=p-c;float r=length(d)+0.0001;float ang=atan(d.y,d.x);vec2 dir=d/r;',
  '  float rn=vnoise(dir*3.0+vec2(t*0.9,-t*0.7));',
  '  float burst=pow(0.5+0.5*sin(ang*11.0+rn*7.0+t*0.5),6.0)+0.6*pow(0.5+0.5*sin(ang*23.0-rn*5.0-t*0.8),10.0);',
  '  burst*=smoothstep(0.80,0.05,r)*(0.30+0.25*boost)*mix(1.0,0.55,uDark)*edgeF;',
  '  float halo=smoothstep(0.02,0.65,m0.b)*mix(0.42,0.30,uDark)*edgeF;',
  '  float sN=ang/6.28318*64.0;float h=hash12(vec2(floor(sN),7.0));',
  '  float line=smoothstep(0.11,0.0,abs(fract(sN)-0.5-(h-0.5)*0.6));',
  '  float ph=fract(r*1.4-t*(1.4+h*2.0)+h*9.0);',
  '  float streak=line*smoothstep(0.0,0.04,ph)*smoothstep(0.30,0.06,ph)*step(0.60+0.15*uMini,h)*smoothstep(0.10,0.24,r)*smoothstep(0.98,0.55,r)*edgeF;',
  '  float kN=ang/6.28318*40.0;float h2=hash12(vec2(floor(kN),19.0));',
  '  float kl=smoothstep(0.16,0.0,abs(fract(kN)-0.5-(h2-0.5)*0.5));float kp=fract(r*1.1-t*(1.1+h2*1.3)+h2*5.0);',
  '  float shard=kl*smoothstep(0.0,0.03,kp)*smoothstep(0.42,0.10,kp)*step(0.78,h2)*(1.0-uDark);',
  '  fc*=1.0-shard*0.8*fa;',
  /* sparks rising through the aura */
  '  vec2 gq=vec2(p.x*10.0,p.y*5.0-t*2.4);vec2 id=floor(gq);vec2 fq=fract(gq)-0.5;float hs=hash12(id+11.0);',
  '  vec2 o=vec2(hs-0.5,fract(hs*7.13)-0.5)*0.6;',
  '  float sp=smoothstep(0.11,0.0,length((fq-o)*vec2(1.0,0.38)))*step(0.70+0.1*uMini,hs)*smoothstep(0.06,0.32,m0.b)*edgeF;',
  /* lightning that jumps around the outline several times a second */
  /* (whether there is a bolt this instant is decided once per frame, so frames without one cost nothing) */
  '  float bolt=0.0;if(uBolt.x>0.5){float tq=uBolt.y;float zone=smoothstep(0.12,0.40,m0.g)*(1.0-smoothstep(0.80,0.98,m0.r))*edgeF*step(0.45,vnoise(p*2.2+vec2(tq*3.1,tq*1.7)));',
  '    if(zone>0.0){float ln=fbm(p*vec2(5.0,7.0)+vec2(tq*1.37,tq*0.71));bolt=smoothstep(0.016,0.0,abs(ln-0.5))*zone;}}',
  /* the character, lit at the edges by their own aura */
  '  vec2 cuv=(uv-uRect.xy)/(uRect.zw-uRect.xy);vec4 ch=vec4(0.0);',
  '  if(cuv.x>=0.0&&cuv.x<=1.0&&cuv.y>=0.0&&cuv.y<=1.0)ch=texture2D(uChar,cuv);',
  /* a clean, sharp outline: the soft edge of the cut-out is tightened, then lit from behind by the aura */
  '  float chA=smoothstep(0.1,0.9,ch.a);ch=vec4(ch.rgb/max(ch.a,0.001)*chA,chA);',
  '  float rim=ch.a*(1.0-smoothstep(0.45,0.97,m0.r));',
  /* the character graded to stand out from the flames: deeper shadows and more colour (VF: brighter than V18) */
  '  vec3 cg=ch.rgb/max(ch.a,0.001);cg=clamp((cg-0.5)*1.16+0.5,0.0,1.0)*0.97;float cl=dot(cg,vec3(0.299,0.587,0.114));cg=clamp(mix(vec3(cl),cg,1.2),0.0,1.0)*ch.a;',
  '  vec3 chc=mix(cg,cg*(0.7+0.6*uLight),0.07)+mix(uLight,uHiA,0.35)*rim*(0.38+0.3*boost);',
  '  float sil=(1.0-ch.a)*smoothstep(0.35,0.95,m0.r)*edgeF;',
  /* put it together, back to front (all colours premultiplied) */
  '  vec3 col=uLight*burst+uLight*halo*mix(1.0,0.8,uDark);',
  '  col=fc*fA+col*(1.0-fA);float a=fA;',
  '  col+=mix(vec3(1.0),uLight,0.4)*(streak*0.9+sp*0.95);',
  '  col=chc+col*(1.0-ch.a);a=ch.a+a*(1.0-ch.a);',
  '  col+=fc*fA*(1.0-smoothstep(0.55,1.0,m0.r))*0.12*ch.a;',
  '  col+=mix(uLight,vec3(1.0),mix(0.5,0.2,uDark))*sil*0.5;',
  '  col+=mix(vec3(1.0),uLight,mix(0.35,0.15,uDark))*bolt*1.3;',
  '  a=clamp(max(a,max(col.r,max(col.g,col.b))),0.0,1.0);',
  '  gl_FragColor=vec4(min(col,vec3(a)),a);',
  '}'
].join('\n');

function fail(why) {
  A.failed = true; A.error = String(why || 'stopped');
  if (X) { stop(); if (X.canvas && X.canvas.parentNode) X.canvas.parentNode.removeChild(X.canvas); X.wrap.classList.add('css'); applyCss(); }
  if (A.onFail) try { A.onFail(A.error); } catch (e) {}
}
function compile(gl, type, src) {
  var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
  return s;
}
function init() {
  if (X) return true;
  X = { visible: true, running: false, n: 0, q: 1, frames: 0, boostAt: -1e9, t0: (root.performance || Date).now(), mode: 'full', rect: [0.2, 0.05, 0.8, 0.85], core: [0.5, 0.6], pal: null };
  var wrap = document.createElement('div'); wrap.className = 'aura-wrap'; wrap.setAttribute('aria-hidden', 'true'); X.wrap = wrap;
  var img = document.createElement('img'); img.className = 'aura-img'; img.alt = ''; img.decoding = 'async'; img.draggable = false; wrap.appendChild(img); X.img = img;
  if (!A.failed) {
    try {
      var canvas = document.createElement('canvas'); canvas.className = 'aura-gl'; X.canvas = canvas;
      X.gl = canvas.getContext('webgl', GL_OPTS) || canvas.getContext('experimental-webgl', GL_OPTS);
      if (!X.gl) throw new Error('WebGL not available');
      setupGL();
      wrap.insertBefore(canvas, img);
      /* a phone can take the graphics chip away (low memory, a long time in the background): show the CSS aura until it
         comes back, then carry on drawing as before */
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); X.lost = true; stop(); X.wrap.classList.add('css'); });
      canvas.addEventListener('webglcontextrestored', function () {
        try { setupGL(); X.lost = false; X.wrap.classList.remove('css'); if (X.img.complete && X.img.naturalWidth) { X.cw = 0; resize(); } start(); } catch (e) { fail(e && e.message || e); }
      });
    } catch (e) { X.gl = null; A.failed = true; A.error = String(e && e.message || e); if (X.canvas && X.canvas.parentNode) X.canvas.parentNode.removeChild(X.canvas); }
  }
  if (A.failed) wrap.classList.add('css');
  if (root.IntersectionObserver) { X.io = new IntersectionObserver(function (es) { var e = es[es.length - 1]; X.visible = !!(e && e.isIntersecting); X.visible ? start() : stop(); }, { threshold: 0.01 }); X.io.observe(wrap); }
  if (root.ResizeObserver) { X.ro = new ResizeObserver(function () { resize(); }); X.ro.observe(wrap); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  return true;
}
var GL_OPTS = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' };
function setupGL() {
  var gl = X.gl;
  var prog = gl.createProgram(); gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'aP'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  X.u = {}; ['uChar', 'uMask', 'uRes', 'uRect', 'uCore', 'uT', 'uBoost', 'uMini', 'uDark', 'uBase', 'uLight', 'uDeep', 'uBolt', 'uHiA', 'uHiB'].forEach(function (k) { X.u[k] = gl.getUniformLocation(prog, k); });
  X.texChar = mkTex(gl); X.texMask = mkTex(gl); X.texCache = []; // (a new graphics context: nothing kept from before)
  gl.uniform1i(X.u.uChar, 0); gl.uniform1i(X.u.uMask, 1);
  gl.clearColor(0, 0, 0, 0); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
}
function mkTex(gl) {
  var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  return t;
}

/* where the character stands: centred, feet near the bottom, room above for the flames */
function layout() {
  var W = X.cw || 1, H = X.ch || 1, iw = X.img.naturalWidth || 1, ih = X.img.naturalHeight || 1, mini = X.mode === 'mini';
  var sc = Math.min(H * (mini ? 0.68 : 0.74) / ih, W * (mini ? 0.86 : 0.80) / iw), w = iw * sc, h = ih * sc;
  var x0 = (W - w) / 2, y0 = H * (mini ? 0.15 : 0.05); // on Home the feet stay clear of the weight underneath
  X.rect = [x0 / W, y0 / H, (x0 + w) / W, (y0 + h) / H];
}
/* a small blurred copy of the character's outline at three widths: the shape the flame is built from */
function boxBlur(src, w, h, r) {
  r = Math.max(1, Math.round(r)); var a = src, b = new Float32Array(src.length), pass, x, y, i, acc, n = 2 * r + 1;
  for (pass = 0; pass < 3; pass++) {
    for (y = 0; y < h; y++) { acc = 0; var row = y * w; for (x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
      for (x = 0; x < w; x++) { b[row + x] = acc / n; acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; } }
    var c = new Float32Array(src.length);
    for (x = 0; x < w; x++) { acc = 0; for (y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (y = 0; y < h; y++) { c[y * w + x] = acc / n; acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; } }
    a = c;
  }
  var mx = 0; for (i = 0; i < a.length; i++) if (a[i] > mx) mx = a[i];
  if (mx > 0) for (i = 0; i < a.length; i++) a[i] = Math.min(1, a[i] / mx);
  return a;
}
var MASKS = [];
function sendMask(m) {
  X.core = m.core.slice(); var gl = X.gl; if (!gl || X.lost) return;
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, X.texMask);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, m.w, m.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, m.data);
}
function buildMask() {
  var MH = 220, MW = Math.max(16, Math.min(320, Math.round(MH * (X.cw || 1) / (X.ch || 1)))), key = X.n + ':' + X.src.length + ':' + X.src.slice(-48) + '|' + MW + '|' + X.rect.map(function (v) { return v.toFixed(4); }).join();
  for (var q = 0; q < MASKS.length; q++) if (MASKS[q].key === key) { sendMask(MASKS[q]); return; }
  var n = MW * MH, al = new Float32Array(n), i, r = X.rect;
  try {
    var c = X.mc || (X.mc = document.createElement('canvas')); c.width = MW; c.height = MH;
    var g = c.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, MW, MH);
    g.drawImage(X.img, r[0] * MW, (1 - r[3]) * MH, (r[2] - r[0]) * MW, (r[3] - r[1]) * MH);
    var px = g.getImageData(0, 0, MW, MH).data; for (i = 0; i < n; i++) al[i] = px[i * 4 + 3] / 255;
  } catch (e) { // a picture the browser will not let us read: a soft oval where the character stands
    for (var y = 0; y < MH; y++) for (var x = 0; x < MW; x++) { var u = (x + 0.5) / MW, v = 1 - (y + 0.5) / MH, cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, rx = (r[2] - r[0]) / 2 * 0.8, ry = (r[3] - r[1]) / 2;
      al[y * MW + x] = ((u - cx) * (u - cx)) / (rx * rx) + ((v - cy) * (v - cy)) / (ry * ry) < 1 ? 1 : 0; }
  }
  var sm = boxBlur(al, MW, MH, MH * 0.012), md = boxBlur(al, MW, MH, MH * 0.04), lg = boxBlur(al, MW, MH, MH * 0.10);
  for (i = 0; i < n; i++) { md[i] = Math.pow(md[i], 0.8); lg[i] = Math.pow(lg[i], 0.7); } // thin arms and legs still get a full aura
  var data = new Uint8Array(n * 4), sx = 0, sy = 0, sw = 0;
  for (i = 0; i < n; i++) {
    data[i * 4] = Math.round(sm[i] * 255); data[i * 4 + 1] = Math.round(md[i] * 255); data[i * 4 + 2] = Math.round(lg[i] * 255); data[i * 4 + 3] = Math.round(al[i] * 255);
    if (al[i] > 0.5) { var yy = 1 - (Math.floor(i / MW) + 0.5) / MH; sx += (i % MW + 0.5) / MW; sy += yy; sw++; }
  }
  // the burst of light comes from the chest: the middle of the figure, a little above its centre
  var core = sw ? [sx / sw, Math.min(r[3] - 0.05, sy / sw + (r[3] - r[1]) * 0.12)] : [(r[0] + r[2]) / 2, r[1] + (r[3] - r[1]) * 0.62];
  var m = { key: key, w: MW, h: MH, data: data, core: core }; MASKS.unshift(m); if (MASKS.length > 6) MASKS.length = 6;
  sendMask(m);
}
/* the character goes to the graphics chip at the size it is drawn (shrunk smoothly from the high-resolution picture),
   so it stays sharp without shimmering when small */
function uploadChar() {
  var gl = X.gl; if (!gl || X.lost) return;
  var src = X.img, iw = src.naturalWidth || 1, ih = src.naturalHeight || 1, want = X.cw && X.rect ? Math.ceil((X.rect[2] - X.rect[0]) * X.cw) : iw;
  if (want > 0 && want < iw * 0.9) {
    var w = Math.max(8, Math.min(iw, want)), h = Math.max(8, Math.round(ih * w / iw)), c = X.cc || (X.cc = document.createElement('canvas'));
    c.width = w; c.height = h; var g = c.getContext('2d'); g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    // shrink in halves for a clean result from a much larger picture
    var cur = src, cw = iw, ch = ih;
    while (cw / 2 > w) { var t = document.createElement('canvas'); t.width = Math.round(cw / 2); t.height = Math.round(ch / 2); var tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(cur, 0, 0, t.width, t.height); cur = t; cw = t.width; ch = t.height; }
    g.drawImage(cur, 0, 0, w, h); src = c;
  }
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, X.texChar);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
}
/* VF: the character is kept on the graphics chip at each size it has been drawn (Home, Body, Aura), so moving between
   tabs reuses it instead of shrinking and sending the picture again */
function charTexture() {
  var gl = X.gl; if (!gl || X.lost) return;
  var key = X.n + '|' + X.src.length + '|' + X.src.slice(-32) + '|' + (X.cw && X.rect ? Math.ceil((X.rect[2] - X.rect[0]) * X.cw) : 0);
  X.texCache = X.texCache || [];
  for (var i = 0; i < X.texCache.length; i++) if (X.texCache[i].key === key) { X.texChar = X.texCache[i].tex; return; }
  X.texChar = mkTex(gl); uploadChar(); X.texCache.unshift({ key: key, tex: X.texChar });
  while (X.texCache.length > 3) { var old = X.texCache.pop(); if (old.tex !== X.texChar) gl.deleteTexture(old.tex); }
}
function resize() {
  if (!X || !X.wrap.isConnected) return;
  var w = X.wrap.clientWidth, h = X.wrap.clientHeight; if (!w || !h) return;
  // VF: the character at the phone's full sharpness (3x on an iPhone) on Home, up to 2.5x on the big Aura stage
  var dpr = Math.min(root.devicePixelRatio || 1, X.mode === 'mini' ? 3 : 2.5) * X.q, W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
  var changed = W !== X.cw || H !== X.ch || X.lastMode !== X.mode;
  X.cw = W; X.ch = H; X.lastMode = X.mode;
  if (X.canvas && (X.canvas.width !== W || X.canvas.height !== H)) { X.canvas.width = W; X.canvas.height = H; }
  if (changed && X.ready) { layout(); buildMask(); charTexture(); }
  if (X.ready) draw(now());
}
function now() { return ((root.performance || Date).now() - X.t0) / 1000; }
function draw(t) {
  var gl = X.gl; if (!gl || !X.ready || A.failed || X.lost || !X.cw) return;
  var P = X.pal, b = Math.max(0, 1 - ((root.performance || Date).now() - X.boostAt) / 900);
  gl.viewport(0, 0, X.cw, X.ch);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, X.texChar);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, X.texMask);
  gl.uniform2f(X.u.uRes, X.cw, X.ch); gl.uniform4f(X.u.uRect, X.rect[0], X.rect[1], X.rect[2], X.rect[3]); gl.uniform2f(X.u.uCore, X.core[0], X.core[1]);
  var tt = A.calm ? STILL_T : t % 1000, tq = Math.floor(tt * 8), hq = Math.abs(Math.sin(tq * 12.9898 + 3.7) * 43758.5453) % 1;
  gl.uniform1f(X.u.uT, tt); gl.uniform2f(X.u.uBolt, hq > 0.5 ? 1 : 0, tq); gl.uniform1f(X.u.uBoost, A.calm ? 0 : b * b * (3 - 2 * b)); gl.uniform1f(X.u.uMini, X.mode === 'mini' ? 1 : 0);
  gl.uniform1f(X.u.uDark, P.dark); gl.uniform3fv(X.u.uBase, P.base); gl.uniform3fv(X.u.uLight, P.light); gl.uniform3fv(X.u.uDeep, P.deep); gl.uniform3fv(X.u.uHiA, P.hiA || P.light); gl.uniform3fv(X.u.uHiB, P.hiB || P.light);
  gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  X.frames++;
}
function start() {
  if (!X || X.running || A.failed || X.lost || !X.ready || document.hidden || !X.visible || X.held || A.paused || !X.wrap.isConnected) return;
  if (A.calm) { draw(STILL_T); return; }
  X.running = true; X.last = 0; X.warm = 0; X.raf = requestAnimationFrame(loop);
}
function stop() { if (!X) return; X.running = false; if (X.raf) cancelAnimationFrame(X.raf); X.raf = 0; }
function loop(ms) {
  if (!X || !X.running) return;
  if (!X.wrap.isConnected || A.calm) { X.running = false; if (A.calm) draw(STILL_T); return; }
  // as fast as the screen goes. Only if frames keep running long (below about 40 a second) once it has settled is the
  // resolution eased, and VF: it climbs back to full sharpness as soon as the phone keeps up again (a busy moment, like
  // the opening, no longer leaves the character soft for the rest of the day)
  var ft = X.last ? ms - X.last : 8; X.last = ms; X.warm = (X.warm || 0) + 1;
  if (X.warm > 90 && ft < 250) {
    X.ema = X.ema == null ? 8 : X.ema * 0.93 + ft * 0.07; X.fc = (X.fc || 0) + 1;
    if (X.fc > 60 && X.ema > 26 && X.q > 0.75) { X.q = Math.max(0.75, X.q - 0.125); X.fc = 0; X.ema = 16; resize(); }
    else if (X.fc > 240 && X.ema < 17.5 && X.q < 1) { X.q = Math.min(1, X.q + 0.125); X.fc = 0; resize(); }
  }
  draw(now());
  X.raf = requestAnimationFrame(loop);
}
function applyCss() {
  if (!X || !X.pal) return;
  X.wrap.style.setProperty('--aura', X.pal.hex); X.wrap.style.setProperty('--aura-l', X.pal.lightHex);
}

/* show a character in a container: { n, src (the picture), palette (from RTL.auraPalette) }, mode 'mini' or 'full' */
A.show = function (container, info, mode) {
  if (!container || !info || !init()) return false;
  X.mode = mode === 'mini' ? 'mini' : 'full';
  X.wrap.classList.toggle('mini', X.mode === 'mini');
  if (X.wrap.parentNode !== container) container.insertBefore(X.wrap, container.firstChild);
  X.pal = info.palette; applyCss();
  if (X.n !== info.n || X.src !== info.src) {
    X.n = info.n; X.src = info.src; X.ready = false; stop();
    var img = X.img, want = info.src;
    img.onload = function () {
      if (X.src !== want) return;
      try { X.ready = true; X.cw = 0; resize(); start(); } catch (e) { fail(e && e.message || e); }
    };
    img.onerror = function () { if (X.src === want) X.wrap.classList.add('missing'); };
    X.wrap.classList.remove('missing');
    img.src = want || '';
    if (!want) X.wrap.classList.add('missing');
  } else { resize(); start(); }
  if (X.io) { X.io.unobserve(X.wrap); X.io.observe(X.wrap); }
  return true;
};
/* tap: a surge of power for a moment */
A.burst = function () { if (!X) return; X.boostAt = (root.performance || Date).now(); start(); };
A.supported = function () { return !A.failed; };
/* a sheet covers it: stop drawing until it is gone */
A.hold = function (on) { if (!X) return; X.held = !!on; if (on) stop(); else start(); };
/* VF: the opening is playing: wait, so the intro has the graphics chip to itself and the aura starts at full sharpness */
A.pause = function (on) { A.paused = !!on; if (!X) return; if (on) stop(); else { X.fc = 0; X.ema = null; start(); } };
A.debug = function () {
  return X ? { mode: X.gl && !A.failed && !X.lost ? 'gl' : 'css', n: X.n, mini: X.mode === 'mini', boosting: (root.performance || Date).now() - X.boostAt < 900, ready: !!X.ready, frames: X.frames, running: X.running, paused: A.paused, w: X.cw, h: X.ch, q: X.q, rect: X.rect.slice(), core: X.core.slice(), calm: A.calm, held: !!X.held, error: A.error, attached: X.wrap.isConnected }
    : { mode: null, error: A.error, paused: A.paused };
};
A.frameAt = function (t) { if (X && X.ready) draw(+t || 0); }; /* one frame at a chosen moment (tests, still pictures) */
A.render = function () { if (X && X.ready) draw(A.calm ? STILL_T : now()); };
A.STILL_T = STILL_T;
root.Aura = A;
})(typeof window !== 'undefined' ? window : this);
