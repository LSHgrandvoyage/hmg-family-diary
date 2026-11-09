import { LiveApp } from "../../../components/LiveApp";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LiveApp id={id} />;
}
