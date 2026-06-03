/** BC Smartapp — globaali ylläpito ja tilausasiat. */
export const GLOBAL_ADMIN_SUPPORT = {
  name: 'Enn Kotselainen',
  organization: 'BC Smartapp / Remonttireitti',
  email: 'info@remonttireitti.fi',
  website: 'https://www.remonttireitti.fi',
  appUrl: 'https://bc-smartapp.vercel.app',
} as const;

export function formatGlobalAdminSupportBlock() {
  const { name, organization, email, website, appUrl } = GLOBAL_ADMIN_SUPPORT;
  return [
    `${name} (${organization})`,
    `Sähköposti: ${email}`,
    `Verkkosivu: ${website}`,
    `Sovellus: ${appUrl}`,
  ].join('\n');
}
