// Bootstrap: content warning → title (with a slow campus fly-by behind it) → play.
import * as THREE from 'three';
import { audio } from './engine/audio';
import { Game } from './game';
import { memory } from './mind/memory';
import { settings } from './settings';
import { Story } from './story/story';

async function main() {
  const game = new Game(document.getElementById('app')!);
  await game.load();
  game.start();
  const story = new Story(game);
  // Debug handle for development tools (no gameplay effect).
  (window as unknown as { khc: unknown }).khc = { game, story, THREE };

  await game.ui.warning();
  audio.start();
  audio.setVolume(settings.volume);

  game.ui.onErase = () => {
    memory.eraseAll();
    location.reload();
  };

  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && game.playing && !game.ui.busy && !game.ui.journalOpen) game.openPause(() => location.reload());
  });

  for (;;) {
    story.titleScene();
    const choice = await game.ui.title({ hasSave: game.rpg.hasSave(), haunted: memory.haunted, runs: memory.data.runs, endings: memory.data.endings });
    game.input.lock();
    const finished = await story.play(choice);
    if (!finished) continue;
  }
}

void main();
