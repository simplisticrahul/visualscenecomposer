// =========================================================
// 1. CONFIGURATION
// =========================================================

// ⚠️ NOTE: Client-side keys are visible in DevTools.
const EMBEDDED_API_KEY = "plln_sk_U8UNH5IInwBGiLbBBQxiiKaYXTW5DMA1";

const TEXT_API_URL = "https://gen.pollinations.ai/v1/chat/completions";
const IMAGE_API_BASE = "https://gen.pollinations.ai/image/";
const MODELS_URL = "https://gen.pollinations.ai/image/models";

// Global State
let characters = [];
let bgImageUrl = null;
let styleImageUrl = null;

// Model preference (defaults to zimage)
let preferredModel = "zimage";

// Mobile drawer closer (set by drawer init)
let closeMobileDrawer = null;

// =========================================================
// 2. INITIALIZATION
// =========================================================

window.onload = async function () {
  loadSettings();
  await fetchModels();

  const modelSelect = document.getElementById("modelSelect");
  if (modelSelect) modelSelect.addEventListener("change", handleModelChange);

  // Auto-generate visual previews on load if text exists
  if (document.getElementById("styleInput") && document.getElementById("styleInput").value) {
    generateStylePreview();
  }
  if (document.getElementById("bgInput") && document.getElementById("bgInput").value) {
    generateBackgroundImage();
  }

  // Trigger reload of all character images immediately
  characters.forEach((c) => generateCharacterImage(c.id));
};

async function fetchModels() {
  const select = document.getElementById("modelSelect");
  if (!select) return;

  try {
    const res = await fetch(MODELS_URL);
    if (res.ok) {
      const models = await res.json();
      select.innerHTML = "";

      models.forEach((m) => {
        const modelName = typeof m === "string" ? m : m.name;
        const opt = document.createElement("option");
        opt.value = modelName;
        opt.text = modelName;
        select.appendChild(opt);
      });

      // Prefer saved model; otherwise default to zimage
      const desired = preferredModel || "zimage";
      if ([...select.options].some((o) => o.value === desired)) {
        select.value = desired;
      } else if ([...select.options].some((o) => o.value === "zimage")) {
        select.value = "zimage";
      } else {
        select.selectedIndex = 0;
      }

      return;
    }
  } catch (e) {
    // fall through to fallback options
  }

  // fallback
  select.innerHTML =
    '<option value="zimage">zimage</option><option value="flux">flux</option><option value="turbo">turbo</option>';
  select.value = "zimage";
}

// =========================================================
// 3. CORE LOGIC
// =========================================================

function isMobileView() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function getSelectedModel() {
  const sel = document.getElementById("modelSelect");
  return sel && sel.value ? sel.value : "zimage";
}

async function generateQuickImageBlob(prompt, width, height) {
  let seed = document.getElementById("imgSeed")?.value;
  seed = seed ? parseInt(seed) : Math.floor(Math.random() * 1000000);

  // Previews now follow dropdown model
  const model = getSelectedModel();

  const encoded = encodeURIComponent(prompt);
  const url = `${IMAGE_API_BASE}${encoded}?width=${width}&height=${height}&seed=${seed}&model=${model}&enhance=false&negative_prompt=worst+quality%20+blurry&private=true&nologo=true&nofeed=true&safe=false&quality=high&image=&transparent=false&guidance_scale=1`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${EMBEDDED_API_KEY}` } });
  if (!res.ok) throw new Error("API Error");
  return await res.blob();
}

function handleModelChange() {
  // Persist selected model + refresh previews
  preferredModel = getSelectedModel();
  localStorage.setItem("vsc_model", preferredModel);

  refreshAllPreviews();

  // Close drawer only on mobile
  closeMobileDrawer?.();
}

// --- STEP 1: Generate Text Prompt ---
async function generatePrompt() {
  const btn = document.getElementById("generatePromptBtn");
  const outputBox = document.getElementById("promptOutput");

  const style = document.getElementById("styleInput").value || "Cinematic";
  const bg = document.getElementById("bgInput").value || "White void";
  const action = document.getElementById("actionInput").value || "A person standing";
  const chars = getSelectedCharactersString();

  if (!action) return alert("Please enter an action!");

  btn.disabled = true;
  const originalContent = btn.innerHTML;
  btn.innerHTML = `<div class="loading-spinner small"></div>`;
  outputBox.value = "Synthesizing prompt with AI...";

  try {
    const systemPrompt = `
You are an advanced Visual Scene Composer AI. Your task is to synthesize multiple disjointed data sources into a single, cohesive, and highly descriptive image generation prompt. You act as the bridge between a screenplay action and a generative image model (like Midjourney or Stable Diffusion).
Input Data Structure: You will receive four distinct blocks of information:
Visual Style: The global artistic direction (e.g., lighting, texture, art style).
Master Characters List: A dictionary of characters containing their fixed physical attributes, age, clothing, and specific visual traits.
Background Description: A static description of the environment.
Action Scenario: The specific action, camera angle, and narrative movement occurring in the scene.

Processing Logic (Step-by-Step):
Analyze the User Prompt: Identify the Subjects (Characters), the Action (what they are doing), the Camera/Framing (e.g., Medium shot, Over-the-shoulder), and any specific Lighting/Atmosphere mentioned.
Retrieve & Enrich:
For every character mentioned in the User Prompt, look up their entry in Master Characters List.
Extract their specific visual details (Age, Skin Tone, Hair Style/Color, Eye Color, Clothing) Except backround.
Crucial: Do not mention characters from the Master List if they are not present in the Action Scenario.
Integrate Setting: Incorporate details from the Background description, blending them naturally with where the characters are standing.
Construct Final Output: Assemble the prompt in the following logical order for optimal image generation:

[Visual Style tags]
[Camera Angle/Shot Type] + [Brief Scene Summary]
[Primary Character Details] (Name + Age + Physical Traits + Clothing) + [Primary Character Action]
[Setting/Background Context] (blended with the action)
[Secondary Character Details] (if applicable) + [Secondary Character Action]
Rules & Constraints:
Consistency: You must strictly adhere to the physical descriptions in the Master Characters List unless the Prompt Given By User explicitly overrides a feature (e.g., "Aarav changes into a suit"). If no change is specified, use the Master Character List clothing but never ever use background from Master design.
Don't repeat character unnecessarily.
Flow: The final output must read as a continuous, descriptive paragraph, not a list.
Tone: Maintain the mood specified in the Visual Style.
Output Format: Provide ONLY the final generated prompt. Do not add conversational filler.`;

    const userMessage = `
Visual Style: ${style}
Characters Master List: ${chars}
Background Description: ${bg}
Action Scenario: ${action}
`;

    const response = await fetch(TEXT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${EMBEDDED_API_KEY}` },
      body: JSON.stringify({
        model: "gemini-fast",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) throw new Error(await response.text());

    const json = await response.json();
    const generatedText = json.choices[0].message.content;

    outputBox.value = generatedText;

    // Auto-trigger Step 2
    renderImages();
  } catch (error) {
    console.error(error);
    outputBox.value = "Error: " + error.message;
    alert("Error generating prompt: " + error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalContent;
  }
}

// --- STEP 2: Render Images ---
async function renderImages() {
  const btn = document.getElementById("renderImagesBtn");
  const prompt = document.getElementById("promptOutput").value.trim();
  const grid = document.getElementById("imageGrid");

  if (!prompt || prompt.startsWith("Error") || prompt.startsWith("Synthesizing")) return;

  const count = parseInt(document.getElementById("imgCount").value) || 4;
  const width = document.getElementById("imgWidth").value || 1920;
  const height = document.getElementById("imgHeight").value || 1080;
  const model = getSelectedModel();

  let baseSeed = document.getElementById("imgSeed").value;
  if (!baseSeed) baseSeed = Math.floor(Math.random() * 1000000);
  baseSeed = parseInt(baseSeed);

  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = `RENDERING...`;
  grid.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "image-card";
    card.id = `img-card-${i}`;
    card.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%"><div class="loading-spinner"></div></div>`;
    grid.appendChild(card);
  }

  const promises = [];
  for (let i = 0; i < count; i++) {
    const seed = baseSeed + i;
    promises.push(fetchSingleImage(prompt, seed, width, height, model, i));
  }
  await Promise.all(promises);

  btn.disabled = false;
  btn.innerHTML = originalText;
}

async function fetchSingleImage(prompt, seed, width, height, model, index) {
  const card = document.getElementById(`img-card-${index}`);
  try {
    const encoded = encodeURIComponent(prompt);
    const url = `${IMAGE_API_BASE}${encoded}?width=${width}&height=${height}&seed=${seed}&model=${model}&enhance=false&negative_prompt=worst+quality%20+blurry&private=true&nologo=true&nofeed=true&safe=false&quality=high&image=&transparent=false&guidance_scale=1&aspectRatio=16:9`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${EMBEDDED_API_KEY}` } });
    if (!res.ok) throw new Error("API Error");

    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);

    const safePrompt = prompt.replace(/[^a-zA-Z0-9 ,.-]/g, "_").substring(0, 150);
    const fileName = `${safePrompt} - ${index + 1}.png`;

    card.innerHTML = `
      <img src="${objUrl}" onclick="window.open('${objUrl}')" style="cursor:zoom-in">
      <a href="${objUrl}" download="${fileName}" class="btn-download-img" title="Download Image ${index + 1}">
        <span class="material-icons-round" style="font-size: 20px;">download</span>
      </a>
    `;
  } catch (e) {
    card.innerHTML = `<span style="color:red; font-size:0.8rem;">Failed</span>`;
  }
}

// =========================================================
// 4. AUTO-GENERATION ASSETS
// =========================================================

function refreshAllPreviews() {
  if (document.getElementById("styleInput").value) generateStylePreview();
  if (document.getElementById("bgInput").value) generateBackgroundImage();
  characters.forEach((c) => generateCharacterImage(c.id));
}

async function generateStylePreview() {
  const styleDesc = document.getElementById("styleInput").value;
  const container = document.getElementById("styleImageContainer");
  if (!styleDesc) return;
  container.innerHTML = `<div class="loading-spinner small"></div>`;
  try {
    const blob = await generateQuickImageBlob(`Mountains and river art: ${styleDesc}`, 512, 288);
    styleImageUrl = URL.createObjectURL(blob);
    container.innerHTML = `<img src="${styleImageUrl}">`;
  } catch (e) {
    container.innerHTML = "Error";
  }
  saveSettings();
}

async function generateBackgroundImage() {
  const bgDesc = document.getElementById("bgInput").value;
  const styleDesc = document.getElementById("styleInput").value;
  const container = document.getElementById("bgImageContainer");
  if (!bgDesc) return;
  container.innerHTML = `<div class="loading-spinner small"></div>`;
  try {
    const blob = await generateQuickImageBlob(`Environment: ${bgDesc}, ${styleDesc}`, 512, 288);
    bgImageUrl = URL.createObjectURL(blob);
    container.innerHTML = `<img src="${bgImageUrl}">`;
  } catch (e) {
    container.innerHTML = "Error";
  }
  saveSettings();
}

function addCharacter() {
  const nameInput = document.getElementById("newCharName");
  const descInput = document.getElementById("newCharDesc");

  const name = nameInput.value.trim();
  const desc = descInput.value.trim();

  if (!name || !desc) return alert("Name & Description required");

  characters.push({ id: Date.now(), name, desc, selected: true, imageUrl: null, loading: true });

  nameInput.value = "";
  descInput.value = "";
  renderCharacters();

  generateCharacterImage(characters[characters.length - 1].id);
  saveSettings();
}

async function generateCharacterImage(id, event = null) {
  if (event) event.stopPropagation();

  const charIndex = characters.findIndex((c) => c.id === id);
  if (charIndex === -1) return;

  const char = characters[charIndex];
  const styleDesc = document.getElementById("styleInput").value;

  characters[charIndex].loading = true;
  renderCharacters();

  try {
    const blob = await generateQuickImageBlob(
      `Portrait of ${char.name}, ${char.desc}. Neutral background. ${styleDesc}`,
      256,
      256
    );
    characters[charIndex].imageUrl = URL.createObjectURL(blob);
  } catch (e) {
    console.error(e);
  } finally {
    characters[charIndex].loading = false;
    renderCharacters();
  }
}

// =========================================================
// 5. UTILS & RENDERERS
// =========================================================

function removeCharacter(id) {
  characters = characters.filter((c) => c.id !== id);
  saveSettings();
  renderCharacters();
}

function toggleSelection(id) {
  const c = characters.find((x) => x.id === id);
  if (c) {
    c.selected = !c.selected;
    saveSettings();
    renderCharacters();
  }
}

function toggleCharDesc(id, event) {
  if (event) event.stopPropagation();
  const box = document.getElementById(`desc-box-${id}`);
  if (box) box.style.display = box.style.display === "none" ? "block" : "none";
}

function renderCharacters() {
  const container = document.getElementById("characterListContainer");
  container.innerHTML = "";

  characters.forEach((c) => {
    const div = document.createElement("div"); // FIXED
    div.className = `char-item ${c.selected ? "selected" : ""}`;

    div.onclick = (e) => {
      if (!e.target.closest("button") && !e.target.closest("input")) toggleSelection(c.id);
    };

    const imageHtml = c.loading
      ? `<div class="char-thumb-wrapper"><div class="loading-spinner small"></div></div>`
      : c.imageUrl
      ? `<div class="char-thumb-wrapper"><img src="${c.imageUrl}" class="char-thumb"></div>`
      : `<div class="char-thumb-wrapper"><div class="char-thumb-placeholder">No Img</div></div>`;

    div.innerHTML = `
      <div class="char-top-row">
        <div class="status-dot"></div>
        ${imageHtml}
        <span class="char-name">${c.name}</span>
        <div style="flex-grow:1"></div>

        <button class="btn-toggle-info" title="View Description" onclick="toggleCharDesc(${c.id}, event)" style="margin-right:5px">i</button>

        <button class="btn-gen-char" title="Regenerate Image" onclick="generateCharacterImage(${c.id}, event)">
          <span class="material-icons-round" style="font-size:14px">refresh</span>
        </button>

        <button class="btn-delete" title="Remove" onclick="removeCharacter(${c.id})">&times;</button>
      </div>

      <div id="desc-box-${c.id}" class="char-desc-box" onclick="event.stopPropagation()">
        ${c.desc}
      </div>
    `;

    container.appendChild(div);
  });
}

function getSelectedCharactersString() {
  const s = characters.filter((c) => c.selected);
  return s.length ? s.map((c) => `${c.name}: ${c.desc}`).join(" | ") : "None";
}

function saveSettings() {
  if (document.getElementById("styleInput"))
    localStorage.setItem("vsc_style", document.getElementById("styleInput").value);

  if (document.getElementById("bgInput"))
    localStorage.setItem("vsc_bg", document.getElementById("bgInput").value);

  const model = document.getElementById("modelSelect")?.value;
  if (model) localStorage.setItem("vsc_model", model);

  const cleanChars = characters.map(({ imageUrl, loading, ...keepAttrs }) => keepAttrs);
  localStorage.setItem("vsc_chars", JSON.stringify(cleanChars));
}

function loadSettings() {
  preferredModel = localStorage.getItem("vsc_model") || "zimage";

  if (document.getElementById("styleInput"))
    document.getElementById("styleInput").value = localStorage.getItem("vsc_style") || "";

  if (document.getElementById("bgInput"))
    document.getElementById("bgInput").value = localStorage.getItem("vsc_bg") || "";

  const savedChars = localStorage.getItem("vsc_chars");
  if (savedChars) {
    characters = JSON.parse(savedChars).map((c) => ({ ...c, imageUrl: null, loading: false }));
    renderCharacters();
  }
}

// =========================================================
// 6. SIDEBAR TOGGLE
// - Mobile: drawer open/close (sidebar-open)
// - Desktop: collapse/expand (sidebar-collapsed)
// =========================================================

(function initSidebarToggle() {
  const layout = document.querySelector(".whisk-layout");
  const sidebar = document.querySelector(".sidebar");
  const btn = document.getElementById("mobileMenuBtn");
  const backdrop = document.querySelector(".sidebar-backdrop");
  if (!layout || !sidebar || !btn || !backdrop) return;

  const closeDrawerOnly = () => {
    if (isMobileView()) layout.classList.remove("sidebar-open");
  };

  closeMobileDrawer = closeDrawerOnly;

  btn.addEventListener("click", () => {
    // Mobile: drawer. Desktop: collapse.
    if (isMobileView()) {
      layout.classList.toggle("sidebar-open");
    } else {
      layout.classList.toggle("sidebar-collapsed");
    }
  });

  // Backdrop closes only the mobile drawer
  backdrop.addEventListener("click", closeDrawerOnly);

  // Auto-close drawer on non-text changes in sidebar (mobile only)
  sidebar.addEventListener("change", (e) => {
    const t = e.target;
    if (!t) return;

    const tag = t.tagName;
    const type = (t.getAttribute("type") || "").toLowerCase();

    const isTextLike =
      tag === "TEXTAREA" || (tag === "INPUT" && (type === "text" || type === "search"));

    if (!isTextLike) closeDrawerOnly();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      layout.classList.remove("sidebar-open");
    }
  });

  // When switching to desktop, ensure drawer state is cleared
  const mq = window.matchMedia("(min-width: 901px)");
  mq.addEventListener("change", () => {
    if (mq.matches) layout.classList.remove("sidebar-open");
  });
})();