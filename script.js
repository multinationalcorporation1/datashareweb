const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statsDiv = document.getElementById('stats');
const uiLayer = document.getElementById('ui-layer');
const mainMenu = document.getElementById('main-menu');
const jobPanel = document.getElementById('job-panel');
const wantedDiv = document.getElementById('wanted-level');
const gpDiv = document.getElementById('gp-display');
const allegianceDiv = document.getElementById('allegiance-display');
const gameOverScreen = document.getElementById('game-over');

// --- CONFIGURATION ---
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 4000;

const FACTIONS = {
    NEUTRAL: { id: 'neutral', color: '#555' },
    PLAYER: { id: 'player', color: '#f1c40f' }, // Yellow
    NEW_POLICE: { id: 'new_police', color: '#3498db', name: 'New City Police' },
    DESERT_POLICE: { id: 'desert_police', color: '#e67e22', name: 'Desert Police' },
    DESERT_GANG: { id: 'desert_gang', color: '#c0392b', name: 'Desert Gangs' },
    SNOW_POLICE: { id: 'snow_police', color: '#aed6f1', name: 'Snow Police' },
    SNOW_GANG: { id: 'snow_gang', color: '#7f8c8d', name: 'Snow Gangs' },
    OLD_POLICE: { id: 'old_police', color: '#27ae60', name: 'Old Police' },
    OLD_GANG: { id: 'old_gang', color: '#8e44ad', name: 'Old Gangs' },
    ANIMAL: { id: 'animal', color: '#2ecc71', name: 'Guardian' }
};

// --- GAME STATE ---
let gameMode = null; // 'MAIN' or 'BLACKPOST'
let gameState = 'MENU'; // MENU, PLANE, PLAYING
let gameRunning = false;
const camera = { x: 0, y: 0 };
const keys = {};
const mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false };

const entities = {
    waves: [], // For water graphics
    player: null,
    posts: [],
    bullets: [],
    units: [],
    particles: [],
    buildings: [],
    jobCenters: [],
    treasures: [],
    props: [],
    vehicles: []
};

let plane = null; // For Blackpost drops
let playerAllegiance = FACTIONS.NEW_POLICE;

const islands = [
    // 4 Core Cities
    { name: "New City", x: 100, y: 100, w: 1500, h: 1500, color: '#1a2530', factions: [FACTIONS.NEW_POLICE] },
    { name: "Snow City", x: 2400, y: 100, w: 1500, h: 1500, color: '#2c3e50', factions: [FACTIONS.SNOW_POLICE, FACTIONS.SNOW_GANG] },
    { name: "Fire City", x: 100, y: 2400, w: 1500, h: 1500, color: '#3b1e1e', factions: [FACTIONS.DESERT_POLICE, FACTIONS.DESERT_GANG] },
    { name: "Old City", x: 2400, y: 2400, w: 1500, h: 1500, color: '#1e272e', factions: [FACTIONS.OLD_POLICE, FACTIONS.OLD_GANG] },
    // Forests
    { name: "North Forest", x: 1700, y: 100, w: 600, h: 1500, color: '#145a32', type: 'forest' },
    { name: "South Forest", x: 1700, y: 2400, w: 600, h: 1500, color: '#145a32', type: 'forest' },
    { name: "West Forest", x: 100, y: 1700, w: 1500, h: 600, color: '#145a32', type: 'forest' },
    { name: "East Forest", x: 2400, y: 1700, w: 1500, h: 600, color: '#145a32', type: 'forest' },
    { name: "Central Hub", x: 1700, y: 1700, w: 600, h: 600, color: '#145a32', type: 'forest' }
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

const CITY_GRID_SIZE = 150;
const CITY_ROAD_WIDTH = 50;

// --- CLASSES ---

class Treasure {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.collected = false;
    }
    draw() {
        if (this.collected) return;
        ctx.fillStyle = '#f1c40f'; // Gold
        ctx.fillRect(this.x - 15, this.y - 15, 30, 30);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x - 15, this.y - 15, 30, 30);
        ctx.fillStyle = '#e67e22';
        ctx.fillRect(this.x - 5, this.y - 5, 10, 10); // Lock
    }
}

class JobCenter {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 100;
        this.h = 100;
        this.color = '#8e44ad'; // Purple distinctive color
    }
    draw() {
        // Base
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.w, this.h);
        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.strokeRect(this.x, this.y, this.w, this.h);
        // Text Label
        ctx.fillStyle = '#fff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText("JOBS", this.x + this.w/2, this.y + this.h/2);
    }
}

class Building {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.enterable = true;
        this.color = ['#34495e', '#2c3e50', '#4a235a', '#1b4f72', '#145a32'][Math.floor(Math.random() * 5)];
    }
    draw() {
        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(this.x + 8, this.y + 8, this.w, this.h);

        // Rooftop (GTA 1 Style flat shading)
        ctx.fillStyle = this.color; 
        ctx.fillRect(this.x, this.y, this.w, this.h);
        
        // Roof Border/Parapet
        ctx.strokeStyle = '#5d6d7e';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4);

        // Windows (Grid pattern)
        ctx.fillStyle = '#17202a';
        for(let wx = this.x + 6; wx < this.x + this.w - 10; wx += 12) {
            for(let wy = this.y + 6; wy < this.y + this.h - 10; wy += 12) {
                ctx.fillRect(wx, wy, 6, 6);
            }
        }

        // Entrance / Door
        ctx.fillStyle = '#000';
        ctx.fillRect(this.x + this.w/2 - 8, this.y + this.h, 16, 4); // Door at bottom edge
        ctx.fillStyle = '#555';
        ctx.fillRect(this.x + this.w/2 - 8, this.y + this.h + 4, 16, 4); // Doormat

        // Rooftop Detail (AC Unit)
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(this.x + 10, this.y + 10, 15, 15);
        ctx.fillStyle = '#95a5a6';
        ctx.beginPath(); ctx.arc(this.x + 17.5, this.y + 17.5, 5, 0, Math.PI*2); ctx.fill(); // Fan
    }
}

class Prop {
    constructor(x, y, type = 'light') {
        this.x = x;
        this.y = y;
        this.type = type;
        this.w = type === 'tree' ? 24 : 8;
        this.h = type === 'tree' ? 24 : 40;
        this.hp = 10;
        this.color = '#707B7C';
    }
    draw() {
        if (this.hp <= 0) return;
        
        if (this.type === 'light') {
            // Post
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x - this.w / 2, this.y - this.h, this.w, this.h);
            // Light
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.arc(this.x, this.y - this.h, 10, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'tree') {
            // Tree Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.arc(this.x + 5, this.y + 5, 15, 0, Math.PI * 2);
            ctx.fill();
            // Tree Top
            ctx.fillStyle = '#229954';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1e8449'; // Center
            ctx.beginPath();
            ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
            ctx.fill();
        }
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
        
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-this.w / 2 + 5, -this.h / 2 + 5, this.w, this.h);

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
            // If player shoots, use their allegiance
            const attackingFaction = shooterFaction.id === 'player' ? playerAllegiance : shooterFaction;
            
            if (this.owner.id === attackingFaction.id) {
                 this.points = Math.min(100, this.points + amount);
                 return;
            }

            // Damage enemy post
            this.points -= amount;
            if (this.points <= 0) {
                const previousOwner = this.owner;
                // FLIP OWNERSHIP
                this.points = 10; 
                this.owner = attackingFaction;
                createExplosion(this.x, this.y, this.owner.color, 20);
                
                // Player Actions & GP
                if (shooterFaction.id === FACTIONS.PLAYER.id) {
                    if (previousOwner.id.includes('police')) {
                        modifyGP(-100); // Destabilizing action
                        increaseWantedLevel();
                    } else if (previousOwner.id.includes('gang')) {
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
        this.isAnimal = faction.id === FACTIONS.ANIMAL.id;
        this.work = { type: 'IDLE', timer: Math.random() * 100 };
        this.wildState = false; // "Wild Randomness" Trigger
        this.personality = Math.random(); // 0.0 - 1.0 bias
        this.ideology = ['AGGRESSIVE', 'PASSIVE', 'PROTECTIVE', 'GREEDY'][Math.floor(Math.random() * 4)];
        this.wildTimer = 0; // Timeout for wild state
        this.homePost = null; // For Gov defense
        this.attackTarget = null; // For Gang attacks
        this.scanTimer = Math.floor(Math.random() * 60); // Performance throttling
        this.jobCenterTarget = null;
    }

    takeDamage(amount, attackerFaction) {
        this.hp -= amount;
        if (this.hp <= 0) {
            createExplosion(this.x, this.y, this.faction.color, 30);
            // If player killed a gov unit, increase wanted level
            if (attackerFaction.id === FACTIONS.PLAYER.id) {
                if (this.faction.id.includes('police')) {
                    modifyGP(-20); // Killing law force
                    increaseWantedLevel();
                } else if (this.faction.id.includes('gang')) {
                    modifyGP(10); // Stopping gang members
                } else if (this.isCivilian) {
                    modifyGP(-50); // Killing civilian
                    increaseWantedLevel();
                }
            } else if (attackerFaction.id !== this.faction.id) {
                // Self Defense: If attacked by enemy, fight back
                // Force combat scan immediately
                this.findTarget(true); 
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
        } else {
            // --- NPC SYSTEM: RAPID RANDOMNESS ---
            
            // 1. Check for Threats (Combat Override)
            this.findTarget();

            if (this.target) {
                // COMBAT STATE
                const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
                
                // Face target
                this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);

                if (dist < 300 && this.cooldown <= 0) {
                    shoot(this);
                    this.cooldown = 40 + Math.random() * 20;
                } else if (dist > 300) {
                    // Chase if out of range
                    this.x += Math.cos(this.angle) * this.speed;
                    this.y += Math.sin(this.angle) * this.speed;
                }
            } else {
                // LIFE STATE (Work System)
                this.executeWork();
            }
        }

        if (this.cooldown > 0) this.cooldown--;

        // World bounds
        this.x = Math.max(0, Math.min(WORLD_WIDTH, this.x));
        this.y = Math.max(0, Math.min(WORLD_HEIGHT, this.y));
    }

    executeWork() {
        // Check Wild State Completion (Gangs)
        if (this.wildState && this.faction.id.includes('gang') && this.attackTarget) {
            this.wildTimer++;
            if (this.wildTimer > 1800) { // Timeout after ~30 seconds if stuck
                this.wildState = false;
                this.attackTarget = null;
                this.wildTimer = 0;
                this.pickNewWork();
                return;
            }
            if (this.attackTarget.owner.id === this.faction.id) {
                this.wildState = false; // Calm down after victory
                this.attackTarget = null;
                this.pickNewWork();
            }
        }

        if (this.work.timer > 0) this.work.timer--;

        let moveTarget = null;
        let moveSpeed = this.speed * 0.5; // Default slow (Civilian speed)

        switch(this.work.type) {
            case 'IDLE':
            case 'LOITER':
                // Do nothing
                break;
            case 'STROLL':
            case 'PATROL':
                moveTarget = this.work.target;
                break;
            case 'SOCIAL':
                if (this.work.target && this.work.target.hp > 0) {
                    moveTarget = { x: this.work.target.x, y: this.work.target.y };
                    if (Math.hypot(this.x - moveTarget.x, this.y - moveTarget.y) < 40) moveTarget = null; // Stop near friend
                } else {
                    this.work.timer = 0; // Friend gone
                }
                break;
            case 'EXERCISE':
            case 'SMOKE':
            case 'PHONE':
                // Stationary tasks
                break;
            case 'GUARD_TREASURE':
                // Animal logic: stay near spawn
                break;
            case 'ASSAULT': // Wild Gang
                moveTarget = this.work.target;
                moveSpeed = this.speed; // Run
                break;
            case 'DEFEND': // Wild Gov
                moveTarget = this.work.target;
                moveSpeed = this.speed;
                if (Math.hypot(this.x - moveTarget.x, this.y - moveTarget.y) < 60) moveTarget = null; // Hold position
                break;
            case 'VISIT_JOB':
                moveTarget = this.work.target;
                // If arrived, wait a bit then leave
                if (Math.hypot(this.x - moveTarget.x, this.y - moveTarget.y) < 50) moveTarget = null;
                break;
        }

        if (moveTarget) {
            this.moveTo(moveTarget.x, moveTarget.y, moveSpeed);
            // Arrival check
            if (Math.hypot(this.x - moveTarget.x, this.y - moveTarget.y) < 15) {
                if (['STROLL', 'PATROL'].includes(this.work.type)) this.pickNewWork();
            }
        } else if (this.work.timer <= 0 && !['ASSAULT', 'DEFEND'].includes(this.work.type)) {
            // Work finished, pick new one
            this.pickNewWork();
        }
    }

    pickNewWork() {
        const options = [];
        
        // 1. WILD STATE (Event Driven)
        if (this.wildState) {
            if (this.faction.id.includes('gang') && this.attackTarget) {
                this.work = { type: 'ASSAULT', target: this.attackTarget };
                return;
            }
            if (this.faction.id.includes('police') && this.homePost) {
                this.work = { type: 'DEFEND', target: this.homePost };
                return;
            }
        }

        // 2. ANIMAL BEHAVIOR
        if (this.isAnimal) {
            options.push({ type: 'IDLE', weight: 1.0, duration: 100 });
            options.push({ type: 'STROLL', weight: 2.0, target: { x: this.x + (Math.random()-0.5)*200, y: this.y + (Math.random()-0.5)*200 } });
            // Animals guard their area
        }

        // 2. CIVILIAN LIFE (Default for everyone)
        else {
            options.push({ type: 'IDLE', weight: 1.0, duration: 60 + Math.random() * 100 });
            options.push({ type: 'STROLL', weight: 1.0, target: { x: this.x + (Math.random()-0.5)*300, y: this.y + (Math.random()-0.5)*300 } });
            
            // Ideology Tasks
            // Visit Job Center occasionally
            if (entities.jobCenters.length > 0) {
                const nearestJob = entities.jobCenters.sort((a,b) => Math.hypot(this.x-a.x, this.y-a.y) - Math.hypot(this.x-b.x, this.y-b.y))[0];
                if (Math.hypot(this.x - nearestJob.x, this.y - nearestJob.y) < 1000) { // Only if relatively close
                    options.push({ type: 'VISIT_JOB', weight: 0.8, target: {x: nearestJob.x + 50, y: nearestJob.y + 50}, duration: 300 });
                }
            }
            if (this.ideology === 'PASSIVE') options.push({ type: 'PHONE', weight: 0.5, duration: 120 });
            if (this.ideology === 'AGGRESSIVE') options.push({ type: 'EXERCISE', weight: 0.5, duration: 120 });
            options.push({ type: 'SMOKE', weight: 0.2, duration: 100 });
        }
        
        // 3. ROLE FLAVOR
        if (this.faction.id.includes('gang')) {
            options.push({ type: 'LOITER', weight: 1.5, duration: 200 });
            // Find a buddy to talk to
            const buddy = entities.units.find(u => u !== this && u.faction === this.faction && Math.hypot(u.x-this.x, u.y-this.y) < 200);
            if (buddy) options.push({ type: 'SOCIAL', weight: 1.0, target: buddy, duration: 180 });
        } else if (this.faction.id.includes('police')) {
            if (this.homePost) {
                options.push({ type: 'PATROL', weight: 2.0, target: { x: this.homePost.x + (Math.random()-0.5)*200, y: this.homePost.y + (Math.random()-0.5)*200 } });
            }
        } else if (this.isCivilian) {
             options.push({ type: 'STROLL', weight: 2.0, target: { x: this.x + (Math.random()-0.5)*400, y: this.y + (Math.random()-0.5)*400 } });
        }

        // Weighted Selection
        let totalWeight = options.reduce((sum, opt) => sum + opt.weight, 0);
        let r = Math.random() * totalWeight;
        for (let opt of options) {
            if (r < opt.weight) {
                this.work = { type: opt.type, target: opt.target, timer: opt.duration || 0 };
                return;
            }
            r -= opt.weight;
        }
        // Fallback
        this.work = { type: 'IDLE', timer: 60 };
    }

    moveTo(tx, ty, spd) {
        this.angle = Math.atan2(ty - this.y, tx - this.x);
        this.x += Math.cos(this.angle) * spd;
        this.y += Math.sin(this.angle) * spd;
    }

    findTarget(forceSelfDefense = false) {
        // If we already have a valid target, stick to it unless it's dead or far
        if (this.target && (this.target.hp <= 0 || Math.hypot(this.target.x - this.x, this.target.y - this.y) > 400)) {
            this.target = null;
        }
        if (this.target) return;

        // Throttle AI scans to improve performance
        if (!forceSelfDefense) {
            if (this.scanTimer > 0) {
                this.scanTimer--;
                return;
            }
            this.scanTimer = 30 + Math.floor(Math.random() * 30);
        }

        // ANIMAL LOGIC
        if (this.isAnimal) {
            // Attack anyone nearby
            let nearest = null;
            let minDst = Infinity;
            entities.units.forEach(u => {
                if (!u.isAnimal) {
                    const d = Math.hypot(u.x - this.x, u.y - this.y);
                    if (d < 200 && d < minDst) { minDst = d; nearest = u; }
                }
            });
            this.target = nearest;
            return;
        }

        // AI LOGIC: Gangs Attack, Governments Defend
        let nearest = null;
        let minDst = Infinity;

        // GANG LOGIC
        if (this.faction.id.includes('gang')) {
            // Only aggressive if in Wild State
            if (this.wildState && this.attackTarget) {
                // 1. Check if target post is still enemy
                if (this.attackTarget.owner.id !== this.faction.id) {
                    const d = Math.hypot(this.attackTarget.x - this.x, this.attackTarget.y - this.y);
                    if (d < 300) {
                        this.target = this.attackTarget;
                        return;
                    }
                }
                // 2. Target defenders ONLY if they are very close (Self Defense / Obstacle)
                // Otherwise, ignore them and focus on the post (executeWork handles movement)
                entities.units.forEach(u => {
                    if (u.faction.id.includes('police') || u.faction.id === FACTIONS.PLAYER.id) {
                        const d = Math.hypot(u.x - this.x, u.y - this.y);
                        if (d < 100 && d < minDst) { minDst = d; nearest = u; } // Reduced distraction range
                    }
                });
            }
            // Self Defense (Normal State or Wild State fallback)
            if (forceSelfDefense || (this.wildState && !this.attackTarget)) {
                 entities.units.forEach(u => {
                    if (u.faction.id !== this.faction.id) {
                        const d = Math.hypot(u.x - this.x, u.y - this.y);
                        if (d < 200 && d < minDst) { minDst = d; nearest = u; }
                    }
                });
            }
        } 
        // GOVERNMENT LOGIC
        else if (this.faction.id.includes('police')) {
            // 1. Prioritize Player if Wanted
            if (playerWantedLevel > 0 && entities.player && entities.player.hp > 0) {
                const playerDist = Math.hypot(entities.player.x - this.x, entities.player.y - this.y);
                // Aggression range increases with wanted level
                if (playerDist < 200 + (playerWantedLevel * 100)) {
                    this.target = entities.player;
                    return;
                }
            }

            // 2. Defend Post (Guard Duty)
            const defensePoint = this.homePost || this;
            entities.units.forEach(u => {
                if (u.faction.id.includes('gang') || u.faction.id === FACTIONS.PLAYER.id) {
                    // Only engage if enemy is aggressive (Wild State) or Player
                    if (u.faction.id.includes('gang') && !u.wildState) return;

                    const d = Math.hypot(u.x - defensePoint.x, u.y - defensePoint.y);
                    // Strict defense radius
                    if (d < 250 && d < minDst) {
                        minDst = d;
                        nearest = u;
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

        // Drop Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(2, 2, this.radius, this.radius * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        
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
        
        // Visuals: Police Cap
        if (this.faction.id.includes('police')) {
            ctx.fillStyle = this.faction.color; // Cap matches faction
            ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.55, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000'; // Visor
            ctx.fillRect(0, -this.radius * 0.6, this.radius * 0.6, this.radius * 0.4);
        }
        // Visuals: Gang Bandana
        if (this.faction.id.includes('gang')) {
            ctx.fillStyle = this.faction.color; // Bandana matches faction
            ctx.beginPath();
            ctx.moveTo(-this.radius*0.4, -this.radius*0.1);
            ctx.lineTo(this.radius*0.4, -this.radius*0.1);
            ctx.lineTo(0, this.radius*0.6);
            ctx.fill();
        }
        // Visuals: Animal
        if (this.isAnimal) {
            ctx.fillStyle = '#e67e22'; // Fur
            ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(0, -5, 3, 0, Math.PI*2); ctx.fill(); // Nose
        }

        if (this.isCivilian) {
            ctx.restore();
            return;
        }
        // Gun
        if (this.target || this.wildState) { // Only show gun if active/wild
            ctx.fillStyle = '#111';
            ctx.fillRect(4, -2, 14, 4);
        }
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
    gameOverScreen.style.display = 'none';
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
    entities.jobCenters = [];
    entities.treasures = [];
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
    
    // Init Waves
    entities.waves = [];
    for(let i=0; i<50; i++) {
        entities.waves.push({x: Math.random()*WORLD_WIDTH, y: Math.random()*WORLD_HEIGHT, t: Math.random()*Math.PI*2});
    }

    generateWorld();

    // Generate Posts (Canon: 50 per city)
    islands.forEach((island, idx) => {
        if (island.type === 'forest') return; // No posts in forests

        for (let i = 0; i < 50; i++) {
            // Place posts near road intersections for better alignment
            const cols = Math.floor(island.w / CITY_GRID_SIZE);
            const rows = Math.floor(island.h / CITY_GRID_SIZE);
            
            // Pick a random intersection
            const c = Math.floor(Math.random() * cols);
            const r = Math.floor(Math.random() * rows);
            
            const startX = island.x;
            const startY = island.y;
            
            const px = startX + c * CITY_GRID_SIZE;
            const py = startY + r * CITY_GRID_SIZE;
            
            const post = new Post(px, py, `P-${idx}-${i}`);
            // Apply Canon Ratios
            // Use island.factions to determine owner
            // If island has police and gang, split ownership. If only police, 100% police.
            if (island.factions.length === 1) {
                post.owner = island.factions[0];
            } else {
                // Assuming [Police, Gang]
                post.owner = Math.random() < 0.4 ? island.factions[1] : island.factions[0];
            }
            
            post.points = 100; // Full health
            entities.posts.push(post);
        }
    });

    // Spawn Initial Forces
    islands.forEach(island => {
        if (island.type === 'forest') return;

        // Spawn factions present in this island
        island.factions.forEach(faction => {
            const count = faction.id.includes('gang') ? 20 : 15;
            for(let i=0; i<count; i++) spawnAI(faction, island);
        });
    });

    if (gameMode === 'MAIN') {
        // Create Player immediately in Main Mode
        entities.player = new Unit(1500, 1500, FACTIONS.PLAYER, true);
        entities.units.push(entities.player);
        // Initial job generation is now manual via interaction or auto if none
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
        if (island.type === 'forest') {
            // Forest Generation
            for(let i=0; i<50; i++) {
                const x = island.x + Math.random() * island.w;
                const y = island.y + Math.random() * island.h;
                entities.props.push(new Prop(x, y, 'tree'));
            }
            // Treasure
            if (Math.random() < 0.5) {
                const tx = island.x + Math.random() * island.w;
                const ty = island.y + Math.random() * island.h;
                entities.treasures.push(new Treasure(tx, ty));
                // Guardians
                for(let k=0; k<3; k++) {
                    entities.units.push(new Unit(tx + (Math.random()-0.5)*100, ty + (Math.random()-0.5)*100, FACTIONS.ANIMAL));
                }
            }
            return;
        }

        // Create Grid System
        // Align buildings perfectly within the grid cells defined by CITY_GRID_SIZE
        
        const startX = island.x; 
        const startY = island.y;
        const cols = Math.floor(island.w / CITY_GRID_SIZE);
        const rows = Math.floor(island.h / CITY_GRID_SIZE);

        // Place 1 Job Center per city
        const jobCenterX = startX + Math.floor(cols/2) * CITY_GRID_SIZE + (CITY_GRID_SIZE - 100)/2;
        const jobCenterY = startY + Math.floor(rows/2) * CITY_GRID_SIZE + (CITY_GRID_SIZE - 100)/2;
        entities.jobCenters.push(new JobCenter(jobCenterX, jobCenterY));

        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const cellX = startX + c * CITY_GRID_SIZE;
                const cellY = startY + r * CITY_GRID_SIZE;
                
                // Center of the block (between roads)
                const centerX = cellX + CITY_GRID_SIZE / 2;
                const centerY = cellY + CITY_GRID_SIZE / 2;

                // Check if this spot is taken by the Job Center
                if (Math.abs(centerX - (jobCenterX + 50)) < 100 && Math.abs(centerY - (jobCenterY + 50)) < 100) {
                    continue;
                }

                // Building size (fit within grid minus road width)
                const maxBuildingSize = CITY_GRID_SIZE - CITY_ROAD_WIDTH - 10;
                
                // 80% chance to place a building (approx 100 buildings per 1300x1300 island)
                if (Math.random() < 0.8) {
                    const w = maxBuildingSize;
                    const h = maxBuildingSize;
                    
                    entities.buildings.push(new Building(centerX - w/2, centerY - h/2, w, h));
                } else {
                    // Empty lot: Place props (Lights or Trees)
                    if (Math.random() < 0.5) entities.props.push(new Prop(centerX, centerY));
                    if (Math.random() < 0.5) entities.props.push(new Prop(centerX + 20, centerY + 20, 'tree'));
                }
            }
        }

        // Spawn 200 NPCs per city
        for (let i = 0; i < 200; i++) {
            // Spawn on roads to avoid building clipping
            const isHorizontal = Math.random() < 0.5;
            let x, y;
            
            if (isHorizontal) {
                // On a horizontal road
                const r = Math.floor(Math.random() * rows);
                y = startY + r * CITY_GRID_SIZE;
                x = island.x + Math.random() * island.w;
            } else {
                // On a vertical road
                const c = Math.floor(Math.random() * cols);
                x = startX + c * CITY_GRID_SIZE;
                y = island.y + Math.random() * island.h;
            }
            
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
    const unit = new Unit(x, y, faction);

    if (faction.id.includes('police')) {
        // Assign to nearest post
        let nearest = null;
        let minDst = Infinity;
        entities.posts.forEach(p => {
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < minDst) { minDst = d; nearest = p; }
        });
        unit.homePost = nearest;
    }
    entities.units.push(unit);
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
    allegianceDiv.innerHTML = `ALLEGIANCE: <span style="color:${playerAllegiance.color}">${playerAllegiance.name || 'NONE'}</span>`;
}

function generateJob() {
    if (gameMode !== 'MAIN') return;
    
    // Job alignment depends on GP (Positive -> Legal, Negative -> Illegal)
    // If Neutral (-100 to 100), random.
    let isLegal = Math.random() > 0.5;
    if (playerGP > 100) isLegal = true;
    if (playerGP < -100) isLegal = false;

    // Legal: Target Gang posts. Illegal: Target Gov posts.
    // Simplified: Legal targets any gang, Illegal targets any police
    const candidates = entities.posts.filter(p => {
        if (isLegal) return p.owner.id.includes('gang');
        else return p.owner.id.includes('police');
    });
    
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
    // Check if post owner matches player allegiance
    if (currentJob && currentJob.target === post && post.owner.id === playerAllegiance.id) {
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
        // Check for Job Center interaction
        for (const jc of entities.jobCenters) {
            if (Math.hypot(entities.player.x - (jc.x + jc.w/2), entities.player.y - (jc.y + jc.h/2)) < 100) {
                generateJob();
                createExplosion(entities.player.x, entities.player.y, '#8e44ad', 20);
                return;
            }
        }

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
    } else if (key === 'Digit2' && playerMoney >= 1000) { // Weapon Upgrade
        playerMoney -= 1000;
        playerLevel++;
        createExplosion(entities.player.x, entities.player.y, '#00f', 20);
    } else if (key === 'Digit3' && playerMoney >= 2500) { // Vehicle
        playerMoney -= 2500;
        // Spawn vehicle near player
        entities.vehicles.push(new Vehicle(entities.player.x + 50, entities.player.y));
    } else {
        // Faction Switching (Keys 1-7, mapped to 4-0 for simplicity or just check key code)
        // Actually, let's use Number keys 4-9 and 0 for factions since 1-3 are shop
        const factionMap = {
            'Digit4': FACTIONS.NEW_POLICE,
            'Digit5': FACTIONS.DESERT_POLICE,
            'Digit6': FACTIONS.DESERT_GANG,
            'Digit7': FACTIONS.SNOW_POLICE,
            'Digit8': FACTIONS.SNOW_GANG,
            'Digit9': FACTIONS.OLD_POLICE,
            'Digit0': FACTIONS.OLD_GANG
        };
        if (factionMap[key]) {
            playerAllegiance = factionMap[key];
            updateGPDisplay(); // Updates allegiance text too
            createExplosion(entities.player.x, entities.player.y, playerAllegiance.color, 10);
        }
    }
}

function updateStrategicAI() {
    strategicTimer++;
    if (strategicTimer > 600) { // Every ~10 seconds
        strategicTimer = 0;

        // TRIGGER GANG ATTACKS
        // Instead of spawning new units, command existing idle gangs to attack
        const idleGangs = entities.units.filter(u => u.faction.id.includes('gang') && !u.wildState);
        
        if (idleGangs.length > 0 && Math.random() < 0.3) { // 30% chance to trigger attack
            // Pick a target post (Police owned)
            const targets = entities.posts.filter(p => p.owner.id.includes('police'));
            if (targets.length > 0) {
                const targetPost = targets[Math.floor(Math.random() * targets.length)];
                
                // Send 3-5 nearby gang members to attack it (Activate Wild Randomness)
                idleGangs.sort((a, b) => Math.hypot(a.x - targetPost.x, a.y - targetPost.y) - Math.hypot(b.x - targetPost.x, b.y - targetPost.y));
                
                for(let i=0; i<Math.min(8, idleGangs.length); i++) { // Increased squad size
                    idleGangs[i].wildState = true;
                    idleGangs[i].attackTarget = targetPost;
                    idleGangs[i].pickNewWork(); // Switch immediately
                }
            }
        }
    }
}

function update() {
    if (!gameRunning) return;

    // Check Game Over
    if (entities.player && entities.player.hp <= 0) {
        gameRunning = false;
        gameOverScreen.style.display = 'flex';
        return;
    }

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

    // Treasure Collection
    if (entities.player) {
        entities.treasures.forEach(t => {
            if (!t.collected && Math.hypot(t.x - entities.player.x, t.y - entities.player.y) < 30) {
                t.collected = true;
                addMoney(5000);
                modifyGP(50);
                createExplosion(t.x, t.y, '#f1c40f', 50);
            }
        });
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
    // Simplified stats for UI
    const counts = { police: 0, gang: 0 };
    entities.posts.forEach(p => {
        if (p.owner.id.includes('police')) counts.police++;
        if (p.owner.id.includes('gang')) counts.gang++;
    });
    
    let extraHtml = '';
    if (gameMode === 'BLACKPOST' && blackpostActive) {
        extraHtml = '<br><span style="color:red; font-weight:bold;">⚠ BLACKPOST EVENT ⚠</span>';
    }

    statsDiv.innerHTML = `
        <span style="color:${FACTIONS.PLAYER.color}">PLAYER</span> | 
        <span style="color:#FFD700">$${playerMoney} (Lvl ${playerLevel})</span><br>
        <span style="color:#3498db">POLICE CONTROL: ${counts.police}</span><br>
        <span style="color:#e74c3c">GANG CONTROL: ${counts.gang}</span>
        ${extraHtml}
    `;
}

function draw() {
    if (!gameRunning) return;

    // Background
    ctx.fillStyle = '#154360'; // Deep Ocean Blue
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw Waves
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    entities.waves.forEach(w => {
        w.t += 0.02;
        const wx = w.x + Math.cos(w.t) * 20;
        ctx.fillRect(wx - camera.x * 0.2, w.y - camera.y * 0.2, 40, 2); // Parallax effect
    });

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

    // Draw Islands
    islands.forEach(island => {
        // Ground
        ctx.fillStyle = '#7f8c8d'; // Concrete Grey base
        if (island.name.includes("Snow")) ctx.fillStyle = '#d6dbdf'; // Snow
        if (island.name.includes("Fire")) ctx.fillStyle = '#935116'; // Dirt/Desert
        if (island.type === 'forest') ctx.fillStyle = '#145a32'; // Forest Green
        
        ctx.fillRect(island.x, island.y, island.w, island.h);
        
        if (island.type === 'forest') return;

        // City Grid (Sidewalks)
        ctx.strokeStyle = '#95a5a6'; // Concrete Sidewalk
        ctx.lineWidth = CITY_ROAD_WIDTH + 10; 
        ctx.beginPath();
        const startX = island.x;
        const startY = island.y;
        for(let x = startX; x <= island.x + island.w; x += CITY_GRID_SIZE) { ctx.moveTo(x, island.y); ctx.lineTo(x, island.y+island.h); }
        for(let y = startY; y <= island.y + island.h; y += CITY_GRID_SIZE) { ctx.moveTo(island.x, y); ctx.lineTo(island.x+island.w, y); }
        ctx.stroke();

        // City Grid (Asphalt Roads)
        ctx.strokeStyle = '#2c3e50'; // Dark Asphalt
        ctx.lineWidth = CITY_ROAD_WIDTH; 
        ctx.beginPath();
        for(let x = startX; x <= island.x + island.w; x += CITY_GRID_SIZE) { ctx.moveTo(x, island.y); ctx.lineTo(x, island.y+island.h); }
        for(let y = startY; y <= island.y + island.h; y += CITY_GRID_SIZE) { ctx.moveTo(island.x, y); ctx.lineTo(island.x+island.w, y); }
        ctx.stroke();

        // Road Markings (Dashed Lines)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([15, 25]);
        ctx.beginPath();
        for(let x = startX; x <= island.x + island.w; x += CITY_GRID_SIZE) { ctx.moveTo(x, island.y); ctx.lineTo(x, island.y+island.h); }
        for(let y = startY; y <= island.y + island.h; y += CITY_GRID_SIZE) { ctx.moveTo(island.x, y); ctx.lineTo(island.x+island.w, y); }
        ctx.stroke();
        ctx.setLineDash([]);
    });

    // Draw Entities
    entities.buildings.forEach(b => b.draw());
    entities.jobCenters.forEach(j => j.draw());
    entities.treasures.forEach(t => t.draw());
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
