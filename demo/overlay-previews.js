const image = document.getElementById('overlay-preview-image');
const caption = document.getElementById('overlay-preview-label');
const buttons = [...document.querySelectorAll('[data-overlay]')];
const previews = {
  live: './assets/live-night-preview.webp',
  lights: './assets/lights-preview.webp',
  comfort: './assets/comfort-preview.webp',
  security: './assets/security-preview.webp',
  network: './assets/network-preview.webp',
  health: './assets/health-preview.webp'
};

let request = 0;
for (const button of buttons) {
  button.addEventListener('click', () => {
    const selection = ++request;
    const key = button.dataset.overlay;
    const name = button.getAttribute('aria-label');
    const next = new Image();
    next.onload = () => {
      if (selection !== request) return;
      image.src = next.src;
      image.alt = name + ' floorplan overlay preview';
      caption.textContent = name + ' preview';
      image.parentElement.style.backgroundColor = key === 'network' ? '#fff' : '#121212';
      for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
      if (image.getBoundingClientRect().bottom < 0) {
        image.scrollIntoView({block: 'nearest'});
      }
    };
    next.onerror = () => {
      if (selection === request) caption.textContent = name + ' preview unavailable';
    };
    next.src = previews[key];
  });
}
