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
        this.currentTierConfig = [ // Tier configuration for current player being configured
            { blocks: [] }, // High priority
            { blocks: [] }, // Medium priority
            { blocks: [] }  // Low priority
        ];
        this.dragState = { // Track drag-and-drop state
            draggedBlock: null,
            sourceTier: null,
            sourceIndex: null
        };
        
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
        
        // Speed slider
        $('#speed-slider').on('input', () => {
            this.updatePlayerUI();
        });
        
        // Playback controls
        $('#pause-play-button').on('click', () => {
            this.togglePausePlay();
        });
        
        $('#playback-speed-button').on('click', () => {
            this.cyclePlaybackSpeed();
        });
        
        $('#clear-players-button').on('click', () => {
            this.stopAllPlayers();
        });
        
        // Setup logic block drag and drop
        this.setupLogicBlockDragDrop();
        
        // Setup sidebar resize
        this.setupSidebarResize();
    }
    
    setupSidebarResize() {
        const game = this;
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        // Create resize grip element
        const grip = $('<div class="sidebar-resize-grip"></div>');
        $('body').append(grip);
        
        // Function to update grip position
        const updateGripPosition = () => {
            const sidebar = $('#player-sidebar:visible, #farmer-sidebar:visible');
            if (sidebar.length) {
                const rect = sidebar[0].getBoundingClientRect();
                const gripHeight = 120;
                grip.css({
                    'left': `${rect.left - 18}px`,
                    'top': `${rect.top + (rect.height / 2) - (gripHeight / 2)}px`
                });
                grip.show();
            } else {
                grip.hide();
            }
        };
        
        // Update grip position initially and on window resize/scroll
        updateGripPosition();
        $(window).on('resize', updateGripPosition);
        
        // Update grip position when sidebar scrolls
        $('#player-sidebar, #farmer-sidebar').on('scroll', updateGripPosition);
        
        // Update grip position when mode changes
        const originalUpdateMode = this.updateMode.bind(this);
        this.updateMode = function() {
            originalUpdateMode();
            setTimeout(updateGripPosition, 10);
        };
        
        // Handle mousedown on the grip
        grip.on('mousedown', function(e) {
            e.preventDefault();
            const sidebar = $('#player-sidebar:visible, #farmer-sidebar:visible');
            if (!sidebar.length) return;
            
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.outerWidth();
            
            grip.addClass('resizing');
            $('body').css('cursor', 'ew-resize');
            $('body').css('user-select', 'none');
        });
        
        $(document).on('mousemove', function(e) {
            if (!isResizing) return;
            
            e.preventDefault();
            const deltaX = startX - e.clientX; // Reversed because we're dragging from the left
            const newWidth = Math.max(280, Math.min(600, startWidth + deltaX));
            
            const sidebar = $('#player-sidebar:visible, #farmer-sidebar:visible');
            sidebar.css('width', `${newWidth}px`);
            updateGripPosition();
        });
        
        $(document).on('mouseup', function() {
            if (isResizing) {
                isResizing = false;
                grip.removeClass('resizing');
                $('body').css('cursor', '');
                $('body').css('user-select', '');
            }
        });
    }
    
    setupLogicBlockDragDrop() {
        const game = this;
        
        // Handle toggle switches for backtracking and social blocks
        $(document).on('change', '.logic-block.toggleable .toggle-switch', function(e) {
            e.stopPropagation(); // Prevent drag initiation
            const block = $(this).closest('.logic-block');
            const blockType = block.attr('data-block-type');
            const isChecked = $(this).prop('checked');
            
            if (blockType === 'wallFollowing') {
                const newMode = isChecked ? 'left' : 'right';
                const newLabel = isChecked ? 'Left Wall' : 'Right Wall';
                const newIcon = isChecked ? '←' : '→';
                block.attr('data-mode', newMode);
                block.find('.block-label').text(newLabel);
                block.find('.block-icon').text(newIcon);
            } else if (blockType === 'backtracking') {
                const newMode = isChecked ? 'seek' : 'avoid';
                const newLabel = isChecked ? 'Seek Backtracking' : 'Avoid Backtracking';
                const newIcon = isChecked ? '❓' : '🧠';
                block.attr('data-mode', newMode);
                block.find('.block-label').text(newLabel);
                block.find('.block-icon').text(newIcon);
            } else if (blockType === 'social') {
                const newMode = isChecked ? 'avoid' : 'follow';
                const newLabel = isChecked ? 'Avoid Others' : 'Follow Others';
                const newIcon = isChecked ? '🫣' : '❤️';
                block.attr('data-mode', newMode);
                block.find('.block-label').text(newLabel);
                block.find('.block-icon').text(newIcon);
            }
            
            // Update configuration if block is in a tier
            game.updateTierConfigFromDOM();
        });
        
        // Drag start
        $(document).on('dragstart', '.logic-block', function(e) {
            const block = $(this);
            block.addClass('dragging');
            
            // Store drag data
            const blockType = block.attr('data-block-type');
            const blockMode = block.attr('data-mode') || null;
            const isFromPool = block.parent().attr('id') === 'logic-block-pool';
            
            game.dragState.draggedBlock = {
                type: blockType,
                mode: blockMode,
                element: block[0]
            };
            
            if (!isFromPool) {
                // Find which tier and index
                const tierBlocks = block.parent();
                const tierIndex = parseInt(tierBlocks.attr('data-tier-index'));
                const blockIndex = tierBlocks.children('.logic-block').index(block);
                
                game.dragState.sourceTier = tierIndex;
                game.dragState.sourceIndex = blockIndex;
            } else {
                game.dragState.sourceTier = null;
                game.dragState.sourceIndex = null;
            }
            
            e.originalEvent.dataTransfer.effectAllowed = 'move';
            e.originalEvent.dataTransfer.setData('text/html', block.html());
        });
        
        // Drag end
        $(document).on('dragend', '.logic-block', function(e) {
            $(this).removeClass('dragging');
            $('.priority-tier').removeClass('drag-over');
            game.dragState = {
                draggedBlock: null,
                sourceTier: null,
                sourceIndex: null
            };
        });
        
        // Drag over tier
        $(document).on('dragover', '.priority-tier', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).addClass('drag-over');
            return false;
        });
        
        // Drag leave tier
        $(document).on('dragleave', '.priority-tier', function(e) {
            $(this).removeClass('drag-over');
        });
        
        // Drop on tier
        $(document).on('drop', '.tier-blocks', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const tierBlocks = $(this);
            const tierIndex = parseInt(tierBlocks.attr('data-tier-index'));
            tierBlocks.parent().removeClass('drag-over');
            
            if (!game.dragState.draggedBlock) return;
            
            const { type, mode, element } = game.dragState.draggedBlock;
            const isFromPool = game.dragState.sourceTier === null;
            
            // Check if this block type+mode already exists in this specific tier
            const tier = game.currentTierConfig[tierIndex];
            const alreadyInThisTier = tier.blocks.some(b => 
                b.type === type && (b.mode || null) === (mode || null)
            );
            
            if (alreadyInThisTier) {
                // Don't allow duplicates in the same tier
                return false;
            }
            
            if (isFromPool) {
                // Add to tier (don't remove from pool anymore - allow multiple copies)
                game.addBlockToTier(tierIndex, type, mode);
            } else {
                // Move from another tier
                game.moveBlockBetweenTiers(game.dragState.sourceTier, game.dragState.sourceIndex, tierIndex);
            }
            
            game.renderTiers();
            return false;
        });
        
        // Drop on pool (remove block from tier and restore to pool)
        $(document).on('drop', '#logic-block-pool', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (game.dragState.sourceTier !== null) {
                // Remove block from tier (blocks stay in pool permanently)
                game.removeBlockFromTier(game.dragState.sourceTier, game.dragState.sourceIndex);
                game.renderTiers();
            }
            return false;
        });
        
        // Drop outside tiers and pool (remove block entirely)
        $(document).on('dragover', 'body', function(e) {
            const target = $(e.target);
            // Only allow default if NOT over a tier or pool
            if (!target.closest('.tier-blocks').length && !target.closest('#logic-block-pool').length) {
                e.preventDefault();
            }
        });
        
        $(document).on('drop', 'body', function(e) {
            const target = $(e.target);
            // Only handle if NOT over a tier or pool
            if (!target.closest('.tier-blocks').length && !target.closest('#logic-block-pool').length) {
                e.preventDefault();
                
                if (game.dragState.sourceTier !== null) {
                    // Remove block from tier (blocks stay in pool permanently)
                    game.removeBlockFromTier(game.dragState.sourceTier, game.dragState.sourceIndex);
                    game.renderTiers();
                }
            }
        });
    }
    
    addBlockToTier(tierIndex, blockType, mode = null) {
        const tier = this.currentTierConfig[tierIndex];
        tier.blocks.push({
            type: blockType,
            weight: 1, // Default weight, will be normalized
            mode: mode
        });
        this.normalizeTierWeights(tierIndex);
    }
    
    removeBlockFromTier(tierIndex, blockIndex) {
        const tier = this.currentTierConfig[tierIndex];
        tier.blocks.splice(blockIndex, 1);
        if (tier.blocks.length > 0) {
            this.normalizeTierWeights(tierIndex);
        }
    }
    
    restoreBlockToPool(blockType, mode) {
        // Re-create the block element in the pool
        const pool = $('#logic-block-pool');
        
        // Find if this block type already exists in pool with matching mode (if applicable)
        let existingBlock;
        if (mode) {
            existingBlock = pool.find(`.logic-block[data-block-type="${blockType}"][data-mode="${mode}"]`);
        } else {
            existingBlock = pool.find(`.logic-block[data-block-type="${blockType}"]`);
        }
        
        if (existingBlock.length > 0) {
            // Already in pool, don't duplicate
            return;
        }
        
        // Create new block element
        const blockData = { type: blockType, mode: mode, weight: 1 };
        const block = this.createBlockElement(blockData);
        block.removeClass('in-tier');
        pool.append(block);
    }
    
    sortLogicBlockPool() {
        const pool = $('#logic-block-pool');
        const blocks = pool.find('.logic-block').detach().toArray();
        
        // Sort blocks by their label text
        blocks.sort((a, b) => {
            const labelA = $(a).find('.block-label').text().toLowerCase();
            const labelB = $(b).find('.block-label').text().toLowerCase();
            return labelA.localeCompare(labelB);
        });
        
        // Re-append in sorted order
        blocks.forEach(block => pool.append(block));
    }
    
    moveBlockBetweenTiers(fromTierIndex, blockIndex, toTierIndex) {
        const fromTier = this.currentTierConfig[fromTierIndex];
        const toTier = this.currentTierConfig[toTierIndex];
        
        // Remove from source
        const [block] = fromTier.blocks.splice(blockIndex, 1);
        
        // Add to destination
        toTier.blocks.push(block);
        block.weight = 1;
        
        // Normalize both tiers
        if (fromTier.blocks.length > 0) {
            this.normalizeTierWeights(fromTierIndex);
        }
        this.normalizeTierWeights(toTierIndex);
    }
    
    normalizeTierWeights(tierIndex) {
        const tier = this.currentTierConfig[tierIndex];
        if (tier.blocks.length === 0) return;
        
        // Equal distribution by default
        const equalWeight = 1 / tier.blocks.length;
        tier.blocks.forEach(block => {
            if (!block.weight || block.weight === 0) {
                block.weight = equalWeight;
            }
        });
    }
    
    updateTierConfigFromDOM() {
        // Read current tier configuration from DOM (useful after manual adjustments)
        for (let i = 0; i < 3; i++) {
            const tierBlocks = $(`.tier-blocks[data-tier-index="${i}"]`);
            const blocks = tierBlocks.find('.logic-block');
            
            this.currentTierConfig[i].blocks = [];
            blocks.each((index, el) => {
                const $block = $(el);
                this.currentTierConfig[i].blocks.push({
                    type: $block.attr('data-block-type'),
                    mode: $block.attr('data-mode') || null,
                    weight: parseFloat($block.attr('data-weight') || (1 / blocks.length))
                });
            });
        }
    }
    
    renderTiers() {
        // Render all tiers based on currentTierConfig
        for (let i = 0; i < 3; i++) {
            const tierBlocks = $(`.tier-blocks[data-tier-index="${i}"]`);
            // Completely clear the tier (including any event handlers)
            tierBlocks.empty();
            
            const tier = this.currentTierConfig[i];
            
            // Skip if tier has no blocks
            if (!tier || !tier.blocks || tier.blocks.length === 0) {
                continue;
            }
            
            // Calculate total weight for normalization
            const totalWeight = tier.blocks.reduce((sum, b) => sum + b.weight, 0);
            
            tier.blocks.forEach((blockData, index) => {
                const block = this.createBlockElement(blockData);
                block.addClass('in-tier');
                block.attr('data-weight', blockData.weight);
                
                // Set flex-grow based on weight
                const flexGrow = totalWeight > 0 ? blockData.weight / totalWeight : 1;
                block.css('flex-grow', flexGrow);
                block.css('flex-basis', '0');
                
                // Add weight tooltip
                const weightPercent = totalWeight > 0 ? Math.round((blockData.weight / totalWeight) * 100) : Math.round(100 / tier.blocks.length);
                const weightDisplay = $('<div class="block-weight"></div>').text(`${weightPercent}%`);
                block.append(weightDisplay);
                
                tierBlocks.append(block);
                
                // Add resizer if not the last block
                if (index < tier.blocks.length - 1) {
                    const resizer = $('<div class="block-resizer"></div>');
                    this.setupResizer(resizer, i, index);
                    tierBlocks.append(resizer);
                }
            });
        }
    }
    
    createBlockElement(blockData) {
        const block = $('<div class="logic-block"></div>');
        block.attr('draggable', 'true');
        block.attr('data-block-type', blockData.type);
        
        if (blockData.mode) {
            block.attr('data-mode', blockData.mode);
        }
        
        // Determine icon and label
        let icon, label, toggleable = false;
        
        switch(blockData.type) {
            case 'wallFollowing':
                toggleable = true;
                if (blockData.mode === 'left') {
                    icon = '←';
                    label = 'Left Wall';
                } else {
                    icon = '→';
                    label = 'Right Wall';
                }
                break;
            case 'rightWall':
                // Legacy support
                icon = '→';
                label = 'Right Wall';
                break;
            case 'lineOfSight':
                icon = '❗';
                label = 'Line of Sight';
                break;
            case 'towardExit':
                icon = '🧭';
                label = 'Toward Exit';
                break;
            case 'backtracking':
                toggleable = true;
                if (blockData.mode === 'seek') {
                    icon = '❓';
                    label = 'Seek Backtracking';
                } else {
                    icon = '🧠';
                    label = 'Avoid Backtracking';
                }
                break;
            case 'social':
                toggleable = true;
                if (blockData.mode === 'avoid') {
                    icon = '🫣';
                    label = 'Avoid Others';
                } else {
                    icon = '❤️';
                    label = 'Follow Others';
                }
                break;
            case 'randomGuesser':
                icon = '🎲';
                label = 'Random Guesser';
                break;
        }
        
        const iconDiv = $('<div class="block-icon"></div>').text(icon);
        const labelDiv = $('<div class="block-label"></div>').text(label);
        
        block.append(iconDiv, labelDiv);
        
        if (toggleable) {
            block.addClass('toggleable');
            const isChecked = (blockData.type === 'wallFollowing' && blockData.mode === 'left') ||
                            (blockData.type === 'backtracking' && blockData.mode === 'seek') ||
                            (blockData.type === 'social' && blockData.mode === 'avoid');
            const toggle = $(`
                <label class="block-toggle">
                    <input type="checkbox" class="toggle-switch" ${isChecked ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            `);
            block.append(toggle);
        }
        
        return block;
    }
    
    setupResizer(resizer, tierIndex, leftBlockIndex) {
        const game = this;
        let isResizing = false;
        let startX = 0;
        let startWeights = [];
        
        resizer.on('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            startX = e.pageX;
            
            const tier = game.currentTierConfig[tierIndex];
            startWeights = tier.blocks.map(b => b.weight);
            
            $(this).addClass('resizing');
            $('body').css('cursor', 'col-resize');
        });
        
        $(document).on('mousemove', function(e) {
            if (!isResizing) return;
            e.preventDefault();
            
            const deltaX = e.pageX - startX;
            const tierBlocks = $(`.tier-blocks[data-tier-index="${tierIndex}"]`);
            const containerWidth = tierBlocks.width();
            
            // Calculate the change as a fraction of total weight
            const tier = game.currentTierConfig[tierIndex];
            const totalWeight = startWeights[leftBlockIndex] + startWeights[leftBlockIndex + 1];
            const deltaWeight = (deltaX / containerWidth) * totalWeight;
            
            // Calculate new weights with constraints
            let newLeftWeight = startWeights[leftBlockIndex] + deltaWeight;
            let newRightWeight = startWeights[leftBlockIndex + 1] - deltaWeight;
            
            // Enforce minimum of 10% of the pair's total
            const minWeight = totalWeight * 0.1;
            const maxWeight = totalWeight * 0.9;
            
            newLeftWeight = Math.max(minWeight, Math.min(maxWeight, newLeftWeight));
            newRightWeight = totalWeight - newLeftWeight;
            
            // Update the blocks
            tier.blocks[leftBlockIndex].weight = newLeftWeight;
            tier.blocks[leftBlockIndex + 1].weight = newRightWeight;
            
            game.renderTiers();
        });
        
        $(document).on('mouseup', function() {
            if (isResizing) {
                isResizing = false;
                $('.block-resizer').removeClass('resizing');
                $('body').css('cursor', '');
            }
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
        $('#speed-value').text(`${movesPerSec}/s`);
        
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
        const speeds = [0.5, 1, 1.5, 2, 5];
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
        
        // Deep clone the tier configuration for this player
        const tiersCopy = JSON.parse(JSON.stringify(this.currentTierConfig));
        
        // Create AI brain with tier configuration
        const brain = new AIBrain(tiersCopy, speed);
        
        // Create player
        const player = new Player(this.currentEmoji, brain, this.startPosition, this);
        player.isPaused = this.isPaused;
        this.players.push(player);
        
        // Start player movement
        player.startMoving();
        
        // Reset tier configuration for next player (deep clean)
        this.currentTierConfig = [
            { blocks: [] },
            { blocks: [] },
            { blocks: [] }
        ];
        
        // Clear all tier DOMs explicitly
        $('.tier-blocks').empty();
        
        // Render empty tiers
        this.renderTiers();
        
        // Update emoji for next player
        this.currentEmoji = Player.getRandomEmoji();
        this.updatePlayerUI();
        
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
        this.render();
    }
    
    getPlayerTooltip(player) {
        const movesPerSec = (1000 / player.brain.speed).toFixed(1);
        
        // Build tooltip from tier configuration
        let tooltip = `Speed: ${movesPerSec}/s\n\n`;
        
        const tierNames = ['High', 'Med', 'Low'];
        player.brain.tiers.forEach((tier, index) => {
            if (tier.blocks.length > 0) {
                tooltip += `${tierNames[index]} Priority:\n`;
                
                // Calculate total weight for this tier
                const totalWeight = tier.blocks.reduce((sum, b) => sum + b.weight, 0);
                
                tier.blocks.forEach(block => {
                    // Calculate percentage relative to this tier's total
                    const percent = totalWeight > 0 ? Math.round((block.weight / totalWeight) * 100) : 0;
                    let name = '';
                    switch(block.type) {
                        case 'wallFollowing':
                            name = block.mode === 'left' ? 'Left Wall' : 'Right Wall';
                            break;
                        case 'rightWall':
                            name = 'Right Wall';
                            break;
                        case 'lineOfSight':
                            name = 'Line of Sight';
                            break;
                        case 'towardExit':
                            name = 'Toward Exit';
                            break;
                        case 'backtracking':
                            name = block.mode === 'seek' ? 'Seek Backtracking' : 'Avoid Backtracking';
                            break;
                        case 'social':
                            name = block.mode === 'follow' ? 'Follow Others' : 'Avoid Others';
                            break;
                        case 'randomGuesser':
                            name = 'Random Guesser';
                            break;
                    }
                    tooltip += `  ${name} (${percent}%)\n`;
                });
            }
        });
        
        return tooltip.trim();
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

