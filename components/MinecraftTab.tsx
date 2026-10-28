import type { Status } from "@/lib/types";
import MinecraftBlock from "./Minecraft";
import ModsList from "./ModsList";

// Both Minecraft servers side by side, with where each one runs and the mods it has installed.

export default function MinecraftTab({ data }: { data: Status }) {
  const servers = data.servers.filter((s) => s.minecraft);
  if (!servers.length) return <div className="card home-card cd-empty">No Minecraft servers configured.</div>;
  return (
    <div className="grid">
      {servers.map((s) => (
        <article key={s.id} className="card mc-card">
          <div className="mc-card-host">
            Runs on <a href={`#${s.id}`}>{s.name}</a> · {s.location}
          </div>
          <MinecraftBlock mc={s.minecraft} />
          {s.minecraft?.mods && <ModsList list={s.minecraft.mods} />}
        </article>
      ))}
    </div>
  );
}
