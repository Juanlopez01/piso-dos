import Image from "next/image";

export default function Home() {
  return (
    <div className="h-screen flex items-center justify-center gap-12">
      <button className="bg-piso2-lime text-black px-6 py-3 font-bold uppercase rounded-none hover:bg-white transition-colors">
        Botón Lima
      </button>
      <button className="border border-piso2-orange text-piso2-orange px-6 py-3 font-bold uppercase hover:bg-piso2-orange hover:text-white transition-colors">
        Botón Naranja
      </button>
    </div>
  );
}
