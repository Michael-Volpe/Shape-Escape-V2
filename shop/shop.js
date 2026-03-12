// --- CONVEX CLIENT SETUP ---
const convexClient = new convex.ConvexClient("https://famous-skunk-169.convex.cloud");

// --- SHOP DATA ---

// ITEMS IN THE PERMANENT "SKINS" TAB
const ALL_SKINS = [
    { id: 's1', name: 'Classic Stripes', class: 'skin-stripes', rarity: 'common', price: 100 },
    { id: 's2', name: 'Polka Dots', class: 'skin-dots', rarity: 'common', price: 100 },
    { id: 's3', name: 'Grid Lines', class: 'skin-glitch', rarity: 'common', price: 150 },
    { id: 's4', name: 'Bricks', class: 'skin-bricks', rarity: 'common', price: 150 },
    { id: 's5', name: 'Checkerboard', class: 'skin-checkered', rarity: 'uncommon', price: 300 },
    { id: 's6', name: 'ZigZag', class: 'skin-zigzag', rarity: 'uncommon', price: 350 },
    { id: 's7', name: 'Hex-Grid', class: 'skin-hex', rarity: 'uncommon', price: 400 },
    { id: 's8', name: 'Ocean Waves', class: 'skin-waves', rarity: 'rare', price: 750 },
    { id: 's9', name: 'Circuitry', class: 'skin-circuit', rarity: 'rare', price: 800 },
    { id: 's10', name: 'Dragon Scales', class: 'skin-ruby', rarity: 'legendary', price: 900 }
];

// EXCLUSIVE LIMITED OFFERS (Only appear in the "Offers" tab)
const LIMITED_OFFERS = [
    { id: 'off1', name: 'Solar Flare', class: 'skin-solar', rarity: 'legendary', price: 2500 },
    { id: 'off2', name: 'Digital Matrix', class: 'skin-matrix', rarity: 'legendary', price: 3000 },
    { id: 'off3', name: 'Plasma Flow', class: 'skin-plasma', rarity: 'legendary', price: 2800 },
    { id: 'off4', name: 'Cyber Pulse', class: 'skin-cyber-pulse', rarity: 'legendary', price: 3200 },
    { id: 'off5', name: 'Toxic Hazard', class: 'skin-toxic', rarity: 'rare', price: 1200 }
];

// EXCLUSIVE LOOT-ONLY SKINS (Only obtainable via Crates)
const LOOT_ONLY_SKINS = [
    { id: 'l1', name: 'Carbon Fiber', class: 'skin-carbon', rarity: 'uncommon' },
    { id: 'l2', name: 'Midnight Void', class: 'skin-void', rarity: 'legendary' },
    { id: 'l3', name: 'Nebula Flow', class: 'skin-nebula', rarity: 'legendary' },
    { id: 'l4', name: 'Digital Ghost', class: 'skin-ghost', rarity: 'legendary' },
    { id: 'l5', name: 'Emerald Pulse', class: 'skin-emerald', rarity: 'rare' },
    { id: 'l6', name: 'Overdrive', class: 'skin-overdrive', rarity: 'rare' }
];

const CRATES = [
    { 
        id: 'c1', name: 'Common Crate', price: 200, rarity: 'common', 
        weights: { common: 75, uncommon: 20, rare: 4, legendary: 1 } 
    },
    { 
        id: 'c2', name: 'Uncommon Crate', price: 500, rarity: 'uncommon', 
        weights: { common: 35, uncommon: 50, rare: 12, legendary: 3 } 
    },
    { 
        id: 'c3', name: 'Rare Crate', price: 1000, rarity: 'rare', 
        weights: { common: 10, uncommon: 25, rare: 55, legendary: 10 } // FIXED: Changed 'rarity' to 'rare'
    },
    { 
        id: 'c4', name: 'Legendary Crate', price: 2500, rarity: 'legendary', 
        weights: { common: 0, uncommon: 10, rare: 30, legendary: 60 } 
    }
];

const TOTAL_LOOT_POOL = [...ALL_SKINS, ...LIMITED_OFFERS, ...LOOT_ONLY_SKINS];

// --- INITIALIZATION ---
function initShop() {
    updateBalance();
    renderAllSkins();
    renderCrates();
    handleDailyRotation();
    startTimer();
}

async function updateBalance() {
    const username = localStorage.getItem('gameUsername');
    if (username) {
        const coins = await convexClient.query("functions:getUserCoins", { username: username });
        document.getElementById('shop-balance').innerText = coins;
        localStorage.setItem('totalCoins', coins);
    } else {
        const balance = localStorage.getItem('totalCoins') || 0;
        document.getElementById('shop-balance').innerText = balance;
    }
}

// --- TAB SWITCHING ---
function switchTab(tabId) {
    document.querySelectorAll('.shop-section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    const targetId = (tabId === 'daily' || tabId === 'offers') ? 'offers-tab' : tabId + '-tab';
    const section = document.getElementById(targetId);
    
    if(section) section.classList.remove('hidden');
    
    if(tabId === 'daily' || tabId === 'offers') handleDailyRotation();

    if(window.event && window.event.currentTarget) window.event.currentTarget.classList.add('active');
}

// --- RENDERING ---
function renderAllSkins() {
    const grid = document.getElementById('full-skins-grid');
    if (grid) grid.innerHTML = ALL_SKINS.map(skin => createItemHTML(skin)).join('');
}

function renderCrates() {
    const grid = document.getElementById('crates-grid');
    if (!grid) return;
    grid.innerHTML = CRATES.map(crate => `
        <div class="shop-item ${crate.rarity} crate-card">
            <span class="item-rarity-tag">${crate.rarity}</span>
            <div class="item-preview skin-glitch" style="filter: hue-rotate(${crate.price}deg); opacity: 0.8;"></div>
            
            <div class="crate-odds-overlay">
                <div class="odds-title">CHANCES</div>
                <div class="odds-row"><span>Common</span> <span>${crate.weights.common}%</span></div>
                <div class="odds-row"><span>Uncommon</span> <span>${crate.weights.uncommon}%</span></div>
                <div class="odds-row"><span>Rare</span> <span>${crate.weights.rare}%</span></div>
                <div class="odds-row"><span>Legendary</span> <span>${crate.weights.legendary}%</span></div>
            </div>

            <div class="item-info">
                <span class="item-name">${crate.name}</span>
                <button class="buy-btn" onclick="startCrateOpening('${crate.id}')">${crate.price} 🪙</button>
            </div>
        </div>
    `).join('');
}

function createItemHTML(item, extraClass = '') {
    return `
        <div class="shop-item ${item.rarity} ${extraClass}">
            <span class="item-rarity-tag">${item.rarity}</span>
            <div class="item-preview ${item.class}"></div>
            <div class="item-info">
                <span class="item-name">${item.name}</span>
                <button class="buy-btn" onclick="buyItem('${item.id}', ${item.price})">${item.price} 🪙</button>
            </div>
        </div>
    `;
}

// --- LOGIC: DAILY ROTATION ---
function handleDailyRotation() {
    const today = new Date().toDateString();
    let dailyItems = JSON.parse(localStorage.getItem('daily_shop_items'));
    
    if (localStorage.getItem('shop_date') !== today || !dailyItems) {
        const shuffled = [...LIMITED_OFFERS].sort(() => 0.5 - Math.random());
        dailyItems = shuffled.slice(0, 3);
        localStorage.setItem('daily_shop_items', JSON.stringify(dailyItems));
        localStorage.setItem('shop_date', today);
    }

    const dailyGrid = document.getElementById('daily-offers-grid');
    if (dailyGrid) {
        dailyGrid.innerHTML = dailyItems.map((item, idx) => 
            createItemHTML(item, idx === 0 ? 'featured' : '')
        ).join('');
    }
}

function startTimer() {
    const timerElement = document.getElementById('shop-timer');
    if (!timerElement) return;

    setInterval(() => {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const diff = tomorrow - now;
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        timerElement.innerText = `RESET: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 1000);
}

// --- FIXED PURCHASING LOGIC ---
async function buyItem(id, price) {
    const username = localStorage.getItem('gameUsername');
    if (!username) return alert("Please log in on the main menu first!");

    try {
        const ownedSkins = await convexClient.query("functions:getOwnedSkins", { username: username });
        if (ownedSkins.includes(id)) {
            return alert("Already Owned!");
        }

        const result = await convexClient.mutation("functions:unlockSkin", {
            username: username,
            skinId: id,
            price: price
        });

        if (result.success) {
            alert("Item Unlocked!");
            await updateBalance();
        }
    } catch (err) {
        alert(err.message);
    }
}

// --- LOGIC: CRATE OPENING ---
function pickRarity(weights) {
    const rand = Math.random() * 100;
    let cumulative = 0;
    for (const [rarity, chance] of Object.entries(weights)) {
        cumulative += chance;
        if (rand < cumulative) return rarity;
    }
    return 'common';
}

// Helper to get a random skin of a specific rarity with a safety fallback
function getRandomSkinOfRarity(rarity) {
    const pool = TOTAL_LOOT_POOL.filter(s => s.rarity === rarity);
    if (pool.length > 0) {
        return pool[Math.floor(Math.random() * pool.length)];
    }
    // Fallback if rarity pool is empty (prevents crashes)
    return ALL_SKINS[0];
}

async function startCrateOpening(crateId) {
    const username = localStorage.getItem('gameUsername');
    if (!username) return alert("Please log in first!");

    const crate = CRATES.find(c => c.id === crateId);
    const currentCoins = await convexClient.query("functions:getUserCoins", { username: username });

    if (currentCoins < crate.price) {
        return alert("Need more coins!");
    }

    // --- PRE-CALCULATE WINNER ---
    const winRarity = pickRarity(crate.weights);
    const winner = getRandomSkinOfRarity(winRarity);

    const overlay = document.getElementById('crate-overlay');
    const spinner = document.getElementById('item-spinner');
    const rewardDisplay = document.getElementById('reward-display');
    
    overlay.classList.remove('hidden');
    rewardDisplay.classList.add('hidden');
    spinner.style.transition = 'none';
    spinner.style.transform = 'translateX(0)';

    spinner.innerHTML = '';
    const totalItems = 60;
    const winningIndex = 55;
    
    for (let i = 0; i < totalItems; i++) {
        const rarity = pickRarity(crate.weights);
        const randSkin = getRandomSkinOfRarity(rarity);
        
        const div = document.createElement('div');
        div.className = `spinner-item ${randSkin.rarity}`;
        div.innerHTML = `
            <div class="item-preview ${randSkin.class}"></div>
            <div class="spinner-divider" style="position: absolute; right: -1px; width: 2px; height: 100%; background: #222;"></div>
        `;
        spinner.appendChild(div);
    }
    
    // Set the specific pre-calculated winner in the track at the winning index
    spinner.children[winningIndex].className = `spinner-item ${winner.rarity}`;
    spinner.children[winningIndex].innerHTML = `
        <div class="item-preview ${winner.class}"></div>
        <div class="spinner-divider" style="position: absolute; right: -1px; width: 2px; height: 100%; background: #222;"></div>
    `;

    setTimeout(() => {
        const itemFullWidth = 120; 
        const viewportCenter = window.innerWidth / 2;
        const stopPosition = (winningIndex * itemFullWidth) + (itemFullWidth / 2);
        const finalMove = stopPosition - viewportCenter;

        spinner.style.transition = 'transform 6s cubic-bezier(0.1, 0, 0.1, 1)';
        spinner.style.transform = `translateX(-${finalMove}px)`;
    }, 50);

    // --- SAVE TO DATABASE DURING SPIN ---
    try {
        await convexClient.mutation("functions:unlockSkin", {
            username: username,
            skinId: winner.id,
            price: crate.price
        });
    } catch (e) {
        console.error("Failed to save crate reward:", e);
    }

    setTimeout(() => {
        rewardDisplay.classList.remove('hidden');
        document.getElementById('reward-name').innerText = winner.name;
        document.getElementById('reward-preview').className = `item-preview ${winner.class}`;
        updateBalance(); 
    }, 6500);
}

function closeCrate() {
    document.getElementById('crate-overlay').classList.add('hidden');
    document.getElementById('reward-display').classList.add('hidden');
    document.getElementById('item-spinner').style.transform = 'translateX(0)';
}

window.onload = initShop;
