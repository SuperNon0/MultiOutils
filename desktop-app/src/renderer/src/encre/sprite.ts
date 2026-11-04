/** Insère les sprites d'icônes (kit « encre » + icônes propres à l'appli) dans
 * la page, une seule fois : <svg class="i"><use href="#i-…"/></svg> marche partout. */
import kitSprite from './icones.svg?raw';
import appSprite from './icones-app.svg?raw';

export function installSprites(): void {
  if (document.getElementById('encre-sprites')) return;
  const holder = document.createElement('div');
  holder.id = 'encre-sprites';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.innerHTML = kitSprite + appSprite;
  document.body.prepend(holder);
}
