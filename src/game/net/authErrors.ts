import { t } from '../utils/i18n';

// Ubah pesan teknis dari server menjadi kalimat ramah untuk pemain.
export function friendlyAuthError(raw?: string): string {
  const m = (raw || '').toLowerCase();
  if (!m) return t('auth.errors.generic');
  if (m.includes('not configured') || m.includes('unavailable')) return t('auth.errors.unavailable');
  if (m.includes('invalid login credentials')) return t('auth.errors.invalidCredentials');
  if (m.includes('email not confirmed')) return t('auth.errors.confirmEmail');
  if (m.includes('already registered') || m.includes('already been registered')) return t('auth.errors.exists');
  if (m.includes('password should be') || m.includes('weak password')) return t('auth.errors.weakPassword');
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return t('auth.errors.rateLimit');
  if (m.includes('not enabled') || m.includes('unsupported provider')) return t('auth.errors.providerOff');
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return t('auth.errors.network');
  if (m.includes('email') && m.includes('invalid')) return t('auth.errors.invalidEmail');
  return t('auth.errors.generic');
}
