import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import {
  ACTIVITY_STORAGE_KEY,
  IDLE_CHECK_INTERVAL_MS,
  IDLE_LOGOUT_MS,
  type SignOutReason,
} from '../lib/authSessionConfig';
import { supabase } from '../lib/supabase';

type DraftSaver = () => void | Promise<void>;

interface AuthSessionContextValue {
  session: Session | null;
  loading: boolean;
  signOut: (reason?: SignOutReason) => Promise<void>;
  registerDraftSaver: (saver: DraftSaver) => () => void;
  recordActivity: () => void;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;

function touchActivity() {
  try {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

function readLastActivity(): number {
  try {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  } catch {
    return Date.now();
  }
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const draftSaversRef = useRef(new Set<DraftSaver>());
  const signingOutRef = useRef(false);
  const selfSignOutRef = useRef(false);

  const registerDraftSaver = useCallback((saver: DraftSaver) => {
    draftSaversRef.current.add(saver);
    return () => {
      draftSaversRef.current.delete(saver);
    };
  }, []);

  const recordActivity = useCallback(() => {
    touchActivity();
  }, []);

  const flushDrafts = useCallback(async () => {
    const savers = [...draftSaversRef.current];
    await Promise.allSettled(
      savers.map((saver) => Promise.resolve().then(() => saver())),
    );
  }, []);

  const signOut = useCallback(
    async (reason: SignOutReason = 'manual') => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      selfSignOutRef.current = true;

      try {
        await flushDrafts();
        await supabase.auth.signOut({ scope: 'local' });
      } catch (error) {
        console.error('Uloskirjautuminen epäonnistui:', error);
      } finally {
        const query = reason === 'manual' ? '' : `?reason=${reason}`;
        window.location.assign(`/login${query}`);
      }
    },
    [flushDrafts],
  );

  useEffect(() => {
    touchActivity();

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      if (event === 'TOKEN_REFRESHED') {
        if (!nextSession) {
          window.location.assign('/login?reason=expired');
        }
        return;
      }

      setSession(nextSession);
      setLoading(false);

      if (event === 'SIGNED_IN') {
        touchActivity();
        selfSignOutRef.current = false;
        return;
      }

      if (event === 'SIGNED_OUT' && !selfSignOutRef.current && !signingOutRef.current) {
        void flushDrafts().finally(() => {
          window.location.assign('/login?reason=remote');
        });
        return;
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;

    const onActivity = () => recordActivity();
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVITY_STORAGE_KEY) {
        // Another tab was active — idle timer will read fresh timestamp.
      }
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    window.addEventListener('storage', onStorage);

    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - readLastActivity() >= IDLE_LOGOUT_MS) {
        void signOut('idle');
      }
    }, IDLE_CHECK_INTERVAL_MS);

    const onPageHide = () => {
      void flushDrafts();
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', onPageHide);
      window.clearInterval(intervalId);
    };
  }, [session, recordActivity, signOut, flushDrafts]);

  const value: AuthSessionContextValue = {
    session,
    loading,
    signOut,
    registerDraftSaver,
    recordActivity,
  };

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error('useAuthSession must be used within AuthSessionProvider');
  }
  return ctx;
}
