import { Navigate } from 'react-router-dom';

/** Build-time replacement: SaaS-only pages are absent from the on-prem image. */
export default function UnavailablePage() { return <Navigate to="/" replace />; }
