/* One persistent board renderer for ordinary streets and both runout lanes. */
(function (root) {
  const rendered = new WeakMap();

  function describe(state) {
    const twice = Array.isArray(state.runout_boards) && state.runout_boards.length === 2;
    const shared = twice ? Math.max(0, Math.min(5, Math.trunc(Number(state.runout_shared_count) || 0))) : 0;
    const common = twice ? state.runout_boards[0].slice(0, shared) : [];
    const rows = twice ? state.runout_boards.map(cards => cards.slice(shared, 5)) : [state.community_cards || []];
    return { twice, shared, common, rows, columns: 5 - shared };
  }

  function render(area, state, formatCard) {
    const view = describe(state);
    const handKey = state.game_id + ':' + state.hand_number;
    const layoutKey = handKey + ':' + (view.twice ? 'twice:' + view.shared : 'single');
    let previous = rendered.get(area);
    const seen = previous?.handKey === handKey ? previous.seen : new Set();
    if (previous?.layoutKey !== layoutKey) {
      area.replaceChildren();
      area.classList.toggle('run-twice', view.twice);
      area.classList.toggle('has-common', view.shared > 0);
      area.setAttribute('aria-label', view.twice ? '公共牌發兩次，共同牌只顯示一次' : '公共牌');
      const slots = [];
      const makeSlot = (parent, key, animate) => {
        const slot = area.ownerDocument.createElement('div');
        slot.className = 'board-slot'; slot.dataset.boardKey = key;
        parent.append(slot); slots.push({ slot, key, animate });
      };
      if (view.shared) {
        const common = area.ownerDocument.createElement('section'); common.className = 'runout-common';
        const label = area.ownerDocument.createElement('span'); label.className = 'runout-common-label'; label.textContent = '共同牌';
        const cards = area.ownerDocument.createElement('div'); cards.className = 'board-row';
        common.append(label, cards); area.append(common);
        view.common.forEach((card, i) => makeSlot(cards, 'shared:' + i, false));
      }
      const branches = area.ownerDocument.createElement('div');
      branches.className = view.twice ? 'runout-branches' : 'board-row'; area.append(branches);
      view.rows.forEach((cards, lane) => {
        let row = branches;
        if (view.twice) {
          row = area.ownerDocument.createElement('div'); row.className = 'runout-lane';
          const label = area.ownerDocument.createElement('b'); label.textContent = String(lane + 1);
          label.setAttribute('aria-label', '第 ' + (lane + 1) + ' 次發牌'); row.append(label); branches.append(row);
        }
        for (let i = 0; i < view.columns; i++) {
          const key = (view.twice ? 'lane:' + lane + ':' : 'shared:') + (view.shared + i);
          makeSlot(row, key, true);
        }
      });
      previous = { handKey, layoutKey, seen, slots };
      rendered.set(area, previous);
    }
    let sequence = 0;
    for (const entry of previous.slots) {
      const { slot, key } = entry;
      const index = Number(key.split(':').at(-1));
      const lane = key.startsWith('lane:') ? Number(key.split(':')[1]) : -1;
      const card = lane >= 0 ? view.rows[lane][index - view.shared] : (view.twice ? view.common[index] : view.rows[0][index]);
      if (slot.dataset.card === (card || '')) continue;
      slot.dataset.card = card || '';
      if (!card) { slot.innerHTML = '<div class="card-empty" aria-hidden="true"></div>'; continue; }
      const identity = key + ':' + card;
      const animate = entry.animate && !seen.has(identity);
      slot.innerHTML = formatCard(card);
      if (animate) {
        const element = slot.firstElementChild;
        element.classList.add('board-dealing');
        slot.style.setProperty('--deal-delay', sequence++ * 90 + 'ms');
        element.addEventListener('animationend', event => {
          if (event.target === element && event.animationName === 'board-card-reveal') element.classList.remove('board-dealing');
        });
      }
      seen.add(identity);
    }
  }

  const api = { describe, render };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PokerBoardRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
