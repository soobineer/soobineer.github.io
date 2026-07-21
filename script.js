(() => {
  const menuToggle = document.querySelector('.menu-toggle');
  const siteNav = document.querySelector('#site-nav');
  const navLinks = document.querySelectorAll('#site-nav a');

  if (menuToggle && siteNav) {
    menuToggle.addEventListener('click', () => {
      const isOpen = siteNav.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.forEach((link) => link.addEventListener('click', () => {
      siteNav.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    }));
  }

  const canvas = document.querySelector('#game-canvas');
  const startButton = document.querySelector('#start-button');
  const pauseButton = document.querySelector('#pause-button');
  const restartButton = document.querySelector('#restart-button');
  const scoreValue = document.querySelector('#score-value');
  const bestValue = document.querySelector('#best-value');
  const gameStatus = document.querySelector('#game-status');
  const overlay = document.querySelector('#game-overlay');
  const overlayTitle = document.querySelector('#overlay-title');
  const overlayCopy = document.querySelector('#overlay-copy');

  if (!canvas || !startButton || !pauseButton || !restartButton) return;

  const context = canvas.getContext('2d');
  const gridSize = 24;
  const cellSize = canvas.width / gridSize;
  const tickMs = 112;
  const enemyMoveMs = 155;
  const explosionMs = 720;
  const directions = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const keyDirections = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
  let snake = [];
  let direction = directions.right;
  let nextDirection = directions.right;
  let food = null;
  let enemy = null;
  let score = 0;
  let bestScore = loadBestScore();
  let gameState = 'idle';
  let animationId = null;
  let accumulator = 0;
  let enemyAccumulator = 0;
  let lastFrame = 0;
  let lastTick = 0;

  bestValue.textContent = String(bestScore);

  function loadBestScore() {
    try { return Number(localStorage.getItem('soobineer-worm-best')) || 0; } catch { return 0; }
  }

  function saveBestScore() {
    try { localStorage.setItem('soobineer-worm-best', String(bestScore)); } catch { /* Storage can be unavailable in private contexts. */ }
  }

  function samePosition(a, b) { return a.x === b.x && a.y === b.y; }

  function randomCell() { return { x: Math.floor(Math.random() * gridSize), y: Math.floor(Math.random() * gridSize) }; }

  function isBlocked(cell, includeEnemy = true) {
    if (snake.some((segment) => samePosition(segment, cell))) return true;
    return includeEnemy && enemy && enemy.state === 'active' && enemy.body.some((segment) => samePosition(segment, cell));
  }

  function placeFood() {
    let candidate = randomCell();
    let attempts = 0;
    while (isBlocked(candidate) && attempts < 500) { candidate = randomCell(); attempts += 1; }
    food = candidate;
  }

  function spawnEnemy() {
    let head = randomCell();
    let attempts = 0;
    while (isBlocked(head, false) && attempts < 500) { head = randomCell(); attempts += 1; }
    const enemyDirection = directions[['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)]];
    enemy = {
      head,
      body: [head, { x: head.x - enemyDirection.x, y: head.y - enemyDirection.y }],
      direction: enemyDirection,
      state: 'active',
      nextExplosion: performance.now() + 4000,
      explosionStarted: 0,
    };
  }

  function startGame() {
    if (animationId !== null) cancelAnimationFrame(animationId);
    snake = [{ x: 8, y: 12 }, { x: 7, y: 12 }, { x: 6, y: 12 }];
    direction = directions.right;
    nextDirection = directions.right;
    score = 0;
    scoreValue.textContent = '0';
    gameState = 'running';
    accumulator = 0;
    enemyAccumulator = 0;
    lastFrame = performance.now();
    lastTick = lastFrame;
    placeFood();
    spawnEnemy();
    overlay.classList.add('hidden');
    gameStatus.textContent = '진행 중';
    startButton.textContent = '진행 중';
    startButton.disabled = true;
    pauseButton.disabled = false;
    animationId = requestAnimationFrame(frame);
  }

  function endGame(reason) {
    gameState = 'gameover';
    if (score > bestScore) { bestScore = score; bestValue.textContent = String(bestScore); saveBestScore(); }
    gameStatus.textContent = `게임 오버 · ${reason}`;
    overlayTitle.textContent = '게임 오버';
    overlayCopy.textContent = `점수 ${score} · 다시 시작해서 기록을 갱신하세요.`;
    overlay.classList.remove('hidden');
    startButton.textContent = '다시 시작';
    startButton.disabled = false;
    pauseButton.disabled = true;
    if (animationId !== null) cancelAnimationFrame(animationId);
    animationId = null;
    draw();
  }

  function togglePause() {
    if (gameState === 'running') {
      gameState = 'paused';
      gameStatus.textContent = '일시정지';
      pauseButton.textContent = '계속하기';
      overlayTitle.textContent = '일시정지';
      overlayCopy.textContent = 'Space 또는 계속하기 버튼으로 재개하세요.';
      overlay.classList.remove('hidden');
      if (animationId !== null) cancelAnimationFrame(animationId);
      animationId = null;
    } else if (gameState === 'paused') {
      gameState = 'running';
      gameStatus.textContent = '진행 중';
      pauseButton.textContent = '일시정지';
      lastFrame = performance.now();
      animationId = requestAnimationFrame(frame);
      overlay.classList.add('hidden');
    }
  }

  function setDirection(name) {
    const candidate = directions[name];
    if (!candidate || (candidate.x === -direction.x && candidate.y === -direction.y)) return;
    nextDirection = candidate;
  }

  function moveEnemy() {
    if (!enemy || enemy.state !== 'active') return;
    const options = Object.values(directions).filter((candidate) => !(candidate.x === -enemy.direction.x && candidate.y === -enemy.direction.y));
    const shuffled = options.sort(() => Math.random() - .5);
    const viable = shuffled.find((candidate) => {
      const next = { x: enemy.head.x + candidate.x, y: enemy.head.y + candidate.y };
      return next.x >= 0 && next.x < gridSize && next.y >= 0 && next.y < gridSize && !snake.some((segment) => samePosition(segment, next));
    });
    if (viable) enemy.direction = viable;
    const nextHead = { x: enemy.head.x + enemy.direction.x, y: enemy.head.y + enemy.direction.y };
    if (nextHead.x < 0 || nextHead.x >= gridSize || nextHead.y < 0 || nextHead.y >= gridSize) return;
    enemy.head = nextHead;
    enemy.body.unshift(nextHead);
    enemy.body = enemy.body.slice(0, 2);
  }

  function updateEnemy(now) {
    if (!enemy) spawnEnemy();
    if (enemy.state === 'active' && now >= enemy.nextExplosion) {
      enemy.state = 'exploding';
      enemy.explosionStarted = now;
      return;
    }
    if (enemy.state === 'exploding' && now - enemy.explosionStarted >= explosionMs) {
      spawnEnemy();
    }
  }

  function tick(now) {
    direction = nextDirection;
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    if (head.x < 0 || head.x >= gridSize || head.y < 0 || head.y >= gridSize) return endGame('벽 충돌');
    if (snake.some((segment, index) => index > 0 && samePosition(segment, head))) return endGame('몸 충돌');
    if (enemy && enemy.state === 'active' && enemy.body.some((segment) => samePosition(segment, head))) return endGame('적 충돌');
    snake.unshift(head);
    if (food && samePosition(head, food)) { score += 10; scoreValue.textContent = String(score); placeFood(); } else snake.pop();
    if (now - lastTick >= enemyMoveMs) { moveEnemy(); lastTick = now; }
    updateEnemy(now);
  }

  function drawCell(cell, color, inset = 1) {
    context.fillStyle = color;
    context.fillRect(cell.x * cellSize + inset, cell.y * cellSize + inset, cellSize - inset * 2, cellSize - inset * 2);
  }

  function draw() {
    context.fillStyle = '#101010';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < gridSize; y += 1) for (let x = 0; x < gridSize; x += 1) {
      if ((x + y) % 2 === 0) { context.fillStyle = '#171717'; context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize); }
    }
    if (food) { drawCell(food, '#fccc63', 4); context.fillStyle = '#ed4956'; context.fillRect(food.x * cellSize + 7, food.y * cellSize + 7, 4, 4); }
    snake.forEach((segment, index) => drawCell(segment, index === 0 ? '#0095f6' : '#8ecbff', index === 0 ? 2 : 3));
    if (enemy) {
      enemy.body.forEach((segment) => drawCell(segment, enemy.state === 'exploding' ? '#ed4956' : '#833ab4', 3));
      if (enemy.state === 'exploding') {
        const radius = Math.min(cellSize * 3, cellSize * (1 + ((performance.now() - enemy.explosionStarted) / explosionMs) * 2));
        context.beginPath(); context.arc((enemy.head.x + .5) * cellSize, (enemy.head.y + .5) * cellSize, radius, 0, Math.PI * 2); context.strokeStyle = '#ed4956'; context.lineWidth = 3; context.stroke();
      }
    }
  }

  function frame(now) {
    if (gameState !== 'running') return;
    const elapsed = Math.min(now - lastFrame, 250);
    lastFrame = now;
    accumulator += elapsed;
    enemyAccumulator += elapsed;
    while (accumulator >= tickMs && gameState === 'running') { tick(now); accumulator -= tickMs; }
    if (enemyAccumulator >= enemyMoveMs) { updateEnemy(now); enemyAccumulator = 0; }
    draw();
    animationId = requestAnimationFrame(frame);
  }

  document.querySelectorAll('[data-direction]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); setDirection(button.dataset.direction); });
  });
  document.addEventListener('keydown', (event) => {
    const requested = keyDirections[event.key];
    if (requested) { event.preventDefault(); setDirection(requested); }
    if (event.code === 'Space') { event.preventDefault(); togglePause(); }
    if (event.key === 'Enter' && (gameState === 'idle' || gameState === 'gameover')) startGame();
  });
  startButton.addEventListener('click', startGame);
  pauseButton.addEventListener('click', togglePause);
  restartButton.addEventListener('click', startGame);
  draw();

  const slotSpinButton = document.querySelector('#slot-spin-button');
  const slotResetButton = document.querySelector('#slot-reset-button');
  const slotReels = document.querySelector('.slot-reels');
  const slotBalanceValue = document.querySelector('#slot-balance-value');
  const slotBetValue = document.querySelector('#slot-bet-value');
  const slotStatus = document.querySelector('#slot-status');
  const slotResult = document.querySelector('#slot-result');
  const slotBetButtons = document.querySelectorAll('[data-bet-change]');

  if (slotSpinButton && slotResetButton && slotReels && slotBalanceValue && slotBetValue && slotStatus && slotResult) {
    const slotSymbols = ['🍒', '🍋', '🔔', '⭐', '💎', '🍀', '7️⃣'];
    const slotReelSymbols = slotReels.querySelectorAll('.reel-symbol');
    let slotBalance = 10000;
    let slotBet = 100;
    let slotState = 'ready';
    let slotTimer = null;

    function formatWon(value) { return `₩${value.toLocaleString('ko-KR')}`; }

    function updateSlotUI() {
      slotBalanceValue.textContent = formatWon(slotBalance);
      slotBetValue.textContent = formatWon(slotBet);
      const locked = slotState === 'spinning' || slotState === 'gameover' || slotState === 'won';
      slotSpinButton.disabled = locked || slotBalance < slotBet;
      slotBetButtons.forEach((button) => { button.disabled = locked; });
      slotResetButton.disabled = slotState === 'spinning';
    }

    function finishSlotGame(state, message) {
      slotState = state;
      slotStatus.textContent = message;
      updateSlotUI();
    }

    function spinSlots() {
      if (slotState !== 'ready' || slotBalance < slotBet) return;
      slotState = 'spinning';
      slotBalance -= slotBet;
      slotStatus.textContent = '레버를 당겼습니다. 기계가 잠깐 고민합니다.';
      slotResult.textContent = '회전 중... 결과는 곧 공개됩니다.';
      slotReels.classList.add('spinning');
      slotSpinButton.classList.add('is-pulled');
      updateSlotUI();
      slotTimer = window.setTimeout(() => {
        const result = Array.from({ length: 3 }, () => slotSymbols[Math.floor(Math.random() * slotSymbols.length)]);
        slotReelSymbols.forEach((symbol, index) => { symbol.textContent = result[index]; });
        slotReels.classList.remove('spinning');
        slotSpinButton.classList.remove('is-pulled');
        const counts = result.reduce((map, symbol) => ({ ...map, [symbol]: (map[symbol] || 0) + 1 }), {});
        const matchCount = Math.max(...Object.values(counts));
        const multiplier = matchCount === 3 ? 10 : matchCount === 2 ? 2 : 0;
        const payout = slotBet * multiplier;
        slotBalance += payout;
        const message = multiplier ? `${matchCount}개 일치 · ${formatWon(payout)} 획득` : '일치 없음 · 기계가 모른 척합니다.';
        slotResult.textContent = message;
        slotTimer = null;
        if (slotBalance >= 100000000) finishSlotGame('won', '게임 승리 · 잔액 목표에 도착했습니다.');
        else if (slotBalance === 0) finishSlotGame('gameover', '게임 오버 · 시드머니가 바닥났습니다.');
        else finishSlotGame('ready', message);
      }, 720);
    }

    slotBetButtons.forEach((button) => button.addEventListener('click', () => {
      if (slotState !== 'ready') return;
      const change = Number(button.dataset.betChange);
      slotBet = Math.min(slotBalance, Math.max(100, slotBet + change));
      updateSlotUI();
    }));
    slotSpinButton.addEventListener('click', spinSlots);
    slotResetButton.addEventListener('click', () => {
      if (slotTimer !== null) window.clearTimeout(slotTimer);
      slotTimer = null;
      slotBalance = 10000;
      slotBet = 100;
      slotState = 'ready';
      slotReels.classList.remove('spinning');
      slotSpinButton.classList.remove('is-pulled');
      slotReelSymbols.forEach((symbol, index) => { symbol.textContent = slotSymbols[index]; });
      slotStatus.textContent = '레버를 당겨 운을 호출하세요.';
      slotResult.textContent = '기계는 아무것도 약속하지 않습니다.';
      updateSlotUI();
    });
    updateSlotUI();
  }
})();
