// Бесконечная горизонтальная лента «логотипов клиентов».
// Логотипы — стилизованные wordmark'и (без юр.лиц), пока заменяются на реальные.
const LOGOS = [
  "Северный путь", "ОРБИТА", "Atlas Group", "VERA", "Полюс",
  "СИНЕРГИЯ", "Контур·X", "Меридиан", "Альфа·Лаб", "ГРАНИТ",
  "NORDIC", "Эверест", "Стрела", "ЯКОРЬ", "FACTOR",
];

const LogoMarquee = () => {
  // Дублируем, чтобы зацикливание было бесшовным
  const doubled = [...LOGOS, ...LOGOS];
  return (
    <div className="relative overflow-hidden py-10 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div className="flex w-max gap-12 animate-marquee">
        {doubled.map((name, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-6 py-3 rounded-full border border-border/40 text-muted-foreground font-semibold tracking-wide whitespace-nowrap text-sm"
            style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22 }}
          >
            {name}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LogoMarquee;
