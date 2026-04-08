import { createContext, useContext, useState, ReactNode } from "react";

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
  const [impersonatedUserId, setUserId] = useState<string | null>(null);
  const [impersonatedName, setName] = useState<string | null>(null);

  const startImpersonation = (userId: string, name: string) => {
    setUserId(userId);
    setName(name);
  };

  const stopImpersonation = () => {
    setUserId(null);
    setName(null);
  };

  return (
    <ImpersonationContext.Provider value={{ impersonatedUserId, impersonatedName, startImpersonation, stopImpersonation }}>
      {children}
    </ImpersonationContext.Provider>
  );
};
