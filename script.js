// =========================================================
// 1. CONFIGURATION
// =========================================================

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
    if(document.getElementById('styleInput').value) generateStylePreview();
    if(document.getElementById('bgInput').value) generateBackgroundImage();
};

async function fetchModels() {
    const select = document.getElementById('modelSelect');
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
                if(modelName === 'flux') opt.selected = true;
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
    const seed = Math.floor(Math.random() * 1000000);
    const encoded = encodeURIComponent(prompt);
    const url = `${IMAGE_API_BASE}${encoded}?width=${width}&height=${height}&seed=${seed}&model=flux&enhance=false&safe=false`;
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
        You are an advanced Visual Scene Composer AI. Your task is to synthesize multiple disjointed data sources into a single, cohesive, and highly descriptive image generation prompt. You act as the bridge between a screenplay action and a generative image model.
Input Data Structure: You will receive four distinct blocks of information: Visual Style, Characters (Master designs), Background, Action.
Processing Logic:
Analyze the Action prompt: Identify Subjects, Action, Camera/Framing.
Retrieve & Enrich: For every character mentioned in the Action, look up their entry in Characters Design. Extract visual details (Age, hair, clothing). Do NOT include characters not present in the action.
Integrate Setting: Blend Background details naturally with the action location.
Construct Final Output order: [Visual Style tags], [Camera Angle/Shot Type] + [Brief Scene Summary], [Primary Character Details & Action], [Setting/Background Context], [Secondary Character Details & Action].
Rules: Strictly adhere to physical descriptions in Master Characters Design unless overridden by the Action prompt. The output must be a continuous, descriptive paragraph.
Output Format: Provide ONLY the final generated prompt.
      
   `;

        const response = await fetch(TEXT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${EMBEDDED_API_KEY}` },
            body: JSON.stringify({ model: 'gemini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }] })
        });

        if (!response.ok) throw new Error(await response.text());
        
        const json = await response.json();
        const generatedText = json.choices[0].message.content;
        
        outputBox.value = generatedText;
        renderImages(); 

    } catch (error) {
        console.error(error);
        outputBox.value = "Error: " + error.message;
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
    const model = document.getElementById('modelSelect').value || 'flux';
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

async function fetchSingleImage(prompt, seed, width, height, model, index) {
    const card = document.getElementById(`img-card-${index}`);
    try {
        const encoded = encodeURIComponent(prompt);
        const url = `${IMAGE_API_BASE}${encoded}?width=${width}&height=${height}&seed=${seed}&model=${model}&enhance=true&nologo=true`;
        
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${EMBEDDED_API_KEY}` } });
        if(!res.ok) throw new Error("API Error");

        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        card.innerHTML = `<img src="${objUrl}" onclick="window.open('${objUrl}')" style="cursor:zoom-in">`;
    } catch(e) {
        card.innerHTML = `<span style="color:red; font-size:0.8rem;">Failed</span>`;
    }
}

// =========================================================
// 4. AUTO-GENERATION ASSETS
// =========================================================

async function generateStylePreview() {
    const styleDesc = document.getElementById('styleInput').value;
    const container = document.getElementById('styleImageContainer');
    if(!styleDesc) return;
    container.innerHTML = `<div class="loading-spinner small"></div>`;
    try {
        const blob = await generateQuickImageBlob(`Abstract art: ${styleDesc}`, 512, 256);
        styleImageUrl = URL.createObjectURL(blob);
        container.innerHTML = `<img src="${styleImageUrl}">`;
    } catch(e) { container.innerHTML = 'Error'; }
    saveSettings();
}

async function generateBackgroundImage() {
    const bgDesc = document.getElementById('bgInput').value;
    const container = document.getElementById('bgImageContainer');
    if(!bgDesc) return;
    container.innerHTML = `<div class="loading-spinner small"></div>`;
    try {
        const blob = await generateQuickImageBlob(`Environment: ${bgDesc}`, 512, 256);
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
    
    // Set loading
    characters[charIndex].loading = true;
    renderCharacters();

    try {
        const blob = await generateQuickImageBlob(`Portrait of ${char.name}, ${char.desc}. Neutral background.`, 256, 256);
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
        const div = document.createElement('div');
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
    localStorage.setItem('vsc_style', document.getElementById('styleInput').value);
    localStorage.setItem('vsc_bg', document.getElementById('bgInput').value);
    const cleanChars = characters.map(({ imageUrl, loading, ...keepAttrs }) => keepAttrs);
    localStorage.setItem('vsc_chars', JSON.stringify(cleanChars));
}

function loadSettings() {
    document.getElementById('styleInput').value = localStorage.getItem('vsc_style') || '';
    document.getElementById('bgInput').value = localStorage.getItem('vsc_bg') || '';
    const savedChars = localStorage.getItem('vsc_chars');
    if(savedChars) { 
        characters = JSON.parse(savedChars).map(c => ({...c, imageUrl: null, loading: false})); 
        renderCharacters(); 
    }
}