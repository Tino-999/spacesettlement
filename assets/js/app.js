// assets/js/app.js
(() => {
  const cardsEl = document.getElementById('cards');
  const qEl = document.getElementById('q');
  const yearEl = document.getElementById('year');

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const TYPE_LABEL = {
  person: 'Person',
  project: 'Project',
  org: 'Organization',
  topic: 'Topic',
  book: 'Book',
  movie: 'Movie',
  concept: 'Concept',
};

  let items = [];
  let filter = 'all';
  let query = '';

  function norm(s) {
    return (s || '').toLowerCase().trim();
  }

  function matches(it) {
    if (filter !== 'all' && it.type !== filter) return false;
    if (!query) return true;

    const hay = [
      it.title,
      it.summary,
      (it.tags || []).join(' ')
    ].join(' ');
    return norm(hay).includes(query);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function cardTemplate(it, idx) {
    const sideClass = (idx % 2 === 0) ? 'is-left' : 'is-right';
    const kicker = TYPE_LABEL[it.type] || 'Item';
    const tags = (it.tags || []).slice(0, 6);

    // If image missing, still looks good due to media background gradients.
    const imgHtml = it.image
      ? `<img class="card__img" src="${escapeHtml(it.image)}" alt="${escapeHtml(it.title)}" loading="lazy" />`
      : '';

    return `
      <article class="card ${sideClass}">
        <div class="card__row">
          <div class="card__media" aria-hidden="true">
            ${imgHtml}
            <div class="card__fade"></div>
          </div>
          <div class="card__content">
            <div class="card__kicker">${escapeHtml(kicker)}</div>
            <h2 class="card__title">
              <a href="${escapeHtml(it.href || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title)}</a>
            </h2>
            <p class="card__summary">${escapeHtml(it.summary || '')}</p>
            ${tags.length ? `<div class="card__meta">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
      </article>
    `;
  }

  function render() {
    if (!cardsEl) return;

    const view = items.filter(matches);
    if (!view.length) {
      cardsEl.innerHTML = `
        <div class="card">
          <div class="card__row" style="grid-template-columns:1fr">
            <div class="card__content" style="min-height:220px">
              <div class="card__kicker">No results</div>
              <h2 class="card__title">Nothing matches.</h2>
              <p class="card__summary">Try a different filter or search phrase.</p>
            </div>
          </div>
        </div>
      `;
      return;
    }

    cardsEl.innerHTML = view.map((it, i) => cardTemplate(it, i)).join('');
  }

  function setActiveChip(type) {
    document.querySelectorAll('.chip').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.filter === type);
    });
  }

  async function init() {
    try {
      const res = await fetch('data/items.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load data/items.json (${res.status})`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('items.json must be an array');
      items = data;
    } catch (e) {
      console.error(e);
      items = [];
    }

    render();

    // chips
    document.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.filter || 'all';
        setActiveChip(filter);
        render();
      });
    });

    // search
    if (qEl) {
      qEl.addEventListener('input', () => {
        query = norm(qEl.value);
        render();
      }, { passive: true });
    }
  }

  init();
})();
