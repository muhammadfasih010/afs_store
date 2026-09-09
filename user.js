/* ============================================================
   user.js
   Logic for the customer-facing storefront (user.html).
   Load order in the HTML: config.js -> storage.js -> user.js
   ============================================================ */

let products = [];
let heroImages = [];
let selected = null;
let adminSelected = null;
let selections = {};
let cart = getCart();
let orders = [];

function selectedOptions(){
  return selected.groups.map((g,i) => g.options[selections[i]||0]).filter(Boolean);
}

// ---- Collection filtering (category chips + search) ----
let activeCategory = 'All';
let searchTerm = '';

function getCategories(){
  return ['All', ...new Set(products.map(p => p.category))];
}

function renderFilterChips(){
  const box = $('#filterChips');
  if(!box) return;
  box.innerHTML = getCategories().map(c => `<button type="button" class="filter-chip ${activeCategory===c?'active':''}" data-cat="${c}">${c}</button>`).join('');
  box.querySelectorAll('.filter-chip').forEach(b => b.onclick = () => { activeCategory = b.dataset.cat; renderProducts(); });
}

function filteredProducts(){
  const term = searchTerm.trim().toLowerCase();
  return products.filter(p => {
    const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
    const matchesSearch = !term || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term) || p.description.toLowerCase().includes(term);
    return matchesCategory && matchesSearch;
  });
}

// ---- Hero gallery (the 5 arch photos under the headline) ----
// Admin-managed via the Hero tab; falls back to product photos so the
// hero never looks empty on a brand new store.
function renderHeroArches(){
  const box = $('#heroArches');
  if(!box) return;
  const slots = [];
  for(let i = 0; i < 5; i++){
    const custom = heroImages[i];
    if(custom && custom.image){ slots.push(custom); continue; }
    const p = products[i % Math.max(products.length,1)];
    slots.push(p ? { image: p.image, productId:p.id, tagLabel: i===2 ? 'Made to order' : '', tagValue: i===2 ? money(p.price) : '' } : { image:'', productId:'', tagLabel:'', tagValue:'' });
  }
  box.innerHTML = slots.map(s => `<div class="hero-arch" data-product-id="${s.productId||''}">`)${s.image?`<img src="${s.image}" alt="AFS Leather">`:''}${s.tagLabel?`<div class="arch-tag">${s.tagLabel}<b>${s.tagValue}</b></div>`:''}</div>`).join('');
}

function renderProducts(){
  const grid = $('#productGrid');
  if(!grid) return;
  renderFilterChips();
  const list = filteredProducts();
  if(!list.length){
    grid.innerHTML = `<div class="no-results"><strong>No pieces found</strong><p>Try a different search term or category.</p></div>`;
    return;
  }
  grid.innerHTML = list.map((p,i) => `<article class="product-card" data-open="${p.id}" style="animation-delay:${Math.min(i,8)*40}ms">
      <div class="pc-media"><span class="pc-badge">${p.category}</span><img src="${p.image}" alt="${p.name}" loading="lazy"><div class="pc-quickview">View details ↗</div></div>
      <div>
        <small>${p.category} / Made to order</small>
        <h3>${p.name}</h3>
        <div class="pc-price">${money(p.price)}<small>onwards</small></div>
        <p>${p.description}</p>
        <button class="pc-add" type="button" data-product="${p.id}">View details ↗</button>
      </div>
    </article>`).join('');
  grid.querySelectorAll('[data-open]').forEach(card => card.addEventListener('click', (e) => {
    if(e.target.closest('[data-product]')) return;
    openProductDetail(products.find(p => p.id === card.dataset.open));
  }));
  grid.querySelectorAll('[data-product]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    openProductDetail(products.find(p => p.id === b.dataset.product));
  }));
}

function chooseProduct(p){
  selected = p;
  selections = {};
  renderStudio();
}

// ---- Product Detail Page ----
let pdProduct = null;
let pdQty = 1;

function openProductDetail(p){
  if(!p) return;
  pdProduct = p;
  pdQty = 1;
  $('#pdCrumb').textContent = p.category;
  $('#pdCategory').textContent = p.category + ' / Made to order';
  $('#pdName').textContent = p.name;
  $('#pdImage').src = p.image;
  $('#pdImage').alt = p.name;
  $('#pdDescription').textContent = p.description;
  updatePdPrice();
  closeCustomizePage(true);
  $('#productDetail').classList.add('open');
  $('#productDetail').scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function closeProductDetail(){
  $('#productDetail').classList.remove('open');
  document.body.style.overflow = '';
}
function updatePdPrice(){
  $('#pdQtyValue').textContent = pdQty;
  $('#pdPrice').textContent = money(pdProduct.price * pdQty);
}

// ---- Customize page (built on the existing studio/customization engine) ----
function openCustomizePage(p){
  closeProductDetail();
  chooseProduct(p);
  $('#studio').classList.add('open');
  $('#studio').scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function closeCustomizePage(silent){
  $('#studio')?.classList.remove('open');
  if(!silent) document.body.style.overflow = '';
}

function renderStudio(){
  if(!$('#selectedName')) return;
  $('#selectedName').textContent = selected.name;
  $('#optionGroups').innerHTML = selected.groups.map((g,gi) => `<div class="option-group"><strong>${String(gi+1).padStart(2,'0')} / ${g.name}</strong><div class="option-list">${g.options.map((o,oi) => `<button class="${(selections[gi]||0)===oi?'active':''}" data-group="${gi}" data-option="${oi}">${o.hex?`<span class="swatch" style="background:${o.hex}"></span>`:''}${o.name}${o.price?` +${money(o.price)}`:''}</button>`).join('')}</div></div>`).join('');
  $('#optionGroups').querySelectorAll('button').forEach(b => b.onclick = () => { selections[+b.dataset.group] = +b.dataset.option; renderStudio(); });

  const opts = selectedOptions();
  const price = selected.price + opts.reduce((a,o) => a + (+o.price||0), 0);
  const color = opts.find(o => o.hex)?.hex || 'transparent';
  const replacement = opts.find(o => o.image)?.image;

  $('#selectedPrice').textContent = money(price);
  $('#addPrice').textContent = money(price);
  $('#previewImage').src = replacement || selected.image;
  $('#previewImage').alt = selected.name + ' preview';

  const img = $('#previewImage');
  $('#previewTint').style.background = 'transparent';
  $('#previewTint').style.opacity = '0';

  if(color === 'transparent'){
    if(img) img.style.filter = 'none';
  } else {
    // Brown leather base = roughly hue 25deg, sepia(1) gives ~37deg
    // We need to rotate FROM that base TO target hue
    const r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
    const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
    let targetHue = 0;
    if(d !== 0){
      if(max === r) targetHue = ((g-b)/d) % 6;
      else if(max === g) targetHue = (b-r)/d + 2;
      else targetHue = (r-g)/d + 4;
      targetHue = Math.round(targetHue * 60);
      if(targetHue < 0) targetHue += 360;
    }
    // sepia() produces hue ~37deg. Rotate from 37 to target.
    const rotate = targetHue - 37;
    // Saturation: grey/black = low, vivid = high
    const sat = d === 0 ? 0 : Math.round((d/max) * 180);
    // Brightness: dark colors need less brightness
    const lum = (r*0.299 + g*0.587 + b*0.114) / 255;
    const bri = Math.max(0.3, Math.min(1.1, lum*1.4));
    // Black/very dark: just desaturate + darken, no hue rotate needed
    if(lum < 0.12){
      if(img) img.style.filter = `grayscale(1) brightness(${(lum*3).toFixed(2)}) contrast(1.1)`;
    } else if(d/max < 0.15){
      // Near grey/neutral: sepia + slight rotate + low sat
      if(img) img.style.filter = `sepia(1) hue-rotate(${rotate}deg) saturate(0.4) brightness(${bri.toFixed(2)})`;
    } else {
      // Full color leather
      if(img) img.style.filter = `sepia(1) hue-rotate(${rotate}deg) saturate(${(sat/60).toFixed(2)}) brightness(${bri.toFixed(2)})`;
    }
  }
}

function renderCart(){
  const box = $('#cartItems');
  if(!box) return;
  $('#cartCount').textContent = String(cart.length).padStart(2,'0');
  const modalCount = $('#cartModalCount');
  if(modalCount) modalCount.textContent = `(${cart.length})`;
  const headCount = $('#cartHeadCount');
  if(headCount) headCount.textContent = cart.length ? `${cart.length} item${cart.length===1?'':'s'} in your bag` : '';
  const footer = $('#cartFooter');
  if(footer) footer.style.display = cart.length ? 'block' : 'none';
  box.innerHTML = cart.length ? cart.map((i,n) => `<div class="cart-row"><img src="${i.image}" alt="${i.name}" width="64" height="72" style="object-fit:cover"><div class="cart-row-body"><div class="cart-row-top"><strong>${i.name}</strong><button class="close" data-remove="${n}">×</button></div><small>${(i.options||[]).filter(o=>!/^Qty:/.test(o)).join(' · ')||'Standard finish'}</small><br><small>${money(i.price)}</small>${i.qty>1?`<span class="cart-qty-tag">Qty ${i.qty}</span>`:''}</div></div>`).join('') : `<div class="cart-empty"><span class="cart-empty-icon">🛍</span><strong>A little space for good things.</strong><p>Your bag is waiting for its first considered object.</p><a class="button dark" href="#collection" data-close-cart>Browse the edit</a></div>`;
  cart.forEach((_,n) => box.querySelector(`[data-remove="${n}"]`)?.addEventListener('click', () => { cart.splice(n,1); saveCart(); }));
  box.querySelector('[data-close-cart]')?.addEventListener('click', closeCart);
  $('#cartTotal').textContent = money(cart.reduce((a,i) => a + i.price, 0));
}

function saveCart(){
  saveCartData(cart);
  renderCart();
}

function openCart(){ renderCart(); $('#cartDrawer').classList.add('open'); $('#backdrop').classList.add('open'); }
function closeCart(){ $('#cartDrawer').classList.remove('open'); $('#backdrop').classList.remove('open'); }

function addCurrent(){
  const opts = selectedOptions();
  cart.push({
    name: selected.name,
    image: selected.image,
    price: selected.price + opts.reduce((a,o) => a + (+o.price||0), 0),
    options: opts.map(o => o.name)
  });
  saveCart();
  bumpCartBadge();
}

// Adds the plain (un-customized) product-detail-page item to the cart,
// respecting the quantity the user picked there.
function addPdToCart(){
  if(!pdProduct) return;
  cart.push({
    name: pdProduct.name,
    image: pdProduct.image,
    price: pdProduct.price * pdQty,
    options: [`Qty: ${pdQty}`],
    qty: pdQty
  });
  saveCart();
  bumpCartBadge();
}

function bumpCartBadge(){
  const badge = $('#cartCount');
  if(!badge) return;
  badge.classList.remove('bump');
  void badge.offsetWidth;
  badge.classList.add('bump');
}

function showToast(msg){
  const t = $('#toast');
  if(!t) return;
  t.innerHTML = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function openCheckout(){
  if(!cart.length) return alert('Your cart is empty.');
  const user = getCurrentUser();
  if(!user){
    closeCart();
    pendingCheckoutAfterAuth = true;
    openAuthModal('signup');
    return;
  }
  closeCart();
  $('#customerName').value = user.name || '';
  $('#customerPhone').value = user.phone || '';
  $('#customerAddress').value = user.address || '';
  $('#customerPostal').value = user.postal || '';
  $('#checkoutModal').classList.add('open');
  $('#backdrop').classList.add('open');
}
function closeCheckout(){ $('#checkoutModal').classList.remove('open'); $('#backdrop').classList.remove('open'); }

function renderMyOrders(){
  const box = $('#myOrdersList');
  if(!box) return;
  const user = getCurrentUser();
  const mine = user ? orders.filter(o => o.customerEmail === user.email) : [];
  if(!mine.length){
    box.innerHTML = `<div class="no-orders-msg">
      <span class="no-orders-icon">🛍</span>
      <strong>Koi order nahi abhi tak</strong>
      <p>Collection se apna piece choose karo<br>aur customize karke order karo.</p>
    </div>`;
    return;
  }
  const statusDot = {'Pending acceptance':'⏳','Accepted':'✅','Shipped':'🚚','Delivered':'📦','Cancelled':'❌'};
  box.innerHTML = [...mine].reverse().map(o => {
    const sc = statusColor(o.status);
    const date = new Date(o.createdAt).toLocaleDateString('en-PK', {day:'numeric',month:'short',year:'numeric'});
    return `<div class="my-order-card status-${sc}">
      <div class="my-order-card-accent"></div>
      <div class="my-order-card-inner">
        <div class="my-order-card-head">
          <div>
            <div class="my-order-id">${o.id}</div>
            <div class="my-order-date">${date} · ${o.payment||'COD'}</div>
          </div>
          <div class="my-order-status-badge">${statusDot[o.status]||'⏳'} ${o.status}</div>
        </div>
        <div class="my-order-divider"></div>
        <div class="my-order-items-list">
          ${o.items.map(i => `<div class="my-order-item-row"><span class="my-order-item-name">${i.name}${i.options?.length?' <span style="opacity:.6;font-size:10px;">('+i.options.join(', ')+')</span>':''}</span><span class="my-order-item-price">${money(i.price)}</span></div>`).join('')}
        </div>
        <div class="my-order-total-row">
          <span class="my-order-total-label">Total</span>
          <span class="my-order-total-amount">${money(o.total)}</span>
        </div>
        ${o.eta||o.adminNote?`<div class="my-order-info-row">${o.eta?`📦 <span>Expected: ${o.eta}</span>`:''}${o.eta&&o.adminNote?' · ':''}${o.adminNote?`📝 <span>${o.adminNote}</span>`:''}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  renderCart();
  updateAuthUI();
  wireAuthModal();

  // Light / dark theme toggle — persisted, applied instantly on load (see
  // the tiny inline script right after <body>) to avoid a flash of the
  // wrong theme.
  function syncThemeIcon(){
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    $('#themeIconMoon').style.display = isDark ? 'none' : 'block';
    $('#themeIconSun').style.display = isDark ? 'block' : 'none';
  }
  syncThemeIcon();
  $('#themeToggle')?.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if(isDark){ document.documentElement.removeAttribute('data-theme'); localStorage.setItem('afs-theme','light'); }
    else { document.documentElement.setAttribute('data-theme','dark'); localStorage.setItem('afs-theme','dark'); }
    syncThemeIcon();
  });

  // Close the account dropdown on any outside click (delegated once,
  // so re-rendering the account menu on login/logout never stacks listeners)
  document.addEventListener('click', e => {
    const wrap = $('#accountWrap');
    if(wrap && !wrap.contains(e.target)) wrap.classList.remove('open');
  });

  // Products load live from Firebase — keeps working across every device.
  // Runs immediately with whatever's in the database, then again any time
  // the admin panel changes something, anywhere. Drives both the
  // storefront AND the admin panel (same shared `products` array).
  watchProducts(list => {
    const prevId = selected?.id;
    const prevAdminId = adminSelected?.id;
    products = list;
    selected = products.find(p => p.id === prevId) || products[0] || null;
    adminSelected = products.find(p => p.id === prevAdminId) || products[0] || null;
    renderProducts();
    renderStudio();
    renderHeroArches();
    if(typeof safeRenderAdmin === 'function') safeRenderAdmin();
  });

  // Hero gallery images — admin-managed, live across every device
  watchHeroImages(list => {
    heroImages = list;
    renderHeroArches();
    if(typeof safeRenderAdminHero === 'function') safeRenderAdminHero();
  });
  $('#heroPrev')?.addEventListener('click', () => $('#heroArches').scrollBy({ left: -260, behavior: 'smooth' }));
  $('#heroNext')?.addEventListener('click', () => $('#heroArches').scrollBy({ left: 260, behavior: 'smooth' }));

  // Orders load live from Firebase too — keeps "My Orders", order
  // tracking, and the admin Orders tab all in sync automatically.
  watchOrders(list => {
    orders = list;
    if($('#myOrdersDrawer')?.classList.contains('open')) renderMyOrders();
    if(typeof safeRenderAdminOrders === 'function') safeRenderAdminOrders();
  });

  // My Orders nav — needs an account, so a guest gets the login/signup prompt instead
  $('#myOrdersNav')?.addEventListener('click', e => {
    e.preventDefault();
    if(!getCurrentUser()){ openAuthModal('login'); return; }
    renderMyOrders();
    $('#myOrdersDrawer').classList.add('open');
    $('#backdrop').classList.add('open');
  });
  $('#closeMyOrders')?.addEventListener('click', () => { $('#myOrdersDrawer').classList.remove('open'); $('#backdrop').classList.remove('open'); });

  // Track order — popup, opened from the header nav/icon or the account dropdown
  $('#trackOrderNav')?.addEventListener('click', e => { e.preventDefault(); openTrackModal(); });
  $('#trackOrderIcon')?.addEventListener('click', openTrackModal);
  document.querySelector('[data-close-track]')?.addEventListener('click', closeTrackModal);

  document.querySelectorAll('[data-open-cart]').forEach(b => b.onclick = openCart);
  document.querySelectorAll('[data-close-cart]').forEach(b => b.onclick = closeCart);
  $('#backdrop')?.addEventListener('click', () => { closeCart(); closeCheckout(); closeAuthModal(); closeChangePasswordModal(); closeTrackModal(); });
  $('#changePasswordForm')?.addEventListener('submit', handleChangePassword);
  document.querySelector('[data-close-changepw]')?.addEventListener('click', closeChangePasswordModal);

  // Customize page (studio): Add to cart -> straight to the checkout/place-order step
  $('#addToCart')?.addEventListener('click', () => {
    addCurrent();
    showToast(`<b>${selected.name}</b> added to your cart.`);
    closeCustomizePage();
    openCheckout();
  });
  $('#closeCustomize')?.addEventListener('click', () => closeCustomizePage());
  $('#closeCustomizeX')?.addEventListener('click', () => closeCustomizePage());

  $('#checkout')?.addEventListener('click', openCheckout);
  document.querySelector('[data-close-checkout]')?.addEventListener('click', closeCheckout);

  // Search bar — typing "belt" only shows belts, "wallet" only wallets, etc.
  $('#productSearch')?.addEventListener('input', e => {
    searchTerm = e.target.value;
    renderProducts();
  });

  // Product Detail Page wiring
  $('#closeProductDetail')?.addEventListener('click', closeProductDetail);
  $('#closeProductDetailX')?.addEventListener('click', closeProductDetail);
  $('#pdQtyMinus')?.addEventListener('click', () => { if(pdQty > 1) pdQty--; updatePdPrice(); });
  $('#pdQtyPlus')?.addEventListener('click', () => { pdQty++; updatePdPrice(); });
  $('#pdAddToCart')?.addEventListener('click', () => {
    addPdToCart();
    showToast(`<b>${pdProduct.name}</b> × ${pdQty} added to your cart.`);
    closeProductDetail();
    openCheckout();
  });
  $('#pdCustomize')?.addEventListener('click', () => openCustomizePage(pdProduct));

  // Nav "Studio" link now opens the customize page for the currently
  // selected (or first) product, instead of scrolling to a section.
  document.querySelectorAll('a[href="#studio"]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    openCustomizePage(selected || products[0]);
  }));

  // Safety net: any other in-page navigation (logo, Collections, Track order,
  // My Orders, footer links) always closes an open full-page overlay first,
  // so a customize/product page can never linger over the storefront.
  function closeAllOverlayPages(){ closeProductDetail(); closeCustomizePage(); }
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    if(a.getAttribute('href') === '#studio') return;
    a.addEventListener('click', closeAllOverlayPages);
  });

  // Esc closes whichever full-page overlay is open
  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    if($('#productDetail')?.classList.contains('open')) closeProductDetail();
    if($('#studio')?.classList.contains('open')) closeCustomizePage();
  });

  $('#checkoutForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const order = {
      id: `AFS-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
      status: 'Pending acceptance',
      customerEmail: getCurrentUser()?.email || null,
      customer: {
        name: $('#customerName').value.trim(),
        phone: $('#customerPhone').value.trim(),
        address: $('#customerAddress').value.trim(),
        postal: $('#customerPostal').value.trim()
      },
      payment: $('#payment').value,
      items: cart,
      total: cart.reduce((a,i) => a + i.price, 0),
      createdAt: new Date().toISOString()
    };
    orders.push(order);
    saveOrders(orders).catch(() => alert('Order save nahi ho saka — internet check karo.'));
    cart = []; saveCart(); closeCheckout();
    showTrackResult(order.id);
    openTrackModal();
    showToast(`Order <b>${order.id}</b> placed! We'll review it shortly.`);
  });

  function showTrackResult(id){
    const order = orders.find(o => o.id.toLowerCase() === id.trim().toLowerCase());
    const box = $('#trackResult');
    $('#trackId').value = id;
    box.style.display = 'block';
    const defaultEl = $('#trackDefault');
    if(defaultEl) defaultEl.style.display = 'none';
    if(!order){
      box.className = 'track-result-card error';
      box.innerHTML = `<div class="track-error-msg">❌ Order <b>${id}</b> nahi mila. ID check karke dobara try karo.</div>`;
      return;
    }
    const statusDot = {'Pending acceptance':'⏳','Accepted':'✅','Shipped':'🚚','Delivered':'📦','Cancelled':'❌'};
    const sc = statusColor(order.status);
    box.className = 'track-result-card';
    box.innerHTML = `
      <div class="track-result-id">${order.id}</div>
      <div class="my-order-status-badge status-${sc}" style="margin-bottom:14px;">${statusDot[order.status]||'⏳'} ${order.status}</div>
      <div class="track-result-row">🛍 <span>${order.items.map(i => i.name).join(', ')}</span></div>
      <div class="track-result-row">💰 <span>${money(order.total)}</span></div>
      <div class="track-result-row">💳 <span>${order.payment||'COD'}</span></div>
      ${order.eta?`<div class="track-result-row">📦 <span>Expected: ${order.eta}</span></div>`:''}
      ${order.adminNote?`<div class="track-result-row">📝 <span>${order.adminNote}</span></div>`:''}
    `;
  }

  $('#trackForm')?.addEventListener('submit', e => {
    e.preventDefault();
    showTrackResult($('#trackId').value.trim());
  });

  // Admin — 5 clicks on AFS mark → password modal → opens the admin panel
  // on this same page (see admin.js for renderAdmin/renderAdminOrders).
  let clicks = 0, timer;
  const trigger = $('#adminTrigger');
  trigger?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    clicks++;
    clearTimeout(timer);
    timer = setTimeout(() => clicks = 0, 2200);
    if(clicks >= 5){ clicks = 0; openPwModal(); }
  });

  function openPwModal(){
    $('#pwInput').value = '';
    $('#pwError').textContent = '';
    $('#pwModal').classList.add('open');
    setTimeout(() => $('#pwInput').focus(), 100);
  }
  function closePwModal(){ $('#pwModal').classList.remove('open'); }
  function checkPassword(){
    const val = $('#pwInput').value.trim();
    if(val === 'FASHAY'){
      closePwModal();
      unlockAdminPanel();
    } else {
      $('#pwError').textContent = 'Galat password. Dobara try karo.';
      $('#pwInput').value = '';
      $('#pwInput').focus();
    }
  }
  $('#pwSubmit')?.addEventListener('click', checkPassword);
  $('#pwInput')?.addEventListener('keydown', e => { if(e.key==='Enter') checkPassword(); if(e.key==='Escape') closePwModal(); });
  $('#pwCancel')?.addEventListener('click', closePwModal);
  $('#pwModal')?.addEventListener('click', e => { if(e.target === $('#pwModal')) closePwModal(); });

  if(typeof wireAdminPanel === 'function') wireAdminPanel();
});

