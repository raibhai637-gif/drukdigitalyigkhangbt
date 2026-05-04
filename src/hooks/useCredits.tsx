import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const useCredits = () => {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) {
      setBalance(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("credits").select("balance").eq("user_id", user.id).maybeSingle();
    setBalance(data?.balance ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    if (!user) return;
    const ch = supabase
      .channel(`credits-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credits", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next = (payload.new as { balance?: number } | null)?.balance;
          if (typeof next === "number") setBalance(next);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { balance, loading, refresh };
};
