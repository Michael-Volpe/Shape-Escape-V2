/* --- GAMEMODE SYNC LOGIC --- */
window.addEventListener('load', () => {
    const selectedMode = sessionStorage.getItem("lastGameMode");
    if (selectedMode) {
        // Mode is kept in sessionStorage to handle refreshes within gamemodes
        document.getElementById("menu").classList.add("hidden");
        startGame(parseInt(selectedMode));
    }
});

const character = document.getElementById("character");
const game = document.getElementById("game");
const particleContainer = document.getElementById("particle-container");
const pauseOverlay = document.getElementById("pauseOverlay");
const scoreP1Elem = document.getElementById("scoreValueP1"), scoreP2Elem = document.getElementById("scoreValueP2");
const levelElement = document.getElementById("levelValue"), timerElement = document.getElementById("timerValue");
const highP1Elem = document.getElementById("highScoreP1"), highP2Elem = document.getElementById("highScoreP2");

// Audio
const sfxClick = document.getElementById("sfx-click"), sfxLightning = document.getElementById("sfx-lightning");
const sfxFire = document.getElementById("sfx-fire"), sfxDeath = document.getElementById("sfx-death"), bgMusic = document.getElementById("bg-music");

let counter = 0, currentBlocks = [], level = 1, startTime, totalPausedTime = 0, pauseStart = 0;
let gameRunning = false, isPaused = false, animationId;
let gracePeriod = false; 
let transitioning = false; 
let floorCollapsed = false; 

// SAFETY FLAG: Prevents the game from overwriting the database with blank values during boot-up
let isInitialLoad = true;

// --- COIN SYSTEM VARIABLES (FIXED PERSISTENCE) ---
let coinsCollected = 0; 
// Immediate load from storage to prevent 0 display on refresh
let totalCoins = parseInt(localStorage.getItem("totalCoins")) || 0;     

// --- PHYSICS & DESIGN ---
let platformSpeed = 1;    
let moveSpeed = 3;        
let gravity = 0.3;          
let jumpStrength = -7.2;    
let size = 20;
let gameSpeed = 1;
let eventSlowdown = 1; 

let bgPosX = 0;
let scoredPlatforms = { p1: new Set(), p2: new Set() };
let abilitiesEnabled = false;
let isClipped = false; 
let targetToggle = 0; 

// FIX: Initialized without hardcoded visuals so database can take over immediately
let p1 = { top: 250, left: 180, vY: 0, grounded: false, score: 0, dead: false, element: character, id: 'p1', color: '', isCrouching: false, name: "", shape: "", skinClass: "", reviveProgress: 0, isInvulnerable: false };
let p2 = { top: 250, left: 240, vY: 0, grounded: false, score: 0, dead: false, element: null, id: 'p2', active: false, color: '', isCrouching: false, name: "", shape: "", skinClass: "", reviveProgress: 0, isInvulnerable: false };

let keys = {};

// --- SKIN REGISTRY ---
const SKIN_MAP = [
    { id: 's1', name: 'Classic Stripes', class: 'skin-stripes' },
    { id: 's2', name: 'Polka Dots', class: 'skin-dots' },
    { id: 's3', name: 'Grid Lines', class: 'skin-glitch' },
    { id: 's4', name: 'Bricks', class: 'skin-bricks' },
    { id: 's5', name: 'Checkerboard', class: 'skin-checkered' },
    { id: 's6', name: 'ZigZag', class: 'skin-zigzag' },
    { id: 's7', name: 'Hex-Grid', class: 'skin-hex' },
    { id: 's8', name: 'Ocean Waves', class: 'skin-waves' },
    { id: 's9', name: 'Circuitry', class: 'skin-circuit' },
    { id: 's10', name: 'Dragon Scales', class: 'skin-ruby' },
    { id: 'off1', name: 'Solar Flare', class: 'skin-solar' },
    { id: 'off2', name: 'Digital Matrix', class: 'skin-matrix' },
    { id: 'off3', name: 'Plasma Flow', class: 'skin-plasma' },
    { id: 'off4', name: 'Cyber Pulse', class: 'skin-cyber-pulse' },
    { id: 'off5', name: 'Toxic Hazard', class: 'skin-toxic' },
    { id: 'l1', name: 'Carbon Fiber', class: 'skin-carbon' },
    { id: 'l2', name: 'Midnight Void', class: 'skin-void' },
    { id: 'l3', name: 'Nebula Flow', class: 'skin-nebula' },
    { id: 'l4', name: 'Digital Ghost', class: 'skin-ghost' },
    { id: 'l5', name: 'Emerald Pulse', class: 'skin-emerald' },
    { id: 'l6', name: 'Overdrive', class: 'skin-overdrive' }
];

// --- CONVEX CLIENT SETUP ---
const convexClient = new convex.ConvexClient("https://famous-skunk-169.convex.cloud");

// --- ONLINE FEATURE LOGIC ---
function updateOnlineCount() {
    convexClient.query("functions:getOnlineCount").then(count => {
        const countElem = document.getElementById("online-count");
        if (countElem) countElem.innerText = count || 1;
    }).catch(() => { });
}

// --- AUTHENTICATION LOGIC ---
async function handleAuth(type) {
    const user = document.getElementById("auth-username").value;
    const pass = document.getElementById("auth-password").value;

    if (!user || !pass) return alert("Enter both fields!");

    try {
        if (type === 'signup') {
            await convexClient.mutation("functions:createAccount", { username: user, password: pass });
            alert("Account created! Now click Login.");
        } else {
            const result = await convexClient.query("functions:checkLogin", { username: user, password: pass });
            if (result && typeof result === 'object' && result.username) {
                totalCoins = result.coins ?? 0; 
                localStorage.setItem("totalCoins", totalCoins); // Save to disk
                loginSuccess(result.username, true); 
            } else if (typeof result === 'string') {
                loginSuccess(result, true);
            } else {
                alert("Wrong username or password!");
            }
        }
    } catch (err) {
        alert("Error: " + err.message);
    }
}

async function loginSuccess(name, isManual = false) {
    if (!name || typeof name !== 'string') return;
    
    const previousUser = localStorage.getItem("gameUsername");
    localStorage.setItem("gameUsername", name);
    
    try {
        // --- SYNC CUSTOMIZATION FROM CLOUD ON LOGIN ---
        const cloudCustoms = await convexClient.query("functions:getCustomization", { username: name });
        if (cloudCustoms) {
            // Update UI inputs if they exist
            if (document.getElementById("p1Color")) document.getElementById("p1Color").value = cloudCustoms.color;
            if (document.getElementById("p1Shape")) document.getElementById("p1Shape").value = cloudCustoms.shape;
            
            // Save to local storage so loadCustoms/updateCustoms has the latest data
            localStorage.setItem(`p1_CustomData`, JSON.stringify({
                name: name, 
                color: cloudCustoms.color, 
                shape: cloudCustoms.shape,
                skinClass: cloudCustoms.skinClass || ""
            }));
            
            p1.skinClass = cloudCustoms.skinClass || "";
        }

        const scores = await convexClient.query("functions:getTopScores");
        const myEntry = scores.find(s => s.name === name);
        if (myEntry) {
            localStorage.setItem("highScoreP1", myEntry.score);
            totalCoins = myEntry.coins || 0;
            localStorage.setItem("totalCoins", totalCoins); // Sync disk
        }
        loadHighScores(); 
        updateCoinUI(); 
        
        // Force update of player objects and elements
        await loadCustoms();
    } catch(e) { 
        if (previousUser !== name) {
            localStorage.setItem("highScoreP1", 0);
            localStorage.setItem("highScoreP2", 0);
            loadHighScores();
        }
    }

    document.getElementById("login-form").classList.add("hidden");
    document.getElementById("user-display").classList.remove("hidden");
    document.getElementById("player-name-tag").innerText = name.toUpperCase();
    
    const welcome = document.getElementById("welcome-tag");
    const dot = document.getElementById("status-dot");
    
    if (welcome) {
        welcome.innerText = name;
        welcome.style.color = "#ff4444";
    }
    if (dot) {
        dot.className = ""; 
        dot.style.background = "#00ff88"; 
        dot.style.boxShadow = "0 0 8px #00ff88";
        dot.style.animation = "none";
    }
    
    if (document.getElementById("p1Name")) {
        document.getElementById("p1Name").value = name;
    }
    
    if (isManual) {
        setTimeout(toggleAuthPopup, 800);
    }
}

// FIX: Always pull from localStorage to ensure bank displays correctly after refresh
function updateCoinUI() {
    const totalElem = document.getElementById("totalCoins");
    const currentRunElem = document.getElementById("coinsEarnedDisplay");
    
    const bankBalance = localStorage.getItem("totalCoins") || 0;
    if (totalElem) totalElem.innerText = bankBalance;
    if (currentRunElem) currentRunElem.innerText = coinsCollected;
}

function logout() {
    localStorage.clear();
    location.reload();
}

function toggleAuthPopup() {
    const overlay = document.getElementById("auth-overlay");
    if (overlay.classList.contains("hidden")) {
        overlay.classList.remove("hidden");
        overlay.style.display = "flex";
    } else {
        overlay.classList.add("hidden");
        overlay.style.display = "none";
    }
}

function setUIVisibility(visible) {
    const authArea = document.getElementById("auth-trigger-area");
    const onlineArea = document.getElementById("online-feature-area");
    const displayStyle = visible ? "flex" : "none";
    
    if (authArea) authArea.style.display = displayStyle;
    if (onlineArea) onlineArea.style.display = displayStyle;

    if (visible) {
        document.body.classList.add("menu-open");
    } else {
        document.body.classList.remove("menu-open");
    }
}

async function toggleCustomization() {
    const menu = document.getElementById("customizationMenu");
    menu.classList.toggle("hidden");
    playSound(sfxClick);
    
    if (!menu.classList.contains("hidden")) {
        setUIVisibility(false); 
        const name = localStorage.getItem("gameUsername");
        if (name) {
            // POPULATE DROPDOWNS FROM DATABASE
            const ownedIds = await convexClient.query("functions:getOwnedSkins", { username: name });
            populateSkinDropdown('p1Skin', ownedIds);
        }
        await updateCustoms(); 
    } else {
        setUIVisibility(true); 
    }
}

function populateSkinDropdown(elementId, ownedIds) {
    const select = document.getElementById(elementId);
    if (!select) return;
    
    const currentSkin = (elementId === 'p1Skin') ? p1.skinClass : p2.skinClass;
    select.innerHTML = '<option value="">None</option>';
    
    SKIN_MAP.forEach(skin => {
        if (ownedIds.includes(skin.id)) {
            const opt = document.createElement('option');
            opt.value = skin.class;
            opt.innerText = skin.name;
            if (skin.class === currentSkin) opt.selected = true;
            select.appendChild(opt);
        }
    });
}

function applyShape(elem, shape) {
    if (!elem) return;
    elem.classList.remove("shape-triangle", "shape-diamond", "shape-hexagon");
    elem.style.clipPath = "none";
    elem.style.borderRadius = "0";

    if (shape === "triangle") {
        elem.classList.add("shape-triangle");
    } else if (shape === "diamond") {
        elem.classList.add("shape-diamond");
    } else if (shape === "hexagon") {
        elem.classList.add("shape-hexagon");
    } else {
        elem.style.borderRadius = shape || "50%";
    }
}

async function updateCustoms() {
    async function updatePlayer(pObj, prefix) {
        const nameInput = document.getElementById(`${prefix}Name`)?.value || (prefix === 'p1' ? "Player 1" : "Player 2");
        const colorInput = document.getElementById(`${prefix}Color`)?.value || (prefix === 'p1' ? "#ff4444" : "#4444ff");
        const shapeInput = document.getElementById(`${prefix}Shape`)?.value || (prefix === 'p1' ? "50%" : "0%");
        const skinInput = document.getElementById(`${prefix}Skin`)?.value || ""; 

        pObj.name = nameInput;
        pObj.color = colorInput;
        pObj.shape = shapeInput;
        pObj.skinClass = skinInput;

        localStorage.setItem(`${prefix}_CustomData`, JSON.stringify({
            name: pObj.name, color: pObj.color, shape: pObj.shape, skinClass: skinInput
        }));

        const loggedUser = localStorage.getItem("gameUsername");
        
        // FIX: Ensure mutations only trigger on user changes, not initial load
        if (prefix === 'p1' && loggedUser && !isInitialLoad) {
            try {
                await convexClient.mutation("functions:updateCustomization", {
                    username: loggedUser,
                    color: colorInput,
                    shape: shapeInput,
                    skinClass: skinInput 
                });
            } catch (err) {
                console.error("Failed to sync customs to cloud:", err);
            }
        }

        const previewElem = document.getElementById(`${prefix}Preview`);
        const uiLabel = document.getElementById(`label${prefix.toUpperCase()}`);

        if (previewElem) {
            // Apply color and shape
            previewElem.style.backgroundColor = colorInput;
            applyShape(previewElem, shapeInput);
            
            // --- FIX: CLEAR PREVIOUS SKINS AND APPLY NEW ONE ---
            SKIN_MAP.forEach(skin => previewElem.classList.remove(skin.class));
            if (skinInput) {
                previewElem.classList.add(skinInput);
            }
        }

        if (uiLabel) {
            uiLabel.innerText = pObj.name;
            uiLabel.style.color = colorInput;
        }

        if (pObj.element) {
            pObj.element.style.backgroundColor = colorInput;
            applyShape(pObj.element, shapeInput);
            
            // --- FIX: CLEAR PREVIOUS SKINS AND APPLY NEW ONE ---
            SKIN_MAP.forEach(skin => pObj.element.classList.remove(skin.class));
            if (skinInput) {
                pObj.element.classList.add(skinInput);
            }
            
            if (pObj.element.classList.contains("torch-glow")) {
                pObj.element.style.boxShadow = `0 0 40px ${colorInput}, 0 0 80px ${colorInput}44`;
            }
        }
    }
    await updatePlayer(p1, 'p1');
    await updatePlayer(p2, 'p2');
}

async function loadCustoms() {
    isInitialLoad = true; // Lock mutations while we populate from storage/cloud
    
    const loggedUser = localStorage.getItem("gameUsername");
    let cloudData = null;
    
    // Attempt to pull the very latest from the cloud if logged in
    if (loggedUser) {
        try {
            cloudData = await convexClient.query("functions:getCustomization", { username: loggedUser });
        } catch (e) {
            console.warn("Could not fetch cloud customs, falling back to local.");
        }
    }

    for (const prefix of ['p1', 'p2']) {
        let data = null;
        
        // If it's Player 1 and we have cloud data, use it. Otherwise, look at LocalStorage.
        if (prefix === 'p1' && cloudData) {
            data = cloudData;
        } else {
            const saved = localStorage.getItem(`${prefix}_CustomData`);
            data = saved ? JSON.parse(saved) : null;
        }

        if (data) {
            const nameField = document.getElementById(`${prefix}Name`);
            const colorField = document.getElementById(`${prefix}Color`);
            const shapeField = document.getElementById(`${prefix}Shape`);
            const skinField = document.getElementById(`${prefix}Skin`);
            
            if (nameField) nameField.value = data.name || (prefix === 'p1' ? "" : "Player 2");
            if (colorField) colorField.value = data.color || (prefix === 'p1' ? "#ff4444" : "#4444ff");
            if (shapeField) shapeField.value = data.shape || "50%";
            if (skinField) skinField.value = data.skinClass || "";
            
            if (prefix === 'p1') p1.skinClass = data.skinClass || "";
            if (prefix === 'p2') p2.skinClass = data.skinClass || "";
        }
    }
    
    await updateCustoms();
    isInitialLoad = false; // Re-enable mutations for future user interactions
}

let devBuffer = "";
const DEV_HASH = "f804ff2fd8efd8445b745ff69f4c69cfd96f6b830245296b9ef866e2edcb801f"
async function hashText(text) {
    const data = new TextEncoder().encode(text)
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function checkDevSpell() {
    const hashed = await hashText(devBuffer);
    if (hashed === DEV_HASH) {
        abilitiesEnabled = !abilitiesEnabled;                
        flashPlayers(); 
        devBuffer = "";
    }
}

document.addEventListener("keydown", (e) => {
    keys[e.code] = true;

    if (e.key.length === 1) { 
        devBuffer += e.key.toLowerCase();
        if (devBuffer.length > 6) {
            devBuffer = devBuffer.slice(-6)
        }
        checkDevSpell();
    }
    
    if (abilitiesEnabled && gameRunning) {
        if (e.code === "Digit1") gameSpeed = 1;
        if (e.code === "Digit2") gameSpeed = 2;
        if (e.code === "Digit3") gameSpeed = 3;
        if (e.code === "Digit4") gameSpeed = 4;
    }

    if (e.code === "Space" && abilitiesEnabled && gameRunning) {
        isClipped = !isClipped;
        if (isClipped) {
            p1.top = 250; p1.left = 215; p1.vY = 0;
            p1.element.style.boxShadow = "0 0 20px #fff, 0 0 40px #0ff"; 
            if (p2.active) { p2.top = 250; p2.left = 235; p2.vY = 0; p2.element.style.boxShadow = "0 0 20px #fff, 0 0 40px #0ff"; }
        } else {
            p1.element.style.boxShadow = "none";
            if (p2.element) p2.element.style.boxShadow = "none";
        }
        return;
    }

    if (e.code === "KeyP" && gameRunning) { togglePause(); return; }
    if (isPaused) return;

    if (e.code === "ArrowDown" || (!p2.active && e.code === "KeyS")) {
        p1.isCrouching = true;
    }
    if (p2.active && e.code === "KeyS") p2.isCrouching = true;

    if (abilitiesEnabled && gameRunning) {
        if (e.code === "KeyL" || e.code === "KeyQ") {
            let target = (targetToggle === 0) ? p1 : p2;
            if (target && (target.active || target === p1)) strikeLightning(target);
            targetToggle = targetToggle === 0 ? 1 : 0;
        }
        if (e.code === "KeyF") {
            let target = (targetToggle === 0) ? p1 : p2;
            if (target && (target.active || target === p1)) igniteFire(target);
            targetToggle = targetToggle === 0 ? 1 : 0;
        }
    }
});

document.addEventListener("keyup", (e) => {
    keys[e.code] = false;
    if (e.code === "ArrowDown" || (!p2.active && e.code === "KeyS")) p1.isCrouching = false;
    if (p2.active && e.code === "KeyS") p2.isCrouching = false;
});

function togglePause() {
    isPaused = !isPaused;
    playSound(sfxClick);
    if (isPaused) { 
        pauseStart = Date.now(); 
        pauseOverlay.classList.remove("hidden");
        bgMusic.pause();
        cancelAnimationFrame(animationId);
    } else { 
        totalPausedTime += (Date.now() - pauseStart); 
        pauseOverlay.classList.add("hidden"); 
        bgMusic.play();
        animationId = requestAnimationFrame(update); 
    }
}

async function startGame(mode) {
    if (gameRunning) return;
    cancelAnimationFrame(animationId);
    bgMusic.volume = 0.4; bgMusic.play();
    sessionStorage.setItem("lastGameMode", mode);
    
    document.getElementById("menu").classList.add("hidden");
    document.getElementById("menu").style.display = "none";
    setUIVisibility(false); 
    
    if (mode === 2) {
        p2.active = true; 
        if (!document.getElementById("character2")) {
            p2.element = document.createElement("div"); p2.element.id = "character2"; game.appendChild(p2.element);
        }
    }
    
    await loadCustoms(); 
    loadHighScores(); 
    gameRunning = true; startTime = Date.now();
    animationId = requestAnimationFrame(update);
}

function update() {
    if (!gameRunning || isPaused) return;
    let elapsed = (Date.now() - startTime - totalPausedTime) / 1000;
    timerElement.innerText = elapsed.toFixed(2);
    
    let currentGlobalModifier = gameSpeed * eventSlowdown;
    let curMove = (moveSpeed + (level * 0.05)) * currentGlobalModifier;
    let curJump = jumpStrength * currentGlobalModifier; 

    if (level === 9) game.style.transform = `translate(${(Math.random()-0.5)*3}px, ${(Math.random()-0.5)*3}px)`;

    if (!isClipped) {
        if (!p1.dead) { 
            handleInput(p1, curMove, curJump, "ArrowLeft", "ArrowRight", "ArrowUp"); 
            if (!p2.active) {
                handleInput(p1, curMove, curJump, "KeyA", "KeyD", "KeyW");
            }
            applyPhysics(p1, currentGlobalModifier); 
        }
        if (p2.active && !p2.dead) { 
            handleInput(p2, curMove, curJump, "KeyA", "KeyD", "KeyW"); 
            applyPhysics(p2, currentGlobalModifier); 
        }
        if (p2.active && !p1.dead && !p2.dead) resolvePlayerCollision(p1, p2);
    }

    if (!p1.dead) {
        bgPosX -= (p1.left - 225) * 0.02 * currentGlobalModifier;
        game.style.backgroundPositionX = bgPosX + "px";
    }

    handlePlatforms(currentGlobalModifier);
    spawnEnvParticles();

    if (!isClipped && !gracePeriod) {
        [p1, p2].forEach(p => { 
            if ((p.active || p === p1) && !p.dead && !p.isInvulnerable) {
                if (p.top <= 0) die(p);
                if (floorCollapsed && p.top >= 530) die(p);
            }
        });
    }

    if (p1.dead && (!p2.active || p2.dead)) { 
        gameRunning = false; bgMusic.pause();
        cancelAnimationFrame(animationId);
        setTimeout(showGameOver, 1000); 
    } else { 
        animationId = requestAnimationFrame(update); 
    }
}

function handleInput(p, ms, js, l, r, j) {
    let speed = p.isCrouching ? ms * 0.6 : ms;
    if (keys[l]) p.left -= speed; if (keys[r]) p.left += speed;
    if (keys[j] && p.grounded && !p.isCrouching) { p.vY = js; p.grounded = false; }
    if (p.left < -size) p.left = 450; if (p.left > 450) p.left = -size;
}

function applyPhysics(p, mod) {
    let gravityForce = gravity * mod;
    if (p.isCrouching && !p.grounded) gravityForce *= 2.5;
    p.vY += gravityForce; 
    p.top += p.vY; 
    p.grounded = false; 
    if (!floorCollapsed) {
        if (p.top > 530) { p.top = 530; p.vY = 0; p.grounded = true; }
    }
    if (p.isCrouching) {
        p.element.classList.add("crouching");
    } else {
        p.element.classList.remove("crouching");
    }
    p.element.style.top = p.top + "px"; p.element.style.left = p.left + "px";
}

function levelUp() {
    if (transitioning) return;
    transitioning = true;
    level++;
    levelElement.innerText = level;
    if (level === 10 || level === 15) {
        gracePeriod = true; eventSlowdown = 0.35; 
        game.classList.add("shake-heavy");
        let debrisTimer = setInterval(() => { if (!gracePeriod) clearInterval(debrisTimer); createDebris(); }, 100);
        warningFlash(); updateTheme(); 
        setTimeout(() => {
            startWaveCrumble(); floorCollapsed = true;
            setTimeout(() => {
                game.classList.remove("shake-heavy"); game.style.transform = "";
                eventSlowdown = 1; gracePeriod = false; transitioning = false;
                [p1, p2].forEach(p => { if(p.element) p.element.classList.add("torch-glow"); });
            }, 2500); 
        }, 1500); 
    } else { platformSpeed += 0.15; updateTheme(); transitioning = false; }
}

function createDebris() {
    const d = document.createElement("div");
    d.style.cssText = `position:absolute; width:4px; height:4px; background:#444; top:-10px; left:${Math.random()*450}px; transition: top 1.2s linear;`;
    game.appendChild(d);
    setTimeout(() => { d.style.top = "600px"; setTimeout(() => d.remove(), 1200); }, 10);
}

function warningFlash() {
    let flashes = 0;
    const interval = setInterval(() => {
        game.style.background = flashes % 2 === 0 ? "#6200ea" : "#fff";
        flashes++; if (flashes > 8) { clearInterval(interval); updateTheme(); }
    }, 100);
}

function startWaveCrumble() {
    const segments = 20;
    for (let i = 0; i < segments; i++) {
        setTimeout(() => {
            const chunk = document.createElement("div");
            chunk.style.cssText = `position: absolute; left: ${i * 22.5}px; top: 530px; width: 25px; height: 35px; background: #222; z-index: 5; transition: transform 2s, opacity 2s;`;
            game.appendChild(chunk);
            setTimeout(() => {
                chunk.style.transform = `translateY(500px) rotate(${Math.random() * 720 - 360}deg)`;
                chunk.style.opacity = "0"; if (i % 4 === 0) playSound(sfxDeath);
            }, 50);
            setTimeout(() => chunk.remove(), 2500);
        }, i * 60); 
    }
}

function handlePlatforms(mod) {
    let last = document.getElementById("block" + (counter - 1));
    if (!last || parseFloat(last.style.top) < 450) createPlatform();
    currentBlocks.forEach((id, i) => {
        let b = document.getElementById("block" + id), h = document.getElementById("hole" + id);
        if (!b) return;
        let drift = (level > 5) ? Math.sin(Date.now() / 700) * 45 : 0;
        if (level > 5) h.style.transform = `translateX(${drift}px)`;
        let top = parseFloat(b.style.top) - (platformSpeed * mod);
        b.style.top = h.style.top = top + "px";
        if (!isClipped) {
            [p1, p2].forEach(p => {
                if ((p.active || p === p1) && !p.dead) {
                    let hL = parseFloat(h.style.left) + drift, hW = parseFloat(h.style.width);
                    let inHole = p.left > hL && p.left + size < hL + hW;
                    if (!inHole && p.top + size > top && p.top + size < top + 20 && p.vY >= 0) {
                        p.top = top - size; p.vY = 0; p.grounded = true;
                    }
                }
            });
        }
        [p1, p2].forEach(p => {
            if ((p.active || p === p1) && !scoredPlatforms[p.id].has(id)) {
                if (p.top > top) {
                    scoredPlatforms[p.id].add(id); 
                    p.score++;
                    let runGain = Math.min(level, 5);
                    coinsCollected += runGain;
                    totalCoins += runGain;
                    localStorage.setItem("totalCoins", totalCoins); 
                    updateCoinUI();
                    (p === p1 ? scoreP1Elem : scoreP2Elem).innerText = p.score;
                    checkAndSaveHighScore(p); if (p.score % 10 === 0) levelUp();
                }
            }
        });
        if (top < -60) { 
            handleReviveProgress(); 
            b.remove(); h.remove(); currentBlocks.splice(i, 1); 
        }
    });
}

function createPlatform() {
    let last = document.getElementById("block" + (counter - 1));
    let b = document.createElement("div"), h = document.createElement("div");
    b.className = "block"; h.className = "hole"; b.id = "block" + counter; h.id = "hole" + counter;
    let holeWidth = level >= 8 ? 40 + Math.random() * 50 : 55;
    h.style.width = holeWidth + "px";
    let top = last ? parseFloat(last.style.top) + (110 + Math.random() * 30) : 550;
    b.style.top = h.style.top = top + "px"; h.style.left = Math.random() * (450 - holeWidth) + "px";
    game.appendChild(b); game.appendChild(h); currentBlocks.push(counter++);
}

function resolvePlayerCollision(a, b) {
    let dx = (a.left + size/2) - (b.left + size/2), dy = (a.top + size/2) - (b.top + size/2);
    if (Math.abs(dx) < size && Math.abs(dy) < size) {
        let ox = size - Math.abs(dx), oy = size - Math.abs(dy);
        if (oy < ox) { if (dy > 0) { b.top = a.top - size; b.vY = 0; b.grounded = true; } else { a.top = b.top - size; a.vY = 0; a.grounded = true; }
        } else { if (dx > 0) { a.left += ox/2; b.left -= ox/2; } else { a.left -= ox/2; b.left += ox/2; } }
    }
}

function die(p) { 
    if (p.dead || p.isInvulnerable || (gracePeriod)) return;
    p.dead = true; playSound(sfxDeath); p.element.classList.add("dead"); 
    createExplosion(p.left, p.top, p.color);
    p.reviveProgress = 0;
}

function handleReviveProgress() {
    if (p1.dead && p2.active && !p2.dead) {
        p1.reviveProgress++;
        if (p1.reviveProgress >= 20) { p1.reviveProgress = -999; triggerRespawn(p1); }
    }
    if (p2.active && p2.dead && !p1.dead) {
        p2.reviveProgress++;
        if (p2.reviveProgress >= 20) { p2.reviveProgress = -999; triggerRespawn(p2); }
    }
}

function triggerRespawn(p) {
    p.dead = false; p.reviveProgress = 0; p.isInvulnerable = true;
    p.top = 100; p.vY = 0;
    p.element.classList.remove("dead");
    // Ensure the visual is updated correctly upon respawn
    updateCustoms();
    setTimeout(() => { p.isInvulnerable = false; }, 3000);
}

function createExplosion(x, y, c) {
    for (let i = 0; i < 15; i++) {
        const p = document.createElement("div"); p.className = "particle"; p.style.backgroundColor = c;
        p.style.left = x + "px"; p.style.top = y + "px";
        p.style.setProperty('--dx', (Math.random() - 0.5) * 250 + "px"); p.style.setProperty('--dy', (Math.random() - 0.5) * 250 + "px");
        particleContainer.appendChild(p); setTimeout(() => p.remove(), 800);
    }
}

function spawnEnvParticles() {
    if (Math.random() > 0.1) return;
    const p = document.createElement("div"); p.className = "env-particle";
    if (game.classList.contains('theme-magma')) p.classList.add('ash');
    else if (game.classList.contains('theme-cyber')) p.classList.add('matrix');
    else if (game.classList.contains('theme-neon')) p.classList.add('bubble');
    else if (game.classList.contains('theme-frozen')) p.classList.add('snowflake');
    else if (game.classList.contains('theme-toxic')) p.classList.add('bubble');
    p.style.left = Math.random() * 450 + "px"; p.style.top = p.classList.contains('bubble') ? "550px" : "-20px";
    game.appendChild(p); setTimeout(() => p.remove(), 4000);
}

function strikeLightning(t) {
    if (t.dead) return; playSound(sfxLightning);
    const b = document.createElement("div"); b.className = "lightning-bolt"; b.style.left = t.left + 7 + "px"; b.style.height = t.top + "px"; b.style.top = "0px";
    game.appendChild(b); game.classList.add("shake"); setTimeout(() => { game.classList.remove("shake"); b.remove(); }, 150); die(t);
}

function igniteFire(t) {
    if (t.dead) return; playSound(sfxFire);
    const f = document.createElement("div"); f.style.cssText = `position:absolute; width:20px; height:20px; background:orange; left:${t.left}px; top:${t.top}px; border-radius:50%; filter:blur(5px); z-index:1100;`;
    game.appendChild(f); setTimeout(() => { f.remove(); die(t); }, 500);
}

function updateTheme() {
    game.classList.remove('theme-neon', 'theme-magma', 'theme-cyber', 'theme-void', 'theme-frozen', 'theme-toxic');
    if (level >= 10) game.classList.add('theme-void'); else if (level >= 8) game.classList.add('theme-toxic'); else if (level >= 6) game.classList.add('theme-frozen'); else if (level >= 4) game.classList.add('theme-cyber'); else if (level >= 2) game.classList.add('theme-magma'); else game.classList.add('theme-neon');
}

function showGameOver() {
    const gameOverScreen = document.getElementById("gameOver");
    gameOverScreen.classList.remove("hidden");
    setUIVisibility(true); 
    if (document.getElementById("coinsEarned")) document.getElementById("coinsEarned").innerText = coinsCollected;
    const p1Label = document.getElementById("finalP1Name"); const p1ScoreElem = document.getElementById("finalP1");
    if (p1Label) { p1Label.innerText = p1.name + ":"; p1Label.style.color = p1.color; }
    if (p1ScoreElem) { p1ScoreElem.innerText = p1.score; p1ScoreElem.style.color = p1.color; }
    if (p2.active && document.getElementById("finalP2Row")) {
        document.getElementById("finalP2Row").classList.remove("hidden");
        const p2Label = document.getElementById("finalP2Name"); const p2ScoreElem = document.getElementById("finalP2");
        if (p2Label) { p2Label.innerText = p2.name + ":"; p2Label.style.color = p2.color; }
        if (p2ScoreElem) { p2ScoreElem.innerText = p2.score; p2ScoreElem.style.color = p2.color; }
    }
    const finalName = localStorage.getItem("gameUsername") || p1.name || "Anonymous";
    sendScoreToDatabase(finalName, p1.score, level, timerElement.innerText);
}

function sendScoreToDatabase(name, score, lvl, time) {
    convexClient.mutation("functions:addScore", {
        name: name,
        score: score,
        level: lvl,
        time: parseFloat(time),
        coinsEarned: coinsCollected 
    }).then(() => {
        coinsCollected = 0; 
        updateCoinUI(); 
    });
}

function loadHighScores() { 
    highP1Elem.innerText = localStorage.getItem("highScoreP1") || 0; 
    if (highP2Elem) highP2Elem.innerText = localStorage.getItem("highScoreP2") || 0; 
}

function checkAndSaveHighScore(p) { 
    let highKey = (p.id === 'p1') ? "highScoreP1" : "highScoreP2"; 
    let currentHigh = parseInt(localStorage.getItem(highKey)) || 0; 
    if (p.score > currentHigh) { 
        localStorage.setItem(highKey, p.score); 
        loadHighScores(); 
    } 
}

function playSound(sound) { if (sound) { sound.currentTime = 0; sound.play().catch(() => {}); } }

function flashPlayers() { 
    [p1, p2].forEach(p => { 
        if (p.element) { 
            p.element.classList.add("toggle-flash"); 
            setTimeout(() => p.element.classList.remove("toggle-flash"), 400); 
        } 
    }); 
}

function restartGame() { location.reload(); }
function goToMenu() { sessionStorage.removeItem("lastGameMode"); location.reload(); }

window.onload = async () => { 
    loadHighScores(); 
    updateOnlineCount();
    updateCoinUI(); 
    
    const savedName = localStorage.getItem("gameUsername");
    if (savedName) {
        try {
            const scores = await convexClient.query("functions:getTopScores");
            const myEntry = scores.find(s => s.name === savedName);
            if (myEntry && myEntry.coins !== undefined) {
                totalCoins = myEntry.coins;
                localStorage.setItem("totalCoins", totalCoins);
                updateCoinUI();
            }
            await loginSuccess(savedName, false); 
        } catch (e) { 
            console.warn("Sync failed, using local cache"); 
            await loadCustoms();
        }
    } else {
        await loadCustoms();
        setUIVisibility(true); 
    }

    const lastMode = sessionStorage.getItem("lastGameMode"); 
    if (lastMode) {
        await startGame(parseInt(lastMode)); 
    }
};
