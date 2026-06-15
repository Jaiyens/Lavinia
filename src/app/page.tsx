import { Header } from "@/components/Header";
import { DataConstellation } from "@/components/DataConstellation";
import { Problem } from "@/components/Problem";
import { EyesIntro } from "@/components/EyesIntro";
import { ExplodedCamera } from "@/components/ExplodedCamera";
import { CaseStudy } from "@/components/CaseStudy";
import { Traction } from "@/components/Traction";
import { About } from "@/components/About";
import { Inquire } from "@/components/Inquire";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <DataConstellation />
        <Problem />
        <EyesIntro />
        <ExplodedCamera />
        <CaseStudy />
        <Traction />
        <About />
        <Inquire />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
