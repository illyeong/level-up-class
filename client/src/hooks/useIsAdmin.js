import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const envAdminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map(normalizeEmail)
  .filter(Boolean);

export function useIsAdmin(userEmail) {
  const normalizedUserEmail = normalizeEmail(userEmail);
  const isEnvAdmin = envAdminEmails.includes(normalizedUserEmail);
  const [isAdmin, setIsAdmin] = useState(isEnvAdmin);
  const [loading, setLoading] = useState(!!userEmail);

  useEffect(() => {
    let cancelled = false;

    if (!normalizedUserEmail) {
      setIsAdmin(false);
      setLoading(false);
      return undefined;
    }

    if (isEnvAdmin) {
      setIsAdmin(true);
      setLoading(false);
      return undefined;
    }

    setIsAdmin(isEnvAdmin);
    setLoading(true);
    getDoc(doc(db, 'config', 'admins'))
      .then((snap) => {
        if (cancelled) return;
        const emails = (snap.data()?.emails ?? []).map(normalizeEmail);
        setIsAdmin(isEnvAdmin || emails.includes(normalizedUserEmail));
      })
      .catch(() => {
        if (cancelled) return;
        setIsAdmin(isEnvAdmin);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedUserEmail, isEnvAdmin]);

  return { isAdmin, loading };
}
