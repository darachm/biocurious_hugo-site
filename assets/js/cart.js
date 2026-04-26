/* BioCurious Cart — plain JS, no dependencies */
(function () {
  'use strict';

  const CHECKOUT_ENDPOINT = '/.netlify/functions/create-checkout';

  let cart = [];

  /* ── Helpers ── */
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }
  function fmt(n) { return '$' + Number(n).toLocaleString(); }

  function getQty(card) {
    const v = card.querySelector('.qty-val');
    return v ? parseInt(v.textContent) : 1;
  }
  
  /* ── Membership dependency check ── */
  const MEMBERSHIP_IDS = new Set([
    'individual-monthly', 'individual-annual',
    'family-monthly',     'family-annual',
    'standard-office',    // office includes membership
  ]);
 
  const ADDON_IDS = new Set([
    'dry-storage-monthly',      'dry-storage-annual',
    'freezer-80-monthly',       'freezer-80-annual',
    'tissue-culture-monthly',   'tissue-culture-annual',
    'lab-bench',                'back-lab-office',
    'student-monthly',          'student-annual',
  ]);
 
  function cartHasMembership() {
    return cart.some(i => MEMBERSHIP_IDS.has(i.id));
  }
 
  function showAddonWarning(card) {
    // remove any existing warning first
    const existing = card.querySelector('.addon-membership-warning');
    if (existing) return; // already showing
 
    const warning = document.createElement('p');
    warning.className = 'addon-membership-warning';
    warning.textContent = '⚠ A membership or office subscription is required to add this.';
 
    const btn = card.querySelector('.add-to-cart');
    card.insertBefore(warning, btn);
 
    // auto-remove after 4 seconds
    setTimeout(() => warning.remove(), 4000);
  }

 /* ── Cart logic ── */
  function addItem(card) {
    const id  = card.dataset.id;
    const qty = getQty(card);
 
    // if already in cart — remove it
    if (cart.find(i => i.id === id)) {
      removeItem(id);
      if (id.startsWith('family-')) {
        cart = cart.filter(i => !i.id.startsWith('student-'));
      }
      return;
    }
 
    // check membership dependency for add-ons
    if (ADDON_IDS.has(id) && !cartHasMembership()) {
      showAddonWarning(card);
      return;
    }
 
    cart.push({
      id,
      name:   card.dataset.name,
      price:  parseFloat(card.dataset.price),
      setup:  parseFloat(card.dataset.setup || 0),
      freq:   card.dataset.freq,
      qty,
      hasQty: card.dataset.qty === 'true',
    });
 
    // check if student add-on is checked on family card
    const studentToggle = card.querySelector('#student-addon-toggle');
    if (studentToggle && studentToggle.checked) {
      addStudentAddon(card);
    }
 
    renderCart();
    updateButtons();
    openCart();
  }

  function addStudentAddon(familyCard) {
    const isAnnual = familyCard.dataset.freq === 'year';
    const qty      = parseInt(familyCard.querySelector('.student-qty-val')?.textContent || 1);
    const id       = isAnnual ? 'student-annual' : 'student-monthly';

    // remove any existing student line first
    cart = cart.filter(i => !i.id.startsWith('student-'));

    cart.push({
      id,
      name:   'Additional Student',
      price:  isAnnual ? 550 : 50,
      setup:  0,
      freq:   isAnnual ? 'year' : 'month',
      qty,
      hasQty: true,
      isStudentAddon: true,
    });
  }

  function removeItem(id) {
    cart = cart.filter(i => i.id !== id);
    renderCart();
    updateButtons();
  }

  function updateQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty = Math.max(1, item.qty + delta);
    renderCart();
  }

  function recurringTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
  function setupTotal()     { return cart.reduce((s, i) => s + i.setup, 0); }
  function todayTotal()     { return recurringTotal() + setupTotal(); }

  /* ── Render cart drawer ── */
  function renderCart() {
    const itemsEl  = $('#cart-items');
    const footerEl = $('#cart-footer');
    const countEl  = $('#cart-count');
    const fabEl    = $('#cart-fab');
    const fabCount = $('#fab-count');
    const fabTotal = $('#fab-total');

    countEl.textContent = '(' + cart.length + ')';

    if (cart.length === 0) {
      itemsEl.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
      footerEl.style.display = 'none';
      fabEl.style.display = 'none';
      return;
    }

    fabEl.style.display = 'flex';
    fabCount.textContent = cart.length;
    fabTotal.textContent = fmt(todayTotal());
    footerEl.style.display = 'block';

    itemsEl.innerHTML = cart.map(item => `
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item-info">
          <strong>${item.name}${item.qty > 1 ? ' ×' + item.qty : ''}</strong>
          <span>${fmt(item.price * item.qty)}/${item.freq}${item.setup > 0 ? ' <em>+ ' + fmt(item.setup) + ' setup</em>' : ''}</span>
        </div>
        <div class="cart-item-actions">
          ${item.hasQty ? `
            <div class="qty-control">
              <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
              <span>${item.qty}</span>
              <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
            </div>` : ''}
          <button class="remove-btn" data-id="${item.id}">Remove</button>
        </div>
      </div>
    `).join('');

    // totals
    const rt = recurringTotal(), st = setupTotal();
    const allAnnual = cart.length > 0 && cart.every(i => i.freq === 'year');
    const mixedFreq = cart.some(i => i.freq === 'year') && cart.some(i => i.freq === 'month');
    const freqLabel = allAnnual ? '/yr' : mixedFreq ? '/mo + annual' : '/mo';
    $('#total-monthly').textContent = fmt(rt) + freqLabel;

    const setupRow = $('#setup-row');
    if (st > 0) {
      setupRow.style.display = 'flex';
      $('#total-setup').textContent = fmt(st);
    } else {
      setupRow.style.display = 'none';
    }
    $('#total-today').textContent = fmt(rt + st);

    // bind item buttons
    $$('.remove-btn').forEach(btn => btn.addEventListener('click', () => {
      // if removing family, also remove student add-on
      if (btn.dataset.id.startsWith('family-')) {
        cart = cart.filter(i => !i.id.startsWith('student-'));
        // uncheck the student checkbox
        const cb = document.getElementById('student-addon-toggle');
        if (cb) {
          cb.checked = false;
          const wrap = cb.closest('.student-addon').querySelector('.student-qty-wrap');
          if (wrap) wrap.style.display = 'none';
        }
      }
      removeItem(btn.dataset.id);
    }));

    $$('.qty-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        updateQty(btn.dataset.id, btn.dataset.action === 'inc' ? 1 : -1);
      });
    });
  }

  /* ── Update add-to-cart buttons ── */
  function updateButtons() {
    $$('[data-id]').forEach(card => {
      const btn = card.querySelector('.add-to-cart');
      if (!btn) return;
      const inCart = cart.find(i => i.id === card.dataset.id);
      if (inCart) {
        btn.textContent = '✓ In Cart — Remove';
        btn.classList.add('in-cart');
      } else {
        btn.textContent = 'Add to Cart';
        btn.classList.remove('in-cart');
      }
    });
  }

  /* ── Drawer open/close ── */
  function openCart() {
    $('#cart-drawer').classList.add('open');
    $('#cart-overlay').classList.add('open');
  }
  function closeCart() {
    $('#cart-drawer').classList.remove('open');
    $('#cart-overlay').classList.remove('open');
  }

  /* ── Checkout modal ── */
  function openModal() {
    closeCart();
    const modal = $('#modal-overlay');
    modal.style.display = 'flex';

    const summary = $('#order-summary');
    summary.innerHTML = cart.map(i =>
      `<div class="summary-row"><span>${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}</span><span>${fmt(i.price * i.qty)}/${i.freq}</span></div>`
    ).join('')
      + (setupTotal() > 0 ? `<div class="summary-row setup"><span>Setup fee(s)</span><span>${fmt(setupTotal())}</span></div>` : '')
      + `<div class="summary-row total"><span>Today</span><span>${fmt(todayTotal())}</span></div>`;

    validateForm();
  }

  function closeModal() {
    $('#modal-overlay').style.display = 'none';
    $('#checkout-error').style.display = 'none';
  }

  function validateForm() {
    const name  = $('#cust-name').value.trim();
    const email = $('#cust-email').value.trim();
    $('#pay-btn').disabled = !(name && email && email.includes('@'));
  }

  async function submitCheckout() {
    const name   = $('#cust-name').value.trim();
    const email  = $('#cust-email').value.trim();
    const payBtn = $('#pay-btn');
    const errEl  = $('#checkout-error');

    payBtn.textContent = 'Connecting to Stripe...';
    payBtn.disabled = true;
    errEl.style.display = 'none';

    try {
      const res = await fetch(CHECKOUT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(i => ({
            id: i.id, name: i.name, price: i.price,
            freq: i.freq, setup: i.setup, qty: i.qty,
          })),
          customerName: name,
          customerEmail: email,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');

      // warn if some items were skipped (already active subscriptions)
      if (data.skippedItems && data.skippedItems.length > 0) {
        errEl.textContent = `ℹ Note: you already have an active subscription for ${data.skippedItems.join(', ')} — it was not added again.`;
        errEl.style.background = '#fffbeb';
        errEl.style.borderColor = '#fde68a';
        errEl.style.color = '#92400e';
        errEl.style.display = 'block';
        // still redirect after a short pause so they see the notice
        setTimeout(() => { window.location.href = data.url; }, 2500);
      } else {
        window.location.href = data.url;
      }

    } catch (err) {
      errEl.textContent = '⚠ ' + err.message;
      errEl.style.background = '';
      errEl.style.borderColor = '';
      errEl.style.color = '';
      errEl.style.display = 'block';
      payBtn.textContent = 'Pay with Stripe →';
      payBtn.disabled = false;
    }
  }

  /* ── Qty controls on product cards ── */
  function bindCardQtyButtons() {
    $$('.qty-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.closest('.addon-card, .membership-card').querySelector('.qty-val');
        val.textContent = Math.max(1, parseInt(val.textContent) - 1);
      });
    });
    $$('.qty-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.closest('.addon-card, .membership-card').querySelector('.qty-val');
        val.textContent = parseInt(val.textContent) + 1;
      });
    });
  }

  /* ── Student add-on (family card) ── */
  function initStudentAddon() {
    const cb = document.getElementById('student-addon-toggle');
    if (!cb) return;

    const wrap       = cb.closest('.student-addon').querySelector('.student-qty-wrap');
    const note       = cb.closest('.student-addon').querySelector('.student-note');
    const priceLabel = cb.closest('.student-addon').querySelector('.student-price-label');
    const minusBtn   = cb.closest('.student-addon').querySelector('.student-qty-minus');
    const plusBtn    = cb.closest('.student-addon').querySelector('.student-qty-plus');
    const qtyVal     = cb.closest('.student-addon').querySelector('.student-qty-val');
    const familyCard = cb.closest('.membership-card');

    function getStudentPrice() {
      return familyCard.dataset.freq === 'year' ? 550 : 50;
    }

    function getStudentFreq() {
      return familyCard.dataset.freq === 'year' ? 'year' : 'month';
    }

    function updateStudentLabel() {
      const isAnnual = familyCard.dataset.freq === 'year';
      priceLabel.textContent = isAnnual ? '· $550/year each' : '· $50/month each';
      if (note) note.textContent = isAnnual
        ? '$550/year per student · saves $50 · billed with membership'
        : '$50/month per student · billed with membership';
    }

    function syncStudentToCart() {
      if (!cb.checked) return;
      const qty = parseInt(qtyVal.textContent);
      const id  = getStudentFreq() === 'year' ? 'student-annual' : 'student-monthly';
      // update or replace student line in cart
      cart = cart.filter(i => !i.id.startsWith('student-'));
      cart.push({
        id,
        name:           'Additional Student',
        price:          getStudentPrice(),
        setup:          0,
        freq:           getStudentFreq(),
        qty,
        hasQty:         true,
        isStudentAddon: true,
      });
      renderCart();
    }

    // show/hide qty when checkbox toggled
    cb.addEventListener('change', function () {
      wrap.style.display = this.checked ? 'flex' : 'none';
      if (this.checked) {
        syncStudentToCart();
      } else {
        cart = cart.filter(i => !i.id.startsWith('student-'));
        renderCart();
      }
    });

    // qty buttons
    minusBtn.addEventListener('click', () => {
      qtyVal.textContent = Math.max(1, parseInt(qtyVal.textContent) - 1);
      syncStudentToCart();
    });
    plusBtn.addEventListener('click', () => {
      qtyVal.textContent = parseInt(qtyVal.textContent) + 1;
      syncStudentToCart();
    });

    // expose so billing toggle can call it
    familyCard._updateStudentLabel  = updateStudentLabel;
    familyCard._syncStudentToCart   = syncStudentToCart;
  }

  /* ── Billing toggle — independent per card ── */
  function initBillingToggles() {
    $$('[data-annual-id]').forEach(function (card) {
      const toggle = card.querySelector('.billing-toggle');
      if (!toggle) return;

      const labels     = card.querySelectorAll('.toggle-label');
      const lblMonthly = labels[0];
      const lblAnnual  = labels[1];
      const priceEl    = card.querySelector('.price');
      const freqEl     = card.querySelector('.freq');
      const noteEl     = card.querySelector('.annual-note');

      toggle.addEventListener('click', function () {
        const isAnnual = this.getAttribute('aria-pressed') === 'true';
        const switchTo = !isAnnual;
        this.setAttribute('aria-pressed', String(switchTo));

        lblMonthly.classList.toggle('active', !switchTo);
        lblAnnual.classList.toggle('active',   switchTo);

        // remove from cart if already added so ID stays in sync
        if (cart.find(i => i.id === card.dataset.id)) {
          removeItem(card.dataset.id);
          // also remove student add-on
          cart = cart.filter(i => !i.id.startsWith('student-'));
        }

        if (switchTo) {
          card.dataset.id    = card.dataset.annualId;
          card.dataset.price = card.dataset.annualPrice;
          card.dataset.freq  = card.dataset.annualFreq;
          priceEl.textContent = priceEl.dataset.annual;
          freqEl.textContent  = freqEl.dataset.annual;
          if (noteEl) noteEl.style.display = 'block';
        } else {
          card.dataset.id    = card.dataset.annualId.replace('-annual', '-monthly');
          card.dataset.price = priceEl.dataset.monthly.replace('$', '').replace(',', '');
          card.dataset.freq  = 'month';
          priceEl.textContent = priceEl.dataset.monthly;
          freqEl.textContent  = freqEl.dataset.monthly;
          if (noteEl) noteEl.style.display = 'none';
        }

        // update student add-on label and price if this is the family card
        if (card._updateStudentLabel) card._updateStudentLabel();
        if (card._syncStudentToCart)  card._syncStudentToCart();

        updateButtons();
        renderCart();
      });
    });
  }

  /* ── Init ── */
  document.addEventListener('DOMContentLoaded', () => {
    $$('.add-to-cart').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('[data-id]');
        addItem(card);
      });
    });

    bindCardQtyButtons();
    initStudentAddon();
    initBillingToggles();

    $('#cart-fab').addEventListener('click', openCart);
    $('#cart-close').addEventListener('click', closeCart);
    $('#cart-overlay').addEventListener('click', closeCart);

    $('#checkout-btn').addEventListener('click', openModal);
    $('#modal-cancel').addEventListener('click', closeModal);
    $('#modal-overlay').addEventListener('click', e => { if (e.target === $('#modal-overlay')) closeModal(); });
    $('#pay-btn').addEventListener('click', submitCheckout);
    $('#cust-name').addEventListener('input', validateForm);
    $('#cust-email').addEventListener('input', validateForm);

    const params = new URLSearchParams(window.location.search);
    if (params.get('cancelled') === 'true') {
      const notice = document.createElement('div');
      notice.className = 'cancel-notice';
      notice.innerHTML = 'Payment was cancelled. Your cart is still saved. <button onclick="this.parentElement.remove()">✕</button>';
      $('#store').prepend(notice);
      history.replaceState({}, '', '/membership/');
    }
  });

})();