// =========================================================
// 1. CONFIGURATION
// =========================================================

// ⚠️ Ensure your API key is correct
const EMBEDDED_API_KEY = "plln_sk_U8UNH5IInwBGiLbBBQxiiKaYXTW5DMA1"; 

const TEXT_API_URL = "https://gen.pollinations.ai/v1/chat/completions";
const IMAGE_API_BASE = "https://gen.pollinations.ai/image/"; 
const MODELS_URL = "https://gen.pollinations.ai/image/models";

// Global State
let characters = [];
let bgImageUrl = null;
let styleImageUrl = null;

// =========================================================
// 2. INITIALIZATION
// =========================================================

window.onload = async function() {
    loadSettings();
    await fetchModels();
    
    // Auto-generate visual previews on load if text exists
    if(document.getElementById('styleInput') && document.getElementById('styleInput').value) {
        generateStylePreview();
    }
    if(document.getElementById('bgInput') && document.getElementById('bgInput').value) {
        generateBackgroundImage();
    }

    // Trigger reload of all character images immediately
    characters.forEach(c => generateCharacterImage(c.id));
};

async function fetchModels() {
    const select = document.getElementById('modelSelect');
    if(!select) return; 
    
    try {
        const res = await fetch(MODELS_URL);
        if(res.ok) {
            const models = await res.json();
            select.innerHTML = ''; 
            models.forEach(m => {
                const modelName = typeof m === 'string' ? m : m.name;
                const opt = document.createElement('option');
                opt.value = modelName;
                opt.text = modelName;
                if(modelName === 'zimage') opt.selected = true;
                select.appendChild(opt);
            });
        }
    } catch(e) {
        select.innerHTML = '<option value="flux">flux</option><option value="turbo">turbo</option>';
    }
}

// =========================================================
// 3. CORE LOGIC
// =========================================================

async function generateQuickImageBlob(prompt, width, height) {
    // Use the specific Global Seed instead of random
    let seed = document.getElementById('imgSeed').value;
    seed = seed ? parseInt(seed) : Math.floor(Math.random() * 1000000);

    const encoded = encodeURIComponent(prompt);
    const url = `${IMAGE_API_BASE}${encoded}?width=${width}&height=${height}&seed=${seed}&model=zimage&enhance=false&negative_prompt=worst+quality%2C+blurry&private=true&nologo=true&nofeed=true&safe=false&quality=high&image=&transparent=false&guidance_scale=1`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${EMBEDDED_API_KEY}` } });
    if(!res.ok) throw new Error("API Error");
    return await res.blob();
}

// --- STEP 1: Generate Text Prompt ---
async function generatePrompt() {
    const btn = document.getElementById('generatePromptBtn');
    const outputBox = document.getElementById('promptOutput');

    const style = document.getElementById('styleInput').value || "Cinematic";
    const bg = document.getElementById('bgInput').value || "White void";
    const action = document.getElementById('actionInput').value || "A person standing";
    const chars = getSelectedCharactersString();

    if(!action) return alert("Please enter an action!");

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
Output Format: Provide ONLY the final generated prompt. Do not add conversational filler.   `;
        
        const userMessage = `
        Visual Style: ${style}
        Characters Master List: ${chars}
        Background Description: ${bg}
        Action Scenario: ${action}
        `;

        const response = await fetch(TEXT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${EMBEDDED_API_KEY}` },
            body: JSON.stringify({ 
                model: 'gemini-search', 
                messages: [
                    { role: 'system', content: systemPrompt }, 
                    { role: 'user', content: userMessage } 
                ] 
            })
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
    const btn = document.getElementById('renderImagesBtn');
    const prompt = document.getElementById('promptOutput').value.trim();
    const grid = document.getElementById('imageGrid');

    if(!prompt || prompt.startsWith("Error") || prompt.startsWith("Synthesizing")) return;

    const count = parseInt(document.getElementById('imgCount').value) || 4;
    const width = document.getElementById('imgWidth').value || 1920;
    const height = document.getElementById('imgHeight').value || 1080;
    const model = document.getElementById('modelSelect').value || 'zimage';
    
    // Main render uses seed + index, but starts from the input value
    let baseSeed = document.getElementById('imgSeed').value;
    if(!baseSeed) baseSeed = Math.floor(Math.random() * 1000000);
    baseSeed = parseInt(baseSeed);

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `RENDERING...`;
    grid.innerHTML = ''; 

    for(let i=0; i<count; i++) {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.id = `img-card-${i}`;
        card.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%"><div class="loading-spinner"></div></div>`;
        grid.appendChild(card);
    }

    const promises = [];
    for(let i=0; i<count; i++) {
        const seed = baseSeed + i; 
        promises.push(fetchSingleImage(prompt, seed, width, height, model, i));
    }
    await Promise.all(promises);

    btn.disabled = false;
    btn.innerHTML = originalText;
}

// UPDATED FUNCTION
async function fetchSingleImage(prompt, seed, width, height, model, index) {
    const card = document.getElementById(`img-card-${index}`);
    try {
        const encoded = encodeURIComponent(prompt);
        const url = `${IMAGE_API_BASE}${encoded}?width=${width}&height=${height}&seed=${seed}&model=${model}&enhance=false&negative_prompt=worst+quality%2C+blurry&private=true&nologo=true&nofeed=true&safe=false&quality=high&image=&transparent=false&guidance_scale=1&aspectRatio=16:9`;
        
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${EMBEDDED_API_KEY}` } });
        if(!res.ok) throw new Error("API Error");

        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);

        // Create safe filename from prompt + index (1-based)
        const safePrompt = prompt.replace(/[^a-zA-Z0-9 ,.-]/g, '_').substring(0, 150);
        const fileName = `${safePrompt} - ${index + 1}.png`;

        // Inject image and download button
        card.innerHTML = `
            <img src="${objUrl}" onclick="window.open('${objUrl}')" style="cursor:zoom-in">
            <a href="${objUrl}" download="${fileName}" class="btn-download-img" title="Download Image ${index + 1}">
                <span class="material-icons-round" style="font-size: 20px;">download</span>
            </a>
        `;

    } catch(e) {
        card.innerHTML = `<span style="color:red; font-size:0.8rem;">Failed</span>`;
    }
}

// =========================================================
// 4. AUTO-GENERATION ASSETS
// =========================================================

// New function to update everything when seed changes
function refreshAllPreviews() {
    if(document.getElementById('styleInput').value) generateStylePreview();
    if(document.getElementById('bgInput').value) generateBackgroundImage();
    characters.forEach(c => generateCharacterImage(c.id));
}

async function generateStylePreview() {
    const styleDesc = document.getElementById('styleInput').value;
    const container = document.getElementById('styleImageContainer');
    if(!styleDesc) return;
    container.innerHTML = `<div class="loading-spinner small"></div>`;
    try {
        const blob = await generateQuickImageBlob(`Mountains and river art: ${styleDesc}`, 512, 256);
        styleImageUrl = URL.createObjectURL(blob);
        container.innerHTML = `<img src="${styleImageUrl}">`;
    } catch(e) { container.innerHTML = 'Error'; }
    saveSettings();
}

async function generateBackgroundImage() {
    const bgDesc = document.getElementById('bgInput').value;
    const styleDesc = document.getElementById('styleInput').value;
    const container = document.getElementById('bgImageContainer');
    if(!bgDesc) return;
    container.innerHTML = `<div class="loading-spinner small"></div>`;
    try {
        const blob = await generateQuickImageBlob(`Environment: ${bgDesc}, ${styleDesc}`, 512, 256);
        bgImageUrl = URL.createObjectURL(blob);
        container.innerHTML = `<img src="${bgImageUrl}">`;
    } catch(e) { container.innerHTML = 'Error'; }
    saveSettings();
}

function addCharacter() {
    const nameInput = document.getElementById('newCharName');
    const descInput = document.getElementById('newCharDesc');

    const name = nameInput.value.trim();
    const desc = descInput.value.trim();

    if (!name || !desc) return alert("Name & Description required");
    
    // Create char, selected by default, loading state
    characters.push({ id: Date.now(), name, desc, selected: true, imageUrl: null, loading: true });
    
    nameInput.value = '';
    descInput.value = '';
    renderCharacters();
    // Auto trigger generation
    generateCharacterImage(characters[characters.length-1].id);
    saveSettings();
}

async function generateCharacterImage(id, event = null) {
    if(event) event.stopPropagation();
    const charIndex = characters.findIndex(c => c.id === id);
    if (charIndex === -1) return;
    const char = characters[charIndex];
    const styleDesc = document.getElementById('styleInput').value;
    // Set loading
    characters[charIndex].loading = true;
    renderCharacters();

    try {
        // Will now use Global Seed via generateQuickImageBlob
        const blob = await generateQuickImageBlob(`Portrait of ${char.name}, ${char.desc}. Neutral background. ${styleDesc}`, 256, 256);
        characters[charIndex].imageUrl = URL.createObjectURL(blob);
    } catch (e) { console.error(e); } 
    finally {
        characters[charIndex].loading = false;
        renderCharacters();
    }
}

// =========================================================
// 5. UTILS & RENDERERS
// =========================================================

function removeCharacter(id) {
    characters = characters.filter(c => c.id !== id);
    saveSettings();
    renderCharacters();
}

// CLICK SELECTION LOGIC
function toggleSelection(id) {
    const c = characters.find(x => x.id === id);
    if(c) { c.selected = !c.selected; saveSettings(); renderCharacters(); }
}

function toggleCharDesc(id, event) {
    if(event) event.stopPropagation();
    const box = document.getElementById(`desc-box-${id}`);
    if(box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

function renderCharacters() {
    const container = document.getElementById('characterListContainer');
    container.innerHTML = '';
    characters.forEach(c => {
        const div = document.createElement('createElement');
        div.className = `char-item ${c.selected ? 'selected' : ''}`;
        
        // CLICK HANDLER: Select row (ignore buttons)
        div.onclick = (e) => { 
            if(!e.target.closest('button') && !e.target.closest('input')) toggleSelection(c.id); 
        };

        let imageHtml = c.loading 
            ? `<div class="char-thumb-wrapper"><div class="loading-spinner small"></div></div>`
            : (c.imageUrl ? `<div class="char-thumb-wrapper"><img src="${c.imageUrl}" class="char-thumb"></div>` 
            : `<div class="char-thumb-wrapper"><div class="char-thumb-placeholder">No Img</div></div>`);

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
    const s = characters.filter(c => c.selected);
    return s.length ? s.map(c => `${c.name}: ${c.desc}`).join(' | ') : "None";
}

function saveSettings() {
    if(document.getElementById('styleInput'))
        localStorage.setItem('vsc_style', document.getElementById('styleInput').value);
    
    if(document.getElementById('bgInput'))
        localStorage.setItem('vsc_bg', document.getElementById('bgInput').value);
    
    const cleanChars = characters.map(({ imageUrl, loading, ...keepAttrs }) => keepAttrs);
    localStorage.setItem('vsc_chars', JSON.stringify(cleanChars));
}

function loadSettings() {
    if(document.getElementById('styleInput'))
        document.getElementById('styleInput').value = localStorage.getItem('vsc_style') || '';
    
    if(document.getElementById('bgInput'))
        document.getElementById('bgInput').value = localStorage.getItem('vsc_bg') || '';
    
    const savedChars = localStorage.getItem('vsc_chars');
    if(savedChars) { 
        characters = JSON.parse(savedChars).map(c => ({...c, imageUrl: null, loading: false})); 
        renderCharacters(); 
    }
}