// Only one window may run the game at a time (they share one save). The newest window wins:
// it announces itself, and older windows save, stop and show a "running elsewhere" notice.
import { saveState, stopSaving } from './state';

const channel = 'BroadcastChannel' in window ? new BroadcastChannel('pixel-hunters') : null;
const me = Math.random().toString(36).slice(2);

export function claimInstance(onTakenOver: () => void) {
  if (!channel) return;
  channel.onmessage = (e: MessageEvent<{ type: string; id: string }>) => {
    if (e.data?.type !== 'hello' || e.data.id === me) return;
    saveState(); // hand over the latest progress before going quiet
    stopSaving();
    onTakenOver();
  };
  channel.postMessage({ type: 'hello', id: me });
}

/** Full-page notice shown in a window that handed the game over to another one. */
export function showTakenOver() {
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;' +
    'background:#14101c;color:#f6ecd8;font:16px Galmuri11,sans-serif;text-align:center;z-index:10';
  box.innerHTML = '<div>다른 창에서 게임이 실행 중입니다.</div>';
  const btn = document.createElement('button');
  btn.textContent = '여기서 계속하기';
  btn.style.cssText = 'font:inherit;padding:8px 16px;background:#c99a68;border:2px solid #3a1e18;cursor:pointer';
  btn.onclick = () => location.reload();
  box.appendChild(btn);
  document.body.appendChild(box);
}
