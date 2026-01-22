const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statsDiv = document.getElementById('stats');
const uiLayer = document.getElementById('ui-layer');
const mainMenu = document.getElementById('main-menu');
const jobPanel = document.getElementById('job-panel');

// --- CONFIGURATION ---
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;

const FACTIONS = {
    NEUTRAL: { id: 'neutral', color: '#555' },
    PLAYER: { id: 'player', color: '#f1c40f' }, // Yellow
    RED: { id: 'red', color: '#e74c3c' },       // Fire City
    BLUE: { id: 'blue', color: '#3498db' },     // New City
    GREEN: { id: 'green', color: '#2ecc71' },   // Old City
    GANG: { id: 'gang', color: '#9b59b6' }      // Gangs (Purple)
};

// --- GAME STATE ---
let gameMode = null; // 'MAIN' or 'BLACKPOST'
let gameState = 'MENU'; // MENU, PLANE, PLAYING
let gameRunning = false;
const camera = { x: 0, y: 0 };
const keys = {};
const mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false };

const entities = {
    player: null,
    posts: [],
    bullets: [],
    units: [],
    particles: [],
    buildings: [],
    vehicles: []
};

let plane = null; // For Blackpost drops

const islands = [
    // Row 1: [1 New Forest] [2 New City] [3 Desert City] [4 Desert Forest]
    { name: "New Forest", x: 50, y: 100, w: 650, h: 1300, color: '#0b1a1a' },
    { name: "New City", x: 750, y: 100, w: 650, h: 1300, color: '#1a2530' },
    { name: "Desert City", x: 1550, y: 100, w: 650, h: 1300, color: '#3b1e1e' },
    { name: "Desert Forest", x: 2250, y: 100, w: 650, h: 1300, color: '#2d241e' },
    // Row 2: [5 Snow Forest] [6 Snow City] [7 Old City] [8 Old Forest]
    { name: "Snow Forest", x: 50, y: 1500, w: 650, h: 1300, color: '#1c2833' },
    { name: "Snow City", x: 750, y: 1500, w: 650, h: 1300, color: '#34495e' },
    { name: "Old City", x: 1550, y: 1500, w: 650, h: 1300, color: '#1e272e' },
    { name: "Old Forest", x: 2250, y: 1500, w: 650, h: 1300, color: '#0f1f0f' }
];

// Mode Specific State
let blackpostTimer = 0;
const BLACKPOST_INTERVAL = 3600; // 60 seconds (Canon)
let blackpostActive = false;

let currentJob = null;
let strategicTimer = 0;
let jobTimeout = null;

let playerMoney = 0;
let playerLevel = 1;

// --- CLASSES ---

class Building {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }
    draw() {
        ctx.fillStyle = '#2c3e50'; // A dark, neutral building color
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.strokeStyle = '#233140';
        ctx.lineWidth = 4;
        ctx.strokeRect(this.x, this.y, this.w, this.h);
    }
}

class Vehicle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 25;
        this.h = 45;
        this.angle = 0;
        this.speed = 0;
        this.maxSpeed = 9;
        this.hp = 400;
        this.maxHp = 400;
        this.driver = null;
        this.faction = FACTIONS.NEUTRAL;
    }

    update() {
        this.x += Math.sin(this.angle) * this.speed;
        this.y -= Math.cos(this.angle) * this.speed;
        this.speed *= 0.96; // Friction

        if (this.driver) {
            this.driver.x = this.x;
            this.driver.y = this.y;
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = this.driver ? this.driver.faction.color : FACTIONS.NEUTRAL.color;
        ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
        ctx.fillStyle = '#000'; // Windshield
        ctx.fillRect(-this.w / 2 + 4, -this.h / 2 + 5, this.w - 8, 12);
        ctx.restore();
    }
}

class Post {
    constructor(x, y, id) {
        this.x = x;
        this.y = y;
        this.w = 40;
        this.h = 40;
        this.id = id;
        this.points = 50; // 0 to 100
        this.owner = FACTIONS.NEUTRAL;
        
        // Blackpost Logic
        this.isBlackpost = false;
        this.blackzoneRadius = 0;
    }

    update() {
        if (gameMode === 'BLACKPOST' && this.isBlackpost) {
            this.blackzoneRadius += 0.5; // Zone expands
            
            // Damage units inside blackzone
            entities.units.forEach(u => {
                const dist = Math.hypot(u.x - this.x, u.y - this.y);
                if (dist < this.blackzoneRadius) {
                    u.hp -= 0.5;
                    if (u.isPlayer) createExplosion(u.x, u.y, '#f00', 1);
                }
            });
        }
    }

    draw() {
        // Draw Blackzone
        if (gameMode === 'BLACKPOST' && this.isBlackpost) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.blackzoneRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
            ctx.fill();
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Draw base
        ctx.fillStyle = this.owner.color;
        ctx.fillRect(this.x - this.w/2, this.y - this.h/2, this.w, this.h);
        
        // Draw border
        ctx.strokeStyle = (gameMode === 'BLACKPOST' && this.isBlackpost) ? '#f00' : '#fff';
        
        // Job Target Marker (Main Mode)
        if (gameMode === 'MAIN' && currentJob && currentJob.target === this) {
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 4;
            ctx.strokeRect(this.x - this.w/2 - 5, this.y - this.h/2 - 5, this.w + 10, this.h + 10);
        } else {
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x - this.w/2, this.y - this.h/2, this.w, this.h);
        }

        // Draw Health Bar
        const barWidth = 60;
        const barHeight = 6;
        ctx.fillStyle = '#000';
        ctx.fillRect(this.x - barWidth/2, this.y - this.h/2 - 15, barWidth, barHeight);
        ctx.fillStyle = this.owner.color;
        ctx.fillRect(this.x - barWidth/2, this.y - this.h/2 - 15, barWidth * (this.points / 100), barHeight);
    }

    takeDamage(amount, shooterFaction) {
        if (this.owner.id === shooterFaction.id) {
            // Heal own post
            this.points = Math.min(100, this.points + amount);
        } else {
            // Damage enemy post
            this.points -= amount;
            if (this.points <= 0) {
                // FLIP OWNERSHIP
                this.points = 10; 
                this.owner = shooterFaction;
                createExplosion(this.x, this.y, this.owner.color, 20);
                
                // Economy Reward
                if (shooterFaction.id === FACTIONS.PLAYER.id) {
                    addMoney(500);
                    if (gameMode === 'MAIN') checkJobCompletion(this);
                }
            }
        }
    }
}

class Unit {
    constructor(x, y, faction, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.radius = 10;
        this.faction = faction;
        this.isPlayer = isPlayer;
        this.speed = isPlayer ? 6 : 3;
        this.angle = 0;
        this.cooldown = 0;
        this.target = null;
        this.hp = 100;
        this.maxHp = 100;
        this.currentVehicle = null;
    }

    update() {
        if (this.hp <= 0) return; // Dead

        if (this.isPlayer) {
            let dx = 0, dy = 0; // For collision

            if (this.currentVehicle) {
                // --- VEHICLE CONTROL ---
                if (keys['KeyW']) this.currentVehicle.speed = Math.min(this.currentVehicle.maxSpeed, this.currentVehicle.speed + 0.4);
                if (keys['KeyS']) this.currentVehicle.speed = Math.max(-this.currentVehicle.maxSpeed / 2, this.currentVehicle.speed - 0.4);
                
                const turnSpeed = Math.abs(this.currentVehicle.speed / this.currentVehicle.maxSpeed);
                if (keys['KeyA']) this.currentVehicle.angle -= 0.04 * turnSpeed;
                if (keys['KeyD']) this.currentVehicle.angle += 0.04 * turnSpeed;

                // Aiming is independent
                this.angle = Math.atan2(mouse.worldY - this.y, mouse.worldX - this.x);

            } else {
                // --- ON-FOOT CONTROL ---
                if (keys['KeyW']) dy -= 1;
                if (keys['KeyS']) dy += 1;
                if (keys['KeyA']) dx -= 1;
                if (keys['KeyD']) dx += 1;

                if (dx !== 0 || dy !== 0) {
                    const len = Math.hypot(dx, dy);
                    this.x += (dx / len) * this.speed;
                    this.y += (dy / len) * this.speed;
                }
                // Aim at mouse
                this.angle = Math.atan2(mouse.worldY - this.y, mouse.worldX - this.x);
            }

            // Building Collision for player on foot
            if (!this.currentVehicle && (dx !== 0 || dy !== 0)) {
                for (const b of entities.buildings) {
                    if (this.x > b.x && this.x < b.x + b.w && this.y > b.y && this.y < b.y + b.h) {
                        const len = Math.hypot(dx, dy);
                        this.x -= (dx / len) * this.speed; // Revert move
                        this.y -= (dy / len) * this.speed;
                        break;
                    }
                }
            }

            // Shooting
            if (mouse.down && this.cooldown <= 0) {
                shoot(this);
                // Fire rate improves with level
                this.cooldown = Math.max(5, 10 - playerLevel); 
            }
        } else {
            // AI Logic
            if (!this.target || this.target.owner === this.faction || Math.random() < 0.01) {
                this.findTarget();
            }

            if (this.target) {
                const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
                this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                
                if (dist > 150) {
                    this.x += Math.cos(this.angle) * this.speed;
                    this.y += Math.sin(this.angle) * this.speed;
                }

                // Shoot if looking at target
                if (dist < 350 && this.cooldown <= 0) {
                    shoot(this);
                    this.cooldown = 40 + Math.random() * 20;
                }
            }
        }

        if (this.cooldown > 0) this.cooldown--;

        // World bounds
        this.x = Math.max(0, Math.min(WORLD_WIDTH, this.x));
        this.y = Math.max(0, Math.min(WORLD_HEIGHT, this.y));
    }

    findTarget() {
        // Find nearest enemy post
        let nearest = null;
        let minDst = Infinity;
        entities.posts.forEach(p => {
            if (p.owner.id !== this.faction.id) {
                const d = Math.hypot(p.x - this.x, p.y - this.y);
                if (d < minDst) {
                    minDst = d;
                    nearest = p;
                }
            }
        });
        this.target = nearest;
    }

    draw() {
        if (this.hp <= 0 || this.currentVehicle) return; // Don't draw if dead or in vehicle

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Body (always infantry now)
        ctx.fillStyle = this.faction.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Gun
        ctx.fillStyle = '#333';
        ctx.fillRect(0, -3, 20, 6);

        // Selection ring for player
        if (this.isPlayer) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }
}

class Bullet {
    constructor(x, y, angle, ownerFaction) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * 15;
        this.vy = Math.sin(angle) * 15;
        this.ownerFaction = ownerFaction;
        this.life = 60;
        this.damage = 5 + (ownerFaction.id === 'player' ? playerLevel : 0);
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;

        // Collision with buildings
        for (const b of entities.buildings) {
            if (this.x > b.x && this.x < b.x + b.w && this.y > b.y && this.y < b.y + b.h) {
                this.life = 0; // Kill bullet
                createExplosion(this.x, this.y, '#888', 3); // Spark effect
            }
        }
    }

    draw() {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- SYSTEMS ---

function startGame(mode) {
    gameMode = mode;
    gameRunning = true;
    gameState = 'PLAYING'; // Default, overridden below for Blackpost
    mainMenu.style.display = 'none';
    uiLayer.style.display = 'block';
    document.getElementById('mode-title').innerText = mode === 'MAIN' ? 'MAIN GAME MODE' : 'BLACKPOST MODE';
    
    // Reset State
    entities.units = [];
    entities.posts = [];
    entities.bullets = [];
    entities.particles = [];
    entities.buildings = [];
    entities.vehicles = [];
    entities.player = null;
    currentJob = null;
    if (jobTimeout) clearTimeout(jobTimeout);
    playerMoney = 0;
    playerLevel = 1;
    blackpostActive = false;
    blackpostTimer = 0;

    generateWorld();

    // Generate Posts (Canon: 50 per city approx)
    islands.forEach((island, idx) => {
        let faction = FACTIONS.NEUTRAL;
        let postCount = 10; // Default for forests

        // City Zones get more posts and specific owners
        if (idx === 1) faction = FACTIONS.BLUE;  // New City
        if (idx === 2) faction = FACTIONS.RED;   // Desert City
        if (idx === 6) faction = FACTIONS.GREEN; // Old City
        
        // Check if it's a city zone (Indices 1, 2, 5, 6)
        if ([1, 2, 5, 6].includes(idx)) {
            postCount = 50; // High density for cities
        }

        // Snow City (5) is neutral/contested
        if (idx === 5) {
            faction = FACTIONS.NEUTRAL;
            postCount = 50;
        }

        for (let i = 0; i < postCount; i++) {
            const px = island.x + 100 + Math.random() * (island.w - 200);
            const py = island.y + 100 + Math.random() * (island.h - 200);
            const post = new Post(px, py, `P-${idx}-${i}`);
            post.owner = faction;
            post.points = 100;
            entities.posts.push(post);
        }
    });

    // Spawn initial AI
    for(let i=0; i<12; i++) spawnAI(FACTIONS.BLUE, islands[1]); // New City
    for(let i=0; i<12; i++) spawnAI(FACTIONS.RED, islands[2]);  // Desert City
    for(let i=0; i<12; i++) spawnAI(FACTIONS.GREEN, islands[6]); // Old City
    // Snow City Guards
    for(let i=0; i<12; i++) spawnAI(FACTIONS.NEUTRAL, islands[5]); 

    if (gameMode === 'MAIN') {
        // Create Player immediately in Main Mode
        entities.player = new Unit(1500, 1500, FACTIONS.PLAYER, true);
        entities.units.push(entities.player);
        
        generateJob();
        document.getElementById('shop-panel').style.display = 'block';
    } else {
        // Blackpost Mode: Plane Drop
        gameState = 'PLANE';
        document.getElementById('shop-panel').style.display = 'none';
        plane = { x: -200, y: 500 + Math.random() * 2000, speed: 15 };
        jobPanel.innerText = "SURVIVE THE BLACKZONES";
    }

    loop();
}

function generateWorld() {
    // Generate buildings in city zones
    const cityZones = [islands[1], islands[2], islands[6]]; // New, Desert, Old
    cityZones.forEach(zone => {
        for (let i = 0; i < 15; i++) { // 15 buildings per city
            const w = 40 + Math.random() * 80;
            const h = 40 + Math.random() * 80;
            const x = zone.x + Math.random() * (zone.w - w);
            const y = zone.y + Math.random() * (zone.h - h);
            entities.buildings.push(new Building(x, y, w, h));
        }
    });

    // Spawn some neutral vehicles
    for(let i=0; i<10; i++) {
        entities.vehicles.push(new Vehicle(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT));
    }
}

function spawnAI(faction, area) {
    const x = area.x + Math.random() * area.w;
    const y = area.y + Math.random() * area.h;
    entities.units.push(new Unit(x, y, faction));
}

function shoot(unit) {
    entities.bullets.push(new Bullet(unit.x, unit.y, unit.angle, unit.faction));
}

function createExplosion(x, y, color, count) {
    for(let i=0; i<count; i++) {
        entities.particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 20,
            color: color
        });
    }
}

function addMoney(amount) {
    playerMoney += amount;
    // Auto-upgrade only in Blackpost mode
    if (gameMode === 'BLACKPOST') {
        if (playerMoney > playerLevel * 1000) {
            playerMoney -= playerLevel * 1000;
            playerLevel++;
            createExplosion(entities.player.x, entities.player.y, '#FFD700', 50);
        }
    }
}

// --- MAIN MODE SYSTEMS ---

function generateJob() {
    if (gameMode !== 'MAIN') return;
    const candidates = entities.posts.filter(p => p.owner.id !== 'player');
    if (candidates.length === 0) {
        jobPanel.innerText = "All posts captured! You rule the city.";
        return;
    }
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    currentJob = {
        target: target,
        reward: 1500,
        desc: `CONTRACT: Capture Post in ${getZoneName(target.x, target.y)}`
    };
    jobPanel.innerText = currentJob.desc;
}

function checkJobCompletion(post) {
    if (currentJob && currentJob.target === post && post.owner.id === 'player') {
        addMoney(currentJob.reward);
        createExplosion(entities.player.x, entities.player.y, '#FFD700', 100);
        jobPanel.innerText = `CONTRACT COMPLETE! +$${currentJob.reward}`;
        currentJob = null;
        jobTimeout = setTimeout(generateJob, 3000);
    }
}

function getZoneName(x, y) {
    for(let island of islands) {
        if (x >= island.x && x <= island.x + island.w && y >= island.y && y <= island.y + island.h) {
            return island.name;
        }
    }
    return "Wilderness";
}

function interact() {
    if (!entities.player) return;

    if (entities.player.currentVehicle) {
        // Exit vehicle
        const v = entities.player.currentVehicle;
        v.driver = null;
        entities.player.currentVehicle = null;
        entities.player.x += 40; // Eject to the side
    } else {
        // Try to enter vehicle
        for (const v of entities.vehicles) {
            if (!v.driver && Math.hypot(v.x - entities.player.x, v.y - entities.player.y) < 50) {
                entities.player.currentVehicle = v;
                v.driver = entities.player;
                v.faction = entities.player.faction;
                break;
            }
        }
    }
}

function buyItem(key) {
    if (gameMode !== 'MAIN') return;
    
    if (key === 'Digit1' && playerMoney >= 200) {
        playerMoney -= 200;
        entities.player.hp = Math.min(entities.player.hp + 50, entities.player.maxHp);
        createExplosion(entities.player.x, entities.player.y, '#0f0', 10);
    } else if (key === 'Digit2' && playerMoney >= 1000) {
        playerMoney -= 1000;
        playerLevel++;
        createExplosion(entities.player.x, entities.player.y, '#00f', 20);
    } else if (key === 'Digit3' && playerMoney >= 2500) {
        playerMoney -= 2500;
        // Spawn vehicle near player
        entities.vehicles.push(new Vehicle(entities.player.x + 50, entities.player.y));
    }
}

function updateStrategicAI() {
    strategicTimer++;
    if (strategicTimer > 600) { // Every ~10 seconds
        
        // Factions reinforce if they are weak
        [FACTIONS.RED, FACTIONS.BLUE, FACTIONS.GREEN].forEach(faction => {
            const ownedPosts = entities.posts.filter(p => p.owner.id === faction.id).length;
            if (ownedPosts < 15) {
                // Spawn reinforcement squad at their capital
                let spawnZone = islands[1]; // Default
                if (faction === FACTIONS.RED) spawnZone = islands[2];
                if (faction === FACTIONS.GREEN) spawnZone = islands[6];
                
                for(let i=0; i<4; i++) spawnAI(faction, spawnZone);
            }
        });

        // Gangs spawn in forests (Canon 3.2)
        if (Math.random() < 0.4) {
            const forestZones = [0, 3, 4, 7];
            const zoneIdx = forestZones[Math.floor(Math.random() * forestZones.length)];
            for(let i=0; i<3; i++) spawnAI(FACTIONS.GANG, islands[zoneIdx]);
        }
        
        strategicTimer = 0;
    }
}

function update() {
    if (!gameRunning) return;

    // --- PLANE DROP STATE ---
    if (gameState === 'PLANE') {
        plane.x += plane.speed;
        camera.x = plane.x - canvas.width / 2;
        camera.y = plane.y - canvas.height / 2;
        jobPanel.innerText = "PRESS [SPACE] TO DEPLOY";

        // Auto-drop at end of map
        if (plane.x > WORLD_WIDTH + 500) {
            deployPlayer();
        }
        return; // Skip rest of update
    }

    // Blackpost Logic
    if (gameMode === 'BLACKPOST') {
        blackpostTimer++;
        if (blackpostTimer > BLACKPOST_INTERVAL) {
            blackpostTimer = 0;
            // Activate 5 random posts (Canon 6.2)
            for(let i=0; i<5; i++) {
                const p = entities.posts[Math.floor(Math.random() * entities.posts.length)];
                p.isBlackpost = true;
                p.blackzoneRadius = 50;
            }
            blackpostActive = true;
        }
    } else {
        // Main Mode Logic
        updateStrategicAI();
    }

    // Update Posts
    entities.posts.forEach(p => p.update());

    // Update Vehicles
    entities.vehicles.forEach(v => v.update());

    // Update Units
    for (let i = entities.units.length - 1; i >= 0; i--) {
        const u = entities.units[i];
        u.update();
        if (u.hp <= 0) entities.units.splice(i, 1);
    }

    // Update Bullets & Collisions
    for (let i = entities.bullets.length - 1; i >= 0; i--) {
        const b = entities.bullets[i];
        b.update();

        let hit = false;

        // Check Post Collision
        for (const p of entities.posts) {
            if (Math.abs(b.x - p.x) < p.w/2 && Math.abs(b.y - p.y) < p.h/2) {
                p.takeDamage(b.damage, b.ownerFaction);
                createExplosion(b.x, b.y, '#fff', 2);
                hit = true;
                // Small money for hitting enemy
                if (b.ownerFaction.id === 'player' && p.owner.id !== 'player') addMoney(10);
                break;
            }
        }

        if (hit || b.life <= 0) {
            entities.bullets.splice(i, 1);
        }
    }

    // Particles
    for (let i = entities.particles.length - 1; i >= 0; i--) {
        const p = entities.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if(p.life <= 0) entities.particles.splice(i, 1);
    }

    // Camera Follow
    if (entities.player) {
        camera.x = entities.player.x - canvas.width / 2;
        camera.y = entities.player.y - canvas.height / 2;
    }

    // Update UI
    updateStats();
}

function deployPlayer() {
    gameState = 'PLAYING';
    entities.player = new Unit(plane.x, plane.y, FACTIONS.PLAYER, true);
    entities.units.push(entities.player);
    jobPanel.innerText = "SURVIVE";
}

function updateStats() {
    const counts = { player: 0, red: 0, blue: 0, green: 0 };
    entities.posts.forEach(p => counts[p.owner.id] ? counts[p.owner.id]++ : null);
    
    let extraHtml = '';
    if (gameMode === 'BLACKPOST' && blackpostActive) {
        extraHtml = '<br><span style="color:red; font-weight:bold;">⚠ BLACKPOST EVENT ⚠</span>';
    }

    statsDiv.innerHTML = `
        <span style="color:${FACTIONS.PLAYER.color}">PLAYER: ${counts.player || 0}</span> | 
        <span style="color:#FFD700">$${playerMoney} (Lvl ${playerLevel})</span><br>
        <span style="color:${FACTIONS.RED.color}">RED: ${counts.red || 0}</span><br>
        <span style="color:${FACTIONS.BLUE.color}">BLUE: ${counts.blue || 0}</span><br>
        <span style="color:${FACTIONS.GREEN.color}">GREEN: ${counts.green || 0}</span>
        ${extraHtml}
    `;
}

function draw() {
    if (!gameRunning) return;

    // Background
    ctx.fillStyle = '#050505'; // Deep water
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    if (gameState === 'PLANE') {
        // Draw Plane
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(plane.x + 40, plane.y);
        ctx.lineTo(plane.x - 20, plane.y - 30);
        ctx.lineTo(plane.x - 20, plane.y + 30);
        ctx.fill();
    }

    // Draw Roads (Visual only)
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 60;
    ctx.beginPath();
    // Horizontal road
    ctx.moveTo(0, WORLD_HEIGHT / 2);
    ctx.lineTo(WORLD_WIDTH, WORLD_HEIGHT / 2);
    // Vertical roads
    ctx.moveTo(WORLD_WIDTH * 0.25, 0); ctx.lineTo(WORLD_WIDTH * 0.25, WORLD_HEIGHT);
    ctx.moveTo(WORLD_WIDTH * 0.75, 0); ctx.lineTo(WORLD_WIDTH * 0.75, WORLD_HEIGHT);
    ctx.stroke();

    // Draw Islands
    islands.forEach(island => {
        ctx.fillStyle = island.color;
        ctx.fillRect(island.x, island.y, island.w, island.h);
        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        for(let x=island.x; x<=island.x+island.w; x+=100) { ctx.moveTo(x, island.y); ctx.lineTo(x, island.y+island.h); }
        for(let y=island.y; y<=island.y+island.h; y+=100) { ctx.moveTo(island.x, y); ctx.lineTo(island.x+island.w, y); }
        ctx.stroke();
    });

    // Draw Entities
    entities.buildings.forEach(b => b.draw());
    entities.posts.forEach(p => p.draw());
    entities.units.forEach(u => u.draw());
    entities.bullets.forEach(b => b.draw());
    entities.vehicles.forEach(v => v.draw());
    entities.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 4);
    });

    ctx.restore();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// --- INPUT ---
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyF') {
        interact();
    } else {
        buyItem(e.code);
    }
    if (e.code === 'Space' && gameState === 'PLANE') {
        deployPlayer();
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.worldX = mouse.x + camera.x;
    mouse.worldY = mouse.y + camera.y;
});
window.addEventListener('mousedown', () => mouse.down = true);
window.addEventListener('mouseup', () => mouse.down = false);
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Note: Game starts via HTML buttons calling startGame()
