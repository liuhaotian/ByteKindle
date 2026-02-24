/**
 * ByteKindle - Worker AI Edition
 * Version: v8.9.3 (Vector Logic + v8.3.0 UI Baseline)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hero = (url.searchParams.get("hero") || "").toLowerCase().trim();
    const heroKey = `bk_v8_vector_${encodeURIComponent(hero.replace(/\s+/g, '_'))}`;

    // --- ROUTE: DEBUG ---
    if (url.pathname === "/debug") {
      const testPrompt = url.searchParams.get("prompt") || "";
      return new Response(renderDebug(testPrompt), {
        headers: { "Content-Type": "text/html; charset=UTF-8" }
      });
    }

    // --- ROUTE: START (Added KV Caching & Gemma 3 Vector Eng) ---
    if (url.pathname === "/start") {
      if (!hero) return Response.redirect(url.origin, 302);
      
      const cached = await env.KV.get(heroKey);
      if (cached) {
        const state = JSON.parse(cached);
        state.currentIndex = 0;
        await env.KV.put(heroKey, JSON.stringify(state), { expirationTtl: 1209600 });
        return Response.redirect(`${url.origin}/view?hero=${encodeURIComponent(hero)}`, 302);
      }

      const scenes = await generateVectorPrompts(env, hero);
      await env.KV.put(heroKey, JSON.stringify({ scenes, currentIndex: 0 }), { expirationTtl: 1209600 });
      return Response.redirect(`${url.origin}/view?hero=${encodeURIComponent(hero)}`, 302);
    }

    // --- ROUTE: VIEW ---
    if (url.pathname === "/view") {
      const state = await env.KV.get(heroKey, { type: "json" });
      if (!state) return Response.redirect(url.origin, 302);
      return new Response(renderSeamlessViewer(hero, state), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
    }

    // --- ROUTE: IMAGE API (Index-based, Raw Prompt Support) ---
    if (url.pathname === "/api/image.png") {
      const promptOverride = url.searchParams.get("prompt");
      let finalPrompt = promptOverride;

      if (!finalPrompt) {
        const sceneIndex = parseInt(url.searchParams.get("index") || "0");
        const state = await env.KV.get(heroKey, { type: "json" });
        if (state && state.scenes[sceneIndex]) {
          finalPrompt = state.scenes[sceneIndex];
        }
      }

      if (!finalPrompt) return new Response("Not Found", { status: 404 });

      const image = await env.AI.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", { 
        prompt: finalPrompt, 
        guidance: 7.5 
      });
      return new Response(image, { headers: { "Content-Type": "image/png" } });
    }

    // --- ROUTE: NEXT ---
    if (url.pathname === "/api/next") {
      const state = await env.KV.get(heroKey, { type: "json" });
      if (state) {
        state.currentIndex = (state.currentIndex + 1) >= state.scenes.length ? 0 : state.currentIndex + 1;
        await env.KV.put(heroKey, JSON.stringify(state), { expirationTtl: 1209600 });
        return new Response(JSON.stringify({ index: state.currentIndex, desc: state.scenes[state.currentIndex] }));
      }
      return new Response("Error", { status: 500 });
    }

    return new Response(renderSetup(), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
  }
};

/**
 * Vector Engineer: Gemma 3 12B
 */
async function generateVectorPrompts(env, hero) {
  const model = "gemma-3-12b-it";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  
  const promptText = `Task: SDXL Vector Activation for a 2yo.
  Subject: ${hero}.
  Requirements: 
  - Generate 12-18 distinct scenes.
  - Mix ${hero} with kid 8-10 elements (bees, butterflies, clouds, toys, etc).
  - Output ONLY raw comma-separated tokens per line per scene. 
  - Style: "grayscale".
  - NO FULL SENTENCES. No numbering.`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }], generationConfig: { temperature: 0.8 } })
  });
  const data = await response.json();
  const rawText = data.candidates[0].content.parts[0].text;
  console.log(`[Vector Prompt Generation]: ${rawText}`);
  return rawText.split('\n').map(l => l.trim()).filter(l => l.length > 10);
}

// --- RENDERING FUNCTIONS (STRICTLY v8.3.0 BASELINE) ---

function renderDebug(testPrompt) {
  let resultHtml = "";
  if (testPrompt) {
    resultHtml = `<div style="margin-top:20px; border-top: 3px solid #000; padding-top:20px;">
        <h3>Raw AI Output:</h3>
        <img src="/api/image.png?prompt=${encodeURIComponent(testPrompt)}" style="width:100%; max-width:512px; border:4px solid #000;">
        <p><i>Full Prompt Sent: ${testPrompt}</i></p>
      </div>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Debug</title>
  <style>
    body { font-family: monospace; padding: 20px; line-height: 1.5; background: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border: 2px solid #000; }
    input { width: 100%; padding: 12px; border: 2px solid #000; font-size: 16px; margin-bottom: 10px; box-sizing: border-box; }
    button { width: 100%; padding: 12px; background: #000; color: #fff; border: none; font-weight: bold; cursor: pointer; }
  </style></head>
  <body>
    <div class="container">
      <h1>ByteKindle Debug</h1>
      <form method="GET" action="/debug">
        <input type="text" name="prompt" value="${testPrompt}" placeholder="Enter full raw prompt..." required>
        <button type="submit">GENERATE RAW IMAGE</button>
      </form>
      ${resultHtml}
    </div>
  </body></html>`;
}

function renderSeamlessViewer(hero, state) {
  const total = state.scenes.length;
  const heroEnc = encodeURIComponent(hero);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #fff; font-family: Arial, sans-serif; position: fixed; }
    .nav { width: 100%; border-bottom: 3px solid #000; height: 110px; display: table; table-layout: fixed; }
    .cell { display: table-cell; vertical-align: middle; text-align: center; }
    .info-box { text-align: left; padding-left: 15px; }
    #scene-num { font-size: 14px; display: block; color: #444; }
    #scene-desc { font-size: 16px; font-weight: bold; line-height: 1.2; display: block; height: 44px; overflow: hidden; }
    .btn { text-decoration: none; color: #000; font-weight: bold; font-size: 24px; display: block; line-height: 110px; border: 0; background: transparent; width: 100%; cursor: pointer; }
    .btn-next { background: #000; color: #fff; }
    #main-img { width: 100%; height: auto; display: block; border: 0; }
    #next-preview { width: 80px; height: 80px; display: block; margin: 0 auto; border: 1px solid #000; }
  </style>
  <script>
    document.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });
    var currentIdx = ${state.currentIndex};
    var nextIdx = (currentIdx + 1) % ${total};

    function nextScene() {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/next?hero=${heroEnc}', true);
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4 && xhr.status == 200) {
          var data = JSON.parse(xhr.responseText);
          currentIdx = data.index;
          nextIdx = (currentIdx + 1) % ${total};
          
          // NATIVE SWAP: Main image takes the preview's src
          document.getElementById('main-img').src = document.getElementById('next-preview').src;
          document.getElementById('scene-num').innerHTML = 'Scene ' + (currentIdx + 1) + '/' + ${total};
          document.getElementById('scene-desc').innerHTML = data.desc;
          
          // Immediately set next preview to trigger native browser load
          document.getElementById('next-preview').src = '/api/image.png?hero=${heroEnc}&index=' + nextIdx;
        }
      };
      xhr.send();
    }
  </script></head>
  <body>
    <div id="view-wrapper">
      <div class="nav">
        <div class="cell info-box">
          <span id="scene-num">Scene ${state.currentIndex + 1}/${total}</span>
          <span id="scene-desc">${state.scenes[state.currentIndex]}</span>
        </div>
        <div class="cell" style="width:100px; border-left: 3px solid #000;">
          <button onclick="nextScene()" class="btn btn-next">NEXT</button>
        </div>
        <div class="cell" style="width:100px; border-left: 3px solid #000;" onclick="nextScene()">
          <img id="next-preview" src="/api/image.png?hero=${heroEnc}&index=${(state.currentIndex + 1) % total}">
        </div>
        <div class="cell" style="width:80px; border-left: 3px solid #000;"><a href="/" class="btn">HOME</a></div>
      </div>
      <div onclick="nextScene()">
        <img id="main-img" src="/api/image.png?hero=${heroEnc}&index=${state.currentIndex}">
      </div>
    </div>
  </body></html>`;
}

function renderSetup() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    body { background: #fff; margin: 0; padding: 0; font-family: Arial, sans-serif; text-align: center; width: 100%; height: 100%; overflow: hidden; position: fixed; }
    #setup-container { width: 100%; height: 33%; margin-top: 5%; padding: 20px; box-sizing: border-box; }
    h2 { font-size: 28px; margin-bottom: 10px; }
    input { font-size: 32px; width: 100%; padding: 20px; border: 4px solid #000; border-radius: 12px; box-sizing: border-box; }
    button { font-size: 32px; width: 100%; padding: 20px; background: #000; color: #fff; border: none; font-weight: bold; border-radius: 12px; margin-top: 15px; }
  </style></head>
  <body>
    <div id="setup-container">
      <h2>Who is the Hero?</h2>
      <form method="GET" action="/start"><input type="text" name="hero" placeholder="Brave Bee" required autofocus><button type="submit">GO</button></form>
    </div>
  </body></html>`;
}
