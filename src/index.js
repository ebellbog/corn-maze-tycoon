import './index.less';
import './mobile.less';
import AIBrain from './AIBrain.js';
import Player from './Player.js';

class CornMazeGame {
    constructor(width = 20, height = 20) {
        this.width = width;
        this.height = height;
        this.grid = [];
        this.tractorPosition = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
        this.keys = {};
        this.startPosition = null;
        this.finishPosition = null;
        this.shortestPath = null;
        this.longestPath = null;
        this.highlightedPath = null;
        this.undoHistory = [];
        this.initialState = null;
        this.gameMode = 'farmer'; // 'farmer' or 'player'
        this.players = []; // Array of Player instances
        this.emojiList = Player.getBaseEmojis(); // List of available emojis
        this.currentEmojiIndex = 0; // Current emoji index in the list
        this.currentSkinTone = ''; // Current skin tone modifier (empty string = default)
        this.currentEmoji = this.getDisplayEmoji(); // Current emoji to spawn with skin tone
        this.playbackSpeed = 1.0; // Speed multiplier (0.5x, 1x, 1.5x, 2x)
        this.isPaused = false;
        this.isMoving = false; // Track if tractor is currently animating
        this.tractorDirection = 'right'; // Track tractor facing direction
        this.previousTractorDirection = 'right'; // Track previous direction to detect changes
        
        // Try to load from localStorage first
        const loaded = this.loadFromLocalStorage();
        
        if (!loaded) {
            // Initialize grid: 0 = corn, 1 = dirt (plowed)
            for (let y = 0; y < height; y++) {
                this.grid[y] = [];
                for (let x = 0; x < width; x++) {
                    this.grid[y][x] = 0; // Start with all corn
                }
            }
            
            // Start position is plowed
            this.grid[this.tractorPosition.y][this.tractorPosition.x] = 1;
        }
        
        // Save initial state
        this.saveState();
        this.initialState = this.getState();
        
        this.init();
    }
    
    getState() {
        // Create a deep copy of the current game state
        return {
            grid: this.grid.map(row => [...row]),
            tractorPosition: { ...this.tractorPosition },
            startPosition: this.startPosition ? { ...this.startPosition } : null,
            finishPosition: this.finishPosition ? { ...this.finishPosition } : null
        };
    }
    
    restoreState(state) {
        this.grid = state.grid.map(row => [...row]);
        this.tractorPosition = { ...state.tractorPosition };
        this.startPosition = state.startPosition ? { ...state.startPosition } : null;
        this.finishPosition = state.finishPosition ? { ...state.finishPosition } : null;
        this.shortestPath = null;
        this.longestPath = null;
        this.highlightedPath = null;
    }
    
    saveState() {
        // Save current state to undo history
        this.undoHistory.push(this.getState());
    }
    
    undo() {
        if (this.undoHistory.length > 1) {
            // Remove current state
            this.undoHistory.pop();
            // Restore previous state
            const previousState = this.undoHistory[this.undoHistory.length - 1];
            this.restoreState(previousState);
            this.saveToLocalStorage();
            this.render();
        }
    }
    
    resetMaze() {
        // Reset to initial state
        if (this.initialState) {
            this.restoreState(this.initialState);
            this.undoHistory = [this.getState()];
            this.saveToLocalStorage();
            this.render();
        }
    }
    
    get gridSize() {
        // For backward compatibility, return width (assuming square grid)
        return this.width;
    }
    
    getCellSize() {
        // Calculate available viewport space, accounting for margins
        const margin = 80; // Margin on each side (40px padding + 40px buffer)
        const availableWidth = $(window).width() - (margin * 2);
        const availableHeight = $(window).height() - (margin * 2);
        
        // Calculate maximum cell size that fits both width and height
        const maxCellWidth = Math.floor(availableWidth / this.width);
        const maxCellHeight = Math.floor(availableHeight / this.height);
        
        // Use the smaller of the two to ensure it fits in both dimensions
        let cellSize = Math.min(maxCellWidth, maxCellHeight);
        
        // Set a minimum cell size for very small mazes
        const minCellSize = 20;
        // Set a maximum cell size to prevent huge cells on very small mazes
        const maxCellSize = 80;
        
        cellSize = Math.max(minCellSize, Math.min(maxCellSize, cellSize));
        
        return cellSize;
    }
    
    getPixelPosition(x, y) {
        // Convert grid coordinates to pixel position for absolute positioning
        const cellSize = this.getCellSize();
        return {
            left: x * cellSize,
            top: y * cellSize,
            width: cellSize,
            height: cellSize
        };
    }
    
    init() {
        this.createBoard();
        this.setupControls();
        this.setupStats();
        this.setupSettings();
        this.setupButtons();
        this.setupModeToggle();
        this.setupPlayerControls();
        this.setupResizeHandler();
        this.render();
    }
    
    setupModeToggle() {
        const toggle = $('#mode-toggle');
        
        // Set initial state (farmer mode = unchecked, slider on left)
        toggle.prop('checked', this.gameMode === 'player');
        this.updateMode();
        this.updateToggleState();
        
        toggle.on('change', () => {
            const wantsPlayerMode = toggle.prop('checked');
            
            // Prevent switching to player mode if maze is incomplete
            if (wantsPlayerMode && (!this.startPosition || !this.finishPosition)) {
                toggle.prop('checked', false);
                this.showModeError();
                return;
            }
            
            // Hide error if switching successfully
            this.hideModeError();
            
            this.gameMode = wantsPlayerMode ? 'player' : 'farmer';
            this.updateMode();
        });
    }
    
    showModeError() {
        const errorMsg = $('#mode-error-message');
        const toggle = $('.mode-toggle');
        
        // Add bounce animation
        toggle.addClass('bounce');
        setTimeout(() => {
            toggle.removeClass('bounce');
        }, 500);
        
        // Show error message
        errorMsg.addClass('show');
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            this.hideModeError();
        }, 3000);
    }
    
    hideModeError() {
        $('#mode-error-message').removeClass('show');
    }
    
    updateToggleState() {
        const toggle = $('#mode-toggle');
        const isComplete = this.startPosition && this.finishPosition;
        
        // Hide error if maze becomes complete
        if (isComplete) {
            this.hideModeError();
        }
        
        // Disable toggle if trying to switch to player mode without complete maze
        if (!isComplete && this.gameMode === 'farmer') {
            toggle.prop('disabled', false); // Can stay in farmer mode
        } else if (!isComplete && this.gameMode === 'player') {
            // If somehow in player mode without complete maze, switch back
            toggle.prop('checked', false);
            this.gameMode = 'farmer';
            this.updateMode();
        } else {
            toggle.prop('disabled', false);
        }
    }
    
    updateMode() {
        if (this.gameMode === 'player') {
            // Show player controls, hide farmer controls
            $('#farmer-sidebar').css('display', 'none');
            $('#player-sidebar').css('display', 'flex');
            // Hide grid lines
            $('#game-board').addClass('player-mode');
            // Update player UI
            this.updatePlayerUI();
        } else {
            // Show farmer controls, hide player controls
            $('#farmer-sidebar').css('display', 'flex');
            $('#player-sidebar').css('display', 'none');
            // Show grid lines
            $('#game-board').removeClass('player-mode');
            // Stop all players
            this.stopAllPlayers();
        }
        this.render();
    }
    
    setupButtons() {
        $('#reset-button').on('click', () => {
            this.resetMaze();
        });
        
        $('#undo-button').on('click', () => {
            this.undo();
        });
    }
    
    setupPlayerControls() {
        // Emoji navigation
        $('#emoji-prev').on('click', () => {
            this.navigateEmojiPrev();
        });
        
        $('#emoji-next').on('click', () => {
            this.navigateEmojiNext();
        });
        
        // Spawn button / emoji click
        $('#spawn-emoji').on('click', () => {
            this.spawnPlayer();
        });
        
        // Skin tone selection
        $('.skin-tone-button').on('click', (e) => {
            const skinTone = $(e.currentTarget).attr('data-tone');
            this.selectSkinTone(skinTone);
        });
        
        // Randomize emoji
        $('#randomize-emoji').on('click', () => {
            this.randomizeEmoji();
        });
        
        // Initialize skin tone button state
        this.updateSkinToneButtons();
        
        // Slider updates with snap points
        $('#speed-slider').on('input', () => {
            this.updatePlayerUI();
        });
        
        $('#right-wall-slider').on('input', (e) => {
            // Snap to 0, 0.5, 1
            const value = parseFloat(e.target.value);
            let snapped;
            if (value < 0.25) snapped = 0;
            else if (value < 0.75) snapped = 0.5;
            else snapped = 1;
            $(e.target).val(snapped);
            this.updatePlayerUI();
        });
        
        $('#backtracking-slider').on('input', (e) => {
            // Snap to -1, -0.5, 0, 0.5, 1
            const value = parseFloat(e.target.value);
            let snapped;
            if (value < -0.75) snapped = -1;
            else if (value < -0.25) snapped = -0.5;
            else if (value < 0.25) snapped = 0;
            else if (value < 0.75) snapped = 0.5;
            else snapped = 1;
            $(e.target).val(snapped);
            this.updatePlayerUI();
        });
        
        $('#line-of-sight-slider').on('input', (e) => {
            // Snap to 0, 0.5, 1
            const value = parseFloat(e.target.value);
            let snapped;
            if (value < 0.25) snapped = 0;
            else if (value < 0.75) snapped = 0.5;
            else snapped = 1;
            $(e.target).val(snapped);
            this.updatePlayerUI();
        });
        
        $('#social-slider').on('input', (e) => {
            // Snap to -1, -0.5, 0, 0.5, 1
            const value = parseFloat(e.target.value);
            let snapped;
            if (value < -0.75) snapped = -1;
            else if (value < -0.25) snapped = -0.5;
            else if (value < 0.25) snapped = 0;
            else if (value < 0.75) snapped = 0.5;
            else snapped = 1;
            $(e.target).val(snapped);
            this.updatePlayerUI();
        });
        
        // Playback controls
        $('#pause-play-button').on('click', () => {
            this.togglePausePlay();
        });
        
        $('#playback-speed-button').on('click', () => {
            this.cyclePlaybackSpeed();
        });
    }
    
    getDisplayEmoji() {
        // Get the base emoji and apply skin tone
        const baseEmoji = this.emojiList[this.currentEmojiIndex];
        return Player.applySkinTone(baseEmoji, this.currentSkinTone);
    }
    
    navigateEmojiPrev() {
        this.currentEmojiIndex = (this.currentEmojiIndex - 1 + this.emojiList.length) % this.emojiList.length;
        this.currentEmoji = this.getDisplayEmoji();
        this.updatePlayerUI();
    }
    
    navigateEmojiNext() {
        this.currentEmojiIndex = (this.currentEmojiIndex + 1) % this.emojiList.length;
        this.currentEmoji = this.getDisplayEmoji();
        this.updatePlayerUI();
    }
    
    selectSkinTone(skinTone) {
        this.currentSkinTone = skinTone;
        this.currentEmoji = this.getDisplayEmoji();
        this.updatePlayerUI();
        this.updateSkinToneButtons();
    }
    
    randomizeEmoji() {
        // Pick a random emoji from the list
        this.currentEmojiIndex = Math.floor(Math.random() * this.emojiList.length);
        
        // Pick a random skin tone (including default/empty)
        const skinTones = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];
        this.currentSkinTone = skinTones[Math.floor(Math.random() * skinTones.length)];
        
        // Update the emoji with the new skin tone
        this.currentEmoji = this.getDisplayEmoji();
        
        // Update UI and skin tone button states
        this.updatePlayerUI();
        this.updateSkinToneButtons();
    }
    
    updateSkinToneButtons() {
        // Update active state on skin tone buttons
        $('.skin-tone-button').removeClass('active');
        $(`.skin-tone-button[data-tone="${this.currentSkinTone}"]`).addClass('active');
    }
    
    updatePlayerUI() {
        // Update value displays
        const movesPerSec = parseFloat($('#speed-slider').val());
        const rightWall = parseFloat($('#right-wall-slider').val());
        const backtracking = parseFloat($('#backtracking-slider').val());
        const lineOfSight = parseFloat($('#line-of-sight-slider').val());
        
        $('#speed-value').text(`${movesPerSec}/s`);
        
        // Format display values
        const formatValue = (val) => {
            if (val === 0) return 'Off';
            if (val === 0.5) return 'Some';
            if (val === 1) return 'Always';
            return val;
        };
        
        const formatBacktracking = (val) => {
            if (val === -1) return 'Always';
            if (val === -0.5) return 'Often';
            if (val === 0) return 'Neutral';
            if (val === 0.5) return 'Avoid';
            if (val === 1) return 'Never!';
            return val;
        };
        
        const formatSocial = (val) => {
            if (val === -1) return 'Loner';
            if (val === -0.5) return 'Shy';
            if (val === 0) return 'Neutral';
            if (val === 0.5) return 'Friendly';
            if (val === 1) return 'Follower';
            return val;
        };
        
        const social = parseFloat($('#social-slider').val());
        
        $('#right-wall-value').text(formatValue(rightWall));
        $('#backtracking-value').text(formatBacktracking(backtracking));
        $('#line-of-sight-value').text(formatValue(lineOfSight));
        $('#social-value').text(formatSocial(social));
        
        // Update emoji display
        $('#spawn-emoji').text(this.currentEmoji);
        
        // Update playback speed display
        $('#playback-speed-button').text(`${this.playbackSpeed}x`);
    }
    
    togglePausePlay() {
        this.isPaused = !this.isPaused;
        
        // Update all players
        for (const player of this.players) {
            player.isPaused = this.isPaused;
        }
        
        // Update button
        const icon = this.isPaused ? '▶' : '⏸';
        $('#pause-play-button').text(icon);
    }
    
    cyclePlaybackSpeed() {
        const speeds = [0.5, 1, 1.5, 2];
        const currentIndex = speeds.indexOf(this.playbackSpeed);
        this.playbackSpeed = speeds[(currentIndex + 1) % speeds.length];
        this.updatePlayerUI();
    }
    
    spawnPlayer() {
        if (!this.startPosition) {
            return; // Can't spawn without start position
        }
        
        // Get current AI settings
        const movesPerSec = parseFloat($('#speed-slider').val());
        const speed = 1000 / movesPerSec; // Convert moves/sec to milliseconds
        const rightWall = parseFloat($('#right-wall-slider').val());
        const backtracking = parseFloat($('#backtracking-slider').val());
        const lineOfSight = parseFloat($('#line-of-sight-slider').val());
        const social = parseFloat($('#social-slider').val());
        
        // Create AI brain with these settings
        const brain = new AIBrain({
            rightWall: rightWall,
            avoidRevisit: backtracking, // Internal name stays the same
            lineOfSight: lineOfSight,
            social: social
        }, speed);
        
        // Create player
        const player = new Player(this.currentEmoji, brain, this.startPosition, this);
        player.isPaused = this.isPaused;
        this.players.push(player);
        
        // Start player movement
        player.startMoving();
        
        // Render
        this.render();
    }
    
    stopAllPlayers() {
        for (const player of this.players) {
            player.stopMoving();
        }
        this.players = [];
        this.isPaused = false;
        $('#pause-play-button').text('⏸');
    }
    
    getPlayerTooltip(player) {
        const formatValue = (val) => {
            if (val === 0) return 'Off';
            if (val === 0.5) return 'Some';
            if (val === 1) return 'Always';
            return val;
        };
        
        const formatBacktracking = (val) => {
            if (val === -1) return 'Always';
            if (val === -0.5) return 'Often';
            if (val === 0) return 'Neutral';
            if (val === 0.5) return 'Avoid';
            if (val === 1) return 'Never!';
            return val;
        };
        
        const movesPerSec = (1000 / player.brain.speed).toFixed(1);
        
        const formatSocial = (val) => {
            if (val === -1) return 'Loner';
            if (val === -0.5) return 'Shy';
            if (val === 0) return 'Neutral';
            if (val === 0.5) return 'Friendly';
            if (val === 1) return 'Follower';
            return val;
        };
        
        return `Speed: ${movesPerSec}/s
Right Wall: ${formatValue(player.brain.weights.rightWall)}
Backtracking: ${formatBacktracking(player.brain.weights.avoidRevisit)}
Line of Sight: ${formatValue(player.brain.weights.lineOfSight)}
Social: ${formatSocial(player.brain.weights.social || 0)}`;
    }
    
    saveToLocalStorage() {
        try {
            const mazeData = {
                width: this.width,
                height: this.height,
                grid: this.grid,
                tractorPosition: this.tractorPosition,
                startPosition: this.startPosition,
                finishPosition: this.finishPosition
            };
            localStorage.setItem('cornMazeTycoon_maze', JSON.stringify(mazeData));
        } catch (e) {
            console.warn('Failed to save maze to localStorage:', e);
        }
    }
    
    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('cornMazeTycoon_maze');
            if (!saved) return false;
            
            const mazeData = JSON.parse(saved);
            
            // Validate that dimensions match
            if (mazeData.width !== this.width || mazeData.height !== this.height) {
                return false;
            }
            
            // Restore saved state
            this.grid = mazeData.grid;
            this.tractorPosition = mazeData.tractorPosition;
            this.startPosition = mazeData.startPosition;
            this.finishPosition = mazeData.finishPosition;
            
            return true;
        } catch (e) {
            console.warn('Failed to load maze from localStorage:', e);
            return false;
        }
    }
    
    setupResizeHandler() {
        let resizeTimeout;
        $(window).on('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.render();
            }, 250); // Debounce resize events
        });
    }
    
    reset(width, height) {
        this.width = width;
        this.height = height;
        this.grid = [];
        this.tractorPosition = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
        this.startPosition = null;
        this.finishPosition = null;
        this.shortestPath = null;
        this.longestPath = null;
        this.highlightedPath = null;
        this.hoveringStat = null;
        this.undoHistory = [];
        
        // Initialize grid: 0 = corn, 1 = dirt (plowed)
        for (let y = 0; y < height; y++) {
            this.grid[y] = [];
            for (let x = 0; x < width; x++) {
                this.grid[y][x] = 0; // Start with all corn
            }
        }
        
        // Start position is plowed
        this.grid[this.tractorPosition.y][this.tractorPosition.x] = 1;
        
        // Save initial state
        this.saveState();
        this.initialState = this.getState();
        
        this.render();
    }
    
    setupSettings() {
        const widthInput = $('#maze-width');
        const heightInput = $('#maze-height');
        
        // Set initial values
        widthInput.val(this.width);
        heightInput.val(this.height);
        
        // Handle changes with debounce
        let changeTimeout;
        const handleChange = () => {
            clearTimeout(changeTimeout);
            changeTimeout = setTimeout(() => {
                const newWidth = parseInt(widthInput.val()) || 20;
                const newHeight = parseInt(heightInput.val()) || 20;
                
                // Clamp values
                const clampedWidth = Math.max(7, Math.min(30, newWidth));
                const clampedHeight = Math.max(7, Math.min(30, newHeight));
                
                widthInput.val(clampedWidth);
                heightInput.val(clampedHeight);
                
                if (clampedWidth !== this.width || clampedHeight !== this.height) {
                    this.reset(clampedWidth, clampedHeight);
                }
            }, 500); // 500ms debounce
        };
        
        widthInput.on('input', handleChange);
        heightInput.on('input', handleChange);
    }
    
    setupStats() {
        // Track which stat is being hovered
        this.hoveringStat = null;
        
        // Hover handlers for path highlighting
        $('#shortest-path-stat').on('mouseenter', () => {
            this.hoveringStat = 'shortest';
            this.updateHighlight();
            this.render();
        }).on('mouseleave', () => {
            this.hoveringStat = null;
            this.highlightedPath = null;
            this.render();
        });
        
        $('#longest-path-stat').on('mouseenter', () => {
            this.hoveringStat = 'longest';
            this.updateHighlight();
            this.render();
        }).on('mouseleave', () => {
            this.hoveringStat = null;
            this.highlightedPath = null;
            this.render();
        });
    }
    
    updateHighlight() {
        // Update the highlighted path based on which stat is being hovered
        if (this.hoveringStat === 'shortest' && this.shortestPath) {
            this.highlightedPath = this.shortestPath;
        } else if (this.hoveringStat === 'longest' && this.longestPath) {
            this.highlightedPath = this.longestPath;
        } else {
            this.highlightedPath = null;
        }
    }
    
    createBoard() {
        const board = $('#game-board');
        const cellSize = this.getCellSize();
        board.css('grid-template-columns', `repeat(${this.width}, ${cellSize}px)`);
    }
    
    setupControls() {
        $(document).on('keydown', (e) => {
            const key = e.key.toLowerCase();
            
            // Handle reset and undo shortcuts
            if (key === 'r') {
                e.preventDefault();
                this.resetMaze();
                return;
            }
            if (key === 'u') {
                e.preventDefault();
                this.undo();
                return;
            }
            
            // Prevent default for arrow keys and WASD to avoid scrolling
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
                e.preventDefault();
            }
            this.keys[key] = true;
            this.handleMovement();
        });
        
        $(document).on('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }
    
    isOnPerimeter(x, y) {
        return x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1;
    }
    
    countPlowedPerimeterSquares() {
        let count = 0;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.isOnPerimeter(x, y) && this.grid[y][x] === 1) {
                    count++;
                }
            }
        }
        return count;
    }
    
    canPlow(x, y) {
        // If already plowed, we can move there (it's already a path)
        if (this.grid[y][x] === 1) {
            return true;
        }
        
        // Check perimeter constraint: at most 2 plowed squares on perimeter
        if (this.isOnPerimeter(x, y)) {
            const currentPerimeterCount = this.countPlowedPerimeterSquares();
            if (currentPerimeterCount >= 2) {
                return false; // Already have 2 perimeter squares plowed
            }
        }
        
        // Check all possible 2x2 blocks that would include this square
        // For a square at (x, y), we need to check 2x2 blocks:
        // - Top-left: (x-1, y-1), (x, y-1), (x-1, y), (x, y)
        // - Top-right: (x, y-1), (x+1, y-1), (x, y), (x+1, y)
        // - Bottom-left: (x-1, y), (x, y), (x-1, y+1), (x, y+1)
        // - Bottom-right: (x, y), (x+1, y), (x, y+1), (x+1, y+1)
        
        const check2x2Block = (x1, y1, x2, y2) => {
            // Check if all coordinates are within bounds
            if (x1 < 0 || y1 < 0 || x2 >= this.width || y2 >= this.height) {
                return true; // Out of bounds, so this block doesn't constrain us
            }
            
            // Count how many squares in this 2x2 block would be plowed
            let plowedCount = 0;
            for (let checkY = y1; checkY <= y2; checkY++) {
                for (let checkX = x1; checkX <= x2; checkX++) {
                    if (this.grid[checkY][checkX] === 1 || (checkX === x && checkY === y)) {
                        plowedCount++;
                    }
                }
            }
            
            // If all 4 squares would be plowed, this move is invalid
            return plowedCount < 4;
        };
        
        // Check all four possible 2x2 blocks that include (x, y)
        return check2x2Block(x - 1, y - 1, x, y) &&  // Top-left block
               check2x2Block(x, y - 1, x + 1, y) &&  // Top-right block
               check2x2Block(x - 1, y, x, y + 1) &&  // Bottom-left block
               check2x2Block(x, y, x + 1, y + 1);    // Bottom-right block
    }
    
    handleMovement() {
        // Disable movement in player mode or if already moving
        if (this.gameMode === 'player' || this.isMoving) {
            return;
        }
        
        let newX = this.tractorPosition.x;
        let newY = this.tractorPosition.y;
        let direction = null;
        
        // Arrow keys or WASD
        if (this.keys['arrowup'] || this.keys['w']) {
            newY = Math.max(0, this.tractorPosition.y - 1);
            direction = 'up';
        } else if (this.keys['arrowdown'] || this.keys['s']) {
            newY = Math.min(this.height - 1, this.tractorPosition.y + 1);
            direction = 'down';
        } else if (this.keys['arrowleft'] || this.keys['a']) {
            newX = Math.max(0, this.tractorPosition.x - 1);
            direction = 'left';
        } else if (this.keys['arrowright'] || this.keys['d']) {
            newX = Math.min(this.width - 1, this.tractorPosition.x + 1);
            direction = 'right';
        }
        
        // Only move if position changed and the move is valid
        if ((newX !== this.tractorPosition.x || newY !== this.tractorPosition.y) && 
            this.canPlow(newX, newY)) {
            // Save state before making the move
            this.saveState();
            
            // Update direction for all movements
            if (direction) {
                this.tractorDirection = direction;
            }
            
            this.tractorPosition.x = newX;
            this.tractorPosition.y = newY;
            
            // Plow the path (convert corn to dirt)
            this.grid[newY][newX] = 1;
            
            // If this is a perimeter square and we don't have start/finish yet, set them
            if (this.isOnPerimeter(newX, newY)) {
                if (this.startPosition === null) {
                    this.startPosition = { x: newX, y: newY };
                } else if (this.finishPosition === null) {
                    this.finishPosition = { x: newX, y: newY };
                }
            }
            
            // Update toggle state after setting start/finish
            this.updateToggleState();
            
            // Save to localStorage after each move
            this.saveToLocalStorage();
            
            // Set moving flag and clear it after animation completes
            this.isMoving = true;
            setTimeout(() => {
                this.isMoving = false;
                // Check if key is still pressed for continuous movement
                if (Object.values(this.keys).some(k => k)) {
                    this.handleMovement();
                }
            }, 200); // Match CSS transition duration
            
            this.render();
        }
    }
    
    countTotalPlowed() {
        let count = 0;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.grid[y][x] === 1) {
                    count++;
                }
            }
        }
        return count;
    }
    
    findShortestPath() {
        if (!this.startPosition || !this.finishPosition) {
            return null;
        }
        
        // BFS to find shortest path
        const queue = [[this.startPosition.x, this.startPosition.y]];
        const visited = new Set();
        const parent = new Map();
        visited.add(`${this.startPosition.x},${this.startPosition.y}`);
        
        const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
        
        while (queue.length > 0) {
            const [x, y] = queue.shift();
            
            if (x === this.finishPosition.x && y === this.finishPosition.y) {
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
                
                if (nx >= 0 && nx < this.width && 
                    ny >= 0 && ny < this.height &&
                    this.grid[ny][nx] === 1 &&
                    !visited.has(key)) {
                    visited.add(key);
                    parent.set(key, `${x},${y}`);
                    queue.push([nx, ny]);
                }
            }
        }
        
        return null; // No path found
    }
    
    findLongestPath() {
        if (!this.startPosition || !this.finishPosition) {
            return null;
        }
        
        // DFS to find all paths, then pick the longest
        const allPaths = [];
        const visited = new Set();
        
        const dfs = (x, y, path) => {
            if (x === this.finishPosition.x && y === this.finishPosition.y) {
                allPaths.push([...path]);
                return;
            }
            
            const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
            
            for (const [dx, dy] of directions) {
                const nx = x + dx;
                const ny = y + dy;
                const key = `${nx},${ny}`;
                
                if (nx >= 0 && nx < this.width && 
                    ny >= 0 && ny < this.height &&
                    this.grid[ny][nx] === 1 &&
                    !visited.has(key)) {
                    visited.add(key);
                    path.push({ x: nx, y: ny });
                    dfs(nx, ny, path);
                    path.pop();
                    visited.delete(key);
                }
            }
        };
        
        const startKey = `${this.startPosition.x},${this.startPosition.y}`;
        visited.add(startKey);
        dfs(this.startPosition.x, this.startPosition.y, [{ x: this.startPosition.x, y: this.startPosition.y }]);
        
        if (allPaths.length === 0) {
            return null;
        }
        
        // Return the longest path
        return allPaths.reduce((longest, current) => 
            current.length > longest.length ? current : longest
        );
    }
    
    updateStats() {
        const totalPlowed = this.countTotalPlowed();
        $('#total-plowed').text(totalPlowed);
        
        if (this.startPosition && this.finishPosition) {
            this.shortestPath = this.findShortestPath();
            this.longestPath = this.findLongestPath();
            
            if (this.shortestPath) {
                $('#shortest-path').text(this.shortestPath.length);
                $('#shortest-path-stat .hover-icon').css('display', 'inline-block');
            } else {
                $('#shortest-path').text('—');
                $('#shortest-path-stat .hover-icon').css('display', 'none');
            }
            
            if (this.longestPath) {
                $('#longest-path').text(this.longestPath.length);
                $('#longest-path-stat .hover-icon').css('display', 'inline-block');
            } else {
                $('#longest-path').text('—');
                $('#longest-path-stat .hover-icon').css('display', 'none');
            }
        } else {
            $('#shortest-path').text('—');
            $('#longest-path').text('—');
            $('#shortest-path-stat .hover-icon').css('display', 'none');
            $('#longest-path-stat .hover-icon').css('display', 'none');
        }
    }
    
    renderCells() {
        const board = $('#game-board');
        
        // Only clear and rebuild grid cells if needed (on first render or resize)
        // Check if we need to rebuild by comparing cell count
        const expectedCells = this.width * this.height;
        const currentCells = board.find('.grid-cell').length;
        
        if (currentCells !== expectedCells) {
            // Rebuild grid
            board.find('.grid-cell').remove();
            
            const cellSize = this.getCellSize();
            
            // Ensure grid-template-columns is set
            board.css('grid-template-columns', `repeat(${this.width}, ${cellSize}px)`);
            
            // Create grid cells (static background)
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    const cell = $('<div class="grid-cell"></div>');
                    // Set cell size dynamically
                    cell.css({
                        width: `${cellSize}px`,
                        height: `${cellSize}px`,
                        minWidth: `${cellSize}px`,
                        minHeight: `${cellSize}px`,
                        maxWidth: `${cellSize}px`,
                        maxHeight: `${cellSize}px`,
                        fontSize: `${Math.round(cellSize * 0.67)}px` // Scale font proportionally
                    });
                    
                    cell.attr('data-x', x);
                    cell.attr('data-y', y);
                    
                    board.append(cell);
                }
            }
        }
        
        // Update cell states (corn/dirt, highlights, flags)
        const cellSize = this.getCellSize();
        const cells = board.find('.grid-cell');
        
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const cellIndex = y * this.width + x;
                const cell = $(cells[cellIndex]);
                
                // Clear previous classes and content
                cell.attr('class', 'grid-cell');
                cell.empty();
                
                // Update cell size in case of resize
                cell.css({
                    width: `${cellSize}px`,
                    height: `${cellSize}px`,
                    minWidth: `${cellSize}px`,
                    minHeight: `${cellSize}px`,
                    maxWidth: `${cellSize}px`,
                    maxHeight: `${cellSize}px`,
                    fontSize: `${Math.round(cellSize * 0.67)}px`
                });
                
                // Check if this cell is part of the highlighted path
                const isHighlighted = this.highlightedPath && 
                    this.highlightedPath.some(p => p.x === x && p.y === y);
                
                // Render static elements (grid cells, flags)
                if (this.startPosition && x === this.startPosition.x && y === this.startPosition.y) {
                    // Start flag
                    cell.addClass('dirt start');
                    if (isHighlighted) cell.addClass('path-highlight');
                    cell.text('🚩');
                } else if (this.finishPosition && x === this.finishPosition.x && y === this.finishPosition.y) {
                    // Finish flag
                    cell.addClass('dirt finish');
                    if (isHighlighted) cell.addClass('path-highlight');
                    cell.text('🏁');
                } else if (this.grid[y][x] === 1) {
                    // Dirt (plowed path)
                    cell.addClass('dirt');
                    if (isHighlighted) cell.addClass('path-highlight');
                } else {
                    // Corn
                    cell.addClass('corn');
                    cell.text('🌽');
                }
            }
        }
        
        // Render moving entities separately
        this.renderEntities();
    }
    
    renderEntities() {
        const board = $('#game-board');
        const cellSize = this.getCellSize();
        
        // Render tractor (in farmer mode)
        if (this.gameMode === 'farmer') {
            let tractorWrapper = board.find('.tractor-wrapper');
            let tractorEntity = board.find('.entity-tractor');
            
            if (tractorWrapper.length === 0) {
                // Create wrapper for translation (with transition)
                // Append to body or a container that won't affect grid layout
                tractorWrapper = $('<div class="tractor-wrapper"></div>');
                // Append directly to board but ensure it's absolutely positioned
                board.append(tractorWrapper);
                
                // Create tractor entity for rotation (no transition)
                tractorEntity = $('<div class="moving-entity entity-tractor"></div>');
                tractorEntity.text('🚜');
                tractorWrapper.append(tractorEntity);
            } else {
                // Get the existing tractor entity from the wrapper
                tractorEntity = tractorWrapper.find('.entity-tractor');
            }
            
            // Update tractor size and position
            const pos = this.getPixelPosition(this.tractorPosition.x, this.tractorPosition.y);
            
            // Check if direction changed (rotation should be instant, not animated)
            const directionChanged = this.tractorDirection !== this.previousTractorDirection;
            
            // Update wrapper position (translation - with smooth animation)
            tractorWrapper.css({
                width: `${pos.width}px`,
                height: `${pos.height}px`,
                transform: `translate(${pos.left}px, ${pos.top}px)`
            });
            
            // Update tractor rotation (instant, no animation)
            let rotationTransform = '';
            switch(this.tractorDirection) {
                case 'left':
                    // Default orientation - tractor faces left
                    break;
                case 'right':
                    // Flip horizontally to face right
                    rotationTransform = 'scaleX(-1)';
                    break;
                case 'up':
                    // Rotate clockwise to face up
                    rotationTransform = 'rotate(90deg)';
                    break;
                case 'down':
                    // Rotate counter-clockwise to face down
                    rotationTransform = 'rotate(-90deg)';
                    break;
            }
            
            // Apply rotation instantly (no transition on rotation)
            if (directionChanged) {
                // Temporarily disable any transition on the entity
                tractorEntity.css('transition', 'none');
            }
            
            tractorEntity.css({
                width: `${pos.width}px`,
                height: `${pos.height}px`,
                fontSize: `${Math.round(cellSize * 0.67)}px`,
                transform: rotationTransform
            });
            
            // Re-enable transition after rotation is applied
            if (directionChanged) {
                setTimeout(() => {
                    tractorEntity.css('transition', '');
                }, 10);
                this.previousTractorDirection = this.tractorDirection;
            }
            
            tractorWrapper.show();
        } else {
            // Hide tractor in player mode
            board.find('.tractor-wrapper').hide();
        }
        
        // Render players (in player mode)
        if (this.gameMode === 'player') {
            // Remove old hover handlers
            board.off('mouseenter', '.entity-player');
            board.off('mouseleave', '.entity-player');
            
            // Get existing player entities
            const existingEntities = board.find('.entity-player');
            const entityMap = new Map();
            
            existingEntities.each((i, el) => {
                const $el = $(el);
                const playerId = $el.attr('data-player-id');
                if (playerId) {
                    entityMap.set(playerId, $el);
                }
            });
            
            // Track which entities are still active
            const activeEntityIds = new Set();
            
            // Update or create player entities
            this.players.forEach((player, index) => {
                // Skip removed players
                if (player.isRemoved) {
                    return;
                }
                
                const playerId = `player-${index}`;
                activeEntityIds.add(playerId);
                
                let playerEntity = entityMap.get(playerId);
                const isNewPlayer = !playerEntity;
                
                if (!playerEntity) {
                    // Create new player entity
                    playerEntity = $('<div class="moving-entity entity-player"></div>');
                    playerEntity.attr('data-player-id', playerId);
                    playerEntity.attr('data-player-index', index);
                    
                    // Set initial position immediately without transition
                    const initialPos = this.getPixelPosition(player.position.x, player.position.y);
                    playerEntity.css({
                        width: `${initialPos.width}px`,
                        height: `${initialPos.height}px`,
                        fontSize: `${Math.round(cellSize * 0.67)}px`,
                        transform: `translate(${initialPos.left}px, ${initialPos.top}px)`,
                        transition: 'none' // Disable transition for initial placement
                    });
                    
                    board.append(playerEntity);
                    
                    // Re-enable transition after a brief delay
                    setTimeout(() => {
                        playerEntity.css('transition', '');
                    }, 10);
                }
                
                // Update player content
                if (player.currentThought) {
                    playerEntity.html(`
                        <div class="player-container">
                            <div class="thought-bubble">${player.currentThought}</div>
                            <div class="player-emoji">${player.emoji}</div>
                        </div>
                    `);
                } else {
                    playerEntity.text(player.emoji);
                }
                
                // Update tooltip
                playerEntity.attr('data-player-info', this.getPlayerTooltip(player));
                
                // Update player size and position (only if not a new player)
                if (!isNewPlayer) {
                    const pos = this.getPixelPosition(player.position.x, player.position.y);
                    // Adjust transition duration to match player's movement speed for continuous motion
                    const transitionDuration = (player.brain.speed / this.playbackSpeed) / 1000; // Convert to seconds
                    playerEntity.css({
                        width: `${pos.width}px`,
                        height: `${pos.height}px`,
                        fontSize: `${Math.round(cellSize * 0.67)}px`,
                        transform: `translate(${pos.left}px, ${pos.top}px)`,
                        transition: `transform ${transitionDuration}s linear`
                    });
                }
            });
            
            // Remove entities for players that no longer exist
            existingEntities.each((i, el) => {
                const $el = $(el);
                const playerId = $el.attr('data-player-id');
                if (playerId && !activeEntityIds.has(playerId)) {
                    $el.remove();
                }
            });
            
            // Add hover handlers to show visit counts
            board.on('mouseenter', '.entity-player', (e) => {
                const playerEntity = $(e.currentTarget);
                const playerIndex = parseInt(playerEntity.attr('data-player-index'));
                const player = this.players[playerIndex];
                
                if (player && player.visitCounts) {
                    this.showVisitCounts(player);
                }
            });
            
            board.on('mouseleave', '.entity-player', () => {
                this.hideVisitCounts();
            });
        } else {
            // Hide all player entities in farmer mode
            board.find('.entity-player').remove();
        }
    }
    
    showVisitCounts(player) {
        // Add visit count overlays to all visited cells
        const cells = $('#game-board .grid-cell');
        
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const key = `${x},${y}`;
                const visitCount = player.visitCounts.get(key);
                
                if (visitCount && visitCount > 0 && this.grid[y][x] === 1) {
                    // Calculate cell index in the grid
                    const cellIndex = y * this.width + x;
                    const $cell = $(cells[cellIndex]);
                    
                    // Add visit count overlay
                    const overlay = $('<div class="visit-count-overlay"></div>');
                    overlay.text(visitCount);
                    $cell.append(overlay);
                }
            }
        }
    }
    
    hideVisitCounts() {
        $('.visit-count-overlay').remove();
    }
    
    render() {
        // Update stats first (recalculates paths)
        this.updateStats();
        
        // Update toggle state in case maze completion status changed
        this.updateToggleState();
        
        // If hovering over a stat, update the highlight with the newly calculated path
        if (this.hoveringStat) {
            this.updateHighlight();
        }
        
        // Render the cells
        this.renderCells();
    }
}

$(document).ready(() => {
    // Initialize game with a 12x12 grid
    const game = new CornMazeGame(12, 12);
});

