import fs from 'node:fs';
const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// --- pull the two halves out of the real page ---
const css  = src.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = src.match(/<\/style>\s*<\/head>\s*<body>([\s\S]*?)<script>\s*\(function/)[1];

// --- CSS: resolve every JS-dependent rule to its settled state ---
// Walk brace depth so @media blocks survive intact.
function rules(text){
  const out=[]; let depth=0, start=0, sel='';
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='{'){ if(depth===0){ sel=text.slice(start,i); } depth++; }
    else if(c==='}'){ depth--; if(depth===0){ out.push({sel, body:text.slice(start,i+1)}); start=i+1; } }
  }
  return out;
}
function clean(text){
  return rules(text).map(({sel, body})=>{
    const s = sel.trim();
    if(/(^|[\s,])\.js[\s.]/.test(' '+s+' ')) return '';        // hidden pre-animation states: drop
    if(s.startsWith('@media')){                                 // recurse into media blocks
      const inner = body.slice(body.indexOf('{')+1, body.lastIndexOf('}'));
      const kept = clean(inner).trim();
      return kept ? `${s}{${kept}}` : '';
    }
    return body.replace(/html:not\(\.js\)\s+/g,'');             // no-JS fallbacks become unconditional
  }).filter(Boolean).join('\n');
}

const lineTop = Number(process.argv[3]);
const extra = `
  /* canvas artboard: the scroll-driven marker is pinned where it reads */
  .nowline,.nowdot{position:absolute;top:${lineTop}px;opacity:1}
`;
const out = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Onest:wght@400..900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
${clean(css)}
${extra}
  </style>
</helmet>
${body.trim().replace(/<div class="(nowline|nowdot)"/g,'<div class="$1" data-on')}
</x-dc>
</body>
</html>
`;
fs.writeFileSync(new URL('./'+process.argv[2], import.meta.url), out);
console.log(process.argv[2], (out.length/1024).toFixed(0)+'KB');
