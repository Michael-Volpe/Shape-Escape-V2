/* --- METEOR DASH CORE LOGIC --- */

// --- CONVEX CLIENT SETUP ---
// Using 'convexClient' to match your main script.js perfectly
const convexClient = new window.convex.ConvexClient("https://famous-skunk-169.convex.cloud");

const character = document.getElementById("character");
const game = document.getElementById("game");
const levelElement = document.getElementById("levelValue");
const timerElement = document.getElementById("timerValue");
const coinValueElement = document.getElementById("totalCoins");

// Physics & Game State
let gameRunning = false, level = 1, startTime, animationId;
let lastAwardedSecond = 0, gameSpeed = 1, isPaused = false, pauseTime = 0;
let meteors = [], currentRunCoins = 0; 
let moveSpeed = 4.5, gravity = 0.35, jumpStrength = -8.5;

// Dev & Abilities State
let devBuffer = "";
let abilitiesEnabled = false;
let isClipped = false; 
const DEV_HASH = "f804ff2fd8efd8445b745ff69f4c69cfd96f6b830245296b9ef866e2edcb801f";

let p1 = { top: 532, left: 200, vY: 0, grounded: false, score: 0, dead: false, element: character, id: 'p1', crouching: false };
let p2 = { top: 532, left: 240, vY: 0, grounded: false, score: 0, dead: false, element: null, id: 'p2', active: false, crouching: false };

let keys = {};

/* --- SCENIC THEME REGISTRY --- */
const SCENIC_THEMES = [
    { className: 'theme-forest' },
    { className: 'theme-desert' },
    { className: 'theme-ocean' },
    { className: 'theme-ice' },
    { className: 'theme-neon' },
    { className: 'theme-void' }
];

// --- STARTUP ---
window.addEventListener('load', async () => {
    const mode = parseInt(sessionStorage.getItem("lastGameMode")) || 1;
    if (mode === 2) {
        p2.active = true;
        p2.element = document.createElement("div");
        p2.element.id = "character2";
        p2.element.className = "player";
        game.appendChild(p2.element);
    }
    
    await loadPlayerCustoms(); 
    
    gameRunning = true;
    startTime = Date.now();
    game.className = 'theme-forest'; 
    updateScenicTheme(0);
    animationId = requestAnimationFrame(update);
});

// --- CUSTOMIZATION ENGINE ---
async function loadPlayerCustoms() {
    for (const prefix of ['p1', 'p2']) {
        const saved = localStorage.getItem(`${prefix}_CustomData`);
        if (saved) {
            const data = JSON.parse(saved);
            const el = (prefix === 'p1') ? character : p2.element;
            if (el) {
                el.style.backgroundColor = data.color;
                applyShape(el, data.shape);
                if (data.skinClass) el.classList.add(data.skinClass);
            }
        }
    }
}

function applyShape(elem, shape) {
    if (!elem) return;
    elem.classList.remove("shape-triangle", "shape-diamond", "shape-hexagon");
    if (shape === "triangle") elem.classList.add("shape-triangle");
    else if (shape === "diamond") elem.classList.add("shape-diamond");
    else if (shape === "hexagon") elem.classList.add("shape-hexagon");
    else elem.style.borderRadius = shape || "50%";
}

// --- DEV SPELL HELPERS ---
async function hashText(text) {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function checkDevSpell() {
    const hashed = await hashText(devBuffer);
    if (hashed === DEV_HASH) {
        abilitiesEnabled = !abilitiesEnabled;                
        flashPlayers(); 
        if (!abilitiesEnabled) {
            isClipped = false;
            gameSpeed = 1;
            p1.element.style.boxShadow = "none";
            if(p2.element) p2.element.style.boxShadow = "none";
        }
        devBuffer = "";
    }
}

function flashPlayers() {
    const flashColor = abilitiesEnabled ? "#00ff00" : "#ff0000";
    [p1, p2].forEach(p => {
        if (p.element) {
            p.element.style.outline = `4px solid ${flashColor}`;
            setTimeout(() => p.element.style.outline = "none", 1000);
        }
    });
}

function togglePause() {
    if (!gameRunning) return;
    isPaused = !isPaused;
    const pauseOverlay = document.getElementById("pauseOverlay");
    if (pauseOverlay) pauseOverlay.classList.toggle("hidden", !isPaused);
    if (!isPaused) {
        startTime += (Date.now() - pauseTime);
        animationId = requestAnimationFrame(update);
    } else {
        pauseTime = Date.now();
        cancelAnimationFrame(animationId);
    }
}

// --- CORE LOOP ---
function update() {
    if (!gameRunning || isPaused) return;

    let elapsed = (Date.now() - startTime) / 1000;
    timerElement.innerText = elapsed.toFixed(2);

    let newLevel = Math.floor(elapsed / 10) + 1;
    if (newLevel > level) {
        level = newLevel;
        levelElement.innerText = level;
        game.classList.add("level-up-flash");
        setTimeout(() => game.classList.remove("level-up-flash"), 500);
        let themeIndex = Math.min(Math.floor((level - 1) / 2), SCENIC_THEMES.length - 1);
        updateScenicTheme(themeIndex);
    }

    if (Math.floor(elapsed) > lastAwardedSecond) {
        lastAwardedSecond = Math.floor(elapsed);
        currentRunCoins += Math.min(level, 7);
        coinValueElement.innerText = currentRunCoins;
        coinValueElement.classList.remove("coin-pop");
        void coinValueElement.offsetWidth; 
        coinValueElement.classList.add("coin-pop");
    }

    [p1, p2].forEach(p => {
        if ((p.active || p.id === 'p1') && !p.dead) {
            if (!isClipped) {
                handleMove(p);
                p.vY += gravity;
                p.top += (p.vY * gameSpeed);
                if (p.top > 532) { p.top = 532; p.vY = 0; p.grounded = true; }
            } else {
                const clipSpd = 5 * gameSpeed;
                if (keys["ArrowUp"] || keys["KeyW"]) p.top -= clipSpd;
                if (keys["ArrowDown"] || keys["KeyS"]) p.top += clipSpd;
                if (keys["ArrowLeft"] || keys["KeyA"]) p.left -= clipSpd;
                if (keys["ArrowRight"] || keys["KeyD"]) p.left += clipSpd;
            }
            if (p.left < -11) p.left = -11;
            if (p.left > 482) p.left = 482; 
            p.element.style.top = p.top + "px";
            p.element.style.left = p.left + "px";
        }
    });

    if (Math.random() < (0.008 + (level * 0.004)) * gameSpeed) spawnMeteor();
    updateMeteors();

    if (p1.dead && (!p2.active || p2.dead)) showGameOver();
    else animationId = requestAnimationFrame(update);
}

function handleMove(p) {
    const isP1 = p.id === 'p1';
    const leftKeys = isP1 ? ["ArrowLeft", "KeyA"] : ["KeyA"];
    const rightKeys = isP1 ? ["ArrowRight", "KeyD"] : ["KeyD"];
    const jumpKeys = isP1 ? ["ArrowUp", "KeyW"] : ["KeyW"];
    const crouchKeys = isP1 ? ["ArrowDown", "KeyS"] : ["KeyS"];

    if (crouchKeys.some(k => keys[k]) && p.grounded) {
        if (!p.crouching) { p.crouching = true; p.element.classList.add("crouching"); }
    } else {
        if (p.crouching) { p.crouching = false; p.element.classList.remove("crouching"); }
    }

    const currentSpeed = (p.crouching ? moveSpeed * 0.5 : moveSpeed) * gameSpeed;
    if (leftKeys.some(k => keys[k])) p.left -= currentSpeed;
    if (rightKeys.some(k => keys[k])) p.left += currentSpeed;
    if (jumpKeys.some(k => keys[k]) && p.grounded && !p.crouching) { p.vY = jumpStrength; p.grounded = false; }
}

function updateScenicTheme(index) {
    SCENIC_THEMES.forEach(t => game.classList.remove(t.className));
    game.classList.add(SCENIC_THEMES[index].className);
}

function spawnMeteor() {
    const m = document.createElement("div");
    m.className = "meteor";
    const x = Math.random() * 470;
    const speed = (2.0 + (Math.random() * (level * 0.6))) * gameSpeed;
    game.appendChild(m);
    meteors.push({ el: m, x, y: -100, speed });
}

function updateMeteors() {
    for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.y += m.speed;
        m.el.style.top = m.y + "px";
        m.el.style.left = m.x + "px";

        if (!isClipped) { 
            [p1, p2].forEach(p => {
                if ((p.active || p.id === 'p1') && !p.dead) {
                    const pHeight = p.crouching ? 12 : 22;
                    const pCenterY = p.top + (pHeight / 2);
                    let dx = (p.left + 11) - (m.x + 11);
                    let dy = pCenterY - (m.y + 11);
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < (pHeight / 2 + 9)) {
                        p.dead = true;
                        p.element.style.filter = "brightness(0.2) grayscale(1)";
                    }
                }
            });
        }

        if (m.y > 600) {
            m.el.remove();
            meteors.splice(i, 1);
            if (!p1.dead) {
                p1.score++; 
                const scoreDisplay = document.getElementById("scoreValueP1");
                if (scoreDisplay) scoreDisplay.innerText = p1.score;
            }
        }
    }
}

// --- FIXED GAME OVER & CONVEX SYNC ---
// --- FINAL BULLETPROOF GAME OVER ---
// --- FINAL BULLETPROOF GAME OVER ---
async function showGameOver() {
    if (!gameRunning) return; 
    gameRunning = false;
    cancelAnimationFrame(animationId);
    
    // 1. CAPTURE DATA RIGHT NOW
    const dodgedCount = p1.score; 
    const finalTime = timerElement.innerText; 
    const finalLevel = level;
    const user = localStorage.getItem("gameUsername") || "Guest";

    // 2. UI UPDATES - MATCHING THE NEW HTML IDs
    const dodgedEl = document.getElementById("finalP1");
    if (dodgedEl) dodgedEl.innerText = dodgedCount;
    
    const timeEl = document.getElementById("finalTime");
    if (timeEl) timeEl.innerText = finalTime; // HTML already provides the 's'
    
    const coinsEl = document.getElementById("coinsEarned"); 
    if (coinsEl) coinsEl.innerText = currentRunCoins;

    const levelEl = document.getElementById("finalLevel");
    if (levelEl) levelEl.innerText = finalLevel;
    
    // 3. LOCAL STORAGE BACKUP
    const totalBank = parseInt(localStorage.getItem("totalCoins")) || 0;
    localStorage.setItem("totalCoins", totalBank + currentRunCoins);

    // 4. CONVEX CLOUD SYNC
    try {
        await convexClient.mutation("functions:addScore", {
            name: user,
            score: dodgedCount,
            level: finalLevel,
            time: parseFloat(finalTime),
            coinsEarned: currentRunCoins
        });
        console.log("Stats synced to Cloud successfully!");
    } catch (err) {
        console.error("Cloud Sync Failed:", err);
    }

    // 5. SHOW THE POPUP
    document.getElementById("gameOver").classList.remove("hidden");
}
// --- INPUT HANDLER ---
document.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.key.length === 1) { 
        devBuffer += e.key.toLowerCase();
        if (devBuffer.length > 6) devBuffer = devBuffer.slice(-6);
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
        const shadow = isClipped ? "0 0 20px #fff, 0 0 40px #0ff" : "none";
        p1.element.style.boxShadow = shadow;
        if (p2.element) p2.element.style.boxShadow = shadow;
    }
    if (e.code === "KeyP") togglePause();
});

document.addEventListener("keyup", (e) => { keys[e.code] = false; });
