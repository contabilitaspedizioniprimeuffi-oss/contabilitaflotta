/** Targa italiana stilizzata */
export default function Plate({
  targa,
  size = "md",
}: {
  targa: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizing =
    size === "lg"
      ? "px-3 py-1.5 text-xl gap-2"
      : size === "sm"
        ? "px-1.5 py-[3px] text-[11px] gap-1"
        : "px-2.5 py-1 text-sm gap-1.5";
  const band = size === "lg" ? "w-[7px] self-stretch" : "w-[5px] self-stretch";

  return (
    <span
      className={`inline-flex select-none items-stretch overflow-hidden rounded-md border border-[#b8bcc4] bg-white font-mono font-bold tracking-[0.08em] text-ink-950 shadow-[0_1px_2px_rgba(20,22,19,0.14)] ${sizing}`}
    >
      <span className={`${band} rounded-[2px] bg-[#1e4fa3]`} />
      <span>{targa}</span>
      <span className={`${band} rounded-[2px] bg-[#1e4fa3]`} />
    </span>
  );
}
