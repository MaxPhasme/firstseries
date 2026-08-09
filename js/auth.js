/* FirstSeries — Firebase Authentication */
(function () {
  const AUTH_PAGE = !document.body.dataset.requiresAuth;
  let auth = null;

  async function initFirebase() {
    if (auth) return auth;
    const response = await fetch('/api/firebase-config', { cache: 'no-store' });
    const config = await response.json();
    if (!response.ok || !config.apiKey || !config.projectId) {
      throw new Error(config.erreur || 'Configuration Firebase Web manquante.');
    }
    if (!firebase.apps.length) firebase.initializeApp(config);
    auth = firebase.auth();
    // La session est conservée même après fermeture de l'onglet / du navigateur.
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    return auth;
  }

  function messageErreur(error) {
    const map = {
      'auth/invalid-credential': 'Email ou mot de passe incorrect.',
      'auth/user-not-found': 'Aucun compte ne correspond à cet email.',
      'auth/wrong-password': 'Email ou mot de passe incorrect.',
      'auth/email-already-in-use': 'Un compte existe déjà avec cet email.',
      'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
      'auth/invalid-email': 'Adresse email invalide.',
      'auth/popup-closed-by-user': 'La fenêtre Google a été fermée.',
      'auth/network-request-failed': 'Erreur réseau. Vérifiez votre connexion.',
    };
    return map[error?.code] || error?.message || 'Une erreur est survenue.';
  }

  function redirigerVersApp() {
    if (location.pathname.endsWith('/index.html') || location.pathname === '/') {
      location.replace('/app.html');
    }
  }

  function afficherCompte(user) {
    const menu = document.getElementById('user-menu');
    if (!menu || !user) return;
    menu.hidden = false;
    const name = user.displayName || user.email?.split('@')[0] || 'Compte';
    const initials = name.trim().slice(0, 1).toUpperCase();
    const nameEl = document.getElementById('user-name');
    const avatar = document.getElementById('user-avatar');
    const email = document.getElementById('user-email');
    if (nameEl) nameEl.textContent = name;
    if (avatar) avatar.textContent = initials;
    if (email) email.textContent = user.email || '';
  }

  async function initProtectedPage() {
    try {
      const instance = await initFirebase();
      instance.onAuthStateChanged((user) => {
        if (!user) {
          location.replace('/index.html');
          return;
        }
        document.documentElement.classList.add('auth-ready');
        afficherCompte(user);
      });
    } catch (error) {
      console.error(error);
      document.body.innerHTML = '<main style="padding:40px;color:white;font-family:Arial">Configuration Firebase manquante. Ajoutez FIREBASE_WEB_API_KEY dans Render.</main>';
    }
  }

  async function login(email, password) {
    const instance = await initFirebase();
    await instance.signInWithEmailAndPassword(email, password);
    redirigerVersApp();
  }

  async function signup(name, email, password) {
    const instance = await initFirebase();
    const result = await instance.createUserWithEmailAndPassword(email, password);
    await result.user.updateProfile({ displayName: name });
    redirigerVersApp();
  }

  async function googleLogin() {
    const instance = await initFirebase();
    const provider = new firebase.auth.GoogleAuthProvider();
    await instance.signInWithPopup(provider);
    redirigerVersApp();
  }

  function bindAuthPage() {
    const loginCard = document.getElementById('login-card');
    const signupCard = document.getElementById('signup-card');
    const switchCards = (target) => {
      const showSignup = target === 'signup';
      loginCard.hidden = showSignup;
      signupCard.hidden = !showSignup;
      document.title = showSignup ? 'Créer un compte — FirstSeries' : 'Connexion — FirstSeries';
    };

    document.querySelectorAll('[data-show]').forEach((button) => {
      button.addEventListener('click', () => switchCards(button.dataset.show));
    });

    document.querySelectorAll('.password-toggle').forEach((button) => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.target);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
      });
    });

    document.getElementById('login-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorEl = document.getElementById('login-error');
      errorEl.textContent = '';
      try {
        await login(document.getElementById('login-email').value.trim(), document.getElementById('login-password').value);
      } catch (error) {
        errorEl.textContent = messageErreur(error);
      }
    });

    document.getElementById('signup-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorEl = document.getElementById('signup-error');
      errorEl.textContent = '';
      const password = document.getElementById('signup-password').value;
      const confirm = document.getElementById('signup-password-confirm').value;
      if (password !== confirm) {
        errorEl.textContent = 'Les deux mots de passe ne correspondent pas.';
        return;
      }
      try {
        await signup(document.getElementById('signup-name').value.trim(), document.getElementById('signup-email').value.trim(), password);
      } catch (error) {
        errorEl.textContent = messageErreur(error);
      }
    });

    ['google-login', 'google-signup'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', async () => {
        const errorEl = document.getElementById(id === 'google-login' ? 'login-error' : 'signup-error');
        errorEl.textContent = '';
        try { await googleLogin(); } catch (error) { errorEl.textContent = messageErreur(error); }
      });
    });

    document.getElementById('forgot-password')?.addEventListener('click', async () => {
      const email = document.getElementById('login-email').value.trim();
      const errorEl = document.getElementById('login-error');
      if (!email) { errorEl.textContent = 'Indiquez votre email avant de demander la réinitialisation.'; return; }
      try {
        const instance = await initFirebase();
        await instance.sendPasswordResetEmail(email);
        errorEl.textContent = 'Email de réinitialisation envoyé.';
      } catch (error) { errorEl.textContent = messageErreur(error); }
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
    logout?.addEventListener('click', async () => {
      try { await auth.signOut(); } finally { location.replace('/index.html'); }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (AUTH_PAGE) {
      try {
        const instance = await initFirebase();
        instance.onAuthStateChanged((user) => { if (user) redirigerVersApp(); });
        bindAuthPage();
      } catch (error) {
        console.error(error);
        const errors = document.querySelectorAll('.auth-error');
        errors.forEach((el) => { el.textContent = 'Firebase n’est pas encore configuré sur le serveur.'; });
        bindAuthPage();
      }
    } else {
      await initProtectedPage();
      await bindUserMenu();
    }
  });
})();
