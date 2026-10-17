import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types';
import type { ManagementScope } from './hallintaNav';

export type ManagementOutletContext = {
  profile: Profile;
  session: Session;
  reloadProfile?: () => void | Promise<void>;
  /** false = laskutusmoduuli pois (globaali admin). */
  billingModuleEnabled: boolean | null;
  /** false = yksinyritystila, kumppanuus- ja moniyritystoiminnot piilotettu. */
  partnershipsEnabled: boolean | null;
  /** company = /hallinta, service = /palvelu. */
  scope?: ManagementScope;
};
