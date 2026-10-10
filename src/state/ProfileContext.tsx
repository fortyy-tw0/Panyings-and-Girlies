import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { deleteProfile, loadProfile, saveProfile } from '../storage/profileStorage';
import type { LocalProfile } from '../types/profile';

type ProfileState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: LocalProfile | null };

type ProfileContextValue = {
  state: ProfileState;
  /** Persists the profile on this device. Throws if the write fails. */
  save: (profile: LocalProfile) => Promise<void>;
  remove: () => Promise<void>;
  reload: () => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadProfile()
      .then((profile) => {
        if (!cancelled) setState({ status: 'ready', profile });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error', message: 'Your saved setup could not be opened on this device.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadCount]);

  const save = useCallback(async (profile: LocalProfile) => {
    await saveProfile(profile);
    setState({ status: 'ready', profile });
  }, []);

  const remove = useCallback(async () => {
    await deleteProfile();
    setState({ status: 'ready', profile: null });
  }, []);

  const reload = useCallback(() => setLoadCount((count) => count + 1), []);

  const value = useMemo(() => ({ state, save, remove, reload }), [state, save, remove, reload]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfile must be used inside ProfileProvider');
  return context;
}
