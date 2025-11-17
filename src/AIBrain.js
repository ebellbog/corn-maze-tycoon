// AIBrain.js - Decision-making logic for maze navigation

export default class AIBrain {
    constructor(weights = {}, speed = 500) {
        // Weights for each heuristic (normalized 0-1, except avoidRevisit and social which can be negative)
        this.weights = {
            rightWall: weights.rightWall ?? 0,
            avoidRevisit: weights.avoidRevisit ?? 0,
            lineOfSight: weights.lineOfSight ?? 0,
            social: weights.social ?? 0
        };
        
        // Speed: lower = faster (milliseconds between moves)
        this.speed = speed;
    }
    
    // Main decision-making function
    decideNextMove(currentPos, visited, visitCounts, maze, start, finish, lastDirection, allPlayers, currentPlayerIndex) {
        let possibleMoves = this.getPossibleMoves(currentPos, maze);
        
        if (possibleMoves.length === 0) {
            return { move: null, thought: null }; // Stuck - no valid moves
        }
        
        // Filter out backward direction to prevent immediate reversals
        // (even when seeking visited paths, we don't want ping-ponging)
        if (lastDirection) {
            const oppositeDir = {
                'up': 'down',
                'down': 'up',
                'left': 'right',
                'right': 'left'
            };
            const backwardDir = oppositeDir[lastDirection];
            const forwardMoves = possibleMoves.filter(m => m.direction !== backwardDir);
            
            // Only use filtered moves if there are forward options
            // (if only backward is available, we're stuck and must backtrack)
            if (forwardMoves.length > 0) {
                possibleMoves = forwardMoves;
            }
        }
        
        if (possibleMoves.length === 1) {
            return { move: possibleMoves[0], thought: null }; // Only one option
        }
        
        // Track which heuristic had the most influence
        let dominantHeuristic = null;
        let maxWeight = 0;
        
        // Score each possible move based on weighted heuristics
        const scoredMoves = possibleMoves.map(move => {
            let score = 0;
            const heuristicScores = {};
            
            // Right wall following heuristic
            if (this.weights.rightWall > 0) {
                const rwScore = this.scoreRightWall(currentPos, move, lastDirection);
                heuristicScores.rightWall = rwScore * this.weights.rightWall;
                score += heuristicScores.rightWall;
            }
            
            // Avoid revisiting heuristic (can be negative to encourage revisiting)
            if (this.weights.avoidRevisit !== 0) {
                const arScore = this.scoreAvoidRevisit(move, visited, visitCounts, this.weights.avoidRevisit);
                heuristicScores.avoidRevisit = Math.abs(arScore);
                score += arScore; // arScore is already signed
            }
            
            // Line of sight heuristic (includes finish detection and uncharted territory scouting)
            if (this.weights.lineOfSight > 0) {
                const losScore = this.scoreLineOfSight(move, finish, currentPos, maze, visited, this.weights.avoidRevisit);
                heuristicScores.lineOfSight = losScore * this.weights.lineOfSight;
                score += heuristicScores.lineOfSight;
            }
            
            // Social heuristic (follow or avoid other players)
            if (this.weights.social !== 0 && allPlayers) {
                const socialScore = this.scoreSocial(move, currentPos, maze, allPlayers, currentPlayerIndex, this.weights.social);
                heuristicScores.social = Math.abs(socialScore);
                score += socialScore; // Already signed based on weight
            }
            
            // Add random factor to break ties and create variety between agents
            score += Math.random() * 0.3;
            
            return { move, score, heuristicScores };
        });
        
        // Sort by score (highest first)
        scoredMoves.sort((a, b) => b.score - a.score);
        const bestMove = scoredMoves[0];
        
        // Debug logging when backtracking is involved
        if (this.weights.avoidRevisit !== 0 && Math.random() < 0.05) { // Log 5% of decisions
            console.log('Decision at', currentPos);
            console.log('Weights:', this.weights);
            scoredMoves.forEach(sm => {
                const key = `${sm.move.x},${sm.move.y}`;
                const vc = visitCounts.get(key) || 0;
                console.log(`  ${sm.move.direction} (${sm.move.x},${sm.move.y}) visits:${vc} score:${sm.score.toFixed(2)}`, sm.heuristicScores);
            });
            console.log('Chose:', bestMove.move.direction);
        }
        
        // Check if memory (avoidRevisit) is actually relevant to this decision
        // possibleMoves has already been filtered to exclude backward, so we can use it directly
        // Memory is relevant only if:
        // 1. There are multiple options (actual choice to make)
        // 2. At least one option has been visited before (excluding where we just came from)
        const visitedCount = possibleMoves.filter(m => visited.has(`${m.x},${m.y}`)).length;
        const unvisitedCount = possibleMoves.length - visitedCount;
        const memoryIsRelevant = possibleMoves.length >= 2 && visitedCount > 0 && unvisitedCount > 0;
        
        // Determine dominant heuristic for thought emote
        // We need to check if the best move actually benefited from each heuristic
        for (const [heuristic, score] of Object.entries(bestMove.heuristicScores)) {
            if (score > maxWeight) {
                maxWeight = score;
                dominantHeuristic = heuristic;
            }
        }
        
        // Map heuristic to thought emote
        let thought = null;
        
        // Check if the chosen move is visited or not
        const chosenKey = `${bestMove.move.x},${bestMove.move.y}`;
        const chosenIsVisited = visited.has(chosenKey);
        const chosenVisitCount = visitCounts.get(chosenKey) || 0;
        
        // First check for seeking behavior (always show if choosing visited with negative weight)
        if (this.weights.avoidRevisit < 0 && chosenIsVisited && chosenVisitCount >= 1 && memoryIsRelevant) {
            thought = '❓'; // Question mark - chose familiar path (seeking behavior)
        } else if (dominantHeuristic === 'social' && maxWeight > 0.15) {
            // Social behavior
            thought = this.weights.social > 0 ? '❤️' : '🫣'; // Heart for following, shy face for avoiding
        } else if (dominantHeuristic === 'lineOfSight' && maxWeight > 0.5) {
            thought = '❗'; // Exclamation for line of sight
        } else if (dominantHeuristic === 'rightWall' && maxWeight > 0.3) {
            thought = '→'; // Right arrow for wall following
        } else if (dominantHeuristic === 'avoidRevisit' && maxWeight > 0.15 && memoryIsRelevant) {
            // Show brain emoji if avoiding visited (positive weight choosing unvisited)
            if (this.weights.avoidRevisit > 0 && !chosenIsVisited) {
                thought = '🧠'; // Brain - avoided familiar path
            }
        } else if (maxWeight < 0.1) {
            // No heuristic had significant influence - essentially a random choice
            thought = '🎲'; // Dice - random decision
        }
        
        return { move: bestMove.move, thought };
    }
    
    getPossibleMoves(pos, maze) {
        const directions = [
            { x: 0, y: -1, name: 'up' },    // up
            { x: 1, y: 0, name: 'right' },  // right
            { x: 0, y: 1, name: 'down' },   // down
            { x: -1, y: 0, name: 'left' }   // left
        ];
        
        const moves = [];
        for (const dir of directions) {
            const newPos = {
                x: pos.x + dir.x,
                y: pos.y + dir.y,
                direction: dir.name
            };
            
            // Check if valid move (within bounds and on path)
            if (newPos.x >= 0 && newPos.x < maze.width &&
                newPos.y >= 0 && newPos.y < maze.height &&
                maze.grid[newPos.y][newPos.x] === 1) {
                moves.push(newPos);
            }
        }
        
        return moves;
    }
    
    // Heuristic: Right wall following
    // Returns 0-1 score, higher if this move follows right-wall rule
    scoreRightWall(currentPos, nextPos, lastDirection) {
        // Right wall following: try right first, then straight, then left, then back
        // Priority: right turn (1.0), straight (0.6), left turn (0.3), U-turn (0.0)
        
        if (!lastDirection) {
            // No history, default to preferring the move
            return 0.5;
        }
        
        // Determine what kind of turn this is relative to last direction
        const turnType = this.getTurnType(lastDirection, nextPos.direction);
        
        const priorities = {
            'right': 1.0,
            'straight': 0.6,
            'left': 0.3,
            'back': 0.0
        };
        
        return priorities[turnType] || 0.5;
    }
    
    // Helper: Determine turn type
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
        
        return 'straight'; // fallback
    }
    
    // Heuristic: Avoid revisiting (or encourage if negative weight)
    // Returns a signed score based on visit count and weight
    scoreAvoidRevisit(pos, visited, visitCounts, weight) {
        const key = `${pos.x},${pos.y}`;
        const isVisited = visited.has(key);
        const visitCount = visitCounts.get(key) || 0;
        
        if (weight > 0) {
            // Positive weight: avoid visited (prefer unvisited)
            if (!isVisited) {
                return weight; // Strongly prefer unvisited
            } else {
                // Visited: penalize based on visit count (scales indefinitely)
                // This ensures even when choosing between visited paths, less-visited is always better
                const penalty = -weight * (visitCount * 0.2);
                return penalty;
            }
        } else {
            // Negative weight: seek familiar paths, but with diminishing returns
            // Goal: Be "bad at mazes" but not better than random
            // Note: Higher score = more preferred, so we return POSITIVE for encouraged paths
            const attractionStrength = Math.abs(weight) * 0.3;
            
            if (!isVisited) {
                // Unvisited: neutral (don't make them smarter by preferring new paths)
                return 0;
            }
            
            // Visited: Attraction decreases with visit count, eventually reaching zero
            // Return POSITIVE scores to encourage these paths (higher = more preferred)
            
            if (visitCount === 1) {
                // First visit: most attractive (positive score = encouraged)
                return attractionStrength * 0.6;
            } else if (visitCount === 2) {
                // Second visit: less attractive
                return attractionStrength * 0.3;
            } else if (visitCount === 3) {
                // Third visit: barely attractive
                return attractionStrength * 0.1;
            } else {
                // 4+ visits: neutral (no preference, equivalent to random)
                return 0;
            }
        }
    }
    
    // Heuristic: Line of sight to finish AND uncharted territory
    // Returns 1 if heading toward finish, 0.5 if heading toward unvisited territory, 0 otherwise
    scoreLineOfSight(nextPos, finish, currentPos, maze, visited, avoidRevisitWeight) {
        let score = 0;
        
        // First, check for finish visibility (highest priority)
        if (finish) {
            let finishVisible = false;
            
            if (currentPos.x === finish.x) {
                // Vertical line to finish
                const minY = Math.min(currentPos.y, finish.y);
                const maxY = Math.max(currentPos.y, finish.y);
                let pathClear = true;
                for (let y = minY + 1; y < maxY; y++) {
                    if (maze.grid[y][currentPos.x] !== 1) {
                        pathClear = false;
                        break;
                    }
                }
                finishVisible = pathClear;
            } else if (currentPos.y === finish.y) {
                // Horizontal line to finish
                const minX = Math.min(currentPos.x, finish.x);
                const maxX = Math.max(currentPos.x, finish.x);
                let pathClear = true;
                for (let x = minX + 1; x < maxX; x++) {
                    if (maze.grid[currentPos.y][x] !== 1) {
                        pathClear = false;
                        break;
                    }
                }
                finishVisible = pathClear;
            }
            
            if (finishVisible) {
                // Check if this move is toward the finish
                const movingTowardFinish = 
                    (nextPos.direction === 'up' && finish.y < currentPos.y) ||
                    (nextPos.direction === 'down' && finish.y > currentPos.y) ||
                    (nextPos.direction === 'left' && finish.x < currentPos.x) ||
                    (nextPos.direction === 'right' && finish.x > currentPos.x);
                
                if (movingTowardFinish) {
                    return 1; // Highest priority - finish in sight!
                }
            }
        }
        
        // Second, check for uncharted territory (only if avoiding backtracking)
        if (avoidRevisitWeight > 0) {
            // Look in the direction we're moving for unvisited cells
            const directionDeltas = {
                'up': { dx: 0, dy: -1 },
                'down': { dx: 0, dy: 1 },
                'left': { dx: -1, dy: 0 },
                'right': { dx: 1, dy: 0 }
            };
            
            const delta = directionDeltas[nextPos.direction];
            if (delta) {
                // Scan ahead in this direction
                let checkX = currentPos.x + delta.dx;
                let checkY = currentPos.y + delta.dy;
                
                // Look up to 5 cells ahead
                for (let distance = 1; distance <= 5; distance++) {
                    // Check bounds
                    if (checkX < 0 || checkX >= maze.width || 
                        checkY < 0 || checkY >= maze.height) {
                        break;
                    }
                    
                    // If we hit corn, stop looking
                    if (maze.grid[checkY][checkX] !== 1) {
                        break;
                    }
                    
                    // Check if this cell is unvisited
                    const key = `${checkX},${checkY}`;
                    if (!visited.has(key)) {
                        // Found uncharted territory! Return bonus scaled by avoidRevisit strength
                        return 0.5 * Math.min(avoidRevisitWeight, 1);
                    }
                    
                    // Continue in this direction
                    checkX += delta.dx;
                    checkY += delta.dy;
                }
            }
        }
        
        return 0;
    }
    
    // Heuristic: Social behavior (follow or avoid other players)
    // Returns a signed score based on whether other players are visible
    scoreSocial(nextPos, currentPos, maze, allPlayers, currentPlayerIndex, weight) {
        if (!allPlayers || allPlayers.length <= 1) {
            return 0; // No other players to interact with
        }
        
        // Calculate line of sight range based on weight magnitude
        // Higher absolute weight = look further
        const maxDistance = Math.ceil(Math.abs(weight) * 5) + 2; // 2-7 cells
        
        // Check if there are any players visible in the direction we're moving
        const directionDeltas = {
            'up': { dx: 0, dy: -1 },
            'down': { dx: 0, dy: 1 },
            'left': { dx: -1, dy: 0 },
            'right': { dx: 1, dy: 0 }
        };
        
        const delta = directionDeltas[nextPos.direction];
        if (!delta) return 0;
        
        // Scan ahead in this direction for other players
        let checkX = currentPos.x + delta.dx;
        let checkY = currentPos.y + delta.dy;
        
        for (let distance = 1; distance <= maxDistance; distance++) {
            // Check bounds
            if (checkX < 0 || checkX >= maze.width || 
                checkY < 0 || checkY >= maze.height) {
                break;
            }
            
            // If we hit corn, stop looking
            if (maze.grid[checkY][checkX] !== 1) {
                break;
            }
            
            // Check if any player (other than us) is at this position
            for (let i = 0; i < allPlayers.length; i++) {
                if (i === currentPlayerIndex) continue; // Skip self
                
                const player = allPlayers[i];
                if (!player.isActive || player.isFinished || player.isRemoved) continue; // Skip inactive/finished/removed players
                
                if (player.position.x === checkX && player.position.y === checkY) {
                    // Found a player! Return score based on weight sign and distance
                    // Closer players have stronger influence
                    const distanceFactor = 1 - (distance / maxDistance) * 0.5; // 1.0 to 0.5
                    const baseScore = Math.abs(weight) * distanceFactor;
                    
                    // Positive weight = follow (positive score toward players)
                    // Negative weight = avoid (negative score toward players)
                    return weight > 0 ? baseScore : -baseScore;
                }
            }
            
            // Continue in this direction
            checkX += delta.dx;
            checkY += delta.dy;
        }
        
        return 0; // No players found in this direction
    }
}

