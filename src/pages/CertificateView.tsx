import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { laravel } from "@/integrations/laravel/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Award, ArrowLeft } from "lucide-react";

export default function CertificateView() {
  const { serial } = useParams<{ serial: string }>();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["cert", serial],
    queryFn: async () => (await laravel.get<{ certificate: any }>(`/university/certificate/${serial}`)).data!,
    enabled: !!serial,
  });

  if (!data) return <div className="p-6">Загрузка…</div>;
  const c = data.certificate;

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-3xl">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Назад
      </Button>
      <Card className="border-2 border-primary/30 print:border-2 print:border-black">
        <CardContent className="p-10 md:p-14 text-center space-y-6">
          <Award className="w-20 h-20 mx-auto text-primary" />
          <p className="uppercase tracking-widest text-sm text-muted-foreground">Сертификат о прохождении</p>
          <h1 className="text-3xl md:text-4xl font-bold">{c.user_name ?? "Сотрудник"}</h1>
          <p className="text-muted-foreground">успешно завершил(а) курс</p>
          <h2 className="text-xl md:text-2xl font-semibold text-primary">{c.course_title}</h2>
          <div className="pt-6 border-t flex justify-between text-sm text-muted-foreground">
            <span>Дата выдачи: {new Date(c.issued_at).toLocaleDateString("ru")}</span>
            <span className="font-mono">№ {c.serial}</span>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end mt-4">
        <Button onClick={() => window.print()} variant="outline">Распечатать</Button>
      </div>
    </div>
  );
}
