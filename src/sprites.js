// sprites.js - Art registry: everything drawn on the board is looked up here by key.
// To swap an emoji for pixel art, drop the image in src/assets, import it, and add a `src`:
//     import gravestoneImage from './assets/gravestone.png';
//     gravestone: { emoji: '🪦', src: gravestoneImage },

export const SPRITES = {
    gravestone: { emoji: '🪦' },
    tree: { emoji: '🌳' },
    digger: { emoji: '🚶‍♀️' }
};

// Sprites the level generator can pick from for "other obstacles"
export const OBSTACLE_SPRITES = ['tree'];

// Each gravestone gets one option from every category, chosen independently. For now they're
// faked with CSS (see the data-size, data-color and data-angle rules); real art can key off them.
export const GRAVESTONE_VARIANTS = {
    size: ['normal', 'narrow', 'stout'],
    color: ['normal', 'dark', 'light'],
    angle: ['normal', 'left', 'right']
};

// How each option is described to the player
export const GRAVESTONE_VARIANT_LABELS = {
    size: { normal: 'Normal', narrow: 'Tall & thin', stout: 'Short & stout' },
    color: { normal: 'Normal', dark: 'Dark', light: 'Light' },
    angle: { normal: 'Upright', left: 'Tilted left', right: 'Tilted right' }
};

export function createSpriteElement(key, variant = null) {
    const { emoji, src } = SPRITES[key];
    const element = src
        ? $('<img class="sprite">').attr({ src, alt: key })
        : $('<span class="sprite">').text(emoji);
    
    for (const [category, option] of Object.entries(variant ?? {})) {
        element.attr(`data-${category}`, option);
    }
    
    return element;
}
