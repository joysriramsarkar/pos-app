import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import CameraDebugPage from "./DebugClient";

export default async function DebugPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== "ADMIN") {
    redirect("/login");
  }

  return <CameraDebugPage />;
}
