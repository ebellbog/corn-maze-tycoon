import './index.less';
import './mobile.less';
import { BLOCKED, generateCemetery, getRequiredGravestoneCount, OPEN } from './levelGenerator.js';
import { createSpriteElement, SPRITES } from './sprites.js';

const MIN_SIZE = 3;
const MAX_SIZE = 51;
const SETTINGS_PANEL_WIDTH = 280;
const MOVE_DURATION = 150; // Time to cross one square, in ms
const STORAGE_KEY = 'the-brave-digger';
const STORAGE_VERSION = 1;
const INVESTIGATE_COST = 3; // Seconds spent investigating a gravestone
const POPOVER_DURATION = 1500; // How long an investigation message stays up, in ms

const MOVE_KEYS = {
    arrowup: 'up', w: 'up',
    arrowdown: 'down', s: 'down',
    arrowleft: 'left', a: 'left',
    arrowright: 'right', d: 'right'
};

const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
};

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

class CemeteryGame {
    constructor() {
        this.settings = { width: 9, height: 9, gravestones: 16, obstacles: 0, timeAllowance: 10 };
        this.level = null;
        this.digger = null; // { x, y }, or null until an entry point is chosen
        this.heldKeys = []; // Movement keys currently down, most recently pressed last
        this.isMoving = false;
        this.facing = 'down';
        this.popoverTimeout = null;
        this.timeRemaining = 0; // Seconds left; each step costs one
        this.board = $('#game-board');
        
        this.setupSettings();
        this.setupBoard();
        this.setupControls();
        
        if (!this.loadFromLocalStorage()) {
            this.regenerate();
        }
    }
    
    setupSettings() {
        $('#settings-panel input').on('change', () => this.regenerate());
        $('#regenerate-button').on('click', () => this.regenerate());
        $('#restart-button').on('click', () => this.restart());
        this.renderSettings();
    }
    
    setupBoard() {
        $('#game-container')[0].style.setProperty('--move-duration', `${MOVE_DURATION}ms`);
        
        this.board.on('click', '.entry-point', (e) => {
            const cell = $(e.currentTarget);
            this.enterCemetery(cell.data('x'), cell.data('y'));
        });
        
        $(window).on('resize', () => this.updateCellSize());
    }
    
    setupControls() {
        $(document).on('keydown', (e) => {
            // Leave typing, and browser shortcuts like Ctrl+R, alone
            if ($(e.target).is('input') || e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }
            
            const key = e.key.toLowerCase();
            
            if (key === 'r') {
                e.preventDefault();
                this.regenerate();
                return;
            }
            
            if (key === 't') {
                e.preventDefault();
                this.restart();
                return;
            }
            
            if (key === ' ') {
                e.preventDefault(); // Avoid scrolling, or pressing a focused button
                if (!e.originalEvent.repeat) {
                    this.investigate();
                }
                return;
            }
            
            if (MOVE_KEYS[key]) {
                e.preventDefault(); // Avoid scrolling
                if (!this.heldKeys.includes(key)) {
                    this.heldKeys.push(key);
                }
                this.handleMovement();
            }
        });
        
        $(document).on('keyup', (e) => {
            // Some browsers press a focused button on spacebar keyup instead of keydown
            if (e.key === ' ' && !$(e.target).is('input')) {
                e.preventDefault();
            }
            
            const key = e.key.toLowerCase();
            this.heldKeys = this.heldKeys.filter(heldKey => heldKey !== key);
        });
        
        // Keyups don't arrive while the window is out of focus
        $(window).on('blur', () => {
            this.heldKeys = [];
        });
    }
    
    readSettings() {
        const read = (id, fallback) => {
            const value = parseInt($(id).val(), 10);
            return Number.isNaN(value) ? fallback : value;
        };
        const toOddSize = (value) => {
            const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, value));
            return clamped % 2 === 1 ? clamped : clamped + 1;
        };
        
        const { settings } = this;
        const width = toOddSize(read('#cemetery-width', settings.width));
        const height = toOddSize(read('#cemetery-height', settings.height));
        const requiredGravestones = getRequiredGravestoneCount(width, height);
        
        this.settings = {
            width,
            height,
            gravestones: Math.max(requiredGravestones, read('#cemetery-gravestones', settings.gravestones)),
            obstacles: Math.max(0, read('#cemetery-obstacles', settings.obstacles)),
            timeAllowance: Math.max(1, read('#cemetery-time', settings.timeAllowance))
        };
    }
    
    renderSettings() {
        const { width, height, gravestones, obstacles, timeAllowance } = this.settings;
        const requiredGravestones = getRequiredGravestoneCount(width, height);
        
        $('#cemetery-width').val(width);
        $('#cemetery-height').val(height);
        $('#cemetery-gravestones').val(gravestones).attr('min', requiredGravestones);
        $('#cemetery-obstacles').val(obstacles);
        $('#cemetery-time').val(timeAllowance);
        $('#gravestones-hint').text(`Minimum for this size: ${requiredGravestones}`);
    }
    
    regenerate() {
        this.readSettings();
        this.renderSettings();
        
        this.level = generateCemetery(this.settings);
        this.saveToLocalStorage();
        this.renderCapacityWarning();
        this.restart();
    }
    
    // Only the settings and layout are saved: a refresh starts the run over
    saveToLocalStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: STORAGE_VERSION,
                settings: this.settings,
                level: this.level
            }));
        } catch (e) {
            // Storage can be full or blocked; the game still works without it
        }
    }
    
    // Returns false, leaving the game untouched, if nothing usable was saved
    loadFromLocalStorage() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved || saved.version !== STORAGE_VERSION || !this.isValidSave(saved)) {
                return false;
            }
            
            this.settings = saved.settings;
            this.level = saved.level;
        } catch (e) {
            return false;
        }
        
        this.renderSettings();
        this.renderCapacityWarning();
        this.restart();
        return true;
    }
    
    isValidSave({ settings, level }) {
        const isWholeNumber = (value) => Number.isInteger(value);
        const isOddSize = (value) => isWholeNumber(value) && value >= MIN_SIZE && value <= MAX_SIZE && value % 2 === 1;
        
        const hasValidSettings = isOddSize(settings.width) && isOddSize(settings.height) &&
            [settings.gravestones, settings.obstacles, settings.timeAllowance].every(isWholeNumber) &&
            settings.timeAllowance >= 1;
        if (!hasValidSettings) {
            return false;
        }
        
        const { width, height, grid, sprites, entryPoints } = level;
        const isGridOfSize = (rows, isValidCell) => {
            return Array.isArray(rows) && rows.length === height &&
                rows.every(row => Array.isArray(row) && row.length === width && row.every(isValidCell));
        };
        
        return width === settings.width && height === settings.height &&
            isGridOfSize(grid, cell => cell === OPEN || cell === BLOCKED) &&
            isGridOfSize(sprites, sprite => sprite === null || Boolean(SPRITES[sprite])) &&
            grid.every((row, y) => row.every((cell, x) => (cell === OPEN) === (sprites[y][x] === null))) &&
            Array.isArray(entryPoints) &&
            entryPoints.every(({ x, y }) => grid[y]?.[x] === OPEN) &&
            [level.unplacedGravestones, level.unplacedObstacles].every(isWholeNumber);
    }
    
    // Starts over on the current layout: back to choosing an entry point, with a full timer
    restart() {
        this.hidePopover();
        this.digger = null;
        this.timeRemaining = this.settings.timeAllowance;
        
        this.renderBoard();
        this.renderStatus();
        this.renderTimer();
    }
    
    getCellSize() {
        const { width, height } = this.level;
        const margin = 40;
        const statusHeight = 40;
        const availableWidth = $(window).width() - SETTINGS_PANEL_WIDTH - (margin * 2);
        const availableHeight = $(window).height() - statusHeight - (margin * 2);
        const cellSize = Math.min(Math.floor(availableWidth / width), Math.floor(availableHeight / height));
        
        return Math.max(12, Math.min(64, cellSize));
    }
    
    updateCellSize() {
        // On the container, so the timer can match the board's width
        const container = $('#game-container')[0];
        container.style.setProperty('--cell-size', `${this.getCellSize()}px`);
        container.style.setProperty('--columns', this.level.width);
    }
    
    renderCapacityWarning() {
        const { unplacedGravestones, unplacedObstacles } = this.level;
        const pluralize = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
        const unplaced = [
            unplacedGravestones > 0 ? pluralize(unplacedGravestones, 'gravestone') : null,
            unplacedObstacles > 0 ? pluralize(unplacedObstacles, 'obstacle') : null
        ].filter(Boolean).join(' and ');
        
        $('#capacity-warning').text(unplaced
            ? `Couldn't fit ${unplaced}, while keeping every path connected and every gravestone reachable. Regenerate to try another layout, or lower the counts.`
            : '');
    }
    
    renderBoard() {
        const { width, height, grid, sprites, entryPoints } = this.level;
        const cells = [];
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const cell = $('<div class="cell">').attr({ 'data-x': x, 'data-y': y });
                if (grid[y][x] !== OPEN) {
                    cell.append(createSpriteElement(sprites[y][x]));
                }
                cells.push(cell);
            }
        }
        
        for (const { x, y } of entryPoints) {
            cells[y * width + x].addClass('entry-point');
        }
        
        this.board.empty().append(cells);
        this.board.css('grid-template-columns', `repeat(${width}, var(--cell-size))`);
        this.updateCellSize();
    }
    
    isOutOfTime() {
        return this.timeRemaining <= 0;
    }
    
    renderStatus() {
        let message = 'Choose an entry point';
        if (this.digger) {
            message = this.isOutOfTime()
                ? 'Out of air! Press T to try again'
                : 'Use the arrow keys to explore';
        }
        $('#status-message').text(message);
    }
    
    renderTimer() {
        const { timeAllowance } = this.settings;
        const fraction = this.timeRemaining / timeAllowance;
        
        $('#timer-text').text(formatTime(this.timeRemaining));
        $('#timer-fill').css('width', `${fraction * 100}%`);
        $('#timer').toggleClass('low', fraction <= 0.2);
        this.board.toggleClass('out-of-time', this.isOutOfTime());
    }
    
    enterCemetery(x, y) {
        this.digger = { x, y };
        this.board.find('.entry-point').removeClass('entry-point');
        
        // Face into the cemetery, away from the border we came in on
        const { width, height } = this.level;
        this.facing = x === 0 ? 'right' : x === width - 1 ? 'left' : y === 0 ? 'down' : 'up';
        
        const avatar = $('<div id="digger-avatar">').append(createSpriteElement('digger'));
        this.board.append(avatar);
        
        this.renderDigger();
        this.renderFacing();
        this.renderStatus();
    }
    
    renderDigger() {
        const avatar = $('#digger-avatar')[0];
        avatar.style.setProperty('--x', this.digger.x);
        avatar.style.setProperty('--y', this.digger.y);
    }
    
    renderFacing() {
        $('#digger-avatar').attr('data-facing', this.facing);
    }
    
    getFacingSquare() {
        return {
            x: this.digger.x + DIRECTIONS[this.facing].x,
            y: this.digger.y + DIRECTIONS[this.facing].y
        };
    }
    
    investigate() {
        if (!this.digger || this.isOutOfTime()) {
            return;
        }
        
        const { x, y } = this.getFacingSquare();
        if (this.level.sprites[y]?.[x] !== 'gravestone') {
            return;
        }
        
        if (this.timeRemaining < INVESTIGATE_COST) {
            this.flashTimer();
            return;
        }
        
        this.timeRemaining -= INVESTIGATE_COST;
        this.renderTimer();
        if (this.isOutOfTime()) {
            this.renderStatus();
        }
        this.showPopover(x, y, 'Nothing found');
    }
    
    // Signals that there isn't enough time left for what was just attempted
    flashTimer() {
        const timer = $('#timer');
        timer.removeClass('flash');
        void timer[0].offsetWidth; // Reflow, so the animation restarts if it's already running
        timer.addClass('flash').one('animationend', () => timer.removeClass('flash'));
    }
    
    // A speech bubble above the given square, which goes away on its own
    showPopover(x, y, message) {
        this.hidePopover();
        
        const popover = $('<div id="popover">').text(message);
        popover[0].style.setProperty('--x', x);
        popover[0].style.setProperty('--y', y);
        $('#board-wrapper').append(popover);
        
        this.popoverTimeout = setTimeout(() => this.hidePopover(), POPOVER_DURATION);
    }
    
    hidePopover() {
        clearTimeout(this.popoverTimeout);
        $('#popover').remove();
    }
    
    isOpen(x, y) {
        return this.level.grid[y]?.[x] === OPEN;
    }
    
    handleMovement() {
        if (!this.digger || this.isOutOfTime() || this.isMoving || this.heldKeys.length === 0) {
            return;
        }
        
        const direction = MOVE_KEYS[this.heldKeys[this.heldKeys.length - 1]];
        const newX = this.digger.x + DIRECTIONS[direction].x;
        const newY = this.digger.y + DIRECTIONS[direction].y;
        
        // Turning to face an obstacle takes no time, so it's what lets us investigate it
        this.facing = direction;
        this.renderFacing();
        
        if (!this.isOpen(newX, newY)) {
            return;
        }
        
        this.digger.x = newX;
        this.digger.y = newY;
        this.timeRemaining--;
        this.hidePopover();
        this.renderDigger();
        this.renderTimer();
        if (this.isOutOfTime()) {
            this.renderStatus();
        }
        
        this.isMoving = true;
        setTimeout(() => {
            this.isMoving = false;
            this.handleMovement(); // Keep going while a key is held
        }, MOVE_DURATION);
    }
}

$(() => {
    new CemeteryGame();
});
