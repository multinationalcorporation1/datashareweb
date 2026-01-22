const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statsDiv = document.getElementById('stats');

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
    GREEN: { id: 'green', color: '#2ecc71' }    // Old City
};

// --- GAME STATE ---
const camera = { x: 0, y: 0 };
const keys = {};
const mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false };

const entities = {
    player: null,
    posts: [],
    bullets: [],
    units: [],
    particles: []
};

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

// Blackpost Mode State
let blackpostTimer = 0;
const BLACKPOST_INTERVAL = 1800; // ~30 seconds
let blackpostActive = false;

// Economy State
let playerMoney = 0;
let playerLevel = 1;

// --- CLASSES ---

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
        if (this.isBlackpost) {
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
        if (this.isBlackpost) {
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
        ctx.strokeStyle = this.isBlackpost ? '#f00' : '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x - this.w/2, this.y - this.h/2, this.w, this.h);

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
    }

    update() {
        if (this.hp <= 0) return; // Dead

        if (this.isPlayer) {
            // Player Movement
            let dx = 0;
            let dy = 0;
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
        if (this.hp <= 0) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Body
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
    }

    draw() {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- SYSTEMS ---

function init() {
    // Create Player
    entities.player = new Unit(1500, 1500, FACTIONS.PLAYER, true);
    entities.units.push(entities.player);

    // Generate Posts (5 per zone)
    islands.forEach((island, idx) => {
        let faction = FACTIONS.NEUTRAL;
        if (idx === 1) faction = FACTIONS.BLUE;  // New City
        if (idx === 2) faction = FACTIONS.RED;   // Desert City
        if (idx === 6) faction = FACTIONS.GREEN; // Old City

        for (let i = 0; i < 5; i++) {
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
    // Simple auto-upgrade system
    if (playerMoney > playerLevel * 1000) {
        playerMoney -= playerLevel * 1000;
        playerLevel++;
        createExplosion(entities.player.x, entities.player.y, '#FFD700', 50); // Gold explosion
    }
}

function update() {
    // Blackpost Logic
    blackpostTimer++;
    if (blackpostTimer > BLACKPOST_INTERVAL) {
        blackpostTimer = 0;
        // Activate 3 random posts
        for(let i=0; i<3; i++) {
            const p = entities.posts[Math.floor(Math.random() * entities.posts.length)];
            p.isBlackpost = true;
            p.blackzoneRadius = 50;
        }
        blackpostActive = true;
    }

    // Update Posts
    entities.posts.forEach(p => p.update());

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

function updateStats() {
    const counts = { player: 0, red: 0, blue: 0, green: 0 };
    entities.posts.forEach(p => counts[p.owner.id] ? counts[p.owner.id]++ : null);
    
    let blackpostHtml = blackpostActive ? '<br><span style="color:red; font-weight:bold;">⚠ BLACKPOST EVENT ⚠</span>' : '';

    statsDiv.innerHTML = `
        <span style="color:${FACTIONS.PLAYER.color}">PLAYER: ${counts.player || 0}</span> | 
        <span style="color:#FFD700">$${playerMoney} (Lvl ${playerLevel})</span><br>
        <span style="color:${FACTIONS.RED.color}">RED: ${counts.red || 0}</span><br>
        <span style="color:${FACTIONS.BLUE.color}">BLUE: ${counts.blue || 0}</span><br>
        <span style="color:${FACTIONS.GREEN.color}">GREEN: ${counts.green || 0}</span>
        ${blackpostHtml}
    `;
}

function draw() {
    // Background
    ctx.fillStyle = '#050505'; // Deep water
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

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

    // Draw Connections (Visual)
    // ctx.strokeStyle = '#333';
    // ctx.lineWidth = 40;
    // ctx.beginPath();
    // ctx.moveTo(1200, 700); ctx.lineTo(1800, 700); // Top bridge
    // ctx.moveTo(1200, 2300); ctx.lineTo(1800, 2300); // Bottom bridge
    // ctx.moveTo(700, 1200); ctx.lineTo(700, 1800); // Left bridge
    // ctx.moveTo(2300, 1200); ctx.lineTo(2300, 1800); // Right bridge
    // ctx.stroke();

    // Draw Entities
    entities.posts.forEach(p => p.draw());
    entities.units.forEach(u => u.draw());
    entities.bullets.forEach(b => b.draw());
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
window.addEventListener('keydown', e => keys[e.code] = true);
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

// Start
init();
loop();
