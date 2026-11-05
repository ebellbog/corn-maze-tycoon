// sprites.js - Art registry: everything drawn on the board is looked up here by key.
// To swap an emoji for pixel art, drop the image in src/assets, import it, and add a `src`:
//     import gravestoneImage from './assets/gravestone.png';
//     gravestone: { emoji: '🪦', src: gravestoneImage },

export const SPRITES = {
    gravestone: { emoji: '🪦' },
    pine: { emoji: '🌲' },
    tree: { emoji: '🌳' },
    rock: { emoji: '🪨' },
    urn: { emoji: '⚱️' },
    digger: { emoji: '🚶' }
};

// Sprites the level generator can pick from for "other obstacles"
export const OBSTACLE_SPRITES = ['pine', 'tree', 'rock', 'urn'];

export function createSpriteElement(key) {
    const { emoji, src } = SPRITES[key];
    return src
        ? $('<img class="sprite">').attr({ src, alt: key })
        : $('<span class="sprite">').text(emoji);
}
