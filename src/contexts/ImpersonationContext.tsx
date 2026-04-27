import { createContext, useContext, useState, ReactNode } from "react";

const IMPERSONATION_USER_ID_KEY = "impersonatedUserId";
const IMPERSONATION_NAME_KEY = "impersonatedName";

interface ImpersonationContextType {
  impersonatedUserId: string | null;
  impersonatedName: string | null;
  startImpersonation: (userId: string, name: string) => void;
  stopImpersonation: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextType>({
  impersonatedUserId: null,
  impersonatedName: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
});

export const useImpersonation = () => useContext(ImpersonationContext);

export const ImpersonationProvider = ({ children }: { children: ReactNode }) => {
  const [impersonatedUserId, setUserId] = useState<string | null>(() => sessionStorage.getItem(IMPERSONATION_USER_ID_KEY));
  const [impersonatedName, setName] = useState<string | null>(() => sessionStorage.getItem(IMPERSONATION_NAME_KEY));

  const startImpersonation = (userId: string, name: string) => {
    sessionStorage.setItem(IMPERSONATION_USER_ID_KEY, userId);
    sessionStorage.setItem(IMPERSONATION_NAME_KEY, name);
    setUserId(userId);
    setName(name);
  };

  const stopImpersonation = () => {
    sessionStorage.removeItem(IMPERSONATION_USER_ID_KEY);
    sessionStorage.removeItem(IMPERSONATION_NAME_KEY);
    setUserId(null);
    setName(null);
  };

  return (
    <ImpersonationContext.Provider value={{ impersonatedUserId, impersonatedName, startImpersonation, stopImpersonation }}>
      {children}
    </ImpersonationContext.Provider>
  );
};
