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
let nukeActive = false;
let ballisticActive = false; 

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
let ballisticToggle = 0;

let p1 = { top: 250, left: 180, vY: 0, grounded: false, score: 0, dead: false, element: character, id: 'p1', color: '#ff4444', isCrouching: false, name: "Circle", shape: "50%", reviveProgress: 0, isInvulnerable: false };
let p2 = { top: 250, left: 240, vY: 0, grounded: false, score: 0, dead: false, element: null, id: 'p2', active: false, color: '#4444ff', isCrouching: false, name: "Square", shape: "0%", reviveProgress: 0, isInvulnerable: false };

let keys = {};

// --- CUSTOMIZATION LOGIC ---
function toggleCustomization() {
    const menu = document.getElementById("customizationMenu");
    menu.classList.toggle("hidden");
    playSound(sfxClick);
    if (!menu.classList.contains("hidden")) {
        updateCustoms(); 
    }
}

function applyShape(elem, shape) {
    if (!elem) return;
    // Reset classes and clipPaths
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
        // Handles Circle (50%), Square (0%), Rounded (8px)
        elem.style.borderRadius = shape;
    }
}

function updateCustoms() {
    function updatePlayer(pObj, prefix) {
        const nameInput = document.getElementById(`${prefix}Name`).value;
        const colorInput = document.getElementById(`${prefix}Color`).value;
        const shapeInput = document.getElementById(`${prefix}Shape`).value;
        const previewElem = document.getElementById(`${prefix}Preview`);
        const previewLabel = document.getElementById(`prevName${prefix.slice(-1)}`);
        const uiLabel = document.getElementById(`label${prefix.toUpperCase()}`);

        pObj.name = nameInput || (prefix === 'p1' ? "Player 1" : "Player 2");
        pObj.color = colorInput;
        pObj.shape = shapeInput;

        localStorage.setItem(`${prefix}_CustomData`, JSON.stringify({
            name: pObj.name, color: pObj.color, shape: pObj.shape
        }));

        if (previewLabel) previewLabel.innerText = pObj.name;
        if (previewElem) {
            previewElem.style.backgroundColor = colorInput;
            applyShape(previewElem, shapeInput);
        }

        if (uiLabel) {
            uiLabel.innerText = pObj.name;
            uiLabel.style.color = colorInput;
        }

        if (pObj.element) {
            pObj.element.style.backgroundColor = colorInput;
            applyShape(pObj.element, shapeInput);
            // Update glow for level 10+
            if (pObj.element.classList.contains("torch-glow")) {
                pObj.element.style.boxShadow = `0 0 40px ${colorInput}, 0 0 80px ${colorInput}44`;
            }
        }
    }
    updatePlayer(p1, 'p1');
    updatePlayer(p2, 'p2');
}

function loadCustoms() {
    ['p1', 'p2'].forEach(prefix => {
        const saved = localStorage.getItem(`${prefix}_CustomData`);
        if (saved) {
            const data = JSON.parse(saved);
            const nameField = document.getElementById(`${prefix}Name`);
            const colorField = document.getElementById(`${prefix}Color`);
            const shapeField = document.getElementById(`${prefix}Shape`);
            
            if (nameField) nameField.value = data.name;
            if (colorField) colorField.value = data.color;
            if (shapeField) shapeField.value = data.shape;
        }
    });
    updateCustoms();
}

// --- INPUT HANDLERS ---
document.addEventListener("keydown", (e) => {
    if (e.code === "KeyE") { abilitiesEnabled = !abilitiesEnabled; flashPlayers(); }
    
    if (abilitiesEnabled && gameRunning) {
        if (e.code === "Digit1") gameSpeed = 1;
        if (e.code === "Digit2") gameSpeed = 2;
        if (e.code === "Digit3") gameSpeed = 3;
        if (e.code === "Digit4") gameSpeed = 4;
        if (e.code === "KeyN" && !nukeActive) triggerNuke();
        
        if (e.code === "KeyM" && !ballisticActive && !nukeActive) {
            let target = (ballisticToggle === 0) ? p1 : p2;
            if (target && (target.active || target === p1)) triggerBallisticStrike(target);
            ballisticToggle = ballisticToggle === 0 ? 1 : 0;
        }
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

    keys[e.code] = true;
    if (e.code === "ArrowDown") p1.isCrouching = true;
    if (e.code === "KeyS") p2.isCrouching = true;

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
    if (e.code === "ArrowDown") p1.isCrouching = false;
    if (e.code === "KeyS") p2.isCrouching = false;
});

function triggerBallisticStrike(target) {
    if (target.dead) return;
    ballisticActive = true;
    eventSlowdown = 0.3;

    const reticle = document.createElement("div");
    reticle.style.cssText = `position:absolute; width:60px; height:60px; border:2px dashed ${target.color}; border-radius:50%; z-index:1000; pointer-events:none; display:flex; align-items:center; justify-content:center;`;
    reticle.innerHTML = `<div style="width:100%; height:2px; background:${target.color}; position:absolute;"></div><div style="width:2px; height:100%; background:${target.color}; position:absolute;"></div>`;
    game.appendChild(reticle);

    const warn = document.createElement("div");
    warn.style.cssText = `position:absolute; top:20%; width:100%; text-align:center; color:${target.color}; font-family:monospace; font-weight:bold; z-index:1001; font-size:20px; text-shadow:0 0 10px #000;`;
    warn.innerText = `BALLISTIC LOCK: ${target.name.toUpperCase()}`;
    game.appendChild(warn);

    let trackCount = 0;
    const tracking = setInterval(() => {
        reticle.style.left = (target.left - 20) + "px";
        reticle.style.top = (target.top - 20) + "px";
        if (trackCount % 10 === 0) playSound(sfxClick);
        trackCount++;
        if (trackCount > 50) {
            clearInterval(tracking);
            warn.innerText = "MISSILE INBOUND";
            reticle.style.border = `3px solid ${target.color}`;
            setTimeout(() => {
                warn.remove();
                launchMissile(target, reticle);
            }, 400);
        }
    }, 30);
}

function launchMissile(target, reticle) {
    const missile = document.createElement("div");
    missile.style.cssText = `position:absolute; width:12px; height:40px; background:#222; left:${target.left+4}px; top:-100px; z-index:1100; border-radius:4px; transition: top 0.4s cubic-bezier(0.6, 0.04, 0.98, 0.33);`;
    missile.innerHTML = '<div style="position:absolute; bottom:-10px; left:2px; width:8px; height:10px; background:orange; filter:blur(2px);"></div>';
    game.appendChild(missile);

    const smokeInterval = setInterval(() => {
        const mRect = missile.getBoundingClientRect();
        const gRect = game.getBoundingClientRect();
        createSmoke(mRect.left - gRect.left + 6, mRect.top - gRect.top + 20);
    }, 20);

    setTimeout(() => {
        missile.style.top = target.top + "px";
        setTimeout(() => {
            clearInterval(smokeInterval);
            playSound(sfxLightning);
            createExplosion(target.left, target.top, "#ff4400");
            game.classList.add("shake-heavy");
            die(target);
            missile.remove();
            reticle.remove();
            setTimeout(() => {
                game.classList.remove("shake-heavy");
                eventSlowdown = 1;
                ballisticActive = false;
            }, 400);
        }, 380);
    }, 50);
}

function createSmoke(x, y) {
    const s = document.createElement("div");
    s.style.cssText = `position:absolute; width:15px; height:15px; background:rgba(0,0,0,0.6); left:${x}px; top:${y}px; border-radius:50%; filter:blur(5px); z-index:1090; pointer-events:none;`;
    game.appendChild(s);
    setTimeout(() => {
        s.style.transform = "scale(2)";
        s.style.opacity = "0";
        setTimeout(() => s.remove(), 500);
    }, 10);
}

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

function startGame(mode) {
    if (gameRunning) return;
    cancelAnimationFrame(animationId);
    bgMusic.volume = 0.4; bgMusic.play();
    sessionStorage.setItem("lastGameMode", mode);
    document.getElementById("menu").style.display = "none";
    
    if (mode === 2) {
        p2.active = true; 
        if (!document.getElementById("character2")) {
            p2.element = document.createElement("div"); p2.element.id = "character2"; game.appendChild(p2.element);
        }
    }
    
    updateCustoms(); 
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
        if (!p1.dead) { handleInput(p1, curMove, curJump, "ArrowLeft", "ArrowRight", "ArrowUp"); applyPhysics(p1, currentGlobalModifier); }
        if (p2.active && !p2.dead) { handleInput(p2, curMove, curJump, "KeyA", "KeyD", "KeyW"); applyPhysics(p2, currentGlobalModifier); }
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
                if (level >= 10) {
                    if (p.top < 80 || (floorCollapsed && p.top > 450)) {
                        p.element.style.opacity = Math.random() > 0.4 ? "1" : "0.3";
                    } else { p.element.style.opacity = "1"; }
                }
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

    if (p.isCrouching) p.element.classList.add("crouching");
    else p.element.classList.remove("crouching");

    p.element.style.top = p.top + "px"; p.element.style.left = p.left + "px";
}

function triggerNuke() {
    nukeActive = true;
    eventSlowdown = 0.08; 
    bgMusic.pause(); 
    game.style.filter = "grayscale(0.8) contrast(1.2)";
    game.style.boxShadow = "inset 0 0 100px #000";
    const nuke = document.createElement("div");
    nuke.style.cssText = `position: absolute; width: 45px; height: 120px; background: linear-gradient(to bottom, #1a1a1a, #333, #1a1a1a); left: 202px; top: -200px; z-index: 500; border-radius: 50% 50% 5px 5px; border: 2px solid #000; box-shadow: 0 0 20px rgba(0,0,0,0.8); transition: top 3.5s cubic-bezier(0.5, 0, 0.7, 1);`;
    nuke.innerHTML = `
        <div style="width: 10px; height: 10px; background: #ff0000; border-radius: 50%; margin: 10px auto; box-shadow: 0 0 10px #f00;"></div>
        <div style="position: absolute; bottom: 0; left: -15px; width: 15px; height: 30px; background: #222; clip-path: polygon(100% 0, 0 100%, 100% 100%);"></div>
        <div style="position: absolute; bottom: 0; right: -15px; width: 15px; height: 30px; background: #222; clip-path: polygon(0 0, 100% 100%, 0 100%);"></div>
    `;
    game.appendChild(nuke);

    const countText = document.createElement("div");
    countText.style.cssText = `position: absolute; width: 100%; top: 35%; text-align: center; font-size: 100px; font-weight: 100; color: #fff; z-index: 501; font-family: 'Courier New', monospace; opacity: 0.5;`;
    game.appendChild(countText);

    setTimeout(() => { nuke.style.top = "410px"; }, 100);

    let count = 3;
    const interval = setInterval(() => {
        if (count > 0) {
            countText.innerText = `00:0${count}`;
            playSound(sfxClick);
            game.style.transform = `scale(${1 + (0.02 * (3-count))})`;
            if (count === 1) {
                clearInterval(interval);
                setTimeout(() => { countText.style.color = "red"; countText.innerText = "IMPACT"; detonateNuke(nuke); }, 1200);
            }
            count--;
        }
    }, 1000);
}

function detonateNuke(nuke) {
    nuke.style.boxShadow = "0 0 100px #fff";
    const smoke = document.createElement("div");
    smoke.style.cssText = `position:absolute; width:100%; height:50px; bottom:50px; background:rgba(255,255,255,0.2); filter:blur(20px);`;
    game.appendChild(smoke);
    setTimeout(() => {
        const flash = document.createElement("div");
        flash.style.cssText = `position:absolute; width:100%; height:100%; background:white; z-index:2000; opacity:1;`;
        game.appendChild(flash);
        playSound(sfxLightning);
        die(p1); if (p2.active) die(p2);
        document.getElementById("ui").style.opacity = "0";
        currentBlocks.forEach(id => {
            const b = document.getElementById("block" + id), h = document.getElementById("hole" + id);
            if (b) b.remove(); if (h) h.remove();
        });
        setTimeout(() => {
            flash.style.background = "url('https://media.giphy.com/media/oEI9uWUicG6S4/giphy.gif')";
            flash.style.opacity = "0.3";
            game.style.background = "#000"; game.style.filter = "brightness(0.2) contrast(2) sepia(1)";
            setTimeout(() => { nuke.remove(); smoke.remove(); nukeActive = false; }, 500);
        }, 300);
    }, 200);
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
                    scoredPlatforms[p.id].add(id); p.score++;
                    (p === p1 ? scoreP1Elem : scoreP2Elem).innerText = p.score;
                    checkAndSaveHighScore(p); if (p.score % 10 === 0) levelUp();
                }
            }
        });
        if (top < -60) { 
            handleReviveProgress(); // Logic for counting floors for revive
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
    if (p.dead || p.isInvulnerable || (gracePeriod && !nukeActive)) return;
    p.dead = true; playSound(sfxDeath); p.element.classList.add("dead"); 
    createExplosion(p.left, p.top, p.color);
    p.reviveProgress = 0; // Reset floor count on death
}

// --- NEW REVIVE FUNCTIONS ---
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
    let count = 3;
    const msg = document.createElement("div");
    msg.style.cssText = `position:absolute; width:100%; top:40%; text-align:center; font-size:30px; color:${p.color}; font-weight:bold; z-index:2000; text-shadow:2px 2px 5px #000; font-family: sans-serif;`;
    game.appendChild(msg);

    const timer = setInterval(() => {
        msg.innerText = `RESPAWNING ${p.name.toUpperCase()}\n${count}...`;
        count--;
        if (count < 0) {
            clearInterval(timer);
            msg.remove();
            p.dead = false;
            p.reviveProgress = 0;
            p.isInvulnerable = true;
            p.top = 100; p.vY = 0;
            p.element.classList.remove("dead");
            p.element.style.opacity = "0.5";
            // 3 second grace period
            setTimeout(() => { p.isInvulnerable = false; p.element.style.opacity = "1"; }, 3000);
        }
    }, 1000);
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

function updateTheme() {
    game.classList.remove('theme-neon', 'theme-magma', 'theme-cyber', 'theme-void', 'theme-frozen', 'theme-toxic');
    if (level >= 10) game.classList.add('theme-void'); else if (level >= 8) game.classList.add('theme-toxic'); else if (level >= 6) game.classList.add('theme-frozen'); else if (level >= 4) game.classList.add('theme-cyber'); else if (level >= 2) game.classList.add('theme-magma'); else game.classList.add('theme-neon');
}

function showGameOver() {
    const gameOverScreen = document.getElementById("gameOver");
    gameOverScreen.classList.remove("hidden");

    const p1Label = document.getElementById("finalP1Name");
    const p1ScoreElem = document.getElementById("finalP1");
    p1Label.innerText = p1.name + ":";
    p1Label.style.color = p1.color;
    p1ScoreElem.innerText = p1.score;
    p1ScoreElem.style.color = p1.color;

    const p2Row = document.getElementById("finalP2Row");
    if (p2.active) {
        p2Row.classList.remove("hidden");
        const p2Label = document.getElementById("finalP2Name");
        const p2ScoreElem = document.getElementById("finalP2");
        p2Label.innerText = p2.name + ":";
        p2Label.style.color = p2.color;
        p2ScoreElem.innerText = p2.score;
        p2ScoreElem.style.color = p2.color;
    } else {
        p2Row.classList.add("hidden");
    }
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

window.onload = () => { 
    loadHighScores(); 
    loadCustoms();
    const lastMode = sessionStorage.getItem("lastGameMode"); 
    if (lastMode) {
        startGame(parseInt(lastMode)); 
    }
};
