import { notFound } from "next/navigation";
import { records } from "../../../demo/records";
import { DiaryDetail } from "../../../components/DiaryDetail";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ listen?: string }>;
}) {
  const { id } = await params;
  const record = records.find((r) => r.id === id);
  if (!record) notFound();
  const { listen } = await searchParams;
  return (
    <DiaryDetail
      key={record.id}
      record={record}
      initialTab={listen === "1" ? "source" : "diary"}
    />
  );
}
