import { notFound } from "next/navigation";
import { records } from "../../../demo/records";
import { DiaryDetail } from "../../../components/DiaryDetail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = records.find((r) => r.id === id);
  if (!record) notFound();
  return <DiaryDetail record={record} />;
}
