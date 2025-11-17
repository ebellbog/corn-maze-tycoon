// Player.js - Represents a player navigating the maze

export default class Player {
    constructor(emoji, brain, startPosition, game) {
        this.emoji = emoji;
        this.brain = brain;
        this.position = { ...startPosition };
        this.game = game;
        this.visited = new Set();
        this.visitCounts = new Map(); // Track how many times each cell has been visited
        this.path = [{ ...startPosition }];
        this.isActive = true;
        this.moveInterval = null;
        this.isFinished = false;
        this.isRemoved = false; // Flag to hide player after finishing
        this.lastDirection = null; // Track last direction of travel
        this.currentThought = null; // Current thought emote (!, →, 🧠)
        this.isPaused = false;
        
        // Mark starting position as visited
        const startKey = `${startPosition.x},${startPosition.y}`;
        this.visited.add(startKey);
        this.visitCounts.set(startKey, 1);
    }
    
    startMoving() {
        if (!this.isActive) return;
        
        const move = () => {
            if (!this.isActive || this.isFinished || this.isPaused) {
                if (this.isPaused) {
                    // Check again in 100ms if paused
                    this.moveInterval = setTimeout(move, 100);
                }
                return;
            }
            
            // Check if reached finish
            const finish = this.game.finishPosition;
            if (finish && this.position.x === finish.x && this.position.y === finish.y) {
                this.isFinished = true;
                this.isActive = false;
                this.currentThought = '🎉';
                this.game.render();
                
                // Hide player from maze after a short celebration (1 second)
                setTimeout(() => {
                    this.isRemoved = true;
                    this.game.render();
                }, 1000);
                
                return;
            }
            
            // Get all possible moves
            const possibleMoves = this.brain.getPossibleMoves(this.position, this.game);
            
            // Determine opposite direction (backward)
            const oppositeDir = {
                'up': 'down',
                'down': 'up',
                'left': 'right',
                'right': 'left'
            };
            const backwardDir = this.lastDirection ? oppositeDir[this.lastDirection] : null;
            
            // Filter out backward move to get only forward options
            const forwardMoves = backwardDir 
                ? possibleMoves.filter(m => m.direction !== backwardDir)
                : possibleMoves;
            
            let nextMove;
            let needsDecision = false;
            
            // If there's only one forward option (simple turn or straight corridor), take it automatically
            if (forwardMoves.length === 1) {
                nextMove = forwardMoves[0];
                this.currentThought = null; // No thought - automatic movement
            } else {
                // Multiple forward options (true intersection) or no forward options (dead end)
                // Need to make a decision using the AI brain
                needsDecision = true;
                const currentPlayerIndex = this.game.players.indexOf(this);
                const decision = this.brain.decideNextMove(
                    this.position,
                    this.visited,
                    this.visitCounts,
                    this.game,
                    this.game.startPosition,
                    this.game.finishPosition,
                    this.lastDirection,
                    this.game.players,
                    currentPlayerIndex
                );
                nextMove = decision.move;
                this.currentThought = decision.thought;
            }
            
            if (nextMove) {
                // If we need to make a decision, pause to "think" before moving
                if (needsDecision) {
                    // Show the thought bubble immediately
                    this.game.render();
                    
                    // Pause for thinking (300ms base, scaled by playback speed)
                    const thinkingDuration = 300 / this.game.playbackSpeed;
                    
                    // After thinking, execute the move
                    this.moveInterval = setTimeout(() => {
                        // Check if paused or stopped during thinking
                        if (!this.isActive || this.isFinished || this.isPaused) {
                            if (this.isPaused) {
                                // Check again in 100ms if paused
                                this.moveInterval = setTimeout(move, 100);
                            }
                            return;
                        }
                        
                        // Execute the move
                        this.position = { x: nextMove.x, y: nextMove.y };
                        this.lastDirection = nextMove.direction;
                        this.path.push({ ...this.position });
                        
                        // Mark as visited and increment visit count
                        const key = `${nextMove.x},${nextMove.y}`;
                        this.visited.add(key);
                        this.visitCounts.set(key, (this.visitCounts.get(key) || 0) + 1);
                        
                        // Clear thought after move
                        this.currentThought = null;
                        
                        // Re-render game
                        this.game.render();
                        
                        // Schedule next move with game speed multiplier
                        const adjustedSpeed = this.brain.speed / this.game.playbackSpeed;
                        this.moveInterval = setTimeout(move, adjustedSpeed);
                    }, thinkingDuration);
                } else {
                    // No decision needed - move immediately
                    this.position = { x: nextMove.x, y: nextMove.y };
                    this.lastDirection = nextMove.direction;
                    this.path.push({ ...this.position });
                    
                    // Mark as visited and increment visit count
                    const key = `${nextMove.x},${nextMove.y}`;
                    this.visited.add(key);
                    this.visitCounts.set(key, (this.visitCounts.get(key) || 0) + 1);
                    
                    // Re-render game
                    this.game.render();
                    
                    // Schedule next move with game speed multiplier
                    const adjustedSpeed = this.brain.speed / this.game.playbackSpeed;
                    this.moveInterval = setTimeout(move, adjustedSpeed);
                }
            } else {
                // No valid moves - player is stuck
                this.isActive = false;
                this.currentThought = '❌';
                this.game.render();
            }
        };
        
        // Start the movement loop
        this.moveInterval = setTimeout(move, this.brain.speed / this.game.playbackSpeed);
    }
    
    stopMoving() {
        this.isActive = false;
        if (this.moveInterval) {
            clearTimeout(this.moveInterval);
            this.moveInterval = null;
        }
    }
    
    static getBaseEmojis() {
        // All emojis in this list support skin tone modifiers
        // Note: Some compound emojis may have varying skin tone support across platforms
        return [
            // Basic people
            '👨', '👩', '👦', '👧', '🧑',
            '👴', '👵', '🧒', '👶', '🧔',
            '👱‍♀️', '👱‍♂️', '🧓', '👨‍🦱', '👩‍🦱',
            '👨‍🦰', '👩‍🦰', '👨‍🦳', '👩‍🦳', '👨‍🦲',
            '👩‍🦲', '🧑‍🦰', '🧑‍🦱', '🧑‍🦳', '🧑‍🦲',
            // Professions - gender neutral versions that support skin tones
            '🧑‍⚕️', '🧑‍🎓', '🧑‍🏫', '🧑‍⚖️', '🧑‍🌾',
            '🧑‍🍳', '🧑‍🔧', '🧑‍🏭', '🧑‍💼', '🧑‍🔬',
            '🧑‍💻', '🧑‍🎤', '🧑‍🎨', '🧑‍✈️', '🧑‍🚀',
            '🧑‍🚒', '🧑‍🎬', '🧑‍🎯', '🧑‍🎪',
            // Other roles and characters
            '🤴', '👸', '👳', '👳‍♂️', '👳‍♀️',
            '👲', '🧕', '🤵', '🤵‍♂️', '🤵‍♀️',
            '👰', '👰‍♂️', '👰‍♀️', '🎅', '🤶',
            '🦸', '🦸‍♂️', '🦸‍♀️', '🦹', '🦹‍♂️',
            '🦹‍♀️', '🧙', '🧙‍♂️', '🧙‍♀️', '🧚',
            '🧚‍♂️', '🧚‍♀️', '🧛', '🧛‍♂️', '🧛‍♀️',
            '🧜', '🧜‍♂️', '🧜‍♀️', '🧝', '🧝‍♂️',
            '🧝‍♀️', '🧞', '🧞‍♂️', '🧞‍♀️', '🧟',
            '🧟‍♂️', '🧟‍♀️', '🥷', '👷', '👷‍♂️',
            '👷‍♀️', '👮', '👮‍♂️', '👮‍♀️', '🕵️',
            '🕵️‍♂️', '🕵️‍♀️', '💂', '💂‍♂️', '💂‍♀️'
        ];
    }
    
    static getRandomEmoji() {
        const personEmojis = Player.getBaseEmojis();
        return personEmojis[Math.floor(Math.random() * personEmojis.length)];
    }
    
    static applySkinTone(emoji, skinTone) {
        // If no skin tone or default, return the base emoji
        if (!skinTone) {
            return emoji;
        }
        
        // Some emojis don't support skin tones well (zombie, genie, detective, etc.)
        // These may render incorrectly with skin tones on some platforms
        const nonHumanEmojis = ['🧟', '🧞', '🧜', '🧝', '🧚', '🧛', '🧙'];
        const problematicEmojis = ['🕵️', '🕵']; // Detective emoji has rendering issues with skin tones
        const ZWJ = '\u200D'; // Zero-width joiner
        const VS16 = '\uFE0F'; // Variation selector-16
        const baseEmoji = emoji.split(ZWJ)[0]; // Get base emoji before any ZWJ
        
        // Check if the base emoji is one that doesn't support skin tones well
        if (nonHumanEmojis.some(e => baseEmoji.startsWith(e) || baseEmoji === e)) {
            // For emojis that don't support skin tones well, return without skin tone
            return emoji;
        }
        
        // Check for problematic emojis (like detective)
        if (problematicEmojis.some(e => baseEmoji.includes(e))) {
            return emoji;
        }
        
        // Check if this is a compound emoji (contains zero-width joiner)
        if (emoji.includes(ZWJ)) {
            // For compound emojis, find the first ZWJ and insert skin tone before it
            // Handle variation selectors: if there's a VS16 before the ZWJ, insert skin tone after it
            // Example: 🕵️‍♀️ -> 🕵️🏽‍♀️ (but this doesn't work well, so we skip it above)
            // Example: 🧑‍🍳 -> 🧑🏽‍🍳
            const firstZWJIndex = emoji.indexOf(ZWJ);
            const beforeZWJ = emoji.slice(0, firstZWJIndex);
            
            // If there's a variation selector at the end of the base emoji, insert skin tone after it
            if (beforeZWJ.endsWith(VS16)) {
                // Insert skin tone after the variation selector
                return beforeZWJ + skinTone + emoji.slice(firstZWJIndex);
            } else {
                // Insert skin tone right before the first ZWJ
                return beforeZWJ + skinTone + emoji.slice(firstZWJIndex);
            }
        } else {
            // For simple emojis, check if there's a variation selector
            if (emoji.endsWith(VS16)) {
                // Insert skin tone before the variation selector
                return emoji.slice(0, -1) + skinTone + VS16;
            } else {
                // Just append the skin tone
                return emoji + skinTone;
            }
        }
    }
}

