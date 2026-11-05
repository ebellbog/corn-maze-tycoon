// levelGenerator.js - Procedurally generates cemetery layouts
//
// Coordinates are zero-indexed. Width and height are odd, so a gravestone on every
// square with an odd row AND odd column forms a lattice of pillars: the rows and
// columns between them (including the whole border) stay open and connected.
//
// Extra objects only ever go on squares that can be blocked without splitting the open
// area or walling off a gravestone, which must keep an open square beside it (diagonals
// don't count). This can run out of safe squares before everything is placed, and how
// soon depends on the layout, so a shortfall triggers a few fresh attempts.

import { OBSTACLE_SPRITES } from './sprites.js';

// Same convention as AIBrain, which reads maze.width, maze.height and maze.grid[y][x]
export const BLOCKED = 0;
export const OPEN = 1;

const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Only overfull levels use these up, and the time limit keeps large ones responsive
const MAX_ATTEMPTS = 20;
const MAX_RETRY_MS = 500;

export function getRequiredGravestoneCount(width, height) {
    return ((width - 1) / 2) * ((height - 1) / 2);
}

function isOnBorder(x, y, width, height) {
    return x === 0 || x === width - 1 || y === 0 || y === height - 1;
}

function isOpen(grid, x, y) {
    return grid[y]?.[x] === OPEN;
}

function countOpenNeighbors(grid, x, y) {
    return DIRECTIONS.filter(([dx, dy]) => isOpen(grid, x + dx, y + dy)).length;
}

function isOnlyAccessToGravestone(grid, sprites, x, y) {
    return DIRECTIONS.some(([dx, dy]) => {
        return sprites[y + dy]?.[x + dx] === 'gravestone' &&
            countOpenNeighbors(grid, x + dx, y + dy) === 1;
    });
}

// Tarjan's algorithm: flags each open square whose removal would split the open area.
// Assumes the open area is connected, so a single depth-first search reaches all of it.
function findCutSquares(grid, width, height) {
    const cellCount = width * height;
    const depth = new Int32Array(cellCount).fill(-1);
    const low = new Int32Array(cellCount);
    const isCut = new Uint8Array(cellCount);
    
    const visit = (x, y, parent, currentDepth) => {
        const index = y * width + x;
        depth[index] = currentDepth;
        low[index] = currentDepth;
        let childCount = 0;
        
        for (const [dx, dy] of DIRECTIONS) {
            const nx = x + dx;
            const ny = y + dy;
            if (!isOpen(grid, nx, ny)) {
                continue;
            }
            
            const neighbor = ny * width + nx;
            if (neighbor === parent) {
                continue;
            }
            
            if (depth[neighbor] !== -1) {
                low[index] = Math.min(low[index], depth[neighbor]);
                continue;
            }
            
            visit(nx, ny, index, currentDepth + 1);
            childCount++;
            low[index] = Math.min(low[index], low[neighbor]);
            
            // Nothing below this child loops back above us, so we're its only way out
            if (parent !== -1 && low[neighbor] >= depth[index]) {
                isCut[index] = 1;
            }
        }
        
        // The root has no "above", so it only cuts if the search had to branch from it
        if (parent === -1 && childCount > 1) {
            isCut[index] = 1;
        }
    };
    
    const firstOpen = grid.flat().indexOf(OPEN);
    visit(firstOpen % width, Math.floor(firstOpen / width), -1, 0);
    
    return isCut;
}

function findSafeSquares(grid, sprites, width, height) {
    const isCut = findCutSquares(grid, width, height);
    const open = [];
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x] === OPEN) {
                open.push({ x, y });
            }
        }
    }
    
    // The last open border square is the only way in, so it's off limits too
    const borderSquares = open.filter(({ x, y }) => isOnBorder(x, y, width, height));
    return open.filter(({ x, y }) => {
        return !isCut[y * width + x] &&
            !isOnlyAccessToGravestone(grid, sprites, x, y) &&
            !(borderSquares.length === 1 && isOnBorder(x, y, width, height));
    });
}

function createLayout({ width, height, gravestones, obstacles }, random) {
    const grid = [];
    const sprites = []; // Sprite key for each blocked square, null for open squares
    
    for (let y = 0; y < height; y++) {
        grid[y] = [];
        sprites[y] = [];
        for (let x = 0; x < width; x++) {
            const isRequired = x % 2 === 1 && y % 2 === 1;
            grid[y][x] = isRequired ? BLOCKED : OPEN;
            sprites[y][x] = isRequired ? 'gravestone' : null;
        }
    }
    
    // Gravestones go first: they matter more, and they fit best with the most room
    const extraGravestones = Math.max(gravestones - getRequiredGravestoneCount(width, height), 0);
    const extras = [
        ...Array(extraGravestones).fill('gravestone'),
        ...Array.from({ length: obstacles }, () => {
            return OBSTACLE_SPRITES[Math.floor(random() * OBSTACLE_SPRITES.length)];
        })
    ];
    
    let placedCount = 0;
    
    for (const sprite of extras) {
        const safeSquares = findSafeSquares(grid, sprites, width, height);
        if (safeSquares.length === 0) {
            break;
        }
        
        const { x, y } = safeSquares[Math.floor(random() * safeSquares.length)];
        grid[y][x] = BLOCKED;
        sprites[y][x] = sprite;
        placedCount++;
    }
    
    const entryPoints = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x] === OPEN && isOnBorder(x, y, width, height)) {
                entryPoints.push({ x, y });
            }
        }
    }
    
    return {
        width,
        height,
        grid,
        sprites,
        entryPoints,
        unplacedGravestones: Math.max(extraGravestones - placedCount, 0),
        unplacedObstacles: Math.min(extras.length - placedCount, obstacles)
    };
}

function countUnplaced({ unplacedGravestones, unplacedObstacles }) {
    return unplacedGravestones + unplacedObstacles;
}

// `gravestones` is the total, including the required lattice. If no attempt fits
// everything, returns the closest one, with the rest reported as unplaced.
export function generateCemetery(settings, random = Math.random) {
    const deadline = Date.now() + MAX_RETRY_MS;
    let best = null;
    
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const layout = createLayout(settings, random);
        if (!best || countUnplaced(layout) < countUnplaced(best)) {
            best = layout;
        }
        if (countUnplaced(best) === 0 || Date.now() > deadline) {
            break;
        }
    }
    
    return best;
}
