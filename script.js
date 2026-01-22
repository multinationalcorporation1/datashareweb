const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statsDiv = document.getElementById('stats');
const uiLayer = document.getElementById('ui-layer');
const mainMenu = document.getElementById('main-menu');
const jobPanel = document.getElementById('job-panel');
const wantedDiv = document.getElementById('wanted-level');
const gpDiv = document.getElementById('gp-display');

// --- CONFIGURATION ---
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;

const FACTIONS = {
    NEUTRAL: { id: 'neutral', color: '#555' },
    PLAYER: { id: 'player', color: '#f1c40f' }, // Yellow
    GOVERNMENT: { id: 'gov', color: '#3498db' }, // Blue (Order)
    GANG: { id: 'gang', color: '#e74c3c' }       // Red (Chaos/Aggression)
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
    props: [],
    vehicles: []
};

let plane = null; // For Blackpost drops

const islands = [
    // 4 Core Cities on separate islands
    { name: "New City", x: 100, y: 100, w: 1300, h: 1300, color: '#1a2530', gangRatio: 0.01 }, // 99% Gov
    { name: "Snow City", x: 1600, y: 100, w: 1300, h: 1300, color: '#2c3e50', gangRatio: 0.40 }, // 60% Gov
    { name: "Fire City", x: 100, y: 1600, w: 1300, h: 1300, color: '#3b1e1e', gangRatio: 0.40 }, // 60% Gov
    { name: "Old City", x: 1600, y: 1600, w: 1300, h: 1300, color: '#1e272e', gangRatio: 0.60 }  // 40% Gov
];

// Mode Specific State
let blackpostTimer = 0;
const BLACKPOST_INTERVAL = 3600; // 60 seconds (Canon)
let blackpostActive = false;

let currentJob = null;
let strategicTimer = 0;
let jobTimeout = null;

let playerWantedLevel = 0; // 0 to 5
let wantedLevelTimer = 0;
let playerGP = 0; // Goodness Points (-Infinity to +Infinity)
const WANTED_DECAY_TIME = 1200; // 20 seconds to lose one level

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
        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(this.x + 8, this.y + 8, this.w, this.h);

        // Rooftop (GTA 1 Style flat shading)
        ctx.fillStyle = '#34495e'; // Dark Blue-Grey Roof
        ctx.fillRect(this.x, this.y, this.w, this.h);
        
        // Roof Border/Parapet
        ctx.strokeStyle = '#5d6d7e';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4);

        // Rooftop Detail (AC Unit)
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(this.x + 10, this.y + 10, 15, 15);
    }
}

class Prop {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 8;
        this.h = 40;
        this.hp = 10;
        this.color = '#707B7C';
    }
    draw() {
        if (this.hp <= 0) return;
        // Post
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.w / 2, this.y - this.h, this.w, this.h);
        // Light
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(this.x, this.y - this.h, 10, 0, Math.PI * 2);
        ctx.fill();
    }
    takeDamage(amount) {
        this.hp -= amount;
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

        // Vehicle collision with props
        if (Math.abs(this.speed) > 1) {
            for (const p of entities.props) {
                if (p.hp > 0 && Math.hypot(this.x - p.x, this.y - p.y) < 30) {
                    p.takeDamage(10);
                    this.speed *= 0.8; // Slow down on impact
                    createExplosion(p.x, p.y, p.color, 5);
                }
            }
        }

        if (this.driver) {
            this.driver.x = this.x;
            this.driver.y = this.y;
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Car Body
        ctx.fillStyle = this.driver ? this.driver.faction.color : '#95a5a6';
        // Main chassis
        ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
        
        // Roof (Darker area)
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(-this.w / 2 + 2, -this.h / 2 + 12, this.w - 4, this.h - 18);

        // Windshield (Blue tint)
        ctx.fillStyle = '#85c1e9';
        ctx.fillRect(-this.w / 2 + 3, -this.h / 2 + 8, this.w - 6, 4);
        ctx.fillRect(-this.w / 2 + 3, this.h / 2 - 8, this.w - 6, 3); // Rear window

        // Headlights
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(-this.w / 2 + 2, -this.h / 2, 6, 4);
        ctx.fillRect(this.w / 2 - 8, -this.h / 2, 6, 4);

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

        // Draw "Post" Symbol (Radio Tower X)
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(this.x - 10, this.y - 10); ctx.lineTo(this.x + 10, this.y + 10);
        ctx.moveTo(this.x + 10, this.y - 10); ctx.lineTo(this.x - 10, this.y + 10);
        ctx.stroke();

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
                const previousOwner = this.owner;
                // FLIP OWNERSHIP
                this.points = 10; 
                this.owner = shooterFaction;
                createExplosion(this.x, this.y, this.owner.color, 20);
                
                // Player Actions & GP
                if (shooterFaction.id === FACTIONS.PLAYER.id) {
                    if (previousOwner.id === FACTIONS.GOVERNMENT.id) {
                        modifyGP(-100); // Destabilizing action
                        increaseWantedLevel();
                    } else if (previousOwner.id === FACTIONS.GANG.id) {
                        modifyGP(50); // Stabilizing action
                    }
                }
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
        this.isCivilian = faction.id === FACTIONS.NEUTRAL.id;
        this.aiState = 'wander';
        this.wanderTarget = { x: x, y: y };
    }

    takeDamage(amount, attackerFaction) {
        this.hp -= amount;
        if (this.hp <= 0) {
            createExplosion(this.x, this.y, this.faction.color, 30);
            // If player killed a gov unit, increase wanted level
            if (attackerFaction.id === FACTIONS.PLAYER.id) {
                if (this.faction.id === FACTIONS.GOVERNMENT.id) {
                    modifyGP(-20); // Killing law force
                    increaseWantedLevel();
                } else if (this.faction.id === FACTIONS.GANG.id) {
                    modifyGP(10); // Stopping gang members
                } else if (this.isCivilian) {
                    modifyGP(-50); // Killing civilian
                    increaseWantedLevel();
                }
            }
        }
    }

    update() {
        if (this.hp <= 0) return;

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
        } else if (this.isCivilian) {
            // --- CIVILIAN AI ---
            if (this.aiState === 'wander') {
                const distToTarget = Math.hypot(this.wanderTarget.x - this.x, this.wanderTarget.y - this.y);
                if (distToTarget < 20 || Math.random() < 0.01) {
                    this.wanderTarget.x = this.x + (Math.random() - 0.5) * 200;
                    this.wanderTarget.y = this.y + (Math.random() - 0.5) * 200;
                }
                this.angle = Math.atan2(this.wanderTarget.y - this.y, this.wanderTarget.x - this.x);
                this.x += Math.cos(this.angle) * (this.speed * 0.5);
                this.y += Math.sin(this.angle) * (this.speed * 0.5);

                // Check for danger (nearby Gangs or gunfire)
                for (const u of entities.units) {
                    if (u.faction.id === FACTIONS.GANG.id && Math.hypot(u.x - this.x, u.y - this.y) < 150) {
                        this.aiState = 'flee';
                        this.target = u; // Flee from this unit
                        break;
                    }
                }
            } else if (this.aiState === 'flee') {
                if (!this.target || this.target.hp <= 0 || Math.hypot(this.target.x - this.x, this.target.y - this.y) > 300) {
                    this.aiState = 'wander'; // Danger has passed
                    this.target = null;
                } else {
                    this.angle = Math.atan2(this.y - this.target.y, this.x - this.target.x);
                    this.x += Math.cos(this.angle) * this.speed;
                    this.y += Math.sin(this.angle) * this.speed;
                }
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
        // AI LOGIC: Gangs Attack, Governments Defend
        let nearest = null;
        let minDst = Infinity;

        if (this.faction.id === FACTIONS.GANG.id) {
            // Gangs look for Government posts to attack
            entities.posts.forEach(p => {
                if (p.owner.id === FACTIONS.GOVERNMENT.id || p.owner.id === FACTIONS.PLAYER.id) {
                    const d = Math.hypot(p.x - this.x, p.y - this.y);
                    if (d < minDst) {
                        minDst = d;
                        nearest = p;
                    }
                }
            });
        } else if (this.faction.id === FACTIONS.GOVERNMENT.id) {
            // Government AI prioritizes player if wanted level is high
            if (playerWantedLevel > 0 && entities.player && entities.player.hp > 0) {
                const playerDist = Math.hypot(entities.player.x - this.x, entities.player.y - this.y);
                // Aggression range increases with wanted level
                if (playerDist < 200 + (playerWantedLevel * 100)) {
                    this.target = entities.player;
                    return;
                }
            }

            // Government looks for Gang UNITS to defend against
            entities.units.forEach(u => {
                if (u.faction.id === FACTIONS.GANG.id || u.faction.id === FACTIONS.PLAYER.id) {
                    const d = Math.hypot(u.x - this.x, u.y - this.y);
                    if (d < minDst) {
                        minDst = d;
                        nearest = u;
                        if (u.isPlayer) minDst *= 1.5; // De-prioritize player unless wanted
                    }
                }
            });
        }
        
        this.target = nearest;
    }

    draw() {
        if (this.hp <= 0 || this.currentVehicle) return; // Don't draw if dead or in vehicle

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Shoulders (Oval)
        ctx.fillStyle = this.faction.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius, this.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Head (Circle)
        ctx.fillStyle = '#f5cba7'; // Skin tone
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        
        if (this.isCivilian) {
            ctx.restore();
            return;
        }
        // Gun
        ctx.fillStyle = '#111';
        ctx.fillRect(4, -2, 14, 4);

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

        // Collision with props
        for (const p of entities.props) {
            if (p.hp > 0 && Math.hypot(this.x - p.x, this.y - p.y) < p.h) {
                p.takeDamage(this.damage);
                this.life = 0; // Kill bullet
                createExplosion(this.x, this.y, p.color, 3);
                return; // Exit early to prevent other collisions
            }
        }

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
    entities.props = [];
    entities.player = null;
    currentJob = null;
    if (jobTimeout) clearTimeout(jobTimeout);
    playerMoney = 0;
    playerLevel = 1;
    blackpostActive = false;
    blackpostTimer = 0;
    playerWantedLevel = 0;
    wantedLevelTimer = 0;
    playerGP = 0;

    generateWorld();

    // Generate Posts (Canon: 50 per city)
    islands.forEach((island, idx) => {
        for (let i = 0; i < 50; i++) {
            // Cluster posts in the "City Center" (inner 70% of island)
            const margin = 200;
            const px = island.x + margin + Math.random() * (island.w - margin*2);
            const py = island.y + margin + Math.random() * (island.h - margin*2);
            
            const post = new Post(px, py, `P-${idx}-${i}`);
            // Apply Canon Ratios
            post.owner = Math.random() < island.gangRatio ? FACTIONS.GANG : FACTIONS.GOVERNMENT;
            post.points = 100; // Full health
            entities.posts.push(post);
        }
    });

    // Spawn Initial Forces
    islands.forEach(island => {
        // Government Guards (Defenders)
        for(let i=0; i<10; i++) spawnAI(FACTIONS.GOVERNMENT, island);
        // Gang Cells (Attackers) - fewer in New City, more in Old City
        const gangCount = Math.floor(20 * island.gangRatio);
        for(let i=0; i<gangCount; i++) spawnAI(FACTIONS.GANG, island);
    });

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
    islands.forEach(island => {
        for (let i = 0; i < 20; i++) {
            const w = 50 + Math.random() * 100;
            const h = 50 + Math.random() * 100;
            const x = island.x + Math.random() * (island.w - w);
            const y = island.y + Math.random() * (island.h - h);
            entities.buildings.push(new Building(x, y, w, h));
        }
        // Spawn props (streetlights)
        for (let i = 0; i < 30; i++) {
            const x = island.x + Math.random() * island.w;
            const y = island.y + Math.random() * island.h;
            entities.props.push(new Prop(x, y));
        }
        // Spawn civilians
        for (let i = 0; i < 15; i++) {
            const x = island.x + Math.random() * island.w;
            const y = island.y + Math.random() * island.h;
            entities.units.push(new Unit(x, y, FACTIONS.NEUTRAL));
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

function increaseWantedLevel() {
    if (gameMode !== 'MAIN') return;
    if (playerWantedLevel < 5) {
        playerWantedLevel++;
    }
    wantedLevelTimer = 0; // Reset decay timer on new offense
}

function updateWantedLevel() {
    if (playerWantedLevel > 0) {
        wantedLevelTimer++;
        if (wantedLevelTimer > WANTED_DECAY_TIME) {
            playerWantedLevel--;
            wantedLevelTimer = 0;
        }
    }
    wantedDiv.innerHTML = 'WANTED: ' + '★'.repeat(playerWantedLevel) + '☆'.repeat(5 - playerWantedLevel);
}

function modifyGP(amount) {
    playerGP += amount;
    updateGPDisplay();
}

function updateGPDisplay() {
    let rank = "CITIZEN";
    let color = "#eee";

    if (playerGP >= 1000) { rank = "GOV COMMANDER"; color = "#3498db"; }
    else if (playerGP >= 500) { rank = "POLICE CAPTAIN"; color = "#3498db"; }
    else if (playerGP >= 100) { rank = "DEPUTY"; color = "#3498db"; }
    else if (playerGP <= -1000) { rank = "GANG KINGPIN"; color = "#e74c3c"; }
    else if (playerGP <= -500) { rank = "UNDERWORLD BOSS"; color = "#e74c3c"; }
    else if (playerGP <= -100) { rank = "THUG"; color = "#e74c3c"; }

    gpDiv.innerHTML = `GP: ${playerGP} <span style="color:${color}">[${rank}]</span>`;
}

function generateJob() {
    if (gameMode !== 'MAIN') return;
    
    // Job alignment depends on GP (Positive -> Legal, Negative -> Illegal)
    // If Neutral (-100 to 100), random.
    let isLegal = Math.random() > 0.5;
    if (playerGP > 100) isLegal = true;
    if (playerGP < -100) isLegal = false;

    // Legal: Target Gang posts. Illegal: Target Gov posts.
    const targetFaction = isLegal ? FACTIONS.GANG : FACTIONS.GOVERNMENT;
    const candidates = entities.posts.filter(p => p.owner.id === targetFaction.id);
    
    if (candidates.length === 0) {
        jobPanel.innerText = "No contracts available right now.";
        return;
    }
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    currentJob = {
        target: target,
        reward: 1500,
        isLegal: isLegal,
        desc: `${isLegal ? 'LEGAL' : 'ILLEGAL'} JOB: Capture ${getZoneName(target.x, target.y)}`
    };
    jobPanel.innerText = currentJob.desc;
}

function checkJobCompletion(post) {
    if (currentJob && currentJob.target === post && post.owner.id === 'player') {
        addMoney(currentJob.reward);
        createExplosion(entities.player.x, entities.player.y, '#FFD700', 100);
        
        if (currentJob.isLegal) {
            modifyGP(100); // Completed legal job
        } else {
            modifyGP(-100); // Completed illegal job
        }

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
        strategicTimer = 0;

        // 1. Government Reinforcement (Defensive)
        // They spawn at their own posts to hold the line
        const govPosts = entities.posts.filter(p => p.owner.id === FACTIONS.GOVERNMENT.id);
        if (govPosts.length > 0 && Math.random() < 0.5) {
            const spawnPost = govPosts[Math.floor(Math.random() * govPosts.length)];
            entities.units.push(new Unit(spawnPost.x, spawnPost.y, FACTIONS.GOVERNMENT));
        }

        // 2. Gang Expansion (Aggressive)
        // They spawn in the "Forests" (edges of islands) and attack
        islands.forEach(island => {
            if (Math.random() < 0.4) { // 40% chance per cycle
                // Spawn on edge
                const x = Math.random() < 0.5 ? island.x : island.x + island.w;
                const y = island.y + Math.random() * island.h;
                entities.units.push(new Unit(x, y, FACTIONS.GANG));
            }
        });
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
        updateWantedLevel();
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

        // Unit Collision
        for (const u of entities.units) {
            if (u.hp > 0 && (u.faction.id !== b.ownerFaction.id || u.isPlayer)) {
                if (Math.hypot(b.x - u.x, b.y - u.y) < u.radius) {
                    if (!u.isPlayer && u.faction.id === b.ownerFaction.id) continue;
                    u.takeDamage(b.damage, b.ownerFaction);
                    hit = true;
                    break;
                }
            }
        }

        // Post Collision
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

        if (hit || b.life <= 0) { // hit is from unit collision, life is from prop/building
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
    updateGPDisplay();
}

function deployPlayer() {
    gameState = 'PLAYING';
    entities.player = new Unit(plane.x, plane.y, FACTIONS.PLAYER, true);
    entities.units.push(entities.player);
    jobPanel.innerText = "SURVIVE";
}

function updateStats() {
    const counts = { player: 0, gov: 0, gang: 0 };
    entities.posts.forEach(p => counts[p.owner.id] ? counts[p.owner.id]++ : null);
    
    let extraHtml = '';
    if (gameMode === 'BLACKPOST' && blackpostActive) {
        extraHtml = '<br><span style="color:red; font-weight:bold;">⚠ BLACKPOST EVENT ⚠</span>';
    }

    statsDiv.innerHTML = `
        <span style="color:${FACTIONS.PLAYER.color}">PLAYER: ${counts.player || 0}</span> | 
        <span style="color:#FFD700">$${playerMoney} (Lvl ${playerLevel})</span><br>
        <span style="color:${FACTIONS.GOVERNMENT.color}">GOVERNMENT: ${counts.gov || 0}</span><br>
        <span style="color:${FACTIONS.GANG.color}">GANGS: ${counts.gang || 0}</span>
        ${extraHtml}
    `;
}

function draw() {
    if (!gameRunning) return;

    // Background
    ctx.fillStyle = '#154360'; // Deep Ocean Blue
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

    // Draw Bridges (Connecting the 4 islands)
    ctx.strokeStyle = '#566573'; // Asphalt Grey
    ctx.lineWidth = 100;
    ctx.beginPath();
    // Top Bridge (New -> Snow)
    ctx.moveTo(1400, 750); ctx.lineTo(1600, 750);
    // Bottom Bridge (Fire -> Old)
    ctx.moveTo(1400, 2250); ctx.lineTo(1600, 2250);
    // Left Bridge (New -> Fire)
    ctx.moveTo(750, 1400); ctx.lineTo(750, 1600);
    // Right Bridge (Snow -> Old)
    ctx.moveTo(2250, 1400); ctx.lineTo(2250, 1600);
    // Center Cross (Optional Hub)
    ctx.moveTo(1400, 1400); ctx.lineTo(1600, 1600);
    ctx.stroke();
    
    // Bridge Markings
    ctx.strokeStyle = '#f1c40f'; // Yellow lines
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 20]);
    ctx.stroke();
    ctx.setLineDash([]); // Reset

    // Draw Islands
    islands.forEach(island => {
        // Ground
        ctx.fillStyle = '#7f8c8d'; // Concrete Grey base
        if (island.name.includes("Snow")) ctx.fillStyle = '#d6dbdf'; // Snow
        if (island.name.includes("Fire")) ctx.fillStyle = '#935116'; // Dirt/Desert
        
        ctx.fillRect(island.x, island.y, island.w, island.h);
        
        // City Grid (Roads)
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 40;
        ctx.beginPath();
        // Draw a grid every 200px
        for(let x=island.x + 100; x<=island.x+island.w; x+=200) { ctx.moveTo(x, island.y); ctx.lineTo(x, island.y+island.h); }
        for(let y=island.y + 100; y<=island.y+island.h; y+=200) { ctx.moveTo(island.x, y); ctx.lineTo(island.x+island.w, y); }
        ctx.stroke();
    });

    // Draw Entities
    entities.buildings.forEach(b => b.draw());
    entities.props.forEach(p => p.draw());
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
