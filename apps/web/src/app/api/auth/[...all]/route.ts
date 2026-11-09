import { authentication } from "../../../../server/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (r: Request) => authentication().handler(r);
export const POST = (r: Request) => authentication().handler(r);
