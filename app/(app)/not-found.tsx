import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="font-heading text-xl font-semibold">Registro não encontrado</h1>
      <p className="mt-2 text-sm text-muted">Ele pode ter sido removido ou pertencer a outro espaço de trabalho.</p>
      <Link href="/dashboard" className="btn btn-primary mt-5">Voltar ao início</Link>
    </div>
  );
}
