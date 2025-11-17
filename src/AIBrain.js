// AIBrain.js - Decision-making logic for maze navigation with priority tiers

export default class AIBrain {
    constructor(tiers = [], speed = 500) {
        // Tiers: array of tier objects, each containing blocks
        // Each tier: { blocks: [{ type, weight, mode? }] }
        // Types: 'rightWall', 'lineOfSight', 'backtracking', 'social', 'randomGuesser'
        // Modes (optional): for 'backtracking' -> 'avoid'|'seek', for 'social' -> 'follow'|'avoid'
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
        
        // Process tiers from top to bottom
        for (const tier of this.tiers) {
            if (tier.blocks.length === 0) {
                continue; // Skip empty tiers
            }
            
            // Filter blocks by applicability
            const applicableBlocks = tier.blocks.filter(block => 
                this.isBlockApplicable(block, currentPos, visited, maze, finish, lastDirection, allPlayers, currentPlayerIndex, visitCounts, possibleMoves)
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
                const result = this.executeBlock(selectedBlock, currentPos, possibleMoves, visited, visitCounts, maze, finish, lastDirection, allPlayers, currentPlayerIndex);
                if (result.move) {
                    return result;
                }
            }
        }
        
        // If no blocks fired, fall back to random guesser
        return this.randomGuesser(possibleMoves);
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
            
            case 'backtracking':
                // Applicable if there's a mix of visited and unvisited paths
                const visitedCount = possibleMoves.filter(m => visited.has(`${m.x},${m.y}`)).length;
                const unvisitedCount = possibleMoves.length - visitedCount;
                return visitedCount > 0 && unvisitedCount > 0;
            
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
        const bestMoves = scoredMoves.filter(sm => sm.score === maxScore);
        
        // Pick randomly among best moves
        const chosen = bestMoves[Math.floor(Math.random() * bestMoves.length)];
        
        return { 
            move: chosen.move, 
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
            for (const move of possibleMoves) {
                const movingTowardFinish = 
                    (move.direction === 'up' && finish.y < currentPos.y) ||
                    (move.direction === 'down' && finish.y > currentPos.y) ||
                    (move.direction === 'left' && finish.x < currentPos.x) ||
                    (move.direction === 'right' && finish.x > currentPos.x);
                
                if (movingTowardFinish) {
                    return { move, thought: '❗' };
                }
            }
        }
        
        // Second priority: head toward uncharted territory
        let bestMove = null;
        let bestDistance = Infinity;
        
        for (const move of possibleMoves) {
            const distance = this.distanceToUncharted(move, currentPos, maze, visited);
            if (distance < bestDistance && distance > 0) {
                bestDistance = distance;
                bestMove = move;
            }
        }
        
        if (bestMove) {
            return { move: bestMove, thought: '❗' };
        }
        
        // Fallback to random
        return this.randomGuesser(possibleMoves);
    }
    
    // Backtracking Logic
    backtrackingLogic(possibleMoves, visited, visitCounts, mode) {
        if (mode === 'avoid') {
            // Prefer unvisited, then least visited
            const scoredMoves = possibleMoves.map(move => {
                const key = `${move.x},${move.y}`;
                const isVisited = visited.has(key);
                const visitCount = visitCounts.get(key) || 0;
                
                if (!isVisited) {
                    return { move, score: 1000 }; // Strongly prefer unvisited
                } else {
                    return { move, score: -visitCount }; // Penalize by visit count
                }
            });
            
            scoredMoves.sort((a, b) => b.score - a.score);
            return { move: scoredMoves[0].move, thought: '🧠' };
        } else {
            // mode === 'seek': prefer visited, with diminishing returns
            const scoredMoves = possibleMoves.map(move => {
                const key = `${move.x},${move.y}`;
                const isVisited = visited.has(key);
                const visitCount = visitCounts.get(key) || 0;
                
                if (!isVisited) {
                    return { move, score: 0 }; // Neutral for unvisited
                } else if (visitCount === 1) {
                    return { move, score: 3 };
                } else if (visitCount === 2) {
                    return { move, score: 2 };
                } else if (visitCount === 3) {
                    return { move, score: 1 };
                } else {
                    return { move, score: 0 }; // After 4+ visits, become neutral
                }
            });
            
            scoredMoves.sort((a, b) => b.score - a.score);
            return { move: scoredMoves[0].move, thought: '❓' };
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
        
        scoredMoves.sort((a, b) => b.score - a.score);
        const emote = mode === 'follow' ? '❤️' : '🫣';
        return { move: scoredMoves[0].move, thought: emote };
    }
    
    // Random Guesser Logic
    randomGuesser(possibleMoves) {
        const randomMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        return { move: randomMove, thought: '🎲' };
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
