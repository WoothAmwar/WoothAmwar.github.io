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

function generateTree(manualSeed = null) {
    leaves = [];
    branches = [];

    // Set the seed based on input or generate a new random one
    if (manualSeed !== null && manualSeed !== "") {
        if (isNaN(manualSeed)) {
            let h = 0;
            for(let i = 0; i < manualSeed.length; i++) h = Math.imul(31, h) + manualSeed.charCodeAt(i) | 0;
            seed = Math.abs(h);
        } else {
            seed = parseFloat(manualSeed);
        }
    } else {
        seed = floor(random(1000000));
    }

    // Update the HTML input field with the active seed
    let seedInput = document.getElementById("seedInput");
    if (seedInput) {
        seedInput.value = seed;
    }

    noiseSeed(seed);
    randomSeed(seed);

    // Main tree
    generateSingleTree(width / 2, 1.0);
    
    // Left tree
    let leftX = width / 5 + random(-40, 40);
    let leftSize = random(0.5, 0.8);
    generateSingleTree(leftX, leftSize);
    
    // Right tree
    let rightX = width - width / 5 + random(-40, 40);
    let rightSize = random(0.5, 0.8);
    generateSingleTree(rightX, rightSize);

    redraw();
}

function generateSingleTree(startX, sizeMultiplier) {
    sentence = "T";
    len = windowHeight * 0.5 * sizeMultiplier;
    maxDepth = 0;

    // N Generations provide a good balance of detail and performance
    for (let i = 0; i < N; i++) {
        generateLSystem();
    }

    parseLSystem(startX);
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

function parseLSystem(startX) {
    let currentTreeBranches = [];
    // 1D FBM terrain height at center determines tree anchor point
    let terrainNoiseVal = fbm1D(startX * 0.005);
    let rootY = height - 100 + (terrainNoiseVal - 0.5) * 150;
    let currentPos = createVector(startX, rootY);

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
                let gx = Math.floor(Math.abs(currentPos.x - startX) / cellW);
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
                let newBranch = {
                    start: currentPos.copy(),
                    end: nextPos.copy(),
                    depth: depth,
                    gridSum: maxGens,
                    rootY: rootY
                };
                branches.push(newBranch);
                currentTreeBranches.push(newBranch);
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
    for (let branch of currentTreeBranches) {
        // GUARANTEE no leaves on the main trunk or first N/3 generations
        if (branch.depth <= Math.floor(N / 3)) {
            continue;
        }

        let spawnChance = map(min(branch.gridSum, 5), 0, 5, 0.4, 1.0);

        if (branch.depth >= maxDepth - 2) {
            if (random() < spawnChance) {
                leaves.push({ pos: branch.end.copy(), depth: branch.depth, rootY: rootY });
            }
        } else {
            if (random() < spawnChance * 0.2) {
                leaves.push({ pos: branch.end.copy(), depth: branch.depth, rootY: rootY });
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
            displacePoint(pt, branch.rootY);

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

    drawLeaves();
    drawTerrain();

    noLoop(); // Static render, re-run only on click
}

function drawLeaves() {
    noStroke();
    for (let leaf of leaves) {
        let anchor = leaf.pos.copy();
        displacePoint(anchor, leaf.rootY); // Match branch ending

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
    // Back terrain layer (hills)
    fill(45, 80, 40);
    stroke(30, 60, 25);
    strokeWeight(2);
    beginShape();
    vertex(0, height);
    for (let x = 0; x <= width; x += 5) {
        // Procedural terrain height via 1D FBM
        let y = height - 100 + (fbm1D(x * 0.005) - 0.5) * 150;
        vertex(x, y);
    }
    vertex(width, height);
    endShape(CLOSE);

    // Front terrain layer (for depth)
    fill(35, 65, 30);
    noStroke();
    beginShape();
    vertex(0, height);
    for (let x = 0; x <= width; x += 8) {
        let y = height - 40 + (fbm1D(x * 0.008 + 50) - 0.5) * 80;
        vertex(x, y);
    }
    vertex(width, height);
    endShape(CLOSE);
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    generateTree(); // Redraw on resize
}

function mousePressed(event) {
    // Only generate new tree if clicking outside the info panel
    if (event && event.target && event.target.closest('#info')) {
        return;
    }
    generateTree(); // Redraw with a new seed on click
}

// Called by the HTML button
function loadSeed() {
    let val = document.getElementById("seedInput").value;
    generateTree(val);
}
