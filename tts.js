/* Lectura en voz alta (Web Speech API) compartida por la guía y el examen.
   - TTS.mountSettings(el): dibuja los controles de voz y velocidad dentro de el.
   - TTS.speak(texto, etiqueta, boton): lee el texto; si ya se está leyendo ese botón, se detiene.
   - TTS.addBlockButtons(raiz): agrega un botón «Escuchar» a cada h2, h3 y h4 de raiz. */
(function(){
  var synth = window.speechSynthesis;
  var supported = !!(synth && window.SpeechSynthesisUtterance);
  var PREF_KEY = "mecip-tts";
  var prefs = {voice:"", rate:1};
  try{ var saved = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); if(saved.rate) prefs.rate = saved.rate; if(saved.voice) prefs.voice = saved.voice; }catch(e){}
  function savePrefs(){ try{ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }catch(e){} }

  var voices = [];
  var settingsEls = [];
  var queue = [], idx = 0, label = "", activeBtn = null, paused = false, runId = 0;
  var bar, barLabel, barPause;

  var ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var ICON_STOP = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';

  /* ---------- estilos ---------- */
  var css = [
    ".tts-btn{display:inline-flex;align-items:center;gap:6px;font-family:var(--display,system-ui,sans-serif);font-size:13px;font-weight:700;line-height:1;color:var(--accent);background:var(--accent-soft);border:1px solid transparent;border-radius:999px;padding:7px 12px;cursor:pointer;margin-top:10px;vertical-align:middle;letter-spacing:0;text-transform:none}",
    ".tts-btn:hover{border-color:var(--accent)}",
    ".tts-btn[aria-pressed=true]{background:var(--accent);color:var(--sheet)}",
    "h2 + .tts-btn,h3 + .tts-btn,h4 + .tts-btn{margin-bottom:2px}",
    ".tts-settings{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;font-family:var(--display,system-ui,sans-serif);font-size:14px}",
    ".tts-settings label{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}",
    ".tts-settings .t{font-weight:700}",
    ".tts-settings select{font:inherit;max-width:100%;min-width:0;padding:6px 8px;border:1px solid var(--rule);border-radius:6px;background:var(--sheet);color:var(--ink)}",
    ".tts-settings input[type=range]{width:140px;max-width:100%;accent-color:var(--accent)}",
    ".tts-settings output{font-family:var(--mono,monospace);font-size:13px;min-width:3.5em;font-variant-numeric:tabular-nums}",
    ".tts-settings button{font:inherit;font-weight:700;border:1px solid var(--rule);background:var(--sheet);color:var(--ink);border-radius:6px;padding:6px 12px;cursor:pointer}",
    ".tts-settings .note{flex-basis:100%;font-size:13px;color:var(--muted)}",
    ".tts-bar{position:fixed;left:0;right:0;bottom:0;z-index:50;background:var(--ink);color:var(--sheet);padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));font-family:var(--display,system-ui,sans-serif);font-size:14px;box-shadow:0 -4px 16px rgba(0,0,0,.18)}",
    ".tts-bar .in{max-width:1120px;margin:0 auto;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center}",
    ".tts-bar .lab{flex:1 1 200px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".tts-bar .lab b{color:var(--sheet)}",
    ".tts-bar .ctl{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
    ".tts-bar button{font:inherit;font-weight:700;border:0;border-radius:6px;padding:7px 12px;cursor:pointer;background:var(--sheet);color:var(--ink)}",
    ".tts-bar .tts-settings{color:var(--sheet)}",
    ".tts-bar .tts-settings select,.tts-bar .tts-settings button{border-color:transparent}",
    ".tts-bar .tts-settings .t,.tts-bar .tts-settings .note,.tts-bar .tts-settings .try{display:none}",
    "body.tts-open{padding-bottom:120px}",
    "@media (max-width:600px){body.tts-open{padding-bottom:200px}.tts-bar .tts-settings select{max-width:150px}.tts-bar .tts-settings input[type=range]{width:100px}}",
    "@media print{.tts-btn,.tts-bar,.tts-settings,.tts-box{display:none!important}}"
  ].join("\n");
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ---------- texto ---------- */
  var REPL = [
    [/\bSCI\b/g,"ese ce i"],[/\bPHVA\b/g,"pe, hache, uve, a"],[/\bNRM\b/g,"ene erre eme"],
    [/\bCGR\b/g,"ce ge erre"],[/\bMRE\b/g,"eme erre e"],[/\bN\.\s?°\s?/g,"número "],
    [/\bRes\.\s/g,"Resolución "],[/\bEj\.:?/g,"Ejemplo:"],[/\bvs\.\s?/g,"versus "],[/\bU(\d)\b/g,"Unidad $1"],
    [/≠/g," es distinto de "],[/[→›]/g,", "],[/·/g,", "],[/[«»"“”]/g,""],[/\s*\+\s*/g," más "],[/\s=\s/g," igual a "],
    [/---/g,"sin equivalente"]
  ];
  function clean(t){
    t = t.replace(/\t+/g,". ").replace(/\n{2,}/g,". ").replace(/\n/g,". ");
    REPL.forEach(function(r){ t = t.replace(r[0], r[1]); });
    return t.replace(/\s+/g," ").replace(/(\s*\.\s*){2,}/g,". ").replace(/([?!:;,])\s*\./g,"$1").replace(/\s+([.,:;])/g,"$1").trim();
  }
  function chunk(t){
    var parts = t.match(/[^.!?;:]+[.!?;:]*\s*/g) || [t], out = [], cur = "";
    parts.forEach(function(p){
      if((cur + p).length > 220 && cur){ out.push(cur.trim()); cur = ""; }
      while(p.length > 220){ var cut = p.lastIndexOf(",", 220); if(cut < 60) cut = p.lastIndexOf(" ", 220); if(cut < 1) cut = 220; out.push(p.slice(0,cut+1).trim()); p = p.slice(cut+1); }
      cur += p;
    });
    if(cur.trim()) out.push(cur.trim());
    return out.filter(function(s){ return /[\wáéíóúñ]/i.test(s); });
  }

  /* ---------- voces ---------- */
  function loadVoices(){
    if(!supported) return;
    var all = synth.getVoices() || [];
    voices = all.filter(function(v){ return /^es([-_]|$)/i.test(v.lang); });
    voices.sort(function(a,b){ return (a.lang+a.name).localeCompare(b.lang+b.name); });
    if(!voices.some(function(v){ return v.voiceURI === prefs.voice; })){
      var pref = ["es-PY","es-AR","es-419","es-US","es-MX","es-ES"], pick = null;
      for(var i=0;i<pref.length && !pick;i++){ pick = voices.filter(function(v){ return v.lang.replace("_","-").toLowerCase() === pref[i].toLowerCase(); })[0]; }
      prefs.voice = (pick || voices[0] || {}).voiceURI || "";
    }
    settingsEls.forEach(fillSettings);
  }
  function currentVoice(){ return voices.filter(function(v){ return v.voiceURI === prefs.voice; })[0] || null; }

  /* ---------- controles ---------- */
  var uid = 0;
  function mountSettings(el){
    if(!el) return;
    uid++;
    el.classList.add("tts-settings");
    if(!supported){ el.innerHTML = '<span class="note">Este navegador no permite la lectura en voz alta. Probá con Chrome, Edge o Safari actualizados.</span>'; return; }
    el.innerHTML =
      '<span class="t">Lectura en voz alta</span>' +
      '<label>Voz <select id="ttsVoice'+uid+'" aria-label="Voz en español"></select></label>' +
      '<label>Velocidad <input type="range" id="ttsRate'+uid+'" min="0.5" max="2" step="0.1" aria-label="Velocidad de lectura"><output></output></label>' +
      '<button type="button" class="try">Probar voz</button>' +
      '<span class="note"></span>';
    var sel = el.querySelector("select"), rng = el.querySelector("input"), out = el.querySelector("output");
    sel.addEventListener("change", function(){ prefs.voice = sel.value; savePrefs(); settingsEls.forEach(fillSettings); restartCurrent(); });
    rng.addEventListener("input", function(){ prefs.rate = +rng.value; out.textContent = prefs.rate.toFixed(1) + "×"; settingsEls.forEach(function(o){ if(o!==el) fillSettings(o); }); });
    rng.addEventListener("change", function(){ savePrefs(); restartCurrent(); });
    el.querySelector(".try").addEventListener("click", function(){ speak("Hola. Esta es la voz que se usará para leer la guía de estudio.", "Prueba de voz", null); });
    settingsEls.push(el);
    fillSettings(el);
  }
  function fillSettings(el){
    var sel = el.querySelector("select"); if(!sel) return;
    var rng = el.querySelector("input"), out = el.querySelector("output"), note = el.querySelector(".note");
    sel.innerHTML = "";
    if(!voices.length){
      sel.innerHTML = '<option value="">Voz del sistema</option>';
      if(note) note.textContent = "No se encontraron voces en español en este dispositivo; se usará la voz predeterminada con pronunciación en español. Podés instalar voces en español desde la configuración de idioma del sistema.";
    } else {
      voices.forEach(function(v){ var o = document.createElement("option"); o.value = v.voiceURI; o.textContent = v.name.replace(/^(Microsoft|Google)\s+/,"") + " (" + v.lang + ")"; sel.appendChild(o); });
      sel.value = prefs.voice;
      if(note) note.textContent = voices.length + " voces en español disponibles en este dispositivo.";
    }
    rng.value = prefs.rate; out.textContent = (+prefs.rate).toFixed(1) + "×";
  }

  function ensureBar(){
    if(bar) return;
    bar = document.createElement("div"); bar.className = "tts-bar"; bar.hidden = true; bar.setAttribute("role","region"); bar.setAttribute("aria-label","Reproductor de lectura");
    bar.innerHTML = '<div class="in"><span class="lab" aria-live="polite"></span><div class="ctl"><button type="button" class="p">Pausar</button><button type="button" class="s">Detener</button></div><div class="bs"></div></div>';
    document.body.appendChild(bar);
    barLabel = bar.querySelector(".lab"); barPause = bar.querySelector(".p");
    barPause.addEventListener("click", togglePause);
    bar.querySelector(".s").addEventListener("click", stop);
    mountSettings(bar.querySelector(".bs"));
  }

  /* ---------- reproducción ---------- */
  function setBtn(b, on){
    if(!b) return;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.innerHTML = (on ? ICON_STOP : ICON_PLAY) + '<span>' + (on ? "Detener" : (b.dataset.label || "Escuchar")) + '</span>';
  }
  function speakFrom(i){
    var my = ++runId;
    synth.cancel();
    idx = i;
    function next(){
      if(my !== runId) return;
      if(idx >= queue.length){ finish(); return; }
      var u = new SpeechSynthesisUtterance(queue[idx]);
      var v = currentVoice(); if(v){ u.voice = v; u.lang = v.lang; } else u.lang = "es-ES";
      u.rate = prefs.rate;
      u.onend = function(){ if(my !== runId) return; idx++; next(); };
      u.onerror = function(e){ if(my !== runId) return; if(e && (e.error === "interrupted" || e.error === "canceled")) return; idx++; next(); };
      barLabel.innerHTML = 'Leyendo: <b></b> <span style="opacity:.7">(' + (idx+1) + '/' + queue.length + ')</span>';
      barLabel.querySelector("b").textContent = label;
      synth.speak(u);
    }
    next();
  }
  function speak(text, lab, btn){
    if(!supported) return;
    if(btn && btn === activeBtn){ stop(); return; }
    ensureBar();
    setBtn(activeBtn, false);
    activeBtn = btn || null; setBtn(activeBtn, true);
    queue = chunk(clean(text)); label = lab || "";
    paused = false; barPause.textContent = "Pausar";
    bar.hidden = false; document.body.classList.add("tts-open");
    speakFrom(0);
  }
  function restartCurrent(){ if(bar && !bar.hidden && !paused) speakFrom(idx); }
  function togglePause(){
    if(!paused){ paused = true; runId++; synth.cancel(); barPause.textContent = "Continuar"; }
    else { paused = false; barPause.textContent = "Pausar"; speakFrom(idx); }
  }
  function finish(){
    setBtn(activeBtn, false); activeBtn = null;
    if(bar){ bar.hidden = true; document.body.classList.remove("tts-open"); }
  }
  function stop(){ runId++; if(supported) synth.cancel(); paused = false; finish(); }

  /* ---------- botones por bloque ---------- */
  function blockText(h){
    var lvl = +h.tagName[1], parts = [h.innerText], n = h.nextElementSibling;
    while(n){
      if(/^H[1-6]$/.test(n.tagName) && +n.tagName[1] <= lvl) break;
      if(!n.classList.contains("tts-btn") && getComputedStyle(n).display !== "none") parts.push(n.innerText);
      n = n.nextElementSibling;
    }
    return parts.join("\n\n");
  }
  function addBlockButtons(root){
    if(!supported || !root) return;
    root.querySelectorAll("h2, h3, h4").forEach(function(h){
      var b = document.createElement("button"); b.type = "button"; b.className = "tts-btn";
      b.dataset.label = h.tagName === "H2" ? "Escuchar sección" : "Escuchar";
      var name = (h.querySelector(".eyebrow") ? h.lastChild.textContent : h.innerText).trim();
      b.setAttribute("aria-label", b.dataset.label + ": " + name);
      setBtn(b, false);
      b.addEventListener("click", function(){ speak(blockText(h), name, b); });
      h.insertAdjacentElement("afterend", b);
    });
  }

  if(supported){
    loadVoices();
    if(typeof synth.addEventListener === "function") synth.addEventListener("voiceschanged", loadVoices);
    else synth.onvoiceschanged = loadVoices;
    setTimeout(loadVoices, 600);
    window.addEventListener("pagehide", function(){ synth.cancel(); });
  }

  window.TTS = {supported:supported, mountSettings:mountSettings, speak:speak, stop:stop, addBlockButtons:addBlockButtons, makeButton:function(lbl){ var b=document.createElement("button"); b.type="button"; b.className="tts-btn"; b.dataset.label=lbl||"Escuchar"; setBtn(b,false); return b; }, isActive:function(b){ return b===activeBtn; }};
})();
