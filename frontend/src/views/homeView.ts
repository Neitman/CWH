import { currentUser, fetchUserProfile, logoutUser } from '../api';
import { switchPage } from '../router';

export function initHomeView(showToast: (msg: string, type: 'info' | 'error' | 'success') => void) {
  const authModal = document.getElementById('auth-modal');
  const mainLoginBtn = document.getElementById('main-login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const closeAuthModalBtn = document.getElementById('close-auth-modal-btn');
  const tabLogin = document.getElementById('tab-login')!;
  const tabRegister = document.getElementById('tab-register')!;
  const loginForm = document.getElementById('login-form') as HTMLFormElement;
  const registerForm = document.getElementById('register-form') as HTMLFormElement;
  const forgotForm = document.getElementById('forgot-form') as HTMLFormElement;
  const otpView = document.getElementById('otp-view')!;
  
  const loginUsernameInput = document.getElementById('login-username') as HTMLInputElement;
  const loginPasswordInput = document.getElementById('login-password') as HTMLInputElement;
  const loginRememberMeInput = document.getElementById('login-remember-me') as HTMLInputElement;
  const loginErrorMsg = document.getElementById('login-error-msg')!;

  const registerUsernameInput = document.getElementById('register-username') as HTMLInputElement;
  const registerEmailInput = document.getElementById('register-email') as HTMLInputElement;
  const registerPasswordInput = document.getElementById('register-password') as HTMLInputElement;
  const registerErrorMsg = document.getElementById('register-error-msg')!;

  const forgotEmailInput = document.getElementById('forgot-email') as HTMLInputElement;
  const forgotErrorMsg = document.getElementById('forgot-error-msg')!;
  const forgotPasswordLink = document.getElementById('forgot-password-link');
  const backToLoginLink = document.getElementById('back-to-login-link');

  const otpCodeInput = document.getElementById('otp-code-input') as HTMLInputElement;
  const otpNewPasswordInput = document.getElementById('otp-new-password') as HTMLInputElement;
  const otpNewPasswordGroup = document.getElementById('otp-new-password-group')!;
  const otpErrorMsg = document.getElementById('otp-error-msg')!;
  const otpSubmitBtn = document.getElementById('otp-submit-btn') as HTMLButtonElement;
  const otpCancelLink = document.getElementById('otp-cancel-link');

  let otpFlowType: 'register' | 'reset' = 'register';
  let otpFlowEmail = '';

  const showAuthModal = () => {
    if (authModal) {
      authModal.classList.remove('hidden');
      authModal.setAttribute('style', 'display: flex !important;');
    }
    loginErrorMsg?.classList.add('hidden');
    registerErrorMsg?.classList.add('hidden');
    showOnlyForm('login');
  };

  const hideAuthModal = () => {
    if (authModal) {
      authModal.classList.add('hidden');
      authModal.setAttribute('style', 'display: none !important;');
    }
  };

  function showOnlyForm(formId: 'login' | 'register' | 'forgot' | 'otp') {
    loginForm.classList.add('hidden');
    registerForm.classList.add('hidden');
    forgotForm.classList.add('hidden');
    otpView.classList.add('hidden');
    
    const tabsContainer = document.querySelector('.modal-tabs')!;
    
    if (formId === 'login') {
      loginForm.classList.remove('hidden');
      tabsContainer.classList.remove('hidden');
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
    } else if (formId === 'register') {
      registerForm.classList.remove('hidden');
      tabsContainer.classList.remove('hidden');
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
    } else {
      tabsContainer.classList.add('hidden');
      if (formId === 'forgot') {
        forgotForm.classList.remove('hidden');
      } else if (formId === 'otp') {
        otpView.classList.remove('hidden');
      }
    }
  }

  mainLoginBtn?.addEventListener('click', showAuthModal);
  closeAuthModalBtn?.addEventListener('click', hideAuthModal);

  tabLogin?.addEventListener('click', () => showOnlyForm('login'));
  tabRegister?.addEventListener('click', () => showOnlyForm('register'));

  forgotPasswordLink?.addEventListener('click', (e) => {
    e.preventDefault();
    showOnlyForm('forgot');
  });

  backToLoginLink?.addEventListener('click', (e) => {
    e.preventDefault();
    showOnlyForm('login');
  });

  otpCancelLink?.addEventListener('click', (e) => {
    e.preventDefault();
    if (otpFlowType === 'register') {
      showOnlyForm('register');
    } else {
      showOnlyForm('forgot');
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    await logoutUser();
    updateAuthHeaderUI();
    switchPage('main');
  });

  // Login Form Submit
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorMsg.classList.add('hidden');

    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value;
    const rememberMe = loginRememberMeInput ? loginRememberMeInput.checked : false;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, rememberMe })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.accessToken || data.token);
        localStorage.removeItem('refreshToken');
        await fetchUserProfile();
        hideAuthModal();
        updateAuthHeaderUI();
        switchPage('profile');
        loginUsernameInput.value = '';
        loginPasswordInput.value = '';
      } else {
        loginErrorMsg.textContent = data.error || 'Login failed.';
        loginErrorMsg.classList.remove('hidden');
      }
    } catch (error) {
      loginErrorMsg.textContent = 'Server connection failed.';
      loginErrorMsg.classList.remove('hidden');
    }
  });

  // Register Form Submit
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerErrorMsg.classList.add('hidden');

    const username = registerUsernameInput.value.trim();
    const email = registerEmailInput.value.trim();
    const password = registerPasswordInput.value;

    try {
      const res = await fetch('/api/auth/register-send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      const data = await res.json();
      if (res.ok) {
        otpFlowType = 'register';
        otpFlowEmail = email;
        const otpTitle = document.getElementById('otp-title')!;
        const otpDesc = document.getElementById('otp-description')!;
        otpTitle.textContent = 'Email Verification';
        otpDesc.textContent = `Enter the 6-digit verification code sent to ${email}`;
        otpNewPasswordGroup.classList.add('hidden');
        otpCodeInput.value = '';
        otpSubmitBtn.textContent = 'Verify & Register';
        showOnlyForm('otp');
      } else {
        registerErrorMsg.textContent = data.error || 'Registration failed.';
        registerErrorMsg.classList.remove('hidden');
      }
    } catch (error) {
      registerErrorMsg.textContent = 'Server connection failed.';
      registerErrorMsg.classList.remove('hidden');
    }
  });

  // Forgot Password Submit
  forgotForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    forgotErrorMsg.classList.add('hidden');

    const email = forgotEmailInput.value.trim();

    try {
      const res = await fetch('/api/auth/forgot-password-send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await res.json();
      if (res.ok) {
        otpFlowType = 'reset';
        otpFlowEmail = email;
        const otpTitle = document.getElementById('otp-title')!;
        const otpDesc = document.getElementById('otp-description')!;
        otpTitle.textContent = 'Reset Password Verification';
        otpDesc.textContent = `Enter the 6-digit reset code sent to ${email}`;
        otpNewPasswordGroup.classList.remove('hidden');
        otpCodeInput.value = '';
        otpNewPasswordInput.value = '';
        otpSubmitBtn.textContent = 'Verify & Reset Password';
        showOnlyForm('otp');
      } else {
        forgotErrorMsg.textContent = data.error || 'Failed to send reset code.';
        forgotErrorMsg.classList.remove('hidden');
      }
    } catch (error) {
      forgotErrorMsg.textContent = 'Server connection failed.';
      forgotErrorMsg.classList.remove('hidden');
    }
  });

  // OTP Form Submit
  otpSubmitBtn?.addEventListener('click', async () => {
    otpErrorMsg.classList.add('hidden');
    const otp = otpCodeInput.value.trim();

    if (!otp || otp.length !== 6) {
      otpErrorMsg.textContent = 'Please enter a valid 6-digit code.';
      otpErrorMsg.classList.remove('hidden');
      return;
    }

    try {
      if (otpFlowType === 'register') {
        const res = await fetch('/api/auth/register-verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: otpFlowEmail, otp })
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem('token', data.accessToken || data.token);
          if (data.refreshToken) {
            localStorage.setItem('refreshToken', data.refreshToken);
          }
          await fetchUserProfile();
          hideAuthModal();
          updateAuthHeaderUI();
          switchPage('profile');
        } else {
          otpErrorMsg.textContent = data.error || 'Verification failed.';
          otpErrorMsg.classList.remove('hidden');
        }
      } else {
        const newPassword = otpNewPasswordInput.value;
        if (!newPassword || newPassword.length < 6) {
          otpErrorMsg.textContent = 'New password must be at least 6 characters.';
          otpErrorMsg.classList.remove('hidden');
          return;
        }

        const res = await fetch('/api/auth/reset-password-verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: otpFlowEmail, otp, newPassword })
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Password reset successfully! Please log in.', 'success');
          showOnlyForm('login');
        } else {
          otpErrorMsg.textContent = data.error || 'Password reset failed.';
          otpErrorMsg.classList.remove('hidden');
        }
      }
    } catch (error) {
      otpErrorMsg.textContent = 'Server connection failed.';
      otpErrorMsg.classList.remove('hidden');
    }
  });

  updateAuthHeaderUI();
}

export function updateAuthHeaderUI() {
  const openAuthBtn = document.getElementById('open-auth-btn')!;
  const userProfileSection = document.getElementById('user-profile-section')!;
  const headerAvatarImg = document.getElementById('header-avatar-img') as HTMLImageElement;
  const displayUsername = document.getElementById('display-username')!;

  if (currentUser) {
    openAuthBtn?.classList.add('hidden');
    userProfileSection?.classList.remove('hidden');
    const nameToShow = currentUser.display_name || currentUser.username;
    displayUsername.textContent = nameToShow;

    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameToShow)}&background=6366f1&color=fff`;
    if (headerAvatarImg) headerAvatarImg.src = currentUser.avatar_url || defaultAvatar;
  } else {
    openAuthBtn?.classList.remove('hidden');
    userProfileSection?.classList.add('hidden');
    displayUsername.textContent = '';
  }
}
