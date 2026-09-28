/* Kuul retro-dither cursor lens. Port of RetroDither for layered <img> scenes:
   instead of html-in-canvas (not shipped in browsers), it composites every <img> that sits
   before the output canvas in the stage into an offscreen 2D canvas each frame, then runs the
   dither shader on it. Outside the lens the canvas is transparent, so the real DOM shows through.
   Rule: never over UI — text, buttons, links, nav, inputs and [data-no-dither] are masked out, and the lens hides while the cursor is on them.
   KuulDither.create(stage, canvas, options) → { setOptions, destroy }
   Copied as-is from Claude Design (ui_kits/kuul-web/kuul-dither.js). */
(function () {
  const DEFAULTS = { radius: 0.22, softness: 1, pixelSize: 3, levels: 4, darkColor: [0.1, 0.09, 0.2], lightColor: [1, 1, 1], colorize: 0.1, contrast: 0.9, brightness: 0, strength: 0.9, invert: 0, scanlines: 0.25, pattern: "bayer", trail: 0.4, degauss: 0.8, followSpeed: 3, scale: 0.5 };
  const PATTERNS = { bayer: 0, halftone: 1, hatch: 2, dash: 3 };
  const TRAIL_N = 24, RIPPLE_N = 3;
  const VERT = `#version 300 es
precision highp float; layout(location=0) in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;
  const FRAG = `#version 300 es
precision highp float; in vec2 vUv; out vec4 outColor;
uniform sampler2D uContent; uniform sampler2D uUi; uniform vec2 uResolution; uniform float uPixelSize, uLevels, uRadius, uSoftness, uActive, uColorize, uContrast, uBrightness, uStrength, uInvert, uScanlines;
uniform vec2 uPointer; uniform vec3 uDark, uLight; uniform int uPattern; uniform vec3 uTrail[${TRAIL_N}]; uniform vec4 uRipples[${RIPPLE_N}];
float bayer(ivec2 p){ int b[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(b[(p.y%4)*4+(p.x%4)])+0.5)/16.0; }
float thr(ivec2 c){ if(uPattern==1){ vec2 p=vec2(c%4)-1.5; return clamp(length(p)/2.6,0.03,0.97);} if(uPattern==2) return fract(float(c.x+c.y)*0.25+0.125); if(uPattern==3) return fract(float(c.x)*0.25+float(c.y%2)*0.5+0.125); return bayer(c); }
float dq(float v, ivec2 c){ float x=v*uLevels; return floor(x+step(thr(c),fract(x)))/uLevels; }
void main(){
  vec2 uv=vUv; float aspect=uResolution.x/uResolution.y;
  float rr=0.; vec2 rw=vec2(0.);
  for(int i=0;i<${RIPPLE_N};i++){ float a=uRipples[i].w; if(a<=0.001) continue; vec2 t=(uv-uRipples[i].xy)*vec2(aspect,1.); float d=length(t); float band=exp(-pow((d-uRipples[i].z)/0.07,2.))*a; rr=max(rr,band); rw+=normalize(t+1e-5)*band*0.012/vec2(aspect,1.); }
  uv=clamp(uv+rw,vec2(0.),vec2(1.));
  vec2 frag=uv*uResolution; vec2 cell=floor(frag/uPixelSize);
  vec2 cuv=clamp((cell+0.5)*uPixelSize/uResolution,vec2(0.001),vec2(0.999));
  vec4 px=texture(uContent,vec2(cuv.x,1.-cuv.y));
  float raw=dot(px.rgb,vec3(0.299,0.587,0.114));
  float lum=clamp((raw-0.5)*uContrast+0.5+uBrightness,0.,1.); lum=mix(lum,1.-lum,clamp(uInvert,0.,1.));
  float q=dq(lum,ivec2(cell));
  vec3 pal=mix(uDark,uLight,q); vec3 keep=px.rgb*(q/max(lum,0.001));
  vec3 col=mix(keep,pal,clamp(uColorize,0.,1.));
  col*=1.-uScanlines*0.45*mod(cell.y,2.); col*=1.+rr*vec3(0.22,-0.06,0.3);
  float dist=length((uv-uPointer)*vec2(aspect,1.)); float rad=max(uRadius*uActive,1e-4); float inner=rad*(1.-clamp(uSoftness,0.,1.));
  float lens=(1.-smoothstep(inner,rad,dist))*uActive;
  float ghost=0.; for(int i=0;i<${TRAIL_N};i++){ float a=uTrail[i].z; if(a<=0.001) continue; float td=length((uv-uTrail[i].xy)*vec2(aspect,1.)); float tr=max(uRadius*0.8,1e-4); ghost=max(ghost,(1.-smoothstep(tr*0.2,tr,td))*a); }
  float mask=clamp(max(lens,ghost),0.,1.)*clamp(uStrength,0.,1.); mask=clamp(max(mask,rr),0.,1.);
  mask*=1.-texture(uUi,vec2(vUv.x,1.-vUv.y)).a;
  float apply=step(bayer(ivec2(cell)),mask);
  outColor=vec4(col*apply, px.a*apply);
}`;

  function pos(v, free) { v = (v || "50%").trim(); if (v.endsWith("%")) return free * parseFloat(v) / 100; if (v === "left" || v === "top") return 0; if (v === "right" || v === "bottom") return free; if (v === "center") return free / 2; return parseFloat(v) || 0; }
  function drawImg(ctx, img, r, base, k) {
    if (!img.complete || !img.naturalWidth || r.width < 1 || r.height < 1) return;
    const cs = getComputedStyle(img); if (cs.visibility === "hidden" || cs.display === "none") return;
    let op = 1; for (let el = img; el && el !== base.stage; el = el.parentElement) op *= parseFloat(getComputedStyle(el).opacity || 1);
    if (op < 0.02) return;
    const nw = img.naturalWidth, nh = img.naturalHeight, fit = cs.objectFit;
    let dw = r.width, dh = r.height;
    if (fit === "cover" || fit === "contain") { const s = (fit === "cover" ? Math.max : Math.min)(r.width / nw, r.height / nh); dw = nw * s; dh = nh * s; }
    const [ox, oy] = (cs.objectPosition || "50% 50%").split(" ");
    const x = r.left - base.left + pos(ox, r.width - dw), y = r.top - base.top + pos(oy, r.height - dh);
    ctx.save(); ctx.globalAlpha = op; ctx.beginPath(); ctx.rect((r.left - base.left) * k, (r.top - base.top) * k, r.width * k, r.height * k); ctx.clip();
    ctx.drawImage(img, x * k, y * k, dw * k, dh * k); ctx.restore();
  }

  function create(stage, output, options) {
    const cfg = Object.assign({}, DEFAULTS, options || {});
    const gl = output.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) return null;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error("KuulDither:", gl.getShaderInfoLog(o)); return o; };
    const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
    const U = {}; for (let i = 0, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i < n; i++) { const a = gl.getActiveUniform(prog, i); U[a.name] = gl.getUniformLocation(prog, a.name); }
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(([a, b]) => gl.texParameteri(gl.TEXTURE_2D, a, b));
    const comp = document.createElement("canvas"), cctx = comp.getContext("2d");
    const ui = document.createElement("canvas"), uctx = ui.getContext("2d");
    const uiTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, uiTex);
    [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(([a, b]) => gl.texParameteri(gl.TEXTURE_2D, a, b));
    const UI_SEL = "a, button, input, textarea, select, label, nav, header, h1, h2, h3, h4, p, [role], [data-no-dither], [data-phone]";
    const isUi = el => !!(el && el.closest && el.closest(UI_SEL));
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const P = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, a: 0, t: 0 };
    const trail = [], trailData = new Float32Array(TRAIL_N * 3), ripples = [], rippleData = new Float32Array(RIPPLE_N * 4);
    let raf = 0, last = performance.now(), dead = false;

    function composite() {
      const b = output.getBoundingClientRect(), k = cfg.scale;
      const w = Math.max(1, Math.round(b.width * k)), h = Math.max(1, Math.round(b.height * k));
      if (comp.width !== w || comp.height !== h) { comp.width = w; comp.height = h; }
      cctx.clearRect(0, 0, w, h);
      const base = { left: b.left, top: b.top, stage };
      stage.querySelectorAll("img").forEach(img => { if (img.compareDocumentPosition(output) & Node.DOCUMENT_POSITION_FOLLOWING) drawImg(cctx, img, img.getBoundingClientRect(), base, k); });
      if (ui.width !== w || ui.height !== h) { ui.width = w; ui.height = h; }
      uctx.clearRect(0, 0, w, h); uctx.fillStyle = "#000"; const pad = 10 * k;
      stage.querySelectorAll(UI_SEL).forEach(el => { const cs = getComputedStyle(el); if (cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) return; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return; uctx.beginPath(); uctx.roundRect ? uctx.roundRect((r.left - b.left) * k - pad, (r.top - b.top) * k - pad, r.width * k + pad * 2, r.height * k + pad * 2, pad * 2) : uctx.rect((r.left - b.left) * k - pad, (r.top - b.top) * k - pad, r.width * k + pad * 2, r.height * k + pad * 2); uctx.fill(); });
      stage.querySelectorAll("div, span").forEach(el => { if (el.closest(UI_SEL)) return; for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) uctx.fillRect((r.left - b.left) * k - pad, (r.top - b.top) * k - pad, r.width * k + pad * 2, r.height * k + pad * 2); } });
      gl.bindTexture(gl.TEXTURE_2D, uiTex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ui);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, comp);
    }
    function frame(now) {
      if (dead) return;
      const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
      const e = reduce ? 1 : 1 - Math.exp(-dt * Math.max(cfg.followSpeed, 0.5));
      P.x += (P.tx - P.x) * e; P.y += (P.ty - P.y) * e; P.a += (P.t - P.a) * e;
      const s = now / 1000;
      if (cfg.trail > 0.001 && P.a > 0.1 && !reduce) { const l = trail[trail.length - 1]; if (!l || s - l.t >= 0.04) { trail.push({ x: P.x, y: P.y, t: s }); if (trail.length > TRAIL_N) trail.shift(); } }
      trailData.fill(0); let alive = false;
      for (let i = trail.length - 1; i >= 0; i--) { const p = trail[i], age = s - p.t, v = cfg.trail * Math.exp(-age * 2.2) * Math.min(Math.max((0.95 - age) / 0.25, 0), 1); if (v < 0.005) { trail.splice(0, i + 1); break; } trailData.set([p.x, p.y, v], i * 3); alive = true; }
      rippleData.fill(0); for (let i = ripples.length - 1; i >= 0; i--) if (s - ripples[i].t > 0.9) ripples.splice(i, 1);
      ripples.slice(0, RIPPLE_N).forEach((r, i) => { const age = s - r.t; rippleData.set([r.x, r.y, age * 1.2, cfg.degauss * (1 - age / 0.9)], i * 4); alive = true; });
      const dpr = Math.min(devicePixelRatio || 1, 2), W = Math.round(output.clientWidth * dpr), H = Math.round(output.clientHeight * dpr);
      if (output.width !== W || output.height !== H) { output.width = W; output.height = H; }
      if (P.a > 0.002 || alive) {
        composite();
        gl.useProgram(prog); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U.uContent, 0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, uiTex); gl.uniform1i(U.uUi, 1);
        gl.uniform2f(U.uResolution, W, H); gl.uniform1f(U.uPixelSize, Math.max(cfg.pixelSize, 1) * dpr); gl.uniform1f(U.uLevels, Math.max(cfg.levels, 1));
        gl.uniform1f(U.uRadius, cfg.radius); gl.uniform1f(U.uSoftness, cfg.softness); gl.uniform2f(U.uPointer, P.x, P.y); gl.uniform1f(U.uActive, P.a);
        gl.uniform3fv(U.uDark, cfg.darkColor); gl.uniform3fv(U.uLight, cfg.lightColor);
        ["Colorize", "Contrast", "Brightness", "Strength", "Invert", "Scanlines"].forEach(n => gl.uniform1f(U["u" + n], cfg[n.toLowerCase()]));
        gl.uniform1i(U.uPattern, PATTERNS[cfg.pattern] || 0); gl.uniform3fv(U["uTrail[0]"], trailData); gl.uniform4fv(U["uRipples[0]"], rippleData);
        gl.viewport(0, 0, W, H); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else { gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
      raf = requestAnimationFrame(frame);
    }
    const rel = e => { const r = output.getBoundingClientRect(); return [(e.clientX - r.left) / Math.max(r.width, 1), 1 - (e.clientY - r.top) / Math.max(r.height, 1)]; };
    const onMove = e => { if (e.pointerType === "touch") return; if (isUi(document.elementFromPoint(e.clientX, e.clientY))) { P.t = 0; return; } [P.tx, P.ty] = rel(e); if (P.a < 0.01) { P.x = P.tx; P.y = P.ty; } P.t = 1; };
    const onLeave = () => { P.t = 0; };
    const onDown = e => { if (reduce || cfg.degauss <= 0.001 || isUi(e.target)) return; const [x, y] = rel(e); ripples.push({ x, y, t: performance.now() / 1000 }); if (ripples.length > RIPPLE_N) ripples.shift(); };
    stage.addEventListener("pointermove", onMove, { passive: true }); stage.addEventListener("pointerleave", onLeave, { passive: true }); stage.addEventListener("pointerdown", onDown, { passive: true });
    raf = requestAnimationFrame(frame);
    return {
      setOptions(o) { Object.assign(cfg, o); },
      destroy() { dead = true; cancelAnimationFrame(raf); stage.removeEventListener("pointermove", onMove); stage.removeEventListener("pointerleave", onLeave); stage.removeEventListener("pointerdown", onDown); gl.deleteTexture(tex); gl.deleteTexture(uiTex); gl.deleteProgram(prog); gl.deleteBuffer(buf); }
    };
  }
  window.KuulDither = { create };
})();
