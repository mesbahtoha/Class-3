import { Button } from './Button';
import { API_BASE_URL } from '@/lib/api';

/**
 * Persistent notice shown when the connected backend does not implement a
 * route the UI needs (stale deploy / wrong VITE_API_BASE_URL). A toast
 * alone is not enough ,  the admin needs to know *why* and what to do.
 */
export function StaleBackendNotice({ feature, onRetry }: { feature: string; onRetry?: () => void }) {
  return (
    <div className="card" style={{ padding: 20, border: '2px solid var(--color-warning, #e8930c)', marginBottom: 12 }}>
      <div style={{ fontSize: 28 }} aria-hidden="true">🔄</div>
      <div className="font-bold" style={{ margin: '8px 0 4px' }}>
        ব্যাকএন্ড সার্ভারটি পুরনো। “{feature}” পাওয়া যাচ্ছে না
      </div>
      <p className="text-sm text-muted" style={{ marginBottom: 6 }}>
        এই পেজের জন্য নতুন ব্যাকএন্ড দরকার, কিন্তু সংযুক্ত সার্ভারে সেই রুট নেই।
        ব্যাকএন্ড পুনরায় ডিপ্লয় করো, অথবা সঠিক সার্ভার ব্যবহার করো।
      </p>
      <p className="text-xs text-muted" style={{ marginBottom: 12 }}>
        সংযুক্ত সার্ভার: <code>{API_BASE_URL}</code>
      </p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          আবার চেষ্টা করো
        </Button>
      )}
    </div>
  );
}
