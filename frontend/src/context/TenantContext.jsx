import React, { createContext, useContext, useState, useEffect } from 'react';
import { useApp } from './AppContext';

export const TenantContext = createContext({ tenantId: 'default' });

export const useTenant = () => useContext(TenantContext);

export function TenantProvider({ children }) {
  const { token } = useApp();
  const [tenantId, setTenantId] = useState('default');

  useEffect(() => {
    if (!token) {
      setTenantId('default');
      return;
    }
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(window.atob(base64).split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      const payload = JSON.parse(jsonPayload);
      setTenantId(payload.tenant_id || 'default');
    } catch (e) {
      setTenantId('default');
    }
  }, [token]);

  return (
    <TenantContext.Provider value={{ tenantId }}>
      {children}
    </TenantContext.Provider>
  );
}
