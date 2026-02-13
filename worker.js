/**
 * Kindle AI Story Streamer - Worker AI Edition
 * Version: v4.2 (Top Navigation + Full-Width Image)
 * Optimized for Kindle 7th Gen (600px width)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Binary Image Endpoint
    if (url.pathname === "/api/image.png") {
      const hero = url.searchParams.get("hero") || "";
      const action = url.searchParams.get("action") || "";
      return await serveWorkerAiImage(env, hero, action);
    }

    const age = url.searchParams.get("age");
    const hero = url.searchParams.get("hero");
    const action = url.searchParams.get("action") || "starting the adventure";

    if (age && hero) {
      return new Response(renderViewer(age, hero, action), {
        headers: { "Content-Type": "text/html; charset=UTF-8" }
      });
    }

    return new Response(renderSetup(), {
      headers: { "Content-Type": "text/html; charset=UTF-8" }
    });
  }
};

async function serveWorkerAiImage(env, hero, action) {
  const prompt = `Children's book illustration, high-contrast charcoal sketch, grayscale, white background. ${hero} is ${action}. Professional clean line art, no colors.`;
  
  const modelInput = {
    prompt: prompt,
    num_inference_steps: 4, 
    width: 600, 
    height: 600 
  };

  try {
    const response = await env.AI.run("@cf/bytedance/stable-diffusion-xl-lightning", modelInput);
    return new Response(response, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=60" }
    });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}

function renderSetup() {
  const birthDate = new Date('2024-03-01');
  const now = new Date();
  const diffMonths = (now.getFullYear() - birthDate.getFullYear()) * 12 + (now.getMonth() - birthDate.getMonth());
  const defaultAge = diffMonths < 24 ? `${diffMonths} months` : `${Math.floor(diffMonths / 12)} years`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { background: #fff; margin: 0; padding: 20px; font-family: sans-serif; text-align: center; }
    input { font-size: 20px; width: 90%; padding: 10px; margin: 10px 0; border: 2px solid #000; }
    button { font-size: 24px; width: 95%; padding: 15px; background: #000; color: #fff; border: none; font-weight: bold; }
  </style></head>
  <body>
    <h2>Kindle Story AI</h2>
    <form method="GET" action="/">
      <label>Age</label><br><input type="text" name="age" value="${defaultAge}"><br>
      <label>Hero</label><br><input type="text" name="hero" placeholder="A Brave Bee"><br><br>
      <button type="submit">START</button>
    </form>
  </body></html>`;
}

function renderViewer(age, hero, currentAction) {
  const imageSrc = `/api/image.png?hero=${encodeURIComponent(hero)}&action=${encodeURIComponent(currentAction)}`;
  const actions = ["jumping", "eating", "sleeping", "finding a friend", "exploring"];
  const nextAction = actions[Math.floor(Math.random() * actions.length)];
  const nextUrl = `?age=${encodeURIComponent(age)}&hero=${encodeURIComponent(hero)}&action=${encodeURIComponent(nextAction)}`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    html, body { 
      margin: 0; padding: 0; background: #fff; 
      overflow: hidden; width: 100%; 
      font-family: sans-serif;
    }
    .nav-table { 
      width: 100%; 
      border-bottom: 2px solid #000; 
      table-layout: fixed;
      border-collapse: collapse;
    }
    .btn { 
      display: block; text-decoration: none; color: #000; 
      font-weight: bold; font-size: 24px; padding: 15px 0; 
      background: #fff; text-align: center;
    }
    .btn-next { background: #000 !important; color: #fff !important; }
    img { 
      width: 100%; 
      height: auto; 
      display: block; 
      border: 0;
    }
  </style></head>
  <body>
    <table class="nav-table">
      <tr>
        <td style="border-right: 1px solid #000;"><a href="/" class="btn">HOME</a></td>
        <td><a href="${nextUrl}" class="btn btn-next">NEXT</a></td>
      </tr>
    </table>
    <img src="${imageSrc}">
  </body></html>`;
}
