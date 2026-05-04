let sentence = "F";
let rules = {
    "F": "FF+[+F-F]-[-F+F]" // Bonsai-like asymmetrical rule
};
let len;
let angle;
let leaves = [];
let branches = [];
let maxDepth = 0;
let seed;

function setup() {
    createCanvas(windowWidth, windowHeight);
    angle = radians(30);

    generateTree();
}

function generateTree() {
    sentence = "F";
    len = windowHeight * 0.55; // Start length relative to window size (increased)
    leaves = [];
    branches = [];
    maxDepth = 0;

    // Use the same seed for both terrain and tree shape
    seed = random(10000);
    noiseSeed(seed);
    randomSeed(seed);

    // 4 Generations provide a good balance of detail and performance
    for (let i = 0; i < 4; i++) {
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
    len *= 0.4; // Halve length each generation
}

function parseLSystem() {
    // 1D FBM terrain height at center determines tree anchor point
    let terrainNoiseVal = fbm1D((width / 2) * 0.005);
    let rootY = height - 100 + (terrainNoiseVal - 0.5) * 150;
    let currentPos = createVector(width / 2, rootY);

    // Root tilt based on terrain noise seed
    let rootTilt = map(terrainNoiseVal, 0, 1, -PI / 5, PI / 5);
    let currentDir = createVector(0, -1).rotate(rootTilt);

    let stateStack = [];
    let depth = 0;

    for (let i = 0; i < sentence.length; i++) {
        let current = sentence.charAt(i);

        if (current === 'F') {
            // Bias horizontal movement for bonsai look
            currentDir.x += currentDir.x > 0 ? 0.05 : -0.05;

            // Ensure no downward motion for the main trunk and primary branches
            if (depth <= 1 && currentDir.y > 0) {
                currentDir.y = -0.05; // Force slightly upwards if pointing down
            }

            currentDir.normalize();

            let nextPos = p5.Vector.add(currentPos, p5.Vector.mult(currentDir, len));
            branches.push({
                start: currentPos.copy(),
                end: nextPos.copy(),
                depth: depth
            });
            currentPos = nextPos.copy();
            maxDepth = max(maxDepth, depth);
        } else if (current === '+') {
            currentDir.rotate(angle + random(-0.15, 0.15));
        } else if (current === '-') {
            currentDir.rotate(-angle + random(-0.15, 0.15));
        } else if (current === '[') {
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
        }
    }

    // Bias leaves on ends of last 2 generations, and occasionally elsewhere
    leaves = [];
    for (let branch of branches) {
        if (branch.depth >= maxDepth - 2) {
            if (random() > 0.15) {
                leaves.push({
                    pos: branch.end.copy(),
                    depth: branch.depth
                });
            }
        } else {
            if (random() > 0.85) {
                leaves.push({
                    pos: branch.end.copy(),
                    depth: branch.depth
                });
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

        let thickness = map(branch.depth, 0, maxDepth, 13, 1);
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

        // Clumping: Use 2D Simplex/Perlin noise to create canopy density map
        let density = fbm2D(anchor.x * 0.015, anchor.y * 0.015);
        if (density < 0.50) continue; // Natural gaps for light to shine through

        // Spawn particle cluster
        let clusterSize = floor(map(density, 0.35, 1.0, 5, 20));
        for (let i = 0; i < clusterSize; i++) {
            let offsetR = random(0, 25); // Tighter clumping to avoid floating
            let offsetTheta = random(TWO_PI);
            let particlePos = createVector(
                anchor.x + offsetR * cos(offsetTheta),
                anchor.y + offsetR * sin(offsetTheta)
            );

            // Draw a small twig/stem connecting the leaf to the branch anchor
            strokeWeight(1);
            stroke(60, 45, 35, 150);
            line(anchor.x, anchor.y, particlePos.x, particlePos.y);
            noStroke();

            // Noise Field Governed Color
            let colorNoise = fbm2D(particlePos.x * 0.02, particlePos.y * 0.02);
            let r, g, b;
            if (colorNoise < 0.3) {
                // Pale Green
                r = map(colorNoise, 0, 0.3, 80, 60);
                g = map(colorNoise, 0, 0.3, 130, 100);
                b = map(colorNoise, 0, 0.3, 40, 30);
            } else if (colorNoise < 0.6) {
                // Darker Green
                r = map(colorNoise, 0.3, 0.6, 40, 70);
                g = map(colorNoise, 0.3, 0.6, 100, 140);
                b = map(colorNoise, 0.3, 0.6, 20, 50);
            } else {
                // Vibrant/Oak Green
                r = map(colorNoise, 0.6, 1.0, 60, 100);
                g = map(colorNoise, 0.6, 1.0, 140, 180);
                b = map(colorNoise, 0.6, 1.0, 40, 70);
            }

            fill(r, g, b, 210); // Alpha blending

            // Generate elliptical leaf shape
            let baseRadius = random(5, 12);
            let leafWidth = baseRadius * 1.8; // Elliptical width
            let leafHeight = baseRadius * 0.9; // Flatter height
            let leafAngle = random(-PI / 5, PI / 5); // Mostly horizontal bonsai leaves

            beginShape();
            let phase = random(TWO_PI);
            for (let a = 0; a < TWO_PI; a += PI / 4) {
                let nVal = noise(cos(a + phase) + 1, sin(a + phase) + 1, particlePos.x * 0.01);

                // Ellipse radius at angle a
                let rEllipse = (leafWidth * leafHeight) / sqrt(pow(leafHeight * cos(a), 2) + pow(leafWidth * sin(a), 2));
                let rDistorted = rEllipse * (0.7 + nVal * 0.6);

                let vx = rDistorted * cos(a);
                let vy = rDistorted * sin(a);

                // Rotate by leafAngle
                let rx = vx * cos(leafAngle) - vy * sin(leafAngle);
                let ry = vx * sin(leafAngle) + vy * cos(leafAngle);

                vertex(particlePos.x + rx, particlePos.y + ry);
            }
            endShape(CLOSE);
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

function mousePressed() {
    generateTree(); // Redraw with a new seed on click
}
