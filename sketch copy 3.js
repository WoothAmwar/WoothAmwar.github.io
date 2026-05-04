let sentence = "T";
let rules = {
    "T": "F[+A][-A][A]",     // Base split: exactly 1 left, 1 right, 1 up
    "A": "F+[+A-A]-[-A+A]",  // Procedural bonsai branches
    "F": "FF"                // Trunk length scaling
};
let len;
let angle;
let leaves = [];
let branches = [];
let maxDepth = 0;
let seed;
let N = 5; // Number of generations

function setup() {
    createCanvas(windowWidth, windowHeight);
    angle = radians(30);

    generateTree();
}

function generateTree() {
    sentence = "T";
    len = windowHeight * 0.5; // Set large enough so final trunk is exactly 0.4 * windowHeight
    leaves = [];
    branches = [];
    maxDepth = 0;

    // Use the same seed for both terrain and tree shape
    seed = random(10000);
    noiseSeed(seed);
    randomSeed(seed);

    // N Generations provide a good balance of detail and performance
    for (let i = 0; i < N; i++) {
        generateLSystem();
    }

    parseLSystem();
    redraw();
}

function generateLSystem() {
    let nextSentence = "";
    for (let i = 0; i < sentence.length; i++) {
        let current = sentence.charAt(i);
        if (rules[current]) {
            nextSentence += rules[current];
        } else {
            nextSentence += current;
        }
    }
    sentence = nextSentence;
    len *= 0.5; // 0.5 ensures main trunk spans the full 'len'
}

function parseLSystem() {
    // 1D FBM terrain height at center determines tree anchor point on the floating island
    let terrainNoiseVal = fbm1D((width / 2) * 0.005);
    let islandTopY = height * 0.6;
    let rootY = islandTopY + (terrainNoiseVal - 0.5) * 150;
    let currentPos = createVector(width / 2, rootY);

    // Root tilt based on terrain noise seed
    let rootTilt = map(terrainNoiseVal, 0, 1, -PI / 5, PI / 5);
    let currentDir = createVector(0, -1).rotate(rootTilt);

    let stateStack = [];
    let depth = 0;
    let prunedDepth = Infinity;

    // Use global N for grid
    let cellW = width / N;
    let cellH = height / N;

    for (let i = 0; i < sentence.length; i++) {
        let current = sentence.charAt(i);

        if (current === '[') {
            stateStack.push({
                pos: currentPos.copy(),
                dir: currentDir.copy(),
                depth: depth
            });
            depth++;
        } else if (current === ']') {
            let state = stateStack.pop();
            currentPos = state.pos;
            currentDir = state.dir;
            depth = state.depth;

            // If we pop out of the pruned branch, reset pruned depth
            if (depth < prunedDepth) {
                prunedDepth = Infinity;
            }
        } else {
            // Skip branch logic if we are inside a pruned sub-branch
            if (depth >= prunedDepth) continue;

            if (current === 'F') {
                // Calculate grid coordinates based on absolute distance from root
                let gx = Math.floor(Math.abs(currentPos.x - width / 2) / cellW);
                let gy = Math.floor(Math.max(0, rootY - currentPos.y) / cellH);
                let maxGens = gx + gy + 2; // +2 buffer makes pruning less harsh

                // If depth exceeds allowed maxGens at this grid point, prune branch
                if (depth > maxGens) {
                    prunedDepth = depth;
                    continue;
                }

                // Flatten out the outer pads slightly
                if (depth >= Math.floor(N / 2)) {
                    if (currentDir.y < 0) currentDir.y += 0.05;
                }

                // Prevent downward motion on inner branches
                if (depth <= 1 && currentDir.y > 0) {
                    currentDir.y = -0.05; // Force slightly upwards if pointing down
                }

                currentDir.normalize();

                // Make the last N/3 generations half the length
                let currentLen = len;
                if (depth >= N - Math.floor(N / 3)) {
                    currentLen = len * 0.5;
                }

                let nextPos = p5.Vector.add(currentPos, p5.Vector.mult(currentDir, currentLen));
                branches.push({
                    start: currentPos.copy(),
                    end: nextPos.copy(),
                    depth: depth,
                    gridSum: maxGens
                });
                currentPos = nextPos.copy();
                maxDepth = max(maxDepth, depth);
            } else if (current === '+') {
                currentDir.rotate(angle + random(-0.15, 0.15));
            } else if (current === '-') {
                currentDir.rotate(-angle + random(-0.15, 0.15));
            }
        }
    }

    // Leaf spawning chance is relative to the grid point sum (x+y)
    leaves = [];
    for (let branch of branches) {
        // GUARANTEE no leaves on the main trunk or first N/3 generations
        if (branch.depth <= Math.floor(N / 3)) {
            continue;
        }

        let spawnChance = map(min(branch.gridSum, 5), 0, 5, 0.4, 1.0);

        if (branch.depth >= maxDepth - 2) {
            if (random() < spawnChance) {
                leaves.push({ pos: branch.end.copy(), depth: branch.depth });
            }
        } else {
            if (random() < spawnChance * 0.2) {
                leaves.push({ pos: branch.end.copy(), depth: branch.depth });
            }
        }
    }
}

// 1D Fractal Brownian Motion
function fbm1D(x) {
    let total = 0;
    let amplitude = 0.5;
    let frequency = 1.0;
    let maxTotal = 0;
    for (let i = 0; i < 5; i++) {
        total += noise(x * frequency) * amplitude;
        maxTotal += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return total / maxTotal;
}

// 2D Fractal Brownian Motion
function fbm2D(x, y) {
    let total = 0;
    let amplitude = 0.5;
    let frequency = 1.0;
    let maxTotal = 0;
    for (let i = 0; i < 5; i++) {
        total += noise(x * frequency, y * frequency) * amplitude;
        maxTotal += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return total / maxTotal;
}

function displacePoint(pt, rootY) {
    let distFromGround = rootY - pt.y;
    let factor = min(max(distFromGround / 150, 0), 1.0); // Taper off displacement near ground

    // Only displace if we are above the roots
    if (factor > 0) {
        let nx = fbm2D(pt.x * 0.01, pt.y * 0.01) - 0.5;
        let ny = fbm2D(pt.x * 0.01 + 100, pt.y * 0.01 + 100) - 0.5;

        pt.x += nx * 80 * factor;
        pt.y += ny * 80 * factor;
    }
}

function draw() {
    background(210, 230, 240); // Soft sky color

    // Draw Sun background
    fill(255, 240, 200);
    noStroke();
    circle(width * 0.8, height * 0.3, 150);

    let terrainNoiseVal = fbm1D((width / 2) * 0.005);
    let rootY = height - 100 + (terrainNoiseVal - 0.5) * 150;

    // Draw Wobbly Branches
    for (let branch of branches) {
        let branchLength = p5.Vector.dist(branch.start, branch.end);
        let numSegments = max(floor(branchLength / 4), 2);

        // Prevent map failure if maxDepth is 0
        let thickness = maxDepth > 0 ? map(branch.depth, 0, maxDepth, 15, 1) : 15;
        strokeWeight(thickness);
        stroke(60, 45, 35); // Dark gnarled wood
        noFill();

        beginShape();
        for (let i = 0; i <= numSegments; i++) {
            let t = i / numSegments;
            let pt = p5.Vector.lerp(branch.start, branch.end, t);

            // Apply global FBM displacement to create the wobbly, organic shapes
            displacePoint(pt, rootY);

            // Sub-displacement to add rough bark texture for thicker branches
            if (thickness > 3) {
                let barkNoise = fbm2D(pt.x * 0.2, pt.y * 0.2) - 0.5;
                pt.x += barkNoise * thickness * 0.3;
                pt.y += barkNoise * thickness * 0.3;
            }

            vertex(pt.x, pt.y);
        }
        endShape();
    }

    drawLeaves(rootY);
    drawTerrain();

    noLoop(); // Static render, re-run only on click
}

function drawLeaves(rootY) {
    noStroke();
    for (let leaf of leaves) {
        let anchor = leaf.pos.copy();
        displacePoint(anchor, rootY); // Match branch ending

        // Use 2D Perlin noise to create canopy density map
        let density = fbm2D(anchor.x * 0.015, anchor.y * 0.015);
        if (density < 0.40) continue; // Natural gaps

        // Emulate the distinct, dense, flat "pads" of a real bonsai
        let clusterSize = floor(map(density, 0.40, 1.0, 15, 45)); // Much denser

        for (let i = 0; i < clusterSize; i++) {
            // Highly horizontal scatter to build the pad shape
            let offsetX = random(-35, 35) * random(); // Center-weighted
            let offsetY = random(-8, 8) * random(); // Very flat vertically
            let particlePos = createVector(anchor.x + offsetX, anchor.y + offsetY);

            // Draw a tiny stem from anchor to particle
            strokeWeight(1);
            stroke(40, 30, 20, 180);
            line(anchor.x, anchor.y, particlePos.x, particlePos.y);
            noStroke();

            // Color noise (deep rich greens like the reference image)
            let colorNoise = fbm2D(particlePos.x * 0.02, particlePos.y * 0.02);
            let r, g, b;
            if (colorNoise < 0.4) {
                // Deep Forest Green
                r = map(colorNoise, 0, 0.4, 20, 35);
                g = map(colorNoise, 0, 0.4, 60, 90);
                b = map(colorNoise, 0, 0.4, 15, 25);
            } else if (colorNoise < 0.7) {
                // Vibrant Moss Green
                r = map(colorNoise, 0.4, 0.7, 30, 50);
                g = map(colorNoise, 0.4, 0.7, 100, 130);
                b = map(colorNoise, 0.4, 0.7, 20, 35);
            } else {
                // Bright Highlight Green
                r = map(colorNoise, 0.7, 1.0, 45, 70);
                g = map(colorNoise, 0.7, 1.0, 140, 170);
                b = map(colorNoise, 0.7, 1.0, 30, 50);
            }

            fill(r, g, b, 230); // Very opaque for solid pads

            // Draw shape as a small, horizontally squashed ellipse to layer the pad
            let leafWidth = random(12, 24);
            let leafHeight = random(4, 9);

            push();
            translate(particlePos.x, particlePos.y);
            // Slight tilt conforming to the branch
            rotate(random(-PI / 12, PI / 12));
            ellipse(0, 0, leafWidth, leafHeight);
            pop();
        }
    }
}

function drawTerrain() {
    let islandLeft = width * 0.2;
    let islandRight = width * 0.8;
    let islandTopY = height * 0.6;
    let islandHeight = height / 3.5; // ~1/3 of screen height per user request

    noStroke();

    // 1. Back Layer: Inverted Mountain Rock (Varying shades of gray)
    for (let x = islandLeft; x <= islandRight - 5; x += 5) {
        let nextX = x + 5;

        // Calculate Top Surface Constraints
        let topY1 = islandTopY + (fbm1D(x * 0.005) - 0.5) * 150;
        let topY2 = islandTopY + (fbm1D(nextX * 0.005) - 0.5) * 150;

        // Normalize Distance from Center
        let norm1 = min(abs(x - width / 2) / ((islandRight - islandLeft) / 2), 1.0);
        let norm2 = min(abs(nextX - width / 2) / ((islandRight - islandLeft) / 2), 1.0);

        // Calculate Base V-Shape
        let depth1 = (1 - pow(norm1, 1.5)) * islandHeight;
        let depth2 = (1 - pow(norm2, 1.5)) * islandHeight;

        // Pure Perlin Noise for jagged mountain rock
        let noise1 = noise(x * 0.01, islandTopY * 0.01);
        let noise2 = noise(nextX * 0.01, islandTopY * 0.01);

        // Final Bottom Y positions
        let bottomY1 = topY1 + depth1 * (0.2 + noise1 * 1.5);
        let bottomY2 = topY2 + depth2 * (0.2 + noise2 * 1.5);

        // Determine Gray Shade based on Perlin Noise
        let shade = map(noise1, 0, 1, 60, 130);
        fill(shade, shade + 5, shade + 10); // Cool gray tint

        beginShape();
        vertex(x, topY1);
        vertex(nextX, topY2);
        vertex(nextX, bottomY2);
        vertex(x, bottomY1);
        endShape(CLOSE);
    }

    // 2. Back Layer: Top Grass
    fill(45, 80, 40);
    stroke(30, 60, 25);
    strokeWeight(2);
    beginShape();
    for (let x = islandLeft; x <= islandRight; x += 5) {
        let y = islandTopY + (fbm1D(x * 0.005) - 0.5) * 150;
        vertex(x, y);
    }
    for (let x = islandRight; x >= islandLeft; x -= 5) {
        let y = islandTopY + (fbm1D(x * 0.005) - 0.5) * 150 + 15; // Grass thickness
        vertex(x, y);
    }
    endShape(CLOSE);

    // Front Layer Dimensions
    let frontLeft = islandLeft + 40;
    let frontRight = islandRight - 40;

    // 2.5 Connecting Grass Plateau (fills the gap between back and front grass)
    fill(40, 75, 35); // A nice grassy green for the meadow surface
    stroke(30, 60, 25);
    strokeWeight(1);
    beginShape();
    // Top back edge
    for (let x = islandLeft; x <= islandRight; x += 5) {
        let y = islandTopY + (fbm1D(x * 0.005) - 0.5) * 150;
        vertex(x, y);
    }
    // Top front edge
    for (let x = frontRight; x >= frontLeft; x -= 8) {
        let y = islandTopY + 20 + (fbm1D(x * 0.008 + 50) - 0.5) * 80;
        vertex(x, y);
    }
    endShape(CLOSE);

    // 3. Front Layer: Inverted Mountain Rock (Varying shades of gray)
    noStroke();
    for (let x = frontLeft; x <= frontRight - 8; x += 8) {
        let nextX = x + 8;

        let topY1 = islandTopY + 20 + (fbm1D(x * 0.008 + 50) - 0.5) * 80;
        let topY2 = islandTopY + 20 + (fbm1D(nextX * 0.008 + 50) - 0.5) * 80;

        let norm1 = min(abs(x - width / 2) / ((frontRight - frontLeft) / 2), 1.0);
        let norm2 = min(abs(nextX - width / 2) / ((frontRight - frontLeft) / 2), 1.0);

        let depth1 = (1 - pow(norm1, 1.5)) * (islandHeight * 0.7);
        let depth2 = (1 - pow(norm2, 1.5)) * (islandHeight * 0.7);

        let noise1 = noise(x * 0.015, islandTopY * 0.015 + 100);
        let noise2 = noise(nextX * 0.015, islandTopY * 0.015 + 100);

        let bottomY1 = topY1 + depth1 * (0.2 + noise1 * 1.5);
        let bottomY2 = topY2 + depth2 * (0.2 + noise2 * 1.5);

        // Slightly darker gray for the front rock layer to give depth
        let shade = map(noise1, 0, 1, 40, 110);
        fill(shade, shade + 5, shade + 8);

        beginShape();
        vertex(x, topY1);
        vertex(nextX, topY2);
        vertex(nextX, bottomY2);
        vertex(x, bottomY1);
        endShape(CLOSE);
    }

    // 4. Front Layer: Top Grass
    fill(35, 65, 30);
    stroke(25, 50, 20);
    strokeWeight(1.5);
    beginShape();
    for (let x = frontLeft; x <= frontRight; x += 8) {
        let y = islandTopY + 20 + (fbm1D(x * 0.008 + 50) - 0.5) * 80;
        vertex(x, y);
    }
    for (let x = frontRight; x >= frontLeft; x -= 8) {
        let y = islandTopY + 20 + (fbm1D(x * 0.008 + 50) - 0.5) * 80 + 12; // Front grass thickness
        vertex(x, y);
    }
    endShape(CLOSE);
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    generateTree(); // Redraw on resize
}

function mousePressed() {
    generateTree(); // Redraw with a new seed on click
}
