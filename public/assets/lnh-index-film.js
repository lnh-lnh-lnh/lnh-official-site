(() => {
  const hero = document.querySelector('.landing-hero--film');
  if (!hero) return;
  const left = hero.querySelector('.landing-film-left');
  const right = hero.querySelector('.landing-film-right');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 680px)');
  const connection = navigator.connection;
  const assets = ['corridor', 'bath', 'kitchen', 'entrance', 'wide-couple', 'wide-window', 'wide-reading', 'wide-kitchen'].map(name =>
    new URL(`lnh-film-${name}-20260926.webp?v=${name === 'wide-kitchen' ? '20260926d' : '20260926c'}`, document.currentScript.src).href);
  const scenes = [
    { layout:'wide', shots:[4], mobile:3, duration:3000 },
    { layout:'split', shots:[0, 2], mobile:0, duration:2500 },
    { layout:'wide', shots:[5], mobile:5, duration:3000 },
    { layout:'split', shots:[1, 3], mobile:3, duration:2500 },
    { layout:'wide', shots:[6], mobile:6, duration:3000 },
    { layout:'wide', shots:[7], mobile:7, duration:2500 }
  ];
  let frame = 0;
  let timer = null;
  let ready = false;
  let visible = true;

  function paint() {
    const scene = scenes[frame];
    const pair = mobile.matches ? [scene.mobile] : scene.shots;
    hero.dataset.filmLayout = mobile.matches ? 'wide' : scene.layout;
    [left, right].forEach((image, i) => {
      if (pair[i] === undefined) return;
      image.src = assets[pair[i]];
      image.dataset.shot = String(pair[i]);
    });
    hero.dataset.filmFrame = String(frame);
  }

  function sync() {
    clearTimeout(timer);
    timer = null;
    const disabled = reduced.matches || connection?.saveData;
    if (!ready || disabled || !visible || document.hidden) return;
    timer = setTimeout(() => {
      frame = (frame + 1) % scenes.length;
      paint();
      sync();
    }, scenes[frame].duration);
  }

  mobile.addEventListener('change', () => { paint(); sync(); });
  reduced.addEventListener('change', sync);
  connection?.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    sync();
  }).observe(hero);

  paint();
  if (reduced.matches || connection?.saveData) return;
  // Decode each still before starting cuts, so no empty frame appears on slow connections.
  Promise.all(assets.map(src => {
    const image = new Image();
    image.src = src;
    return image.decode();
  })).then(() => { ready = true; sync(); }).catch(() => {
    frame = 0;
    paint();
  });
})();
