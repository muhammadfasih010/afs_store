/* ============================================================
   api.js
   The only outside network API this project talks to: Cloudinary,
   used by the admin panel to upload product / option images.
   ============================================================ */

async function uploadToCloudinary(file, statusEl, onSuccess){
  if(!file) return;
  statusEl.textContent = 'Uploading...';
  statusEl.style.color = 'var(--gold)';
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', 'Imagee');
  fd.append('api_key', 'V2ZzYvfWumKsgoDhS9ITW6QMcVY');
  try{
    const res = await fetch('https://api.cloudinary.com/v1_1/j8ilvbr9/image/upload', { method:'POST', body:fd });
    const data = await res.json();
    if(data.secure_url){
      onSuccess(data.secure_url);
      statusEl.textContent = '✓ Upload ho gaya!';
      statusEl.style.color = '#a9d0aa';
      setTimeout(() => statusEl.textContent = '', 3000);
    } else {
      statusEl.textContent = 'Error: ' + (data.error?.message || 'Try again');
      statusEl.style.color = '#b76d5d';
    }
  } catch(e){
    statusEl.textContent = 'Upload fail hua. Internet check karo.';
    statusEl.style.color = '#b76d5d';
  }
}

/* ============================================================
   auth.js
   Customer accounts: signup, login, forgot-password (email OTP),
   and keeping the logged-in state on this device.
   Depends on: config.js, storage.js (must load before this).
   ============================================================ */

let pendingCheckoutAfterAuth = false;
let fpEmailForReset = '';

// ---- Session (this device only — "don't sign up again here") ----
function getCurrentUser(){
  const raw = localStorage.getItem('afs-current-user');
  return raw ? JSON.parse(raw) : null;
}
function setCurrentUser(user){
  localStorage.setItem('afs-current-user', JSON.stringify(user));
}
function clearCurrentUser(){
  localStorage.removeItem('afs-current-user');
}

function initialsFromName(name){
  const words = (name||'').trim().split(/\s+/).filter(Boolean);
  if(words.length === 0) return '?';
  if(words.length === 1) return words[0].slice(0,2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function updateAuthUI(){
  const area = $('#authArea');
  if(!area) return;
  const user = getCurrentUser();
  if(user){
    area.innerHTML = `
      <div class="account-wrap" id="accountWrap">
        <button class="avatar-btn" id="avatarBtn" type="button">
          <span class="avatar-circle">${initialsFromName(user.name)}</span>
          <span class="avatar-name">${(user.name||'').split(' ')[0]||'Account'}</span>
          <span class="avatar-caret">▾</span>
        </button>
        <div class="account-dropdown">
          <div class="account-dropdown-head"><strong>${user.name||'Your account'}</strong><small>${user.email||''}</small></div>
          <button type="button" id="ddMyOrders">📦 My Orders</button>
          <button type="button" id="ddTrackOrder">🔍 Track order</button>
          <button type="button" id="ddChangePassword">🔒 Change password</button>
          <button type="button" class="danger" id="ddLogout">↪ Logout</button>
        </div>
      </div>`;
    const wrap = $('#accountWrap');
    $('#avatarBtn').onclick = (e) => { e.stopPropagation(); wrap.classList.toggle('open'); };
    $('#ddMyOrders').onclick = () => {
      wrap.classList.remove('open');
      renderMyOrders();
      $('#myOrdersDrawer').classList.add('open');
      $('#backdrop').classList.add('open');
    };
    $('#ddTrackOrder').onclick = () => {
      wrap.classList.remove('open');
      openTrackModal();
    };
    $('#ddChangePassword').onclick = () => {
      wrap.classList.remove('open');
      openChangePasswordModal();
    };
    $('#ddLogout').onclick = () => {
      wrap.classList.remove('open');
      clearCurrentUser();
      updateAuthUI();
      showToast('You have been logged out.');
    };
  } else {
    area.innerHTML = `<button class="auth-open-btn" id="openAuthBtn">Sign in / Sign up</button>`;
    $('#openAuthBtn').onclick = () => openAuthModal('login');
  }
}

// ---- Track order popup ----
function openTrackModal(){
  $('#trackModal').classList.add('open');
  $('#backdrop').classList.add('open');
}
function closeTrackModal(){
  $('#trackModal').classList.remove('open');
  $('#backdrop').classList.remove('open');
}

// ---- Change password (requires the current password, updates the Firebase user record) ----
function openChangePasswordModal(){
  const user = getCurrentUser();
  if(!user) return;
  $('#cpCurrent').value = '';
  $('#cpNew').value = '';
  $('#cpConfirm').value = '';
  $('#cpError').textContent = '';
  $('#changePasswordModal').classList.add('open');
  $('#backdrop').classList.add('open');
}
function closeChangePasswordModal(){
  $('#changePasswordModal').classList.remove('open');
  $('#backdrop').classList.remove('open');
}
async function handleChangePassword(e){
  e.preventDefault();
  const user = getCurrentUser();
  const errEl = $('#cpError');
  if(!user){ errEl.textContent = 'Please login again.'; return; }
  const current = $('#cpCurrent').value;
  const next = $('#cpNew').value;
  const confirm = $('#cpConfirm').value;
  if(next.length < 6){ errEl.textContent = 'New password must be at least 6 characters.'; return; }
  if(next !== confirm){ errEl.textContent = 'Passwords do not match.'; return; }

  const submitBtn = $('#changePasswordForm button[type=submit]');
  if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Please wait...'; }
  try{
    const record = await getUserByEmail(user.email);
    if(!record){ errEl.textContent = 'Account not found.'; return; }
    const currentHash = await hashPassword(current, record.salt);
    if(currentHash !== record.passwordHash){ errEl.textContent = 'Current password is incorrect.'; return; }
    const salt = randomSalt();
    const passwordHash = await hashPassword(next, salt);
    await updateUserFields(user.email, { passwordHash, salt });
    closeChangePasswordModal();
    showToast('Password updated successfully.');
  } catch(err){
    console.error('Change password error:', err);
    errEl.textContent = 'Something went wrong. Please try again.';
  } finally {
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Update password →'; }
  }
}

// ---- Modal open/close + tab & step switching ----
function openAuthModal(tab){
  clearAuthErrors();
  $('#authModal')?.classList.add('open');
  $('#backdrop')?.classList.add('open');
  switchAuthTab(tab || 'login');
}
function closeAuthModal(){
  $('#authModal')?.classList.remove('open');
  $('#backdrop')?.classList.remove('open');
  pendingCheckoutAfterAuth = false;
}
function clearAuthErrors(){
  ['loginError','signupError','fpStep1Error','fpStep2Error'].forEach(id => { const el = document.getElementById(id); if(el) el.textContent=''; });
}
function switchAuthTab(tab){
  clearAuthErrors();
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.authTab === tab));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  if(tab === 'login') $('#loginForm')?.classList.add('active');
  if(tab === 'signup') $('#signupForm')?.classList.add('active');
}
function showForgotStep1(){
  clearAuthErrors();
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  $('#forgotStep1Form')?.classList.add('active');
}
function showForgotStep2(){
  clearAuthErrors();
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  $('#forgotStep2Form')?.classList.add('active');
}

// ---- Validation helpers ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0\d{10}$/;
const POSTAL_RE = /^\d{4,6}$/;

// ---- Signup ----
// Pending signup data stored here while OTP is being verified
let pendingSignupData = null;

async function handleSignup(e){
  e.preventDefault();
  const name = $('#signupName').value.trim();
  const email = $('#signupEmail').value.trim().toLowerCase();
  const phone = $('#signupPhone').value.trim();
  const citySel = $('#signupCity').value;
  const city = citySel === 'Other' ? $('#signupCityOther').value.trim() : citySel;
  const address = $('#signupAddress').value.trim();
  const postal = $('#signupPostal').value.trim();
  const password = $('#signupPassword').value;
  const confirm = $('#signupConfirmPassword').value;
  const errEl = $('#signupError');

  if(!name || !email || !phone || !city || !address || !postal || !password){ errEl.textContent = 'Sab fields fill karo.'; return; }
  if(!EMAIL_RE.test(email)){ errEl.textContent = 'Email sahi format mein daalo.'; return; }
  if(!PHONE_RE.test(phone)){ errEl.textContent = 'Phone number bilkul 11 digits ka hona chahiye, e.g. 03001234567. Kam ya zyada numbers nahi chalenge.'; return; }
  if(!POSTAL_RE.test(postal)){ errEl.textContent = 'Postal code sahi daalo (4-6 digits).'; return; }
  if(password.length < 6){ errEl.textContent = 'Password kam se kam 6 characters ka ho.'; return; }
  if(password !== confirm){ errEl.textContent = 'Password match nahi ho raha.'; return; }

  const submitBtn = $('#signupForm button[type=submit]');
  if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Please wait...'; }
  try{
    const existing = await getUserByEmail(email);
    if(existing){ errEl.textContent = 'Ye email pehle se registered hai. Login karo.'; return; }

    // Generate and send OTP
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await saveOtp(email, code);
    await sendOtpEmail(email, name, code);

    // Save pending signup data to complete after OTP verify
    const salt = randomSalt();
    const passwordHash = await hashPassword(password, salt);
    pendingSignupData = { name, email, phone, address, city, postal, salt, passwordHash };

    // Show OTP verification panel
    showSignupOtpStep(email);
  } catch(err){
    console.error('Signup error:', err);
    const detail = err?.text || err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
    errEl.textContent = 'Signup nahi ho saka: ' + detail;
  } finally {
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Sign Up →'; }
  }
}

function showSignupOtpStep(email){
  clearAuthErrors();
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  const panel = $('#signupOtpForm');
  if(panel){
    panel.classList.add('active');
    const hint = panel.querySelector('.signup-otp-hint');
    if(hint) hint.textContent = `OTP bheja gaya: ${email}`;
  }
}

async function handleSignupOtp(e){
  e.preventDefault();
  const errEl = $('#signupOtpError');
  if(!pendingSignupData){ errEl.textContent = 'Session expire ho gaya. Dobara signup karo.'; return; }
  const entered = $('#signupOtpInput').value.trim();
  const { email } = pendingSignupData;

  const submitBtn = $('#signupOtpForm button[type=submit]');
  if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Verifying...'; }
  try{
    const record = await getOtp(email);
    if(!record){ errEl.textContent = 'OTP nahi mila. Dobara signup karo.'; return; }
    if(Date.now() > record.expiresAt){ errEl.textContent = 'OTP expire ho gaya. Dobara signup karo.'; clearOtp(email); return; }
    if(record.code !== entered){ errEl.textContent = 'OTP galat hai. Dobara check karo.'; return; }

    // OTP correct — create account
    await clearOtp(email);
    const { name, phone, address, city, postal, salt, passwordHash } = pendingSignupData;
    const user = { name, email, phone, address, city, postal, salt, passwordHash, createdAt: new Date().toISOString() };
    await saveUser(user);
    setCurrentUser({ name, email, phone, address, city, postal });
    pendingSignupData = null;
    updateAuthUI();
    const shouldContinueToCheckout = pendingCheckoutAfterAuth;
    closeAuthModal();
    if(shouldContinueToCheckout) openCheckout();
  } catch(err){
    console.error('Signup OTP error:', err);
    errEl.textContent = 'Verification nahi ho saka. Dobara try karo.';
  } finally {
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Verify & Sign Up →'; }
  }
}

// ---- Login ----
async function handleLogin(e){
  e.preventDefault();
  const email = $('#loginEmail').value.trim().toLowerCase();
  const password = $('#loginPassword').value;
  const errEl = $('#loginError');
  if(!email || !password){ errEl.textContent = 'Email aur password dono daalo.'; return; }

  const submitBtn = $('#loginForm button[type=submit]');
  if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Please wait...'; }
  try{
    const user = await getUserByEmail(email);
    if(!user){ errEl.textContent = 'Account nahi mila. Sign up karo.'; return; }
    const hash = await hashPassword(password, user.salt);
    if(hash !== user.passwordHash){ errEl.textContent = 'Email ya password galat hai.'; return; }
    setCurrentUser({ name:user.name, email:user.email, phone:user.phone, address:user.address, city:user.city, postal:user.postal });
    updateAuthUI();
    const shouldContinueToCheckout = pendingCheckoutAfterAuth;
    closeAuthModal();
    if(shouldContinueToCheckout) openCheckout();
  } catch(err){
    console.error('Login error:', err);
    const detail = err?.text || err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
    errEl.textContent = 'Login nahi ho saka: ' + detail;
  } finally {
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Login →'; }
  }
}

// ---- Forgot password: step 1, send OTP ----
async function handleSendOtp(e){
  e.preventDefault();
  const email = $('#fpEmail').value.trim().toLowerCase();
  const errEl = $('#fpStep1Error');
  if(!EMAIL_RE.test(email)){ errEl.textContent = 'Email sahi format mein daalo.'; return; }

  const submitBtn = $('#forgotStep1Form button[type=submit]');
  if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }
  try{
    const user = await getUserByEmail(email);
    if(!user){ errEl.textContent = 'Ye email registered nahi hai.'; return; }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await saveOtp(email, code);
    await sendOtpEmail(email, user.name, code);
    fpEmailForReset = email;
    showForgotStep2();
  } catch(err){
    console.error('OTP send error:', err);
    const detail = err?.text || err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
    errEl.textContent = 'OTP email nahi bhej saka: ' + detail;
  } finally {
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Send OTP →'; }
  }
}

// ---- Forgot password: step 2, verify OTP + set new password ----
async function handleResetPassword(e){
  e.preventDefault();
  const enteredCode = $('#fpOtp').value.trim();
  const newPassword = $('#fpNewPassword').value;
  const confirm = $('#fpConfirmPassword').value;
  const errEl = $('#fpStep2Error');
  if(newPassword.length < 6){ errEl.textContent = 'Password kam se kam 6 characters ka ho.'; return; }
  if(newPassword !== confirm){ errEl.textContent = 'Password match nahi ho raha.'; return; }

  const submitBtn = $('#forgotStep2Form button[type=submit]');
  if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Please wait...'; }
  try{
    const otpRecord = await getOtp(fpEmailForReset);
    if(!otpRecord || otpRecord.code !== enteredCode){ errEl.textContent = 'OTP galat hai.'; return; }
    if(Date.now() > otpRecord.expiresAt){ errEl.textContent = 'OTP expire ho gaya. Dobara bhejo.'; return; }
    const salt = randomSalt();
    const passwordHash = await hashPassword(newPassword, salt);
    await updateUserFields(fpEmailForReset, { passwordHash, salt });
    await clearOtp(fpEmailForReset);
    switchAuthTab('login');
    $('#loginEmail').value = fpEmailForReset;
    $('#loginError').textContent = 'Password change ho gaya — ab login karo.';
  } catch(err){
    console.error('Reset password error:', err);
    const detail = err?.text || err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
    errEl.textContent = 'Kuch ghalat ho gaya: ' + detail;
  } finally {
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Reset password →'; }
  }
}

function wireAuthModal(){
  document.querySelectorAll('.auth-tab').forEach(t => t.onclick = () => switchAuthTab(t.dataset.authTab));
  $('#loginForm')?.addEventListener('submit', handleLogin);
  $('#signupForm')?.addEventListener('submit', handleSignup);
  $('#signupOtpForm')?.addEventListener('submit', handleSignupOtp);
  $('#forgotStep1Form')?.addEventListener('submit', handleSendOtp);
  $('#forgotStep2Form')?.addEventListener('submit', handleResetPassword);
  $('#forgotPasswordLink')?.addEventListener('click', e => { e.preventDefault(); showForgotStep1(); });
  $('#backToLoginLink')?.addEventListener('click', e => { e.preventDefault(); switchAuthTab('login'); });
  document.querySelector('[data-close-auth]')?.addEventListener('click', closeAuthModal);
  $('#signupCity')?.addEventListener('change', () => {
    $('#signupCityOther').style.display = $('#signupCity').value === 'Other' ? 'block' : 'none';
  });
}

