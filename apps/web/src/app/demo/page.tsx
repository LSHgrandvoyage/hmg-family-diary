import Archive from "../../components/Archive";
import { demoVehicles } from "../../demo/records";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ car?: string }>;
}) {
  const { car } = await searchParams;
  const initial = demoVehicles.some((v) => v.id === car) ? car : "all";
  return <Archive key={initial} initialVehicle={initial} />;
}
