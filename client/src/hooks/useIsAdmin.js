import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function useIsAdmin(userEmail) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(!!userEmail);

  useEffect(() => {
    let cancelled = false;

    if (!userEmail) {
      setIsAdmin(false);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    getDoc(doc(db, 'config', 'admins'))
      .then((snap) => {
        if (cancelled) return;
        const emails = snap.data()?.emails ?? [];
        setIsAdmin(emails.includes(userEmail));
      })
      .catch(() => {
        if (cancelled) return;
        setIsAdmin(false);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  return { isAdmin, loading };
}
