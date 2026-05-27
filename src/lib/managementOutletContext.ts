import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types';

export type ManagementOutletContext = {
  profile: Profile;
  session: Session;
  reloadProfile?: () => void | Promise<void>;
  /** false = laskutusmoduuli pois (globaali admin). */
  billingModuleEnabled: boolean | null;
};
