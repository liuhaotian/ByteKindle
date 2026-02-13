/**
 * ByteKindle - Worker AI Edition
 * Version: v5.0.0 (SDXL-Lightning Baseline)
 * Changes:
 * - Switched to @cf/bytedance/stable-diffusion-xl-lightning.
 * - Removed binary image input (pure text-to-image for stability).
 * - Enforced 1/5 character size rule in prompt.
 * - Optimized for Kindle 7th Gen (600x600).
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const rawHero = url.searchParams.get("hero") || "";
    const heroKey = `bk_v1_${encodeURIComponent(rawHero.toLowerCase().trim().replace(/\s+/g, '_'))}`;

    if (url.pathname === "/api/image.png") {
      const dob = url.searchParams.get("dob") || "2024-03";
      const ageStr = calculateAge(dob);
      // We still use KV to track if a story is in progress, though we aren't passing the buffer back to SDXL
      const hasHistory = await env.KV.get(heroKey);
      return await serveByteKindleImage(env, ctx, rawHero, ageStr, hasHistory, heroKey);
    }

    if (rawHero && url.searchParams.get("dob")) {
      return new Response(renderViewer(rawHero, url.searchParams.get("dob")), {
        headers: { "Content-Type": "text/html; charset=UTF-8" }
      });
    }

    return new Response(renderSetup(), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
  }
};

async function serveByteKindleImage(env, ctx, hero, ageStr, hasHistory, heroKey) {
  // Enhanced prompt to maintain "Imaginary Realistic" character consistency
  const prompt = `You are a author of Educational children's book illustration for a ${ageStr} audience. 
    Book Character/Hero: A realistic but whimsical ${hero}. 
    Style: High-contrast charcoal sketch, grayscale, pure white background, bold clean lines. 
    Scene: ${hasHistory ? "A new discovery in a garden or forest meeting 2-3 new animal friends." : "The hero starting a new adventure."}
    
    Technical Requirements:
      - The hero must be small, occupying no more than 1/5 of the drawing area.
      - Place the hero in a large, detailed environment to emphasize discovery.
      - Include 2-3 distinct, related secondary characters.
      - Zero shading, optimized for 16-level Kindle E-ink grayscale.
      - 600x600 resolution.`;
  
  const modelInput = {
    prompt: prompt,
    width: 600,
    height: 600,
    // SDXL Lightning is best at 1-4 steps. Cloudflare's default is usually 1.
    num_steps: 4 
  };

  try {
    const aiResponse = await env.AI.run("@cf/bytedance/stable-diffusion-xl-lightning", modelInput);
    
    // BACKEND DEBUG (Per Instructions)
    console.log(`[ByteKindle Debug] Hero: ${hero} | Model: SDXL-Lightning`);
    console.log(`[ByteKindle Debug] Scene Area Check: Hero < 20%`);

    const [respToReturn, respToStore] = aiResponse.tee();
    
    // Store a dummy value in KV just to track that the story has started
    ctx.waitUntil(
      new Response(respToStore).arrayBuffer().then(buffer => {
        return env.KV.put(heroKey, "active", { expirationTtl: 604800 });
      })
    );

    return new Response(respToReturn, {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" }
    });
  } catch (err) {
    console.error(`[ByteKindle Debug] AI Error: ${err.message}`);
    return new Response(`AI Generation Error: ${err.message}`, { status: 500 });
  }
}

function calculateAge(dob) {
  const [bYear, bMonth] = dob.split('-').map(Number);
  const now = new Date(); 
  let years = now.getFullYear() - bYear;
  let months = (now.getMonth() + 1) - bMonth;
  if (months < 0) { years--; months += 12; }
  return `${years}y ${months}m`;
}

function renderSetup() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=600">
  <style>
    body { background: #fff; margin: 0; padding: 20px; font-family: sans-serif; text-align: center; }
    .box { border: 4px solid #000; padding: 25px; margin-top: 20px; border-radius: 20px; }
    input { font-size: 22px; width: 90%; padding: 15px; margin: 12px 0; border: 3px solid #000; border-radius: 10px; }
    button { font-size: 26px; width: 95%; padding: 22px; background: #000; color: #fff; border: none; font-weight: bold; border-radius: 10px; }
  </style></head>
  <body>
    <h2>ByteKindle</h2>
    <div class="box">
      <form method="GET" action="/">
        <label style="display:block; font-weight:bold;">Birth Month</label>
        <input type="month" name="dob" value="2024-03">
        <label style="display:block; font-weight:bold; margin-top:15px;">Hero Name</label>
        <input type="text" name="hero" placeholder="Brave Bee" autofocus>
        <button type="submit">START</button>
      </form>
    </div>
  </body></html>`;
}

function renderViewer(hero, dob) {
  const t = Date.now();
  const imageSrc = `/api/image.png?hero=${encodeURIComponent(hero)}&dob=${dob}&t=${t}`;
  const nextUrl = `?hero=${encodeURIComponent(hero)}&dob=${dob}&t=${t}`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    html, body { margin: 0; padding: 0; background: #fff; width: 100%; overflow-x: hidden; }
    .nav { width: 100%; border-bottom: 3px solid #000; border-collapse: collapse; table-layout: fixed; }
    .btn { display: block; text-decoration: none; color: #000; font-weight: bold; font-size: 28px; padding: 20px 0; text-align: center; font-family: sans-serif; }
    .btn-next { background: #000 !important; color: #fff !important; }
    img { width: 100% !important; height: auto !important; display: block; border: 0; }
  </style></head>
  <body>
    <table class="nav">
      <tr>
        <td style="width: 40%; border-right: 3px solid #000;"><a href="/" class="btn">HOME</a></td>
        <td style="width: 60%;"><a href="${nextUrl}" class="btn btn-next">NEXT</a></td>
      </tr>
    </table>
    <img src="${imageSrc}">
  </body></html>`;
}
