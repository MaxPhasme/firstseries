(function () {
  const AUTH_PAGE = !document.body.dataset.requiresAuth;
  let adminToken = localStorage.getItem('admin_token');

  function redirigerVersApp() {
    if (location.pathname.endsWith('/index.html') || location.pathname === '/') {
      location.replace('/app.html');
    }
  }

  function afficherCompte() {
    const menu = document.getElementById('user-menu');
    if (!menu || !adminToken) return;
    menu.hidden = false;
    const avatar = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    if (avatar) avatar.textContent = 'A';
    if (nameEl) nameEl.textContent = 'Admin';
  }

  async function initProtectedPage() {
    if (!adminToken) {
      location.replace('/index.html');
      return;
    }
    document.documentElement.classList.add('auth-ready');
    afficherCompte();
  }

  async function login(motDePasse) {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motDePasse })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.erreur || 'Erreur de connexion');
    }

    adminToken = data.token;
    localStorage.setItem('admin_token', adminToken);
  }

  function getAuthHeaders() {
    return adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {};
  }

  function bindAuthPage() {
    const loginForm = document.getElementById('login-form');
    const errorEl = document.getElementById('login-error');

    loginForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorEl.textContent = '';
      try {
        const password = document.getElementById('login-password').value;
        await login(password);
        redirigerVersApp();
      } catch (error) {
        errorEl.textContent = error.message || 'Une erreur est survenue';
      }
    });
  }

  async function bindUserMenu() {
    const button = document.getElementById('user-menu-button');
    const panel = document.getElementById('user-menu-panel');
    const logout = document.getElementById('logout-button');

    button?.addEventListener('click', () => {
      const open = !panel.hidden;
      panel.hidden = open;
      button.setAttribute('aria-expanded', String(!open));
    });

    logout?.addEventListener('click', () => {
      localStorage.removeItem('admin_token');
      adminToken = null;
      location.replace('/index.html');
    });
  }

  window.getAdminAuthHeaders = getAuthHeaders;

  document.addEventListener('DOMContentLoaded', async () => {
    if (AUTH_PAGE) {
      if (adminToken) {
        redirigerVersApp();
      } else {
        bindAuthPage();
      }
    } else {
      await initProtectedPage();
      await bindUserMenu();
    }
  });
})();
