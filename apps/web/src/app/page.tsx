import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Home() {
  redirect(process.env.DATABASE_URL ? "/library" : "/demo");
}
