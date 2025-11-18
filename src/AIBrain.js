// AIBrain.js - Decision-making logic for maze navigation with priority tiers

export default class AIBrain {
    constructor(tiers = [], speed = 500) {
        // Tiers: array of tier objects, each containing blocks
        // Each tier: { blocks: [{ type, weight, mode? }] }
        // Types: 'wallFollowing', 'lineOfSight', 'towardExit', 'backtracking', 'social', 'randomGuesser'
        // Modes (optional): for 'wallFollowing' -> 'left'|'right', for 'backtracking' -> 'avoid'|'seek', for 'social' -> 'follow'|'avoid'
        this.tiers = tiers.length > 0 ? tiers : [
            { blocks: [] },
            { blocks: [] },
            { blocks: [] }
        ];
        
        // Speed: lower = faster (milliseconds between moves)
        this.speed = speed;
    }
    
    // Main decision-making function with tier-based priority system
    decideNextMove(currentPos, visited, visitCounts, maze, start, finish, lastDirection, allPlayers, currentPlayerIndex) {
        let possibleMoves = this.getPossibleMoves(currentPos, maze);
        
        if (possibleMoves.length === 0) {
            return { move: null, thought: null }; // Stuck - no valid moves
        }
        
        // Filter out backward direction to prevent immediate reversals
        if (lastDirection) {
            const oppositeDir = {
                'up': 'down',
                'down': 'up',
                'left': 'right',
                'right': 'left'
            };
            const backwardDir = oppositeDir[lastDirection];
            const forwardMoves = possibleMoves.filter(m => m.direction !== backwardDir);
            
            if (forwardMoves.length > 0) {
                possibleMoves = forwardMoves;
            }
        }
        
        if (possibleMoves.length === 1) {
            return { move: possibleMoves[0], thought: null }; // Only one option
        }
        
        // Process tiers recursively for tie-breaking
        let currentMoves = possibleMoves;
        let emotes = [];
        
        for (let tierIndex = 0; tierIndex < this.tiers.length; tierIndex++) {
            const tier = this.tiers[tierIndex];
            
            if (tier.blocks.length === 0) {
                continue; // Skip empty tiers
            }
            
            // Filter blocks by applicability (using current narrowed-down moves)
            const applicableBlocks = tier.blocks.filter(block => 
                this.isBlockApplicable(block, currentPos, visited, maze, finish, lastDirection, allPlayers, currentPlayerIndex, visitCounts, currentMoves)
            );
            
            if (applicableBlocks.length === 0) {
                continue; // No applicable blocks in this tier, try next tier
            }
            
            // Calculate total weight of applicable blocks
            const totalWeight = applicableBlocks.reduce((sum, block) => sum + block.weight, 0);
            
            // Randomly select a block based on relative weights
            let random = Math.random() * totalWeight;
            let selectedBlock = null;
            
            for (const block of applicableBlocks) {
                random -= block.weight;
                if (random <= 0) {
                    selectedBlock = block;
                    break;
                }
            }
            
            // If we selected a block, execute its logic
            if (selectedBlock) {
                const result = this.executeBlock(selectedBlock, currentPos, currentMoves, visited, visitCounts, maze, finish, lastDirection, allPlayers, currentPlayerIndex);
                
                if (result.moves && result.moves.length > 0) {
                    // Add emote to our collection
                    if (result.thought) {
                        emotes.push(result.thought);
                    }
                    
                    // If we narrowed down to exactly one move, we're done
                    if (result.moves.length === 1) {
                        const finalThought = this.combineEmotes(emotes);
                        return { move: result.moves[0], thought: finalThought };
                    }
                    
                    // Otherwise, continue to next tier with these narrowed-down moves
                    currentMoves = result.moves;
                }
            }
        }
        
        // If we still have multiple moves after all tiers, pick randomly
        const finalMove = currentMoves[Math.floor(Math.random() * currentMoves.length)];
        
        // Only add dice emoji if we have no other emotes
        if (emotes.length === 0) {
            emotes.push('🎲');
        }
        
        const finalThought = this.combineEmotes(emotes);
        return { move: finalMove, thought: finalThought };
    }
    
    // Combine multiple emotes, excluding dice if there are others
    combineEmotes(emotes) {
        if (emotes.length === 0) return null;
        if (emotes.length === 1) return emotes[0];
        
        // Filter out dice if there are other emotes
        const filtered = emotes.filter(e => e !== '🎲');
        if (filtered.length > 0) {
            return filtered.join('');
        }
        
        return emotes[0];
    }
    
    // Check if a logic block is applicable to the current situation
    isBlockApplicable(block, currentPos, visited, maze, finish, lastDirection, allPlayers, currentPlayerIndex, visitCounts, possibleMoves) {
        switch (block.type) {
            case 'wallFollowing':
            case 'rightWall':
                // Always applicable if we have a last direction
                return lastDirection !== null;
            
            case 'lineOfSight':
                // Applicable if finish is visible OR uncharted territory is visible
                return this.isFinishVisible(currentPos, finish, maze) || 
                       this.hasUnchartedTerritory(currentPos, maze, visited, possibleMoves);
            
            case 'towardExit':
                // Applicable if we have a finish position AND at least one move gets us closer than current
                if (!finish) return false;
                
                // Calculate current position's distance to exit
                const currentDx = finish.x - currentPos.x;
                const currentDy = finish.y - currentPos.y;
                const currentDistance = Math.sqrt(currentDx * currentDx + currentDy * currentDy);
                
                // Find moves that are closer to exit than current position
                const closerMoves = possibleMoves.filter(move => {
                    const dx = finish.x - move.x;
                    const dy = finish.y - move.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    return distance < currentDistance;
                });
                
                // Not applicable if no moves get us closer
                if (closerMoves.length === 0) return false;
                
                // Calculate distances for closer moves
                const distances = closerMoves.map(move => {
                    const dx = finish.x - move.x;
                    const dy = finish.y - move.y;
                    return Math.sqrt(dx * dx + dy * dy);
                });
                
                // Only applicable if there's variation among the closer moves
                const minDist = Math.min(...distances);
                const maxDist = Math.max(...distances);
                return minDist < maxDist || closerMoves.length === 1; // True if distances vary OR only one closer move
            
            case 'checkMap':
                // Applicable if there's a finish position and a path exists
                if (!finish) return false;
                const shortestPath = this.findShortestPath(currentPos, finish, maze);
                return shortestPath !== null && shortestPath.length > 1;
            
            case 'backtracking':
                // Get visit counts for all moves
                const counts = possibleMoves.map(m => {
                    const key = `${m.x},${m.y}`;
                    return visitCounts.get(key) || 0;
                });
                
                // Only applicable if not all moves have the same visit count
                const minCount = Math.min(...counts);
                const maxCount = Math.max(...counts);
                
                // Applicable if there's variation in visit counts
                return minCount < maxCount;
            
            case 'social':
                // Applicable if other players are visible in any direction
                return this.hasVisiblePlayers(currentPos, maze, allPlayers, currentPlayerIndex, possibleMoves);
            
            case 'randomGuesser':
                // Always applicable
                return true;
            
            default:
                return false;
        }
    }
    
    // Execute a logic block's decision-making
    executeBlock(block, currentPos, possibleMoves, visited, visitCounts, maze, finish, lastDirection, allPlayers, currentPlayerIndex) {
        switch (block.type) {
            case 'wallFollowing':
                return this.wallFollowingLogic(possibleMoves, lastDirection, block.mode || 'right');
            case 'rightWall':
                return this.rightWallLogic(possibleMoves, lastDirection);
            
            case 'lineOfSight':
                return this.lineOfSightLogic(possibleMoves, currentPos, finish, maze, visited);
            
            case 'towardExit':
                return this.towardExitLogic(possibleMoves, currentPos, finish);
            
            case 'checkMap':
                return this.checkMapLogic(possibleMoves, currentPos, finish, maze);
            
            case 'backtracking':
                return this.backtrackingLogic(possibleMoves, visited, visitCounts, block.mode || 'avoid');
            
            case 'social':
                return this.socialLogic(possibleMoves, currentPos, maze, allPlayers, currentPlayerIndex, block.mode || 'follow');
            
            case 'randomGuesser':
                return this.randomGuesser(possibleMoves);
            
            default:
                return this.randomGuesser(possibleMoves);
        }
    }
    
    // Wall Following Logic (supports both left and right)
    wallFollowingLogic(possibleMoves, lastDirection, mode) {
        // Score each move based on wall following priority
        const scoredMoves = possibleMoves.map(move => ({
            move,
            score: this.scoreWallFollowing(null, move, lastDirection, mode)
        }));
        
        // Find the highest score
        const maxScore = Math.max(...scoredMoves.map(sm => sm.score));
        const bestMoves = scoredMoves.filter(sm => sm.score === maxScore).map(sm => sm.move);
        
        return { 
            moves: bestMoves, 
            thought: mode === 'left' ? '←' : '→'
        };
    }
    
    // Right Wall Following Logic (legacy)
    rightWallLogic(possibleMoves, lastDirection) {
        return this.wallFollowingLogic(possibleMoves, lastDirection, 'right');
    }
    
    // Line of Sight Logic
    lineOfSightLogic(possibleMoves, currentPos, finish, maze, visited) {
        // First priority: head toward visible finish
        if (finish && this.isFinishVisible(currentPos, finish, maze)) {
            const towardFinish = possibleMoves.filter(move => {
                return (move.direction === 'up' && finish.y < currentPos.y) ||
                       (move.direction === 'down' && finish.y > currentPos.y) ||
                       (move.direction === 'left' && finish.x < currentPos.x) ||
                       (move.direction === 'right' && finish.x > currentPos.x);
            });
            
            if (towardFinish.length > 0) {
                return { moves: towardFinish, thought: '❗' };
            }
        }
        
        // Second priority: head toward uncharted territory
        let bestDistance = Infinity;
        const movesWithDistance = possibleMoves.map(move => ({
            move,
            distance: this.distanceToUncharted(move, currentPos, maze, visited)
        })).filter(md => md.distance > 0);
        
        if (movesWithDistance.length > 0) {
            bestDistance = Math.min(...movesWithDistance.map(md => md.distance));
            const bestMoves = movesWithDistance.filter(md => md.distance === bestDistance).map(md => md.move);
            return { moves: bestMoves, thought: '❗' };
        }
        
        // Fallback - return all moves
        return { moves: possibleMoves, thought: null };
    }
    
    // Toward Exit Logic
    towardExitLogic(possibleMoves, currentPos, finish) {
        if (!finish) {
            return { moves: possibleMoves, thought: null };
        }
        
        // Calculate current position's distance to exit
        const currentDx = finish.x - currentPos.x;
        const currentDy = finish.y - currentPos.y;
        const currentDistance = Math.sqrt(currentDx * currentDx + currentDy * currentDy);
        
        // Filter to only moves that get us closer to the exit
        const closerMoves = possibleMoves.filter(move => {
            const dx = finish.x - move.x;
            const dy = finish.y - move.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance < currentDistance;
        });
        
        // If no moves get us closer, return all (shouldn't happen if applicability check works)
        if (closerMoves.length === 0) {
            return { moves: possibleMoves, thought: null };
        }
        
        // Calculate Euclidean distance from each closer move to the finish
        const scoredMoves = closerMoves.map(move => {
            const dx = finish.x - move.x;
            const dy = finish.y - move.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            return { move, distance };
        });
        
        // Find the move(s) with minimum distance
        const minDistance = Math.min(...scoredMoves.map(sm => sm.distance));
        const bestMoves = scoredMoves.filter(sm => sm.distance === minDistance).map(sm => sm.move);
        
        return { 
            moves: bestMoves, 
            thought: '🧭'
        };
    }
    
    // Check Map Logic - follows shortest path with perfect knowledge
    checkMapLogic(possibleMoves, currentPos, finish, maze) {
        if (!finish) {
            return { moves: possibleMoves, thought: null };
        }
        
        // Find shortest path from current position to finish
        const shortestPath = this.findShortestPath(currentPos, finish, maze);
        
        if (!shortestPath || shortestPath.length <= 1) {
            return { moves: possibleMoves, thought: null };
        }
        
        // The next step on the shortest path is at index 1 (index 0 is current position)
        const nextStep = shortestPath[1];
        
        // Find all moves that lead to the next step (should be one, but handle ties)
        const bestMoves = possibleMoves.filter(move => 
            move.x === nextStep.x && move.y === nextStep.y
        );
        
        if (bestMoves.length > 0) {
            return { moves: bestMoves, thought: '🗺️' };
        }
        
        // Fallback (shouldn't happen)
        return { moves: possibleMoves, thought: null };
    }
    
    // Backtracking Logic
    backtrackingLogic(possibleMoves, visited, visitCounts, mode) {
        // Get visit count for each move
        const movesWithCounts = possibleMoves.map(move => {
            const key = `${move.x},${move.y}`;
            const count = visitCounts.get(key) || 0;
            return { move, count };
        });
        
        if (mode === 'avoid') {
            // Choose the square(s) with the lowest visit count
            const minCount = Math.min(...movesWithCounts.map(mc => mc.count));
            const bestMoves = movesWithCounts.filter(mc => mc.count === minCount).map(mc => mc.move);
            
            return { moves: bestMoves, thought: '🧠' };
        } else {
            // mode === 'seek': choose the square(s) with the highest visit count
            const maxCount = Math.max(...movesWithCounts.map(mc => mc.count));
            const bestMoves = movesWithCounts.filter(mc => mc.count === maxCount).map(mc => mc.move);
            
            return { moves: bestMoves, thought: '❓' };
        }
    }
    
    // Social Logic
    socialLogic(possibleMoves, currentPos, maze, allPlayers, currentPlayerIndex, mode) {
        const scoredMoves = possibleMoves.map(move => {
            const playersInDirection = this.countPlayersInDirection(move, currentPos, maze, allPlayers, currentPlayerIndex);
            
            if (mode === 'follow') {
                return { move, score: playersInDirection }; // More players = better
            } else {
                return { move, score: -playersInDirection }; // More players = worse
            }
        });
        
        const maxScore = Math.max(...scoredMoves.map(sm => sm.score));
        const bestMoves = scoredMoves.filter(sm => sm.score === maxScore).map(sm => sm.move);
        const emote = mode === 'follow' ? '❤️' : '🫣';
        
        return { moves: bestMoves, thought: emote };
    }
    
    // Random Guesser Logic
    randomGuesser(possibleMoves) {
        return { moves: possibleMoves, thought: '🎲' };
    }
    
    // Helper: Check if finish is visible from current position
    isFinishVisible(currentPos, finish, maze) {
        if (!finish) return false;
        
        if (currentPos.x === finish.x) {
            // Vertical line to finish
            const minY = Math.min(currentPos.y, finish.y);
            const maxY = Math.max(currentPos.y, finish.y);
            for (let y = minY + 1; y < maxY; y++) {
                if (maze.grid[y][currentPos.x] !== 1) {
                    return false;
                }
            }
            return true;
        } else if (currentPos.y === finish.y) {
            // Horizontal line to finish
            const minX = Math.min(currentPos.x, finish.x);
            const maxX = Math.max(currentPos.x, finish.x);
            for (let x = minX + 1; x < maxX; x++) {
                if (maze.grid[currentPos.y][x] !== 1) {
                    return false;
                }
            }
            return true;
        }
        
        return false;
    }
    
    // Helper: Check if uncharted territory is visible
    hasUnchartedTerritory(currentPos, maze, visited, possibleMoves) {
        for (const move of possibleMoves) {
            if (this.distanceToUncharted(move, currentPos, maze, visited) > 0) {
                return true;
            }
        }
        return false;
    }
    
    // Helper: Distance to uncharted territory in a direction
    distanceToUncharted(move, currentPos, maze, visited) {
        const directionDeltas = {
            'up': { dx: 0, dy: -1 },
            'down': { dx: 0, dy: 1 },
            'left': { dx: -1, dy: 0 },
            'right': { dx: 1, dy: 0 }
        };
        
        const delta = directionDeltas[move.direction];
        if (!delta) return 0;
        
        let checkX = currentPos.x + delta.dx;
        let checkY = currentPos.y + delta.dy;
        
        for (let distance = 1; distance <= 5; distance++) {
            if (checkX < 0 || checkX >= maze.width || 
                checkY < 0 || checkY >= maze.height) {
                break;
            }
            
            if (maze.grid[checkY][checkX] !== 1) {
                break;
            }
            
            const key = `${checkX},${checkY}`;
            if (!visited.has(key)) {
                return distance;
            }
            
            checkX += delta.dx;
            checkY += delta.dy;
        }
        
        return 0;
    }
    
    // Helper: Check if other players are visible
    hasVisiblePlayers(currentPos, maze, allPlayers, currentPlayerIndex, possibleMoves) {
        for (const move of possibleMoves) {
            if (this.countPlayersInDirection(move, currentPos, maze, allPlayers, currentPlayerIndex) > 0) {
                return true;
            }
        }
        return false;
    }
    
    // Helper: Count players visible in a direction
    countPlayersInDirection(move, currentPos, maze, allPlayers, currentPlayerIndex) {
        if (!allPlayers || allPlayers.length <= 1) {
            return 0;
        }
        
        const directionDeltas = {
            'up': { dx: 0, dy: -1 },
            'down': { dx: 0, dy: 1 },
            'left': { dx: -1, dy: 0 },
            'right': { dx: 1, dy: 0 }
        };
        
        const delta = directionDeltas[move.direction];
        if (!delta) return 0;
        
        let checkX = currentPos.x + delta.dx;
        let checkY = currentPos.y + delta.dy;
        let count = 0;
        
        for (let distance = 1; distance <= 7; distance++) {
            if (checkX < 0 || checkX >= maze.width || 
                checkY < 0 || checkY >= maze.height) {
                break;
            }
            
            if (maze.grid[checkY][checkX] !== 1) {
                break;
            }
            
            for (let i = 0; i < allPlayers.length; i++) {
                if (i === currentPlayerIndex) continue;
                
                const player = allPlayers[i];
                if (!player.isActive || player.isFinished || player.isRemoved) continue;
                
                if (player.position.x === checkX && player.position.y === checkY) {
                    count++;
                }
            }
            
            checkX += delta.dx;
            checkY += delta.dy;
        }
        
        return count;
    }
    
    getPossibleMoves(pos, maze) {
        const directions = [
            { x: 0, y: -1, name: 'up' },
            { x: 1, y: 0, name: 'right' },
            { x: 0, y: 1, name: 'down' },
            { x: -1, y: 0, name: 'left' }
        ];
        
        const moves = [];
        for (const dir of directions) {
            const newPos = {
                x: pos.x + dir.x,
                y: pos.y + dir.y,
                direction: dir.name
            };
            
            if (newPos.x >= 0 && newPos.x < maze.width &&
                newPos.y >= 0 && newPos.y < maze.height &&
                maze.grid[newPos.y][newPos.x] === 1) {
                moves.push(newPos);
            }
        }
        
        return moves;
    }
    
    // Find shortest path using BFS (for Check Map logic)
    findShortestPath(start, finish, maze) {
        if (!start || !finish) return null;
        
        // BFS to find shortest path
        const queue = [[start.x, start.y]];
        const visited = new Set();
        const parent = new Map();
        visited.add(`${start.x},${start.y}`);
        
        const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
        
        while (queue.length > 0) {
            const [x, y] = queue.shift();
            
            if (x === finish.x && y === finish.y) {
                // Reconstruct path
                const path = [];
                let current = `${x},${y}`;
                while (current) {
                    const [cx, cy] = current.split(',').map(Number);
                    path.unshift({ x: cx, y: cy });
                    current = parent.get(current);
                }
                return path;
            }
            
            for (const [dx, dy] of directions) {
                const nx = x + dx;
                const ny = y + dy;
                const key = `${nx},${ny}`;
                
                if (nx >= 0 && nx < maze.width && 
                    ny >= 0 && ny < maze.height &&
                    maze.grid[ny][nx] === 1 &&
                    !visited.has(key)) {
                    visited.add(key);
                    parent.set(key, `${x},${y}`);
                    queue.push([nx, ny]);
                }
            }
        }
        
        return null; // No path found
    }
    
    // Wall following scoring (supports both right and left)
    scoreWallFollowing(currentPos, move, lastDirection, mode = 'right') {
        if (!lastDirection) return 0;
        
        // Wall following priority order based on current direction
        const rightPriority = {
            'up': ['right', 'up', 'left', 'down'],
            'right': ['down', 'right', 'up', 'left'],
            'down': ['left', 'down', 'right', 'up'],
            'left': ['up', 'left', 'down', 'right']
        };
        
        const leftPriority = {
            'up': ['left', 'up', 'right', 'down'],
            'right': ['up', 'right', 'down', 'left'],
            'down': ['right', 'down', 'left', 'up'],
            'left': ['down', 'left', 'up', 'right']
        };
        
        const order = mode === 'left' ? leftPriority[lastDirection] : rightPriority[lastDirection];
        const index = order.indexOf(move.direction);
        
        // Higher score for higher priority (reverse index)
        return index >= 0 ? (4 - index) : 0;
    }
    
    // Right wall scoring (legacy support)
    scoreRightWall(currentPos, nextPos, lastDirection) {
        return this.scoreWallFollowing(currentPos, nextPos, lastDirection, 'right');
    }
    
    getTurnType(fromDir, toDir) {
        const rightTurns = {
            'up': 'right',
            'right': 'down',
            'down': 'left',
            'left': 'up'
        };
        
        const leftTurns = {
            'up': 'left',
            'left': 'down',
            'down': 'right',
            'right': 'up'
        };
        
        const backTurns = {
            'up': 'down',
            'down': 'up',
            'left': 'right',
            'right': 'left'
        };
        
        if (fromDir === toDir) return 'straight';
        if (rightTurns[fromDir] === toDir) return 'right';
        if (leftTurns[fromDir] === toDir) return 'left';
        if (backTurns[fromDir] === toDir) return 'back';
        
        return 'straight';
    }
}
