/* ============================================================================
 * supabase.js — Cliente Supabase + autenticación
 * Inicializa el cliente y expone helpers de sesión/login usados por app.js.
 * ==========================================================================*/
window.App = window.App || {};

App.SB = (function () {
  const cfg = App.CONFIG || {};
  if (!window.supabase || !window.supabase.createClient) {
    console.error('No se cargó la librería de Supabase.');
    return null;
  }
  return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
})();

App.Auth = {
  async session() { const { data } = await App.SB.auth.getSession(); return data ? data.session : null; },
  async user() { const s = await this.session(); return s ? s.user : null; },
  async signIn(email, password) {
    const { data, error } = await App.SB.auth.signInWithPassword({ email: String(email).trim(), password });
    if (error) throw error;
    return data;
  },
  async signOut() { await App.SB.auth.signOut(); },
  async changePassword(newPassword) {
    const { error } = await App.SB.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },
  onChange(cb) { return App.SB.auth.onAuthStateChange((_e, session) => cb(session)); },
};
