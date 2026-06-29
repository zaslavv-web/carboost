import { FEATURES } from "@/data/features";

/**
 * Mosaic of 16 module icons for the hero. Tiles "breathe" with staggered float,
 * background pulses softly. Pure CSS — no animation libs.
 */
const ModuleMosaic = () => {
  // 4×4 grid, slight variation in tile sizes for bento feel
  return (
    <div className="relative w-full aspect-square max-w-[520px] mx-auto">
      {/* Glow under the grid */}
      <div
        className="absolute -inset-8 rounded-full blur-3xl opacity-50 animate-pulse-glow"
        style={{
          background:
            "radial-gradient(circle at center, hsl(var(--primary) / 0.45), transparent 60%)",
        }}
      />
      <div className="relative grid grid-cols-4 gap-3 h-full">
        {FEATURES.slice(0, 16).map((f, i) => {
          const Icon = f.icon;
          const accent = i % 5 === 0; // every 5th tile is gold
          return (
            <div
              key={f.slug}
              className={[
                "rounded-2xl border flex items-center justify-center transition-all duration-300 hover:scale-110 hover:rotate-3 hover:z-10",
                "animate-float-soft",
                accent
                  ? "bg-primary border-primary/60 text-primary-foreground shadow-glow"
                  : "bg-card/70 backdrop-blur-md border-border text-foreground",
              ].join(" ")}
              style={{
                animationDelay: `${(i % 6) * 0.4}s`,
                animationDuration: `${5 + (i % 4)}s`,
              }}
            >
              <Icon className="w-1/2 h-1/2" strokeWidth={1.6} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ModuleMosaic;
