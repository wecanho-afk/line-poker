/* Exact SVG face artwork approved in the fourth card-style preview. */
(() => {
  function royal(rank) {
    const prop = rank === 'J'
      ? '<path class="gold" d="M57 32l7 4-25 47-7-4z"/><path class="line" d="M60 28l7 4-5 8-7-4z"/>'
      : rank === 'Q'
        ? '<path class="gold" d="M21 61q19 15 38 0l-4 25H25z"/><path class="fine" d="M24 64q16 11 32 0M40 62v22"/>'
        : '<path class="gold" d="M56 44h7v42h-7z"/><path class="gold" d="M51 40h17v9H51z"/>';
    const crown = rank === 'J'
      ? '<path class="cloth" d="M25 27l15-12 15 12-5 9H30z"/>'
      : rank === 'Q'
        ? '<path class="gold" d="M22 29l6-15 12 11 12-11 6 15-6 9H28z"/>'
        : '<path class="gold" d="M20 28l6-17 14 12 14-12 6 17-7 10H27z"/>';
    return `<svg class="face-art face-art-royal" viewBox="0 0 80 100">${crown}<circle class="skin" cx="40" cy="42" r="14"/><path class="fine" d="M34 42h3m6 0h3m-10 8q4 3 8 0"/><path class="cloth" d="M18 94q3-36 22-36t22 36z"/>${prop}</svg>`;
  }

  function casino(rank) {
    if (rank === 'J') return '<svg class="face-art face-art-casino" viewBox="0 0 80 100"><circle class="line" cx="31" cy="48" r="20"/><circle class="line" cx="49" cy="48" r="20"/><circle class="fine" cx="31" cy="48" r="14"/><circle class="fine" cx="49" cy="48" r="14"/><path class="gold" d="M31 37l4 7 8 1-6 6 2 8-8-4-7 4 1-8-6-6 8-1zM49 37l4 7 8 1-6 6 2 8-8-4-7 4 1-8-6-6 8-1z"/><path class="fine" d="M18 75h44M24 81h32"/></svg>';
    if (rank === 'Q') return '<svg class="face-art face-art-casino" viewBox="0 0 80 100"><path class="gold" d="M40 15l25 27-25 41-25-41z"/><path class="paper" d="M40 23l16 19-16 29-16-29z"/><path class="line" d="M15 42h50M40 15v68M15 42l25 12 25-12"/><path class="fine" d="M23 83h34M28 89h24"/></svg>';
    return '<svg class="face-art face-art-casino" viewBox="0 0 80 100"><path class="gold" d="M13 45l6-27 18 17 6-24 7 24 18-17 5 27-9 14H22z"/><path class="paper" d="M22 44h42l-5 8H27z"/><path class="line" d="M20 59h46v9H20zM28 75h30M33 82h20"/><circle class="paper" cx="40" cy="42" r="4"/></svg>';
  }

  function midnight(rank) {
    if (rank === 'J') return '<svg class="face-art face-art-midnight" viewBox="0 0 80 100"><path d="M17 26l23-15 23 15-6 28-17 15-17-15zM23 33h34M29 39l8 5m14-5l-8 5M40 69v20m-17 0h34M17 26l-7 13m53-13l7 13"/></svg>';
    if (rank === 'Q') return '<svg class="face-art face-art-midnight" viewBox="0 0 80 100"><path d="M40 9l27 26-8 37-19 19-19-19-8-37zM22 36l18 11 18-11M29 58h22M40 47v44M17 19h13M50 19h13"/></svg>';
    return '<svg class="face-art face-art-midnight" viewBox="0 0 80 100"><path d="M13 32l8-21 19 15 19-15 8 21-7 18v29L40 92 20 79V50zM20 50l20 10 20-10M30 44h4m12 0h4M34 72h12M13 32h54M40 26V8"/></svg>';
  }

  function burgundy(rank) {
    if (rank === 'J') return '<svg class="face-art face-art-burgundy" viewBox="0 0 80 100"><path class="cloth" d="M20 77q8-15 18-23l-7-16 9-20 20 9 7 25-13 21 5 16H25z"/><path class="line" d="M22 83q9-21 22-29l-8-16 8-15 17 8 3 19-12 16 5 19M43 34l12 3m-14 7l10 2m3 7l8-3M31 81h31"/><path class="gold" d="M35 25l5-13 8 10z"/></svg>';
    if (rank === 'Q') return '<svg class="face-art face-art-burgundy" viewBox="0 0 80 100"><circle class="fine" cx="40" cy="49" r="27"/><path class="line" d="M40 76V40M40 62q-18-6-18-22 15 0 18 13M40 57q17-8 18-23-14 0-18 12M40 70q-12 0-17 11m17-11q12 0 17 11"/><path class="gold" d="M40 21c7 7 9 13 0 20-9-7-7-13 0-20zM22 42c10 0 15 4 16 14-10 0-15-5-16-14zM58 35c-1 10-6 15-16 15 1-10 6-15 16-15z"/></svg>';
    return '<svg class="face-art face-art-burgundy" viewBox="0 0 80 100"><path class="gold" d="M18 30l5-18 16 13 16-13 7 18-7 11H26z"/><path class="cloth" d="M21 83q1-32 19-38 18 6 20 38z"/><path class="line" d="M28 47q12-11 27 1l8 11-10 5 5 18H23l5-16-10-7zM29 55l9 5-7 6m20-11l-9 5 7 6M34 72h13M23 84h36"/><path class="gold" d="M38 44l-6-9 8 3 8-3-6 9z"/></svg>';
  }

  window.renderCardFaceArt = rank => {
    if (!['J', 'Q', 'K'].includes(rank)) return '<span class="card-art" aria-hidden="true"></span>';
    return `<span class="card-art" aria-hidden="true">${royal(rank)}${casino(rank)}${midnight(rank)}${burgundy(rank)}</span>`;
  };
})();
