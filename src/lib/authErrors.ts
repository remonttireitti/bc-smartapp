const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Virheellinen sähköposti tai salasana.',
  'Email not confirmed': 'Sähköpostiosoitetta ei ole vahvistettu.',
  'User already registered': 'Käyttäjä on jo rekisteröity.',
  'Password should be at least 6 characters': 'Salasanan on oltava vähintään 6 merkkiä.',
  'Signups not allowed for this instance': 'Rekisteröityminen ei ole käytössä.',
  'Email rate limit exceeded': 'Liian monta yritystä. Yritä myöhemmin uudelleen.',
  'Request rate limit reached': 'Liian monta yritystä. Yritä myöhemmin uudelleen.',
  'Invalid Refresh Token': 'Istunto on vanhentunut. Kirjaudu uudelleen.',
  'Auth session missing!': 'Istunto puuttuu. Kirjaudu uudelleen.',
  'For security purposes, you can only request this once every 60 seconds':
    'Turvallisuussyistä voit pyytää linkin uudelleen vasta minuutin kuluttua.',
  'Unable to validate email address: invalid format': 'Sähköpostiosoite on virheellinen.',
};

export function translateAuthError(message: string): string {
  const trimmed = message.trim();
  return AUTH_ERROR_MESSAGES[trimmed] ?? trimmed;
}
