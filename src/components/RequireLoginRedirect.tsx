import { Navigate, useLocation } from 'react-router-dom';

/** Ohjaa suojatulle sivulle kirjautumiseen ja palauttaa käyttäjän takaisin kirjautumisen jälkeen. */
export default function RequireLoginRedirect() {
  const location = useLocation();
  const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
  return <Navigate to={`/login?redirect=${redirect}`} replace />;
}
