/**
 * ByteKindle - Worker AI Edition
 * Version: v6.5.0 (Kindle 7th Gen Legacy Fix)
 * Changes:
 * - Loop Logic: Next at end of story resets to Scene 1.
 * - CSS: Forced absolute positioning for edge-to-edge width on NetFront/WebKit.
 * - Compatibility: Replaced remaining modern JS patterns with ES5-friendly logic in the browser.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hero = url.searchParams.get("hero") || "";
    const dob = url.searchParams.get("dob") || "2024-03";
    const heroKey = `bk_v6_${encodeURIComponent(hero.toLowerCase().trim().replace(/\s+/g, '_'))}`;

    if (url.pathname === "/start") {
      const existingStory = await env.KV.get(heroKey);
      if (existingStory) return Response.redirect(`${url.origin}/view?hero=${encodeURIComponent(hero)}`, 302);

      const ageStr = calculateAge(dob);
      const storyJson = await generateStoryPlan(env, hero, ageStr);
      await env.KV.put(heroKey, JSON.stringify({
        scenes: storyJson.scenes,
        currentIndex: 0,
        dob: dob,
        fullStory: storyJson.scenes.join(" -> ")
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
      return await generateSceneImage(env, hero, state.scenes[sceneIndex], state.fullStory, calculateAge(state.dob));
    }

    if (url.pathname === "/api/next") {
      const state = await env.KV.get(heroKey, { type: "json" });
      if (state) {
        // LOOP LOGIC: If at end, go to 0, else increment
        state.currentIndex = (state.currentIndex + 1) >= state.scenes.length ? 0 : state.currentIndex + 1;
        await env.KV.put(heroKey, JSON.stringify(state), { expirationTtl: 604800 });
        return new Response(JSON.stringify({ 
          index: state.currentIndex, 
          desc: state.scenes[state.currentIndex],
          loop: state.currentIndex === 0
        }));
      }
      return new Response("Error", { status: 500 });
    }

    return new Response(renderSetup(), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
  }
};

async function generateStoryPlan(env, hero, ageStr) {
  const prompt = `Children's author for ${ageStr}. Story: ${hero} in a garden. JSON format: {"scenes": ["short action 1", "short action 2", ...]}. 12-15 scenes.`;
  const response = await env.AI.run("@cf/google/gemma-7b-it-lora", { prompt });
  try {
    const text = response.response;
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}') + 1;
    return JSON.parse(text.substring(jsonStart, jsonEnd));
  } catch (e) {
    return { scenes: Array(12).fill(`${hero} is exploring.`) };
  }
}

async function generateSceneImage(env, hero, currentScene, fullStory, ageStr) {
  const prompt = `Children's illustration for ${ageStr}. STORY: ${fullStory}. SCENE: ${currentScene}. Character: realistic ${hero}. High-contrast charcoal sketch, grayscale, white background. Hero is 1/5 of area, 2-3 characters.`;
  const image = await env.AI.run("@cf/bytedance/stable-diffusion-xl-lightning", { prompt, width: 600, height: 600 });
  console.log(`[ByteKindle Debug] Scene for ${hero} rendered.`);
  return new Response(image, { headers: { "Content-Type": "image/png" } });
}

function renderSeamlessViewer(hero, state) {
  const total = state.scenes.length;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* Absolute reset for old Kindle browsers */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #fff; font-family: Arial, sans-serif; }
    
    #view-wrapper { width: 100%; position: absolute; top: 0; left: 0; }
    
    .nav { width: 100%; border-bottom: 3px solid #000; height: 110px; display: table; table-layout: fixed; }
    .cell { display: table-cell; vertical-align: middle; text-align: center; overflow: hidden; }
    .btn { text-decoration: none; color: #000; font-weight: bold; font-size: 26px; display: block; line-height: 110px; }
    
    .info-box { padding: 5px; }
    #scene-num { font-size: 18px; display: block; }
    #scene-desc { font-size: 16px; font-weight: normal; line-height: 1.2; display: block; height: 40px; overflow: hidden; }
    
    /* Force image to fill width precisely */
    #main-img { width: 100% !important; height: auto !important; display: block; border: 0; }
    #buffer-img { display: none; }
  </style>
  <script>
    function nextScene() {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/next?hero=${encodeURIComponent(hero)}', true);
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4 && xhr.status == 200) {
          var data = JSON.parse(xhr.responseText);
          var buffer = document.getElementById('buffer-img');
          // Add timestamp to bypass cache and trigger onload
          buffer.src = '/api/image.png?hero=${encodeURIComponent(hero)}&index=' + data.index + '&t=' + new Date().getTime();
          buffer.onload = function() {
            document.getElementById('main-img').src = buffer.src;
            document.getElementById('scene-num').innerHTML = 'Scene ' + (data.index + 1) + '/' + ${total};
            document.getElementById('scene-desc').innerHTML = data.desc;
          };
        }
      };
      xhr.send();
    }
  </script></head>
  <body>
    <div id="view-wrapper">
      <div class="nav">
        <div class="cell" style="width:110px; border-right: 3px solid #000;"><a href="/" class="btn">HOME</a></div>
        <div class="cell info-box">
          <b id="scene-num">Scene ${state.currentIndex + 1}/${total}</b>
          <span id="scene-desc">${state.scenes[state.currentIndex]}</span>
        </div>
        <div class="cell" style="width:110px; border-left: 3px solid #000;"><a href="javascript:void(0)" onclick="nextScene()" class="btn">NEXT</a></div>
      </div>
      <img id="main-img" src="/api/image.png?hero=${encodeURIComponent(hero)}&index=${state.currentIndex}">
      <img id="buffer-img">
    </div>
  </body></html>`;
}

function calculateAge(dob) {
  const [bYear, bMonth] = dob.split('-').map(Number);
  const now = new Date(); 
  let years = now.getFullYear() - bYear;
  let months = (now.getMonth() + 1) - bMonth;
  if (months < 0) { years--; months += 12; }
  return years + "y " + months + "m";
}

function renderSetup() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { background: #fff; margin: 0; padding: 20px; font-family: sans-serif; text-align: center; }
    .box { border: 4px solid #000; padding: 25px; margin-top: 20px; border-radius: 20px; }
    input { font-size: 22px; width: 90%; padding: 15px; margin: 12px 0; border: 3px solid #000; border-radius: 10px; }
    button { font-size: 26px; width: 95%; padding: 22px; background: #000; color: #fff; border: none; font-weight: bold; border-radius: 10px; }
  </style></head>
  <body>
    <h2>ByteKindle</h2>
    <div class="box">
      <form method="GET" action="/start">
        <label style="font-weight:bold;">Birth Month</label><br>
        <input type="month" name="dob" value="2024-03"><br>
        <label style="font-weight:bold;">Hero Name</label><br>
        <input type="text" name="hero" placeholder="Brave Bee" required><br>
        <button type="submit">GO</button>
      </form>
    </div>
  </body></html>`;
}
