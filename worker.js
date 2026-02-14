/**
 * ByteKindle - Worker AI Edition
 * Version: v7.6.0 (SDXL Max Steps & Gemma 3 Narrative)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hero = url.searchParams.get("hero") || "";
    const heroKey = `bk_v7_${encodeURIComponent(hero.toLowerCase().trim().replace(/\s+/g, '_'))}`;

    if (url.pathname === "/start") {
      const existingStoryRaw = await env.KV.get(heroKey);
      if (existingStoryRaw) {
        const state = JSON.parse(existingStoryRaw);
        state.currentIndex = 0;
        await env.KV.put(heroKey, JSON.stringify(state), { expirationTtl: 604800 });
        return Response.redirect(`${url.origin}/view?hero=${encodeURIComponent(hero)}`, 302);
      }

      const scenes = await generateStoryWithGemma3(env, hero);
      await env.KV.put(heroKey, JSON.stringify({
        scenes: scenes,
        currentIndex: 0
      }), { expirationTtl: 604800 });
      
      return Response.redirect(`${url.origin}/view?hero=${encodeURIComponent(hero)}`, 302);
    }

    if (url.pathname === "/view") {
      const state = await env.KV.get(heroKey, { type: "json" });
      if (!state) return Response.redirect(url.origin, 302);
      return new Response(renderSeamlessViewer(hero, state), {
        headers: { "Content-Type": "text/html; charset=UTF-8" }
      });
    }

    if (url.pathname === "/api/image.png") {
      const sceneIndex = parseInt(url.searchParams.get("index") || "0");
      const state = await env.KV.get(heroKey, { type: "json" });
      if (!state || !state.scenes[sceneIndex]) return new Response("Not Found", { status: 404 });
      return await generateSceneImage(env, state.scenes[sceneIndex]);
    }

    if (url.pathname === "/api/next") {
      const state = await env.KV.get(heroKey, { type: "json" });
      if (state) {
        state.currentIndex = (state.currentIndex + 1) >= state.scenes.length ? 0 : state.currentIndex + 1;
        await env.KV.put(heroKey, JSON.stringify(state), { expirationTtl: 604800 });
        return new Response(JSON.stringify({ index: state.currentIndex, desc: state.scenes[state.currentIndex] }));
      }
      return new Response("Error", { status: 500 });
    }

    return new Response(renderSetup(), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
  }
};

/**
 * Story Engine: Gemma 3 12B via Gemini API
 */
async function generateStoryWithGemma3(env, hero) {
  const model = "gemma-3-12b-it";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  
  const promptText = `Task: Write a children's story about ${hero} for a 2yo.
  
  Format: Exactly 15 plain text lines. No intro, no outro, no numbers.
  
  Physical Anchor: A 3-5 descriptive words of the ${hero} including ${hero}.
  
  Constraint: Every line MUST start with this Anchor. Every line MUST be a different action. Every line shall be around 20 words.
  
  Progression: Start adventure, meet friends, solve a tiny problem.
  
  Context: each line will be used independently for generating scene image display on black and white kindle for kids to read.`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { temperature: 0.8 }
    })
  });

  const data = await response.json();
  const rawText = data.candidates[0].content.parts[0].text;
  
  // Requirement: Backend log raw response for AI debug
  console.log(`[ByteKindle AI Response]: ${rawText}`);

  const lines = rawText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 15 && !line.includes('{') && !line.includes('**'));
  
  return lines.slice(0, 15);
}

/**
 * Image Engine: SDXL Base 1.0 (Kindle Optimized)
 */
async function generateSceneImage(env, currentScene) {
  const inputs = {
    prompt: `${currentScene}. High-contrast black and white charcoal sketch, bold thick outlines, minimalist white background, children's storybook style, e-ink screen optimized, sharp lines.`,
    num_steps: 20, // Max steps for SDXL-Base on Workers
    guidance: 8.5
  };

  const image = await env.AI.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", inputs);
  return new Response(image, { headers: { "Content-Type": "image/png" } });
}

/**
 * UI: Viewer Page
 */
function renderSeamlessViewer(hero, state) {
  const total = state.scenes.length;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #fff; font-family: Arial, sans-serif; position: fixed; }
    #view-wrapper { width: 100%; position: absolute; top: 0; left: 0; }
    .nav { width: 100%; border-bottom: 3px solid #000; height: 110px; display: table; table-layout: fixed; }
    .cell { display: table-cell; vertical-align: middle; text-align: center; overflow: hidden; }
    .info-box { text-align: left; padding-left: 15px; }
    #scene-num { font-size: 14px; display: block; color: #444; }
    #scene-desc { font-size: 16px; font-weight: bold; line-height: 1.2; display: block; height: 44px; overflow: hidden; }
    .btn { text-decoration: none; color: #000; font-weight: bold; font-size: 24px; display: block; line-height: 110px; }
    .btn-next { background: #000; color: #fff; }
    #main-img { width: 100% !important; height: auto !important; display: block; border: 0; }
  </style>
  <script>
    document.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });
    function nextScene() {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/next?hero=${encodeURIComponent(hero)}', true);
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4 && xhr.status == 200) {
          var data = JSON.parse(xhr.responseText);
          document.getElementById('main-img').src = '/api/image.png?hero=${encodeURIComponent(hero)}&index=' + data.index + '&t=' + new Date().getTime();
          document.getElementById('scene-num').innerHTML = 'Scene ' + (data.index + 1) + '/' + ${total};
          document.getElementById('scene-desc').innerHTML = data.desc;
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
        <div class="cell" style="width:120px; border-left: 3px solid #000; border-right: 3px solid #000;">
          <a href="javascript:void(0)" onclick="nextScene()" class="btn btn-next">NEXT</a>
        </div>
        <div class="cell" style="width:100px;"><a href="/" class="btn">HOME</a></div>
      </div>
      <img id="main-img" src="/api/image.png?hero=${encodeURIComponent(hero)}&index=${state.currentIndex}">
    </div>
  </body></html>`;
}

/**
 * UI: Setup Page (Keyboard Optimized)
 */
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
      <form method="GET" action="/start">
        <input type="text" name="hero" placeholder="Brave Bee" required autofocus>
        <button type="submit">GO</button>
      </form>
    </div>
  </body></html>`;
}
