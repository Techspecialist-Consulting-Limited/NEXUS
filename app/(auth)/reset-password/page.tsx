import { ResetPasswordPanel } from "@/components/auth/reset-password-panel";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const params = await searchParams;
  return <ResetPasswordPanel email={params.email ?? ""} token={params.token ?? ""} />;
}
